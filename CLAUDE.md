# DataFlow — Arquitectura Cloud
*Última actualización: 2026-04-16 (sesión 5)*

## ⚠️ Pendiente próxima sesión

**Vista Falabella — tabla BigQuery no existe**
- `/datos/falabella` devuelve 500: `Table sigmc-5fae5:dataflow.falabella was not found`
- La vista Falabella en `App.jsx` sigue activa pero la tabla nunca fue creada
- Opciones: crear la tabla o eliminar la ruta `/falabella` del frontend

**Power BI — Error de permisos BigQuery** *(arrastrado de sesión anterior)*
- Error: `Access Denied: Project valdishopper-validator: User does not have bigquery.jobs.create permission`
- Soluciones a investigar:
  1. Dar rol **BigQuery Job User** al usuario en `valdishopper-validator` en GCP IAM
  2. Verificar caché de credenciales en Power BI

## Resumen

Aplicación web para procesar y visualizar datos de despacho (Beetrak) y picking (PFA).
Los usuarios suben archivos Excel/CSV, el sistema los limpia y almacena en BigQuery.
Las vistas (Finanzas, Mejora Continua) consultan BigQuery con filtros de fecha.

---

## Infraestructura

| Servicio | Qué hace | URL / Ubicación |
|----------|----------|-----------------|
| **Firebase Hosting** | Sirve el frontend (React) | https://sigmc-5fae5.web.app |
| **Cloud Run** | API backend (FastAPI/Python) | https://dataflow-api-519623119758.us-central1.run.app |
| **BigQuery** | Almacena todos los datos | `sigmc-5fae5.dataflow.beetrak` / `sigmc-5fae5.dataflow.pfa` / `sigmc-5fae5.dataflow.pfa_finanzas` / `sigmc-5fae5.dataflow.usuarios` |
| **Firebase Auth** | Login con Google (@valdishopper.com) | Proyecto `sigmc-5fae5` |

**Proyecto GCP**: `sigmc-5fae5` (Firebase + Cloud = mismo proyecto)
**Región**: `us-central1`

---

## Estructura del repositorio

```
union/
├── backend-cloud/          ← Backend para Cloud Run
│   ├── server.py           ← API FastAPI (v5, conecta a BigQuery)
│   ├── requirements.txt    ← Dependencias Python
│   └── Dockerfile          ← Imagen Docker para Cloud Run
│
├── frontend/               ← Frontend React (Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Master.jsx      ← Carga de archivos (beetrak + PFA)
│   │   │   ├── Finanzas.jsx    ← Vista Finanzas (consulta BigQuery → pfa_finanzas)
│   │   │   ├── Mejora.jsx      ← Vista Mejora Continua (beetrak + pfa limpia)
│   │   │   ├── Admin.jsx       ← Gestión de usuarios
│   │   │   ├── Login.jsx       ← Login con Google
│   │   │   ├── AccessDenied.jsx
│   │   │   └── WaitingAccess.jsx
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── Paginator.jsx
│   │   │   └── ProtectedRoute.jsx  ← Usa permisos.js para control de acceso
│   │   ├── contexts/
│   │   │   ├── AuthContext.jsx  ← Auth con Firebase + roles desde API
│   │   │   └── UploadContext.jsx ← Estado global de uploads (persiste al navegar)
│   │   ├── firebase.js          ← Config Firebase
│   │   ├── dataCache.js         ← Cache en memoria (5 min TTL)
│   │   ├── permisos.js          ← Mapa centralizado rol → vistas permitidas
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── firebase.json        ← Config Firebase Hosting
│   ├── .firebaserc           ← Proyecto Firebase default
│   └── package.json
│
├── files/                   ← Versión local (desarrollo)
│   ├── backend-local/
│   │   └── server.py        ← API local (guarda CSVs en disco)
│   ├── schema.sql            ← Schema BigQuery de referencia
│   └── requirements.txt
│
└── CLAUDE.md                ← Este archivo
```

