"""
Cloud Run Job — Sincroniza Instaleep desde Google Drive a BigQuery.

Detecta el último archivo .xlsx del día anterior en la carpeta Instaleap_SBA_10min.
Formato de nombre: pedidos_clean_ALL_YYYY-MM-DD_to_YYYY-MM-DD_YYYYMMDD_HHMMSS.xlsx
Hay múltiples archivos por día (cada ~10 min). Se toma el de timestamp más tardío.

Env vars:
  DRIVE_FOLDER_ID_INSTALEEP  — ID de la carpeta de Drive (requerido)
  BQ_PROJECT                 — default: sigmc-5fae5
  BQ_DATASET                 — default: dataflow
  TARGET_DATE                — override manual: YYYY-MM-DD
"""

import io
import logging
import os
import re
import sys
from datetime import datetime, timezone, timedelta

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import (
    _preparar_instaleep_bq,
    merge_instaleep,
    registrar_carga,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID_INSTALEEP", "")
TARGET_DATE     = os.environ.get("TARGET_DATE", "")  # override: YYYY-MM-DD
DRIVE_SCOPES    = ["https://www.googleapis.com/auth/drive.readonly"]
# Captura el timestamp YYYYMMDD_HHMMSS al final del nombre (antes de .xlsx)
TS_RE = re.compile(r"(\d{8}_\d{6})\.xlsx$")


def get_drive_service():
    import google.auth
    from googleapiclient.discovery import build

    creds, _ = google.auth.default(scopes=DRIVE_SCOPES)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def encontrar_ultimo_archivo_del_dia(service) -> dict | None:
    """Devuelve el archivo .xlsx más tardío del día anterior (o TARGET_DATE si se define)."""
    ayer = TARGET_DATE if TARGET_DATE else (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    query = (
        f"'{DRIVE_FOLDER_ID}' in parents"
        " and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'"
        " and trashed=false"
        f" and name contains '{ayer}'"
    )
    result = service.files().list(
        q=query,
        fields="files(id, name)",
        pageSize=100,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
        corpora="allDrives",
    ).execute()

    archivos = result.get("files", [])
    log.info(f"Archivos .xlsx en Drive para {ayer}: {len(archivos)}")

    # Filtrar por fecha del día objetivo en el nombre
    candidatos = [
        f for f in archivos
        if ayer in f["name"] and f["name"].startswith("pedidos_clean_ALL")
    ]

    if not candidatos:
        log.warning(f"No se encontró archivo con fecha {ayer} en el nombre.")
        return None

    log.info(f"Candidatos para {ayer}: {len(candidatos)} archivos")

    # Tomar el de timestamp YYYYMMDD_HHMMSS más alto (último del día)
    def timestamp_del_nombre(nombre):
        m = TS_RE.search(nombre)
        return m.group(1) if m else "00000000_000000"

    archivo = max(candidatos, key=lambda f: timestamp_del_nombre(f["name"]))
    log.info(f"Archivo seleccionado (último del día): '{archivo['name']}'")
    return archivo


def descargar_archivo(service, file_id: str) -> bytes:
    from googleapiclient.http import MediaIoBaseDownload

    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue()


def main():
    if not DRIVE_FOLDER_ID:
        raise ValueError("La variable de entorno DRIVE_FOLDER_ID_INSTALEEP es requerida.")

    log.info("=== Instaleep Drive Sync — inicio ===")
    service = get_drive_service()

    archivo = encontrar_ultimo_archivo_del_dia(service)
    if not archivo:
        log.warning("No hay archivo de ayer para procesar. Saliendo.")
        return

    contenido = descargar_archivo(service, archivo["id"])
    df_raw = pd.read_excel(io.BytesIO(contenido))
    log.info(f"Filas leídas: {len(df_raw)}, columnas: {list(df_raw.columns)}")

    df_bq = _preparar_instaleep_bq(df_raw)
    merge_instaleep(df_bq)
    registrar_carga("instaleep", archivo["name"], len(df_bq))

    log.info(f"=== Completado: {len(df_bq)} filas desde '{archivo['name']}' ===")


if __name__ == "__main__":
    main()
