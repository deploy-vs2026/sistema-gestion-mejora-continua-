"""
Cloud Run Job — Sincroniza Beetrak desde Google Drive a BigQuery.

Detecta el archivo .xlsx más nuevo en una carpeta de Drive usando las fechas
en el nombre del archivo (ej: DT_lider632_2026-04-16_2026-04-16.xlsx),
lo descarga, lo limpia con la misma lógica del backend y hace MERGE en BigQuery.

Env vars:
  DRIVE_FOLDER_ID  — ID de la carpeta de Drive (requerido)
  BQ_PROJECT       — default: sigmc-5fae5
  BQ_DATASET       — default: dataflow
"""

import io
import logging
import os
import re
import sys
from datetime import datetime, timezone

import pandas as pd

# Importar lógica compartida de limpieza e inserción desde server.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import (
    get_columnas_beetrak,
    get_local_prefijos,
    leer_excel,
    limpiar_beetrak,
    merge_beetrak,
    registrar_carga,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "")
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def get_drive_service():
    import google.auth
    from googleapiclient.discovery import build

    creds, _ = google.auth.default(scopes=DRIVE_SCOPES)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def extraer_fecha_maxima(nombre: str) -> str | None:
    fechas = DATE_RE.findall(nombre)
    return max(fechas) if fechas else None


def encontrar_archivo_mas_nuevo(service) -> dict | None:
    """Devuelve el archivo .xlsx con la fecha más reciente en el nombre."""
    query = (
        f"'{DRIVE_FOLDER_ID}' in parents"
        " and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'"
        " and trashed=false"
    )
    result = service.files().list(
        q=query,
        fields="files(id, name)",
        pageSize=200,
    ).execute()

    archivos = result.get("files", [])
    log.info(f"Archivos .xlsx encontrados en Drive: {len(archivos)}")

    con_fecha = [(f, extraer_fecha_maxima(f["name"])) for f in archivos]
    con_fecha = [(f, fecha) for f, fecha in con_fecha if fecha]

    if not con_fecha:
        return None

    archivo, fecha = max(con_fecha, key=lambda x: x[1])
    log.info(f"Archivo seleccionado: '{archivo['name']}' (fecha máxima: {fecha})")
    return archivo


def descargar_archivo(service, file_id: str) -> bytes:
    from googleapiclient.http import MediaIoBaseDownload

    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        status, done = downloader.next_chunk()
        if status:
            log.info(f"Descarga: {int(status.progress() * 100)}%")
    return buf.getvalue()


def preparar_tipos_bq(df_clean: pd.DataFrame) -> pd.DataFrame:
    """Convierte tipos para BigQuery. Espeja la lógica de /procesar-json/beetrak."""
    df_bq = df_clean.copy()
    for col in [
        "fecha_estimada", "fecha_llegada", "fecha_ruta", "fecha_creacion",
        "fecha_primer_intento", "inicio_ruta", "fin_ruta", "fecha_picking",
        "tiempo_min_entrega", "tiempo_max_entrega", "_cargado_en",
    ]:
        if col in df_bq.columns:
            df_bq[col] = pd.to_datetime(df_bq[col], errors="coerce")
    if "intentos" in df_bq.columns:
        df_bq["intentos"] = pd.to_numeric(df_bq["intentos"], errors="coerce").astype("Int64")
    for col in ["latitud", "longitud"]:
        if col in df_bq.columns:
            df_bq[col] = pd.to_numeric(df_bq[col], errors="coerce")
    return df_bq


def main():
    if not DRIVE_FOLDER_ID:
        raise ValueError("La variable de entorno DRIVE_FOLDER_ID es requerida.")

    log.info("=== Beetrak Drive Sync — inicio ===")
    service = get_drive_service()

    archivo = encontrar_archivo_mas_nuevo(service)
    if not archivo:
        log.warning("No se encontraron archivos .xlsx con fechas válidas en la carpeta de Drive.")
        return

    contenido = descargar_archivo(service, archivo["id"])
    df_raw = leer_excel(contenido, "beetrak")
    log.info(f"Filas leídas del Excel: {len(df_raw)}")

    columnas_bt = get_columnas_beetrak()
    locales_bt = get_local_prefijos()
    df_clean = limpiar_beetrak(df_raw, columnas_bt, locales_bt)
    df_bq = preparar_tipos_bq(df_clean)

    merge_beetrak(df_bq)
    registrar_carga("beetrak_drive", archivo["name"], len(df_bq))

    log.info(f"=== Completado: {len(df_bq)} filas procesadas desde '{archivo['name']}' ===")


if __name__ == "__main__":
    main()
