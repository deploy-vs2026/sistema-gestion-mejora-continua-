# Deploy — Beetrak Drive Sync (Cloud Run Job)

## 1. Permisos IAM que necesita la Service Account

El job corre con la Service Account por defecto de Compute Engine
(`519623119758-compute@developer.gserviceaccount.com`) o puedes crear una dedicada.

### Roles en GCP IAM (proyecto sigmc-5fae5)

```bash
# BigQuery: leer/escribir tablas
gcloud projects add-iam-policy-binding sigmc-5fae5 \
  --member="serviceAccount:519623119758-compute@developer.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

# BigQuery: ejecutar queries
gcloud projects add-iam-policy-binding sigmc-5fae5 \
  --member="serviceAccount:519623119758-compute@developer.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"
```

### Compartir la carpeta de Google Drive

En Google Drive, busca la carpeta con los archivos Beetrak y compártela con:

```
519623119758-compute@developer.gserviceaccount.com
```

Permiso: **Viewer** (solo lectura es suficiente).

Para obtener el DRIVE_FOLDER_ID: abre la carpeta en Drive, el ID está en la URL:
`https://drive.google.com/drive/folders/ESTE_ES_EL_ID`

---

## 2. Build y deploy del Cloud Run Job

```bash
# Desde la raíz del repo (union/)
cd backend-cloud

# Build con el Dockerfile del job (contexto = backend-cloud/)
gcloud builds submit \
  --tag gcr.io/sigmc-5fae5/beetrak-drive-sync \
  --dockerfile=jobs/Dockerfile \
  --project=sigmc-5fae5 \
  .

# Crear el Cloud Run Job (primera vez)
gcloud run jobs create beetrak-drive-sync \
  --image=gcr.io/sigmc-5fae5/beetrak-drive-sync \
  --region=us-central1 \
  --set-env-vars="BQ_PROJECT=sigmc-5fae5,BQ_DATASET=dataflow,DRIVE_FOLDER_ID=TU_FOLDER_ID_AQUI" \
  --memory=1Gi \
  --timeout=300 \
  --project=sigmc-5fae5

# Para actualizar (después del primer deploy)
gcloud run jobs update beetrak-drive-sync \
  --image=gcr.io/sigmc-5fae5/beetrak-drive-sync \
  --region=us-central1 \
  --set-env-vars="BQ_PROJECT=sigmc-5fae5,BQ_DATASET=dataflow,DRIVE_FOLDER_ID=TU_FOLDER_ID_AQUI" \
  --project=sigmc-5fae5
```

## 3. Programar con Cloud Scheduler (07:00 diario, hora Chile = UTC-3 → 10:00 UTC)

```bash
# Habilitar la API si no está habilitada
gcloud services enable cloudscheduler.googleapis.com --project=sigmc-5fae5

# Crear el trigger diario
gcloud scheduler jobs create http beetrak-sync-diario \
  --location=us-central1 \
  --schedule="0 10 * * *" \
  --uri="https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/sigmc-5fae5/jobs/beetrak-drive-sync:run" \
  --message-body='{}' \
  --oauth-service-account-email=519623119758-compute@developer.gserviceaccount.com \
  --project=sigmc-5fae5
```

> Ajusta el horario según la zona horaria que necesites.
> `0 10 * * *` = 10:00 UTC = 07:00 hora Chile (UTC-3).

## 4. Ejecutar manualmente (prueba)

```bash
gcloud run jobs execute beetrak-drive-sync \
  --region=us-central1 \
  --project=sigmc-5fae5
```

Para ver los logs:
```bash
gcloud logging read \
  'resource.type="cloud_run_job" AND resource.labels.job_name="beetrak-drive-sync"' \
  --limit=50 \
  --project=sigmc-5fae5
```
