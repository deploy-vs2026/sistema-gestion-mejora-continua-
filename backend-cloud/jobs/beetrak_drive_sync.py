"""
Cloud Run Job — Sincroniza Beetrak desde Google Drive a BigQuery.

Detecta el archivo .xlsx más nuevo en una carpeta de Drive usando las fechas
en el nombre del archivo (ej: DT_lider632_2026-04-16_2026-04-16.xlsx),
lo descarga, lo limpia con la misma lógica del backend y hace MERGE en BigQuery.

Env vars:
  DRIVE_FOLDER_ID  — ID de la carpeta de Drive (requerido)
  BQ_PROJECT       — default: sigmc-5fae5
  BQ_DATASET       — default: dataflow
  LOAD_ALL         — si es "true", procesa TODOS los archivos de la carpeta (carga histórica)
  FROM_DATE        — formato YYYY-MM-DD, combinado con LOAD_ALL filtra archivos con fecha >= este valor
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
LOAD_ALL = os.environ.get("LOAD_ALL", "").lower() == "true"
FROM_DATE = os.environ.get("FROM_DATE", "")  # formato YYYY-MM-DD, filtra archivos con fecha >= este valor
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


def listar_archivos(service) -> list[dict]:
    """Devuelve todos los archivos .xlsx de la carpeta ordenados por fecha en el nombre."""
    query = (
        f"'{DRIVE_FOLDER_ID}' in parents"
        " and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'"
        " and trashed=false"
    )
    result = service.files().list(
        q=query,
        fields="files(id, name)",
        pageSize=200,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()

    archivos = result.get("files", [])
    log.info(f"Archivos .xlsx encontrados en Drive: {len(archivos)}")

    con_fecha = [(f, extraer_fecha_maxima(f["name"])) for f in archivos]
    con_fecha = [(f, fecha) for f, fecha in con_fecha if fecha]
    con_fecha.sort(key=lambda x: x[1])
    if FROM_DATE:
        con_fecha = [(f, fecha) for f, fecha in con_fecha if fecha >= FROM_DATE]
        log.info(f"Filtro FROM_DATE={FROM_DATE}: {len(con_fecha)} archivos restantes")
    return [(f, fecha) for f, fecha in con_fecha]


def encontrar_archivo_mas_nuevo(service) -> dict | None:
    """Devuelve el archivo .xlsx con la fecha más reciente en el nombre."""
    archivos = listar_archivos(service)
    if not archivos:
        return None
    archivo, fecha = archivos[-1]
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


def procesar_archivo(service, archivo: dict):
    columnas_bt = get_columnas_beetrak()
    locales_bt = get_local_prefijos()

    log.info(f"Descargando '{archivo['name']}' ...")
    contenido = descargar_archivo(service, archivo["id"])
    df_raw = leer_excel(contenido, "beetrak")
    log.info(f"Filas leídas: {len(df_raw)}")

    df_clean = limpiar_beetrak(df_raw, columnas_bt, locales_bt)
    df_bq = preparar_tipos_bq(df_clean)

    merge_beetrak(df_bq)
    registrar_carga("beetrak_drive", archivo["name"], len(df_bq))
    log.info(f"OK: {len(df_bq)} filas insertadas desde '{archivo['name']}'")


def main():
    if not DRIVE_FOLDER_ID:
        raise ValueError("La variable de entorno DRIVE_FOLDER_ID es requerida.")

    log.info(f"=== Beetrak Drive Sync — inicio (LOAD_ALL={LOAD_ALL}) ===")
    service = get_drive_service()

    if LOAD_ALL:
        archivos = listar_archivos(service)
        if not archivos:
            log.warning("No se encontraron archivos .xlsx con fechas válidas.")
            return
        log.info(f"Modo LOAD_ALL: procesando {len(archivos)} archivos...")
        for archivo, fecha in archivos:
            try:
                procesar_archivo(service, archivo)
            except Exception as e:
                log.error(f"Error procesando '{archivo['name']}': {e}")
        log.info(f"=== Completado: {len(archivos)} archivos procesados ===")
    else:
        archivo = encontrar_archivo_mas_nuevo(service)
        if not archivo:
            log.warning("No se encontraron archivos .xlsx con fechas válidas.")
            return
        procesar_archivo(service, archivo)
        log.info(f"=== Completado ===")


if __name__ == "__main__":
    main()
