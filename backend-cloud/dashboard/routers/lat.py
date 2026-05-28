from fastapi import APIRouter, Query
from typing import Optional

from dashboard.config import FULL_TABLE, BEETRAK_TABLE, FILTRO_LAT_BEETRAK
from dashboard.database import run_query
from dashboard.filters import date_filter, date_filter_and

router = APIRouter()


@router.get("/api/kpis")
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


@router.get("/api/ordenes-por-dia")
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


@router.get("/api/efectividad-por-servicio")
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


@router.get("/api/rendimiento-por-persona")
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


@router.get("/api/por-shipping-group")
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


@router.get("/api/histograma-minutos")
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


@router.get("/api/cumplimiento-ventana")
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


@router.get("/api/por-local")
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


@router.get("/api/kpi-semanal")
def kpi_semanal(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    local:         Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
    rol:           Optional[str] = Query(None),
):
    where = date_filter(fecha_inicio, fecha_fin)
    extra = "AND fecha_control IS NOT NULL"
    sql_where = (where + " " + extra) if where else "WHERE fecha_control IS NOT NULL"
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


@router.get("/api/kpi-diario")
def kpi_diario(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    local:         Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
    rol:           Optional[str] = Query(None),
):
    where = date_filter(fecha_inicio, fecha_fin)
    extra = "AND fecha_control IS NOT NULL"
    sql_where = (where + " " + extra) if where else "WHERE fecha_control IS NOT NULL"
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


@router.get("/api/debug-beetrak")
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


@router.get("/api/debug-pfa")
def debug_pfa_dashboard():
    sql = """
        SELECT
            MIN(DATE(fecha_control)) AS fecha_min,
            MAX(DATE(fecha_control)) AS fecha_max,
            COUNT(*)                 AS total_filas
        FROM `sigmc-5fae5.dataflow.pfa`
    """
    return run_query(sql).iloc[0].to_dict()


@router.get("/api/kpi-operacion")
def kpi_operacion(
    fecha_inicio:  Optional[str] = Query(None),
    fecha_fin:     Optional[str] = Query(None),
    semana:        Optional[int] = Query(None),
    local:         Optional[str] = Query(None),
    tipo_servicio: Optional[str] = Query(None),
    rol:           Optional[str] = Query(None),
):
    pfa_clauses = []
    if fecha_inicio: pfa_clauses.append(f"DATE(fecha_control) >= '{fecha_inicio}'")
    if fecha_fin:    pfa_clauses.append(f"DATE(fecha_control) <= '{fecha_fin}'")
    if local:         pfa_clauses.append(f"nro_local = '{local}'")
    if tipo_servicio: pfa_clauses.append(f"tipo_servicio = '{tipo_servicio}'")
    if rol:           pfa_clauses.append(f"rol_persona = '{rol}'")
    pfa_date_and = ("AND " + " AND ".join(pfa_clauses)) if pfa_clauses else ""

    beet_clauses = []
    if fecha_inicio: beet_clauses.append(f"DATE(tiempo_min_entrega) >= '{fecha_inicio}'")
    if fecha_fin:    beet_clauses.append(f"DATE(tiempo_min_entrega) <= '{fecha_fin}'")
    if local:        beet_clauses.append(f"local = '{local}'")
    beet_date_and = ("AND " + " AND ".join(beet_clauses)) if beet_clauses else ""

    if semana is not None:
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


@router.get("/api/lat/filtros")
def lat_filtros(
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin:    Optional[str] = Query(None),
):
    where = date_filter(fecha_inicio, fecha_fin)

    df_locales = run_query(f"SELECT DISTINCT nro_local FROM `{FULL_TABLE}` {where} AND nro_local IS NOT NULL ORDER BY SAFE_CAST(nro_local AS INT64) ASC")
    df_tipos   = run_query(f"SELECT DISTINCT tipo_servicio FROM `{FULL_TABLE}` {where} AND tipo_servicio IS NOT NULL ORDER BY 1")
    df_roles   = run_query(f"SELECT DISTINCT rol_persona FROM `{FULL_TABLE}` {where} AND rol_persona IS NOT NULL ORDER BY 1")

    return {
        "locales":        df_locales["nro_local"].astype(str).tolist() if not df_locales.empty else [],
        "tipos_servicio": df_tipos["tipo_servicio"].astype(str).tolist() if not df_tipos.empty else [],
        "roles":          df_roles["rol_persona"].astype(str).tolist() if not df_roles.empty else [],
    }


@router.get("/api/lat/kpis")
def lat_kpis(
    fecha_inicio:   Optional[str] = Query(None),
    fecha_fin:      Optional[str] = Query(None),
    local:          Optional[str] = Query(None),
    tipo_servicio:  Optional[str] = Query(None),
    rol:            Optional[str] = Query(None),
):
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

    beet_clauses = []
    if fecha_inicio:
        beet_clauses.append(f"DATE(tiempo_min_entrega) >= '{fecha_inicio}'")
    if fecha_fin:
        beet_clauses.append(f"DATE(tiempo_min_entrega) <= '{fecha_fin}'")
    where_beet = (
        "WHERE " + " AND ".join(beet_clauses) + " AND fecha_primer_intento IS NOT NULL AND tiempo_max_entrega IS NOT NULL"
        if beet_clauses
        else "WHERE fecha_primer_intento IS NOT NULL AND tiempo_max_entrega IS NOT NULL"
    )

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
