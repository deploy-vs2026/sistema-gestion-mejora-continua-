"""
Dashboard PFA - Backend FastAPI
Proyecto: sigmc-5fae5 | Dataset: dataflow | Tabla: pfa

Instalar dependencias:
    pip install fastapi uvicorn google-cloud-bigquery pandas google-auth aiofiles db-dtypes

Ejecutar:
    uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from google.cloud import bigquery
from google.oauth2 import service_account
from typing import Optional, List
import pandas as pd
import os
import math
from datetime import date, timedelta, datetime
import calendar

# ─── Configuración ───────────────────────────────────────────────────────────
PROJECT_ID = "sigmc-5fae5"
DATASET    = "dataflow"
TABLE      = "pfa"
FULL_TABLE     = f"{PROJECT_ID}.{DATASET}.{TABLE}"
BEETRAK_TABLE  = f"{PROJECT_ID}.{DATASET}.beetrak"

# Fecha de inicio por local (equivale a StartDate por Local en DAX)
START_DATE_POR_LOCAL = {
    54:  "2026-03-31",
    88:  "2025-07-17",
    121: "2025-08-11",
    518: "2025-10-01",
    94:  "2026-03-31",
    98:  "2026-03-30",
    99:  "2026-03-31",
    120: "2026-03-31",
}

# Proveedores permitidos por local (equivale a Mostrar Proveedor en DAX)
PROVEEDORES_POR_LOCAL = {
    41:  ["Valdishopper", "Titask"],
    54:  ["Valdishopper", "Zubale"],
    76:  ["Valdishopper", "Uber"],
    88:  ["Valdishopper", "Boosmap", "Uber"],
    94:  ["Valdishopper", "Titask"],
    98:  ["Valdishopper", "Foxer"],
    99:  ["Valdishopper", "Foxer"],
    120: ["Valdishopper", "Boosmap"],
    121: ["Valdishopper", "Zubale"],
    518: ["Valdishopper", "GPS"],
}

# PPU → Transportadora
PPU_TRANSPORTADORA = {
    "DRBM": "Boosmap",  "LTBM": "Boosmap",
    "DRFX": "Foxer",    "LTFX": "Foxer",
    "DRGP": "GPS",
    "DRTH": "Titask",   "LTTH": "Titask",
    "DRVS": "Valdishopper", "HDVS": "Valdishopper", "LTVS": "Valdishopper",
    "DRZB": "Zubale",   "LTZB": "Zubale",
    "LTGP": "GPS",
    "Uber": "Uber",
}

# Lista de todos los locales disponibles
LOCALES_SECUNDARIAS = sorted(PROVEEDORES_POR_LOCAL.keys())

# ─── REGLA DE NEGOCIO: Aislar operaciones LAT en Beetrak ───────────────────
# Excluye "Modelo Mixto" (local 95 o HDVS con ventana de 2 hrs en locales específicos)
# Excluye "Estival" (HDVS en locales específicos)
FILTRO_LAT_BEETRAK = """
    (
        (IFNULL(local, '') != '95')
        AND NOT (
            LEFT(identificador, 4) = 'HDVS'
            AND (
                (COALESCE(DATETIME_DIFF(tiempo_max_entrega, tiempo_min_entrega, HOUR), 0) = 2 
                 AND local IN ('45', '58', '98', '99', '120', '121'))
                OR 
                (local IN ('99', '657', '618', '94', '120', '121', '58', '98', '608', '143'))
            )
        )
    )
"""

# ─── OPERACIÓN HD: Modelo Mixto y Estival (HDVS) ─────────────────────────
LOCALES_ESTIVAL      = ('99','657','618','94','120','121','58','98','608','143')
LOCALES_MODELO_MIXTO = ('45','58','95','98','99')

FILTRO_HD_ESTIVAL = """
    LEFT(identificador, 4) = 'HDVS'
    AND local IN ('99','657','618','94','120','121','58','98','608','143')
"""

FILTRO_HD_MIXTO = """
    LEFT(identificador, 4) = 'HDVS'
    AND COALESCE(DATETIME_DIFF(tiempo_max_entrega, tiempo_min_entrega, HOUR), 0) = 2
    AND local IN ('45','58','95','98','99','120','121')
"""

def hd_tipo_servicio_filter(tipo_servicio: str = None) -> str:
    MIXTO = """(
        LEFT(identificador, 4) = 'HDVS'
        AND COALESCE(DATETIME_DIFF(tiempo_max_entrega, tiempo_min_entrega, HOUR), 0) = 2
        AND local IN ('45','58','95','98','99','120','121')
    )"""

    ESTIVAL_PURO = """(
        LEFT(identificador, 4) = 'HDVS'
        AND local IN ('99','657','618','94','120','121','58','98','608','143')
        AND NOT (
            COALESCE(DATETIME_DIFF(tiempo_max_entrega, tiempo_min_entrega, HOUR), 0) = 2
            AND local IN ('45','58','95','98','99','120','121')
        )
    )"""

    if tipo_servicio == "Estival":
        return f"AND {ESTIVAL_PURO}"
    elif tipo_servicio == "Modelo Mixto":
        return f"AND {MIXTO}"
    else:
        return f"""AND (
            {MIXTO}
            OR {ESTIVAL_PURO}
        )"""

def hd_base_filters(
    fecha_inicio: str = None,
    fecha_fin: str = None,
    local: str = None,
    tipo_servicio: str = None,
) -> str:
    """WHERE completo para endpoints HD."""
    clauses = ["tiempo_min_entrega IS NOT NULL", "LEFT(identificador, 4) = 'HDVS'"]
    if fecha_inicio:
        clauses.append(f"DATE(tiempo_min_entrega) >= '{fecha_inicio}'")
    if fecha_fin:
        clauses.append(f"DATE(tiempo_min_entrega) <= '{fecha_fin}'")
    if local:
        clauses.append(f"local = '{local}'")
    where = "WHERE " + " AND ".join(clauses)
    where += " " + hd_tipo_servicio_filter(tipo_servicio)
    return where


KEY_PATH = os.environ.get(
    "GOOGLE_APPLICATION_CREDENTIALS",
    r"C:\Users\victo\desktop\archivos valdishopper\dashboard - pfa\sigmc-5fae5-0f13ffdb9702.json"
)

app = FastAPI(title="Dashboard PFA", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ─── Inicializar cliente BigQuery ────────────────────────────────────────────
try:
    credentials = service_account.Credentials.from_service_account_file(
        KEY_PATH,
        scopes=["https://www.googleapis.com/auth/bigquery"],
    )
    client = bigquery.Client(project=PROJECT_ID, credentials=credentials)
    print(f"✅ BigQuery conectado OK — {KEY_PATH}")
except Exception as e:
    print(f"❌ Error al conectar BigQuery: {e}")
    client = None


def run_query(sql: str) -> pd.DataFrame:
    if client is None:
        raise HTTPException(status_code=503, detail="BigQuery no disponible")
    try:
        df = client.query(sql).to_dataframe()
        df = df.where(pd.notna(df), other=None)
        return df
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def date_filter(fecha_inicio: Optional[str], fecha_fin: Optional[str]) -> str:
    clauses = []
    if fecha_inicio:
        clauses.append(f"DATE(fecha_control) >= '{fecha_inicio}'")
    if fecha_fin:
        clauses.append(f"DATE(fecha_control) <= '{fecha_fin}'")
    return ("WHERE " + " AND ".join(clauses)) if clauses else ""


def date_filter_and(fecha_inicio: Optional[str], fecha_fin: Optional[str]) -> str:
    """Versión que retorna cláusulas AND (sin WHERE) para combinar con otros filtros."""
    clauses = []
    if fecha_inicio:
        clauses.append(f"DATE(fecha_control) >= '{fecha_inicio}'")
    if fecha_fin:
        clauses.append(f"DATE(fecha_control) <= '{fecha_fin}'")
    return ("AND " + " AND ".join(clauses)) if clauses else ""


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "ok", "bigquery": client is not None, "tabla": FULL_TABLE}


# ─── KPIs generales ──────────────────────────────────────────────────────────
@app.get("/api/kpis")
def kpis(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin:    Optional[str] = Query(None),
):
    where = date_filter(fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            COUNT(*)                                                                    AS total_ordenes,
            SUM(unidades_solicitadas)                                                   AS total_unidades_solicitadas,
            SUM(unidades_pickeadas)                                                     AS total_unidades_pickeadas,
            SUM(unidades_sustituidas)                                                   AS total_unidades_sustituidas,
            SUM(items_solicitados)                                                      AS total_items_solicitados,
            SUM(items_a_pagar)                                                          AS total_items_a_pagar,
            ROUND(AVG(minutos_picking), 2)                                              AS promedio_minutos_picking,
            ROUND(SAFE_DIVIDE(SUM(unidades_pickeadas), SUM(unidades_solicitadas)) * 100, 2) AS efectividad_pct
        FROM `{FULL_TABLE}`
        {where}
    """
    df = run_query(sql)
    return df.iloc[0].to_dict()