---

## Flujo de datos

### 1. Carga de archivos (Vista Maestra)

```
Usuario sube Excel/CSV
        ↓
Frontend lee el archivo con SheetJS en el navegador
  - Maneja columnas duplicadas (ej: "Usuario móvil" x2) renombrando a .1, .2
        ↓
Envía las filas como JSON en lotes de 5,000 al backend
   POST /procesar-json/{beetrak|pfa}
        ↓
Backend (Cloud Run) limpia los datos:
  - Beetrak: filtra por LOCAL válido y prefijo de Identificador,
             extrae RUT de wmvs (solo guarda números después del prefijo),
             normaliza fechas, extrae coordenadas lat/lon
  - PFA: elimina duplicados, calcula minutos_picking, normaliza campos
        ↓
Inserta en BigQuery con MERGE (sin duplicados, clave única por tabla)
  → sigmc-5fae5.dataflow.beetrak      (clave: orden)
  → sigmc-5fae5.dataflow.pfa          (clave: shipping_group)
  → sigmc-5fae5.dataflow.pfa_finanzas (WRITE_APPEND, con duplicados)
```

### 2. Carga de archivos — continuidad al navegar

El upload corre en `UploadContext` (contexto global), no en la página. Si el usuario navega a otra vista mientras sube, la carga continúa y el progreso se muestra en el Navbar como un pill animado con barra de progreso por cada archivo activo.

### 3. Consulta de datos (Finanzas / Mejora)

```
Usuario abre vista + selecciona rango de fechas + click "Buscar"
        ↓
Frontend hace GET /datos/{tipo}?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&limit=100
        ↓
Backend corre dos queries en BigQuery:
  1. COUNT(*) → total de registros que cumplen el filtro
  2. SELECT * ... LIMIT 100 → primeras 100 filas
  - beetrak: filtra por FECHA_PICKING, acepta param &local=XX
  - pfa: filtra por inicio_picking
  - Sin filtro: devuelve últimos 30 días por defecto
        ↓
Respuesta { total: N, rows: [...100] } comprimida con gzip
        ↓
Frontend muestra "Mostrando 100 de N registros"
  - Exportar Excel: hace GET sin limit, descarga directo sin cargar al navegador
```

---

## BigQuery — Tablas

### beetrak
MERGE con clave `orden`. Filtro de fecha por `FECHA_PICKING`.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| identificador_ruta | STRING | Identificador de la ruta |
| identificador | STRING | Prefijo + patente del móvil (validado contra LOCAL_PREFIJOS) |
| orden | STRING | **Clave única** — JOIN con pfa.shipping_group |
| local | STRING | Código de local/sucursal |
| tipo_despacho | STRING | LAT, Home delivery, CATEX-FLEX |
| fecha_estimada | TIMESTAMP | Fecha/hora estimada de entrega |
| fecha_llegada | TIMESTAMP | Fecha/hora real de llegada |
| estado | STRING | Entregado, Pendiente, No entregado, En ruta |
| subestado | STRING | Detalle del estado |
| nombre_movil | STRING | Nombre del repartidor (col BC del Excel) |
| telefono_usuario | STRING | Teléfono del repartidor |
| direccion_cliente | STRING | Dirección de entrega |
| fecha_creacion | TIMESTAMP | Fecha de creación de la orden |
| fecha_primer_intento | TIMESTAMP | Fecha del primer intento de entrega |
| intentos | INT64 | Número total de intentos |
| rut_movil | STRING | Solo filas con prefijo wmvs — guarda lo que viene después (col BM del Excel) |
| tiempo_min_entrega | STRING | Tiempo mínimo de entrega |
| tiempo_max_entrega | STRING | Tiempo máximo de entrega |
| fecha_ruta | TIMESTAMP | Fecha de la ruta asignada |
| inicio_ruta | TIMESTAMP | Inicio de la ruta |
| fin_ruta | TIMESTAMP | Fin de la ruta |
| numero_intento | STRING | Número de intento actual |
| latitud | FLOAT64 | Latitud GPS (extraída de Coordenadas) |
| longitud | FLOAT64 | Longitud GPS (extraída de Coordenadas) |
| fecha_picking | TIMESTAMP | Fecha de picking — **columna de filtro** |
| _cargado_en | TIMESTAMP | Timestamp de inserción UTC |

