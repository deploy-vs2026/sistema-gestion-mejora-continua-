# DataFlow — Arquitectura Cloud
*Última actualización: 2026-05-11 (sesión 8)*

## ⚠️ Pendiente próxima sesión

**Power BI — Error de permisos BigQuery** *(arrastrado de sesión anterior)*
- Error: `Access Denied: Project valdishopper-validator: User does not have bigquery.jobs.create permission`
- Soluciones a investigar:
  1. Dar rol **BigQuery Job User** al usuario en `valdishopper-validator` en GCP IAM
  2. Verificar caché de credenciales en Power BI

**⛔ NUNCA deploy al proyecto `ccohub`**
- El proyecto correcto es SIEMPRE `sigmc-5fae5`
- El gcloud default del equipo puede estar configurado como `ccohub` (proyecto distinto)
- SIEMPRE agregar `--project sigmc-5fae5` al comando de deploy del backend
- Si falta el flag, gcloud usa el proyecto default del sistema y el deploy va al lugar equivocado

**Cloud Scheduler — cambio horario de verano**
- En octubre Chile cambia a UTC-3 (horario de verano)
- Actualizar el scheduler de `0 11 * * *` a `0 10 * * *`:
  ```bash
  gcloud scheduler jobs update http beetrak-sync-diario --location=us-central1 --schedule="0 10 * * *" --project=sigmc-5fae5
  ```

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
│   │   │   ├── Master.jsx           ← Carga de archivos (beetrak + PFA)
│   │   │   ├── Finanzas.jsx         ← Vista Finanzas (consulta BigQuery → pfa_finanzas)
│   │   │   ├── Mejora.jsx           ← Vista Mejora Continua (beetrak + pfa limpia)
│   │   │   ├── Falabella.jsx        ← Vista Geosort (KPI + tabla, solo admin)
│   │   │   ├── FalabellaHistorico.jsx ← Carga histórica Falabella (solo admin)
│   │   │   ├── Instaleep.jsx        ← Vista Instaleep (tabla pedidos, solo admin)
│   │   │   ├── Admin.jsx            ← Gestión de usuarios
│   │   │   ├── Login.jsx            ← Login con Google
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
| GET | `/estado-instaleep` | Devuelve `{ ya_cargado: bool }` — si ya se cargaron datos Instaleep hoy |
| GET | `/datos/instaleep?desde=&hasta=&limit=` | Consulta BigQuery instaleep — filtra por `fecha` |
| GET | `/historial/instaleep` | Cargas tipo instaleep (últimas 200) |
| POST | `/cargar-geosort` | Lee `_procesado.csv` del bucket `reportes-geosort` (últimas 48 h) e inserta en BigQuery `geosort` |
| POST | `/join` | JOIN beetrak ↔ pfa en BigQuery |
| GET | `/historial` | Resumen de cargas (todas, últimas 200) |
| GET | `/historial/falabella` | Cargas tipo falabella (últimas 500) |
| GET | `/debug-pfa` | Diagnóstico: muestra sample de inicio_picking en PFA |
| GET | `/usuarios` | Lista usuarios y roles |
| POST | `/usuarios` | Crear/actualizar usuario (MERGE en BigQuery) |
| DELETE | `/usuarios/{correo}` | Eliminar usuario |

---

## Comandos de deploy

### Backend (Cloud Run)
```bash
cd "C:\Users\agust\OneDrive\Escritorio\union\backend-cloud"
gcloud run deploy dataflow-api --source=. --region=us-central1 --allow-unauthenticated --set-env-vars BQ_PROJECT=sigmc-5fae5 --set-env-vars BQ_DATASET=dataflow --memory=2Gi --timeout=300 --max-instances=3 --project=sigmc-5fae5
```
> ⚠️ El `--project=sigmc-5fae5` es obligatorio — sin él gcloud usa el proyecto default del sistema (`ccohub`) y el deploy va al lugar equivocado.

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
- **Falabella Histórico**: La tabla `falabella` en BigQuery se crea automáticamente en la primera carga — no hay que crearla a mano. El MERGE usa clave compuesta `IDruta + Posicionruta`
- **Falabella — nulls**: El procesamiento reemplaza `"N/A"`, `"#N/A"`, `"null"`, `"-"` y variantes con `None` antes de insertar. Sin esto PyArrow falla al inferir tipos en columnas que parecen numéricas

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

### 2026-05-11 — Sesión 8

#### Vista Instaleep — carga automática diaria desde Google Drive

**Nuevo módulo — solo admin**
- Ruta: `/instaleep`
- Permiso: `instaleep` en `permisos.js` (solo rol `admin`)
- Link en Navbar: "Instaleep" en color `#6366F1`

**Frontend (`Instaleep.jsx`)**
- Tabla estilo Excel con las primeras 100 filas (igual que Finanzas y Mejora)
- Filtro por rango de fechas (filtra por columna `fecha`)
- Exportar Excel descarga todas las filas sin pasar por el límite de display
- Badge que indica si ya se cargaron datos hoy (`GET /estado-instaleep`)
- Historial de cargas automáticas al pie de la página (`GET /historial/instaleep`)