# ─── Órdenes por día ─────────────────────────────────────────────────────────
@app.get("/api/ordenes-por-dia")
def ordenes_por_dia(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin:    Optional[str] = Query(None),
):
    where = date_filter(fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            FORMAT_DATE('%Y-%m-%d', DATE(fecha_control)) AS fecha,
            COUNT(*)                                      AS total_ordenes,
            SUM(unidades_pickeadas)                       AS unidades_pickeadas,
            ROUND(AVG(minutos_picking), 2)                AS avg_minutos
        FROM `{FULL_TABLE}`
        {where}
        GROUP BY 1
        ORDER BY 1
    """
    return run_query(sql).to_dict(orient="records")


# ─── Efectividad por tipo servicio ───────────────────────────────────────────
@app.get("/api/efectividad-por-servicio")
def efectividad_por_servicio(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin:    Optional[str] = Query(None),
):
    where = date_filter(fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            COALESCE(tipo_servicio, 'Sin clasificar')                                   AS tipo_servicio,
            COUNT(*)                                                                    AS total_ordenes,
            SUM(unidades_solicitadas)                                                   AS unidades_solicitadas,
            SUM(unidades_pickeadas)                                                     AS unidades_pickeadas,
            ROUND(SAFE_DIVIDE(SUM(unidades_pickeadas), SUM(unidades_solicitadas)) * 100, 2) AS efectividad_pct,
            ROUND(AVG(minutos_picking), 2)                                              AS avg_minutos
        FROM `{FULL_TABLE}`
        {where}
        GROUP BY 1
        ORDER BY total_ordenes DESC
    """
    return run_query(sql).to_dict(orient="records")


# ─── Rendimiento por persona ──────────────────────────────────────────────────
@app.get("/api/rendimiento-por-persona")
def rendimiento_por_persona(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin:    Optional[str] = Query(None),
    limit: int = Query(20),
):
    where = date_filter(fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            COALESCE(rol_persona, 'Sin rol')                                            AS rol_persona,
            rut_persona,
            COUNT(*)                                                                    AS total_ordenes,
            SUM(unidades_pickeadas)                                                     AS unidades_pickeadas,
            ROUND(SAFE_DIVIDE(SUM(unidades_pickeadas), SUM(unidades_solicitadas)) * 100, 2) AS efectividad_pct,
            ROUND(AVG(minutos_picking), 2)                                              AS avg_minutos
        FROM `{FULL_TABLE}`
        {where}
        GROUP BY 1, 2
        ORDER BY unidades_pickeadas DESC
        LIMIT {limit}
    """
    return run_query(sql).to_dict(orient="records")


# ─── Por shipping group ───────────────────────────────────────────────────────
@app.get("/api/por-shipping-group")
def por_shipping_group(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin:    Optional[str] = Query(None),
):
    where = date_filter(fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            COALESCE(shipping_group, 'Sin grupo')                                       AS shipping_group,
            COUNT(*)                                                                    AS total_ordenes,
            SUM(unidades_pickeadas)                                                     AS unidades_pickeadas,
            ROUND(SAFE_DIVIDE(SUM(unidades_pickeadas), SUM(unidades_solicitadas)) * 100, 2) AS efectividad_pct
        FROM `{FULL_TABLE}`
        {where}
        GROUP BY 1
        ORDER BY total_ordenes DESC
        LIMIT 30
    """
    return run_query(sql).to_dict(orient="records")


# ─── Histograma minutos ───────────────────────────────────────────────────────
@app.get("/api/histograma-minutos")
def histograma_minutos(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin:    Optional[str] = Query(None),
):
    date_and = date_filter_and(fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            CAST(FLOOR(minutos_picking / 10) * 10 AS INT64) AS rango_inicio,
            COUNT(*) AS cantidad
        FROM `{FULL_TABLE}`
        WHERE minutos_picking IS NOT NULL
          AND minutos_picking >= 0
          {date_and}
        GROUP BY 1
        ORDER BY 1
    """
    df = run_query(sql)
    df["rango"] = df["rango_inicio"].astype(str) + "-" + (df["rango_inicio"] + 10).astype(str) + " min"
    return df[["rango", "cantidad"]].to_dict(orient="records")


# ─── Cumplimiento ventana ─────────────────────────────────────────────────────
@app.get("/api/cumplimiento-ventana")
def cumplimiento_ventana(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin:    Optional[str] = Query(None),
):
    date_and = date_filter_and(fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            ventana,
            COUNT(*) AS total,
            COUNTIF(fin_picking <= fecha_compromiso) AS a_tiempo,
            ROUND(SAFE_DIVIDE(COUNTIF(fin_picking <= fecha_compromiso), COUNT(*)) * 100, 2) AS pct_a_tiempo
        FROM `{FULL_TABLE}`
        WHERE ventana IS NOT NULL
          {date_and}
        GROUP BY 1
        ORDER BY total DESC
    """
    return run_query(sql).to_dict(orient="records")


# ─── Por local ────────────────────────────────────────────────────────────────
@app.get("/api/por-local")
def por_local(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin:    Optional[str] = Query(None),
):
    where = date_filter(fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            COALESCE(nro_local, 'Sin local')                                            AS nro_local,
            COUNT(*)                                                                    AS total_ordenes,
            SUM(unidades_pickeadas)                                                     AS unidades_pickeadas,
            ROUND(AVG(minutos_picking), 2)                                              AS avg_minutos,
            ROUND(SAFE_DIVIDE(SUM(unidades_pickeadas), SUM(unidades_solicitadas)) * 100, 2) AS efectividad_pct
        FROM `{FULL_TABLE}`
        {where}
        GROUP BY 1
        ORDER BY total_ordenes DESC
    """
    return run_query(sql).to_dict(orient="records")


# ─── KPI Semanal: Pedidos + Prestadores + Productividad ──────────────────────
@app.get("/api/kpi-semanal")
def kpi_semanal(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    local:         Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
    rol:           Optional[str] = Query(None),
):
    """
    Gráfico de columnas + línea por semana.
    - Usa FORMAT_DATE('%G-%V') para semanas ISO correctas (evita S0/S51/S52/Snull)
    - Filtra filas sin fecha_control válida
    """
    where = date_filter(fecha_inicio, fecha_fin)
    # Filtro adicional para excluir fechas nulas
    extra = "AND fecha_control IS NOT NULL"
    if where:
        sql_where = where + " " + extra
    else:
        sql_where = "WHERE fecha_control IS NOT NULL"
    if local:         sql_where += f" AND nro_local = '{local}'"
    if tipo_servicio: sql_where += f" AND tipo_servicio = '{tipo_servicio}'"
    if rol:           sql_where += f" AND rol_persona = '{rol}'"

    sql = f"""
    WITH base AS (
        SELECT
            EXTRACT(ISOYEAR FROM fecha_control)           AS anio,
            EXTRACT(ISOWEEK FROM fecha_control)           AS semana,
            DATE_TRUNC(DATE(fecha_control), WEEK(MONDAY)) AS semana_inicio,
            DATE(fecha_control)                           AS dia,
            COUNT(DISTINCT shipping_group)                AS pedidos_dia,
            COUNT(DISTINCT rut_persona)                   AS prestadores_dia,
            SAFE_DIVIDE(
                COUNT(DISTINCT shipping_group),
                COUNT(DISTINCT rut_persona)
            )                                             AS productividad_dia
        FROM `{FULL_TABLE}`
        {sql_where}
        GROUP BY 1, 2, 3, 4
    )
    SELECT
        anio,
        semana,
        SUM(pedidos_dia)                          AS cantidad_pedidos,
        MAX(prestadores_dia)                      AS prestadores,
        ROUND(AVG(productividad_dia), 1)          AS productividad,
        FORMAT_DATE('%Y-%m-%d', MIN(semana_inicio)) AS fecha_inicio_semana
    FROM base
    GROUP BY 1, 2
    ORDER BY MIN(semana_inicio)
    """
    return run_query(sql).to_dict(orient="records")



# ─── KPI Diario ───────────────────────────────────────────────────────────────
@app.get("/api/kpi-diario")
def kpi_diario(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    local:         Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
    rol:           Optional[str] = Query(None),
):
    """Datos día a día para el drill de nivel Día."""
    where = date_filter(fecha_inicio, fecha_fin)
    extra = "AND fecha_control IS NOT NULL"
    sql_where = (where + " " + extra) if where else ("WHERE fecha_control IS NOT NULL")
    if local:         sql_where += f" AND nro_local = '{local}'"
    if tipo_servicio: sql_where += f" AND tipo_servicio = '{tipo_servicio}'"
    if rol:           sql_where += f" AND rol_persona = '{rol}'"
    sql = f"""
        SELECT
            FORMAT_DATE('%Y-%m-%d', DATE(fecha_control))  AS dia,
            EXTRACT(ISOWEEK FROM fecha_control)           AS semana,
            EXTRACT(ISOYEAR FROM fecha_control)           AS anio,
            COUNT(DISTINCT shipping_group)                AS cantidad_pedidos,
            COUNT(DISTINCT rut_persona)                   AS prestadores,
            ROUND(SAFE_DIVIDE(
                COUNT(DISTINCT shipping_group),
                COUNT(DISTINCT rut_persona)
            ), 1)                                         AS productividad
        FROM `{FULL_TABLE}`
        {sql_where}
        GROUP BY 1, 2, 3
        ORDER BY 1
    """
    return run_query(sql).to_dict(orient="records")

# ─── Diagnóstico temporal ─────────────────────────────────────────────────────
@app.get("/api/debug-beetrak")
def debug_beetrak():
    sql = """
        SELECT
            MIN(DATE(fecha_primer_intento)) AS fecha_min,
            MAX(DATE(fecha_primer_intento)) AS fecha_max,
            COUNT(*)                        AS total_filas,
            COUNTIF(fecha_primer_intento IS NOT NULL) AS con_fecha
        FROM `sigmc-5fae5.dataflow.beetrak`
    """
    return run_query(sql).iloc[0].to_dict()


@app.get("/api/debug-pfa")
def debug_pfa():
    sql = """
        SELECT
            MIN(DATE(fecha_control)) AS fecha_min,
            MAX(DATE(fecha_control)) AS fecha_max,
            COUNT(*)                 AS total_filas
        FROM `sigmc-5fae5.dataflow.pfa`
    """
    return run_query(sql).iloc[0].to_dict()


# ─── KPI Operación: Completitud + Tiempo Armado + OnTime ─────────────────────
@app.get("/api/kpi-operacion")
def kpi_operacion(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    semana:        Optional[int] = Query(None),
    local:         Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
    rol:           Optional[str] = Query(None),
):
    # Armar filtros PFA
    pfa_clauses = []
    if fecha_inicio: pfa_clauses.append(f"DATE(fecha_control) >= '{fecha_inicio}'")
    if fecha_fin:    pfa_clauses.append(f"DATE(fecha_control) <= '{fecha_fin}'")
    if local:         pfa_clauses.append(f"nro_local = '{local}'")
    if tipo_servicio: pfa_clauses.append(f"tipo_servicio = '{tipo_servicio}'")
    if rol:           pfa_clauses.append(f"rol_persona = '{rol}'")
    pfa_date_and = ("AND " + " AND ".join(pfa_clauses)) if pfa_clauses else ""

    # Armar filtros Beetrak (Beetrak solo usa local)
    beet_clauses = []
    if fecha_inicio: beet_clauses.append(f"DATE(tiempo_min_entrega) >= '{fecha_inicio}'")
    if fecha_fin:    beet_clauses.append(f"DATE(tiempo_min_entrega) <= '{fecha_fin}'")
    if local:        beet_clauses.append(f"local = '{local}'")
    beet_date_and = ("AND " + " AND ".join(beet_clauses)) if beet_clauses else ""

    if semana is not None:
        # ── Nivel día: agrupa por DATE dentro de la semana seleccionada ──
        pfa_semana_and  = f"AND EXTRACT(ISOWEEK FROM fecha_control)     = {semana}"
        beet_semana_and = f"AND EXTRACT(ISOWEEK FROM tiempo_min_entrega) = {semana}"
        sql = f"""
WITH pfa_day AS (
    SELECT
        DATE(fecha_control)                               AS dia,
        EXTRACT(ISOYEAR FROM fecha_control)               AS anio,
        EXTRACT(ISOWEEK  FROM fecha_control)              AS semana,
        ROUND(SAFE_DIVIDE(
            SUM(unidades_pickeadas),
            SUM(unidades_solicitadas)
        ) * 100, 1)                                       AS completitud_pct,
        ROUND(AVG(
            TIMESTAMP_DIFF(fin_picking, inicio_picking, SECOND) / 60.0
        ), 1)                                             AS tiempo_armado_min,
        ROUND(AVG(items_solicitados), 0)                  AS promedio_items
    FROM `sigmc-5fae5.dataflow.pfa`
    WHERE fecha_control  IS NOT NULL
      AND inicio_picking IS NOT NULL
      AND fin_picking    IS NOT NULL
      {pfa_date_and}
      {pfa_semana_and}
    GROUP BY 1, 2, 3
),
beet_day AS (
        SELECT
            DATE(tiempo_min_entrega)                           AS dia,
            ROUND(SAFE_DIVIDE(
                COUNTIF(fecha_primer_intento <= tiempo_max_entrega),
                COUNT(*)
            ) * 100, 1)                                        AS ontime_pct
        FROM `sigmc-5fae5.dataflow.beetrak`
        WHERE tiempo_min_entrega   IS NOT NULL
          AND tiempo_max_entrega   IS NOT NULL
          AND fecha_primer_intento IS NOT NULL
          AND {FILTRO_LAT_BEETRAK}
          {beet_date_and}
          {beet_semana_and}
        GROUP BY 1
    )

SELECT
    p.anio,
    p.semana,
    FORMAT_DATE('%Y-%m-%d', p.dia) AS semana_inicio,
    p.completitud_pct,
    p.tiempo_armado_min,
    p.promedio_items,
    b.ontime_pct
FROM pfa_day p
LEFT JOIN beet_day b ON p.dia = b.dia
ORDER BY p.dia
"""
    else:
        # ── Nivel semana: agrupación original por ISOWEEK ──
        sql = f"""
WITH pfa_sem AS (
    SELECT
        DATE_TRUNC(DATE(fecha_control), WEEK(MONDAY))     AS semana_lunes,
        EXTRACT(ISOYEAR FROM fecha_control)               AS anio,
        EXTRACT(ISOWEEK  FROM fecha_control)              AS semana,
        ROUND(SAFE_DIVIDE(
            SUM(unidades_pickeadas),
            SUM(unidades_solicitadas)
        ) * 100, 1)                                       AS completitud_pct,
        ROUND(AVG(
            TIMESTAMP_DIFF(fin_picking, inicio_picking, SECOND) / 60.0
        ), 1)                                             AS tiempo_armado_min,
        ROUND(AVG(items_solicitados), 0)                  AS promedio_items
    FROM `sigmc-5fae5.dataflow.pfa`
    WHERE fecha_control  IS NOT NULL
      AND inicio_picking IS NOT NULL
      AND fin_picking    IS NOT NULL
      {pfa_date_and}
    GROUP BY 1, 2, 3
),
beet_sem AS (
        SELECT
            DATE_TRUNC(DATE(tiempo_min_entrega), WEEK(MONDAY)) AS semana_lunes,
            ROUND(SAFE_DIVIDE(
                COUNTIF(fecha_primer_intento <= tiempo_max_entrega),
                COUNT(*)
            ) * 100, 1)                                        AS ontime_pct
        FROM `sigmc-5fae5.dataflow.beetrak`
        WHERE tiempo_min_entrega   IS NOT NULL
          AND tiempo_max_entrega   IS NOT NULL
          AND fecha_primer_intento IS NOT NULL
          AND {FILTRO_LAT_BEETRAK}
          {beet_date_and}
        GROUP BY 1
    )
SELECT
    p.anio,
    p.semana,
    FORMAT_DATE('%Y-%m-%d', p.semana_lunes) AS semana_inicio,
    p.completitud_pct,
    p.tiempo_armado_min,
    p.promedio_items,
    b.ontime_pct
FROM pfa_sem p
LEFT JOIN beet_sem b ON p.semana_lunes = b.semana_lunes
ORDER BY p.semana_lunes
"""
    return run_query(sql).to_dict(orient="records")


# ═══════════════════════════════════════════════════════════════════════════════
# PANEL SECUNDARIAS — endpoints Beetrak
# ═══════════════════════════════════════════════════════════════════════════════

def beetrak_filters(
    local: Optional[int],
    fecha_inicio: Optional[str],
    fecha_fin: Optional[str],
) -> str:
    clauses = [
        "tiempo_min_entrega IS NOT NULL",
        FILTRO_LAT_BEETRAK
    ]

    if local and local in START_DATE_POR_LOCAL:
        clauses.append(f"DATE(tiempo_min_entrega) >= '{START_DATE_POR_LOCAL[local]}'")

    if fecha_inicio:
        clauses.append(f"DATE(tiempo_min_entrega) >= '{fecha_inicio}'")
    if fecha_fin:
        clauses.append(f"DATE(tiempo_min_entrega) <= '{fecha_fin}'")

    if local:
        clauses.append(f"local = '{local}'")

    if local and local in PROVEEDORES_POR_LOCAL:
        provs = PROVEEDORES_POR_LOCAL[local]
        ppus_permitidos = [
            f"'{ppu}'"
            for ppu, transp in PPU_TRANSPORTADORA.items()
            if transp in provs
        ]
        if ppus_permitidos:
            clauses.append(
                f"LEFT(identificador, 4) IN ({','.join(ppus_permitidos)})"
            )

    return "WHERE " + " AND ".join(clauses)


@app.get("/api/secundarias/locales")
def secundarias_locales():
    return [{"local": l, "proveedores": PROVEEDORES_POR_LOCAL.get(l, [])}
            for l in LOCALES_SECUNDARIAS]


@app.get("/api/secundarias/kpis")
def secundarias_kpis(
    local: Optional[int] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
):
    where = beetrak_filters(local, fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            COUNT(DISTINCT orden)                                 AS total_pedidos,
            COUNT(DISTINCT LEFT(identificador, 4))               AS total_ppus,
            COUNT(DISTINCT identificador)                        AS total_prestadores,
            ROUND(SAFE_DIVIDE(
                COUNTIF(fecha_primer_intento <= tiempo_max_entrega),
                COUNT(*)
            ) * 100, 1)                                          AS ontime_pct,
            COUNT(DISTINCT local)                                AS total_locales
        FROM `{BEETRAK_TABLE}`
        {where}
    """
    return run_query(sql).iloc[0].to_dict()


@app.get("/api/secundarias/semanal")
def secundarias_semanal(
    local: Optional[int] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
):
    where = beetrak_filters(local, fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            EXTRACT(ISOWEEK FROM tiempo_min_entrega)              AS semana,
            EXTRACT(ISOYEAR FROM tiempo_min_entrega)              AS anio,
            FORMAT_DATE('%Y-%m-%d',
                DATE_TRUNC(DATE(tiempo_min_entrega), WEEK(MONDAY))) AS semana_inicio,
            LEFT(identificador, 4)                                AS ppu,
            CASE LEFT(identificador, 4)
                WHEN 'DRVS' THEN 'Valdishopper' WHEN 'HDVS' THEN 'Valdishopper' WHEN 'LTVS' THEN 'Valdishopper'
                WHEN 'DRTH' THEN 'Titask'       WHEN 'LTTH' THEN 'Titask'
                WHEN 'DRBM' THEN 'Boosmap'      WHEN 'LTBM' THEN 'Boosmap'
                WHEN 'DRFX' THEN 'Foxer'        WHEN 'LTFX' THEN 'Foxer'
                WHEN 'LTGP' THEN 'GPS'          WHEN 'DRGP' THEN 'GPS'
                WHEN 'DRZB' THEN 'Zubale'       WHEN 'LTZB' THEN 'Zubale'
                WHEN 'Uber' THEN 'Uber'         ELSE 'Sin clasificar'
            END                                                   AS transportadora,
            COUNT(DISTINCT identificador)                         AS prestadores,
            COUNT(DISTINCT orden)                                 AS pedidos,
            ROUND(SAFE_DIVIDE(COUNTIF(fecha_primer_intento <= tiempo_max_entrega), COUNT(*)) * 100, 1) AS ontime_pct
        FROM `{BEETRAK_TABLE}`
        {where}
        GROUP BY 1, 2, 3, 4, 5
        ORDER BY semana_inicio, transportadora
    """
    return run_query(sql).to_dict(orient="records")

@app.get("/api/secundarias/diario")
def secundarias_diario(
    local: Optional[int] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
):
    where = beetrak_filters(local, fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            FORMAT_DATE('%Y-%m-%d', DATE(tiempo_min_entrega)) AS dia,
            EXTRACT(ISOWEEK FROM tiempo_min_entrega)          AS semana,
            EXTRACT(ISOYEAR FROM tiempo_min_entrega)          AS anio,
            LEFT(identificador, 4)                            AS ppu,
            CASE LEFT(identificador, 4)
                WHEN 'DRVS' THEN 'Valdishopper' WHEN 'HDVS' THEN 'Valdishopper' WHEN 'LTVS' THEN 'Valdishopper'
                WHEN 'DRTH' THEN 'Titask'       WHEN 'LTTH' THEN 'Titask'
                WHEN 'DRBM' THEN 'Boosmap'      WHEN 'LTBM' THEN 'Boosmap'
                WHEN 'DRFX' THEN 'Foxer'        WHEN 'LTFX' THEN 'Foxer'
                WHEN 'LTGP' THEN 'GPS'          WHEN 'DRGP' THEN 'GPS'
                WHEN 'DRZB' THEN 'Zubale'       WHEN 'LTZB' THEN 'Zubale'
                WHEN 'Uber' THEN 'Uber'         ELSE 'Sin clasificar'
            END                                               AS transportadora,
            COUNT(DISTINCT identificador)                     AS prestadores,
            COUNT(DISTINCT orden)                             AS pedidos,
            ROUND(SAFE_DIVIDE(COUNTIF(fecha_primer_intento <= tiempo_max_entrega), COUNT(*)) * 100, 1) AS ontime_pct
        FROM `{BEETRAK_TABLE}`
        {where}
        GROUP BY 1, 2, 3, 4, 5
        ORDER BY dia, transportadora
    """
    return run_query(sql).to_dict(orient="records")


@app.get("/api/secundarias/ppu")
def secundarias_ppu(
    local: Optional[int] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
):
    where = beetrak_filters(local, fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            LEFT(identificador, 4)    AS ppu,
            CASE LEFT(identificador, 4)
                WHEN 'DRVS' THEN 'Valdishopper'
                WHEN 'HDVS' THEN 'Valdishopper'
                WHEN 'LTVS' THEN 'Valdishopper'
                WHEN 'DRTH' THEN 'Titask'
                WHEN 'LTTH' THEN 'Titask'
                WHEN 'DRBM' THEN 'Boosmap'
                WHEN 'LTBM' THEN 'Boosmap'
                WHEN 'DRFX' THEN 'Foxer'
                WHEN 'LTFX' THEN 'Foxer'
                WHEN 'LTGP' THEN 'GPS'
                WHEN 'DRZB' THEN 'Zubale'
                WHEN 'LTZB' THEN 'Zubale'
                WHEN 'Uber' THEN 'Uber'
                ELSE 'Sin clasificar'
            END                       AS transportadora,
            COUNT(DISTINCT orden)                                        AS pedidos,
            ROUND(COUNT(DISTINCT orden) * 100.0 / SUM(COUNT(DISTINCT orden)) OVER(), 2) AS pct
        FROM `{BEETRAK_TABLE}`
        {where}
        GROUP BY 1, 2
        ORDER BY pedidos DESC
    """
    return run_query(sql).to_dict(orient="records")


# ── Filtros dinámicos panel LAT ───────────────────────────────────────────
@app.get("/api/lat/filtros")
def lat_filtros(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin:    Optional[str] = Query(None),
):
    """Retorna opciones únicas para los 3 filtros del panel LAT."""
    where = date_filter(fecha_inicio, fecha_fin)
    
    # Extraemos las listas de forma independiente y ordenamos el local numéricamente de mayor a menor
    df_locales = run_query(f"SELECT DISTINCT nro_local FROM `{FULL_TABLE}` {where} AND nro_local IS NOT NULL ORDER BY SAFE_CAST(nro_local AS INT64) ASC")
    df_tipos   = run_query(f"SELECT DISTINCT tipo_servicio FROM `{FULL_TABLE}` {where} AND tipo_servicio IS NOT NULL ORDER BY 1")
    df_roles   = run_query(f"SELECT DISTINCT rol_persona FROM `{FULL_TABLE}` {where} AND rol_persona IS NOT NULL ORDER BY 1")
    
    return {
        "locales":        df_locales["nro_local"].astype(str).tolist() if not df_locales.empty else [],
        "tipos_servicio": df_tipos["tipo_servicio"].astype(str).tolist() if not df_tipos.empty else [],
        "roles":          df_roles["rol_persona"].astype(str).tolist() if not df_roles.empty else [],
    }


# ── KPIs completos panel LAT ──────────────────────────────────────────────
@app.get("/api/lat/kpis")
def lat_kpis(
    fecha_inicio:   Optional[str] = Query(None),
    fecha_fin:      Optional[str] = Query(None),
    local:          Optional[str] = Query(None),
    tipo_servicio:  Optional[str] = Query(None),
    rol:            Optional[str] = Query(None),
):
    """
    KPIs resumen con filtros de local, tipo_servicio y rol_persona.
    - Pedidos       = COUNT(DISTINCT shipping_group)
    - Prestadores   = COUNT(DISTINCT rut_persona)
    - Productividad = AVG diario de (pedidos/prestadores)
    - Completitud   = SUM(unidades_pickeadas) / SUM(unidades_solicitadas)
    - Tiempo Armado = AVG(TIMESTAMP_DIFF(fin_picking, inicio_picking, SECOND)/60)
    - Items         = AVG(items_solicitados)
    - OnTime        = desde beetrak JOIN por semana
    """
    clauses = []
    if fecha_inicio:
        clauses.append(f"DATE(fecha_control) >= '{fecha_inicio}'")
    if fecha_fin:
        clauses.append(f"DATE(fecha_control) <= '{fecha_fin}'")
    if local:
        clauses.append(f"nro_local = '{local}'")
    if tipo_servicio:
        clauses.append(f"tipo_servicio = '{tipo_servicio}'")
    if rol:
        clauses.append(f"rol_persona = '{rol}'")

    where_pfa = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    # OnTime desde beetrak (mismo rango de fechas)
    beet_clauses = []
    if fecha_inicio:
        beet_clauses.append(f"DATE(tiempo_min_entrega) >= '{fecha_inicio}'")
    if fecha_fin:
        beet_clauses.append(f"DATE(tiempo_min_entrega) <= '{fecha_fin}'")
    where_beet = ("WHERE " + " AND ".join(beet_clauses) + " AND fecha_primer_intento IS NOT NULL AND tiempo_max_entrega IS NOT NULL") if beet_clauses else "WHERE fecha_primer_intento IS NOT NULL AND tiempo_max_entrega IS NOT NULL"

    sql = f"""
    WITH pfa_data AS (
        SELECT
            COUNT(DISTINCT shipping_group)                          AS pedidos,
            COUNT(DISTINCT rut_persona)                             AS prestadores,
            ROUND(SAFE_DIVIDE(
                SUM(unidades_pickeadas), SUM(unidades_solicitadas)
            ) * 100, 1)                                             AS completitud_pct,
            ROUND(AVG(
                TIMESTAMP_DIFF(fin_picking, inicio_picking, SECOND) / 60.0
            ), 1)                                                   AS tiempo_armado_min,
            ROUND(AVG(items_solicitados), 0)                        AS promedio_items
        FROM `{FULL_TABLE}`
        {where_pfa}
    ),
    prod_data AS (
        SELECT ROUND(AVG(prod_dia), 1) AS productividad
        FROM (
            SELECT
                DATE(fecha_control) AS dia,
                SAFE_DIVIDE(
                    COUNT(DISTINCT shipping_group),
                    COUNT(DISTINCT rut_persona)
                ) AS prod_dia
            FROM `{FULL_TABLE}`
            {where_pfa}
            GROUP BY 1
        )
    ),
    beet_data AS (
        SELECT ROUND(SAFE_DIVIDE(
            COUNTIF(fecha_primer_intento <= tiempo_max_entrega),
            COUNT(*)
        ) * 100, 1) AS ontime_pct
        FROM `{BEETRAK_TABLE}`
        {where_beet}
    )
    SELECT
        p.pedidos, p.prestadores, p.completitud_pct,
        p.tiempo_armado_min, p.promedio_items,
        pr.productividad,
        b.ontime_pct
    FROM pfa_data p
    CROSS JOIN prod_data pr
    CROSS JOIN beet_data b
    """
    df = run_query(sql)
    return df.iloc[0].to_dict()


# ═══════════════════════════════════════════════════════════════════════════════
# PANEL HD — endpoints Beetrak (HDVS Estival / Modelo Mixto)
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/hd/kpis")
def hd_kpis(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    local:         Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
):
    where = hd_base_filters(fecha_inicio, fecha_fin, local, tipo_servicio)
    sql = f"""
    WITH base AS (
        SELECT
            COUNT(DISTINCT orden)                                   AS pedidos,
            COUNT(DISTINCT identificador_ruta)                     AS rutas,
            COUNT(DISTINCT identificador)                          AS moviles,
            ROUND(SAFE_DIVIDE(
                COUNTIF(fecha_llegada IS NOT NULL AND fecha_llegada <= tiempo_max_entrega),
                COUNT(*)
            ) * 100, 1)                                            AS ontime_pct
        FROM `{BEETRAK_TABLE}`
        {where}
    ),
    prod AS (
        SELECT ROUND(AVG(prod_dia), 1) AS productividad
        FROM (
            SELECT
                DATE(tiempo_min_entrega) AS dia,
                SAFE_DIVIDE(
                    COUNT(DISTINCT orden),
                    COUNT(DISTINCT identificador)
                ) AS prod_dia
            FROM `{BEETRAK_TABLE}`
            {where}
            GROUP BY 1
        )
    )
    SELECT b.pedidos, b.rutas, b.moviles, b.ontime_pct, p.productividad
    FROM base b CROSS JOIN prod p
    """
    df = run_query(sql)
    return df.iloc[0].to_dict()


@app.get("/api/hd/locales")
def hd_locales(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
):
    where = hd_base_filters(fecha_inicio, fecha_fin, None, tipo_servicio)
    sql = f"""
        SELECT DISTINCT local
        FROM `{BEETRAK_TABLE}`
        {where}
        AND local IS NOT NULL
        ORDER BY SAFE_CAST(local AS INT64)
    """
    df = run_query(sql)
    return {"locales": df["local"].astype(str).tolist()}


@app.get("/api/hd/semanal")
def hd_semanal(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    local:         Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
):
    where = hd_base_filters(fecha_inicio, fecha_fin, local, tipo_servicio)
    sql = f"""
    WITH base AS (
        SELECT
            EXTRACT(ISOYEAR FROM tiempo_min_entrega)                AS anio,
            EXTRACT(ISOWEEK  FROM tiempo_min_entrega)               AS semana,
            FORMAT_DATE('%Y-%m-%d',
                DATE_TRUNC(DATE(tiempo_min_entrega), WEEK(MONDAY))) AS semana_inicio,
            DATE(tiempo_min_entrega)                                AS dia,
            COUNT(DISTINCT identificador_ruta)                      AS rutas_dia,
            COUNT(DISTINCT identificador)                           AS moviles_dia,
            SAFE_DIVIDE(
                COUNT(DISTINCT orden),
                COUNT(DISTINCT identificador)
            )                                                       AS prod_dia,
            COUNTIF(fecha_llegada IS NOT NULL AND fecha_llegada <= tiempo_max_entrega) AS ontime_cnt,
            COUNT(*)                                                AS total_cnt
        FROM `{BEETRAK_TABLE}`
        {where}
        GROUP BY 1, 2, 3, 4
    )
    SELECT
        anio,
        semana,
        semana_inicio,
        SUM(rutas_dia)                            AS rutas,
        MAX(moviles_dia)                          AS moviles,
        ROUND(AVG(prod_dia), 1)                   AS productividad,
        ROUND(SAFE_DIVIDE(
            SUM(ontime_cnt), SUM(total_cnt)
        ) * 100, 1)                               AS ontime_pct
    FROM base
    GROUP BY 1, 2, 3
    ORDER BY semana_inicio
    """
    return run_query(sql).to_dict(orient="records")


@app.get("/api/hd/por-local")
def hd_por_local(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    local:         Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
):
    where = hd_base_filters(fecha_inicio, fecha_fin, local, tipo_servicio)
    sql = f"""
    WITH base AS (
        SELECT
            local,
            DATE(tiempo_min_entrega)               AS dia,
            COUNT(DISTINCT identificador_ruta)     AS rutas_dia,
            COUNT(DISTINCT identificador)          AS moviles_dia,
            SAFE_DIVIDE(
                COUNT(DISTINCT orden),
                COUNT(DISTINCT identificador)
            )                                      AS prod_dia,
            COUNTIF(fecha_llegada IS NOT NULL AND fecha_llegada <= tiempo_max_entrega) AS ontime_cnt,
            COUNT(*)                               AS total_cnt
        FROM `{BEETRAK_TABLE}`
        {where}
        GROUP BY 1, 2
    )
    SELECT
        local,
        SUM(rutas_dia)                            AS rutas,
        MAX(moviles_dia)                          AS moviles,
        ROUND(AVG(prod_dia), 1)                   AS productividad,
        ROUND(SAFE_DIVIDE(
            SUM(ontime_cnt), SUM(total_cnt)
        ) * 100, 1)                               AS ontime_pct
    FROM base
    GROUP BY 1
    ORDER BY SAFE_CAST(local AS INT64)
    """
    return run_query(sql).to_dict(orient="records")


@app.get("/api/hd/diario")
def hd_diario(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    local:         Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
):
    where = hd_base_filters(fecha_inicio, fecha_fin, local, tipo_servicio)
    sql = f"""
        SELECT
            FORMAT_DATE('%Y-%m-%d', DATE(tiempo_min_entrega))  AS dia,
            EXTRACT(ISOWEEK FROM tiempo_min_entrega)           AS semana,
            EXTRACT(ISOYEAR FROM tiempo_min_entrega)           AS anio,
            COUNT(DISTINCT identificador_ruta)                 AS rutas,
            COUNT(DISTINCT identificador)                      AS moviles,
            ROUND(SAFE_DIVIDE(
                COUNT(DISTINCT orden),
                COUNT(DISTINCT identificador)
            ), 1)                                              AS productividad,
            ROUND(SAFE_DIVIDE(
                COUNTIF(fecha_llegada IS NOT NULL AND fecha_llegada <= tiempo_max_entrega),
                COUNT(*)
            ) * 100, 1)                                        AS ontime_pct
        FROM `{BEETRAK_TABLE}`
        {where}
        GROUP BY 1, 2, 3
        ORDER BY 1
    """
    return run_query(sql).to_dict(orient="records")


@app.get("/hd")
def hd_page():
    return FileResponse("grafico_semanal.html")


# ═══════════════════════════════════════════════════════════════════════════════
# PANEL FALABELLA — endpoints tabla falabella
# ═══════════════════════════════════════════════════════════════════════════════

FALABELLA_TABLE = "sigmc-5fae5.dataflow.falabella"

# Corrige inversión día/mes detectada en datos de origen
FB_FECHA = """
    CASE
        WHEN EXTRACT(DAY FROM Fechainicioruta) <= 12
        THEN DATE(
            EXTRACT(YEAR  FROM Fechainicioruta),
            EXTRACT(DAY   FROM Fechainicioruta),
            EXTRACT(MONTH FROM Fechainicioruta)
        )
        ELSE DATE(Fechainicioruta)
    END
"""

# Normalización de CT: agrupa variantes y omite tiendas/omnicanal
FB_CT_NORM = """
    CASE Ct
        WHEN 'CT VALPARAISO (WMOS)'                    THEN 'CT VALPARAISO'
        WHEN 'CT CONCEPCION (WMOS)'                    THEN 'CT CONCEPCION'
        WHEN 'CT Concepcion Kiosclub'                  THEN 'CT CONCEPCION'
        WHEN 'CT Concepción superzoo'                  THEN 'CT CONCEPCION'
        WHEN 'HUB XD'                                  THEN 'HUB XD'
        WHEN 'HUB XD Same Day'                         THEN 'HUB XD'
        WHEN 'CT VALDIVIA (WMOS)'                      THEN 'CT VALDIVIA'
        WHEN 'CT Valdivia Kiosclub'                    THEN 'CT VALDIVIA'
        WHEN 'CT Valdivia superzoo'                    THEN 'CT VALDIVIA'
        WHEN 'CT PUERTO MONTT (WMOS)'                  THEN 'CT PUERTO MONTT'
        WHEN 'CT PUERTO MONTT'                         THEN 'CT PUERTO MONTT'
        WHEN 'CT FBY FALABELLA CHILE MINI-MIDI (WMOS)' THEN 'TREN LOGISTICO'
        WHEN 'CT RANCAGUA (WMOS)'                      THEN 'CT RANCAGUA'
        WHEN 'CT RANCAGUA SAMEDAY'                     THEN 'CT RANCAGUA'
        WHEN 'CT TALCA (WMOS)'                         THEN 'CT TALCA'
        WHEN 'CT TEMUCO (WMOS)'                        THEN 'CT TEMUCO'
        WHEN 'CT LOS ANGELES'                          THEN 'CT LOS ANGELES'
        WHEN 'CT OSORNO (WMOS)'                        THEN 'CT OSORNO'
        WHEN 'BIG TICKET FBY'                          THEN 'BIG TICKET'
        ELSE NULL
    END
"""

# Los CT con ELSE NULL son omitidos automáticamente con WHERE ct_norm IS NOT NULL

FB_ZONA = """
    CASE Ct
        WHEN 'CT VALPARAISO (WMOS)'                    THEN 'Regiones'
        WHEN 'CT CONCEPCION (WMOS)'                    THEN 'Regiones'
        WHEN 'CT Concepcion Kiosclub'                  THEN 'Regiones'
        WHEN 'CT Concepción superzoo'                  THEN 'Regiones'
        WHEN 'HUB XD'                                  THEN 'RM'
        WHEN 'HUB XD Same Day'                         THEN 'RM'
        WHEN 'CT VALDIVIA (WMOS)'                      THEN 'Regiones'
        WHEN 'CT Valdivia Kiosclub'                    THEN 'Regiones'
        WHEN 'CT Valdivia superzoo'                    THEN 'Regiones'
        WHEN 'CT PUERTO MONTT (WMOS)'                  THEN 'Regiones'
        WHEN 'CT PUERTO MONTT'                         THEN 'Regiones'
        WHEN 'CT FBY FALABELLA CHILE MINI-MIDI (WMOS)' THEN 'RM'
        WHEN 'CT RANCAGUA (WMOS)'                      THEN 'Regiones'
        WHEN 'CT RANCAGUA SAMEDAY'                     THEN 'Regiones'
        WHEN 'CT TALCA (WMOS)'                         THEN 'Regiones'
        WHEN 'CT TEMUCO (WMOS)'                        THEN 'Regiones'
        WHEN 'CT LOS ANGELES'                          THEN 'Regiones'
        WHEN 'CT OSORNO (WMOS)'                        THEN 'Regiones'
        WHEN 'BIG TICKET FBY'                          THEN 'RM'
        ELSE NULL
    END
"""


def fb_clean(obj):
    """Reemplaza np.nan / float('nan') por None en dicts y listas."""
    if isinstance(obj, list):
        return [fb_clean(i) for i in obj]
    if isinstance(obj, dict):
        return {
            k: (None if isinstance(v, float) and math.isnan(v) else fb_clean(v))
            for k, v in obj.items()
        }
    if isinstance(obj, float) and math.isnan(obj):
        return None
    return obj


def falabella_filters(
    fecha_inicio=None,
    fecha_fin=None,
    ct=None,
    zona=None,
    semana=None,
) -> str:
    clauses = []
    clauses.append(f"({FB_CT_NORM}) IS NOT NULL")
    clauses.append("Fechainicioruta IS NOT NULL")
    if fecha_inicio:
        clauses.append(f"({FB_FECHA}) >= '{fecha_inicio}'")
    if fecha_fin:
        clauses.append(f"({FB_FECHA}) <= '{fecha_fin}'")
    if zona:
        clauses.append(f"({FB_ZONA}) = '{zona}'")
    if ct:
        if isinstance(ct, list):
            if len(ct) == 1:
                clauses.append(f"({FB_CT_NORM}) = '{ct[0]}'")
            else:
                ct_list = "','".join(ct)
                clauses.append(f"({FB_CT_NORM}) IN ('{ct_list}')")
        else:
            clauses.append(f"({FB_CT_NORM}) = '{ct}'")
    if semana:
        if isinstance(semana, list):
            if len(semana) == 1:
                clauses.append(
                    f"EXTRACT(ISOWEEK FROM ({FB_FECHA})) = {semana[0]}")
            else:
                sem_list = ",".join(str(s) for s in semana)
                clauses.append(
                    f"EXTRACT(ISOWEEK FROM ({FB_FECHA})) IN ({sem_list})")
        else:
            clauses.append(
                f"EXTRACT(ISOWEEK FROM ({FB_FECHA})) = {semana}")
    return "WHERE " + " AND ".join(clauses)


@app.get("/api/falabella/kpis")
def falabella_kpis(
    fecha_inicio: Optional[str]       = Query(None),
    fecha_fin:    Optional[str]       = Query(None),
    ct:           Optional[List[str]] = Query(None),
    zona:         Optional[str]       = Query(None),
    semana:       Optional[List[int]] = Query(None),
):
    where = falabella_filters(fecha_inicio, fecha_fin, ct, zona, semana)
    sql = f"""
    SELECT
        COUNT(DISTINCT Idruta)                                              AS rutas,
        COUNT(DISTINCT Patente)                                             AS moviles,
        COUNTIF(Estado = 'Terminado')                                       AS terminados,
        COUNTIF(Estado = 'Pendiente')                                       AS pendientes,
        ROUND(SAFE_DIVIDE(
            COUNTIF(Estado = 'Terminado'),
            COUNTIF(Estado = 'Terminado') + COUNTIF(Estado = 'Pendiente')
        ) * 100, 1)                                                         AS fill_rate
    FROM `{FALABELLA_TABLE}`
    {where}
    """
    df = run_query(sql)
    return fb_clean(df.iloc[0].to_dict())


@app.get("/api/falabella/evolucion")
def falabella_evolucion(
    fecha_inicio: Optional[str]       = Query(None),
    fecha_fin:    Optional[str]       = Query(None),
    ct:           Optional[List[str]] = Query(None),
    granularidad: Optional[str]       = Query("week"),
    zona:         Optional[str]       = Query(None),
    semana:       Optional[List[int]] = Query(None),
):
    ct_clause   = ""
    zona_clause = ""
    sem_clause  = ""
    fi_clause = f"AND fecha_norm >= '{fecha_inicio}'" if fecha_inicio else ""
    ff_clause = f"AND fecha_norm <= '{fecha_fin}'"    if fecha_fin    else ""

    if ct:
        if len(ct) == 1:
            ct_clause = f"AND ct_norm = '{ct[0]}'"
        else:
            ct_list = "','".join(ct)
            ct_clause = f"AND ct_norm IN ('{ct_list}')"

    if zona:
        zona_clause = f"AND zona_norm = '{zona}'"

    if semana:
        if len(semana) == 1:
            sem_clause = f"AND EXTRACT(ISOWEEK FROM fecha_norm) = {semana[0]}"
        else:
            sem_list = ",".join(str(s) for s in semana)
            sem_clause = f"AND EXTRACT(ISOWEEK FROM fecha_norm) IN ({sem_list})"

    if granularidad == "day":
        periodo_expr = "FORMAT_DATE('%Y-%m-%d', fecha_norm)"
        semana_col   = "CAST(NULL AS STRING) AS semana_inicio"
        anio_expr    = "EXTRACT(YEAR FROM fecha_norm)"
        semana_expr  = "CAST(NULL AS INT64) AS semana"
        group_by     = "periodo, anio"
        order_by     = "periodo"
    elif granularidad == "month":
        periodo_expr = "FORMAT_DATE('%Y-%m', fecha_norm)"
        semana_col   = "CAST(NULL AS STRING) AS semana_inicio"
        anio_expr    = "EXTRACT(YEAR FROM fecha_norm)"
        semana_expr  = "CAST(NULL AS INT64) AS semana"
        group_by     = "periodo, anio"
        order_by     = "periodo"
    else:
        periodo_expr = "FORMAT_DATE('%Y-S%V', DATE_TRUNC(fecha_norm, WEEK(MONDAY)))"
        semana_col   = "FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(fecha_norm, WEEK(MONDAY))) AS semana_inicio"
        anio_expr    = "EXTRACT(ISOYEAR FROM fecha_norm)"
        semana_expr  = "EXTRACT(ISOWEEK FROM fecha_norm) AS semana"
        group_by     = "periodo, semana_inicio, anio, semana"
        order_by     = "semana_inicio"

    sql = f"""
    WITH base AS (
        SELECT
            CASE
                WHEN EXTRACT(DAY FROM Fechainicioruta) <= 12
                THEN DATE(
                    EXTRACT(YEAR  FROM Fechainicioruta),
                    EXTRACT(DAY   FROM Fechainicioruta),
                    EXTRACT(MONTH FROM Fechainicioruta)
                )
                ELSE DATE(Fechainicioruta)
            END AS fecha_norm,
            {FB_CT_NORM} AS ct_norm,
            {FB_ZONA}    AS zona_norm,
            Idruta,
            Estado
        FROM `{FALABELLA_TABLE}`
        WHERE Fechainicioruta IS NOT NULL
          AND ({FB_CT_NORM}) IS NOT NULL
    ),
    filtrado AS (
        SELECT *
        FROM base
        WHERE 1=1
        {fi_clause}
        {ff_clause}
        {ct_clause}
        {zona_clause}
        {sem_clause}
    )
    SELECT
        {periodo_expr}                                  AS periodo,
        {semana_col},
        {anio_expr}                                     AS anio,
        {semana_expr},
        COUNT(DISTINCT Idruta)                          AS rutas,
        ROUND(SAFE_DIVIDE(
            COUNTIF(Estado = 'Terminado'),
            COUNTIF(Estado = 'Terminado') + COUNTIF(Estado = 'Pendiente')
        ) * 100, 1)                                     AS fill_rate
    FROM filtrado
    GROUP BY {group_by}
    ORDER BY {order_by}
    """
    return fb_clean(run_query(sql).to_dict(orient="records"))


@app.get("/api/falabella/por-ct")
def falabella_por_ct(
    fecha_inicio: Optional[str]       = Query(None),
    fecha_fin:    Optional[str]       = Query(None),
    ct:           Optional[List[str]] = Query(None),
    zona:         Optional[str]       = Query(None),
    semana:       Optional[List[int]] = Query(None),
):
    where = falabella_filters(fecha_inicio, fecha_fin, ct, zona, semana)
    sql = f"""
    SELECT
        ({FB_CT_NORM})              AS ct,
        COUNT(DISTINCT Idruta)      AS rutas,
        COUNT(DISTINCT Patente)     AS moviles,
        COUNTIF(Estado = 'Terminado')                                        AS terminados,
        COUNTIF(Estado = 'Pendiente')                                        AS pendientes,
        ROUND(SAFE_DIVIDE(
            COUNTIF(Estado = 'Terminado'),
            COUNTIF(Estado = 'Terminado') + COUNTIF(Estado = 'Pendiente')
        ) * 100, 1)                                                          AS fill_rate
    FROM `{FALABELLA_TABLE}`
    {where}
    GROUP BY ct
    ORDER BY rutas DESC
    """
    return fb_clean(run_query(sql).to_dict(orient="records"))


@app.get("/api/falabella/filtros")
def falabella_filtros(
    fecha_inicio: Optional[str]       = Query(None),
    fecha_fin:    Optional[str]       = Query(None),
    ct:           Optional[List[str]] = Query(None),
    zona:         Optional[str]       = Query(None),
    semana:       Optional[List[int]] = Query(None),
):
    where  = falabella_filters(fecha_inicio, fecha_fin, ct, zona, semana)
    result = {"cts": [], "semanas": [], "fecha_min": None, "fecha_max": None}

    try:
        sql_cts = f"""
        SELECT DISTINCT ({FB_CT_NORM}) AS ct
        FROM `{FALABELLA_TABLE}`
        {where}
        ORDER BY ct
        """
        df = run_query(sql_cts)
        result["cts"] = df["ct"].dropna().tolist()
    except Exception as e:
        print(f"Error fb filtros CTs: {e}")

    try:
        sql_semanas = f"""
        SELECT DISTINCT
            EXTRACT(ISOWEEK FROM ({FB_FECHA}))   AS semana,
            EXTRACT(ISOYEAR FROM ({FB_FECHA}))   AS anio,
            DATE_TRUNC({FB_FECHA}, WEEK(MONDAY)) AS semana_inicio
        FROM `{FALABELLA_TABLE}`
        {where}
        ORDER BY semana_inicio
        """
        df_s = run_query(sql_semanas)
        result["semanas"] = [
            {
                "semana":        int(r["semana"]),
                "anio":          int(r["anio"]),
                "semana_inicio": str(r["semana_inicio"]),
                "label":         f"S{int(r['semana']):02d}",
            }
            for _, r in df_s.iterrows()
        ]
    except Exception as e:
        print(f"Error fb filtros semanas: {e}")

    try:
        hoy = date.today().strftime("%Y-%m-%d")
        sql_fechas = f"""
        SELECT
            MIN({FB_FECHA}) AS fecha_min,
            MAX({FB_FECHA}) AS fecha_max
        FROM `{FALABELLA_TABLE}`
        WHERE ({FB_CT_NORM}) IS NOT NULL
          AND Fechainicioruta IS NOT NULL
          AND ({FB_FECHA}) <= '{hoy}'
        """
        df_f = run_query(sql_fechas)
        if not df_f.empty:
            result["fecha_min"] = str(df_f.iloc[0]["fecha_min"])
            result["fecha_max"] = str(df_f.iloc[0]["fecha_max"])
    except Exception as e:
        print(f"Error fb filtros fechas: {e}")

    return fb_clean(result)


@app.get("/api/falabella/zonas")
def falabella_zonas():
    sql = f"""
    SELECT DISTINCT ({FB_ZONA}) AS zona
    FROM `{FALABELLA_TABLE}`
    WHERE ({FB_CT_NORM}) IS NOT NULL
      AND Fechainicioruta IS NOT NULL
      AND ({FB_ZONA}) IS NOT NULL
    ORDER BY zona
    """
    df = run_query(sql)
    return {"zonas": df["zona"].tolist()}


@app.get("/api/falabella/motivos")
def falabella_motivos(
    fecha_inicio: Optional[str]       = Query(None),
    fecha_fin:    Optional[str]       = Query(None),
    ct:           Optional[List[str]] = Query(None),
    zona:         Optional[str]       = Query(None),
    semana:       Optional[List[int]] = Query(None),
):
    where = falabella_filters(fecha_inicio, fecha_fin, ct, zona, semana)
    extra = """
        AND Estado = 'Pendiente'
        AND Motivonoentrega IS NOT NULL
        AND TRIM(Motivonoentrega) != ''
    """
    sql = f"""
    SELECT
        TRIM(Motivonoentrega)   AS motivo,
        COUNT(*)                AS cantidad
    FROM `{FALABELLA_TABLE}`
    {where}
    {extra}
    GROUP BY motivo
    ORDER BY cantidad DESC
    LIMIT 10
    """
    return fb_clean(run_query(sql).to_dict(orient="records"))


@app.get("/api/falabella/periodos")
def falabella_periodos(
    ct:   Optional[List[str]] = Query(None),
    zona: Optional[str]       = Query(None),
):
    hoy = date.today()
    anio = hoy.year

    ytd_fi   = f"{anio}-01-01"
    ytd_ff   = hoy.strftime("%Y-%m-%d")
    ytd_fi_p = f"{anio-1}-01-01"
    ytd_ff_p = f"{anio-1}-{hoy.month:02d}-{hoy.day:02d}"

    mtd_fi   = f"{anio}-{hoy.month:02d}-01"
    mtd_ff   = hoy.strftime("%Y-%m-%d")
    if hoy.month == 1:
        mtd_fi_p  = f"{anio-1}-12-01"
        last_prev = 31
    else:
        mtd_fi_p  = f"{anio}-{hoy.month-1:02d}-01"
        last_prev = min(hoy.day, calendar.monthrange(anio, hoy.month-1)[1])
    mtd_ff_p = f"{anio}-{hoy.month-1:02d}-{last_prev:02d}" if hoy.month > 1 \
               else f"{anio-1}-12-{last_prev:02d}"

    lunes    = hoy - timedelta(days=hoy.weekday())
    sem_fi   = lunes.strftime("%Y-%m-%d")
    sem_ff   = hoy.strftime("%Y-%m-%d")
    sem_fi_p = (lunes - timedelta(weeks=1)).strftime("%Y-%m-%d")
    sem_ff_p = (lunes - timedelta(days=1)).strftime("%Y-%m-%d")

    def kpis_for(fi, ff):
        where = falabella_filters(fi, ff, ct, zona)
        sql = f"""
        SELECT
            COUNT(DISTINCT Idruta)                          AS rutas,
            COUNT(DISTINCT Patente)                         AS moviles,
            ROUND(SAFE_DIVIDE(
                COUNTIF(Estado='Terminado'),
                COUNTIF(Estado='Terminado')+COUNTIF(Estado='Pendiente')
            )*100,1)                                        AS fill_rate
        FROM `{FALABELLA_TABLE}`
        {where}
        """
        row = run_query(sql).iloc[0].to_dict()
        return fb_clean(row)

    ytd  = kpis_for(ytd_fi,   ytd_ff)
    ytdp = kpis_for(ytd_fi_p, ytd_ff_p)
    mtd  = kpis_for(mtd_fi,   mtd_ff)
    mtdp = kpis_for(mtd_fi_p, mtd_ff_p)
    sem  = kpis_for(sem_fi,   sem_ff)
    semp = kpis_for(sem_fi_p, sem_ff_p)

    iso_week  = hoy.isocalendar()[1]
    prev_week = (lunes - timedelta(days=1)).isocalendar()[1]

    return fb_clean({
        "ytd": {**ytd,  "prev": ytdp,
                "label": f"Ene → {hoy.strftime('%d %b')} {anio}",
                "prev_label": f"Ene → {hoy.strftime('%d %b')} {anio-1}"},
        "mtd": {**mtd,  "prev": mtdp,
                "label": hoy.strftime("%b %Y"),
                "prev_label": (hoy.replace(day=1) -
                               timedelta(days=1)).strftime("%b %Y")},
        "sem": {**sem,  "prev": semp,
                "label": f"S{iso_week}",
                "prev_label": f"S{prev_week}"},
    })


@app.get("/api/falabella/alertas-ct")
def falabella_alertas_ct(
    fecha_inicio: Optional[str]       = Query(None),
    fecha_fin:    Optional[str]       = Query(None),
    ct:           Optional[List[str]] = Query(None),
    zona:         Optional[str]       = Query(None),
    semana:       Optional[List[int]] = Query(None),
):
    where_cur = falabella_filters(fecha_inicio, fecha_fin, ct, zona, semana)

    fi_prev = ff_prev = None
    if fecha_inicio and fecha_fin:
        fi_dt   = datetime.strptime(fecha_inicio, "%Y-%m-%d")
        ff_dt   = datetime.strptime(fecha_fin,    "%Y-%m-%d")
        delta   = (ff_dt - fi_dt).days + 1
        fi_prev = (fi_dt - timedelta(days=delta)).strftime("%Y-%m-%d")
        ff_prev = (fi_dt - timedelta(days=1)).strftime("%Y-%m-%d")

    where_prev = falabella_filters(
        fi_prev, ff_prev, ct, zona, semana
    ) if fi_prev else None

    sql = f"""
    WITH cur AS (
        SELECT
            ({FB_CT_NORM})                  AS ct,
            COUNT(DISTINCT Idruta)          AS rutas,
            COUNTIF(Estado = 'Pendiente')   AS pendientes,
            ROUND(SAFE_DIVIDE(
                COUNTIF(Estado = 'Terminado'),
                COUNTIF(Estado = 'Terminado') + COUNTIF(Estado = 'Pendiente')
            ) * 100, 1)                     AS fill_rate
        FROM `{FALABELLA_TABLE}`
        {where_cur}
        GROUP BY ct
        HAVING ct IS NOT NULL
    )
    SELECT * FROM cur
    ORDER BY fill_rate ASC
    LIMIT 3
    """
    try:
        df     = run_query(sql)
        result = df.to_dict(orient="records")
    except Exception as e:
        print(f"Error fb alertas-ct: {e}")
        return []

    if where_prev:
        sql_prev = f"""
        SELECT
            ({FB_CT_NORM})                  AS ct,
            ROUND(SAFE_DIVIDE(
                COUNTIF(Estado = 'Terminado'),
                COUNTIF(Estado = 'Terminado') + COUNTIF(Estado = 'Pendiente')
            ) * 100, 1)                     AS fill_rate_prev
        FROM `{FALABELLA_TABLE}`
        {where_prev}
        GROUP BY ct
        HAVING ct IS NOT NULL
        """
        try:
            df_prev  = run_query(sql_prev)
            prev_map = dict(zip(df_prev["ct"], df_prev["fill_rate_prev"]))
            for row in result:
                row["fill_rate_prev"] = prev_map.get(row["ct"])
        except Exception as e:
            print(f"Error fb alertas-ct prev: {e}")

    return fb_clean(result)


@app.get("/api/falabella/comparacion-semanal")
def falabella_comparacion_semanal(
    fecha_inicio: Optional[str]       = Query(None),
    fecha_fin:    Optional[str]       = Query(None),
    ct:           Optional[List[str]] = Query(None),
    zona:         Optional[str]       = Query(None),
    semana:       Optional[List[int]] = Query(None),
):
    where = falabella_filters(fecha_inicio, fecha_fin, ct, zona, semana)
    sql_weeks = f"""
    SELECT DISTINCT
        EXTRACT(ISOWEEK FROM ({FB_FECHA}))        AS semana,
        DATE_TRUNC({FB_FECHA}, WEEK(MONDAY))      AS semana_inicio
    FROM `{FALABELLA_TABLE}`
    {where}
    ORDER BY semana_inicio DESC
    LIMIT 2
    """
    try:
        df_weeks = run_query(sql_weeks)
    except Exception as e:
        print(f"Error fb comparacion-semanal semanas: {e}")
        return fb_clean({"sem_actual": None, "sem_anterior": None, "data": []})

    if len(df_weeks) < 2:
        return fb_clean({"sem_actual": None, "sem_anterior": None, "data": []})

    w_act = df_weeks.iloc[0]
    w_ant = df_weeks.iloc[1]
    fi_act = str(w_act["semana_inicio"])
    ff_act = (datetime.strptime(fi_act, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
    fi_ant = str(w_ant["semana_inicio"])
    ff_ant = (datetime.strptime(fi_ant, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
    sem_actual   = f"S{int(w_act['semana']):02d}"
    sem_anterior = f"S{int(w_ant['semana']):02d}"

    def kpis_ct(fi, ff):
        w = falabella_filters(fi, ff, ct, zona, None)
        sql = f"""
        SELECT
            ({FB_CT_NORM})                              AS ct,
            COUNT(DISTINCT Idruta)                      AS rutas,
            ROUND(SAFE_DIVIDE(
                COUNTIF(Estado='Terminado'),
                COUNTIF(Estado='Terminado')+COUNTIF(Estado='Pendiente')
            )*100, 1)                                   AS fill_rate
        FROM `{FALABELLA_TABLE}`
        {w}
        GROUP BY ct
        ORDER BY ct
        """
        return run_query(sql)

    try:
        df_act = kpis_ct(fi_act, ff_act)
        df_ant = kpis_ct(fi_ant, ff_ant)
    except Exception as e:
        print(f"Error fb comparacion-semanal kpis: {e}")
        return fb_clean({"sem_actual": sem_actual, "sem_anterior": sem_anterior, "data": []})

    map_ant = {r["ct"]: r for r in df_ant.to_dict(orient="records")}
    data = []
    for r in df_act.to_dict(orient="records"):
        ant = map_ant.get(r["ct"], {})
        data.append({
            "ct":       r["ct"],
            "s_act_r":  int(r["rutas"])       if r.get("rutas")       is not None else None,
            "s_ant_r":  int(ant["rutas"])      if ant.get("rutas")     is not None else None,
            "s_act_fr": float(r["fill_rate"])  if r.get("fill_rate")   is not None else None,
            "s_ant_fr": float(ant["fill_rate"]) if ant.get("fill_rate") is not None else None,
        })
    return fb_clean({"sem_actual": sem_actual, "sem_anterior": sem_anterior, "data": data})


@app.get("/api/falabella/heatmap-ct-dia")
def falabella_heatmap_ct_dia(
    fecha_inicio: Optional[str]       = Query(None),
    fecha_fin:    Optional[str]       = Query(None),
    ct:           Optional[List[str]] = Query(None),
    zona:         Optional[str]       = Query(None),
    semana:       Optional[List[int]] = Query(None),
):
    """
    Modo TENDENCIA (sin semana seleccionada):
        Promedio fill rate por CT × día de semana del período completo.
        vs_ant = mismo día en el período anterior equivalente.

    Modo COMPARACIÓN (con semana seleccionada):
        Fill rate por CT × día de la semana seleccionada.
        vs_ant = mismo día de la semana anterior.
    """
    if not fecha_inicio or not fecha_fin:
        return {"modo": "tendencia", "data": [], "sem_label": None,
                "sem_ant_label": None}

    modo = "comparacion" if semana else "tendencia"
    where = falabella_filters(fecha_inicio, fecha_fin, ct, zona, semana)

    sql = f"""
    SELECT
        ({FB_CT_NORM})                          AS ct,
        EXTRACT(DAYOFWEEK FROM {FB_FECHA})      AS dow,
        ROUND(SAFE_DIVIDE(
            COUNTIF(Estado = 'Terminado'),
            COUNTIF(Estado = 'Terminado') + COUNTIF(Estado = 'Pendiente')
        ) * 100, 1)                             AS fill_rate
    FROM `{FALABELLA_TABLE}`
    {where}
    GROUP BY ct, dow
    HAVING ct IS NOT NULL
    ORDER BY ct, dow
    """

    sem_label     = None
    sem_ant_label = None

    if modo == "comparacion" and semana:
        sem_ant = [s - 1 for s in semana if s > 1]
        if not sem_ant:
            fi_prev = (datetime.strptime(fecha_inicio, "%Y-%m-%d")
                       - timedelta(weeks=len(semana))).strftime("%Y-%m-%d")
            ff_prev = (datetime.strptime(fecha_fin, "%Y-%m-%d")
                       - timedelta(weeks=len(semana))).strftime("%Y-%m-%d")
            where_ant = falabella_filters(fi_prev, ff_prev, ct, zona)
        else:
            where_ant = falabella_filters(
                fecha_inicio, fecha_fin, ct, zona, sem_ant
            )
        sem_label     = f"S{semana[0]:02d}" if len(semana) == 1 \
                        else f"S{semana[0]:02d}–S{semana[-1]:02d}"
        sem_ant_label = f"S{sem_ant[0]:02d}" if sem_ant else "Sem. ant."
    else:
        fi_dt   = datetime.strptime(fecha_inicio, "%Y-%m-%d")
        ff_dt   = datetime.strptime(fecha_fin,    "%Y-%m-%d")
        delta   = (ff_dt - fi_dt).days + 1
        fi_prev = (fi_dt - timedelta(days=delta)).strftime("%Y-%m-%d")
        ff_prev = (fi_dt - timedelta(days=1)).strftime("%Y-%m-%d")
        where_ant = falabella_filters(fi_prev, ff_prev, ct, zona)

    sql_ant = f"""
    SELECT
        ({FB_CT_NORM})                          AS ct,
        EXTRACT(DAYOFWEEK FROM {FB_FECHA})      AS dow,
        ROUND(SAFE_DIVIDE(
            COUNTIF(Estado = 'Terminado'),
            COUNTIF(Estado = 'Terminado') + COUNTIF(Estado = 'Pendiente')
        ) * 100, 1)                             AS fill_rate
    FROM `{FALABELLA_TABLE}`
    {where_ant}
    GROUP BY ct, dow
    HAVING ct IS NOT NULL
    ORDER BY ct, dow
    """

    try:
        df     = run_query(sql)
        df_ant = run_query(sql_ant)
    except Exception as e:
        print(f"Error heatmap-ct-dia: {e}")
        return fb_clean({"modo": modo, "data": [], "sem_label": sem_label,
                         "sem_ant_label": sem_ant_label})

    # dow BigQuery: 1=Dom 2=Lun 3=Mar 4=Mié 5=Jue 6=Vie 7=Sáb
    DIAS = {2: "lun", 3: "mar", 4: "mie", 5: "jue", 6: "vie", 7: "sab"}

    def build_map(dataframe):
        m = {}
        for _, r in dataframe.iterrows():
            c   = r["ct"]
            dow = int(r["dow"])
            if c not in m:
                m[c] = {}
            if dow in DIAS:
                m[c][DIAS[dow]] = float(r["fill_rate"]) \
                                  if r["fill_rate"] is not None else None
        return m

    cur_map = build_map(df)
    ant_map = build_map(df_ant)

    result = []
    for c in sorted(cur_map.keys()):
        entry = {"ct": c, "modo": modo}
        for d in DIAS.values():
            entry[d]          = cur_map[c].get(d)
            entry[f"{d}_ant"] = ant_map.get(c, {}).get(d)
        vals_cur = [v for v in [entry[d] for d in DIAS.values()]
                    if v is not None]
        entry["prom"]     = round(sum(vals_cur) / len(vals_cur), 1) \
                            if vals_cur else None
        vals_ant = [v for v in [entry.get(f"{d}_ant") for d in DIAS.values()]
                    if v is not None]
        entry["prom_ant"] = round(sum(vals_ant) / len(vals_ant), 1) \
                            if vals_ant else None
        result.append(entry)

    return fb_clean({
        "modo":          modo,
        "sem_label":     sem_label,
        "sem_ant_label": sem_ant_label,
        "data":          result,
    })


@app.get("/falabella")
def falabella_page():
    return FileResponse("grafico_semanal.html")


# ─── Servir el dashboard HTML ─────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="."), name="static")

@app.get("/dashboard")
def dashboard():
    return FileResponse("dashboard.html")

@app.get("/semanal")
def semanal():
    return FileResponse("grafico_semanal.html")

@app.get("/kpi-operacion")
def kpi_operacion_page():
    return FileResponse("grafico_semanal.html")