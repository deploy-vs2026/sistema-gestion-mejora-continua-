from fastapi import APIRouter, Query
from typing import Optional

from dashboard.config import BEETRAK_TABLE
from dashboard.database import run_query
from dashboard.filters import hd_base_filters

router = APIRouter()


@router.get("/api/hd/kpis")
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


@router.get("/api/hd/locales")
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


@router.get("/api/hd/semanal")
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


@router.get("/api/hd/por-local")
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


@router.get("/api/hd/diario")
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
