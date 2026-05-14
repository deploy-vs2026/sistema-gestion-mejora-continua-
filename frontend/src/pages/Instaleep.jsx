import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import Navbar from "../components/Navbar";
import { getCached, setCached, invalidate } from "../dataCache";

const API           = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const DISPLAY_LIMIT = 100;
const ACENTO        = "#6366F1";
const EMPTY         = { total: 0, rows: [] };

function formatTiempo(seg) {
  if (!seg && seg !== 0) return "—";
  const s = Math.round(seg);
  if (s >= 3600) {
    const h   = Math.floor(s / 3600);
    const min = Math.floor((s % 3600) / 60);
    return min > 0 ? `${h} h ${min} min` : `${h} h`;
  }
  const min  = Math.floor(s / 60);
  const resto = s % 60;
  if (min === 0) return `${resto} s`;
  return resto > 0 ? `${min} min ${resto} s` : `${min} min`;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, suffix = "", color = ACENTO }) {
  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "16px 20px", textAlign: "center", flex: 1, minWidth: 130,
    }}>
      <div style={{ fontFamily: "var(--font-head)", fontSize: 26, fontWeight: 700, color }}>
        {typeof value === "number" ? value.toLocaleString("es-CL") : (value ?? "—")}{suffix}
      </div>
      <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista KPI