#### Lógica LOCAL_PREFIJOS (validación de Identificador)
Cada local tiene prefijos permitidos. Si el prefijo del Identificador no está en la lista del local, la fila se descarta.

| Local | Prefijos válidos |
|-------|-----------------|
| 41 | LTVS, DRVS, LTTH, DRTH |
| 42, 54, 71, 75, 76, 143, 144, 146, 182, 276, 611, 627, 647, 655, 658, 693, 697, 929, 952 | LTVS, DRVS |
| 45, 58, 95 | HDVS |
| 88 | LTVS, DRVS, LTBM, DRBM |
| 94, 98, 99, 120, 608, 618, 657 | LTVS, DRVS, HDVS |
| 121 | LTVS, DRVS, HDVS, LTZB, DRZB |
| 518 | LTVS, DRVS, LTGP, DRGP |

### pfa_finanzas
WRITE_APPEND (con duplicados). Todas las columnas del archivo Picking original. Filtrada por `inicio_picking`.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| empresa | STRING | Nombre empresa |
| rut_empresa | STRING | RUT empresa |
| shipping_group | STRING | Clave JOIN con beetrak.orden |
| nro_local | STRING | Número de local |
| fecha_control | TIMESTAMP | Fecha de control |
| tipo_servicio | STRING | LAT, PU, HD |
| rol_persona | STRING | Shopper, Picker |
| rut_persona | STRING | RUT del operador |
| fecha_compromiso | TIMESTAMP | Fecha comprometida |
| ventana | STRING | Ventana horaria |
| inicio_picking | TIMESTAMP | Inicio picking (columna de filtro) |
| fin_picking | TIMESTAMP | Fin picking |
| unidades_solicitadas | INT64 | Pedidas |
| unidades_pickeadas | INT64 | Recolectadas |
| unidades_sustituidas | INT64 | Sustituidas |
| items_solicitados | INT64 | Ítems pedidos |
| items_a_pagar | INT64 | Ítems cobrados |
| doble_pedido | BOOL | Flag doble pedido |
| _cargado_en | TIMESTAMP | Timestamp de inserción |

### pfa (limpia)
MERGE con clave `shipping_group`. Deduplicada. Filtrada por `inicio_picking`.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| shipping_group | STRING | **Clave única** — JOIN con beetrak.orden |
| nro_local | STRING | Número de local |
| fecha_control | TIMESTAMP | Fecha de control |
| tipo_servicio | STRING | LAT, PU, HD |
| rol_persona | STRING | Shopper, Picker |
| rut_persona | STRING | RUT del operador |
| fecha_compromiso | TIMESTAMP | Fecha comprometida |
| ventana | STRING | Ventana horaria |
| inicio_picking | TIMESTAMP | Inicio picking |
| fin_picking | TIMESTAMP | Fin picking |
| minutos_picking | FLOAT64 | Duración calculada |
| unidades_solicitadas | INT64 | Pedidas |
| unidades_pickeadas | INT64 | Recolectadas |
| unidades_sustituidas | INT64 | Sustituidas |
| items_solicitados | INT64 | Ítems pedidos |
| items_a_pagar | INT64 | Ítems cobrados |
| doble_pedido | BOOL | Flag doble pedido |
| _cargado_en | TIMESTAMP | Timestamp de inserción |

### usuarios
Creada automáticamente al primer deploy. Persiste entre reinicios de Cloud Run.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| correo | STRING | Email del usuario |
| rol | STRING | admin, master, finanzas, mejora |

