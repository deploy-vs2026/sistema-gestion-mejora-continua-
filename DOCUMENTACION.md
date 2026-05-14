# Geosort Falabella Scraper — Documentación Completa

## Qué hace

Scraper automatizado con Playwright que:
1. Entra a `https://geosort.falabella.com`, hace login
2. Va a la sección **Reportería**
3. Selecciona el **día anterior** en el date picker
4. Descarga el reporte CSV
5. Procesa el CSV (agrupa por ruta y calcula métricas)
6. Sube el resultado a **Google Cloud Storage**

Se ejecuta **todos los días a las 07:00 AM hora Chile**, excepto los lunes (porque el día anterior sería domingo y no hay operación).

---

## Calendario de ejecución

| Día que corre | Día que descarga | ¿Descarga? |
|---|---|---|
| Martes | Lunes | Si |
| Miércoles | Martes | Si |
| Jueves | Miércoles | Si |
| Viernes | Jueves | Si |
| Sábado | Viernes | Si |
| Domingo | Sábado | Si |
| Lunes | Domingo | **No** |

---

## Infraestructura en Google Cloud

### Proyecto GCP
- **Project ID**: `sigmc-5fae5`
- **Region**: `us-central1`

### Recursos

| Recurso | Nombre | Descripción |
|---|---|---|
| Cloud Run Job | `geosort-scraper` | Ejecuta el scraper en contenedor Docker |
| Cloud Scheduler | `geosort-scraper-trigger` | Dispara el job todos los días 10:00 UTC (07:00 Chile) |
| Service Account | `geosort-scraper-sa@sigmc-5fae5.iam.gserviceaccount.com` | Identidad con permisos mínimos |
| GCS Bucket | `gs://geosort-sesion-sigmc` | Cookies de sesión reutilizables |
| GCS Bucket | `gs://reportes-geosort` | CSVs procesados |
| Secret | `geosort-email` | Email de Geosort (Secret Manager) |
| Secret | `geosort-password` | Contraseña de Geosort (Secret Manager) |
| Docker Image | `gcr.io/sigmc-5fae5/geosort-scraper` | Imagen con Python + Playwright + Chromium |

### Cron del Scheduler
```
0 10 * * *   →   todos los días 10:00 UTC = 07:00 AM hora Chile
```

---

## Variables de entorno

| Variable | Valor en producción | Descripción |
|---|---|---|
| `GEOSORT_EMAIL` | Secret Manager: `geosort-email` | Usuario Geosort |
| `GEOSORT_PASSWORD` | Secret Manager: `geosort-password` | Contraseña Geosort |
| `USAR_GCS` | `true` | Sube a Google Cloud Storage |
| `GCP_PROJECT` | `sigmc-5fae5` | Proyecto GCP |
| `BUCKET_SESION` | `geosort-sesion-sigmc` | Bucket para cookies de sesión |
| `BUCKET_REPORTES` | `reportes-geosort` | Bucket para los CSVs descargados |

Las credenciales están en **Secret Manager**, no en texto plano.

---

## Dónde quedan guardados los archivos

Los CSVs procesados se suben automáticamente a:

```
gs://reportes-geosort/reportes/YYYY-MM-DD_a_YYYY-MM-DD/archivo_procesado.csv
```

Ejemplo para el día 10 de mayo 2026:
```
gs://reportes-geosort/reportes/2026-05-10_a_2026-05-10/reporte_2026-05-10_a_2026-05-10_procesado.csv
```

Para listar los reportes:
```bash
gsutil ls gs://reportes-geosort/reportes/
```

---

## Flujo interno del scraper

### 1. Login
- URL: `https://geosort.falabella.com/login`
- El campo usuario tiene `placeholder="usuario"` (no es `type=email`)
- Tras login redirige a `/home`
- Las cookies se guardan en GCS para reutilizar la sesión en la siguiente ejecución

### 2. Navegación a Reportería
- Click en ícono `i.fa-file-invoice` del sidebar

### 3. Selección de fecha
- El date picker de Element UI **no acepta texto directo** (`.fill()` no funciona)
- Se abre el calendario, se navega mes a mes con las flechas, y se hace click en el día via JavaScript
- El header del calendario tiene formato `"2026 abril"` (año + mes en español)
- Se selecciona el mismo día para inicio y fin (un solo día)

### 4. Búsqueda
- Click en botón lupa (`i.el-icon-search`) via JavaScript para evitar problemas de intercepción del sidebar

### 5. Esperar resultados
- `networkidle` + 2-3 segundos adicionales

