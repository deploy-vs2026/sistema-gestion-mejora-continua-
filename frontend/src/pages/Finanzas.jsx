import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import Paginator, { paginar } from "../components/Paginator";
import { getCached, setCached, invalidate } from "../dataCache";

const API           = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const DISPLAY_LIMIT = 100;

const ACENTO = "#D64294";   // Pink — color de sección Finanzas en SIGMC
const NAVY   = "#0B1C49";
const RED    = "#FF4466";

// Columnas base siempre presentes; columnas de montos aparecen si el archivo las trae
const COLS_BASE = [
  "empresa", "rut_empresa", "shipping_group", "nro_local", "fecha_control",
  "tipo_servicio", "rol_persona", "rut_persona", "fecha_compromiso", "ventana",
  "inicio_picking", "fin_picking",
  "unidades_solicitadas", "unidades_pickeadas", "unidades_sustituidas",
  "items_solicitados", "items_a_pagar", "doble_pedido",
];
const COLS_EXCLUIR = new Set(["_cargado_en"]);

function buildCols(rows) {
  if (!rows?.length) return COLS_BASE;
  const extra = Object.keys(rows[0]).filter(k => !COLS_EXCLUIR.has(k) && !COLS_BASE.includes(k));
  return extra.length ? [...COLS_BASE, ...extra] : COLS_BASE;
}

const EMPTY = { total: 0, rows: [] };

// ─── Estilos compartidos ────────────────────────────────────────────────────
const eyebrow = {
  fontFamily: "var(--font-head)",
  fontSize: 10, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.12em",
  color: "var(--text3)",
};

const cardBase = {
  background: "var(--bg2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  position: "relative",
  overflow: "hidden",
};