---

## Endpoints del API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Health check |
| POST | `/procesar-json/{tipo}` | Recibe JSON con filas, limpia e inserta en BigQuery |
| POST | `/procesar/{tipo}` | Recibe archivo binario (fallback, límite 32MB) |
| GET | `/datos/{tipo}?desde=&hasta=&limit=&local=` | Consulta BigQuery — devuelve `{ total, rows }`. `limit` opcional (100 para display, sin limit para export). `local` solo aplica a beetrak |
| GET | `/locales/beetrak` | Lista de locales únicos en beetrak para el filtro del frontend |
| GET | `/estado-geosort` | Devuelve `{ ya_cargado: bool }` — si ya se cargaron datos Geosort hoy |
| POST | `/cargar-geosort` | Lee `_procesado.csv` del bucket `reportes-geosort` (últimas 48 h) e inserta en BigQuery `geosort` |
| POST | `/join` | JOIN beetrak ↔ pfa en BigQuery |
| GET | `/historial` | Resumen de cargas |
| GET | `/debug-pfa` | Diagnóstico: muestra sample de inicio_picking en PFA |
| GET | `/usuarios` | Lista usuarios y roles |
| POST | `/usuarios` | Crear/actualizar usuario (MERGE en BigQuery) |
| DELETE | `/usuarios/{correo}` | Eliminar usuario |

---

## Comandos de deploy

### Backend (Cloud Run)
```bash
cd "C:\Users\agust\OneDrive\Escritorio\union\backend-cloud"
gcloud run deploy dataflow-api \
  --source=. \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-env-vars=BQ_PROJECT=sigmc-5fae5 \
  --set-env-vars=BQ_DATASET=dataflow \
  --memory=2Gi \
  --timeout=300 \
  --max-instances=3
```

### Frontend (Firebase Hosting)
```bash
cd "C:\Users\agust\OneDrive\Escritorio\union\frontend"
npm run build
npx firebase-tools deploy --only hosting
```

### Operaciones BigQuery útiles
```sql
-- Borrar y recrear tabla beetrak (necesario al cambiar schema)
DROP TABLE `sigmc-5fae5.dataflow.beetrak`;

-- Ver últimas cargas
SELECT MAX(_cargado_en) FROM `sigmc-5fae5.dataflow.beetrak`;

-- Ver usuarios registrados
SELECT * FROM `sigmc-5fae5.dataflow.usuarios`;
```

---

## Configuración importante

- **CORS**: El backend acepta `allow_origins=["*"]`
- **Compresión**: Las respuestas de `/datos/` se comprimen con gzip para evitar el límite de 32MB de Cloud Run
- **Lotes**: El frontend envía archivos en chunks de 5,000 filas para evitar el límite de 32MB de request
- **Filtro por defecto**: Sin rango de fechas, BigQuery devuelve los últimos 30 días
- **Columnas duplicadas Excel**: SheetJS renombra duplicados con `.1`, `.2` (ej: "Usuario móvil" → "Usuario móvil.1") igual que pandas, para que el backend los procese correctamente. Las fechas se convierten a ISO string antes de enviar al backend
- **rut_movil**: Solo se guarda si empieza con `wmvs` — se extrae todo lo que viene después (ej: `wmvs213600044` → `213600044`). Los demás quedan vacíos
- **Identificador**: Se descarta la fila si el prefijo no está en la lista de prefijos válidos del local correspondiente (ver LOCAL_PREFIJOS)
- **Usuarios**: Persistidos en BigQuery tabla `usuarios` — sobreviven reinicios y múltiples instancias de Cloud Run
- **Permisos**: Mapa centralizado en `frontend/src/permisos.js` — editar solo ese archivo para cambiar accesos por rol
- **Upload global**: `UploadContext.jsx` maneja toda la lógica de carga — al navegar entre páginas el upload no se interrumpe. El Navbar muestra un pill con barra de progreso por cada archivo activo
- **Vista Mejora — paginación**: El backend devuelve siempre `{ total, rows }`. Display limitado a 100 filas. Exportar Excel hace un fetch sin limit directamente a descarga sin pasar por el estado de React
- **empresa / rut_empresa**: No están en `pfa_limpia` (solo en `pfa_finanzas`). Fueron excluidas al deduplicar por `shipping_group`

