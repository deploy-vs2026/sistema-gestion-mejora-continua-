"""
Servidor Cloud Run · DataFlow v5
- Procesa archivos Beetrak y PFA
- Almacena datos en BigQuery (acumulativo)
- Lee datos desde BigQuery

Deploy:
  gcloud run deploy dataflow-api \
    --source=. \
    --region=us-central1 \
    --allow-unauthenticated \
    --set-env-vars BQ_PROJECT=sigmc-5fae5,BQ_DATASET=dataflow
"""

import gzip
import io
import json
import logging
import os
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

CHILE_TZ = ZoneInfo("America/Santiago")

import pandas as pd
from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from google.cloud import bigquery
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
BQ_PROJECT = os.environ.get("BQ_PROJECT", "sigmc-5fae5")
BQ_DATASET = os.environ.get("BQ_DATASET", "dataflow")
BQ_TABLE_BEETRAK      = f"{BQ_PROJECT}.{BQ_DATASET}.beetrak"
BQ_TABLE_PFA          = f"{BQ_PROJECT}.{BQ_DATASET}.pfa"
BQ_TABLE_PFA_FINANZAS = f"{BQ_PROJECT}.{BQ_DATASET}.pfa_finanzas"
BQ_TABLE_PFA_DELIVERY = f"{BQ_PROJECT}.{BQ_DATASET}.pfa_delivery"
BQ_TABLE_CARGAS       = f"{BQ_PROJECT}.{BQ_DATASET}.cargas"
BQ_TABLE_FALABELLA    = f"{BQ_PROJECT}.{BQ_DATASET}.falabella"
BQ_TABLE_GEOSORT      = f"{BQ_PROJECT}.{BQ_DATASET}.geosort"
BQ_TABLE_INSTALEEP    = f"{BQ_PROJECT}.{BQ_DATASET}.instaleep"
BQ_TABLE_CONFIG       = f"{BQ_PROJECT}.{BQ_DATASET}.configuracion"
BUCKET_REPORTES       = os.environ.get("BUCKET_REPORTES", "reportes-geosort")

bq_client = bigquery.Client(project=BQ_PROJECT)

app = FastAPI(title="DataFlow Cloud", version="5.0.0")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    allow_credentials=False,
)


# ── Pydantic models ──────────────────────────────────────────────────────────
class UsuarioIn(BaseModel):
    correo: str
    rol: str


# ── Columnas Beetrak ──────────────────────────────────────────────────────────
COLUMNAS_BEETRAK = {
    "Identificador ruta":  "identificador_ruta",
    "Identificador":       "identificador",
    "Orden":               "orden",
    "LOCAL":               "local",
    "Tipo de despacho":    "tipo_despacho",
    "Fecha estimada":      "fecha_estimada",
    "Fecha Llegada":       "fecha_llegada",
    "Estado":              "estado",
    "Subestado":           "subestado",
    "Usuario móvil":       "nombre_movil",
    "Teléfono usuario":    "telefono_usuario",
    "Dirección cliente":   "direccion_cliente",
    "Fecha de creacion":   "fecha_creacion",
    "Fecha primer intento":"fecha_primer_intento",
    "# intentos":          "intentos",
    "Usuario móvil.1":     "rut_movil",
    "Tiempo min entrega":  "tiempo_min_entrega",
    "Tiempo max entrega":  "tiempo_max_entrega",
    "Fecha ruta":          "fecha_ruta",
    "Inicio de ruta":      "inicio_ruta",
    "Fin de ruta":         "fin_ruta",
    "Número de intento":   "numero_intento",
    "Coordenadas":         "coordenadas",
    "Fecha de picking":    "fecha_picking",
    "Latitud":             "latitud",
    "Longitud":            "longitud",
    "Foto de los bultos + sueltos entregados": "foto_bultos",
}

# ── Columnas PFA ──────────────────────────────────────────────────────────────
COLUMNAS_PFA_FINANZAS = {
    "empresa":               "empresa",
    "rut_empresa":           "rut_empresa",
    "shipping_group":        "shipping_group",
    "nro_local":             "nro_local",
    "fecha_control":         "fecha_control",
    "tipo_servicio":         "tipo_servicio",
    "rol_persona":           "rol_persona",
    "rut_persona":           "rut_persona",
    "fecha_compromiso":      "fecha_compromiso",
    "ventana":               "ventana",
    "inicio_picking":        "inicio_picking",
    "fin_picking":           "fin_picking",
    "unidades_solicitadas":  "unidades_solicitadas",
    "unidades_pickeadas":    "unidades_pickeadas",
    "unidades_sustituidas":  "unidades_sustituidas",
    "items_solicitados":     "items_solicitados",
    "items_a_pagar":         "items_a_pagar",
    "doble_pedido":          "doble_pedido",
}

COLUMNAS_PFA_LIMPIA = {
    "shipping_group":        "shipping_group",
    "nro_local":             "nro_local",
    "fecha_control":         "fecha_control",
    "tipo_servicio":         "tipo_servicio",
    "rol_persona":           "rol_persona",
    "rut_persona":           "rut_persona",
    "fecha_compromiso":      "fecha_compromiso",
    "ventana":               "ventana",
    "inicio_picking":        "inicio_picking",
    "fin_picking":           "fin_picking",
    "unidades_solicitadas":  "unidades_solicitadas",
    "unidades_pickeadas":    "unidades_pickeadas",
    "unidades_sustituidas":  "unidades_sustituidas",
    "items_solicitados":     "items_solicitados",
    "items_a_pagar":         "items_a_pagar",
}

COLS_DROP_FALABELLA = {
    "Paperlessreceptor", "Paperlessrut", "Paperlesscode",
    "Metodoentrega", "Comentarionoentrega", "Simpliroute_id",
    "LPN", "LPN_Container",
}

# ── Locales válidos ───────────────────────────────────────────────────────────
LOCAL_PREFIJOS = {
    "41":  ["LTVS", "DRVS", "LTTH", "DRTH"],
    "42":  ["LTVS", "DRVS"],
    "45":  ["HDVS"],
    "54":  ["LTVS", "DRVS"],
    "58":  ["HDVS"],
    "71":  ["LTVS", "DRVS"],
    "75":  ["LTVS", "DRVS"],
    "76":  ["LTVS", "DRVS"],
    "88":  ["LTVS", "DRVS", "LTBM", "DRBM", "UBER"],
    "94":  ["LTVS", "DRVS", "HDVS"],
    "95":  ["HDVS"],
    "98":  ["LTVS", "DRVS", "HDVS"],
    "99":  ["LTVS", "DRVS", "HDVS"],
    "120": ["LTVS", "DRVS", "HDVS"],
    "121": ["LTVS", "DRVS", "HDVS", "LTZB", "DRZB"],
    "143": ["LTVS", "DRVS"],
    "144": ["LTVS", "DRVS"],
    "146": ["LTVS", "DRVS"],
    "182": ["LTVS", "DRVS"],
    "276": ["LTVS", "DRVS"],
    "518": ["LTVS", "DRVS", "LTGP", "DRGP"],
    "608": ["LTVS", "DRVS", "HDVS"],
    "611": ["LTVS", "DRVS"],
    "618": ["LTVS", "DRVS", "HDVS"],
    "627": ["LTVS", "DRVS"],
    "647": ["LTVS", "DRVS"],
    "655": ["LTVS", "DRVS"],
    "657": ["LTVS", "DRVS", "HDVS"],
    "658": ["LTVS", "DRVS"],
    "693": ["LTVS", "DRVS"],
    "697": ["LTVS", "DRVS"],
    "929": ["LTVS", "DRVS"],
    "952": ["LTVS", "DRVS"],
}


# ── BigQuery helpers ──────────────────────────────────────────────────────────
def insertar_bigquery(df: pd.DataFrame, tabla: str):
    """Inserta un DataFrame en BigQuery (acumulativo)."""
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
    )
    job = bq_client.load_table_from_dataframe(df, tabla, job_config=job_config)
    job.result()
    log.info(f"Insertadas {len(df)} filas en {tabla}")


def insertar_finanzas_bigquery(df: pd.DataFrame):
    """Inserta pfa_finanzas con schema explícito para evitar inferencia incorrecta de tipos."""
    bq_schema = []
    for col in df.columns:
        if col in COLS_FECHA_FINANZAS:
            bq_schema.append(bigquery.SchemaField(col, "TIMESTAMP"))
        elif col in COLS_ENTERO_FINANZAS:
            bq_schema.append(bigquery.SchemaField(col, "INT64"))
        elif col in COLS_DECIMAL_FINANZAS:
            bq_schema.append(bigquery.SchemaField(col, "FLOAT64"))
        else:
            bq_schema.append(bigquery.SchemaField(col, "STRING"))
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        schema=bq_schema,
        schema_update_options=[bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION],
    )
    job = bq_client.load_table_from_dataframe(df, BQ_TABLE_PFA_FINANZAS, job_config=job_config)
    job.result()
    log.info(f"Insertadas {len(df)} filas en {BQ_TABLE_PFA_FINANZAS}")


DELIVERY_COL_TYPES = {
    "nro_intento":        "INT64",
    "courier_entrega":    "STRING",
    "fecha_evento":       "TIMESTAMP",
    "estado_entrega":     "STRING",
    "shipping_group":     "STRING",
    "store_number":       "STRING",
    "patente":            "STRING",
    "orden_en_ruta":      "INT64",
    "id_ruta":            "STRING",
    "es_retorno":         "STRING",
    "es_ultimo_retorno":  "STRING",
    "km_entrega":         "FLOAT64",
    "monto_entrega":      "STRING",
    "km_retorno":         "FLOAT64",
    "monto_retorno":      "STRING",
    "origen_km_entrega":  "STRING",
    "origen_km_retorno":  "STRING",
    "doble_pedido":       "STRING",
    "_cargado_en":        "TIMESTAMP",
}

def _preparar_delivery_bq(df: pd.DataFrame) -> pd.DataFrame:
    """Normaliza nombres de columna y tipos para insertar en pfa_delivery."""
    df = df.copy()
    # Normalizar nombres: minúsculas, espacios → guión bajo
    df.columns = [str(c).strip().lower().replace(" ", "_").replace("-", "_") for c in df.columns]
    df["_cargado_en"] = datetime.now(timezone.utc)
    for col in df.columns:
        bq_type = DELIVERY_COL_TYPES.get(col, "STRING")
        if bq_type == "TIMESTAMP":
            df[col] = pd.to_datetime(df[col], errors="coerce", utc=True)
        elif bq_type == "INT64":
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
        elif bq_type == "FLOAT64":
            df[col] = pd.to_numeric(df[col], errors="coerce")
        else:
            df[col] = df[col].astype(str).str.strip().replace("nan", None).replace("", None)
    return df

