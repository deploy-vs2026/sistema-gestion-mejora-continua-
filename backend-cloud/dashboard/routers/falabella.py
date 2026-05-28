import math
import calendar
from datetime import date, timedelta, datetime

from fastapi import APIRouter, Query
from typing import Optional, List

from dashboard.config import FALABELLA_TABLE, FB_FECHA, FB_CT_NORM, FB_ZONA
from dashboard.database import run_query
from dashboard.filters import falabella_filters

router = APIRouter()


def fb_clean(obj):
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


@router.get("/api/falabella/kpis")
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


@router.get("/api/falabella/evolucion")
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


@router.get("/api/falabella/por-ct")
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


@router.get("/api/falabella/filtros")
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


@router.get("/api/falabella/zonas")
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


@router.get("/api/falabella/motivos")
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


@router.get("/api/falabella/periodos")
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
                "prev_label": (hoy.replace(day=1) - timedelta(days=1)).strftime("%b %Y")},
        "sem": {**sem,  "prev": semp,
                "label": f"S{iso_week}",
                "prev_label": f"S{prev_week}"},
    })


@router.get("/api/falabella/alertas-ct")
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

    where_prev = falabella_filters(fi_prev, ff_prev, ct, zona, semana) if fi_prev else None

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


@router.get("/api/falabella/comparacion-semanal")
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
            "s_act_r":  int(r["rutas"])        if r.get("rutas")       is not None else None,
            "s_ant_r":  int(ant["rutas"])       if ant.get("rutas")     is not None else None,
            "s_act_fr": float(r["fill_rate"])   if r.get("fill_rate")   is not None else None,
            "s_ant_fr": float(ant["fill_rate"]) if ant.get("fill_rate") is not None else None,
        })
    return fb_clean({"sem_actual": sem_actual, "sem_anterior": sem_anterior, "data": data})


@router.get("/api/falabella/heatmap-ct-dia")
def falabella_heatmap_ct_dia(
    fecha_inicio: Optional[str]       = Query(None),
    fecha_fin:    Optional[str]       = Query(None),
    ct:           Optional[List[str]] = Query(None),
    zona:         Optional[str]       = Query(None),
    semana:       Optional[List[int]] = Query(None),
):
    if not fecha_inicio or not fecha_fin:
        return {"modo": "tendencia", "data": [], "sem_label": None, "sem_ant_label": None}

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
            where_ant = falabella_filters(fecha_inicio, fecha_fin, ct, zona, sem_ant)
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

    DIAS = {2: "lun", 3: "mar", 4: "mie", 5: "jue", 6: "vie", 7: "sab"}

    def build_map(dataframe):
        m = {}
        for _, r in dataframe.iterrows():
            c   = r["ct"]
            dow = int(r["dow"])
            if c not in m:
                m[c] = {}
            if dow in DIAS:
                m[c][DIAS[dow]] = float(r["fill_rate"]) if r["fill_rate"] is not None else None
        return m

    cur_map = build_map(df)
    ant_map = build_map(df_ant)

    result = []
    for c in sorted(cur_map.keys()):
        entry = {"ct": c, "modo": modo}
        for d in DIAS.values():
            entry[d]          = cur_map[c].get(d)
            entry[f"{d}_ant"] = ant_map.get(c, {}).get(d)
        vals_cur = [v for v in [entry[d] for d in DIAS.values()] if v is not None]
        entry["prom"]     = round(sum(vals_cur) / len(vals_cur), 1) if vals_cur else None
        vals_ant = [v for v in [entry.get(f"{d}_ant") for d in DIAS.values()] if v is not None]
        entry["prom_ant"] = round(sum(vals_ant) / len(vals_ant), 1) if vals_ant else None
        result.append(entry)

    return fb_clean({
        "modo":          modo,
        "sem_label":     sem_label,
        "sem_ant_label": sem_ant_label,
        "data":          result,
    })
