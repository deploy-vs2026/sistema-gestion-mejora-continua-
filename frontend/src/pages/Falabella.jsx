import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  ComposedChart, Bar, Line, LineChart, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Paginator, { paginar } from "../components/Paginator";
import { getCached, setCached, invalidate, TTL_DAY_MS } from "../dataCache";

const API           = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const DISPLAY_LIMIT = 100;
const EMPTY         = { total: 0, rows: [] };
const ACENTO        = "#7C3AED";   // Violet — color de sección Geosort en SIGMC
const NAVY          = "#0B1C49";
const GREEN         = "#00C48C";
const ORANGE        = "#FF6B35";
const BLUE          = "#1d4ed8";

// ─────────────────────────────────────────────────────────────────────────────
// Estilos compartidos
// ─────────────────────────────────────────────────────────────────────────────
const eyebrow = {
  fontFamily: "var(--font-head)",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--text3)",
};

const cardBase = {
  background: "var(--bg2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  position: "relative",
  overflow: "hidden",
};

const sectionHeader = (label, hint) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "8px 4px 14px" }}>
    <span style={eyebrow}>{label}</span>
    {hint && <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 300 }}>{hint}</span>}
    <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 8 }} />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// ChartCard wrapper — con stripe + eyebrow + title + subtítulo didáctico
