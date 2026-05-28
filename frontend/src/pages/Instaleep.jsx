import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LineChart, Line, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { getCached, setCached, invalidate } from "../dataCache";

const API           = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const DISPLAY_LIMIT = 100;
const ACENTO        = "#D64294";   // Valdishopper Pink
const NAVY          = "#0B1C49";
const GREEN         = "#00C48C";
const RED           = "#FF4466";
const ORANGE        = "#FF6B35";
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
    {hint && (
      <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 300 }}>
        {hint}
      </span>
    )}
    <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 8 }} />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card — con accent stripe, icono y copy didáctico
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, hint, suffix = "", color = ACENTO, icon }) {
  return (
    <div
      style={{
        ...cardBase,
        padding: "18px 20px 16px",
        flex: 1,
        minWidth: 160,
        display: "flex",
        flexDirection: "column",
        gap: 4,
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
      {/* accent stripe */}
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
        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Card wrapper
// ─────────────────────────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, accent = ACENTO, children, style }) {
  return (
    <div style={{ ...cardBase, padding: "22px 20px 18px", ...style }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: accent }} />
      <div style={{ marginBottom: 14 }}>
        <p style={{
          fontFamily: "var(--font-head)", fontSize: 14, fontWeight: 700,
          color: "var(--text)", margin: 0, letterSpacing: "-0.01em",
        }}>
          {title}
        </p>
        {subtitle && (
          <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0", fontWeight: 300 }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
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

  return (
    <>
      {/* Filtros */}
      <div style={{
        ...cardBase, padding: "16px 20px", marginBottom: 24,
        display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap",
      }}>
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

        <button
          className="btn-primary"
          onClick={() => { invalidate(buildUrl()); fetchKpi(true); }}
          disabled={loading}
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>

        
      </div>

      {error && <p className="table-msg error">{error}</p>}

      {data && (
        <>
          {/* ── Volumen y conversión ─────────────────────────────────────────── */}
          {sectionHeader("Volumen y conversión", "cuántos pedidos entraron y cuántos llegaron a destino")}

          <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
            <KpiCard
              label="Total pedidos"
              value={r.total}
              hint="Todos los pedidos creados en el rango"
              icon="∑"
              color={ACENTO}
            />
            <KpiCard
              label="Finalizados"
              value={r.finished}
              hint="Entregados con éxito al cliente"
              icon="✓"
              color={GREEN}
            />
            <KpiCard
              label="Cancelados"
              value={r.cancelled}
              hint="No completados por cliente, stock u otros"
              icon="✕"
              color={RED}
            />
            <KpiCard
              label="Tasa finalización"
              value={r.completion_rate}
              suffix="%"
              hint="Finalizados ÷ Total — meta ≥ 95%"
              icon="%"
              color={NAVY}
            />
          </div>

          {/* ── Operación ────────────────────────────────────────────────────── */}
          {sectionHeader("Operación", "qué tan eficiente fue el picking y el pago")}

          <div style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
            <KpiCard
              label="Tiempo prom. proceso"
              value={formatTiempo(r.avg_tiempo_proceso)}
              hint="Desde creación hasta entrega"
              icon="⏱"
              color={NAVY}
            />
            <KpiCard
              label="Canasta promedio"
              value={r.avg_basket}
              suffix="SKU"
              hint="Items distintos por pedido"
              icon="◫"
              color={ACENTO}
            />
            <KpiCard
              label="Quiebre de stock"
              value={r.stockout_rate}
              suffix="%"
              hint="Pedidos con al menos un SKU faltante"
              icon="!"
              color={ORANGE}
            />
            <KpiCard
              label="Éxito de pago"
              value={r.payment_success_rate}
              suffix="%"
              hint="Pagos aprobados al primer intento"
              icon="$"
              color={GREEN}
            />
          </div>

          {/* ── Tendencia ────────────────────────────────────────────────────── */}
          {sectionHeader("Tendencia", "evolución día a día en el rango seleccionado")}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

            {/* Tendencia de pedidos por día */}
            {data.por_fecha?.length > 0 && (
              <ChartCard
                title="Pedidos por día"
                subtitle="Total creado vs. finalizado — el gap es la merma operativa"
                accent={ACENTO}
              >
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={data.por_fecha} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stopColor={ACENTO} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={ACENTO} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradFinished" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stopColor={GREEN} stopOpacity={0.30} />
                        <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: "var(--text3)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Area type="monotone" dataKey="total"    name="Total"       stroke={ACENTO} strokeWidth={2.5} fill="url(#gradTotal)" />
                    <Area type="monotone" dataKey="finished" name="Finalizados" stroke={GREEN}  strokeWidth={2.5} fill="url(#gradFinished)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Pago status */}
            {(r.pago_succeeded > 0 || r.pago_failed > 0) && (
              <ChartCard
                title="Estado de pagos"
                subtitle="Distribución entre pagos aprobados y rechazados"
                accent={GREEN}
              >
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={[
                      { name: "Exitosos",   value: r.pago_succeeded },
                      { name: "Fallidos",   value: r.pago_failed    },
                    ]}
                    margin={{ top: 10, right: 12, left: -10, bottom: 0 }}
                    barCategoryGap="35%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text3)", fontWeight: 500 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(11,28,73,0.04)" }} />
                    <Bar dataKey="value" name="Pedidos" radius={[8, 8, 0, 0]}>
                      <Cell fill={GREEN} />
                      <Cell fill={RED} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* ── Performance por entidad ──────────────────────────────────────── */}
          {(data.top_tiendas?.length > 0 || data.top_pickers?.length > 0) &&
            sectionHeader("Performance por entidad", "tiendas y pickers ordenados por volumen")}

          {/* Gráfico Top Tiendas */}
          {data.top_tiendas?.length > 0 && (
            <ChartCard
              title="Top tiendas por volumen"
              subtitle="Ranking por pedidos creados — barra clara: total · barra verde: finalizados"
              accent={ACENTO}
              style={{ marginBottom: 16 }}
            >
              <ResponsiveContainer width="100%" height={Math.max(220, data.top_tiendas.length * 36)}>
                <BarChart data={data.top_tiendas} layout="vertical" margin={{ top: 5, right: 30, left: 8, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="tienda" type="category" tick={{ fontSize: 11, fill: "var(--text2)", fontWeight: 500 }} width={140} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(11,28,73,0.04)" }} />
                  <Bar dataKey="pedidos"  name="Total"       fill={ACENTO} radius={[0,4,4,0]} barSize={10} />
                  <Bar dataKey="finished" name="Finalizados" fill={GREEN}  radius={[0,4,4,0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Tabla Top Pickers */}
          {data.top_pickers?.length > 0 && (
            <ChartCard
              title="Productividad de pickers — top 10"
              subtitle="Tasa en verde si ≥ 80% — meta operativa para mantener SLA"
              accent={GREEN}
              style={{ marginBottom: 20 }}
            >
              <div className="table-scroll" style={{ marginTop: 4 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Picker ID</th>
                      <th style={{ textAlign: "right" }}>Pedidos</th>
                      <th style={{ textAlign: "right" }}>Finalizados</th>
                      <th style={{ textAlign: "right" }}>Tasa</th>
                      <th style={{ textAlign: "right" }}>SKU prom.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_pickers.map((p, i) => {
                      const tasa = p.pedidos ? Math.round(p.finished / p.pedidos * 100) : 0;
                      const tasaColor = !p.pedidos ? "var(--text3)" : (tasa >= 80 ? GREEN : (tasa >= 60 ? ORANGE : RED));
                      return (
                        <tr key={i}>
                          <td>
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 22, height: 22, borderRadius: "50%",
                              background: i < 3 ? `${ACENTO}18` : "var(--bg3)",
                              color: i < 3 ? ACENTO : "var(--text2)",
                              fontSize: 11, fontWeight: 700, fontFamily: "var(--font-head)",
                            }}>{i + 1}</span>
                          </td>
                          <td style={{ fontFamily: "var(--font-head)", fontWeight: 600 }}>{p.picker_id}</td>
                          <td style={{ textAlign: "right" }}>{p.pedidos.toLocaleString()}</td>
                          <td style={{ textAlign: "right" }}>{p.finished.toLocaleString()}</td>
                          <td style={{ textAlign: "right" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: 99,
                              fontSize: 11, fontWeight: 600,
                              background: `${tasaColor}14`, color: tasaColor,
                            }}>{tasa}%</span>
                          </td>
                          <td style={{ textAlign: "right" }}>{p.avg_sku.toLocaleString("es-CL", { maximumFractionDigits: 1 })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ChartCard>
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
        <button className="btn-primary" onClick={buscar} disabled={loading}>
          {loading ? "Cargando..." : "Buscar"}
        </button>
        <button className="btn-export" onClick={exportar} disabled={exportando || ds.total === 0}>
          {exportando ? "Descargando..." : `↓ Exportar Excel (${ds.total.toLocaleString()})`}
        </button>

        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)", maxWidth: 280, lineHeight: 1.4 }}>
          La tabla muestra los primeros <strong style={{ color: "var(--text2)", fontWeight: 600 }}>{DISPLAY_LIMIT}</strong> registros. Usa <strong style={{ color: "var(--text2)", fontWeight: 600 }}>Exportar Excel</strong> para el dataset completo.
        </div>
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
      {error && <p className="table-msg error">{error}</p>}

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

      {/* Historial de cargas */}
      {historial.length > 0 && (
        <div style={{ marginTop: 32 }}>
          {sectionHeader("Historial de cargas", "archivos procesados automáticamente por el pipeline")}
          <div style={{ ...cardBase, padding: "16px 20px 18px" }}>
            <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: "var(--blue)" }} />
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Archivo</th>
                    <th style={{ textAlign: "right" }}>Filas</th>
                    <th>Cargado en</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "var(--font-head)", fontWeight: 500 }}>{h.archivo}</td>
                      <td style={{ textAlign: "right" }}>{h.filas.toLocaleString()}</td>
                      <td style={{ color: "var(--text2)" }}>{h.cargado_en}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    padding: "8px 22px",
    borderRadius: 99,
    border: active ? "none" : "1px solid var(--border)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "var(--font-body)",
    background: active ? ACENTO : "var(--bg2)",
    color: active ? "#fff" : "var(--text2)",
    boxShadow: active ? "0 4px 14px rgba(214,66,148,0.28)" : "none",
    transition: "all 0.18s ease",
  });

  const statusBadge = {
    display: "inline-flex", alignItems: "center", gap: 8,
    fontSize: 12, padding: "5px 12px 5px 10px", borderRadius: 99,
    background: yaHoy ? "rgba(0,196,140,0.10)" : "rgba(122,134,158,0.10)",
    color: yaHoy ? "#00896B" : "var(--text2)",
    border: `1px solid ${yaHoy ? "rgba(0,196,140,0.30)" : "var(--border)"}`,
    fontWeight: 500,
  };

  const pulseStyle = {
    width: 7, height: 7, borderRadius: "50%",
    background: yaHoy ? GREEN : "var(--text3)",
    animation: yaHoy ? "pulse 2s ease-in-out infinite" : "none",
  };

  return (
    <div className="page">
      <div className="page-content">

        {/* Header */}
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <h2 className="page-title" style={{ "--accent": ACENTO }}>Instaleap</h2>
            <span style={statusBadge}>
              <span style={pulseStyle} />
              {yaHoy ? "Datos de hoy cargados" : "Sin carga de hoy"}
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, background: "var(--bg3)", padding: 4, borderRadius: 99 }}>
            <button style={tabStyle(tab === "kpi")}   onClick={() => setTab("kpi")}>
              <span style={{ marginRight: 6, opacity: 0.7 }}>◴</span>KPIs
            </button>
            <button style={tabStyle(tab === "tabla")} onClick={() => setTab("tabla")}>
              <span style={{ marginRight: 6, opacity: 0.7 }}>≣</span>Tabla
            </button>
          </div>
        </div>

        {/* Subtítulo didáctico */}
          

        {tab === "kpi"   && <KpiView   />}
        {tab === "tabla" && <TablaView />}

      </div>

      {/* Animaciones locales — no requieren CSS global extra */}
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
      `}</style>
    </div>
  );
}
