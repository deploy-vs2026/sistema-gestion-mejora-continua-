"""
Cloud Function (2nd gen) - Limpieza automática de archivos Beetrak y PFA
Se activa automáticamente cuando se sube un archivo al bucket /raw en GCS.

Deploy:
  gcloud functions deploy procesar_archivo \
    --gen2 \
    --runtime=python311 \
    --region=us-central1 \
    --trigger-event-filters="type=google.cloud.storage.object.v1.finalized" \
    --trigger-event-filters="bucket=TU_BUCKET_RAW" \
    --set-env-vars BQ_PROJECT=tu-proyecto,BQ_DATASET=tu_dataset,BUCKET_CLEAN=tu-bucket-clean
"""

import os
import io
import re
import logging
from datetime import datetime, timezone

import functions_framework
import pandas as pd
from google.cloud import storage, bigquery

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# ── Configuración ──────────────────────────────────────────────────────────────
BQ_PROJECT   = os.environ["BQ_PROJECT"]
BQ_DATASET   = os.environ["BQ_DATASET"]
BUCKET_CLEAN = os.environ.get("BUCKET_CLEAN", "tu-bucket-clean")

# ── Columnas a conservar ───────────────────────────────────────────────────────
# Beetrak: nombre original → nombre en BigQuery
COLUMNAS_BEETRAK = {
    "Orden":             "orden",           # 🔑 clave JOIN con PFA.shipping_group
    "LOCAL":             "local",
    "Tipo de despacho":  "tipo_despacho",
    "Fecha estimada":    "fecha_estimada",
    "Fecha Llegada":     "fecha_llegada",
    "Estado":            "estado",
    "Subestado":         "subestado",
    "Usuario móvil":     "usuario_movil",
    "Dirección cliente": "direccion_cliente",
    "Fecha ruta":        "fecha_ruta",
    "# intentos":        "intentos",
    "Coordenadas":       "coordenadas",
}

# PFA: nombre original → nombre en BigQuery
COLUMNAS_PFA = {
    "shipping_group":       "shipping_group",  # 🔑 clave JOIN con Beetrak.orden
    "nro_local":            "nro_local",
    "fecha_control":        "fecha_control",
    "tipo_servicio":        "tipo_servicio",
    "rol_persona":          "rol_persona",
    "rut_persona":          "rut_persona",
    "fecha_compromiso":     "fecha_compromiso",
    "ventana":              "ventana",
    "inicio_picking":       "inicio_picking",
    "fin_picking":          "fin_picking",
    "unidades_solicitadas": "unidades_solicitadas",
    "unidades_pickeadas":   "unidades_pickeadas",
    "unidades_sustituidas": "unidades_sustituidas",
    "items_solicitados":    "items_solicitados",
    "items_a_pagar":        "items_a_pagar",
    "doble_pedido":         "doble_pedido",
}

# Columnas excluidas (sensibles o sin valor analítico)
EXCLUIR_BEETRAK = {
    "Identificador ruta", "Identificador", "Teléfono usuario",
    "Fecha de creacion", "Fecha primer intento",
    "Tiempo min entrega", "Tiempo max entrega",
    "Inicio de ruta", "Fin de ruta", "Número de intento",
}
EXCLUIR_PFA = {"empresa", "rut_empresa"}


# ── Entry point ────────────────────────────────────────────────────────────────
@functions_framework.cloud_event
def procesar_archivo(cloud_event):
    data        = cloud_event.data
    bucket_name = data["bucket"]
    blob_name   = data["name"]

    log.info(f"Archivo recibido: gs://{bucket_name}/{blob_name}")

    tipo = detectar_tipo(blob_name)
    if tipo is None:
        log.warning(f"Ignorado (no es beetrak ni pfa): {blob_name}")
        return

    gcs     = storage.Client()
    bucket  = gcs.bucket(bucket_name)
    blob    = bucket.blob(blob_name)
    content = blob.download_as_bytes()

    extension = blob_name.rsplit(".", 1)[-1].lower()
    df_raw    = leer_archivo(content, extension)
    log.info(f"Leído: {len(df_raw)} filas · {len(df_raw.columns)} columnas")

    df_clean = limpiar(df_raw, tipo)
    log.info(f"Limpio: {len(df_clean)} filas · {len(df_clean.columns)} columnas")

    guardar_copia_limpia(gcs, df_clean, tipo, blob_name)
    cargar_bigquery(df_clean, tipo)

    log.info(f"✓ {tipo.upper()} procesado correctamente — {blob_name}")


# ── Detección de tipo ──────────────────────────────────────────────────────────
def detectar_tipo(blob_name: str) -> str | None:
    nombre = blob_name.lower()
    if "beetrack" in nombre or "beetrak" in nombre:
        return "beetrak"
    if "pfa" in nombre:
        return "pfa"
    return None


# ── Lectura ────────────────────────────────────────────────────────────────────
def leer_archivo(content: bytes, extension: str) -> pd.DataFrame:
    if extension in ("xlsx", "xls"):
        return pd.read_excel(io.BytesIO(content), sheet_name="Datos", dtype=str)
    elif extension == "csv":
        muestra = content[:4096].decode("utf-8", errors="ignore")
        sep = ";" if muestra.count(";") > muestra.count(",") else ","
        return pd.read_csv(io.BytesIO(content), sep=sep, dtype=str, encoding="utf-8-sig")
    else:
        raise ValueError(f"Extensión no soportada: {extension}")


