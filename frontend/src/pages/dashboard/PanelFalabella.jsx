import { useState, useEffect, useRef, useCallback } from "react";
import { Chart } from "chart.js/auto";

const API = "https://dataflow-api-519623119758.us-central1.run.app";
const FB_LEVELS = ["year", "month", "week", "day"];
const FB_MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function qs(p = {}) {
  const parts = [];
  for (const [k, v] of Object.entries(p)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) { v.forEach((vi) => parts.push(`${k}=${encodeURIComponent(vi)}`)); }
    else { parts.push(`${k}=${encodeURIComponent(v)}`); }
  }
  return parts.length ? "?" + parts.join("&") : "";
}

const PALETTE = ["#D64294","#0B1C49","#3D5490","#A02D6E","#1D9E75","#8A94A8","#F0997B","#5DCAA5","#EF9F27","#7F77DD"];

export default function PanelFalabella() {
  const [fi, setFi] = useState("");
  const [ff, setFf] = useState("");
  const [zona, setZona] = useState("");
  const [ctOpts, setCtOpts] = useState([]);
  const [semanaOpts, setSemanaOpts] = useState([]);
  const [selectedCTs, setSelectedCTs] = useState(new Set());
  const [selectedSemanas, setSelectedSemanas] = useState([]);
  const [level, setLevel] = useState("week");
  const [selYear, setSelYear] = useState(null);
  const [selMonth, setSelMonth] = useState(null);
  const [selWeek, setSelWeek] = useState(null);
  const baseFiRef = useRef(null);
  const baseFfRef = useRef(null);
  const fechaMinSetRef = useRef(false);
  const fechaMaxSetRef = useRef(false);
  const hmDiaRef = useRef(null);

  // KPIs
  const [kpiRutas, setKpiRutas] = useState("—");
  const [kpiMoviles, setKpiMoviles] = useState("—");
  const [kpiEntregados, setKpiEntregados] = useState("—");
  const [kpiFillRate, setKpiFillRate] = useState("—");

  // Secondary data
  const [ctData, setCtData] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [compSemanal, setCompSemanal] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [periodos, setPeriodos] = useState(null);

  // Charts
  const chartRefs = useRef({ ev: null, motivos: null });
  const evCanvasRef = useRef(null);
  const motivosCanvasRef = useRef(null);
  const lastEvDataRef = useRef([]);

  const destroyChart = (key) => {
    if (chartRefs.current[key]) { chartRefs.current[key].destroy(); chartRefs.current[key] = null; }
  };

  // ─── Build params ─────────────────────────────────────────────────────────
  const getParams = useCallback(() => ({
    fecha_inicio: fi || null,
    fecha_fin: ff || null,
    zona: zona || null,
  }), [fi, ff, zona]);

  const getCtParam = useCallback(() => {
    if (selectedCTs.size === 0) return {};
    return { ct: [...selectedCTs] };
  }, [selectedCTs]);

  const getSemanaParam = useCallback(() => {
    if (!selectedSemanas.length) return {};
    return { semana: selectedSemanas };
  }, [selectedSemanas]);

  // ─── Render KPIs ─────────────────────────────────────────────────────────
  const renderKPIs = useCallback((d) => {
    const fmtN = (n) => n == null ? "—" : Number(n).toLocaleString("es-CL");
    setKpiRutas(fmtN(d.rutas));
    setKpiMoviles(fmtN(d.moviles));
    setKpiEntregados(fmtN(d.terminados));
    setKpiFillRate(d.fill_rate != null ? d.fill_rate.toFixed(1) + "%" : "—");
  }, []);

  // ─── Get label for evolution data ─────────────────────────────────────────
  const getLabel = useCallback((d, lvl) => {
    if (lvl === "week" && d.periodo) {
      const match = d.periodo.match(/S(\d+)$/);
      return match ? "S" + match[1] : d.periodo;
    }
    return d.periodo;
  }, []);

  // ─── Render evolution chart ───────────────────────────────────────────────
  const renderEv = useCallback((data, lvl) => {
    destroyChart("ev");
    if (!evCanvasRef.current) return;
    const labels = data.map((d) => getLabel(d, lvl));
    const canDrill = lvl !== "day";

    const lpEv = {
      id: "fb-lbl-ev",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((el, i) => {
            const v = ds.data[i]; if (v == null) return;
            ctx.save(); ctx.textAlign = "center";
            if (di === 0) {
              ctx.font = "bold 10px Montserrat,sans-serif"; ctx.fillStyle = "#0B1C49"; ctx.textBaseline = "bottom";
              ctx.fillText(Number(v).toLocaleString("es-CL"), el.x, el.y - 4);
            } else {
              const txt = v.toFixed(1) + "%";
              ctx.font = "bold 10px Montserrat,sans-serif";
              const tw = ctx.measureText(txt).width;
              ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(el.x - tw / 2 - 3, el.y - 18, tw + 6, 14);
              ctx.fillStyle = "#A02D6E"; ctx.textBaseline = "bottom"; ctx.fillText(txt, el.x, el.y - 5);
            }
            ctx.restore();
          });
        });
      },
    };

    chartRefs.current.ev = new Chart(evCanvasRef.current.getContext("2d"), {
      plugins: [lpEv],
      data: {
        labels,
        datasets: [
          { type: "bar", label: "Rutas", data: data.map((d) => d.rutas), backgroundColor: "rgba(11,28,73,.75)", borderRadius: 4, yAxisID: "y", order: 2 },
          { type: "line", label: "Fill Rate %", data: data.map((d) => d.fill_rate), borderColor: "#D64294", backgroundColor: "transparent", borderDash: [5, 3], pointBackgroundColor: "#D64294", pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5, tension: 0.3, spanGaps: true, yAxisID: "y1", order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 32, right: 16, bottom: 4, left: 4 } },
        onClick: canDrill ? (evt, els) => { if (!els.length) return; handleDrillInto(data[els[0].index]); } : null,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#0B1C49", borderColor: "#3D5490", borderWidth: 1, titleColor: "#fff", bodyColor: "#8A94A8", padding: 10,
            callbacks: {
              title: (items) => data[items[0].dataIndex]?.periodo || items[0].label,
              label: (ctx) => ctx.datasetIndex === 0 ? ` Rutas: ${Number(ctx.parsed.y).toLocaleString("es-CL")}` : ` Fill Rate: ${ctx.parsed.y?.toFixed(1)}%`,
              afterBody: canDrill ? () => ["", "  → Clic para ver detalle"] : null,
            },
          },
        },
        scales: {
          x: { type: "category", ticks: { color: "#8A94A8", font: { size: 9 }, maxRotation: 0, autoSkip: false }, grid: { color: "rgba(211,213,232,.4)" } },
          y: { position: "left", ticks: { color: "#0B1C49", font: { size: 9 }, callback: (v) => Number(v).toLocaleString("es-CL") }, grid: { color: "rgba(211,213,232,.4)" }, title: { display: true, text: "Rutas", color: "#0B1C49", font: { size: 9 } } },
          y1: { position: "right", min: 85, max: 100, ticks: { color: "#D64294", font: { size: 9 }, callback: (v) => v + "%" }, grid: { drawOnChartArea: false }, title: { display: true, text: "Fill Rate %", color: "#D64294", font: { size: 9 } } },
        },
      },
    });
    if (evCanvasRef.current) evCanvasRef.current.style.cursor = canDrill ? "pointer" : "default";
  }, [getLabel]);

  // ─── Render motivos chart ─────────────────────────────────────────────────
  const renderMotivos = useCallback((data) => {
    destroyChart("motivos");
    if (!data || !data.length) { setMotivos([]); return; }
    const total = data.reduce((s, d) => s + (d.cantidad || 0), 0);
    setMotivos(data.map((d, i) => ({ ...d, pct: total > 0 ? (d.cantidad / total * 100).toFixed(1) : 0, color: PALETTE[i % PALETTE.length] })));
    if (!motivosCanvasRef.current) return;
    chartRefs.current.motivos = new Chart(motivosCanvasRef.current.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: data.map((d) => d.motivo),
        datasets: [{ data: data.map((d) => d.cantidad), backgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 2, borderColor: "#fff", hoverOffset: 8 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "65%",
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#0B1C49", borderColor: "#3D5490", borderWidth: 1, titleColor: "#fff", bodyColor: "#8A94A8", padding: 10, callbacks: { label: (ctx) => { const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0; return ` ${Number(ctx.parsed).toLocaleString("es-CL")} (${pct}%)`; } } } },
      },
    });
  }, []);

  // ─── Load filtros ─────────────────────────────────────────────────────────
  const loadFiltros = useCallback(async (p, selCTs, selSems) => {
    try {
      const data = await fetch(`${API}/api/falabella/filtros` + qs(p)).then((r) => r.json());
      setCtOpts(data.cts || []);
      setSemanaOpts(data.semanas || []);
      if (data.fecha_min && !fechaMinSetRef.current) { setFi(data.fecha_min); fechaMinSetRef.current = true; }
      if (data.fecha_max && !fechaMaxSetRef.current) { setFf(data.fecha_max); fechaMaxSetRef.current = true; }
    } catch (e) { console.error("Error fb filtros:", e); }
  }, []);

  // ─── Load evolution ───────────────────────────────────────────────────────
  const loadEvolucion = useCallback(async (p, ctP, semP, lvl) => {
    try {
      const [evolucion, porCt, kpis, mots, alerts, compSem, hm] = await Promise.all([
        fetch(`${API}/api/falabella/evolucion` + qs({ ...p, ...ctP, ...semP, granularidad: lvl })).then((r) => r.json()),
        fetch(`${API}/api/falabella/por-ct` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()),
        fetch(`${API}/api/falabella/kpis` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()),
        fetch(`${API}/api/falabella/motivos` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()).catch(() => []),
        fetch(`${API}/api/falabella/alertas-ct` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()).catch(() => []),
        fetch(`${API}/api/falabella/comparacion-semanal` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()).catch(() => null),
        fetch(`${API}/api/falabella/heatmap-ct-dia` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()).catch(() => null),
      ]);
      lastEvDataRef.current = evolucion;
      renderKPIs(kpis);
      setCtData(porCt);
      renderEv(evolucion, lvl);
      renderMotivos(mots);
      setAlertas(alerts || []);
      setCompSemanal(compSem);
      setHeatmap(hm);
    } catch (e) { console.error("Error fb evolucion:", e); }
  }, [renderKPIs, renderEv, renderMotivos]);

  // ─── Load all ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async (p, ctP, semP, lvl) => {
    try {
      const [kpis, evolucion, porCt] = await Promise.all([
        fetch(`${API}/api/falabella/kpis` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()),
        fetch(`${API}/api/falabella/evolucion` + qs({ ...p, ...ctP, ...semP, granularidad: lvl })).then((r) => r.json()),
        fetch(`${API}/api/falabella/por-ct` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()),
      ]);
      lastEvDataRef.current = evolucion;
      await loadFiltros({ ...p, ...ctP, ...semP }, ctP.ct, semP.semana);
      renderKPIs(kpis);
      setCtData(porCt);
      renderEv(evolucion, lvl);

      // Secondary (non-blocking)
      Promise.all([
        fetch(`${API}/api/falabella/motivos` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()).catch(() => []),
        fetch(`${API}/api/falabella/alertas-ct` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()).catch(() => []),
        fetch(`${API}/api/falabella/comparacion-semanal` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()).catch(() => null),
        fetch(`${API}/api/falabella/heatmap-ct-dia` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()).catch(() => null),
        fetch(`${API}/api/falabella/periodos` + qs({ ...ctP, ...semP })).then((r) => r.json()).catch(() => null),
      ]).then(([mots, alerts, compSem, hm, pers]) => {
        renderMotivos(mots);
        setAlertas(alerts || []);
        setCompSemanal(compSem);
        setHeatmap(hm);
        if (pers) setPeriodos(pers);
      }).catch((e) => console.error("Error fb fase2:", e));
    } catch (e) { console.error("Error Falabella fase1:", e); }
  }, [loadFiltros, renderKPIs, renderEv, renderMotivos]);

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadFiltros({}, {}, {}).then(() => {
      // loadAll will be triggered once fi/ff are set from filtros
    });
    return () => { destroyChart("ev"); destroyChart("motivos"); };
  }, []); // eslint-disable-line

  // Load when fi/ff become available (set from filtros)
  const loadedRef = useRef(false);
  useEffect(() => {
    if (fi && ff && !loadedRef.current) {
      loadedRef.current = true;
      loadAll({ fecha_inicio: fi, fecha_fin: ff, zona: zona || null }, {}, {}, "week");
    }
  }, [fi, ff]); // eslint-disable-line

  // ─── Drill handlers ───────────────────────────────────────────────────────
  const handleDrillInto = useCallback((row) => {
    if (!baseFiRef.current) { baseFiRef.current = fi; baseFfRef.current = ff; }
    let newFi, newFf, newLevel = level, newSelYear = selYear, newSelMonth = selMonth, newSelWeek = selWeek;

    if (level === "year") { const y = row.anio || row.periodo; newFi = `${y}-01-01`; newFf = `${y}-12-31`; newSelYear = parseInt(y); newLevel = "month"; }
    else if (level === "month") {
      const [y, m] = (row.periodo || "").split("-").map(Number);
      if (!y || !m) return;
      const lastDay = new Date(y, m, 0).getDate();
      newFi = `${y}-${String(m).padStart(2, "0")}-01`; newFf = `${y}-${String(m).padStart(2, "0")}-${lastDay}`;
      newSelYear = y; newSelMonth = m; newLevel = "week";
    } else if (level === "week") {
      const si = row.semana_inicio; if (!si) return;
      const dt = new Date(si + "T12:00:00"); const en = new Date(dt); en.setDate(en.getDate() + 6);
      newFi = si; newFf = en.toISOString().slice(0, 10); newSelWeek = row.semana; newLevel = "day";
    }
    setFi(newFi); setFf(newFf);
    setLevel(newLevel); setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
    const ctP = selectedCTs.size > 0 ? { ct: [...selectedCTs] } : {};
    const semP = selectedSemanas.length > 0 ? { semana: selectedSemanas } : {};
    loadEvolucion({ fecha_inicio: newFi, fecha_fin: newFf, zona: zona || null }, ctP, semP, newLevel);
    fetch(`${API}/api/falabella/kpis` + qs({ fecha_inicio: newFi, fecha_fin: newFf, zona: zona || null, ...ctP, ...semP })).then((r) => r.json()).then(renderKPIs).catch(() => {});
  }, [fi, ff, zona, level, selYear, selMonth, selWeek, selectedCTs, selectedSemanas, loadEvolucion, renderKPIs]);

  const handleDrillUp = useCallback(async () => {
    const i = FB_LEVELS.indexOf(level); if (i <= 0) return;
    const newLevel = FB_LEVELS[i - 1];
    let newFi = fi, newFf = ff;
    let newSelYear = selYear, newSelMonth = selMonth, newSelWeek = selWeek;
    if (i - 1 === 0) { newSelYear = null; newSelMonth = null; newSelWeek = null; }
    if (i - 1 === 1) { newSelMonth = null; newSelWeek = null; }
    if (i - 1 === 2) { newSelWeek = null; }
    if (newLevel === "year" && baseFiRef.current) { newFi = baseFiRef.current; newFf = baseFfRef.current; baseFiRef.current = null; baseFfRef.current = null; }
    else if (newSelMonth && newSelYear) { const lastDay = new Date(newSelYear, newSelMonth, 0).getDate(); newFi = `${newSelYear}-${String(newSelMonth).padStart(2, "0")}-01`; newFf = `${newSelYear}-${String(newSelMonth).padStart(2, "0")}-${lastDay}`; }
    else if (newSelYear) { newFi = `${newSelYear}-01-01`; newFf = `${newSelYear}-12-31`; }
    else if (baseFiRef.current) { newFi = baseFiRef.current; newFf = baseFfRef.current; baseFiRef.current = null; baseFfRef.current = null; }
    setFi(newFi); setFf(newFf);
    setLevel(newLevel); setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
    const ctP = selectedCTs.size > 0 ? { ct: [...selectedCTs] } : {};
    const semP = selectedSemanas.length > 0 ? { semana: selectedSemanas } : {};
    await loadEvolucion({ fecha_inicio: newFi, fecha_fin: newFf, zona: zona || null }, ctP, semP, newLevel);
    fetch(`${API}/api/falabella/kpis` + qs({ fecha_inicio: newFi, fecha_fin: newFf, zona: zona || null, ...ctP, ...semP })).then((r) => r.json()).then(renderKPIs).catch(() => {});
  }, [fi, ff, zona, level, selYear, selMonth, selWeek, selectedCTs, selectedSemanas, loadEvolucion, renderKPIs]);

  const handleSetLevel = useCallback(async (newLevel) => {
    const ni = FB_LEVELS.indexOf(newLevel), ci = FB_LEVELS.indexOf(level);
    let newFi = fi, newFf = ff;
    let newSelYear = selYear, newSelMonth = selMonth, newSelWeek = selWeek;
    if (ni < ci) {
      if (ni <= 0) { newSelYear = null; newSelMonth = null; newSelWeek = null; }
      if (ni <= 1) { newSelMonth = null; newSelWeek = null; }
      if (ni <= 2) { newSelWeek = null; }
      if (baseFiRef.current) { newFi = baseFiRef.current; newFf = baseFfRef.current; if (ni === 0) { baseFiRef.current = null; baseFfRef.current = null; } }
    }
    setLevel(newLevel); setFi(newFi); setFf(newFf);
    setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
    const ctP = selectedCTs.size > 0 ? { ct: [...selectedCTs] } : {};
    const semP = selectedSemanas.length > 0 ? { semana: selectedSemanas } : {};
    await loadEvolucion({ fecha_inicio: newFi, fecha_fin: newFf, zona: zona || null }, ctP, semP, newLevel);
  }, [fi, ff, zona, level, selYear, selMonth, selWeek, selectedCTs, selectedSemanas, loadEvolucion]);

  const handleToggleCT = useCallback((ct) => {
    setSelectedCTs((prev) => {
      const next = new Set(prev);
      if (next.has(ct)) { next.delete(ct); } else { next.add(ct); }
      const ctP = next.size > 0 ? { ct: [...next] } : {};
      const semP = selectedSemanas.length > 0 ? { semana: selectedSemanas } : {};
      const p = { fecha_inicio: fi, fecha_fin: ff, zona: zona || null };
      Promise.all([
        fetch(`${API}/api/falabella/kpis` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()),
        fetch(`${API}/api/falabella/evolucion` + qs({ ...p, ...ctP, ...semP, granularidad: level })).then((r) => r.json()),
        fetch(`${API}/api/falabella/por-ct` + qs({ ...p, ...ctP, ...semP })).then((r) => r.json()),
      ]).then(([k, ev, ct]) => { lastEvDataRef.current = ev; renderKPIs(k); setCtData(ct); renderEv(ev, level); }).catch((e) => console.error("Error fb CT:", e));
      return next;
    });
  }, [fi, ff, zona, level, selectedSemanas, renderKPIs, renderEv]);

  const handleReset = () => {
    setLevel("week"); setSelYear(null); setSelMonth(null); setSelWeek(null);
    baseFiRef.current = null; baseFfRef.current = null;
    setSelectedCTs(new Set()); setSelectedSemanas([]);
    setZona(""); setCtData([]); setMotivos([]); setAlertas([]); setCompSemanal(null); setHeatmap(null);
    fechaMinSetRef.current = false; fechaMaxSetRef.current = false;
    destroyChart("motivos");
    loadFiltros({}, {}, {}).then(() => {
      setFi(""); setFf("");
      loadedRef.current = false;
    });
  };

  // ─── Drill context ────────────────────────────────────────────────────────
  const drillParts = [];
  if (selYear) drillParts.push(<strong key="y">{selYear}</strong>);
  if (selMonth) drillParts.push(<strong key="m">{FB_MESES[selMonth]}</strong>);
  if (selWeek) drillParts.push(<strong key="w">S{selWeek}</strong>);
  const drillCtx = drillParts.length
    ? <span>🔍 {drillParts.reduce((acc, el, i) => [...acc, ...(i > 0 ? [" › "] : []), el], [])}</span>
    : null;

  const evTitle = `Evolución de Rutas · Fill Rate ${{ year: "por Año", month: "por Mes", week: "por Semana", day: "por Día" }[level] || ""}`;

  // ─── CT table helpers ──────────────────────────────────────────────────────
  const maxR = Math.max(...ctData.map((d) => d.rutas || 0), 1);
  const maxM = Math.max(...ctData.map((d) => d.moviles || 0), 1);
  const fN = (n) => Number(n).toLocaleString("es-CL");

  const frBadge = (v) => {
    if (v == null) return <span>—</span>;
    const [bg, color, dot] = v >= 96 ? ["#E6F9F0", "#1B8A5A", "#1B8A5A"] : v >= 93 ? ["#FFF8E1", "#B8860B", "#B8860B"] : ["#FDEAEA", "#C0392B", "#C0392B"];
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: bg, color }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: dot }} />{v.toFixed(1)}%</span>;
  };

  const miniBar = (val, max, color) => {
    const pct = Math.round(val / max * 100);
    return <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
      <span style={{ fontWeight: 700, color }}>{fN(val)}</span>
      <div style={{ width: 50, height: 4, background: "#EEF1F8", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
    </div>;
  };

  const mid = Math.ceil(ctData.length / 2);

  // ─── Heatmap helpers ────────────────────────────────────────────────────────
  const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab"];

  const hmCell = (v, vAnt, modo) => {
    if (v == null) return <span style={{ color: "#D0D5E8", fontSize: 9 }}>—</span>;
    const [bg, color] = v >= 96 ? ["#E6F9F0", "#1B8A5A"] : v >= 93 ? ["#FFF8E1", "#B8860B"] : ["#FDEAEA", "#C0392B"];
    let delta = null;
    if (modo === "comparacion" && vAnt != null) { const d = v - vAnt; const dc = d >= 0 ? "#1B8A5A" : "#C0392B"; delta = <span style={{ fontSize: 7, display: "block", color: dc, lineHeight: 1 }}>{d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}</span>; }
    return <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3px 5px", borderRadius: 6, fontSize: 9, fontWeight: 700, minWidth: 52, background: bg, color }}>{v.toFixed(1)}%{delta}</span>;
  };

  const frBadgeSmall = (v) => {
    if (v == null) return <span style={{ color: "#8A94A8", fontSize: 9 }}>—</span>;
    const [bg, color, dot] = v >= 96 ? ["#E6F9F0", "#1B8A5A", "#1B8A5A"] : v >= 93 ? ["#FFF8E1", "#B8860B", "#B8860B"] : ["#FDEAEA", "#C0392B", "#C0392B"];
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 6px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: bg, color }}><span style={{ width: 4, height: 4, borderRadius: "50%", background: dot }} />{v.toFixed(1)}%</span>;
  };

  return (
    <div className="db-main">
      {/* Filter bar */}
      <div className="db-filter-bar">
        <label>Desde</label>
        <input type="date" value={fi} onChange={(e) => setFi(e.target.value)} />
        <label>Hasta</label>
        <input type="date" value={ff} onChange={(e) => setFf(e.target.value)} />
        <label>Zona</label>
        <select value={zona} onChange={(e) => { setZona(e.target.value); setSelectedCTs(new Set()); setSelectedSemanas([]); }} style={{ minWidth: 120, height: 36 }}>
          <option value="">Todas</option>
          <option value="RM">RM</option>
          <option value="Regiones">Regiones</option>
        </select>
        <label>CT</label>
        <select multiple size={1} style={{ minWidth: 180, maxWidth: 260, height: 36 }}
          onChange={(e) => {
            const vals = [...e.target.selectedOptions].map((o) => o.value).filter((v) => v !== "");
            setSelectedCTs(new Set(vals));
          }}
          title="Ctrl+clic para múltiples CT">
          {ctOpts.map((c) => <option key={c} value={c} selected={selectedCTs.has(c)}>{c}</option>)}
        </select>
        <label>Semana</label>
        <select multiple size={1} style={{ minWidth: 160, maxWidth: 220, height: 36 }}
          onChange={(e) => { const vals = [...e.target.selectedOptions].map((o) => o.value).filter((v) => v !== ""); setSelectedSemanas(vals); }}
          title="Ctrl+clic para múltiples semanas">
          {semanaOpts.map((s) => <option key={s.semana} value={s.semana}>S{String(s.semana).padStart(2, "0")}</option>)}
        </select>
        <button className="db-btn-ghost" onClick={handleReset}>↩ Reiniciar</button>
        <span className="db-range-label">{fi && ff ? `${fi} → ${ff}` : ""}</span>
      </div>

      {/* KPI cards */}
      <div className="db-kpis" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="db-kpi"><div className="db-kpi-label">Rutas</div><div className="db-kpi-val pink">{kpiRutas}</div></div>
        <div className="db-kpi"><div className="db-kpi-label">Móviles</div><div className="db-kpi-val navy">{kpiMoviles}</div></div>
        <div className="db-kpi"><div className="db-kpi-label">Entregados</div><div className="db-kpi-val" style={{ color: "var(--vs-success)" }}>{kpiEntregados}</div></div>
        <div className="db-kpi"><div className="db-kpi-label">Fill Rate %</div><div className="db-kpi-val warn">{kpiFillRate}</div></div>
      </div>

      {/* Evolution chart */}
      <div className="db-chart-panel" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <div><div className="db-chart-title">{evTitle}</div><div className="db-chart-sub">Clic en punto para drill down</div></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span onClick={() => { const chart = chartRefs.current.ev; if (!chart) return; const meta = chart.getDatasetMeta(0); meta.hidden = !meta.hidden; chart.update(); }} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#3A3F52", cursor: "pointer", padding: "3px 10px", borderRadius: 20, border: ".5px solid #D0D5E8" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(11,28,73,.75)" }} />Rutas
              </span>
              <span onClick={() => { const chart = chartRefs.current.ev; if (!chart) return; const meta = chart.getDatasetMeta(1); meta.hidden = !meta.hidden; chart.update(); }} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#3A3F52", cursor: "pointer", padding: "3px 10px", borderRadius: 20, border: ".5px solid #D0D5E8" }}>
                <span style={{ width: 20, height: 0, borderTop: "2.5px dashed #D64294", display: "inline-block" }} />Fill Rate %
              </span>
            </div>
            <div style={{ width: 1, height: 20, background: "#D0D5E8" }} />
            {FB_LEVELS.map((l, i) => (
              <span key={l} style={{ display: "contents" }}>
                {i > 0 && <span className="db-hier-sep">›</span>}
                <button className={`db-hier-pill${level === l ? " active" : ""}`} onClick={() => handleSetLevel(l)}>
                  {l === "year" ? "Año" : l === "month" ? "Mes" : l === "week" ? "Semana" : "Día"}
                </button>
              </span>
            ))}
            <button className="db-btn-up" disabled={level === "year"} onClick={handleDrillUp} style={{ marginLeft: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg> Subir
            </button>
            <span className="db-drill-ctx" style={{ fontSize: 11, color: "#8A94A8" }}>{drillCtx}</span>
          </div>
        </div>
        <div style={{ position: "relative", height: 260 }}><canvas ref={evCanvasRef} /></div>
      </div>

      {/* CT table */}
      <div className="db-chart-panel" style={{ marginBottom: 16 }}>
        <div className="db-chart-title">Indicadores por CT</div>
        <div className="db-chart-sub">Ordenado de mayor a menor por Rutas · clic en fila para filtrar</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
          {[ctData.slice(0, mid), ctData.slice(mid)].map((half, hi) => (
            <div key={hi} style={{ overflowX: "auto" }}>
              <table className="db-ct-table">
                <thead>
                  <tr style={{ background: "#F5F6FA" }}>
                    <th className="db-ct-th" style={{ textAlign: "left" }}>CT</th>
                    <th className="db-ct-th" style={{ textAlign: "right" }}>Rutas</th>
                    <th className="db-ct-th" style={{ textAlign: "right", color: "#D64294" }}>Móviles</th>
                    <th className="db-ct-th" style={{ textAlign: "right" }}>FR</th>
                  </tr>
                </thead>
                <tbody>
                  {half.map((d) => {
                    const selected = selectedCTs.size === 0 || selectedCTs.has(d.ct);
                    return (
                      <tr key={d.ct} style={{ opacity: selected ? 1 : 0.35, cursor: "pointer" }}
                        onClick={() => handleToggleCT(d.ct)}
                        onMouseOver={(e) => e.currentTarget.style.background = "#FBF0F7"}
                        onMouseOut={(e) => e.currentTarget.style.background = ""}>
                        <td style={{ padding: "7px 10px", borderBottom: ".5px solid #EEF1F8", fontWeight: 600, color: "#0B1C49", fontSize: 11 }}>{d.ct || "—"}</td>
                        <td style={{ padding: "7px 10px", borderBottom: ".5px solid #EEF1F8" }}>{miniBar(d.rutas || 0, maxR, "#0B1C49")}</td>
                        <td style={{ padding: "7px 10px", borderBottom: ".5px solid #EEF1F8" }}>{miniBar(d.moviles || 0, maxM, "#D64294")}</td>
                        <td style={{ padding: "7px 10px", borderBottom: ".5px solid #EEF1F8", textAlign: "right" }}>{frBadge(d.fill_rate)}</td>
                      </tr>
                    );
                  })}
                  {hi === 1 && (() => {
                    const totR = ctData.reduce((s, d) => s + (d.rutas || 0), 0);
                    const totM = ctData.reduce((s, d) => s + (d.moviles || 0), 0);
                    const totT = ctData.reduce((s, d) => s + (d.terminados || 0), 0);
                    const totP = ctData.reduce((s, d) => s + (d.pendientes || 0), 0);
                    const totFR = totT + totP > 0 ? parseFloat((totT / (totT + totP) * 100).toFixed(1)) : null;
                    return (
                      <tr key="total" style={{ background: "#F5F6FA" }}>
                        <td style={{ padding: "7px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "#8A94A8" }}>Total / Prom.</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#0B1C49" }}>{fN(totR)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#D64294" }}>{fN(totM)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{frBadge(totFR)}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      {/* Motivos + Alertas */}
      <div className="db-grid-2" style={{ marginBottom: 16 }}>
        <div className="db-chart-panel">
          <div className="db-chart-title">Motivos de no entrega</div>
          <div className="db-chart-sub">Estado Pendiente · conteo de ocurrencias</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10, fontSize: 11 }}>
            {motivos.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "#3A3F52", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.motivo}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#0B1C49", marginLeft: "auto", whiteSpace: "nowrap" }}>{Number(d.cantidad).toLocaleString("es-CL")} <span style={{ color: "#8A94A8", fontWeight: 400 }}>({d.pct}%)</span></span>
              </div>
            ))}
          </div>
          <div style={{ position: "relative", height: 220 }}><canvas ref={motivosCanvasRef} /></div>
        </div>
        <div className="db-chart-panel">
          <div className="db-chart-title">CTs en alerta</div>
          <div className="db-chart-sub">3 CTs con menor Fill Rate en el período · vs período anterior</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            {alertas.map((d, i) => {
              const fr = d.fill_rate != null ? d.fill_rate.toFixed(1) + "%" : "—";
              const frp = d.fill_rate_prev;
              const diff = frp != null ? d.fill_rate - frp : null;
              const frColor = d.fill_rate >= 96 ? "#1B8A5A" : d.fill_rate >= 93 ? "#B8860B" : "#C0392B";
              const rank = ["1°", "2°", "3°"][i] || "";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#F5F6FA", borderRadius: 8, borderLeft: `3px solid ${frColor}` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8A94A8", minWidth: 18 }}>{rank}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0B1C49", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.ct || "—"}</div>
                    <div style={{ fontSize: 9, color: "#8A94A8", marginTop: 1 }}>{(d.pendientes || 0).toLocaleString("es-CL")} pendientes</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: frColor }}>{fr}</div>
                    {diff != null && <span style={{ fontSize: 9, fontWeight: 700, color: diff >= 0 ? "#1B8A5A" : "#C0392B" }}>{diff >= 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}pp vs anterior</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Períodos */}
      {periodos && (
        <div className="db-chart-panel" style={{ marginBottom: 16 }}>
          <div className="db-chart-title">Análisis de períodos</div>
          <div className="db-chart-sub">YTD · MTD · Semana actual — comparación automática</div>
          <div className="db-periodos">
            {["ytd", "mtd", "sem"].map((key) => {
              const d = periodos[key]; if (!d) return null;
              const p = d.prev || {};
              const COLORS = { ytd: "#0B1C49", mtd: "#D64294", sem: "#1D9E75" };
              const color = COLORS[key];
              const metric = (label, val, prevVal, isRate = false) => {
                const diff = val != null && prevVal != null ? val - prevVal : null;
                const pct = !isRate && prevVal > 0 && diff != null ? ((diff / prevVal) * 100).toFixed(0) : null;
                const dColor = diff == null ? "#8A94A8" : diff > 0 ? "#1B8A5A" : diff < 0 ? "#C0392B" : "#8A94A8";
                const arrow = diff == null ? "" : diff > 0 ? "▲" : diff < 0 ? "▼" : "=";
                const dVal = diff == null ? "—" : isRate ? `${arrow} ${diff > 0 ? "+" : ""}${diff.toFixed(1)}pp` : `${arrow} ${diff > 0 ? "+" : ""}${Number(diff).toLocaleString("es-CL")}${pct ? ` (${diff > 0 ? "+" : ""}${pct}%)` : ""}`;
                const frColor2 = isRate && val != null ? (val >= 96 ? "#1B8A5A" : val >= 93 ? "#B8860B" : "#C0392B") : "#0B1C49";
                const displayVal = val == null ? "—" : isRate ? val.toFixed(1) + "%" : Number(val).toLocaleString("es-CL");
                return <div key={label} style={{ textAlign: "center", background: "#fff", borderRadius: 6, padding: "6px 4px" }}>
                  <div style={{ fontSize: 8, color: "#8A94A8", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: frColor2 }}>{displayVal}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: dColor }}>{dVal}</div>
                </div>;
              };
              return (
                <div key={key} style={{ background: "#F5F6FA", borderRadius: 10, padding: 12, borderLeft: `3px solid ${color}` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", color, marginBottom: 8 }}>{d.label || key.toUpperCase()}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                    {metric("Rutas", d.rutas, p.rutas)}
                    {metric("Móviles", d.moviles, p.moviles)}
                    {metric("Fill Rate", d.fill_rate, p.fill_rate, true)}
                  </div>
                  <div style={{ fontSize: 8, color: "#8A94A8", marginTop: 6 }}>vs {d.prev_label || "período anterior"}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Comparación semanal */}
      {compSemanal && compSemanal.data?.length > 0 && (
        <div className="db-chart-panel" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#D64294" }} />
            <div><div className="db-chart-title">Comparación semanal por CT</div><div className="db-chart-sub">Últimas 2 semanas en el rango seleccionado</div></div>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {[compSemanal.sem_anterior, compSemanal.sem_actual].map((s, i) => (
                <span key={i} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "#FBF0F7", color: "#A02D6E", fontWeight: 700 }}>{s || "—"}</span>
              ))}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#F5F6FA" }}>
                  <th style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#8A94A8", borderBottom: "1.5px solid #D0D5E8", textAlign: "left" }}>CT</th>
                  <th style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#8A94A8", borderBottom: "1.5px solid #D0D5E8", textAlign: "right" }}>{compSemanal.sem_anterior || "S—"} Rutas</th>
                  <th style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#8A94A8", borderBottom: "1.5px solid #D0D5E8", textAlign: "right" }}>{compSemanal.sem_actual || "S—"} Rutas</th>
                  <th style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#8A94A8", borderBottom: "1.5px solid #D0D5E8", textAlign: "right" }}>Δ Rutas</th>
                  <th style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#8A94A8", borderBottom: "1.5px solid #D0D5E8", textAlign: "right" }}>{compSemanal.sem_anterior || "S—"} FR</th>
                  <th style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#8A94A8", borderBottom: "1.5px solid #D0D5E8", textAlign: "right" }}>{compSemanal.sem_actual || "S—"} FR</th>
                  <th style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#8A94A8", borderBottom: "1.5px solid #D0D5E8", textAlign: "right" }}>Δ FR</th>
                </tr>
              </thead>
              <tbody>
                {compSemanal.data.map((r) => {
                  const delt = (a, b, isR = false) => { if (a == null || b == null) return "—"; const d = a - b; const color = d > 0 ? "#1B8A5A" : d < 0 ? "#C0392B" : "#8A94A8"; const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "="; return <span style={{ fontSize: 9, fontWeight: 700, color }}>{arrow} {d > 0 ? "+" : ""}{isR ? d.toFixed(1) + "pp" : Number(d).toLocaleString("es-CL")}</span>; };
                  return (
                    <tr key={r.ct} onMouseOver={(e) => e.currentTarget.style.background = "#FBF0F7"} onMouseOut={(e) => e.currentTarget.style.background = ""}>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: "#0B1C49" }}>{r.ct}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#8A94A8" }}>{r.s_ant_r == null ? "—" : Number(r.s_ant_r).toLocaleString("es-CL")}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "#0B1C49" }}>{r.s_act_r == null ? "—" : Number(r.s_act_r).toLocaleString("es-CL")}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{delt(r.s_act_r, r.s_ant_r)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{frBadgeSmall(r.s_ant_fr)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{frBadgeSmall(r.s_act_fr)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{delt(r.s_act_fr, r.s_ant_fr, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Heatmap */}
      {heatmap && heatmap.data?.length > 0 && (
        <div className="db-chart-panel">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#D64294" }} />
            <div>
              <div className="db-chart-title">Heatmap Fill Rate por CT y día</div>
              <div className="db-chart-sub">
                {heatmap.modo === "comparacion"
                  ? `Modo comparación · ${heatmap.sem_label} vs ${heatmap.sem_ant_label}`
                  : "Modo tendencia · promedio por día del período completo"}
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", fontSize: 9, color: "#8A94A8" }}>
              {[["#E6F9F0", "≥96%"], ["#FFF8E1", "93–95.9%"], ["#FDEAEA", "<93%"]].map(([bg, lbl]) => (
                <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: bg, display: "inline-block" }} />{lbl}
                </span>
              ))}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="db-heatmap-table">
              <thead>
                <tr style={{ background: "#F5F6FA" }}>
                  <th className="db-heatmap-th left">CT</th>
                  {["Lun","Mar","Mié","Jue","Vie","Sáb"].map((d) => <th key={d} className="db-heatmap-th">{d}</th>)}
                  <th className="db-heatmap-th">Prom</th>
                  <th className="db-heatmap-th">{heatmap.modo === "comparacion" ? `vs ${heatmap.sem_ant_label}` : "vs Ant."}</th>
                  <th className="db-heatmap-th">Δ</th>
                </tr>
              </thead>
              <tbody>
                {heatmap.data.map((r) => {
                  const diff = r.prom != null && r.prom_ant != null ? +(r.prom - r.prom_ant).toFixed(1) : null;
                  return (
                    <tr key={r.ct} onMouseOver={(e) => e.currentTarget.style.background = "#FBF0F7"} onMouseOut={(e) => e.currentTarget.style.background = ""}>
                      <td style={{ padding: "6px 10px", fontWeight: 700, color: "#0B1C49", fontSize: 10 }}>{r.ct || "—"}</td>
                      {DIAS.map((d) => <td key={d} style={{ padding: "4px 6px", textAlign: "center" }}>{hmCell(r[d] ?? null, r[d + "_ant"] ?? null, heatmap.modo)}</td>)}
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>{frBadgeSmall(r.prom)}</td>
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>{frBadgeSmall(r.prom_ant)}</td>
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>
                        {diff != null ? <span style={{ fontSize: 9, fontWeight: 700, color: diff >= 0 ? "#1B8A5A" : "#C0392B" }}>{diff >= 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}pp</span> : <span style={{ color: "#8A94A8", fontSize: 9 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
