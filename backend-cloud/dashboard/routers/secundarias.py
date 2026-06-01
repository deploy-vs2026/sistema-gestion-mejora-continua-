from fastapi import APIRouter, Query
from typing import Optional

from dashboard.config import BEETRAK_TABLE, LOCALES_SECUNDARIAS, PROVEEDORES_POR_LOCAL
from dashboard.database import run_query
from dashboard.filters import beetrak_filters

router = APIRouter()

PPU_CASE = """
    CASE LEFT(identificador, 4)
        WHEN 'DRVS' THEN 'Valdishopper' WHEN 'HDVS' THEN 'Valdishopper' WHEN 'LTVS' THEN 'Valdishopper'
        WHEN 'DRTH' THEN 'Titask'       WHEN 'LTTH' THEN 'Titask'
        WHEN 'DRBM' THEN 'Boosmap'      WHEN 'LTBM' THEN 'Boosmap'
        WHEN 'DRFX' THEN 'Foxer'        WHEN 'LTFX' THEN 'Foxer'
        WHEN 'LTGP' THEN 'GPS'          WHEN 'DRGP' THEN 'GPS'
        WHEN 'DRZB' THEN 'Zubale'       WHEN 'LTZB' THEN 'Zubale'
        WHEN 'Uber' THEN 'Uber'         ELSE 'Sin clasificar'
    END
"""


@router.get("/api/secundarias/locales")
def secundarias_locales():
    return [{"local": l, "proveedores": PROVEEDORES_POR_LOCAL.get(l, [])}
            for l in LOCALES_SECUNDARIAS]


@router.get("/api/secundarias/kpis")
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


@router.get("/api/secundarias/semanal")
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
            {PPU_CASE}                                            AS transportadora,
            COUNT(DISTINCT identificador)                         AS prestadores,
            COUNT(DISTINCT orden)                                 AS pedidos,
            ROUND(SAFE_DIVIDE(COUNTIF(fecha_primer_intento <= tiempo_max_entrega), COUNT(*)) * 100, 1) AS ontime_pct
        FROM `{BEETRAK_TABLE}`
        {where}
        GROUP BY 1, 2, 3, 4, 5
        ORDER BY semana_inicio, transportadora
    """
    return run_query(sql).to_dict(orient="records")


@router.get("/api/secundarias/diario")
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
            {PPU_CASE}                                        AS transportadora,
            COUNT(DISTINCT identificador)                     AS prestadores,
            COUNT(DISTINCT orden)                             AS pedidos,
            ROUND(SAFE_DIVIDE(COUNTIF(fecha_primer_intento <= tiempo_max_entrega), COUNT(*)) * 100, 1) AS ontime_pct
        FROM `{BEETRAK_TABLE}`
        {where}
        GROUP BY 1, 2, 3, 4, 5
        ORDER BY dia, transportadora
    """
    return run_query(sql).to_dict(orient="records")


@router.get("/api/secundarias/ppu")
def secundarias_ppu(
    local: Optional[int] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
):
    where = beetrak_filters(local, fecha_inicio, fecha_fin)
    sql = f"""
        SELECT
            LEFT(identificador, 4)    AS ppu,
            {PPU_CASE}                AS transportadora,
            COUNT(DISTINCT orden)                                        AS pedidos,
            ROUND(COUNT(DISTINCT orden) * 100.0 / SUM(COUNT(DISTINCT orden)) OVER(), 2) AS pct
        FROM `{BEETRAK_TABLE}`
        {where}
        GROUP BY 1, 2
        ORDER BY pedidos DESC
    """
    return run_query(sql).to_dict(orient="records")