# ── Limpieza principal ─────────────────────────────────────────────────────────
def limpiar(df: pd.DataFrame, tipo: str) -> pd.DataFrame:
    df = df.copy()
    df = df.dropna(how="all").reset_index(drop=True)

    if tipo == "beetrak":
        df = limpiar_beetrak(df)
    else:
        df = limpiar_pfa(df)

    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].str.strip().replace("", None)

    df["_cargado_en"] = datetime.now(timezone.utc).isoformat()
    return df.reset_index(drop=True)


# ── Limpieza Beetrak ───────────────────────────────────────────────────────────
def limpiar_beetrak(df: pd.DataFrame) -> pd.DataFrame:
    cols_presentes = {k: v for k, v in COLUMNAS_BEETRAK.items() if k in df.columns}
    cols_faltantes = [k for k in COLUMNAS_BEETRAK if k not in df.columns]
    if cols_faltantes:
        log.warning(f"Columnas no encontradas en Beetrak: {cols_faltantes}")

    df = df[list(cols_presentes.keys())].rename(columns=cols_presentes)

    # Normalizar clave JOIN
    df["orden"] = df["orden"].apply(normalizar_orden)

    # Separar coordenadas en lat/lon
    if "coordenadas" in df.columns:
        coords = df["coordenadas"].str.extract(r"(-?[\d.]+),\s*(-?[\d.]+)")
        df["latitud"]  = coords[0]
        df["longitud"] = coords[1]
        df = df.drop(columns=["coordenadas"])

    # Fechas
    for col in ["fecha_estimada", "fecha_llegada", "fecha_ruta"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S")

    # Intentos como número
    if "intentos" in df.columns:
        df["intentos"] = pd.to_numeric(df["intentos"], errors="coerce")

    # Estado en title case
    if "estado" in df.columns:
        df["estado"] = df["estado"].str.strip().str.title()

    log.info(f"Estados únicos: {df['estado'].value_counts().to_dict()}")
    return df


# ── Limpieza PFA ───────────────────────────────────────────────────────────────
def limpiar_pfa(df: pd.DataFrame) -> pd.DataFrame:
    df = df.drop(columns=[c for c in EXCLUIR_PFA if c in df.columns])

    cols_presentes = {k: v for k, v in COLUMNAS_PFA.items() if k in df.columns}
    df = df[list(cols_presentes.keys())].rename(columns=cols_presentes)

    # Normalizar clave JOIN
    df["shipping_group"] = df["shipping_group"].apply(normalizar_orden)

    # Fechas
    for col in ["fecha_control", "fecha_compromiso", "inicio_picking", "fin_picking"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S")

    # Numéricos
    
    for col in ["unidades_solicitadas", "unidades_pickeadas", "unidades_sustituidas",
                "items_solicitados", "items_a_pagar"]:
        if col in df.columns:
            # El "Int64" con mayúscula permite enteros con valores nulos (NaN) sin pasarse a float
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")

    # doble_pedido → booleano
    if "doble_pedido" in df.columns:
        df["doble_pedido"] = df["doble_pedido"].notna() & (df["doble_pedido"].str.strip() != "")

    # Tiempo de picking en minutos (columna calculada)
    if "inicio_picking" in df.columns and "fin_picking" in df.columns:
        t_inicio = pd.to_datetime(df["inicio_picking"], errors="coerce")
        t_fin    = pd.to_datetime(df["fin_picking"],    errors="coerce")
        df["minutos_picking"] = (t_fin - t_inicio).dt.total_seconds() / 60

    log.info(f"Dobles pedidos: {df['doble_pedido'].sum() if 'doble_pedido' in df.columns else 'N/A'}")
    return df


# ── Normalización clave JOIN ───────────────────────────────────────────────────
def normalizar_orden(valor) -> str | None:
    """
    Normaliza el número de orden para el JOIN beetrak.orden ↔ pfa.shipping_group.
    Ambos archivos usan el mismo formato numérico (ej: 400001346962, 91152543193).
    Solo limpia espacios — no transforma el valor para no romper el match.
    """
    if pd.isna(valor) or str(valor).strip() == "":
        return None
    return str(valor).strip()


# ── BigQuery ───────────────────────────────────────────────────────────────────
def cargar_bigquery(df: pd.DataFrame, tipo: str):
    bq    = bigquery.Client(project=BQ_PROJECT)
    tabla = f"{BQ_PROJECT}.{BQ_DATASET}.{tipo}"

    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        autodetect=True,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )

    job = bq.load_table_from_dataframe(df, tabla, job_config=job_config)
    job.result()
    log.info(f"Insertadas {len(df)} filas en {tabla}")


# ── Copia limpia en GCS ────────────────────────────────────────────────────────
def guardar_copia_limpia(gcs_client, df: pd.DataFrame, tipo: str, blob_name_original: str):
    nombre  = blob_name_original.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    ts      = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    destino = f"clean/{tipo}/{nombre}_{ts}.csv"

    bucket = gcs_client.bucket(BUCKET_CLEAN)
    blob   = bucket.blob(destino)
    blob.upload_from_string(
        df.to_csv(index=False, encoding="utf-8-sig"),
        content_type="text/csv"
    )
    log.info(f"Copia limpia → gs://{BUCKET_CLEAN}/{destino}")