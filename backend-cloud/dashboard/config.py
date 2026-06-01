PROJECT_ID = "sigmc-5fae5"
DATASET    = "dataflow"
TABLE      = "pfa"
FULL_TABLE      = f"{PROJECT_ID}.{DATASET}.{TABLE}"
BEETRAK_TABLE   = f"{PROJECT_ID}.{DATASET}.beetrak"
FALABELLA_TABLE = f"{PROJECT_ID}.dataflow.falabella"

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

LOCALES_SECUNDARIAS = sorted(PROVEEDORES_POR_LOCAL.keys())

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

LOCALES_ESTIVAL      = ('99','657','618','94','120','121','58','98','608','143')
LOCALES_MODELO_MIXTO = ('45','58','95','98','99','120','121')

FILTRO_HD_ESTIVAL = """
    LEFT(identificador, 4) = 'HDVS'
    AND local IN ('99','657','618','94','120','121','58','98','608','143')
"""

FILTRO_HD_MIXTO = """
    LEFT(identificador, 4) = 'HDVS'
    AND COALESCE(DATETIME_DIFF(tiempo_max_entrega, tiempo_min_entrega, HOUR), 0) = 2
    AND local IN ('45','58','95','98','99','120','121')
"""

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
