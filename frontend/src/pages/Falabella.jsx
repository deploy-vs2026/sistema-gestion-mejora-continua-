import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  ComposedChart, Bar, Line, LineChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Navbar from "../components/Navbar";
import Paginator, { paginar } from "../components/Paginator";
import { getCached, setCached, invalidate } from "../dataCache";

const API           = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const DISPLAY_LIMIT = 100;
const EMPTY         = { total: 0, rows: [] };
const ACENTO        = "#7C3AED";

// ─────────────────────────────────────────────────────────────────────────────
// Vista Tabla
// ─────────────────────────────────────────────────────────────────────────────
function TablaView() {
  const [dataset,    setDataset]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [exportando, setExportando] = useState(false);
  const [page,       setPage]       = useState(0);

  const ds   = dataset ?? EMPTY;
  const cols = ds.rows.length > 0 ? Object.keys(ds.rows[0]) : [];

  const buildUrl = useCallback(({ allRows = false } = {}) => {
    const params = new URLSearchParams();
    if (fechaDesde) params.set("desde", fechaDesde);
    if (fechaHasta) params.set("hasta", fechaHasta);
    if (!allRows)   params.set("limit", DISPLAY_LIMIT);
    return `${API}/datos/geosort?${params.toString()}`;
  }, [fechaDesde, fechaHasta]);

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

  const buscar = () => { invalidate(buildUrl()); setDataset(null); fetchData(true); };

  const exportar = async () => {
    setExportando(true);
    try {
      const res = await fetch(buildUrl({ allRows: true }));
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const { rows } = await res.json();
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Geosort");
      XLSX.writeFile(wb, `geosort_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { alert(`Error al exportar: ${e.message}`); }
    finally { setExportando(false); }
  };

  return (
    <>
      <div className="page-header">
        <h2 className="page-title" style={{ "--accent": ACENTO }}>Geosort</h2>
        <div className="page-actions">
          <div className="filter-group">
            <label>Desde</label>
            <input type="date" className="input-date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
          </div>
          <div className="filter-group">
            <label>Hasta</label>
            <input type="date" className="input-date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={buscar} disabled={loading}>Buscar</button>
          <button className="btn-export" onClick={exportar} disabled={exportando || ds.total === 0}>
            {exportando ? "Descargando..." : `Exportar Excel (${ds.total.toLocaleString()})`}
          </button>
        </div>
      </div>

      {loading && <p className="table-msg">Cargando datos...</p>}
      {error   && <p className="table-msg error">{error} — cargá los datos Geosort desde Carga de Datos primero.</p>}

      {!loading && !error && ds.rows.length > 0 && (
        <div className="table-wrap">
          <p className="table-count">
            Mostrando <strong>{ds.rows.length.toLocaleString()}</strong> de{" "}
            <strong>{ds.total.toLocaleString()}</strong> registros
            {ds.total > DISPLAY_LIMIT && (
              <span className="table-count-hint"> · Para ver todos usá Exportar Excel</span>
            )}
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {paginar(ds.rows, page).map((row, i) => (
                  <tr key={i}>{cols.map(c => <td key={c}>{row[c] ?? ""}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginator total={ds.rows.length} page={page} onPage={setPage} />
        </div>
      )}
      {!loading && !error && dataset !== null && ds.rows.length === 0 && (
        <p className="table-msg">Sin resultados para el rango seleccionado.</p>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-select dropdown
// ─────────────────────────────────────────────────────────────────────────────
function MultiSelect({ label, options, selected, onChange, formatOption }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (val) =>
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);

  const displayText = selected.length === 0
    ? "Todas"
    : selected.length === 1
      ? (formatOption ? formatOption(selected[0]) : String(selected[0]))
      : `${selected.length} seleccionados`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "6px 10px", background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 6, color: "var(--text1)", cursor: "pointer", fontSize: 13,
          minWidth: 160, textAlign: "left", display: "flex",
          justifyContent: "space-between", alignItems: "center", gap: 8,
        }}
      >
        <span>{displayText}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)", minWidth: 200, maxHeight: 280,
          overflowY: "auto", padding: "4px 0",
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            <span style={{ fontWeight: 600 }}>Todas</span>
          </label>
          {options.map(opt => (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              <span>{formatOption ? formatOption(opt) : String(opt)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, suffix = "" }) {
  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "16px 24px", textAlign: "center", flex: 1, minWidth: 120,
    }}>
      <div style={{ fontFamily: "var(--font-head)", fontSize: 28, fontWeight: 700, color: ACENTO }}>
        {typeof value === "number" ? value.toLocaleString("es-CL") : value}{suffix}
      </div>
      <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista KPI
// ─────────────────────────────────────────────────────────────────────────────
function KpiView() {
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [anio,         setAnio]         = useState("");
  const [selectedSems, setSelectedSems] = useState([]);
  const [selectedCts,  setSelectedCts]  = useState([]);

  const fetchKpi = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (anio)                params.set("anio",   anio);
    if (selectedSems.length) params.set("semana", selectedSems.join(","));
    if (selectedCts.length)  params.set("ct",     selectedCts.join(","));
    fetch(`${API}/kpi/geosort?${params}`)
      .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [anio, selectedSems, selectedCts]);

  useEffect(() => { fetchKpi(); }, [fetchKpi]);

  const handleAnio = (v) => { setAnio(v); setSelectedSems([]); };

  const anios   = data?.filtros?.anios   ?? [];
  const semanas = data?.filtros?.semanas ?? [];
  const cts     = data?.filtros?.cts     ?? [];
  const r       = data?.resumen ?? {};

  return (
    <>
      {/* ── Filtros ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap" }}>
        <div className="filter-group">
          <label>Año</label>
          <select className="input-date" value={anio} onChange={e => handleAnio(e.target.value)}
            style={{ padding: "6px 10px" }}>
            <option value="">Todos</option>
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Semana</label>
          <MultiSelect
            options={semanas}
            selected={selectedSems}
            onChange={setSelectedSems}
            formatOption={s => `Sem ${s}`}
          />
        </div>
        <div className="filter-group">
          <label>CT</label>
          <MultiSelect
            options={cts}
            selected={selectedCts}
            onChange={setSelectedCts}
          />
        </div>
        {loading && <span style={{ fontSize: 12, color: "var(--text3)" }}>Actualizando...</span>}
      </div>

      {error && <p className="table-msg error">{error}</p>}

      {data && (
        <>
          {/* ── KPI Cards ── */}
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            <KpiCard label="Rutas"      value={r.rutas}      />
            <KpiCard label="Móviles"    value={r.moviles}    />
            <KpiCard label="Entregas"   value={r.entregas}   />
            <KpiCard label="Pendientes" value={r.pendientes} />
            <KpiCard label="Fill Rate"  value={r.fill_rate}  suffix=" %" />
          </div>

          {/* ── Indicadores por CT ── */}
          {data.por_ct?.length > 0 && (
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 16px", marginBottom: 20 }}>
              <p style={{ margin: "0 0 16px 4px", fontFamily: "var(--font-head)", fontSize: 13, color: "var(--text2)" }}>
                Indicadores por CT
              </p>
              <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 12, background: ACENTO, borderRadius: 2, display: "inline-block" }} /> Rutas
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 3, background: "#1d4ed8", display: "inline-block" }} /> Móviles
                </span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={data.por_ct} margin={{ top: 10, right: 40, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="ct" tick={{ fontSize: 10, fill: "var(--text3)" }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: "var(--text3)" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--text3)" }} />
                  <Tooltip contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Bar    yAxisId="left"  dataKey="rutas"   fill={ACENTO}    radius={[4,4,0,0]} label={{ position: "top", fontSize: 9, fill: "var(--text2)" }} />
                  <Line   yAxisId="right" dataKey="moviles" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── KPI Operación (Fill Rate por Semana) ── */}
          {data.por_semana.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>

              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 16px" }}>
                <p style={{ margin: "0 0 16px 4px", fontFamily: "var(--font-head)", fontSize: 13, color: "var(--text2)" }}>
                  KPI Operación — Fill Rate por Semana
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.por_semana} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="semana" tickFormatter={s => `Sem ${s}`} tick={{ fontSize: 11, fill: "var(--text3)" }} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--text3)" }} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={v => [`${v}%`, "Fill Rate"]} contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Line dataKey="fill_rate" stroke={ACENTO} strokeWidth={2} dot={{ r: 4, fill: ACENTO }}
                      label={{ position: "top", fontSize: 9, fill: "var(--text2)", formatter: v => `${v}%` }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 16px" }}>
                <p style={{ margin: "0 0 16px 4px", fontFamily: "var(--font-head)", fontSize: 13, color: "var(--text2)" }}>
                  Rutas por Semana
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.por_semana} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="semana" tickFormatter={s => `Sem ${s}`} tick={{ fontSize: 11, fill: "var(--text3)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text3)" }} />
                    <Tooltip formatter={v => [v.toLocaleString("es-CL"), "Rutas"]} contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Line dataKey="rutas" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 4, fill: "#1d4ed8" }}
                      label={{ position: "top", fontSize: 9, fill: "var(--text2)" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

            </div>
          )}
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────
export default function Falabella() {
  const [tab, setTab] = useState("kpi");

  return (
    <div className="page">
      <Navbar />
      <div className="page-content">

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
          {[["kpi", "KPI"], ["tabla", "Tabla"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "8px 20px",
                background: "none",
                border: "none",
                borderBottom: tab === key ? `2px solid ${ACENTO}` : "2px solid transparent",
                color: tab === key ? ACENTO : "var(--text3)",
                fontFamily: "var(--font-head)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: -1,
                transition: "color 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "kpi"   && <KpiView />}
        {tab === "tabla" && <TablaView />}

      </div>
    </div>
  );
}