**Backend (`server.py`)**
- Nueva constante `BQ_TABLE_INSTALEEP = sigmc-5fae5.dataflow.instaleep`
- `INSTALEEP_COL_TYPES` — schema BigQuery de la tabla (27 columnas + `_cargado_en`)
- `_preparar_instaleep_bq(df)` — limpia tipos: timestamps con UTC, fecha como DATE (formato DD-MM-YYYY), columnas numéricas como float64, strings nulos reemplazados con None
- `merge_instaleep(df)` — MERGE con clave `job_id`. Crea tabla automáticamente si no existe
- `instaleep` agregado al endpoint `GET /datos/{tipo}` (columna de filtro: `fecha`)
- `GET /estado-instaleep` — indica si ya se cargó hoy
- `GET /historial/instaleep` — últimas 200 cargas en hora Chile
- Fix tipos: `SKU_AVANCE` es `FLOAT64` (no INT64) porque puede tener decimales. Las demás columnas numéricas usan `float64` en lugar de `Int64` para evitar error de PyArrow en archivos con valores mixtos

**Job (`backend-cloud/jobs/instaleep_drive_sync.py`)**
- Detecta el archivo del día anterior por fecha en el nombre: `pedidos_clean_ALL_YYYY-MM-DD_to_*`
- Soporta variable `TARGET_DATE` (formato `YYYY-MM-DD`) para cargar fechas específicas manualmente
- Usa `supportsAllDrives=True` e `includeItemsFromAllDrives=True` para acceder a carpetas compartidas
- Imagen Docker: `gcr.io/sigmc-5fae5/instaleep-drive-sync` (build con `cloudbuild-instaleep.yaml`)

**Infraestructura creada**
- Cloud Run Job: `instaleep-drive-sync` (región `us-central1`, 1Gi RAM, task-timeout 300s)
- Cloud Scheduler: `instaleep-sync-diario` — `0 10 * * *` UTC = 06:00 hora Chile invierno (UTC-4)
- Drive folder compartida con SA: `519623119758-compute@developer.gserviceaccount.com` (Lector)
- Folder ID: `160HswDHSzQZxLo3QCeetiv4UW7_-CTMf` (carpeta `Instaleap_SBA_diario`)

**Comandos para redesplegar el job**
```bash
cd "C:\Users\agust\OneDrive\Escritorio\union\backend-cloud"
gcloud builds submit --config=cloudbuild-instaleep.yaml --project=sigmc-5fae5 .
gcloud run jobs update instaleep-drive-sync --image=gcr.io/sigmc-5fae5/instaleep-drive-sync --region=us-central1 --project=sigmc-5fae5
```

**Cargar fecha específica manualmente**
```bash
gcloud run jobs update instaleep-drive-sync --update-env-vars TARGET_DATE=2026-05-08 --region=us-central1 --project=sigmc-5fae5
gcloud run jobs execute instaleep-drive-sync --region=us-central1 --project=sigmc-5fae5 --wait
# Al terminar, limpiar TARGET_DATE:
gcloud run jobs update instaleep-drive-sync --remove-env-vars TARGET_DATE --region=us-central1 --project=sigmc-5fae5
```

**BigQuery — tabla `instaleep`**
- Clave MERGE: `job_id`
- Columnas de filtro: `fecha` (DATE, formato original DD-MM-YYYY convertido a DATE)
- Archivo fuente: `pedidos_clean_ALL_YYYY-MM-DD_to_YYYY-MM-DD_YYYYMMDD_HHMMSS.xlsx`
- Se crea automáticamente en la primera carga

---

### 2026-05-05 — Sesión 7

#### Vista Falabella Histórico — carga masiva de datos históricos

**Nuevo módulo — solo admin**
- Ruta: `/falabella-historico`
- Permiso: `falabella-historico` en `permisos.js` (solo rol `admin`)
- Link en Navbar: "F. Histórico" en color `#e11d48`, visible solo para admin

**Frontend (`FalabellaHistorico.jsx`)**
- Drag & drop multi-archivo: acepta `.xlsx`, `.xls` y `.csv`
- CSV: auto-detecta separador `,` o `;` revisando el primer renglón del archivo
- Parseo con SheetJS en el navegador — fechas convertidas a ISO string antes de enviar
- Validación de columnas requeridas (`Idruta`, `Posicionruta`) — muestra badge "Sin columnas" si faltan
- Validación fila a fila — detecta claves vacías, muestra panel de advertencias colapsable por archivo
- Vista previa de las primeras 100 filas con scroll horizontal antes de confirmar
- Modal de confirmación mostrando totales y advertencias antes de subir
- Carga en lotes de 5.000 filas con barra de progreso por archivo
- Resumen de resultado al terminar (archivos ok / fallidos con mensaje de error)
- Historial de cargas falabella al pie (desde `/historial/falabella`)
- Guard de rol en el render — si no es admin muestra mensaje de acceso restringido

