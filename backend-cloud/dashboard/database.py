from google.cloud import bigquery
from fastapi import HTTPException
import pandas as pd

from dashboard.config import PROJECT_ID

try:
    client = bigquery.Client(project=PROJECT_ID)
    print("✅ BigQuery dashboard conectado OK")
except Exception as e:
    print(f"❌ BigQuery dashboard error: {e}")
    client = None


def run_query(sql: str) -> pd.DataFrame:
    if client is None:
        raise HTTPException(status_code=503, detail="BigQuery no disponible")
    try:
        df = client.query(sql).to_dataframe()
        return df.where(pd.notna(df), other=None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