def merge_pfa_delivery(df: pd.DataFrame):
    """Inserta en pfa_delivery usando MERGE con clave shipping_group."""
    try:
        bq_client.get_table(BQ_TABLE_PFA_DELIVERY)
        tabla_existe = True
    except Exception:
        tabla_existe = False

    if "shipping_group" in df.columns:
        df = df.drop_duplicates(subset=["shipping_group"], keep="last").reset_index(drop=True)

    bq_schema = [
        bigquery.SchemaField(col, DELIVERY_COL_TYPES.get(col, "STRING"))
        for col in df.columns
    ]
    tmp_tabla = f"{BQ_TABLE_PFA_DELIVERY}_tmp"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        schema=bq_schema,
    )
    job = bq_client.load_table_from_dataframe(df, tmp_tabla, job_config=job_config)
    job.result()

    if not tabla_existe:
        bq_client.copy_table(tmp_tabla, BQ_TABLE_PFA_DELIVERY).result()
        bq_client.delete_table(tmp_tabla, not_found_ok=True)
        log.info(f"Tabla {BQ_TABLE_PFA_DELIVERY} creada con {len(df)} filas")
        return

    # Agregar columnas nuevas a la tabla destino si no existen
    tgt_table = bq_client.get_table(BQ_TABLE_PFA_DELIVERY)
    tgt_cols  = {f.name for f in tgt_table.schema}
    nuevas    = [bigquery.SchemaField(col, DELIVERY_COL_TYPES.get(col, "STRING"))
                 for col in df.columns if col not in tgt_cols]
    if nuevas:
        tgt_table.schema = list(tgt_table.schema) + nuevas
        bq_client.update_table(tgt_table, ["schema"])
        log.info(f"Columnas nuevas agregadas a {BQ_TABLE_PFA_DELIVERY}: {[f.name for f in nuevas]}")

    cols     = ", ".join(f"`{c}`" for c in df.columns)
    src_cols = ", ".join(f"src.`{c}`" for c in df.columns)
    upd_cols = ", ".join(f"tgt.`{c}` = src.`{c}`" for c in df.columns if c != "shipping_group")
    merge_query = f"""
    MERGE `{BQ_TABLE_PFA_DELIVERY}` AS tgt
    USING `{tmp_tabla}` AS src
    ON tgt.shipping_group = src.shipping_group
    WHEN MATCHED THEN
        UPDATE SET {upd_cols}
    WHEN NOT MATCHED THEN
        INSERT ({cols}) VALUES ({src_cols})
    """
    bq_client.query(merge_query).result()
    bq_client.delete_table(tmp_tabla, not_found_ok=True)
    log.info(f"MERGE pfa_delivery: {len(df)} filas procesadas")


BEETRAK_COL_TYPES = {
    "identificador_ruta": "STRING", "identificador": "STRING", "orden": "STRING",
    "local": "STRING", "tipo_despacho": "STRING",
    "fecha_estimada": "DATETIME", "fecha_llegada": "DATETIME", "fecha_ruta": "DATETIME",
    "fecha_creacion": "DATETIME", "fecha_primer_intento": "DATETIME",
    "inicio_ruta": "DATETIME", "fin_ruta": "DATETIME", "fecha_picking": "DATETIME",
    "estado": "STRING", "subestado": "STRING", "nombre_movil": "STRING",
    "telefono_usuario": "STRING", "direccion_cliente": "STRING",
    "intentos": "INT64", "rut_movil": "STRING", "tiempo_min_entrega": "DATETIME",
    "tiempo_max_entrega": "DATETIME", "numero_intento": "STRING",
    "latitud": "FLOAT64", "longitud": "FLOAT64",
    "foto_bultos": "STRING",
    "_cargado_en": "TIMESTAMP",
}

def _beetrak_schema(df: pd.DataFrame):
    return [
        bigquery.SchemaField(col, BEETRAK_COL_TYPES.get(col, "STRING"))
        for col in df.columns
    ]

def _ensure_beetrak_cols(df_cols: list):
    """Agrega al schema de beetrak las columnas nuevas que aún no existen."""
    try:
        table = bq_client.get_table(BQ_TABLE_BEETRAK)
        existing = {f.name for f in table.schema}
        nuevas = [c for c in df_cols if c not in existing]
        if nuevas:
            table.schema = list(table.schema) + [
                bigquery.SchemaField(c, BEETRAK_COL_TYPES.get(c, "STRING")) for c in nuevas
            ]
            bq_client.update_table(table, ["schema"])
            log.info(f"Columnas nuevas agregadas a beetrak: {nuevas}")
    except Exception as e:
        log.warning(f"No se pudo actualizar schema beetrak: {e}")


def merge_beetrak(df: pd.DataFrame):
    """Inserta en beetrak usando MERGE. Agrega columnas nuevas al schema si es necesario."""
    try:
        bq_client.get_table(BQ_TABLE_BEETRAK)
        tabla_existe = True
    except Exception:
        tabla_existe = False

    tmp_tabla = f"{BQ_TABLE_BEETRAK}_tmp"
    job_config_trunc = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        schema=_beetrak_schema(df),
    )

    if not tabla_existe:
        job = bq_client.load_table_from_dataframe(df, BQ_TABLE_BEETRAK, job_config=job_config_trunc)
        job.result()
        log.info(f"Tabla beetrak creada con {len(df)} filas")
        return
    
    # Agregar columnas nuevas al schema antes del MERGE
    _ensure_beetrak_cols(list(df.columns))

    job = bq_client.load_table_from_dataframe(df, tmp_tabla, job_config=job_config_trunc)
    job.result()

    cols     = ", ".join(f"`{c}`" for c in df.columns)
    src_cols = ", ".join(f"src.`{c}`" for c in df.columns)
    upd_cols = ", ".join(
        f"tgt.`{c}` = src.`{c}`"
        for c in df.columns
        if c not in ("orden", "_cargado_en")
    )
    merge_query = f"""
    MERGE `{BQ_TABLE_BEETRAK}` AS tgt
    USING `{tmp_tabla}` AS src
    ON tgt.orden = src.orden
    WHEN MATCHED THEN
        UPDATE SET {upd_cols}
    WHEN NOT MATCHED THEN
        INSERT ({cols}) VALUES ({src_cols})
    """
    bq_client.query(merge_query).result()

    bq_client.delete_table(tmp_tabla, not_found_ok=True)
    log.info(f"MERGE beetrak: {len(df)} filas procesadas")


def merge_pfa_limpia(df: pd.DataFrame):
    """Inserta en pfa usando MERGE para garantizar que shipping_group sea único globalmente."""
    try:
        bq_client.get_table(BQ_TABLE_PFA)
        tabla_existe = True
    except Exception:
        tabla_existe = False

    tmp_tabla = f"{BQ_TABLE_PFA}_tmp"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )

    if not tabla_existe:
        job = bq_client.load_table_from_dataframe(df, BQ_TABLE_PFA, job_config=job_config)
        job.result()
        log.info(f"Tabla pfa creada con {len(df)} filas")
        return

    # 1. Subir chunk a tabla temporal
    job = bq_client.load_table_from_dataframe(df, tmp_tabla, job_config=job_config)
    job.result()

    # 2. MERGE: insertar solo shipping_groups que no existen en pfa
    cols = ", ".join(f"`{c}`" for c in df.columns)
    src_cols = ", ".join(f"src.`{c}`" for c in df.columns)
    merge_query = f"""
    MERGE `{BQ_TABLE_PFA}` AS tgt
    USING `{tmp_tabla}` AS src
    ON tgt.shipping_group = src.shipping_group
    WHEN NOT MATCHED THEN
        INSERT ({cols}) VALUES ({src_cols})
    """
    bq_client.query(merge_query).result()

    # 3. Borrar tabla temporal
    bq_client.delete_table(tmp_tabla, not_found_ok=True)
    log.info(f"MERGE pfa: {len(df)} filas procesadas")


def merge_falabella(df: pd.DataFrame):
    """MERGE en falabella con clave compuesta IDruta + Posicionamiento."""
    try:
        bq_client.get_table(BQ_TABLE_FALABELLA)
        tabla_existe = True
    except Exception:
        tabla_existe = False

    tmp_tabla = f"{BQ_TABLE_FALABELLA}_tmp"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )

    if not tabla_existe:
        job = bq_client.load_table_from_dataframe(df, BQ_TABLE_FALABELLA, job_config=job_config)
        job.result()
        log.info(f"Tabla falabella creada con {len(df)} filas")
        return

    job = bq_client.load_table_from_dataframe(df, tmp_tabla, job_config=job_config)
    job.result()

    cols     = ", ".join(f"`{c}`" for c in df.columns)
    src_cols = ", ".join(f"src.`{c}`" for c in df.columns)
    merge_query = f"""
    MERGE `{BQ_TABLE_FALABELLA}` AS tgt
    USING `{tmp_tabla}` AS src
    ON tgt.IDruta = src.IDruta AND tgt.Posicionruta = src.Posicionruta
    WHEN NOT MATCHED THEN
        INSERT ({cols}) VALUES ({src_cols})
    """
    bq_client.query(merge_query).result()
    bq_client.delete_table(tmp_tabla, not_found_ok=True)
    log.info(f"MERGE falabella: {len(df)} filas procesadas")


GEOSORT_COL_TYPES = {
    "ct":               "STRING",
    "semana":           "INT64",
    "anio":             "INT64",
    "fecha_inicio_ruta":"STRING",
    "patente":          "STRING",
    "id_ruta":          "STRING",
    "pendientes":       "INT64",
    "terminados":       "INT64",
    "hr_inicio":        "STRING",
    "primera_entrega":  "STRING",
    "ultima_entrega":   "STRING",
    "tiempo_total":     "STRING",
    "tiempo_promedio":  "STRING",
    "total":            "INT64",
    "fill_rate":        "STRING",
    "_cargado_en":      "TIMESTAMP",
}

GEOSORT_COL_MAP = {
    "CT":                        "ct",
    "Semana":                    "semana",
    "Año":                       "anio",
    "Fecha Inicio ruta":         "fecha_inicio_ruta",
    "Patente":                   "patente",
    "Id ruta":                   "id_ruta",
    "Pendientes":                "pendientes",
    "Terminados":                "terminados",
    "Hr. Inicio":                "hr_inicio",
    "Primera Entrega":           "primera_entrega",
    "HR. de la última entrega":  "ultima_entrega",
    "Tiempo Total Entrega":      "tiempo_total",
    "Tiempo Promedio Entrega":   "tiempo_promedio",
    "Total":                     "total",
    "Fill Rate":                 "fill_rate",
}