---

## Costos estimados (capa gratuita)

| Servicio | Free tier | Uso estimado |
|----------|-----------|--------------|
| BigQuery almacenamiento | 10 GB/mes | ~3 GB |
| BigQuery consultas | 1 TB/mes | < 1 GB |
| Cloud Run | 240,000 req/mes, 2M CPU-s | Muy bajo |
| Firebase Hosting | 10 GB/mes bandwidth | < 1 GB |
| Firebase Auth | 10,000 auth/mes | < 50 |

**Costo mensual estimado: $0 USD**

---

## Historial de cambios

### 2026-04-16 — Sesión 5

#### Integración Geosort Falabella → BigQuery

**Arquitectura del flujo**
- El Cloud Run Job `geosort-scraper` (ya existía, corre domingos 01:00 UTC) descarga reportes de Geosort Falabella y los procesa
- Ahora guarda solo el `_procesado.csv` en el bucket `reportes-geosort` (antes también subía el archivo crudo)
- Los lunes, el admin puede presionar "Cargar datos" en la Vista Maestra para leer esos CSVs e insertarlos en BigQuery

**Scraper (`SCRAPER-FALABELLA/scraper.py` + `deploy.sh`)**
- Eliminado `guardar_reporte(archivo_crudo)` de los rangos A y B — solo se sube `_procesado.csv` al bucket
- Agregado `USAR_GCS=true` en `deploy.sh` (faltaba — sin esto el scraper guardaba en `/tmp` y los archivos se perdían al terminar el job)
- Para redesplegar el scraper:
  ```bash
  cd "C:\Users\agust\OneDrive\Escritorio\SCRAPER-FALABELLA"
  gcloud builds submit --tag gcr.io/sigmc-5fae5/geosort-scraper --project=sigmc-5fae5 .
  gcloud run jobs update geosort-scraper --image=gcr.io/sigmc-5fae5/geosort-scraper --region=us-central1 --set-env-vars="GCP_PROJECT=sigmc-5fae5,BUCKET_SESION=geosort-sesion-sigmc,BUCKET_REPORTES=reportes-geosort,USAR_GCS=true" --set-secrets="GEOSORT_EMAIL=geosort-email:latest,GEOSORT_PASSWORD=geosort-password:latest" --project=sigmc-5fae5
  ```

**Backend (`server.py`)**
- Agregado `from datetime import timedelta`
- Nueva constante `BQ_TABLE_GEOSORT = sigmc-5fae5.dataflow.geosort`
- Nueva constante `BUCKET_REPORTES` (env var, default `reportes-geosort`)
- `GEOSORT_COL_TYPES` — schema BigQuery de la tabla geosort
- `GEOSORT_COL_MAP` — mapeo de columnas del CSV procesado a nombres BigQuery
- `merge_geosort(df)` — MERGE con clave `id_ruta`
- `GET /estado-geosort` — devuelve `{ ya_cargado: bool }` consultando tabla `cargas` del día actual
- `POST /cargar-geosort` — lista blobs `_procesado.csv` en `reportes-geosort` subidos en las últimas 48 h, los lee y hace MERGE en BigQuery
- Fix: columna `id_ruta` venía como `int64` desde pandas → pyarrow fallaba al intentar convertir a STRING → forzar `.astype(str)` en todas las columnas STRING de `GEOSORT_COL_TYPES` antes del insert

**`requirements.txt`**
- Agregado `google-cloud-storage==2.16.*`