// ─────────────────────────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, accent = ACENTO, legend, children, style }) {
  return (
    <div style={{ ...cardBase, padding: "22px 20px 18px", ...style }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: accent }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <p style={{
            fontFamily: "var(--font-head)", fontSize: 14, fontWeight: 700,
            color: "var(--text)", margin: 0, letterSpacing: "-0.01em",
          }}>{title}</p>
          {subtitle && (
            <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0", fontWeight: 300 }}>{subtitle}</p>
          )}
        </div>
        {legend && <div>{legend}</div>}
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "var(--bg2)",
    border: "1px solid var(--border2)",
    borderRadius: 10,
    fontSize: 12,
    fontFamily: "var(--font-body)",
    boxShadow: "0 8px 24px rgba(11,28,73,0.10)",
    padding: "8px 12px",
  },
  labelStyle: { color: "var(--text3)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 },
  itemStyle:  { color: "var(--text)", fontWeight: 500 },
};

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
      .then(d  => { setCached(url, d, TTL_DAY_MS); setDataset(d); })
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
      {/* Filtros */}
      <div style={{
        ...cardBase, padding: "16px 20px", marginBottom: 20,
        display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <div className="filter-group">
          <label>Desde</label>
          <input type="date" className="input-date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Hasta</label>
          <input type="date" className="input-date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={buscar} disabled={loading}
          style={{ background: ACENTO, boxShadow: "0 4px 14px rgba(124,58,237,0.28)" }}>
          {loading ? "Cargando..." : "Buscar"}
        </button>
        <button className="btn-export" onClick={exportar} disabled={exportando || ds.total === 0}>
          {exportando ? "Descargando..." : `↓ Exportar Excel (${ds.total.toLocaleString()})`}
        </button>

        
      </div>

      {loading && (
        <div style={{ ...cardBase, padding: 60, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          <div className="spinner" style={{
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
            Cargá los datos Geosort desde <strong style={{ color: "var(--text2)", fontWeight: 600 }}>Carga de Datos</strong> primero.
          </p>
        </div>
      )}

      {!loading && !error && ds.rows.length > 0 && (
        <div style={{ ...cardBase, padding: "16px 20px 18px" }}>
          <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: ACENTO }} />
          <p className="table-count" style={{ marginTop: 4 }}>
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
        <div style={{ ...cardBase, padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 32, color: "var(--text3)", marginBottom: 8 }}>◌</div>
          <p style={{ fontSize: 14, color: "var(--text2)", fontWeight: 500, marginBottom: 4 }}>
            Sin resultados para el rango seleccionado
          </p>
          <p style={{ fontSize: 12, color: "var(--text3)" }}>
            Ajusta las fechas o vacía los filtros para ver todo el histórico.
          </p>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-select dropdown — restyled con look SIGMC
// ─────────────────────────────────────────────────────────────────────────────
function MultiSelect({ options, selected, onChange, formatOption }) {
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
      : `${selected.length} seleccionadas`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "8px 12px",
          background: "var(--bg2)",
          border: open ? `1px solid ${ACENTO}` : "1px solid var(--border)",
          boxShadow: open ? `0 0 0 3px ${ACENTO}1f` : "none",
          borderRadius: 8,
          color: selected.length === 0 ? "var(--text3)" : "var(--text)",
          cursor: "pointer",
          fontSize: 13,
          fontFamily: "var(--font-body)",
          fontWeight: selected.length === 0 ? 400 : 500,
          minWidth: 170,
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {selected.length > 1 && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 18, height: 18, padding: "0 5px",
              background: ACENTO, color: "#fff", borderRadius: 99,
              fontSize: 10, fontWeight: 700,
            }}>{selected.length}</span>
          )}
          <span>{displayText}</span>
        </span>
        <span style={{ fontSize: 9, color: "var(--text3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200,
          background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 10,
          boxShadow: "0 12px 32px rgba(11,28,73,0.14)",
          minWidth: 210, maxHeight: 320, overflowY: "auto", padding: "4px 0",
        }}>
          <label
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 14px", cursor: "pointer", fontSize: 12,
              borderBottom: "1px solid var(--border)",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(124,58,237,0.05)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = ""; }}
          >
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])}
              style={{ accentColor: ACENTO, cursor: "pointer" }} />
            <span style={{ fontWeight: 600, color: "var(--text)" }}>Todas</span>
          </label>
          {options.map(opt => {
            const isSel = selected.includes(opt);
            return (
              <label
                key={opt}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "7px 14px", cursor: "pointer", fontSize: 12,
                  background: isSel ? "rgba(124,58,237,0.06)" : "transparent",
                  color: isSel ? "var(--text)" : "var(--text2)",
                  fontWeight: isSel ? 500 : 400,
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(124,58,237,0.04)"; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                <input type="checkbox" checked={isSel} onChange={() => toggle(opt)}
                  style={{ accentColor: ACENTO, cursor: "pointer" }} />
                <span>{formatOption ? formatOption(opt) : String(opt)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card — con stripe, ícono y hint didáctico
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, suffix = "", hint, icon, color = ACENTO }) {
  return (
    <div
      style={{
        ...cardBase, padding: "18px 20px 16px",
        flex: 1, minWidth: 160,
        display: "flex", flexDirection: "column", gap: 4,
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(11,28,73,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: color }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ ...eyebrow, fontSize: 9 }}>{label}</span>
        {icon && (
          <span style={{
            width: 26, height: 26, borderRadius: 8,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: `${color}14`, color, fontSize: 14, fontWeight: 700,
          }}>{icon}</span>
        )}
      </div>
      <div style={{
        fontFamily: "var(--font-head)", fontSize: 28, fontWeight: 800,
        color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1,
      }}>
        {typeof value === "number" ? value.toLocaleString("es-CL") : (value ?? "—")}
        {suffix && <span style={{ fontSize: 16, color: "var(--text3)", marginLeft: 4, fontWeight: 700 }}>{suffix}</span>}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2, lineHeight: 1.4 }}>{hint}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Legend inline
// ─────────────────────────────────────────────────────────────────────────────
function ChartLegend({ items }) {
  return (
    <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--text2)", fontFamily: "var(--font-body)", fontWeight: 500 }}>
      {items.map(({ color, shape = "square", label }) => (
        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {shape === "line" ? (
            <span style={{ width: 14, height: 3, background: color, borderRadius: 2, display: "inline-block" }} />
          ) : (
            <span style={{ width: 10, height: 10, background: color, borderRadius: 3, display: "inline-block" }} />
          )}
          {label}
        </span>
      ))}
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

  const buildKpiUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (anio)                params.set("anio",   anio);
    if (selectedSems.length) params.set("semana", selectedSems.join(","));
    if (selectedCts.length)  params.set("ct",     selectedCts.join(","));
    return `${API}/kpi/geosort?${params}`;
  }, [anio, selectedSems, selectedCts]);

  const fetchKpi = useCallback((forzar = false) => {
    const url = buildKpiUrl();
    if (!forzar) {
      const cached = getCached(url);
      if (cached) { setData(cached); setLoading(false); return; }
    }
    setLoading(true);
    setError(null);
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
      .then(d  => { setCached(url, d, TTL_DAY_MS); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [buildKpiUrl]);

  useEffect(() => { fetchKpi(); }, [fetchKpi]);

  const handleAnio = (v) => { setAnio(v); setSelectedSems([]); };

  const anios   = data?.filtros?.anios   ?? [];
  const semanas = data?.filtros?.semanas ?? [];
  const cts     = data?.filtros?.cts     ?? [];
  const r       = data?.resumen ?? {};

  // Color del fill rate según umbral
  const fillRateColor = (() => {
    if (r.fill_rate == null) return ACENTO;
    if (r.fill_rate >= 95) return GREEN;
    if (r.fill_rate >= 85) return ORANGE;
    return "var(--red)";
  })();

  return (
    <>
      {/* ── Filtros ── */}
      <div style={{
        ...cardBase, overflow: "visible", padding: "16px 20px", marginBottom: 24,
        display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <div className="filter-group">
          <label>Año</label>
          <select className="input-date" value={anio} onChange={e => handleAnio(e.target.value)}>
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
          <label>Centro (CT)</label>
          <MultiSelect
            options={cts}
            selected={selectedCts}
            onChange={setSelectedCts}
          />
        </div>
        <button
          className="btn-primary"
          onClick={() => { invalidate(buildKpiUrl()); fetchKpi(true); }}
          disabled={loading}
          style={{ background: ACENTO, boxShadow: "0 4px 14px rgba(124,58,237,0.28)" }}
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>

        
      </div>

      {error && <p className="table-msg error">{error}</p>}

      {data && (
        <>
          {/* ── Resumen de operación ── */}
          {sectionHeader("Resumen de operación", "snapshot del rango filtrado")}

          <div style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
            <KpiCard
              label="Rutas"
              value={r.rutas}
              hint="Rutas planificadas en el período"
              icon="↗"
              color={ACENTO}
            />
            <KpiCard
              label="Móviles"
              value={r.moviles}
              hint="Vehículos asignados a rutas"
              icon="◇"
              color={BLUE}
            />
            <KpiCard
              label="Entregas"
              value={r.entregas}
              hint="Paquetes entregados con éxito"
              icon="✓"
              color={GREEN}
            />
            <KpiCard
              label="Pendientes"
              value={r.pendientes}
              hint="Sin entregar o reprogramados"
              icon="!"
              color={ORANGE}
            />
            <KpiCard
              label="Fill Rate"
              value={r.fill_rate}
              suffix="%"
              hint="Entregas ÷ planificado — meta ≥ 95%"
              icon="%"
              color={fillRateColor}
            />
          </div>

          {/* ── Distribución por centro ── */}
          {data.por_ct?.length > 0 && (
            <>
              {sectionHeader("Distribución por centro", "carga operativa de cada CT en el filtro activo")}
              <ChartCard
                title="Indicadores por CT"
                subtitle="Barra: rutas planificadas en el CT · Línea: cantidad de móviles asignados"
                accent={ACENTO}
                legend={<ChartLegend items={[
                  { color: ACENTO, label: "Rutas",   shape: "square" },
                  { color: BLUE,   label: "Móviles", shape: "line"   },
                ]} />}
                style={{ marginBottom: 24 }}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={data.por_ct} margin={{ top: 16, right: 40, left: 0, bottom: 60 }}>
                    <defs>
                      <linearGradient id="barRutas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={ACENTO} stopOpacity={1} />
                        <stop offset="100%" stopColor={ACENTO} stopOpacity={0.65} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="ct" tick={{ fontSize: 10, fill: "var(--text2)", fontWeight: 500 }}
                      angle={-35} textAnchor="end" interval={0}
                      axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                    <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(124,58,237,0.06)" }} />
                    <Bar  yAxisId="left"  dataKey="rutas"   name="Rutas"   fill="url(#barRutas)" radius={[6,6,0,0]} barSize={26}
                      label={{ position: "top", fontSize: 9, fill: "var(--text2)", fontWeight: 600 }} />
                    <Line yAxisId="right" dataKey="moviles" name="Móviles" stroke={BLUE} strokeWidth={2.5}
                      dot={{ r: 4, fill: BLUE, strokeWidth: 2, stroke: "#fff" }}
                      activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            </>
          )}

          {/* ── Evolución semanal ── */}
          {data.por_semana.length > 0 && (
            <>
              {sectionHeader("Evolución semanal", "tendencia de fill rate y volumen de rutas")}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <ChartCard
                  title="Fill Rate por semana"
                  subtitle="% de entregas exitosas — meta operativa ≥ 95%"
                  accent={GREEN}
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={data.por_semana} margin={{ top: 16, right: 16, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"  stopColor={GREEN} stopOpacity={0.30} />
                          <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="semana" tickFormatter={s => `S${s}`}
                        tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--text3)" }}
                        tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={v => [`${v}%`, "Fill Rate"]}
                        labelFormatter={s => `Semana ${s}`}
                        {...tooltipStyle}
                      />
                      {/* Línea de meta 95% */}
                      <Line dataKey={() => 95} stroke="var(--border2)" strokeDasharray="4 4" strokeWidth={1} dot={false} activeDot={false} legendType="none" name="Meta 95%" isAnimationActive={false} />
                      <Area type="monotone" dataKey="fill_rate" name="Fill Rate" stroke={GREEN} strokeWidth={2.5} fill="url(#gradFill)"
                        dot={{ r: 3.5, fill: GREEN, strokeWidth: 2, stroke: "#fff" }}
                        activeDot={{ r: 5 }}
                        label={{ position: "top", fontSize: 9, fill: "var(--text2)", fontWeight: 600, formatter: v => `${v}%` }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Rutas por semana"
                  subtitle="Volumen planificado — útil para detectar peaks operativos"
                  accent={BLUE}
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={data.por_semana} margin={{ top: 16, right: 16, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradRutas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"  stopColor={BLUE} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="semana" tickFormatter={s => `S${s}`}
                        tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={v => [v.toLocaleString("es-CL"), "Rutas"]}
                        labelFormatter={s => `Semana ${s}`}
                        {...tooltipStyle}
                      />
                      <Area type="monotone" dataKey="rutas" name="Rutas" stroke={BLUE} strokeWidth={2.5} fill="url(#gradRutas)"
                        dot={{ r: 3.5, fill: BLUE, strokeWidth: 2, stroke: "#fff" }}
                        activeDot={{ r: 5 }}
                        label={{ position: "top", fontSize: 9, fill: "var(--text2)", fontWeight: 600 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </>
          )}
        </>
      )}

      {loading && !data && (
        <div style={{ ...cardBase, padding: 60, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          <div className="spinner" style={{
            width: 28, height: 28, border: "3px solid var(--border)", borderTopColor: ACENTO,
            borderRadius: "50%", margin: "0 auto 14px", animation: "spin 0.8s linear infinite",
          }} />
          Cargando indicadores...
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────
export default function Falabella() {
  const [tab, setTab] = useState("kpi");

  const tabStyle = (active) => ({
    padding: "8px 22px",
    borderRadius: 99,
    border: active ? "none" : "1px solid transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "var(--font-body)",
    background: active ? ACENTO : "transparent",
    color: active ? "#fff" : "var(--text2)",
    boxShadow: active ? "0 4px 14px rgba(124,58,237,0.28)" : "none",
    transition: "all 0.18s ease",
  });

  return (
    <div className="page">
      <div className="page-content">

        {/* Header */}
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <h2 className="page-title" style={{ "--accent": ACENTO }}>Geosort · Falabella</h2>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 11, padding: "4px 10px", borderRadius: 99,
              background: `${ACENTO}14`, color: ACENTO,
              fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
            }}>Última milla</span>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, background: "var(--bg3)", padding: 4, borderRadius: 99 }}>
            <button style={tabStyle(tab === "kpi")}   onClick={() => setTab("kpi")}>
              <span style={{ marginRight: 6, opacity: 0.7 }}>◴</span>KPIs
            </button>
            <button style={tabStyle(tab === "tabla")} onClick={() => setTab("tabla")}>
              <span style={{ marginRight: 6, opacity: 0.7 }}>≣</span>Tabla
            </button>
          </div>
        </div>

        {/* Subtítulo didáctico */}
        <p style={{
          fontSize: 13, color: "var(--text2)", margin: "0 0 24px",
          maxWidth: 720, lineHeight: 1.55, fontWeight: 300,
        }}>
        </p>

        {tab === "kpi"   && <KpiView />}
        {tab === "tabla" && <TablaView />}

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
