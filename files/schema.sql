-- ============================================================
--  BigQuery Schema · Beetrak & PFA  (columnas reales)
--  Reemplaza: TU_PROYECTO y TU_DATASET
-- ============================================================

CREATE SCHEMA IF NOT EXISTS `TU_PROYECTO.TU_DATASET`
OPTIONS (location = 'us-central1', description = 'Datos limpios Beetrak y PFA');


-- ── TABLA BEETRAK ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `TU_PROYECTO.TU_DATASET.beetrak` (
  orden              STRING    OPTIONS(description='Número de orden — clave JOIN con pfa.shipping_group'),
  local              STRING    OPTIONS(description='Código de local/sucursal'),
  tipo_despacho      STRING    OPTIONS(description='LAT · Home delivery · CATEX-FLEX'),
  fecha_estimada     TIMESTAMP OPTIONS(description='Fecha/hora estimada de entrega'),
  fecha_llegada      TIMESTAMP OPTIONS(description='Fecha/hora real de llegada'),
  estado             STRING    OPTIONS(description='Entregado · Pendiente · No entregado · En ruta · Recogido'),
  subestado          STRING    OPTIONS(description='Detalle del estado de entrega'),
  usuario_movil      STRING    OPTIONS(description='Nombre del repartidor'),
  direccion_cliente  STRING    OPTIONS(description='Dirección de entrega'),
  fecha_ruta         TIMESTAMP OPTIONS(description='Fecha de la ruta asignada'),
  intentos           INT64     OPTIONS(description='Número de intentos de entrega'),
  latitud            FLOAT64   OPTIONS(description='Latitud GPS de entrega'),
  longitud           FLOAT64   OPTIONS(description='Longitud GPS de entrega'),
  _cargado_en        TIMESTAMP OPTIONS(description='Timestamp de inserción UTC')
)
PARTITION BY DATE(fecha_ruta)
CLUSTER BY orden, estado, tipo_despacho
OPTIONS (description = 'Registros de despacho Beetrak, particionados por fecha_ruta');


-- ── TABLA PFA ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `TU_PROYECTO.TU_DATASET.pfa` (
  shipping_group      STRING    OPTIONS(description='Número de orden — clave JOIN con beetrak.orden'),
  nro_local           STRING    OPTIONS(description='Número de local'),
  fecha_control       TIMESTAMP OPTIONS(description='Fecha de control del proceso'),
  tipo_servicio       STRING    OPTIONS(description='LAT · PU · HD'),
  rol_persona         STRING    OPTIONS(description='Shopper · Picker'),
  rut_persona         STRING    OPTIONS(description='RUT del operador'),
  fecha_compromiso    TIMESTAMP OPTIONS(description='Fecha comprometida al cliente'),
  ventana             STRING    OPTIONS(description='Ventana horaria de entrega, ej: 19:00 - 21:00'),
  inicio_picking      TIMESTAMP OPTIONS(description='Inicio del proceso de picking'),
  fin_picking         TIMESTAMP OPTIONS(description='Fin del proceso de picking'),
  minutos_picking     FLOAT64   OPTIONS(description='Duración del picking en minutos (calculado)'),
  unidades_solicitadas INT64    OPTIONS(description='Unidades pedidas por el cliente'),
  unidades_pickeadas  INT64     OPTIONS(description='Unidades efectivamente recolectadas'),
  unidades_sustituidas INT64    OPTIONS(description='Unidades sustituidas por alternativas'),
  items_solicitados   INT64     OPTIONS(description='Ítems distintos solicitados'),
  items_a_pagar       INT64     OPTIONS(description='Ítems que se cobran al cliente'),
  doble_pedido        BOOL      OPTIONS(description='True si fue identificado como doble pedido'),
  _cargado_en         TIMESTAMP OPTIONS(description='Timestamp de inserción UTC')
)
PARTITION BY DATE(fecha_control)
CLUSTER BY shipping_group, tipo_servicio, rol_persona
OPTIONS (description = 'Registros de proceso PFA, particionados por fecha_control');


-- ============================================================
--  QUERIES DE EJEMPLO
-- ============================================================

-- 1. Resumen de carga por tabla
SELECT 'beetrak' AS tabla, COUNT(*) AS filas, MAX(_cargado_en) AS ultima_carga
FROM `TU_PROYECTO.TU_DATASET.beetrak`
UNION ALL
SELECT 'pfa', COUNT(*), MAX(_cargado_en)
FROM `TU_PROYECTO.TU_DATASET.pfa`;


-- 2. JOIN principal: despacho completo por orden
SELECT
  b.orden,
  b.fecha_ruta,
  b.local,
  b.tipo_despacho,
  b.estado,
  b.subestado,
  b.usuario_movil,
  b.intentos,
  p.tipo_servicio,
  p.rol_persona,
  p.ventana,
  p.unidades_solicitadas,
  p.unidades_pickeadas,
  p.unidades_sustituidas,
  p.minutos_picking,
  p.doble_pedido
FROM `TU_PROYECTO.TU_DATASET.beetrak` b
INNER JOIN `TU_PROYECTO.TU_DATASET.pfa` p
  ON b.orden = p.shipping_group
WHERE b.fecha_ruta >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
ORDER BY b.fecha_ruta DESC
LIMIT 1000;


-- 3. Buscar una orden específica en ambas tablas
DECLARE orden_buscar STRING DEFAULT '400001346962';

SELECT 'beetrak' AS origen, orden AS id, CAST(fecha_ruta AS STRING) AS fecha,
       estado, usuario_movil AS detalle
FROM `TU_PROYECTO.TU_DATASET.beetrak`
WHERE orden = orden_buscar

UNION ALL

SELECT 'pfa', shipping_group, CAST(fecha_control AS STRING),
       tipo_servicio, CONCAT(rol_persona, ' — ', ventana)
FROM `TU_PROYECTO.TU_DATASET.pfa`
WHERE shipping_group = orden_buscar;


-- 4. Eficiencia de picking por local (últimos 7 días)
SELECT
  p.nro_local,
  p.rol_persona,
  COUNT(DISTINCT p.shipping_group)                          AS ordenes,
  ROUND(AVG(p.minutos_picking), 1)                         AS min_picking_promedio,
  ROUND(SUM(p.unidades_pickeadas) / NULLIF(SUM(p.unidades_solicitadas), 0) * 100, 1) AS pct_completitud,
  COUNTIF(p.doble_pedido)                                  AS dobles_pedidos
FROM `TU_PROYECTO.TU_DATASET.pfa` p
WHERE p.fecha_control >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY 1, 2
ORDER BY ordenes DESC;


-- 5. Órdenes con múltiples intentos que llegaron igual
SELECT
  b.orden,
  b.local,
  b.intentos,
  b.estado,
  b.usuario_movil,
  p.unidades_pickeadas,
  p.minutos_picking
FROM `TU_PROYECTO.TU_DATASET.beetrak` b
JOIN `TU_PROYECTO.TU_DATASET.pfa` p ON b.orden = p.shipping_group
WHERE b.intentos >= 2
  AND b.estado = 'Entregado'
ORDER BY b.intentos DESC, b.fecha_ruta DESC
LIMIT 500;


-- 6. Órdenes en Beetrak sin match en PFA (para auditoría)
SELECT b.orden, b.fecha_ruta, b.estado, b.local
FROM `TU_PROYECTO.TU_DATASET.beetrak` b
LEFT JOIN `TU_PROYECTO.TU_DATASET.pfa` p ON b.orden = p.shipping_group
WHERE p.shipping_group IS NULL
ORDER BY b.fecha_ruta DESC;