def merge_geosort(df: pd.DataFrame):
    """MERGE en geosort con clave id_ruta."""
    try:
        bq_client.get_table(BQ_TABLE_GEOSORT)
        tabla_existe = True
    except Exception:
        tabla_existe = False

    bq_schema = [
        bigquery.SchemaField(col, GEOSORT_COL_TYPES.get(col, "STRING"))
        for col in df.columns
    ]
    tmp_tabla = f"{BQ_TABLE_GEOSORT}_tmp"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        schema=bq_schema,
    )
    job = bq_client.load_table_from_dataframe(df, tmp_tabla, job_config=job_config)
    job.result()

    if not tabla_existe:
        bq_client.copy_table(tmp_tabla, BQ_TABLE_GEOSORT).result()
        bq_client.delete_table(tmp_tabla, not_found_ok=True)
        log.info(f"Tabla geosort creada con {len(df)} filas")
        return

    cols     = ", ".join(f"`{c}`" for c in df.columns)
    src_cols = ", ".join(f"src.`{c}`" for c in df.columns)
    upd_cols = ", ".join(f"tgt.`{c}` = src.`{c}`" for c in df.columns if c != "id_ruta")
    merge_query = f"""
    MERGE `{BQ_TABLE_GEOSORT}` AS tgt
    USING `{tmp_tabla}` AS src
    ON tgt.id_ruta = src.id_ruta
    WHEN MATCHED THEN
        UPDATE SET {upd_cols}
    WHEN NOT MATCHED THEN
        INSERT ({cols}) VALUES ({src_cols})
    """
    bq_client.query(merge_query).result()
    bq_client.delete_table(tmp_tabla, not_found_ok=True)
    log.info(f"MERGE geosort: {len(df)} filas procesadas")


INSTALEEP_COL_TYPES = {
    "job_id":           "STRING",
    "job_number":       "STRING",
    "created_at":       "TIMESTAMP",
    "updated_at":       "TIMESTAMP",
    "status":           "STRING",
    "partial_status":   "STRING",
    "finished_at":      "TIMESTAMP",
    "tienda":           "STRING",
    "destino_direccion":"STRING",
    "destino_ciudad":   "STRING",
    "destino_tipo":     "STRING",
    "destino_lat":      "FLOAT64",
    "destino_lng":      "FLOAT64",
    "cliente_nombre":   "STRING",
    "cliente_telefono": "STRING",
    "pago_status":      "STRING",
    "modelo_operativo": "STRING",
    "instaleap_url":    "STRING",
    "SKU_PENDING":      "INT64",
    "SKU_ADDED":        "INT64",
    "SKU_REMOVED":      "INT64",
    "SKU_AVANCE":       "FLOAT64",
    "picker_id":        "STRING",
    "ventana_horaria":  "STRING",
    "fecha":            "DATE",
    "tiempo_proceso":   "INT64",
    "SKU":              "INT64",
    "_cargado_en":      "TIMESTAMP",
}


def _preparar_instaleep_bq(df: pd.DataFrame) -> pd.DataFrame:
    """Convierte tipos del DataFrame para insertar en BigQuery instaleep."""
    df = df.copy()
    df["_cargado_en"] = datetime.now(timezone.utc)

    for col in ["created_at", "updated_at", "finished_at"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce", utc=True)

    if "fecha" in df.columns:
        df["fecha"] = pd.to_datetime(df["fecha"], dayfirst=True, errors="coerce").dt.date

    for col in ["destino_lat", "destino_lng"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in ["SKU_PENDING", "SKU_ADDED", "SKU_REMOVED", "tiempo_proceso", "SKU"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("float64")

    if "SKU_AVANCE" in df.columns:
        df["SKU_AVANCE"] = pd.to_numeric(df["SKU_AVANCE"], errors="coerce")

    if "cliente_telefono" in df.columns:
        df["cliente_telefono"] = df["cliente_telefono"].astype(str).replace("nan", "")

    str_cols = [c for c, t in INSTALEEP_COL_TYPES.items() if t == "STRING" and c in df.columns]
    NULL_VALS = ["", "N/A", "NA", "#N/A", "#NA", "null", "NULL", "None", "n/a", "-"]
    for col in str_cols:
        df[col] = df[col].astype(str).replace(NULL_VALS, None)

    return df


def merge_instaleep(df: pd.DataFrame):
    """MERGE en instaleep con clave job_id."""
    try:
        bq_client.get_table(BQ_TABLE_INSTALEEP)
        tabla_existe = True
    except Exception:
        tabla_existe = False

    bq_schema = [
        bigquery.SchemaField(col, INSTALEEP_COL_TYPES.get(col, "STRING"))
        for col in df.columns
        if col in INSTALEEP_COL_TYPES
    ]
    tmp_tabla = f"{BQ_TABLE_INSTALEEP}_tmp"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        schema=bq_schema,
    )
    job = bq_client.load_table_from_dataframe(df, tmp_tabla, job_config=job_config)
    job.result()

    if not tabla_existe:
        bq_client.copy_table(tmp_tabla, BQ_TABLE_INSTALEEP).result()
        bq_client.delete_table(tmp_tabla, not_found_ok=True)
        log.info(f"Tabla instaleep creada con {len(df)} filas")
        return

    cols     = ", ".join(f"`{c}`" for c in df.columns if c in INSTALEEP_COL_TYPES)
    src_cols = ", ".join(f"src.`{c}`" for c in df.columns if c in INSTALEEP_COL_TYPES)
    upd_cols = ", ".join(
        f"tgt.`{c}` = src.`{c}`"
        for c in df.columns
        if c in INSTALEEP_COL_TYPES and c != "job_id"
    )
    merge_query = f"""
    MERGE `{BQ_TABLE_INSTALEEP}` AS tgt
    USING `{tmp_tabla}` AS src
    ON tgt.job_id = src.job_id
    WHEN MATCHED THEN
        UPDATE SET {upd_cols}
    WHEN NOT MATCHED THEN
        INSERT ({cols}) VALUES ({src_cols})
    """
    bq_client.query(merge_query).result()
    bq_client.delete_table(tmp_tabla, not_found_ok=True)
    log.info(f"MERGE instaleep: {len(df)} filas procesadas")


def consultar_bigquery(tabla: str, col_fecha: str = None, desde: str = None,
                       hasta: str = None, limit: int = None,
                       local: str = None, order_by: str = None,
                       shipping_group: str = None, rut_persona: str = None,
                       tipo_servicio: str = None) -> dict:
    """Lee datos de BigQuery filtrados por rango de fecha.
    Devuelve { total, rows }. Sin rango devuelve todos los registros."""
    condiciones = []
    params = {}

    # OPTIMIZACIÓN DE COSTOS: Prevenir Full Table Scans si el frontend no envía fechas.
    # Forzamos por defecto la búsqueda a los últimos 30 días.
    if col_fecha and not desde and not hasta and not shipping_group and not rut_persona and not tipo_servicio:
        desde = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")

    if col_fecha:
        if desde:
            condiciones.append(f"DATE({col_fecha}) >= @desde")
            params["desde"] = desde
        if hasta:
            condiciones.append(f"DATE({col_fecha}) <= @hasta")
            params["hasta"] = hasta

    if local:
        condiciones.append("local = @local")
        params["local"] = local

    if shipping_group:
        condiciones.append("LOWER(shipping_group) LIKE LOWER(@shipping_group)")
        params["shipping_group"] = f"%{shipping_group}%"

    if rut_persona:
        condiciones.append("LOWER(rut_persona) LIKE LOWER(@rut_persona)")
        params["rut_persona"] = f"%{rut_persona}%"

    if tipo_servicio:
        condiciones.append("LOWER(tipo_servicio) LIKE LOWER(@tipo_servicio)")
        params["tipo_servicio"] = f"%{tipo_servicio}%"

    where     = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""
    order_col = order_by or col_fecha or "_cargado_en"

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter(k, "STRING", v)
            for k, v in params.items()
        ]
    )

    # Total count
    count_row = bq_client.query(
        f"SELECT COUNT(*) AS n FROM `{tabla}` {where}", job_config=job_config
    ).result()
    total = next(iter(count_row))["n"]

    # Filas (con o sin limit)
    limit_sql  = f"LIMIT {limit}" if limit else ""
    order_sql  = order_by if order_by else f"{order_col} DESC"
    query      = f"SELECT * FROM `{tabla}` {where} ORDER BY {order_sql} {limit_sql}"
    rows      = bq_client.query(query, job_config=job_config).result()

    datos = []
    for row in rows:
        d = dict(row)
        for k, v in d.items():
            if v is None:
                d[k] = ""
            elif hasattr(v, "isoformat"):
                d[k] = v.strftime("%Y-%m-%d %H:%M:%S")
            else:
                d[k] = v
        datos.append(d)

    return {"total": total, "rows": datos}


# ── Historial de cargas ───────────────────────────────────────────────────────
def _init_tabla_cargas():
    bq_client.query(f"""
        CREATE TABLE IF NOT EXISTS `{BQ_TABLE_CARGAS}` (
            tipo       STRING,
            archivo    STRING,
            filas      INT64,
            cargado_en TIMESTAMP
        )
    """).result()

def registrar_carga(tipo: str, archivo: str, filas: int):
    try:
        _init_tabla_cargas()
        tabla   = bq_client.get_table(BQ_TABLE_CARGAS)
        errores = bq_client.insert_rows_json(tabla, [{
            "tipo":       tipo,
            "archivo":    archivo,
            "filas":      filas,
            "cargado_en": datetime.now(timezone.utc).isoformat(),
        }])
        if errores:
            log.warning(f"Error registrando carga: {errores}")
        else:
            log.info(f"Carga registrada: {tipo} · {archivo} · {filas} filas")
    except Exception as e:
        log.warning(f"No se pudo registrar carga: {e}")


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/")
def health():
    return {"status": "ok", "version": "5.0.0-cloud"}


class JsonUpload(BaseModel):
    filename: str
    rows: list[dict]