### 6. Descarga
- Botón verde `button.el-button--primary.el-button--small` con texto "DESCARGAR", clickeado via JavaScript

### 7. Procesamiento del CSV
- Agrupa por: CT | Semana | Año | Fecha | Patente | IdRuta
- Calcula: Pendientes, Terminados, Hr. Inicio, Primera/Última entrega, Tiempo Total/Promedio, Total, Fill Rate
- Genera un CSV `_procesado.csv` junto al archivo crudo

### 8. Subida a GCS
- Sube solo el CSV procesado a `gs://reportes-geosort/reportes/FECHA_a_FECHA/`

---

## Estructura de archivos

```
scraper.py                  # Script principal
Dockerfile                  # Imagen Docker con Playwright + Chromium
requirements.txt            # Dependencias Python
DOCUMENTACION.md            # Este archivo
geosort_cookies.json        # Cookies locales (solo modo local)
reportes_descargados/       # CSVs en modo local
```

---

## Comandos útiles de operación

### Ejecutar manualmente (sin esperar el scheduler)
```bash
gcloud run jobs execute geosort-scraper --region=us-central1 --project=sigmc-5fae5
```

### Ver logs de la última ejecución
```bash
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=geosort-scraper" \
  --limit=50 \
  --format="table(timestamp,textPayload)" \
  --project=sigmc-5fae5
```

### Actualizar el código (rebuild y redeploy)
```bash
cd "C:\Users\agust\OneDrive\Escritorio\SCRAPER-FALABELLA"
gcloud builds submit --tag gcr.io/sigmc-5fae5/geosort-scraper . --project=sigmc-5fae5
gcloud run jobs update geosort-scraper --image=gcr.io/sigmc-5fae5/geosort-scraper --region=us-central1 --project=sigmc-5fae5
```

### Ver estado del scheduler
```bash
gcloud scheduler jobs describe geosort-scraper-trigger --location=us-central1 --project=sigmc-5fae5
```

### Forzar ejecución del scheduler ahora
```bash
gcloud scheduler jobs run geosort-scraper-trigger --location=us-central1 --project=sigmc-5fae5
```

---

## Cómo hacer cambios

### Cambiar el horario de ejecución
Editar el cron del scheduler. Formato: `MINUTO HORA * * *` en UTC.

```bash
gcloud scheduler jobs update http geosort-scraper-trigger \
  --location=us-central1 \
  --project=sigmc-5fae5 \
  --schedule="0 10 * * *"
```

Referencia de horas Chile → UTC:
- 07:00 Chile (invierno) = 10:00 UTC
- 07:00 Chile (verano) = 11:00 UTC

### Cambiar qué días no descarga
En `scraper.py`, función `calcular_dia_anterior()`:

```python
if ayer.weekday() == 6:  # 6 = domingo → lunes no descarga
    return None
```

Valores de `weekday()`: 0=lunes, 1=martes, 2=miércoles, 3=jueves, 4=viernes, 5=sábado, 6=domingo

### Volver a modo prueba (fechas fijas, navegador visible)
Editar `main()` en `scraper.py`:

```python
# Reemplazar:
rango = calcular_dia_anterior()

# Por fechas fijas:
from datetime import date as _date
fecha = _date(2026, 5, 10)
rango = (fecha, fecha)

# También cambiar headless=True → headless=False para ver el navegador
```

Luego para probar localmente:
```bash
USAR_GCS=false python scraper.py
```
Los CSVs quedan en `./reportes_descargados/`

---

## Dependencias

```
playwright==1.44.0
google-cloud-storage==2.16.0
pandas==2.2.2
```

Base Docker: `mcr.microsoft.com/playwright/python:v1.44.0-jammy` (incluye Chromium)

---

## Problemas conocidos y soluciones

| Problema | Causa | Solución aplicada |
|---|---|---|
| Timeout en campo email | El input tiene `placeholder="usuario"`, no `type=email` | Loop de selectores alternativos |
| Redirect a `/home` no `/dashboard` | La app redirige a `/home` tras login | `wait_for_url("**/home**")` |
| Sidebar intercepta clicks | `el-aside.expand-side` queda sobre los inputs | `force=True` + cerrar sidebar con Escape |
| Date picker limpia las fechas | El componente Element UI no acepta texto directo | Navegar el calendario y clickear días via JS |
| Botón DESCARGAR no encontrado | El botón aparece después de que cargan los resultados | Esperar `button.el-button--primary` visible antes de clickear |
| Clicks bloqueados por sidebar | El sidebar intercepta pointer events | JavaScript `element.click()` que ignora intercepción |
