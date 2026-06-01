from typing import Optional

from dashboard.config import (
    START_DATE_POR_LOCAL,
    PROVEEDORES_POR_LOCAL,
    PPU_TRANSPORTADORA,
    FILTRO_LAT_BEETRAK,
    FB_CT_NORM,
    FB_FECHA,
    FB_ZONA,
)


def date_filter(fecha_inicio: Optional[str], fecha_fin: Optional[str]) -> str:
    clauses = []
    if fecha_inicio:
        clauses.append(f"DATE(fecha_control) >= '{fecha_inicio}'")
    if fecha_fin:
        clauses.append(f"DATE(fecha_control) <= '{fecha_fin}'")
    return ("WHERE " + " AND ".join(clauses)) if clauses else ""


def date_filter_and(fecha_inicio: Optional[str], fecha_fin: Optional[str]) -> str:
    clauses = []
    if fecha_inicio:
        clauses.append(f"DATE(fecha_control) >= '{fecha_inicio}'")
    if fecha_fin:
        clauses.append(f"DATE(fecha_control) <= '{fecha_fin}'")
    return ("AND " + " AND ".join(clauses)) if clauses else ""


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


def beetrak_filters(
    local: Optional[int],
    fecha_inicio: Optional[str],
    fecha_fin: Optional[str],
) -> str:
    clauses = [
        "tiempo_min_entrega IS NOT NULL",
        FILTRO_LAT_BEETRAK,
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