**Backend (`server.py`)**
- Nuevo endpoint `GET /historial/falabella` — filtra `cargas` por `tipo = 'falabella'`, devuelve hasta 500 entradas en hora Chile
- Fix en ambos endpoints falabella (`/procesar-json/falabella` y `/procesar/falabella`):
  - Antes: `df_bq.replace("", None)` solo reemplazaba strings vacíos
  - Después: reemplaza `["", "N/A", "NA", "#N/A", "#NA", "null", "NULL", "None", "n/a", "-"]` con `None`
  - Además: todas las columnas `object` se castean a `str` limpio antes del insert, evitando que PyArrow falle al inferir tipos mixtos
- Error que motivó el fix: `pyarrow.lib.ArrowInvalid: Could not convert 'N/A' with type str: tried to convert to int64`

**BigQuery — tabla `falabella`**
- Se crea automáticamente en la primera carga (no requiere acción manual)
- MERGE con clave compuesta `IDruta + Posicionruta` (solo inserta, no actualiza — `WHEN NOT MATCHED`)
- Schema inferido del DataFrame en la primera carga
- Columnas que el backend descarta antes de insertar (`COLS_DROP_FALABELLA`): `Paperlessreceptor`, `Paperlessrut`, `Paperlesscode`, `Metodoentrega`, `Comentarionoentrega`, `Simpliroute_id`, `LPN`, `LPN_Container`

**Deploy — problema `ccohub` identificado y documentado**
- El gcloud default del sistema está configurado en proyecto `ccohub` (distinto a `sigmc-5fae5`)
- Un deploy sin `--project sigmc-5fae5` fue enviado a `ccohub` por error
- Solución: SIEMPRE incluir `--project=sigmc-5fae5` en el comando de deploy del backend
- El comando correcto está actualizado en la sección "Comandos de deploy"

---

### 2026-04-24 — Sesión 6

#### Automatización carga Beetrak desde Google Drive

**Arquitectura del flujo**
- Antes: carga manual subiendo Excel desde el frontend (sigue funcionando)
- Ahora: Cloud Run Job `beetrak-drive-sync` corre diariamente a las 07:00 hora Chile
- El job detecta el archivo `.xlsx` más nuevo en la carpeta de Drive por regex de fechas en el nombre (`YYYY-MM-DD`), lo descarga, lo limpia y hace MERGE en BigQuery
- La carga manual y el job automático conviven sin duplicados — el MERGE por clave `orden` es idempotente
- Las cargas automáticas aparecen en el historial como `tipo = beetrak_drive`

**Archivos nuevos**
- `backend-cloud/jobs/beetrak_drive_sync.py` — script del job, importa `limpiar_beetrak`, `merge_beetrak`, etc. directamente desde `server.py` sin duplicar lógica
- `backend-cloud/jobs/Dockerfile` — imagen Docker del job (build context = `backend-cloud/`)
- `backend-cloud/jobs/DEPLOY.md` — instrucciones de deploy y permisos IAM
- `backend-cloud/cloudbuild.yaml` — config para `gcloud builds submit` (necesario porque `--dockerfile` no está soportado)

**Infraestructura creada**
- Imagen Docker: `gcr.io/sigmc-5fae5/beetrak-drive-sync`
- Cloud Run Job: `beetrak-drive-sync` (región `us-central1`, 1Gi RAM, timeout 300s)
- Cloud Scheduler: `beetrak-sync-diario` — `0 11 * * *` UTC = 07:00 hora Chile invierno (UTC-4)
- Carpeta Drive: `1tyCPCtxhAzz_x3feuo11L5bN8riE6mcK` compartida con SA `519623119758-compute@developer.gserviceaccount.com`

**Permisos IAM agregados**
- `roles/run.invoker` → SA `519623119758-compute@developer.gserviceaccount.com` (para que Scheduler pueda disparar el job)
- API habilitada: `drive.googleapis.com`

**Comandos para redesplegar el job**
```bash
cd "C:\Users\agust\OneDrive\Escritorio\union\backend-cloud"
gcloud builds submit --config=cloudbuild.yaml --project=sigmc-5fae5 .
gcloud run jobs update beetrak-drive-sync --image=gcr.io/sigmc-5fae5/beetrak-drive-sync --region=us-central1 --project=sigmc-5fae5
```

**Fix historial de cargas — hora Chile**
- `server.py`: el endpoint `/historial` convertía `cargado_en` a string en UTC → se veía 4 horas adelantado
- Fix: importar `ZoneInfo` y `CHILE_TZ = ZoneInfo("America/Santiago")`, aplicar `.astimezone(CHILE_TZ)` antes del `strftime`
- Maneja automáticamente el cambio CLT/CLST (UTC-4 invierno / UTC-3 verano)

---

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
