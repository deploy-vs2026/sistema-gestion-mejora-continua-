"""
Cloud Run Job — Sincroniza Instaleep desde Google Drive a BigQuery.

Detecta el archivo .xlsx cuyo nombre contiene la fecha de ayer
(formato: pedidos_clean_ALL_YYYY-MM-DD_to_YYYY-MM-DD_*.xlsx),
lo descarga, limpia los tipos y hace MERGE en BigQuery con clave job_id.

Env vars:
  DRIVE_FOLDER_ID_INSTALEEP  — ID de la carpeta de Drive (requerido)
  BQ_PROJECT                 — default: sigmc-5fae5
  BQ_DATASET                 — default: dataflow
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
DATE_RE         = re.compile(r"\d{4}-\d{2}-\d{2}")


def get_drive_service():
    import google.auth
    from googleapiclient.discovery import build

    creds, _ = google.auth.default(scopes=DRIVE_SCOPES)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def encontrar_archivo_ayer(service) -> dict | None:
    """Devuelve el archivo .xlsx cuyo nombre contiene la fecha objetivo (ayer por defecto)."""
    ayer = TARGET_DATE if TARGET_DATE else (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

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
        corpora="allDrives",
    ).execute()

    archivos = result.get("files", [])
    log.info(f"Archivos .xlsx en Drive: {len(archivos)}")

    # Buscar archivo que contenga la fecha de ayer en el nombre
    candidatos = [
        f for f in archivos
        if ayer in f["name"] and f["name"].startswith("pedidos_clean_ALL")
    ]

    if not candidatos:
        log.warning(f"No se encontró archivo con fecha {ayer} en el nombre.")
        return None

    # Si hay más de uno, tomar el más reciente por timestamp en el nombre
    def timestamp_del_nombre(nombre):
        partes = DATE_RE.findall(nombre)
        return max(partes) if partes else "0"

    archivo = max(candidatos, key=lambda f: timestamp_del_nombre(f["name"]))
    log.info(f"Archivo seleccionado: '{archivo['name']}'")
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

    archivo = encontrar_archivo_ayer(service)
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