export default function Finanzas() {
  const [dataset,    setDataset]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [exportando, setExportando] = useState(false);
  const [page,       setPage]       = useState(0);
  const [busqSG,     setBusqSG]     = useState("");
  const [busqRut,    setBusqRut]    = useState("");
  const [busqTipo,   setBusqTipo]   = useState("");

  const ds = dataset ?? EMPTY;

  const buildUrl = useCallback(({ allRows = false } = {}) => {
    const params = new URLSearchParams();
    if (fechaDesde) params.set("desde", fechaDesde);
    if (fechaHasta) params.set("hasta", fechaHasta);
    if (busqSG)     params.set("shipping_group", busqSG);
    if (busqRut)    params.set("rut_persona", busqRut);
    if (busqTipo)   params.set("tipo_servicio", busqTipo);
    if (!allRows)   params.set("limit", DISPLAY_LIMIT);
    return `${API}/datos/pfa_finanzas?${params.toString()}`;
  }, [fechaDesde, fechaHasta, busqSG, busqRut, busqTipo]);

  const fetchData = useCallback((forzar = false) => {
    const url = buildUrl();
    if (!forzar) {
      const cached = getCached(url);
      if (cached) { setDataset(cached); return; }
    }
    setLoading(true);
    setError(null);
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
      .then(d  => { setCached(url, d); setDataset(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [buildUrl]);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { setPage(0); }, [fechaDesde, fechaHasta]);

  const buscar = () => {
    invalidate(buildUrl());
    setDataset(null);
    fetchData(true);
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const res = await fetch(buildUrl({ allRows: true }));
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const { rows } = await res.json();
      const cols = buildCols(rows);
      const ws = XLSX.utils.json_to_sheet(rows.map(r => Object.fromEntries(cols.map(c => [c, r[c] ?? ""]))));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "PFA Finanzas");
      XLSX.writeFile(wb, `pfa_finanzas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      alert(`Error al exportar: ${e.message}`);
    } finally {
      setExportando(false);
    }
  };

  const limpiarBusq = () => { setBusqSG(""); setBusqRut(""); setBusqTipo(""); };
  const hayBusq = busqSG || busqRut || busqTipo;
  const hayFecha = fechaDesde || fechaHasta;

  return (
    <div className="page">
      <div className="page-content">

        {/* Header */}
        <div className="page-header" style={{ marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <h2 className="page-title" style={{ "--accent": ACENTO }}>Vista Finanzas</h2>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 11, padding: "4px 10px", borderRadius: 99,
              background: `${ACENTO}14`, color: ACENTO,
              fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
            }}>PFA finanzas</span>
            {ds.total > 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 11, padding: "4px 10px", borderRadius: 99,
                background: "var(--bg3)", color: "var(--text2)",
                fontWeight: 600,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
                {ds.total.toLocaleString()} registros
              </span>
            )}
          </div>
        </div>

        {/* Filtros */}
        <div style={{
          ...cardBase, padding: "16px 20px", marginBottom: 16,
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {/* Fila 1: rango de fechas + acciones */}
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={eyebrow}>Rango de fechas</span>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="filter-group">
                  <label>Desde</label>
                  <input type="date" className="input-date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
                </div>
                <div className="filter-group">
                  <label>Hasta</label>
                  <input type="date" className="input-date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
                </div>
              </div>
            </div>

            <button className="btn-primary" onClick={buscar} disabled={loading}>
              {loading ? "Cargando..." : "Buscar"}
            </button>
            <button className="btn-export" onClick={exportar} disabled={exportando || ds.total === 0}>
              {exportando ? "Descargando..." : `↓ Exportar Excel (${ds.total.toLocaleString()})`}
            </button>

            
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />

          {/* Fila 2: búsqueda de texto */}
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={eyebrow}>Búsqueda</span>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="filter-group">
                  <label>Shipping group</label>
                  <input
                    type="text"
                    className="input-date"
                    placeholder="Buscar..."
                    value={busqSG}
                    onChange={e => setBusqSG(e.target.value)}
                  />
                </div>
                <div className="filter-group">
                  <label>RUT persona</label>
                  <input
                    type="text"
                    className="input-date"
                    placeholder="Buscar..."
                    value={busqRut}
                    onChange={e => setBusqRut(e.target.value)}
                  />
                </div>
                <div className="filter-group">
                  <label>Tipo servicio</label>
                  <input
                    type="text"
                    className="input-date"
                    placeholder="LAT / PU / HD"
                    value={busqTipo}
                    onChange={e => setBusqTipo(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {hayBusq && (
              <button
                onClick={limpiarBusq}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "9px 16px", borderRadius: 24,
                  background: "transparent", color: "var(--text2)",
                  border: "1px solid var(--border2)",
                  fontFamily: "var(--font-body)", fontWeight: 500, fontSize: 12,
                  cursor: "pointer", transition: "all 0.12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text2)"; }}
              >
                ✕ Limpiar búsqueda
              </button>
            )}
          </div>

          {/* Chips de filtros activos */}
          {(hayBusq || hayFecha) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
              <span style={{ ...eyebrow, fontSize: 9, color: "var(--text3)" }}>Filtros activos</span>
              {fechaDesde && (
                <span style={chipStyle}>
                  <span style={{ color: "var(--text3)" }}>desde:</span> {fechaDesde}
                  <button style={chipX} onClick={() => setFechaDesde("")} title="Quitar">✕</button>
                </span>
              )}
              {fechaHasta && (
                <span style={chipStyle}>
                  <span style={{ color: "var(--text3)" }}>hasta:</span> {fechaHasta}
                  <button style={chipX} onClick={() => setFechaHasta("")} title="Quitar">✕</button>
                </span>
              )}
              {busqSG && (
                <span style={chipStyle}>
                  <span style={{ color: "var(--text3)" }}>shipping_group:</span> {busqSG}
                  <button style={chipX} onClick={() => setBusqSG("")} title="Quitar">✕</button>
                </span>
              )}
              {busqRut && (
                <span style={chipStyle}>
                  <span style={{ color: "var(--text3)" }}>rut:</span> {busqRut}
                  <button style={chipX} onClick={() => setBusqRut("")} title="Quitar">✕</button>
                </span>
              )}
              {busqTipo && (
                <span style={chipStyle}>
                  <span style={{ color: "var(--text3)" }}>tipo:</span> {busqTipo}
                  <button style={chipX} onClick={() => setBusqTipo("")} title="Quitar">✕</button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Estados */}
        {loading && (
          <div style={{ ...cardBase, padding: 60, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
            <div style={{
              width: 28, height: 28, border: "3px solid var(--border)", borderTopColor: ACENTO,
              borderRadius: "50%", margin: "0 auto 14px", animation: "spin 0.8s linear infinite",
            }} />
            Cargando datos...
          </div>
        )}

        {error && (
          <div style={{ ...cardBase, padding: "20px 24px", borderColor: "rgba(255,68,102,0.30)", background: "rgba(255,68,102,0.04)" }}>
            <p style={{ fontSize: 13, color: "var(--red)", fontWeight: 600, marginBottom: 4 }}>
              ⚠ {error}
            </p>
            <p style={{ fontSize: 12, color: "var(--text3)" }}>
              Procesá un <strong style={{ color: "var(--text2)", fontWeight: 600 }}>PFA</strong> primero en <strong style={{ color: "var(--text2)", fontWeight: 600 }}>Carga de Datos</strong>.
            </p>
          </div>
        )}

        {/* Tabla */}
        {!loading && !error && ds.rows.length > 0 && (() => {
          const cols = buildCols(ds.rows);
          return (
            <div style={{ ...cardBase, padding: 0 }}>
              <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: ACENTO }} />
              <div style={{ padding: "14px 20px 10px", borderBottom: "1px solid var(--border)" }}>
                <p className="table-count" style={{ margin: 0 }}>
                  Mostrando <strong>{ds.rows.length.toLocaleString()}</strong> de{" "}
                  <strong>{ds.total.toLocaleString()}</strong> registros
                  {ds.total > DISPLAY_LIMIT && (
                    <span className="table-count-hint"> · Para ver todos usá Exportar Excel</span>
                  )}
                </p>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>{cols.map(c => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {paginar(ds.rows, page).map((row, i) => (
                      <tr key={i}>{cols.map(c => <td key={c}>{row[c] ?? ""}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginator total={ds.rows.length} page={page} onPage={setPage} />
            </div>
          );
        })()}

        {!loading && !error && dataset !== null && ds.rows.length === 0 && (
          <div style={{ ...cardBase, padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 32, color: "var(--text3)", marginBottom: 8 }}>◌</div>
            <p style={{ fontSize: 14, color: "var(--text2)", fontWeight: 500, marginBottom: 4 }}>
              Sin resultados para los filtros aplicados
            </p>
            <p style={{ fontSize: 12, color: "var(--text3)" }}>
              {hayBusq
                ? <>Probá <button onClick={limpiarBusq} style={inlineLinkStyle}>limpiar la búsqueda</button> o ajustar el rango de fechas.</>
                : "Ajustá el rango de fechas o vaciá los filtros para ver todo."}
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Estilos auxiliares ────────────────────────────────────────────────────
const chipStyle = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "4px 4px 4px 10px", borderRadius: 99,
  background: "rgba(214,66,148,0.08)",
  border: "1px solid rgba(214,66,148,0.25)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 11, fontWeight: 500,
};

const chipX = {
  width: 18, height: 18, borderRadius: "50%",
  border: "none", background: "transparent",
  color: "#D64294", cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontSize: 10, fontWeight: 700,
  marginLeft: 2,
};

const inlineLinkStyle = {
  background: "none", border: "none",
  color: "#D64294", fontWeight: 600,
  cursor: "pointer", padding: 0,
  textDecoration: "underline",
  fontSize: "inherit",
  fontFamily: "inherit",
};
