"""
Servidor local DataFlow v4
- Beetrak: tabla única con todas las columnas
- PFA: genera dos tablas en una sola carga
  · pfa_finanzas  → con duplicados, todas las columnas
  · pfa_limpia    → sin duplicados, sin columnas de monto

Instalar: pip install fastapi uvicorn pandas openpyxl python-multipart
Correr:   uvicorn server:app --reload --port 8000
"""

import io
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = FastAPI(title="DataFlow Local", version="4.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR    = Path("./output_limpio")
OUTPUT_DIR.mkdir(exist_ok=True)

USUARIOS_PATH = Path("./usuarios.json")


# ── Pydantic models ────────────────────────────────────────────────────────────
class UsuarioIn(BaseModel):
    correo: str
    rol: str


# ── Helpers usuarios ───────────────────────────────────────────────────────────
def leer_usuarios() -> dict:
    if not USUARIOS_PATH.exists():
        return {}
    return json.loads(USUARIOS_PATH.read_text(encoding="utf-8"))


def guardar_usuarios(data: dict) -> None:
    USUARIOS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

# ── Columnas Beetrak (todas las vistas ven lo mismo) ──────────────────────────
COLUMNAS_BEETRAK = {
    "Identificador ruta":  "identificador_ruta",
    "Identificador":       "identificador",
    "Orden":               "orden",
    "LOCAL":               "local",
    "Tipo de despacho":    "tipo_despacho",
    "Fecha estimada":      "fecha_estimada",
    "Fecha Llegada":       "fecha_llegada",
    "Estado":              "estado",
    "Subestado":           "subestado",
    "Usuario móvil":       "nombre_movil",       # primera col = nombre
    "Teléfono usuario":    "telefono_usuario",
    "Dirección cliente":   "direccion_cliente",
    "Fecha de creacion":   "fecha_creacion",
    "Fecha primer intento":"fecha_primer_intento",
    "# intentos":          "intentos",
    "Usuario móvil.1":     "rut_movil",          # segunda col = wmvs → RUT
    "Tiempo min entrega":  "tiempo_min_entrega",
    "Tiempo max entrega":  "tiempo_max_entrega",
    "Fecha ruta":          "fecha_ruta",
    "Inicio de ruta":      "inicio_ruta",
    "Fin de ruta":         "fin_ruta",
    "Número de intento":   "numero_intento",
    "Coordenadas":         "coordenadas",
    "Fecha de picking":    "fecha_picking",
    "Latitud":             "latitud",
    "Longitud":            "longitud",
}

# ── Columnas PFA Finanzas (todas, con duplicados) ─────────────────────────────
COLUMNAS_PFA_FINANZAS = {
    "empresa":               "empresa",
    "rut_empresa":           "rut_empresa",
    "shipping_group":        "shipping_group",
    "nro_local":             "nro_local",
    "fecha_control":         "fecha_control",
    "tipo_servicio":         "tipo_servicio",
    "rol_persona":           "rol_persona",
    "rut_persona":           "rut_persona",
    "fecha_compromiso":      "fecha_compromiso",
    "ventana":               "ventana",
    "inicio_picking":        "inicio_picking",
    "fin_picking":           "fin_picking",
    "unidades_solicitadas":  "unidades_solicitadas",
    "unidades_pickeadas":    "unidades_pickeadas",
    "unidades_sustituidas":  "unidades_sustituidas",
    "items_solicitados":     "items_solicitados",
    "items_a_pagar":         "items_a_pagar",
    "doble_pedido":          "doble_pedido",
}

# ── Columnas PFA Limpia (sin duplicados, sin montos) ──────────────────────────
COLUMNAS_PFA_LIMPIA = {
    "shipping_group":        "shipping_group",
    "nro_local":             "nro_local",
    "fecha_control":         "fecha_control",
    "tipo_servicio":         "tipo_servicio",
    "rol_persona":           "rol_persona",
    "rut_persona":           "rut_persona",
    "fecha_compromiso":      "fecha_compromiso",
    "ventana":               "ventana",
    "inicio_picking":        "inicio_picking",
    "fin_picking":           "fin_picking",
    "unidades_solicitadas":  "unidades_solicitadas",
    "unidades_pickeadas":    "unidades_pickeadas",
    "unidades_sustituidas":  "unidades_sustituidas",
    "items_solicitados":     "items_solicitados",
    "items_a_pagar":         "items_a_pagar",
    "doble_pedido":          "doble_pedido",
}

# ── Locales válidos y sus prefijos de Identificador permitidos ─────────────────
LOCAL_PREFIJOS = {
    "41":  ["LTVS", "DRVS", "LTTH", "DRTH"],
    "42":  ["LTVS", "DRVS"],
    "45":  ["HDVS"],
    "54":  ["LTVS", "DRVS"],
    "58":  ["HDVS"],
    "71":  ["LTVS", "DRVS"],
    "75":  ["LTVS", "DRVS"],
    "76":  ["LTVS", "DRVS"],
    "88":  ["LTVS", "DRVS", "LTBM", "DRBM"],
    "94":  ["LTVS", "DRVS", "HDVS"],
    "95":  ["HDVS"],
    "98":  ["LTVS", "DRVS", "HDVS"],
    "99":  ["LTVS", "DRVS", "HDVS"],
    "120": ["LTVS", "DRVS", "HDVS"],
    "121": ["LTVS", "DRVS", "HDVS", "LTZB", "DRZB"],
    "143": ["LTVS", "DRVS"],
    "144": ["LTVS", "DRVS"],
    "146": ["LTVS", "DRVS"],
    "182": ["LTVS", "DRVS"],
    "276": ["LTVS", "DRVS"],
    "518": ["LTVS", "DRVS", "LTGP", "DRGP"],
    "608": ["LTVS", "DRVS", "HDVS"],
    "611": ["LTVS", "DRVS"],
    "618": ["LTVS", "DRVS", "HDVS"],
    "627": ["LTVS", "DRVS"],
    "647": ["LTVS", "DRVS"],
    "655": ["LTVS", "DRVS"],
    "657": ["LTVS", "DRVS", "HDVS"],
    "658": ["LTVS", "DRVS"],
    "693": ["LTVS", "DRVS"],
    "697": ["LTVS", "DRVS"],
    "929": ["LTVS", "DRVS"],
    "952": ["LTVS", "DRVS"],
}


# ── Endpoints ──────────────────────────────────────────────────────────────────
@app.get("/")
def health():
    return {"status": "ok", "version": "4.0.0"}


@app.post("/procesar/{tipo}")
async def procesar(tipo: str, archivo: UploadFile = File(...)):
    if tipo not in ("beetrak", "pfa"):
        raise HTTPException(400, "tipo debe ser 'beetrak' o 'pfa'")

    extension = archivo.filename.rsplit(".", 1)[-1].lower()
    if extension not in ("xlsx", "xls", "csv"):
        raise HTTPException(400, f"Formato no soportado: {extension}")

    log.info(f"Procesando {tipo}: {archivo.filename}")
    contenido = await archivo.read()

    try:
        df_raw = leer_archivo(contenido, extension, tipo)

        if tipo == "beetrak":
            df_clean = limpiar_beetrak(df_raw)
            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            nombre = f"beetrak_{ts}.csv"
            df_clean.to_csv(OUTPUT_DIR / nombre, index=False, encoding="utf-8-sig")

            return JSONResponse({
                "ok": True,
                "tipo": "beetrak",
                "archivo_original":   archivo.filename,
                "archivo_limpio":     nombre,
                "filas_originales":   len(df_raw),
                "filas_limpias":      len(df_clean),
                "columnas_eliminadas": len(df_raw.columns) - len(df_clean.columns),
                "stats": calcular_stats_beetrak(df_clean),
            })

        else:  # pfa — genera dos archivos
            df_finanzas, df_limpia = limpiar_pfa(df_raw)
            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

            nombre_fin  = f"pfa_finanzas_{ts}.csv"
            nombre_limp = f"pfa_limpia_{ts}.csv"
            df_finanzas.to_csv(OUTPUT_DIR / nombre_fin,  index=False, encoding="utf-8-sig")
            df_limpia.to_csv(  OUTPUT_DIR / nombre_limp, index=False, encoding="utf-8-sig")

            return JSONResponse({
                "ok": True,
                "tipo": "pfa",
                "archivo_original":      archivo.filename,
                "archivo_finanzas":      nombre_fin,
                "archivo_limpio":        nombre_limp,
                "filas_originales":      len(df_raw),
                "filas_finanzas":        len(df_finanzas),
                "filas_limpias":         len(df_limpia),
                "duplicados_eliminados": len(df_finanzas) - len(df_limpia),
                "columnas_eliminadas":   len(df_raw.columns) - len(df_limpia.columns),
                "stats": calcular_stats_pfa(df_limpia),
            })

    except Exception as e:
        log.error(f"Error: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@app.post("/join")
async def join_preview():
    archivos_bt   = sorted(OUTPUT_DIR.glob("beetrak_*.csv"))
    archivos_limp = sorted(OUTPUT_DIR.glob("pfa_limpia_*.csv"))

    if not archivos_bt or not archivos_limp:
        raise HTTPException(404, "Necesitas procesar al menos un beetrak y un pfa primero")

    df_bt  = pd.read_csv(archivos_bt[-1],   dtype=str)
    df_pfa = pd.read_csv(archivos_limp[-1], dtype=str)
    merged = df_bt.merge(df_pfa, left_on="orden", right_on="shipping_group", how="inner")

    return {
        "filas_beetrak":   len(df_bt),
        "filas_pfa":       len(df_pfa),
        "filas_con_match": len(merged),
        "pct_match":       round(len(merged) / max(len(df_pfa), 1) * 100, 1),
        "preview":         merged.head(5).fillna("").to_dict(orient="records"),
    }


# ── Lectura ────────────────────────────────────────────────────────────────────
def leer_archivo(content: bytes, extension: str, tipo: str) -> pd.DataFrame:
    if extension in ("xlsx", "xls"):
        return leer_excel(content, tipo)
    muestra = content[:4096].decode("utf-8", errors="ignore")
    sep = ";" if muestra.count(";") > muestra.count(",") else ","
    return pd.read_csv(io.BytesIO(content), sep=sep, dtype=str, encoding="utf-8-sig")


def leer_excel(content: bytes, tipo: str) -> pd.DataFrame:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
    hojas = wb.sheetnames
    wb.close()
    log.info(f"Hojas: {hojas}")

    if "Datos" in hojas:
        hoja = "Datos"
    elif tipo == "beetrak" and "DispatchTrack" in hojas:
        hoja = "DispatchTrack"
    elif tipo == "pfa" and "Picking" in hojas:
        hoja = "Picking"
    else:
        hoja = hojas[0]

    log.info(f"Leyendo hoja: '{hoja}'")
    df = pd.read_excel(io.BytesIO(content), sheet_name=hoja, dtype=str)
    return df.dropna(how="all").reset_index(drop=True)


# ── Limpieza Beetrak ───────────────────────────────────────────────────────────
def limpiar_beetrak(df: pd.DataFrame) -> pd.DataFrame:
    log.info(f"Beetrak recibido: {len(df)} filas · {len(df.columns)} columnas")

    # Renombrar duplicado "Usuario móvil" → pandas lo llama .1 al segundo
    cols_vistos = {}
    nuevos_nombres = []
    for col in df.columns:
        if col in cols_vistos:
            cols_vistos[col] += 1
            nuevos_nombres.append(f"{col}.{cols_vistos[col]}")
        else:
            cols_vistos[col] = 0
            nuevos_nombres.append(col)
    df.columns = nuevos_nombres

    # Seleccionar columnas útiles
    cols = {k: v for k, v in COLUMNAS_BEETRAK.items() if k in df.columns}
    df = df[list(cols.keys())].rename(columns=cols)

    # Filtrar por LOCAL válido
    antes = len(df)
    df["local"] = df["local"].astype(str).str.strip()
    df = df[df["local"].isin(LOCAL_PREFIJOS.keys())].reset_index(drop=True)
    log.info(f"Eliminadas por LOCAL inválido: {antes - len(df)}")

    # Filtrar por prefijo de Identificador según local
    if "identificador" in df.columns:
        antes = len(df)
        def prefijo_valido(row):
            prefijos = LOCAL_PREFIJOS.get(str(row["local"]), [])
            return any(str(row["identificador"]).strip().upper().startswith(p) for p in prefijos)
        df = df[df.apply(prefijo_valido, axis=1)].reset_index(drop=True)
        log.info(f"Eliminadas por prefijo inválido: {antes - len(df)}")

    # Extraer RUT de rut_movil (wmvs...)
    if "rut_movil" in df.columns:
        def extraer_rut(val):
            if pd.isna(val): return None
            val = str(val).strip().lower()
            if val.startswith("wmvs"):
                rut = val[4:].strip()
                return rut if rut else None
            return None
        df["rut_movil"] = df["rut_movil"].apply(extraer_rut)

    # Separar coordenadas si vienen combinadas
    if "coordenadas" in df.columns and "latitud" not in df.columns:
        coords = df["coordenadas"].str.extract(r"(-?[\d.]+),\s*(-?[\d.]+)")
        df["latitud"]  = coords[0]
        df["longitud"] = coords[1]
        df = df.drop(columns=["coordenadas"])

    # Normalizar clave JOIN
    if "orden" in df.columns:
        df["orden"] = df["orden"].apply(normalizar_orden)

    # Fechas
    for col in ["fecha_estimada", "fecha_llegada", "fecha_ruta", "fecha_creacion",
                "fecha_primer_intento", "inicio_ruta", "fin_ruta", "fecha_picking"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S")

    if "intentos" in df.columns:
        df["intentos"] = pd.to_numeric(df["intentos"], errors="coerce")
    if "estado" in df.columns:
        df["estado"] = df["estado"].str.strip().str.title()

    # Trimear strings
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].str.strip().replace("", None)

    df["_cargado_en"] = datetime.now(timezone.utc).isoformat()
    log.info(f"Beetrak limpio: {len(df)} filas · {len(df.columns)} columnas")
    return df.reset_index(drop=True)


# ── Limpieza PFA → retorna (df_finanzas, df_limpia) ───────────────────────────
def limpiar_pfa(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    log.info(f"PFA recibido: {len(df)} filas · {len(df.columns)} columnas")

    # ── PFA Finanzas: todas las columnas tal cual, sin tocar nada ──
    df_fin = df.copy()
    df_fin["_cargado_en"] = datetime.now(timezone.utc).isoformat()
    log.info(f"PFA Finanzas (raw): {len(df_fin)} filas · {len(df_fin.columns)} columnas")

    # ── PFA Limpia: sin empresa/rut_empresa, sin duplicados ──
    cols_limp = {k: v for k, v in COLUMNAS_PFA_LIMPIA.items() if k in df.columns}
    df_limp   = df[list(cols_limp.keys())].rename(columns=cols_limp).copy()
    df_limp   = _limpiar_pfa_comun(df_limp, deduplicar=True)
    log.info(f"PFA Limpia: {len(df_limp)} filas · duplicados eliminados: {len(df_fin) - len(df_limp)}")

    return df_fin, df_limp


def _limpiar_pfa_comun(df: pd.DataFrame, deduplicar: bool) -> pd.DataFrame:
    df = df.dropna(how="all").reset_index(drop=True)

    if "shipping_group" in df.columns:
        df["shipping_group"] = df["shipping_group"].apply(normalizar_orden)

    for col in ["fecha_control", "fecha_compromiso", "inicio_picking", "fin_picking"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S")

    for col in ["unidades_solicitadas", "unidades_pickeadas", "unidades_sustituidas",
                "items_solicitados", "items_a_pagar"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    if "doble_pedido" in df.columns:
        df["doble_pedido"] = df["doble_pedido"].notna() & (df["doble_pedido"].str.strip() != "")

    if "inicio_picking" in df.columns and "fin_picking" in df.columns:
        t0 = pd.to_datetime(df["inicio_picking"], errors="coerce")
        t1 = pd.to_datetime(df["fin_picking"],    errors="coerce")
        df["minutos_picking"] = (t1 - t0).dt.total_seconds() / 60

    if deduplicar and "shipping_group" in df.columns:
        df = df.drop_duplicates(subset=["shipping_group"], keep="first").reset_index(drop=True)

    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].str.strip().replace("", None)

    df["_cargado_en"] = datetime.now(timezone.utc).isoformat()
    return df.reset_index(drop=True)


def normalizar_orden(valor) -> str | None:
    if pd.isna(valor) or str(valor).strip() == "":
        return None
    return str(valor).strip()


# ── Stats ──────────────────────────────────────────────────────────────────────
def calcular_stats_beetrak(df: pd.DataFrame) -> dict:
    return {
        "estados":        df["estado"].value_counts().to_dict() if "estado" in df.columns else {},
        "tipos_despacho": df["tipo_despacho"].value_counts().to_dict() if "tipo_despacho" in df.columns else {},
        "ordenes_unicas": int(df["orden"].nunique()) if "orden" in df.columns else 0,
    }

def calcular_stats_pfa(df: pd.DataFrame) -> dict:
    return {
        "tipos_servicio":       df["tipo_servicio"].value_counts().to_dict() if "tipo_servicio" in df.columns else {},
        "roles":                df["rol_persona"].value_counts().to_dict() if "rol_persona" in df.columns else {},
        "dobles_pedidos":       int(df["doble_pedido"].sum()) if "doble_pedido" in df.columns else 0,
        "min_picking_promedio": round(float(df["minutos_picking"].mean()), 1) if "minutos_picking" in df.columns else 0,
    }


# ── Endpoints: usuarios ────────────────────────────────────────────────────────
@app.get("/usuarios")
def get_usuarios():
    return leer_usuarios()


@app.post("/usuarios")
def upsert_usuario(body: UsuarioIn):
    data = leer_usuarios()
    data[body.correo] = body.rol
    guardar_usuarios(data)
    return {"ok": True}


@app.delete("/usuarios/{correo}")
def delete_usuario(correo: str):
    data = leer_usuarios()
    if correo not in data:
        raise HTTPException(404, "Usuario no encontrado")
    del data[correo]
    guardar_usuarios(data)
    return {"ok": True}


# ── Endpoints: datos CSV ───────────────────────────────────────────────────────
_CSV_PATTERNS = {
    "pfa_finanzas": "pfa_finanzas_*.csv",
    "pfa_limpia":   "pfa_limpia_*.csv",
    "beetrak":      "beetrak_*.csv",
}


@app.get("/datos/{tipo}")
def get_datos(tipo: str):
    pattern = _CSV_PATTERNS.get(tipo)
    if not pattern:
        raise HTTPException(400, f"tipo '{tipo}' no válido. Opciones: {list(_CSV_PATTERNS)}")
    archivos = sorted(OUTPUT_DIR.glob(pattern))
    if not archivos:
        raise HTTPException(404, f"No hay archivos '{tipo}' en output_limpio/. Procesa primero desde Vista Maestra.")
    df = pd.read_csv(archivos[-1], dtype=str)
    return JSONResponse(df.fillna("").to_dict(orient="records"))


# ── Endpoint: historial ────────────────────────────────────────────────────────
@app.get("/historial")
def historial():
    items = []
    for f in OUTPUT_DIR.iterdir():
        if f.is_file() and f.suffix == ".csv":
            stem  = f.stem
            tipo  = stem.split("_")[0] if "_" in stem else stem
            items.append({
                "nombre":    f.name,
                "tipo":      tipo,
                "fecha":     datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                "tamaño_kb": round(f.stat().st_size / 1024, 1),
            })
    return sorted(items, key=lambda x: x["fecha"], reverse=True)