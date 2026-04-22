# DataFlow — Prototipo Base

Plataforma de ingesta y limpieza de archivos Beetrak y PFA sobre Google Cloud.

## Estructura

```
prototipo/
├── frontend/              ← React app (Firebase Hosting)
│   └── src/
│       ├── App.jsx
│       └── App.css
├── cloud-function/        ← Procesamiento automático
│   ├── main.py
│   └── requirements.txt
└── bigquery-schema/
    └── schema.sql         ← Tablas + queries de ejemplo
```

---

## 1. BigQuery — Crear tablas

```bash
# Reemplaza TU_PROYECTO y TU_DATASET
bq mk --dataset --location=us-central1 TU_PROYECTO:TU_DATASET
bq query --use_legacy_sql=false < bigquery-schema/schema.sql
```

---

## 2. Cloud Storage — Crear buckets

```bash
gcloud storage buckets create gs://TU_BUCKET_RAW   --location=us-central1
gcloud storage buckets create gs://TU_BUCKET_CLEAN --location=us-central1
```

---

## 3. Cloud Function — Deploy

```bash
cd cloud-function

gcloud functions deploy procesar_archivo \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=procesar_archivo \
  --trigger-event-filters="type=google.cloud.storage.object.v1.finalized" \
  --trigger-event-filters="bucket=TU_BUCKET_RAW" \
  --set-env-vars BQ_PROJECT=TU_PROYECTO,BQ_DATASET=TU_DATASET,BUCKET_CLEAN=TU_BUCKET_CLEAN \
  --memory=512MB \
  --timeout=300s
```

**Probar localmente:**
```bash
pip install -r requirements.txt
functions-framework --target=procesar_archivo --signature-type=cloudevent
```

---

## 4. Frontend — Deploy en Firebase Hosting

```bash
# Instalar dependencias y buildear
cd frontend
npm install
npm run build

# Deploy
npm install -g firebase-tools
firebase login
firebase init hosting   # seleccionar carpeta dist
firebase deploy
```

---

## Flujo completo

```
Usuario sube archivo en el frontend
        ↓
Archivo se guarda en gs://TU_BUCKET_RAW/beetrak/ o /pfa/
        ↓
Cloud Function se activa automáticamente (trigger GCS)
        ↓
Python: detecta tipo → lee xlsx/csv → limpia → normaliza SG
        ↓
Inserta en BigQuery  +  copia limpia en gs://TU_BUCKET_CLEAN/
```

---

## Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `BQ_PROJECT` | ID de tu proyecto GCP |
| `BQ_DATASET` | Nombre del dataset en BigQuery |
| `BUCKET_CLEAN` | Nombre del bucket para archivos limpios |

---

## Ajustes necesarios en main.py

1. `COLUMNAS_BEETRAK` — reemplazar con los nombres reales de columnas de tu archivo Beetrak
2. `COLUMNAS_PFA` — reemplazar con los nombres reales de tu archivo PFA
3. `normalizar_sg()` — ajustar regex si el formato de SG es distinto al ejemplo (SG-XXXXX)

---

## Próximos pasos sugeridos

- [ ] Agregar autenticación al frontend (Firebase Auth o Google Sign-In)
- [ ] Implementar notificaciones por email al terminar el procesamiento (SendGrid)
- [ ] Agregar validación de esquema antes de insertar en BQ
- [ ] Construir dashboard de visualización con Looker Studio conectado a BigQuery