@app.post("/procesar-json/{tipo}")
async def procesar_json(tipo: str, body: JsonUpload):
    """Recibe datos ya parseados como JSON desde el frontend."""
    if tipo not in ("beetrak", "pfa", "pfa_delivery", "falabella"):
        raise HTTPException(400, "tipo debe ser 'beetrak', 'pfa', 'pfa_delivery' o 'falabella'")

    log.info(f"Procesando {tipo} (JSON): {body.filename} — {len(body.rows)} filas")

    try:
        df_raw = pd.DataFrame(body.rows)
        df_raw = df_raw.dropna(how="all").reset_index(drop=True)

        if tipo == "beetrak":
            columnas_bt = get_columnas_beetrak()
            locales_bt  = get_local_prefijos()
            df_clean = limpiar_beetrak(df_raw, columnas_bt, locales_bt)
            df_bq = df_clean.copy()
            for col in ["fecha_estimada", "fecha_llegada", "fecha_ruta", "fecha_creacion",
                        "fecha_primer_intento", "inicio_ruta", "fin_ruta", "fecha_picking",
                        "tiempo_min_entrega", "tiempo_max_entrega", "_cargado_en"]:
                if col in df_bq.columns:
                    df_bq[col] = pd.to_datetime(df_bq[col], errors="coerce")
            if "intentos" in df_bq.columns:
                df_bq["intentos"] = pd.to_numeric(df_bq["intentos"], errors="coerce").astype("Int64")
            for col in ["latitud", "longitud"]:
                if col in df_bq.columns:
                    df_bq[col] = pd.to_numeric(df_bq[col], errors="coerce")
            merge_beetrak(df_bq)
            registrar_carga("beetrak", body.filename, len(df_bq))
            return JSONResponse({
                "ok": True, "tipo": "beetrak",
                "archivo_original": body.filename, "archivo_limpio": "bigquery:beetrak",
                "filas_originales": len(df_raw), "filas_limpias": len(df_bq),
                "columnas_eliminadas": len(df_raw.columns) - len(df_bq.columns),
                "stats": calcular_stats_beetrak(df_clean),
            })
        elif tipo == "pfa":
            df_finanzas, df_limpia = limpiar_pfa(df_raw)

            # Guardar TODAS las columnas en pfa_finanzas
            insertar_finanzas_bigquery(_preparar_finanzas_bq(df_finanzas))

            # Guardar versión limpia (deduplicada) en pfa
            bq_cols_limp = ["shipping_group", "nro_local", "fecha_control",
                            "tipo_servicio", "rol_persona", "rut_persona",
                            "fecha_compromiso", "ventana", "inicio_picking",
                            "fin_picking", "unidades_solicitadas", "unidades_pickeadas",
                            "unidades_sustituidas", "items_solicitados", "items_a_pagar"]
            df_bq = df_limpia[[c for c in bq_cols_limp if c in df_limpia.columns]].copy()
            if "inicio_picking" in df_bq.columns and "fin_picking" in df_bq.columns:
                t0 = pd.to_datetime(df_bq["inicio_picking"], errors="coerce")
                t1 = pd.to_datetime(df_bq["fin_picking"], errors="coerce")
                df_bq["minutos_picking"] = (t1 - t0).dt.total_seconds() / 60
            for col in ["fecha_control", "fecha_compromiso", "inicio_picking", "fin_picking"]:
                if col in df_bq.columns:
                    df_bq[col] = pd.to_datetime(df_bq[col], errors="coerce", utc=True)
            for col in ["unidades_solicitadas", "unidades_pickeadas",
                        "unidades_sustituidas", "items_solicitados", "items_a_pagar"]:
                if col in df_bq.columns:
                    df_bq[col] = pd.to_numeric(df_bq[col], errors="coerce").round(0).astype("Int64")
            merge_pfa_limpia(df_bq)
            registrar_carga("pfa", body.filename, len(df_finanzas))
            return JSONResponse({
                "ok": True, "tipo": "pfa",
                "archivo_original": body.filename,
                "archivo_finanzas": "bigquery:pfa_finanzas",
                "archivo_limpio": "bigquery:pfa",
                "filas_originales": len(df_raw), "filas_finanzas": len(df_finanzas),
                "filas_limpias": len(df_limpia),
                "duplicados_eliminados": len(df_finanzas) - len(df_limpia),
                "columnas_eliminadas": len(df_raw.columns) - len(df_limpia.columns),
                "stats": calcular_stats_pfa(df_limpia),
            })
        elif tipo == "pfa_delivery":
            df_bq = _preparar_delivery_bq(df_raw)
            merge_pfa_delivery(df_bq)
            registrar_carga("pfa_delivery", body.filename, len(df_bq))
            return JSONResponse({
                "ok": True, "tipo": "pfa_delivery",
                "archivo_original": body.filename,
                "archivo_destino": "bigquery:pfa_delivery",
                "filas_insertadas": len(df_bq),
            })
        else:  # falabella
            df_bq = df_raw.drop(columns=[c for c in COLS_DROP_FALABELLA if c in df_raw.columns])
            df_bq = df_bq.replace(["", "N/A", "NA", "#N/A", "#NA", "null", "NULL", "None", "n/a", "-"], None)
            if "Fechainicioruta" in df_bq.columns:
                df_bq["Fechainicioruta"] = pd.to_datetime(df_bq["Fechainicioruta"], errors="coerce", utc=True)
            if "Posicionruta" in df_bq.columns:
                df_bq["Posicionruta"] = pd.to_numeric(df_bq["Posicionruta"], errors="coerce").astype("Int64")
            for col in df_bq.select_dtypes(include="object").columns:
                df_bq[col] = df_bq[col].astype(str).where(df_bq[col].notna(), None)
            merge_falabella(df_bq)
            registrar_carga("falabella", body.filename, len(df_bq))
            return JSONResponse({
                "ok": True, "tipo": "falabella",
                "archivo_original": body.filename,
                "archivo_destino": "bigquery:falabella",
                "filas_originales": len(df_raw), "filas_limpias": len(df_bq),
                "columnas_eliminadas": len(df_raw.columns) - len(df_bq.columns),
            })
    except Exception as e:
        log.error(f"Error: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@app.post("/procesar/{tipo}")
async def procesar(tipo: str, archivo: UploadFile = File(...)):
    if tipo not in ("beetrak", "pfa", "falabella"):
        raise HTTPException(400, "tipo debe ser 'beetrak', 'pfa' o 'falabella'")

    extension = archivo.filename.rsplit(".", 1)[-1].lower()
    if extension not in ("xlsx", "xls", "csv"):
        raise HTTPException(400, f"Formato no soportado: {extension}")

    log.info(f"Procesando {tipo}: {archivo.filename}")
    contenido = await archivo.read()

    try:
        df_raw = leer_archivo(contenido, extension, tipo)

        if tipo == "beetrak":
            columnas_bt = get_columnas_beetrak()
            locales_bt  = get_local_prefijos()
            df_clean = limpiar_beetrak(df_raw, columnas_bt, locales_bt)
            df_bq = df_clean.copy()

            for col in ["fecha_estimada", "fecha_llegada", "fecha_ruta", "fecha_creacion",
                        "fecha_primer_intento", "inicio_ruta", "fin_ruta", "fecha_picking",
                        "tiempo_min_entrega", "tiempo_max_entrega", "_cargado_en"]:
                if col in df_bq.columns:
                    df_bq[col] = pd.to_datetime(df_bq[col], errors="coerce")
            if "intentos" in df_bq.columns:
                df_bq["intentos"] = pd.to_numeric(df_bq["intentos"], errors="coerce").astype("Int64")
            for col in ["latitud", "longitud"]:
                if col in df_bq.columns:
                    df_bq[col] = pd.to_numeric(df_bq[col], errors="coerce")

            merge_beetrak(df_bq)

            return JSONResponse({
                "ok": True,
                "tipo": "beetrak",
                "archivo_original":    archivo.filename,
                "archivo_limpio":      "bigquery:beetrak",
                "filas_originales":    len(df_raw),
                "filas_limpias":       len(df_bq),
                "columnas_eliminadas": len(df_raw.columns) - len(df_bq.columns),
                "stats": calcular_stats_beetrak(df_clean),
            })

        elif tipo == "pfa":
            df_finanzas, df_limpia = limpiar_pfa(df_raw)

            # Guardar TODAS las columnas en pfa_finanzas
            insertar_finanzas_bigquery(_preparar_finanzas_bq(df_finanzas))

            # Guardar versión limpia (deduplicada) en pfa
            bq_cols_limp = ["shipping_group", "nro_local", "fecha_control",
                            "tipo_servicio", "rol_persona", "rut_persona",
                            "fecha_compromiso", "ventana", "inicio_picking",
                            "fin_picking", "unidades_solicitadas", "unidades_pickeadas",
                            "unidades_sustituidas", "items_solicitados", "items_a_pagar"]
            df_bq = df_limpia[[c for c in bq_cols_limp if c in df_limpia.columns]].copy()
            if "inicio_picking" in df_bq.columns and "fin_picking" in df_bq.columns:
                t0 = pd.to_datetime(df_bq["inicio_picking"], errors="coerce")
                t1 = pd.to_datetime(df_bq["fin_picking"], errors="coerce")
                df_bq["minutos_picking"] = (t1 - t0).dt.total_seconds() / 60
            for col in ["fecha_control", "fecha_compromiso", "inicio_picking", "fin_picking"]:
                if col in df_bq.columns:
                    df_bq[col] = pd.to_datetime(df_bq[col], errors="coerce", utc=True)
            for col in ["unidades_solicitadas", "unidades_pickeadas",
                        "unidades_sustituidas", "items_solicitados", "items_a_pagar"]:
                if col in df_bq.columns:
                    df_bq[col] = pd.to_numeric(df_bq[col], errors="coerce").round(0).astype("Int64")
            merge_pfa_limpia(df_bq)

            return JSONResponse({
                "ok": True,
                "tipo": "pfa",
                "archivo_original":      archivo.filename,
                "archivo_finanzas":      "bigquery:pfa_finanzas",
                "archivo_limpio":        "bigquery:pfa",
                "filas_originales":      len(df_raw),
                "filas_finanzas":        len(df_finanzas),
                "filas_limpias":         len(df_limpia),
                "duplicados_eliminados": len(df_finanzas) - len(df_limpia),
                "columnas_eliminadas":   len(df_raw.columns) - len(df_limpia.columns),
                "stats": calcular_stats_pfa(df_limpia),
            })

        else:  # falabella
            df_bq = df_raw.drop(columns=[c for c in COLS_DROP_FALABELLA if c in df_raw.columns])
            df_bq = df_bq.replace(["", "N/A", "NA", "#N/A", "#NA", "null", "NULL", "None", "n/a", "-"], None)
            if "Fechainicioruta" in df_bq.columns:
                df_bq["Fechainicioruta"] = pd.to_datetime(df_bq["Fechainicioruta"], errors="coerce", utc=True)
            if "Posicionruta" in df_bq.columns:
                df_bq["Posicionruta"] = pd.to_numeric(df_bq["Posicionruta"], errors="coerce").astype("Int64")
            for col in df_bq.select_dtypes(include="object").columns:
                df_bq[col] = df_bq[col].astype(str).where(df_bq[col].notna(), None)
            merge_falabella(df_bq)
            registrar_carga("falabella", archivo.filename, len(df_bq))
            return JSONResponse({
                "ok": True, "tipo": "falabella",
                "archivo_original":    archivo.filename,
                "archivo_destino":     "bigquery:falabella",
                "filas_originales":    len(df_raw),
                "filas_limpias":       len(df_bq),
                "columnas_eliminadas": len(df_raw.columns) - len(df_bq.columns),
            })

    except Exception as e:
        log.error(f"Error: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@app.post("/join")
async def join_preview():
    """JOIN beetrak ↔ pfa directamente en BigQuery."""
    query = f"""
    WITH bt AS (SELECT orden, COUNT(*) AS n FROM `{BQ_TABLE_BEETRAK}` WHERE fecha_ruta >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) GROUP BY 1),
         pf AS (SELECT shipping_group, COUNT(*) AS n FROM `{BQ_TABLE_PFA}` WHERE fecha_control >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) GROUP BY 1)
    SELECT
      (SELECT SUM(n) FROM bt) AS filas_beetrak,
      (SELECT SUM(n) FROM pf) AS filas_pfa,
      COUNT(*) AS filas_con_match
    FROM bt
    INNER JOIN pf ON bt.orden = pf.shipping_group
    """
    result = bq_client.query(query).to_dataframe()
    row = result.iloc[0]
    filas_bt  = int(row["filas_beetrak"]) if pd.notna(row["filas_beetrak"]) else 0
    filas_pfa = int(row["filas_pfa"]) if pd.notna(row["filas_pfa"]) else 0
    match     = int(row["filas_con_match"]) if pd.notna(row["filas_con_match"]) else 0
    pct       = round(match / max(filas_pfa, 1) * 100, 1)

    return {
        "filas_beetrak":   filas_bt,
        "filas_pfa":       filas_pfa,
        "filas_con_match": match,
        "pct_match":       pct,
    }


@app.get("/locales/beetrak")
def get_locales_beetrak():
    """Devuelve los locales únicos de beetrak para el filtro del frontend."""
    try:
        rows = bq_client.query(
            f"SELECT DISTINCT local FROM `{BQ_TABLE_BEETRAK}` WHERE local IS NOT NULL ORDER BY local"
        ).result()
        return [row["local"] for row in rows]
    except Exception:
        return []


@app.get("/datos/{tipo}")
def get_datos(tipo: str, desde: str = None, hasta: str = None,
              limit: int = None, local: str = None,
              shipping_group: str = None, rut_persona: str = None,
              tipo_servicio: str = None):
    """Lee datos desde BigQuery, filtrados opcionalmente por fecha.
    Devuelve JSON comprimido con gzip para evitar límite de 32MB de Cloud Run."""
    tablas = {
        "pfa_finanzas": (BQ_TABLE_PFA_FINANZAS, "inicio_picking"),
        "pfa_limpia":   (BQ_TABLE_PFA,          "inicio_picking"),
        "beetrak":      (BQ_TABLE_BEETRAK,       "fecha_picking"),
        "falabella":    (BQ_TABLE_FALABELLA,     "Fechainicioruta"),
        "geosort":      (BQ_TABLE_GEOSORT,       "fecha_inicio_ruta"),
        "instaleep":    (BQ_TABLE_INSTALEEP,     "fecha"),
    }
    cfg = tablas.get(tipo)
    if not cfg:
        raise HTTPException(400, f"tipo '{tipo}' no válido. Opciones: {list(tablas)}")
    tabla, col_fecha = cfg
    order_by = "IDruta ASC, Posicionruta ASC" if tipo == "falabella" else None
    try:
        datos = consultar_bigquery(tabla, col_fecha=col_fecha, desde=desde, hasta=hasta,
                                   limit=limit, local=local, order_by=order_by,
                                   shipping_group=shipping_group, rut_persona=rut_persona,
                                   tipo_servicio=tipo_servicio)
        # Comprimir manualmente para respuestas grandes
        json_bytes = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        compressed = gzip.compress(json_bytes)
        return Response(
            content=compressed,
            media_type="application/json",
            headers={
                "Content-Encoding": "gzip",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except Exception as e:
        log.error(f"Error consultando BigQuery: {e}", exc_info=True)
        raise HTTPException(500, f"Error consultando datos: {e}")


@app.get("/debug-pfa")
def debug_pfa():
    """Diagnóstico: muestra sample de fecha_control en PFA."""
    query = f"""
    SELECT fecha_control, COUNT(*) as filas
    FROM `{BQ_TABLE_PFA}`
    GROUP BY fecha_control
    ORDER BY filas DESC
    LIMIT 20
    """
    rows = bq_client.query(query).result()
    return [dict(row) for row in rows]


@app.get("/estado-instaleep")
def estado_instaleep():
    """Devuelve si ya se cargaron datos Instaleep hoy (desde el job automático)."""
    try:
        _init_tabla_cargas()
        rows = bq_client.query(f"""
            SELECT COUNT(*) AS n
            FROM `{BQ_TABLE_CARGAS}`
            WHERE tipo = 'instaleep'
              AND DATE(cargado_en) = CURRENT_DATE()
        """).result()
        ya_cargado = next(iter(rows))["n"] > 0
        return {"ya_cargado": ya_cargado}
    except Exception:
        return {"ya_cargado": False}


@app.get("/historial/instaleep")
def historial_instaleep():
    """Devuelve el registro de cargas de tipo instaleep (hasta 200 entradas)."""
    try:
        _init_tabla_cargas()
        rows = bq_client.query(f"""
            SELECT tipo, archivo, filas, cargado_en
            FROM `{BQ_TABLE_CARGAS}`
            WHERE tipo = 'instaleep'
            ORDER BY cargado_en DESC
            LIMIT 200
        """).result()
        return [
            {
                "tipo":       row["tipo"],
                "archivo":    row["archivo"] or "",
                "filas":      int(row["filas"]) if row["filas"] else 0,
                "cargado_en": row["cargado_en"].astimezone(CHILE_TZ).strftime("%Y-%m-%d %H:%M:%S") if row["cargado_en"] else "",
            }
            for row in rows
        ]
    except Exception as e:
        log.warning(f"Historial instaleep no disponible: {e}")
        return []


@app.get("/kpi/instaleep")
def kpi_instaleep(desde: str = None, hasta: str = None):
    """KPIs agregados de la tabla instaleep para el rango de fechas indicado."""
    _desde = desde or (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    _hasta = hasta or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    params = [
        bigquery.ScalarQueryParameter("desde", "DATE", _desde),
        bigquery.ScalarQueryParameter("hasta",  "DATE", _hasta),
    ]
    job_config = bigquery.QueryJobConfig(query_parameters=params)

    def run(q):
        return list(bq_client.query(q, job_config=job_config).result())

    try:
        resumen_rows = run(f"""
            SELECT
                COUNT(*)                                                AS total,
                COUNTIF(status = 'FINISHED')                            AS finished,
                COUNTIF(status = 'CANCELLED')                           AS cancelled,
                ROUND(AVG(CAST(tiempo_proceso AS FLOAT64)), 1)          AS avg_tiempo_proceso,
                ROUND(AVG(CAST(SKU AS FLOAT64)), 1)                     AS avg_basket,
                ROUND(
                    SAFE_DIVIDE(
                        SUM(CAST(SKU_REMOVED AS FLOAT64)),
                        SUM(CAST(SKU AS FLOAT64))
                    ) * 100, 1
                )                                                       AS stockout_rate,
                COUNTIF(pago_status = 'SUCCEEDED')                      AS pago_succeeded,
                COUNTIF(pago_status = 'FAILED')                         AS pago_failed
            FROM `{BQ_TABLE_INSTALEEP}`
            WHERE fecha >= @desde AND fecha <= @hasta
        """)
        r = dict(resumen_rows[0]) if resumen_rows else {}
        total    = int(r.get("total", 0))
        finished = int(r.get("finished", 0))
        pago_ok  = int(r.get("pago_succeeded", 0))
        pago_fail= int(r.get("pago_failed", 0))
        pago_tot = pago_ok + pago_fail
        resumen = {
            "total":                total,
            "finished":             finished,
            "cancelled":            int(r.get("cancelled", 0)),
            "completion_rate":      round(finished / total * 100, 1) if total else 0,
            "avg_tiempo_proceso":   float(r.get("avg_tiempo_proceso") or 0),
            "avg_basket":           float(r.get("avg_basket") or 0),
            "stockout_rate":        float(r.get("stockout_rate") or 0),
            "pago_succeeded":       pago_ok,
            "pago_failed":          pago_fail,
            "payment_success_rate": round(pago_ok / pago_tot * 100, 1) if pago_tot else 0,
        }

        top_tiendas_rows = run(f"""
            SELECT
                tienda,
                COUNT(*)                     AS pedidos,
                COUNTIF(status = 'FINISHED') AS finished
            FROM `{BQ_TABLE_INSTALEEP}`
            WHERE fecha >= @desde AND fecha <= @hasta
              AND tienda IS NOT NULL
            GROUP BY tienda
            ORDER BY pedidos DESC
            LIMIT 10
        """)
        top_tiendas = [
            {"tienda": row["tienda"], "pedidos": int(row["pedidos"]), "finished": int(row["finished"])}
            for row in top_tiendas_rows
        ]

        top_pickers_rows = run(f"""
            SELECT
                picker_id,
                COUNT(*)                            AS pedidos,
                COUNTIF(status = 'FINISHED')        AS finished,
                ROUND(AVG(CAST(SKU AS FLOAT64)), 1) AS avg_sku
            FROM `{BQ_TABLE_INSTALEEP}`
            WHERE fecha >= @desde AND fecha <= @hasta
              AND picker_id IS NOT NULL
            GROUP BY picker_id
            ORDER BY pedidos DESC
            LIMIT 10
        """)
        top_pickers = [
            {
                "picker_id": row["picker_id"],
                "pedidos":   int(row["pedidos"]),
                "finished":  int(row["finished"]),
                "avg_sku":   float(row["avg_sku"] or 0),
            }
            for row in top_pickers_rows
        ]

        por_fecha_rows = run(f"""
            SELECT
                CAST(fecha AS STRING)        AS fecha,
                COUNT(*)                     AS total,
                COUNTIF(status = 'FINISHED') AS finished
            FROM `{BQ_TABLE_INSTALEEP}`
            WHERE fecha >= @desde AND fecha <= @hasta
            GROUP BY fecha
            ORDER BY fecha
        """)
        por_fecha = [
            {"fecha": row["fecha"], "total": int(row["total"]), "finished": int(row["finished"])}
            for row in por_fecha_rows
        ]

        return {
            "resumen":     resumen,
            "top_tiendas": top_tiendas,
            "top_pickers": top_pickers,
            "por_fecha":   por_fecha,
            "rango":       {"desde": _desde, "hasta": _hasta},
        }

    except Exception as e:
        log.error(f"KPI instaleep error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/historial/falabella")
def historial_falabella():
    """Devuelve el registro de cargas de tipo falabella (hasta 500 entradas)."""
    try:
        _init_tabla_cargas()
        rows = bq_client.query(f"""
            SELECT tipo, archivo, filas, cargado_en
            FROM `{BQ_TABLE_CARGAS}`
            WHERE tipo = 'falabella'
            ORDER BY cargado_en DESC
            LIMIT 500
        """).result()
        return [
            {
                "tipo":       row["tipo"],
                "archivo":    row["archivo"] or "",
                "filas":      int(row["filas"]) if row["filas"] else 0,
                "cargado_en": row["cargado_en"].astimezone(CHILE_TZ).strftime("%Y-%m-%d %H:%M:%S") if row["cargado_en"] else "",
            }
            for row in rows
        ]
    except Exception as e:
        log.warning(f"Historial falabella no disponible: {e}")
        return []


@app.get("/historial")
def historial():
    """Devuelve el registro individual de cada carga."""
    try:
        _init_tabla_cargas()
        rows = bq_client.query(f"""
            SELECT tipo, archivo, filas, cargado_en
            FROM `{BQ_TABLE_CARGAS}`
            ORDER BY cargado_en DESC
            LIMIT 200
        """).result()
        return [
            {
                "tipo":       row["tipo"],
                "archivo":    row["archivo"] or "",
                "filas":      int(row["filas"]) if row["filas"] else 0,
                "cargado_en": row["cargado_en"].astimezone(CHILE_TZ).strftime("%Y-%m-%d %H:%M:%S") if row["cargado_en"] else "",
            }
            for row in rows
        ]
    except Exception as e:
        log.warning(f"Historial no disponible: {e}")
        return []


# ── Geosort KPI ──────────────────────────────────────────────────────────────
_CT_BLACKLIST_RE = r"tienda|fby|falabella"
_CT_BLACKLIST_SQL = f"NOT REGEXP_CONTAINS(LOWER(IFNULL(ct,'')), r'{_CT_BLACKLIST_RE}')"

@app.get("/kpi/geosort")
def kpi_geosort(anio: int = None, semana: str = None, ct: str = None):
    """Devuelve KPIs y datos agregados de la tabla geosort para gráficos."""
    query_params = []
    condiciones  = [_CT_BLACKLIST_SQL]

    if anio:
        condiciones.append("anio = @anio")
        query_params.append(bigquery.ScalarQueryParameter("anio", "INT64", anio))

    semana_list = [int(s) for s in semana.split(",") if s.strip().isdigit()] if semana else []
    if semana_list:
        condiciones.append("semana IN UNNEST(@semanas)")
        query_params.append(bigquery.ArrayQueryParameter("semanas", "INT64", semana_list))

    ct_list = [s.strip() for s in ct.split(",") if s.strip()] if ct else []
    if ct_list:
        condiciones.append("ct IN UNNEST(@cts_filter)")
        query_params.append(bigquery.ArrayQueryParameter("cts_filter", "STRING", ct_list))

    where      = f"WHERE {' AND '.join(condiciones)}"
    job_config = bigquery.QueryJobConfig(query_parameters=query_params)
    def run(q): return list(bq_client.query(q, job_config=job_config).result())
    def run_nofilter(q): return list(bq_client.query(q).result())

    try:
        # ── Resumen ────────────────────────────────────────────────────────
        resumen_row = run(f"""
            SELECT
                COUNT(DISTINCT id_ruta)  AS rutas,
                COUNT(DISTINCT patente)  AS moviles,
                SUM(terminados)          AS entregas,
                SUM(pendientes)          AS pendientes,
                AVG(SAFE_CAST(REPLACE(fill_rate, '%', '') AS FLOAT64)) AS fill_rate
            FROM `{BQ_TABLE_GEOSORT}` {where}
        """)[0]

        # ── Por CT ─────────────────────────────────────────────────────────
        por_ct = run(f"""
            SELECT ct,
                COUNT(DISTINCT id_ruta) AS rutas,
                COUNT(DISTINCT patente) AS moviles
            FROM `{BQ_TABLE_GEOSORT}` {where}
            GROUP BY ct ORDER BY rutas DESC
        """)

        # ── Por Semana ─────────────────────────────────────────────────────
        por_semana = run(f"""
            SELECT semana, anio,
                COUNT(DISTINCT id_ruta) AS rutas,
                AVG(SAFE_CAST(REPLACE(fill_rate, '%', '') AS FLOAT64)) AS fill_rate
            FROM `{BQ_TABLE_GEOSORT}` {where}
            GROUP BY semana, anio ORDER BY anio, semana
        """)

        # ── Filtros disponibles ────────────────────────────────────────────
        anios   = [r["anio"]   for r in run_nofilter(f"SELECT DISTINCT anio FROM `{BQ_TABLE_GEOSORT}` WHERE anio IS NOT NULL ORDER BY anio DESC")]
        cts     = [r["ct"]     for r in run_nofilter(f"SELECT DISTINCT ct FROM `{BQ_TABLE_GEOSORT}` WHERE ct IS NOT NULL AND {_CT_BLACKLIST_SQL} ORDER BY ct")]
        semanas = [r["semana"] for r in run(f"SELECT DISTINCT semana FROM `{BQ_TABLE_GEOSORT}` {where} AND semana IS NOT NULL ORDER BY semana")]

        return {
            "resumen": {
                "rutas":      int(resumen_row["rutas"]     or 0),
                "moviles":    int(resumen_row["moviles"]   or 0),
                "entregas":   int(resumen_row["entregas"]  or 0),
                "pendientes": int(resumen_row["pendientes"] or 0),
                "fill_rate":  round(float(resumen_row["fill_rate"] or 0), 1),
            },
            "por_ct": [
                {"ct": r["ct"], "rutas": int(r["rutas"]), "moviles": int(r["moviles"])}
                for r in por_ct
            ],
            "por_semana": [
                {"semana": int(r["semana"]), "rutas": int(r["rutas"]),
                 "fill_rate": round(float(r["fill_rate"] or 0), 1)}
                for r in por_semana
                if r["semana"] is not None
            ],
            "filtros": {"anios": anios, "semanas": semanas, "cts": cts},
        }
    except Exception as e:
        log.error(f"Error KPI geosort: {e}", exc_info=True)
        raise HTTPException(500, str(e))


# ── Geosort (GCS → BigQuery) ─────────────────────────────────────────────────
@app.get("/estado-geosort")
def estado_geosort():
    """Devuelve si ya se cargaron datos Geosort hoy (lunes)."""
    try:
        _init_tabla_cargas()
        rows = bq_client.query(f"""
            SELECT COUNT(*) AS n
            FROM `{BQ_TABLE_CARGAS}`
            WHERE tipo = 'geosort'
              AND DATE(cargado_en) = CURRENT_DATE()
        """).result()
        ya_cargado = next(iter(rows))["n"] > 0
        return {"ya_cargado": ya_cargado}
    except Exception:
        return {"ya_cargado": False}


def _leer_geosort_csv(contenido: bytes) -> pd.DataFrame:
    """Lee CSVs de Geosort extrayendo solo las columnas necesarias por posición."""
    import re

    # Manejar BOM y distintas codificaciones
    text = contenido.decode("utf-8-sig", errors="replace")
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    if not lines:
        return pd.DataFrame()

    COLS_NEEDED = {
        2:  "Estado",
        3:  "Patente",
        5:  "Idruta",
        7:  "Ct",
        12: "Horainicio",
        14: "Fechainicioruta",
        16: "Fechaentregareal",
    }

    def extraer_campos(line: str) -> list:
        """Extrae los campos brutos de una línea, manejando los dos formatos."""
        if line.startswith('"') and ";" in line:
            inner = line[1:]
            inner = re.sub(r'[",\s]*$', '', inner)
            inner = re.sub(r'"{3,}([^";]*?)"{3,}', r'\1', inner)
            inner = re.sub(r'"{2,}', '', inner)
        else:
            inner = line.rstrip(',').rstrip('"')
        return inner.split(';')

    rows = []
    for line in lines[1:]:  # saltar header
        fields = extraer_campos(line)
        row = {}
        for pos, nombre in COLS_NEEDED.items():
            row[nombre] = fields[pos].strip() if pos < len(fields) else ""
        rows.append(row)

    df = pd.DataFrame(rows)
    log.info(f"[geosort] parsed {len(df)} rows. Sample Estado={df['Estado'].value_counts().to_dict() if len(df) else {}}")
    log.info(f"[geosort] Sample Fechainicioruta: {df['Fechainicioruta'].iloc[:3].tolist() if len(df) else []}")
    return df


def _agregar_geosort_raw(df: pd.DataFrame) -> pd.DataFrame:
    """Agrega un CSV RAW de Geosort (nivel orden) a nivel de ruta."""
    df = df.rename(columns={
        "Idruta":          "id_ruta",
        "Ct":              "ct",
        "Patente":         "patente",
        "Estado":          "estado",
        "Fechainicioruta": "fecha_inicio_raw",
        "Horainicio":      "hr_inicio",
        "Fechaentregareal":"fecha_entrega_real",
    })

    def parse_fecha(serie):
        for fmt in ("%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M", "%d-%m-%Y %H:%M"):
            try:
                parsed = pd.to_datetime(serie, format=fmt, errors="coerce")
                if parsed.notna().any():
                    return parsed
            except Exception:
                pass
        return pd.to_datetime(serie, dayfirst=True, errors="coerce")

    df["fecha_inicio_dt"] = parse_fecha(df["fecha_inicio_raw"])
    df["entrega_dt"]      = parse_fecha(df["fecha_entrega_real"].replace({"-": None, "": None}))
    df["es_terminado"]    = df["estado"].str.strip().str.lower() == "terminado"
    df["id_ruta"]         = df["id_ruta"].str.strip().astype(str)

    # Descartar filas donde id_ruta no parece un ID real (solo números)
    df = df[df["id_ruta"].str.match(r'^\d+$')]

    filas = []
    for id_ruta, g in df.groupby("id_ruta"):
        terminados   = int(g["es_terminado"].sum())
        total        = len(g)
        pendientes   = total - terminados
        fill_rate    = f"{terminados / total * 100:.1f}%" if total > 0 else "0%"

        entregas     = g["entrega_dt"].dropna()
        primera      = entregas.min().strftime("%d/%m/%Y %H:%M") if len(entregas) else "-"
        ultima       = entregas.max().strftime("%d/%m/%Y %H:%M") if len(entregas) else "-"

        fecha_inicio = g["fecha_inicio_dt"].dropna().min()
        if pd.notna(fecha_inicio) and len(entregas):
            mins_total   = int((entregas.max() - fecha_inicio).total_seconds() / 60)
            tiempo_total = f"{mins_total // 60:02d}:{mins_total % 60:02d}"
            mins_prom    = mins_total // terminados if terminados else mins_total
            tiempo_prom  = f"{mins_prom // 60:02d}:{mins_prom % 60:02d}"
        else:
            tiempo_total = "-"
            tiempo_prom  = "-"

        fecha_str = fecha_inicio.strftime("%d/%m/%Y %H:%M") if pd.notna(fecha_inicio) else ""
        filas.append({
            "ct":               str(g["ct"].iloc[0]).strip(),
            "semana":           int(fecha_inicio.isocalendar()[1]) if pd.notna(fecha_inicio) else None,
            "anio":             int(fecha_inicio.year)             if pd.notna(fecha_inicio) else None,
            "fecha_inicio_ruta":fecha_str,
            "patente":          str(g["patente"].iloc[0]).strip(),
            "id_ruta":          id_ruta,
            "pendientes":       pendientes,
            "terminados":       terminados,
            "hr_inicio":        str(g["hr_inicio"].iloc[0]).strip(),
            "primera_entrega":  primera,
            "ultima_entrega":   ultima,
            "tiempo_total":     tiempo_total,
            "tiempo_promedio":  tiempo_prom,
            "total":            total,
            "fill_rate":        fill_rate,
        })

    log.info(f"[geosort] agregado: {len(filas)} rutas. Muestra: {filas[:2] if filas else []}")
    return pd.DataFrame(filas)


@app.post("/procesar-geosort")
async def procesar_geosort(archivo: UploadFile = File(...)):
    """Recibe un CSV de Geosort (raw o procesado) y lo inserta en BigQuery."""
    extension = archivo.filename.rsplit(".", 1)[-1].lower()
    if extension != "csv":
        raise HTTPException(400, "Solo se aceptan archivos CSV")

    contenido = await archivo.read()
    df = _leer_geosort_csv(contenido)

    # Detectar si es raw (tiene "Idruta") o procesado (tiene "Id ruta" / "id_ruta")
    cols = set(df.columns)
    es_raw = "Idruta" in cols or "idruta" in cols.union({c.lower() for c in cols})

    if es_raw:
        df = _agregar_geosort_raw(df)
        rutas = len(df)
    else:
        df = df.rename(columns=GEOSORT_COL_MAP)
        rutas = len(df)

    df["_cargado_en"] = datetime.now(timezone.utc)

    for col in ["semana", "anio", "pendientes", "terminados", "total"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
    for col, bq_type in GEOSORT_COL_TYPES.items():
        if bq_type == "STRING" and col in df.columns:
            df[col] = df[col].astype(str).str.strip().replace("nan", None).replace("", None)

    merge_geosort(df)
    registrar_carga("geosort", archivo.filename, rutas)
    return JSONResponse({
        "ok": True,
        "filas_insertadas": rutas,
        "archivo": archivo.filename,
        "modo": "raw→agregado" if es_raw else "procesado",
    })


@app.delete("/limpiar-geosort")
def limpiar_geosort():
    """Borra y recrea la tabla geosort vacía. Usar antes de re-subir datos históricos."""
    try:
        bq_client.delete_table(BQ_TABLE_GEOSORT, not_found_ok=True)
        log.info("Tabla geosort eliminada para re-creación limpia")
        return {"ok": True, "mensaje": "Tabla geosort eliminada. Podés volver a subir los archivos."}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/cargar-geosort")
def cargar_geosort():
    """Lee CSVs procesados del bucket reportes-geosort subidos en las últimas 48 h e inserta en BigQuery."""
    from google.cloud import storage as gcs_lib

    gcs = gcs_lib.Client(project=BQ_PROJECT)
    bucket = gcs.bucket(BUCKET_REPORTES)

    hace_48h = datetime.now(timezone.utc) - timedelta(hours=48)
    blobs = [
        b for b in bucket.list_blobs(prefix="reportes/")
        if b.name.endswith("_procesado.csv") and b.time_created >= hace_48h
    ]

    if not blobs:
        raise HTTPException(404, "No se encontraron archivos procesados del domingo en el bucket.")

    total_filas = 0
    archivos_cargados = []

    for blob in blobs:
        contenido = blob.download_as_bytes()
        df = pd.read_csv(io.BytesIO(contenido))

        df = df.rename(columns=GEOSORT_COL_MAP)
        df["_cargado_en"] = datetime.now(timezone.utc)

        for col in ["semana", "anio", "pendientes", "terminados", "total"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
        # Forzar STRING en todas las columnas definidas como STRING (aunque pandas las haya inferido como int/float)
        for col, bq_type in GEOSORT_COL_TYPES.items():
            if bq_type == "STRING" and col in df.columns:
                df[col] = df[col].astype(str).str.strip().replace("nan", None).replace("", None)

        merge_geosort(df)
        total_filas += len(df)
        nombre_corto = blob.name.split("/")[-1]
        archivos_cargados.append(nombre_corto)
        registrar_carga("geosort", nombre_corto, len(df))
        log.info(f"Geosort: {nombre_corto} — {len(df)} filas")

    return {"ok": True, "archivos": archivos_cargados, "filas_totales": total_filas}


# ── Configuración de columnas (BigQuery) ─────────────────────────────────────
def _init_tabla_config():
    bq_client.query(f"""
        CREATE TABLE IF NOT EXISTS `{BQ_TABLE_CONFIG}` (
          tipo          STRING,
          config        STRING,
          actualizado_en TIMESTAMP
        )
    """).result()

def get_columnas_beetrak() -> dict:
    """Devuelve el mapping Excel→BQ guardado, o el default si no hay config.
    Siempre incluye columnas nuevas del default aunque no estén en el config guardado."""
    try:
        rows = list(bq_client.query(f"""
            SELECT config FROM `{BQ_TABLE_CONFIG}`
            WHERE tipo = 'beetrak'
            ORDER BY actualizado_en DESC LIMIT 1
        """).result())
        if rows:
            stored = json.loads(rows[0]["config"])
            # Agregar columnas nuevas del default que no están en el config guardado
            nuevas = {k: v for k, v in COLUMNAS_BEETRAK.items() if k not in stored}
            return {**stored, **nuevas}
    except Exception as e:
        log.warning(f"No se pudo leer config beetrak: {e}")
    return COLUMNAS_BEETRAK

def get_local_prefijos() -> dict:
    """Devuelve el mapa local→prefijos guardado, o el default si no hay config."""
    try:
        rows = list(bq_client.query(f"""
            SELECT config FROM `{BQ_TABLE_CONFIG}`
            WHERE tipo = 'locales'
            ORDER BY actualizado_en DESC LIMIT 1
        """).result())
        if rows:
            return json.loads(rows[0]["config"])
    except Exception as e:
        log.warning(f"No se pudo leer config locales: {e}")
    return LOCAL_PREFIJOS

@app.get("/configuracion/beetrak")
def get_config_beetrak():
    return get_columnas_beetrak()

@app.put("/configuracion/beetrak")
async def put_config_beetrak(request: Request):
    """Guarda un nuevo mapping de columnas Beetrak."""
    body = await request.json()
    if not isinstance(body, dict) or not body:
        raise HTTPException(400, "El body debe ser un objeto {excelCol: bqField}")
    try:
        _init_tabla_config()
        df = pd.DataFrame([{
            "tipo":           "beetrak",
            "config":         json.dumps(body, ensure_ascii=False),
            "actualizado_en": datetime.now(timezone.utc),
        }])
        otros = list(bq_client.query(
            f"SELECT tipo, config, actualizado_en FROM `{BQ_TABLE_CONFIG}` WHERE tipo != 'beetrak'"
        ).result())
        rows_otros = [{"tipo": r["tipo"], "config": r["config"], "actualizado_en": r["actualizado_en"]} for r in otros]
        df_final = pd.concat([df, pd.DataFrame(rows_otros)], ignore_index=True) if rows_otros else df
        job_cfg = bigquery.LoadJobConfig(write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE)
        bq_client.load_table_from_dataframe(df_final, BQ_TABLE_CONFIG, job_config=job_cfg).result()
        log.info("Config beetrak actualizada")
        return {"ok": True}
    except Exception as e:
        log.error(f"Error guardando config: {e}", exc_info=True)
        raise HTTPException(500, str(e))

@app.get("/configuracion/locales")
def get_config_locales():
    return get_local_prefijos()

@app.put("/configuracion/locales")
async def put_config_locales(request: Request):
    """Guarda el mapa local→prefijos. Body: { "41": ["LTVS","DRVS"], ... }"""
    body = await request.json()
    if not isinstance(body, dict) or not body:
        raise HTTPException(400, "El body debe ser un objeto {local: [prefijos]}")
    try:
        _init_tabla_config()
        df = pd.DataFrame([{
            "tipo":           "locales",
            "config":         json.dumps(body, ensure_ascii=False),
            "actualizado_en": datetime.now(timezone.utc),
        }])
        otros = list(bq_client.query(
            f"SELECT tipo, config, actualizado_en FROM `{BQ_TABLE_CONFIG}` WHERE tipo != 'locales'"
        ).result())
        rows_otros = [{"tipo": r["tipo"], "config": r["config"], "actualizado_en": r["actualizado_en"]} for r in otros]
        df_final = pd.concat([df, pd.DataFrame(rows_otros)], ignore_index=True) if rows_otros else df
        job_cfg = bigquery.LoadJobConfig(write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE)
        bq_client.load_table_from_dataframe(df_final, BQ_TABLE_CONFIG, job_config=job_cfg).result()
        log.info("Config locales actualizada")
        return {"ok": True}
    except Exception as e:
        log.error(f"Error guardando config locales: {e}", exc_info=True)
        raise HTTPException(500, str(e))


# ── Usuarios (BigQuery) ───────────────────────────────────────────────────────
BQ_TABLE_USUARIOS = f"{BQ_PROJECT}.{BQ_DATASET}.usuarios"


def _init_tabla_usuarios():
    """Crea la tabla usuarios si no existe."""
    query = f"""
    CREATE TABLE IF NOT EXISTS `{BQ_TABLE_USUARIOS}` (
      correo STRING NOT NULL,
      rol    STRING NOT NULL
    )
    """
    bq_client.query(query).result()


_init_tabla_config()
_init_tabla_usuarios()


@app.get("/usuarios")
def get_usuarios():
    try:
        rows = bq_client.query(f"SELECT correo, rol FROM `{BQ_TABLE_USUARIOS}`").result()
        return {row["correo"]: row["rol"] for row in rows}
    except Exception:
        return {}


@app.post("/usuarios")
def upsert_usuario(body: UsuarioIn):
    query = f"""
    MERGE `{BQ_TABLE_USUARIOS}` AS tgt
    USING (SELECT @correo AS correo, @rol AS rol) AS src
    ON tgt.correo = src.correo
    WHEN MATCHED THEN UPDATE SET rol = src.rol
    WHEN NOT MATCHED THEN INSERT (correo, rol) VALUES (src.correo, src.rol)
    """
    bq_client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("correo", "STRING", body.correo),
        bigquery.ScalarQueryParameter("rol",    "STRING", body.rol),
    ])).result()
    return {"ok": True}


@app.delete("/usuarios/{correo}")
def delete_usuario(correo: str):
    bq_client.query(
        f"DELETE FROM `{BQ_TABLE_USUARIOS}` WHERE correo = @correo",
        job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("correo", "STRING", correo),
        ])
    ).result()
    return {"ok": True}


# ── Lectura de archivos ──────────────────────────────────────────────────────
def leer_archivo(content: bytes, extension: str, tipo: str) -> pd.DataFrame:
    if extension in ("xlsx", "xls"):
        return leer_excel(content, tipo)
    muestra = content[:4096].decode("utf-8", errors="ignore")
    sep = ";" if muestra.count(";") > muestra.count(",") else ","
    return pd.read_csv(io.BytesIO(content), sep=sep, dtype=str, encoding="utf-8-sig")


def leer_excel(content: bytes, tipo: str) -> pd.DataFrame:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
    hojas = wb.sheetnames
    wb.close()
    log.info(f"Hojas: {hojas}")

    if "Datos" in hojas:
        hoja = "Datos"
    elif tipo == "beetrak" and "DispatchTrack" in hojas:
        hoja = "DispatchTrack"
    elif tipo == "pfa" and "Picking" in hojas:
        hoja = "Picking"
    else:
        hoja = hojas[0]

    log.info(f"Leyendo hoja: '{hoja}'")
    df = pd.read_excel(io.BytesIO(content), sheet_name=hoja, dtype=str)
    return df.dropna(how="all").reset_index(drop=True)


# ── Limpieza Beetrak ──────────────────────────────────────────────────────────
def limpiar_beetrak(df: pd.DataFrame, columnas: dict = None, local_prefijos: dict = None) -> pd.DataFrame:
    columnas       = columnas       or COLUMNAS_BEETRAK
    local_prefijos = local_prefijos or LOCAL_PREFIJOS
    log.info(f"Beetrak recibido: {len(df)} filas · {len(df.columns)} columnas")

    # Normalizar nombres de columna: strip y colapsar espacios múltiples internos
    import re as _re
    df.columns = [_re.sub(r'\s+', ' ', str(c).strip()) for c in df.columns]

    # Renombrar duplicado "Usuario móvil" → pandas lo llama .1 al segundo
    cols_vistos = {}
    nuevos_nombres = []
    for col in df.columns:
        if col in cols_vistos:
            cols_vistos[col] += 1
            nuevos_nombres.append(f"{col}.{cols_vistos[col]}")
        else:
            cols_vistos[col] = 0
            nuevos_nombres.append(col)
    df.columns = nuevos_nombres

    # Seleccionar columnas útiles
    # Buscar columna foto_bultos con nombre aproximado si el nombre exacto no coincide
    if "Foto de los bultos + sueltos entregados" not in df.columns:
        for c in df.columns:
            if "foto" in c.lower() and "bultos" in c.lower():
                columnas = {**columnas, c: "foto_bultos"}
                log.info(f"Columna foto_bultos encontrada como: '{c}'")
                break
        else:
            log.warning(f"Columna 'foto_bultos' no encontrada. Columnas disponibles: {list(df.columns)}")
    cols = {k: v for k, v in columnas.items() if k in df.columns}
    df = df[list(cols.keys())].rename(columns=cols)

    # Filtrar por LOCAL válido
    antes = len(df)
    df["local"] = df["local"].astype(str).str.strip()
    df = df[df["local"].isin(local_prefijos.keys())].reset_index(drop=True)
    log.info(f"Eliminadas por LOCAL inválido: {antes - len(df)}")

    # Filtrar por prefijo de Identificador según local
    if "identificador" in df.columns:
        antes = len(df)
        def prefijo_valido(row):
            prefijos = local_prefijos.get(str(row["local"]), [])
            return any(str(row["identificador"]).strip().upper().startswith(p.upper()) for p in prefijos)
        df = df[df.apply(prefijo_valido, axis=1)].reset_index(drop=True)
        log.info(f"Eliminadas por prefijo inválido: {antes - len(df)}")

    # Extraer RUT de rut_movil (wmvs, ltvs, drvs, hdvs...)
    if "rut_movil" in df.columns:
        _PREFIJOS_RUT = ("wmvs", "ltvs", "drvs", "hdvs")
        def extraer_rut(val):
            if pd.isna(val): return None
            val = str(val).strip().lower()
            for prefijo in _PREFIJOS_RUT:
                if val.startswith(prefijo):
                    rut = val[len(prefijo):].strip()
                    return rut if rut else None
            return None
        df["rut_movil"] = df["rut_movil"].apply(extraer_rut)

    # Separar coordenadas si vienen combinadas
    if "coordenadas" in df.columns and "latitud" not in df.columns:
        coords = df["coordenadas"].str.extract(r"(-?[\d.]+),\s*(-?[\d.]+)")
        df["latitud"]  = coords[0]
        df["longitud"] = coords[1]
        df = df.drop(columns=["coordenadas"])

    # Normalizar clave JOIN
    if "orden" in df.columns:
        df["orden"] = df["orden"].apply(normalizar_orden)

    # Fechas
    for col in ["fecha_estimada", "fecha_llegada", "fecha_ruta", "fecha_creacion",
                "fecha_primer_intento", "inicio_ruta", "fin_ruta", "fecha_picking",
                "tiempo_min_entrega", "tiempo_max_entrega"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S")

    if "intentos" in df.columns:
        df["intentos"] = pd.to_numeric(df["intentos"], errors="coerce")
    if "estado" in df.columns:
        df["estado"] = df["estado"].str.strip().str.title()

    # Trimear strings
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].str.strip().replace("", None)

    df["_cargado_en"] = datetime.now(timezone.utc).isoformat()
    log.info(f"Beetrak limpio: {len(df)} filas · {len(df.columns)} columnas")
    return df.reset_index(drop=True)


# ── Limpieza PFA ──────────────────────────────────────────────────────────────
COLS_FECHA_FINANZAS   = {"fecha_control", "fecha_compromiso", "inicio_picking", "fin_picking", "_cargado_en"}
COLS_ENTERO_FINANZAS  = {"unidades_solicitadas", "unidades_pickeadas", "unidades_sustituidas",
                          "items_solicitados", "items_a_pagar", "monto_items", "descuento_3_items"}
COLS_DECIMAL_FINANZAS = {"monto_base_picking", "monto_base_delivery", "descuento_volumen", "minutos_picking"}
def _preparar_finanzas_bq(df: pd.DataFrame) -> pd.DataFrame:
    """Prepara df_finanzas para insertar en BigQuery conservando todas las columnas."""
    df = df.copy()
    for col in df.columns:
        if col in COLS_FECHA_FINANZAS:
            df[col] = pd.to_datetime(df[col], errors="coerce")
        elif col in COLS_ENTERO_FINANZAS:
            df[col] = pd.to_numeric(df[col], errors="coerce").round(0).astype("Int64")
        elif col in COLS_DECIMAL_FINANZAS:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        else:
            # Todo lo demás → string
            df[col] = df[col].astype(str).str.strip()
            if col in {"rut_persona", "rut_empresa"}:
                df[col] = df[col].str.replace(r"\.0$", "", regex=True)
            df[col] = df[col].replace({"nan": None, "": None})
    return df


def limpiar_pfa(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    log.info(f"PFA recibido: {len(df)} filas · {len(df.columns)} columnas")

    # Normalizar nombres de columna: strip, lowercase, espacios → guion bajo
    import re as _re
    df.columns = [_re.sub(r'\s+', '_', str(c).strip().lower()) for c in df.columns]
    log.info(f"Columnas PFA normalizadas: {list(df.columns)}")

    df_fin = df.copy()
    df_fin["_cargado_en"] = datetime.now(timezone.utc).isoformat()

    cols_limp = {k: v for k, v in COLUMNAS_PFA_LIMPIA.items() if k in df.columns}
    df_limp   = df[list(cols_limp.keys())].rename(columns=cols_limp).copy()
    df_limp   = _limpiar_pfa_comun(df_limp, deduplicar=True)
    log.info(f"PFA Limpia: {len(df_limp)} filas")

    return df_fin, df_limp


def _limpiar_pfa_comun(df: pd.DataFrame, deduplicar: bool) -> pd.DataFrame:
    df = df.dropna(how="all").reset_index(drop=True)

    if "shipping_group" in df.columns:
        df["shipping_group"] = df["shipping_group"].apply(normalizar_orden)

    if "nro_local" in df.columns:
        df["nro_local"] = df["nro_local"].astype(str).str.strip().replace("nan", None)

    if "inicio_picking" in df.columns and "fin_picking" in df.columns:
        t0 = pd.to_datetime(df["inicio_picking"], errors="coerce")
        t1 = pd.to_datetime(df["fin_picking"],    errors="coerce")
        df["minutos_picking"] = (t1 - t0).dt.total_seconds() / 60

    for col in ["fecha_control", "fecha_compromiso", "inicio_picking", "fin_picking"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S")

    for col in ["unidades_solicitadas", "unidades_pickeadas", "unidades_sustituidas",
                "items_solicitados", "items_a_pagar"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    if "doble_pedido" in df.columns:
        df["doble_pedido"] = df["doble_pedido"].notna() & (df["doble_pedido"].str.strip() != "")

    if deduplicar and "shipping_group" in df.columns:
        df = df.drop_duplicates(subset=["shipping_group"], keep="first").reset_index(drop=True)

    # Convertir columnas RUT a string antes del strip para no perder valores numéricos
    # (pandas .str ignora enteros en columnas object convirtiéndolos a NaN)
    for col_rut in ["rut_persona", "rut_empresa"]:
        if col_rut in df.columns:
            df[col_rut] = (
                df[col_rut]
                .astype(str)
                .str.strip()
                .str.replace(r"\.0$", "", regex=True)  # quita .0 de floats
                .replace({"nan": None, "": None})
            )

    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].str.strip().replace("", None)

    df["_cargado_en"] = datetime.now(timezone.utc).isoformat()
    return df.reset_index(drop=True)


def normalizar_orden(valor) -> str | None:
    if pd.isna(valor) or str(valor).strip() == "":
        return None
    return str(valor).strip()


# ── Stats ─────────────────────────────────────────────────────────────────────
def calcular_stats_beetrak(df: pd.DataFrame) -> dict:
    return {
        "estados":        df["estado"].value_counts().to_dict() if "estado" in df.columns else {},
        "tipos_despacho": df["tipo_despacho"].value_counts().to_dict() if "tipo_despacho" in df.columns else {},
        "ordenes_unicas": int(df["orden"].nunique()) if "orden" in df.columns else 0,
    }


def calcular_stats_pfa(df: pd.DataFrame) -> dict:
    return {
        "tipos_servicio":       df["tipo_servicio"].value_counts().to_dict() if "tipo_servicio" in df.columns else {},
        "roles":                df["rol_persona"].value_counts().to_dict() if "rol_persona" in df.columns else {},
        "dobles_pedidos":       int(df["doble_pedido"].sum()) if "doble_pedido" in df.columns else 0,
        "min_picking_promedio": (lambda v: 0 if pd.isna(v) else round(float(v), 1))(df["minutos_picking"].mean()) if "minutos_picking" in df.columns else 0,
    }