**BigQuery — nueva tabla `geosort`**
- Clave MERGE: `id_ruta`
- Columnas: `ct`, `semana`, `anio`, `fecha_inicio_ruta`, `patente`, `id_ruta`, `pendientes`, `terminados`, `hr_inicio`, `primera_entrega`, `ultima_entrega`, `tiempo_total`, `tiempo_promedio`, `total`, `fill_rate`, `_cargado_en`

**Frontend (`Master.jsx`)**
- Zona de carga Falabella (FileZone con drag & drop) reemplazada por `GeosortPanel`
- `GeosortPanel`: solo visible para rol `admin`, botón "Cargar datos" activo solo los lunes (temporalmente `esLunes = true` para pruebas — **restaurar a `new Date().getDay() === 1`**)
- Al cargar: llama `POST /cargar-geosort`, muestra filas y archivos cargados, se bloquea hasta el próximo lunes
- Estado inicial obtenido desde `GET /estado-geosort` al montar el componente

**`UploadContext.jsx`**
- Eliminado `falabella` del estado de uploads y de `resetTodo`

---

### 2026-03-31 — Sesión 3

#### Frontend

**Vista Finanzas (`Finanzas.jsx`) — reescritura completa**
- Corregido bug crítico: la API devuelve `{ total, rows }` pero el código guardaba el objeto completo como array → `paginar()` llamaba `.slice()` sobre un objeto → página en blanco
- Ahora carga solo 100 filas para display (`limit=100`) igual que Mejora Continua
- Muestra "Mostrando X de Y registros" con hint de Exportar Excel si hay más
- Exportar Excel hace fetch sin limit, descarga directo sin pasar por estado de React
- Columnas fijas definidas en `COLS` (excluye `_cargado_en`)
- Caché en memoria via `dataCache.js` (5 min TTL) — si navegas a otra página y vuelves, no recarga

**Vista Mejora Continua (`Mejora.jsx`) — caché entre navegación**
- Agregado caché via `dataCache.js` en `fetchData`: comprueba caché antes de hacer fetch, guarda resultado al obtenerlo
- Estado `datasets` inicializado con lazy initializer desde caché — evita flash vacío al volver de otra página
- Botón Buscar invalida caché y fuerza recarga fresca
- Resultado: navegar a Master y volver a Mejora no recarga los datos

#### Backend (`server.py`)

**Fix DATETIME → TIMESTAMP en carga PFA**
- Las fechas se convertían con `pd.to_datetime()` sin timezone → BigQuery infería `DATETIME` en la tabla temporal
- El MERGE fallaba porque la tabla `pfa` tiene columnas `TIMESTAMP`
- Fix: usar `pd.to_datetime(col, errors="coerce", utc=True)` que produce `datetime64[ns, UTC]` → BigQuery infiere `TIMESTAMP` correctamente
- Afecta ambos endpoints: `/procesar-json/pfa` y `/procesar/pfa`

**`merge_pfa_limpia` — creación automática de tabla**
- Si la tabla `pfa` no existe (ej: después de un DROP), el MERGE fallaba con 404
- Ahora verifica existencia con `bq_client.get_table()` antes del MERGE
- Si no existe: crea la tabla directamente con `load_table_from_dataframe` (igual que `merge_beetrak`)
- Si existe: flujo normal de MERGE con tabla temporal

#### Deploy

**Fix variable de entorno en PowerShell**
- El comando `--set-env-vars=BQ_PROJECT=sigmc-5fae5,BQ_DATASET=dataflow` falla en PowerShell: la coma se interpreta como separador de argumentos y `BQ_PROJECT` recibe el valor `sigmc-5fae5 BQ_DATASET=dataflow`
- Error resultante: `ProjectId must be non-empty` al iniciar el servidor → contenedor no arranca
- Fix: usar flags separados: `--set-env-vars BQ_PROJECT=sigmc-5fae5 --set-env-vars BQ_DATASET=dataflow`