// ─────────────────────────────────────────────────────────────────────────────
function KpiView() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const buildUrl = useCallback(() => {
    const p = new URLSearchParams();
    if (fechaDesde) p.set("desde", fechaDesde);
    if (fechaHasta) p.set("hasta", fechaHasta);
    return `${API}/kpi/instaleep?${p}`;
  }, [fechaDesde, fechaHasta]);

  const fetchKpi = useCallback((forzar = false) => {
    const url = buildUrl();
    if (!forzar) {
      const cached = getCached(url);
      if (cached) { setData(cached); setLoading(false); return; }
    }
    setLoading(true);
    setError(null);
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
      .then(d => { setCached(url, d); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [buildUrl]);

  useEffect(() => { fetchKpi(); }, []);

  const r = data?.resumen ?? {};

  const tooltipStyle = {
    contentStyle: {
      background: "var(--bg2)", border: "1px solid var(--border)",
      borderRadius: 8, fontSize: 12,
    },
  };

  return (
    <>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap" }}>
        <div className="filter-group">
          <label>Desde</label>
          <input type="date" className="input-date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Hasta</label>
          <input type="date" className="input-date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
        </div>
        <button
          className="btn-primary"
          onClick={() => { invalidate(buildUrl()); fetchKpi(true); }}
          disabled={loading}
          style={{ alignSelf: "flex-end" }}
        >
          Actualizar
        </button>
        {loading && <span style={{ fontSize: 12, color: "var(--text3)", alignSelf: "center" }}>Cargando...</span>}
      </div>

      {error && <p className="table-msg error">{error}</p>}

      {data && (
        <>
          {/* KPI Cards — fila 1 */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <KpiCard label="Total pedidos"     value={r.total}            />
            <KpiCard label="Finalizados"       value={r.finished}         color="#10B981" />
            <KpiCard label="Cancelados"        value={r.cancelled}        color="#EF4444" />
            <KpiCard label="Tasa finalización" value={r.completion_rate}  suffix=" %" />
          </div>

          {/* KPI Cards — fila 2 */}
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            <KpiCard label="Tiempo prom. proceso" value={formatTiempo(r.avg_tiempo_proceso)} />
            <KpiCard label="Tamaño prom. canasta (SKU)" value={r.avg_basket}       />
            <KpiCard label="Tasa quiebre stock"         value={r.stockout_rate}    suffix=" %" color="#F59E0B" />
            <KpiCard label="Tasa éxito de pago"         value={r.payment_success_rate} suffix=" %" color="#10B981" />
          </div>

          {/* Gráficos — fila superior */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>

            {/* Tendencia de pedidos por día */}
            {data.por_fecha?.length > 0 && (
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 16px" }}>
                <p style={{ margin: "0 0 16px 4px", fontFamily: "var(--font-head)", fontSize: 13, color: "var(--text2)" }}>
                  Pedidos por día
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.por_fecha} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: "var(--text3)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text3)" }} />
                    <Tooltip {...tooltipStyle} />
                    <Line dataKey="total"    name="Total"       stroke={ACENTO}    strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="finished" name="Finalizados" stroke="#10B981"   strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Pago status */}
            {(r.pago_succeeded > 0 || r.pago_failed > 0) && (
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 16px" }}>
                <p style={{ margin: "0 0 16px 4px", fontFamily: "var(--font-head)", fontSize: 13, color: "var(--text2)" }}>
                  Estado de pagos
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={[
                      { name: "Exitosos",   value: r.pago_succeeded, fill: "#10B981" },
                      { name: "Fallidos",   value: r.pago_failed,    fill: "#EF4444" },
                    ]}
                    margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text3)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text3)" }} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="value" name="Pedidos" radius={[4, 4, 0, 0]}>
                      <Cell fill="#10B981" />
                      <Cell fill="#EF4444" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Gráfico Top Tiendas */}
          {data.top_tiendas?.length > 0 && (
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 16px", marginBottom: 20 }}>
              <p style={{ margin: "0 0 16px 4px", fontFamily: "var(--font-head)", fontSize: 13, color: "var(--text2)" }}>
                Top tiendas por volumen de pedidos
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.top_tiendas} layout="vertical" margin={{ top: 5, right: 40, left: 140, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text3)" }} />
                  <YAxis dataKey="tienda" type="category" tick={{ fontSize: 11, fill: "var(--text3)" }} width={140} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="pedidos"  name="Total"       fill={ACENTO}  radius={[0,4,4,0]} />
                  <Bar dataKey="finished" name="Finalizados" fill="#10B981" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla Top Pickers */}
          {data.top_pickers?.length > 0 && (
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 16px", marginBottom: 20 }}>
              <p style={{ margin: "0 0 16px 4px", fontFamily: "var(--font-head)", fontSize: 13, color: "var(--text2)" }}>
                Productividad pickers — top 10
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Picker ID</th>
                      <th>Pedidos</th>
                      <th>Finalizados</th>
                      <th>Tasa %</th>
                      <th>SKU prom.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_pickers.map((p, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{p.picker_id}</td>
                        <td>{p.pedidos.toLocaleString()}</td>
                        <td>{p.finished.toLocaleString()}</td>
                        <td style={{ color: p.pedidos ? (p.finished / p.pedidos > 0.8 ? "#10B981" : "#F59E0B") : "var(--text3)" }}>
                          {p.pedidos ? Math.round(p.finished / p.pedidos * 100) : 0}%
                        </td>
                        <td>{p.avg_sku.toLocaleString("es-CL", { maximumFractionDigits: 1 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

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
  const [historial,  setHistorial]  = useState([]);

  const ds   = dataset ?? EMPTY;
  const cols = ds.rows.length > 0
    ? Object.keys(ds.rows[0]).filter(c => c !== "_cargado_en")
    : [];

  const buildUrl = useCallback(({ allRows = false } = {}) => {
    const params = new URLSearchParams();
    if (fechaDesde) params.set("desde", fechaDesde);
    if (fechaHasta) params.set("hasta", fechaHasta);
    if (!allRows)   params.set("limit", DISPLAY_LIMIT);
    return `${API}/datos/instaleep?${params.toString()}`;
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
      .then(d => { setCached(url, d); setDataset(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [buildUrl]);

  useEffect(() => {
    fetchData();
    fetch(`${API}/historial/instaleep`)
      .then(r => r.json())
      .then(setHistorial)
      .catch(() => {});
  }, []);

  const buscar = () => { invalidate(buildUrl()); setDataset(null); fetchData(true); };

  const exportar = async () => {
    setExportando(true);
    try {
      const res = await fetch(buildUrl({ allRows: true }));
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const { rows } = await res.json();
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Instaleep");
      XLSX.writeFile(wb, `instaleep_${fechaDesde || "all"}_${fechaHasta || "all"}.xlsx`);
    } catch (e) {
      alert(`Error al exportar: ${e.message}`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <>
      {/* Filtros */}
      <div className="page-actions" style={{ marginBottom: 20 }}>
        <div className="filter-group">
          <label>Desde</label>
          <input type="date" className="input-date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Hasta</label>
          <input type="date" className="input-date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={buscar} disabled={loading}>
          {loading ? "Cargando..." : "Buscar"}
        </button>
        <button className="btn-export" onClick={exportar} disabled={exportando || ds.total === 0}>
          {exportando ? "Descargando..." : `Exportar Excel (${ds.total.toLocaleString()})`}
        </button>
      </div>

      {loading && <p className="table-msg">Cargando datos...</p>}
      {error   && <p className="table-msg error">{error}</p>}

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
              <thead>
                <tr>{cols.map(c => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {ds.rows.map((row, i) => (
                  <tr key={i}>
                    {cols.map(c => (
                      <td key={c}>{row[c] === null || row[c] === undefined ? "" : String(row[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && dataset !== null && ds.rows.length === 0 && (
        <p className="table-msg">Sin resultados para el rango seleccionado.</p>
      )}

      {/* Historial de cargas */}
      {historial.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <p className="table-count" style={{ marginBottom: 8 }}>Historial de cargas automáticas</p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Filas</th>
                  <th>Cargado en</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => (
                  <tr key={i}>
                    <td>{h.archivo}</td>
                    <td>{h.filas.toLocaleString()}</td>
                    <td>{h.cargado_en}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────
export default function Instaleep() {
  const [tab,    setTab]    = useState("kpi");
  const [yaHoy,  setYaHoy]  = useState(false);

  useEffect(() => {
    fetch(`${API}/estado-instaleep`)
      .then(r => r.json())
      .then(d => setYaHoy(d.ya_cargado))
      .catch(() => {});
  }, []);

  const tabStyle = (active) => ({
    padding: "6px 18px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    background: active ? ACENTO : "var(--bg2)",
    color: active ? "#fff" : "var(--text2)",
    transition: "background 0.15s",
  });

  return (
    <div className="page">
      <Navbar />
      <div className="page-content">

        {/* Header */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 className="page-title" style={{ "--accent": ACENTO }}>Instaleap</h2>
            <span style={{
              fontSize: 11, padding: "2px 10px", borderRadius: 99,
              background: yaHoy ? "#065F46" : "#374151",
              color: yaHoy ? "#6EE7B7" : "#9CA3AF",
            }}>
              {yaHoy ? "✓ Datos de hoy cargados" : "Sin carga de hoy"}
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={tabStyle(tab === "kpi")}   onClick={() => setTab("kpi")}>KPIs</button>
            <button style={tabStyle(tab === "tabla")} onClick={() => setTab("tabla")}>Tabla</button>
          </div>
        </div>

        {tab === "kpi"   && <KpiView   />}
        {tab === "tabla" && <TablaView />}

      </div>
    </div>
  );
}
