import { useState, useEffect, useRef, useCallback } from "react";
import { Chart } from "chart.js/auto";

const API = "https://dataflow-api-519623119758.us-central1.run.app";
const HD_LEVELS = ["year", "month", "week", "day"];
const HD_MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const HD_MESES_N = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function qs(p = {}) {
  const e = Object.entries(p).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return e ? "?" + e : "";
}

export default function PanelHD() {
  const today = new Date();
  const [tipo, setTipo] = useState("");
  const [local, setLocal] = useState("");
  const [localOpts, setLocalOpts] = useState([]);
  const [fi, setFi] = useState(`${today.getFullYear()}-01-01`);
  const [ff, setFf] = useState(today.toISOString().slice(0, 10));
  const [level, setLevel] = useState("week");
  const [selYear, setSelYear] = useState(null);
  const [selMonth, setSelMonth] = useState(null);
  const [selWeek, setSelWeek] = useState(null);
  const [semanal, setSemanal] = useState([]);
  const [diario, setDiario] = useState([]);
  const baseFiRef = useRef(null);
  const baseFfRef = useRef(null);

  // KPIs
  const [kpiPedidos, setKpiPedidos] = useState("—");
  const [kpiRutas, setKpiRutas] = useState("—");
  const [kpiMoviles, setKpiMoviles] = useState("—");
  const [kpiProd, setKpiProd] = useState("—");
  const [kpiOntime, setKpiOntime] = useState("—");
  const [contextText, setContextText] = useState("");

  const chartRefs = useRef({ local: null, kpi: null, semanal: null });
  const localCanvasRef = useRef(null);
  const kpiCanvasRef = useRef(null);
  const semanalCanvasRef = useRef(null);

  const destroyChart = (key) => {
    if (chartRefs.current[key]) { chartRefs.current[key].destroy(); chartRefs.current[key] = null; }
  };

  // ─── Group data ───────────────────────────────────────────────────────────
  const groupData = useCallback((semanalData, diarioData, lvl, sY, sM, sW) => {
    const raw = semanalData.filter((d) => d.semana_inicio);
    const rawD = diarioData;

    if (lvl === "day") {
      let rows = rawD;
      if (sW) rows = rows.filter((d) => d.semana == sW);
      if (sY) rows = rows.filter((d) => d.anio == sY);
      if (sM) rows = rows.filter((d) => { const dt = new Date(d.dia + "T12:00:00"); return dt.getMonth() + 1 === sM; });
      return rows.sort((a, b) => a.dia.localeCompare(b.dia)).map((d) => {
        const dt = new Date(d.dia + "T12:00:00");
        return { label: `${dt.getDate()} ${HD_MESES[dt.getMonth() + 1]}`, rutas: d.rutas, moviles: d.moviles, productividad: d.productividad, ontime_pct: d.ontime_pct, meta: d, canDrill: false };
      });
    }
    if (lvl === "week") {
      let rows = raw;
      if (sY) rows = rows.filter((d) => d.anio == sY);
      if (sM) rows = rows.filter((d) => { const dt = new Date(d.semana_inicio + "T12:00:00"); return dt.getMonth() + 1 === sM; });
      return [...rows].sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio)).map((d) => ({ label: `S${d.semana}`, rutas: d.rutas, moviles: d.moviles, productividad: d.productividad, ontime_pct: d.ontime_pct, meta: d, canDrill: true }));
    }
    if (lvl === "month") {
      let rows = raw;
      if (sY) rows = rows.filter((d) => d.anio == sY);
      const map = {};
      rows.forEach((d) => {
        const dt = new Date(d.semana_inicio + "T12:00:00"); const m = dt.getMonth() + 1, y = dt.getFullYear(), k = `${y}-${m}`;
        if (!map[k]) map[k] = { anio: y, mes: m, rutas: 0, moviles: 0, ps: 0, pc: 0, ons: 0, onc: 0 };
        map[k].rutas += d.rutas || 0; map[k].moviles = Math.max(map[k].moviles, d.moviles || 0);
        if (d.productividad != null) { map[k].ps += d.productividad; map[k].pc++; }
        if (d.ontime_pct != null) { map[k].ons += d.ontime_pct; map[k].onc++; }
      });
      return Object.values(map).sort((a, b) => a.anio - b.anio || a.mes - b.mes).map((d) => ({ label: `${HD_MESES[d.mes]} ${d.anio}`, rutas: d.rutas, moviles: d.moviles, productividad: d.pc ? +(d.ps / d.pc).toFixed(1) : null, ontime_pct: d.onc ? +(d.ons / d.onc).toFixed(1) : null, meta: d, canDrill: true }));
    }
    const map = {};
    raw.forEach((d) => {
      const y = d.anio; if (!y) return;
      if (!map[y]) map[y] = { anio: y, rutas: 0, moviles: 0, ps: 0, pc: 0, ons: 0, onc: 0 };
      map[y].rutas += d.rutas || 0; map[y].moviles = Math.max(map[y].moviles, d.moviles || 0);
      if (d.productividad != null) { map[y].ps += d.productividad; map[y].pc++; }
      if (d.ontime_pct != null) { map[y].ons += d.ontime_pct; map[y].onc++; }
    });
    return Object.values(map).sort((a, b) => a.anio - b.anio).map((d) => ({ label: String(d.anio), rutas: d.rutas, moviles: d.moviles, productividad: d.pc ? +(d.ps / d.pc).toFixed(1) : null, ontime_pct: d.onc ? +(d.ons / d.onc).toFixed(1) : null, meta: d, canDrill: true }));
  }, []);

  // ─── Context text ─────────────────────────────────────────────────────────
  const buildContextText = useCallback((lvl, sY, sM, sW) => {
    if (lvl === "day" && sY && sM && sW) return `Año ${sY} › ${HD_MESES_N[sM]} › S${sW} — días`;
    if (lvl === "week" && sY && sM) return `Año ${sY} › ${HD_MESES_N[sM]} — semanas`;
    if (lvl === "month" && sY) return `Año ${sY} — meses`;
    if (lvl === "year") return "Visión anual";
    if (lvl === "week") return "Visión semanal";
    if (lvl === "month") return "Visión mensual";
    if (lvl === "day") return "Visión diaria";
    return "";
  }, []);

  // ─── Render local chart ───────────────────────────────────────────────────
  const renderLocalChart = useCallback((data) => {
    destroyChart("local");
    if (!localCanvasRef.current || !data?.length) return;
    const labels = data.map((d) => `L${d.local}`);
    const lpL = {
      id: "hd-lbl-l",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((el, i) => {
            const v = ds.data[i]; if (v == null) return;
            const txt = (di === 2 || di === 3) ? v.toFixed(1) + (di === 3 ? "%" : "") : Number(v).toLocaleString("es-CL");
            ctx.save(); ctx.font = "bold 9px Montserrat,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            if (di === 0) { ctx.fillStyle = "#4B9FE1"; ctx.fillText(txt, el.x, el.y - 8); }
            else if (di === 1) { ctx.fillStyle = "#0B1C49"; ctx.fillText(txt, el.x, el.y + 12); }
            else if (di === 2) { ctx.fillStyle = "#D98A00"; ctx.fillText(txt, el.x, el.y - 12); }
            else if (di === 3) { ctx.fillStyle = "#D64294"; ctx.fillText(txt, el.x, el.y - 12); }
            ctx.restore();
          });
        });
      },
    };
    chartRefs.current.local = new Chart(localCanvasRef.current.getContext("2d"), {
      plugins: [lpL],
      data: {
        labels,
        datasets: [
          { type: "bar", label: "Rutas", data: data.map((d) => d.rutas), backgroundColor: "rgba(75,159,225,.8)", borderRadius: 4, yAxisID: "y", order: 3 },
          { type: "line", label: "Móviles", data: data.map((d) => d.moviles), borderColor: "#0B1C49", backgroundColor: "transparent", pointBackgroundColor: "#0B1C49", pointRadius: 5, borderWidth: 2, tension: 0.3, yAxisID: "y", order: 1 },
          { type: "line", label: "Productividad", data: data.map((d) => d.productividad), borderColor: "#D98A00", backgroundColor: "transparent", pointBackgroundColor: "#D98A00", pointRadius: 5, borderWidth: 2.5, tension: 0.3, yAxisID: "y2", order: 2 },
          { type: "line", label: "%OnTime", data: data.map((d) => d.ontime_pct), borderColor: "#D64294", backgroundColor: "transparent", pointBackgroundColor: "#D64294", pointRadius: 5, borderWidth: 2, tension: 0.3, yAxisID: "y3", order: 0 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: "#8A94A8", boxWidth: 10, font: { size: 10 } } }, tooltip: { backgroundColor: "#0B1C49", borderColor: "#3D5490", borderWidth: 1, titleColor: "#fff", bodyColor: "#8A94A8", padding: 10, callbacks: { label: (ctx) => { const v = ctx.parsed.y; if (v == null) return null; return (ctx.dataset.label === "%OnTime" || ctx.dataset.label === "Productividad") ? ` ${ctx.dataset.label}: ${v.toFixed(1)}` : ` ${ctx.dataset.label}: ${Number(v).toLocaleString("es-CL")}`; } } } },
        scales: {
          x: { ticks: { color: "#8A94A8", font: { size: 10 } }, grid: { color: "rgba(211,213,232,.4)" } },
          y: { position: "left", ticks: { color: "#4B9FE1", font: { size: 10 }, callback: (v) => Number(v).toLocaleString("es-CL") }, grid: { color: "rgba(211,213,232,.4)" }, title: { display: true, text: "Rutas / Móviles", color: "#4B9FE1", font: { size: 9 } } },
          y2: { position: "right", ticks: { color: "#D98A00", font: { size: 10 } }, grid: { drawOnChartArea: false }, title: { display: true, text: "Productividad", color: "#D98A00", font: { size: 9 } } },
          y3: { position: "right", offset: true, min: 80, max: 100, ticks: { color: "#D64294", font: { size: 10 }, callback: (v) => v + "%" }, grid: { drawOnChartArea: false }, title: { display: true, text: "%OnTime", color: "#D64294", font: { size: 9 } } },
        },
      },
    });
  }, []);

  // ─── Render KPI chart ─────────────────────────────────────────────────────
  const renderKPIChart = useCallback((grouped, lvl, sY, sM, sW, semanalData) => {
    destroyChart("kpi");
    if (!kpiCanvasRef.current) return;
    const lpK = {
      id: "hd-lbl-k",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((el, i) => {
            const v = ds.data[i]; if (v == null) return;
            const txt = v.toFixed(1) + (di === 0 ? "%" : "");
            ctx.save(); ctx.font = "bold 9px Montserrat,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            if (di === 0) { ctx.fillStyle = "#4B9FE1"; ctx.fillText(txt, el.x, el.y - 12); }
            else { ctx.fillStyle = "#D98A00"; ctx.fillText(txt, el.x, el.y + 12); }
            ctx.restore();
          });
        });
      },
    };
    chartRefs.current.kpi = new Chart(kpiCanvasRef.current.getContext("2d"), {
      plugins: [lpK],
      data: {
        labels: grouped.map((d) => d.label),
        datasets: [
          { type: "line", label: "%OnTime", data: grouped.map((d) => d.ontime_pct), borderColor: "#4B9FE1", backgroundColor: "transparent", pointBackgroundColor: "#4B9FE1", pointRadius: 4, borderWidth: 2.5, tension: 0.3, yAxisID: "y", spanGaps: true },
          { type: "line", label: "Productividad", data: grouped.map((d) => d.productividad), borderColor: "#D98A00", backgroundColor: "transparent", pointBackgroundColor: "#D98A00", pointRadius: 4, borderWidth: 2.5, tension: 0.3, yAxisID: "y2", spanGaps: true },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        onClick: lvl !== "day" ? (evt, els) => { if (els.length) handleDrillInto(grouped[els[0].index].meta, lvl, sY, sM, sW, semanalData); } : null,
        plugins: { legend: { position: "bottom", align: "center", labels: { color: "#8A94A8", boxWidth: 12, padding: 16, font: { size: 11, family: "'Montserrat', sans-serif" } } }, tooltip: { backgroundColor: "#0B1C49", borderColor: "#3D5490", borderWidth: 1, titleColor: "#fff", bodyColor: "#8A94A8", padding: 10, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}${ctx.dataset.label === "%OnTime" ? "%" : ""}` } } },
        scales: { x: { ticks: { color: "#8A94A8", font: { size: 10 }, maxRotation: 45 }, grid: { color: "rgba(211,213,232,.4)" } }, y: { position: "left", suggestedMin: 80, max: 100, ticks: { color: "#4B9FE1", font: { size: 10 }, callback: (v) => v + "%" }, grid: { color: "rgba(211,213,232,.4)" }, title: { display: true, text: "%OnTime", color: "#4B9FE1", font: { size: 9 } } }, y2: { position: "right", ticks: { color: "#D98A00", font: { size: 10 } }, grid: { drawOnChartArea: false }, title: { display: true, text: "Productividad", color: "#D98A00", font: { size: 9 } } } },
      },
    });
  }, []);

  // ─── Render semanal chart ─────────────────────────────────────────────────
  const renderSemanalChart = useCallback((grouped, lvl, sY, sM, sW, semanalData) => {
    destroyChart("semanal");
    if (!semanalCanvasRef.current) return;
    const canDrill = lvl !== "day";
    const skipOdd = lvl === "day" && grouped.length > 14;
    const lpS = {
      id: "hd-lbl-s",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((el, i) => {
            if (skipOdd && i % 2 !== 0) return;
            const v = ds.data[i]; if (v == null) return;
            const txt = di === 2 ? v.toFixed(1) : Number(v).toLocaleString("es-CL");
            ctx.save(); ctx.font = "bold 9px Montserrat,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            if (di === 0) { ctx.fillStyle = "#4B9FE1"; ctx.fillText(txt, el.x, el.y - 7); }
            else if (di === 1) { ctx.fillStyle = "#0B1C49"; ctx.fillText(txt, el.x, el.y + 12); }
            else if (di === 2) { ctx.fillStyle = "#D98A00"; ctx.fillText(txt, el.x, el.y - 12); }
            ctx.restore();
          });
        });
      },
    };
    chartRefs.current.semanal = new Chart(semanalCanvasRef.current.getContext("2d"), {
      plugins: [lpS],
      data: {
        labels: grouped.map((d) => d.label),
        datasets: [
          { type: "bar", label: "Rutas", data: grouped.map((d) => d.rutas), backgroundColor: "rgba(75,159,225,.8)", hoverBackgroundColor: "#4B9FE1", borderRadius: 4, yAxisID: "y", order: 3 },
          { type: "line", label: "Móviles", data: grouped.map((d) => d.moviles), borderColor: "#0B1C49", backgroundColor: "transparent", pointBackgroundColor: "#0B1C49", pointHoverBackgroundColor: "#fff", pointRadius: 4, borderWidth: 2, tension: 0.3, yAxisID: "y2", order: 1 },
          { type: "line", label: "Productividad", data: grouped.map((d) => d.productividad), borderColor: "#D98A00", backgroundColor: "transparent", pointBackgroundColor: "#D98A00", pointHoverBackgroundColor: "#fff", pointRadius: 4, borderWidth: 2.5, tension: 0.3, yAxisID: "y3", order: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400, easing: "easeOutQuart" }, interaction: { mode: "index", intersect: false },
        onClick: canDrill ? (evt, els) => { if (els.length) handleDrillInto(grouped[els[0].index].meta, lvl, sY, sM, sW, semanalData); } : null,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: "#0B1C49", borderColor: "#3D5490", borderWidth: 1, titleColor: "#fff", bodyColor: "#8A94A8", padding: 12, callbacks: { label: (ctx) => { const v = ctx.parsed.y; if (v == null) return null; return ctx.dataset.label === "Productividad" ? ` Productividad: ${v.toFixed(1)}` : ` ${ctx.dataset.label}: ${Number(v).toLocaleString("es-CL")}`; }, afterBody: canDrill ? () => ["", "  → Clic para ver detalle"] : null } } },
        scales: {
          x: { ticks: { color: "#8A94A8", font: { size: 11 } }, grid: { color: "rgba(211,213,232,.5)" } },
          y: { position: "left", ticks: { color: "#4B9FE1", font: { size: 10 }, callback: (v) => Number(v).toLocaleString("es-CL") }, grid: { color: "rgba(211,213,232,.4)" }, title: { display: true, text: "Rutas", color: "#4B9FE1", font: { size: 10 } } },
          y2: { position: "right", ticks: { color: "#0B1C49", font: { size: 10 }, callback: (v) => Number(v).toLocaleString("es-CL") }, grid: { drawOnChartArea: false }, title: { display: true, text: "Móviles", color: "#0B1C49", font: { size: 10 } } },
          y3: { position: "right", offset: true, ticks: { color: "#D98A00", font: { size: 10 } }, grid: { drawOnChartArea: false }, title: { display: true, text: "Productividad", color: "#D98A00", font: { size: 10 } } },
        },
      },
    });
    if (semanalCanvasRef.current) semanalCanvasRef.current.style.cursor = canDrill ? "pointer" : "default";
  }, []);

  // ─── Fetch local chart data ────────────────────────────────────────────────
  const fetchLocalData = useCallback(async (params) => {
    try {
      const data = await fetch(`${API}/api/hd/por-local` + qs(params)).then((r) => r.json());
      renderLocalChart(data);
    } catch (e) { console.error("Error local:", e); }
  }, [renderLocalChart]);

  // ─── Load all ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async (tipoVal, localVal, fiVal, ffVal, lvl, sY, sM, sW) => {
    const p = { tipo_servicio: tipoVal || null, local: localVal || null, fecha_inicio: fiVal || null, fecha_fin: ffVal || null };
    try {
      const [kpis, sem, dia, locales] = await Promise.all([
        fetch(`${API}/api/hd/kpis` + qs(p)).then((r) => r.json()),
        fetch(`${API}/api/hd/semanal` + qs(p)).then((r) => r.json()),
        fetch(`${API}/api/hd/diario` + qs(p)).then((r) => r.json()),
        fetch(`${API}/api/hd/locales` + qs({ tipo_servicio: tipoVal || null, fecha_inicio: fiVal || null, fecha_fin: ffVal || null })).then((r) => r.json()),
      ]);
      setSemanal(sem);
      setDiario(dia);
      setLocalOpts(locales.locales || []);

      const fmtN = (n) => n == null ? "—" : Number(n).toLocaleString("es-CL");
      setKpiPedidos(fmtN(kpis.pedidos));
      setKpiRutas(fmtN(kpis.rutas));
      setKpiMoviles(fmtN(kpis.moviles));
      setKpiProd(kpis.productividad != null ? kpis.productividad.toFixed(1) : "—");
      setKpiOntime(kpis.ontime_pct != null ? kpis.ontime_pct.toFixed(1) + "%" : "—");

      await fetchLocalData(p);

      const grouped = groupData(sem, dia, lvl, sY, sM, sW);
      renderKPIChart(grouped, lvl, sY, sM, sW, sem);
      renderSemanalChart(grouped, lvl, sY, sM, sW, sem);
      setContextText(buildContextText(lvl, sY, sM, sW));
    } catch (e) { console.error("Error HD:", e); }
  }, [fetchLocalData, groupData, renderKPIChart, renderSemanalChart, buildContextText]);

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAll("", "", fi, ff, "week", null, null, null);
    return () => { Object.keys(chartRefs.current).forEach((k) => destroyChart(k)); };
  }, []); // eslint-disable-line

  // Re-render charts when data changes
  useEffect(() => {
    if (!semanal.length && !diario.length) return;
    const grouped = groupData(semanal, diario, level, selYear, selMonth, selWeek);
    renderKPIChart(grouped, level, selYear, selMonth, selWeek, semanal);
    renderSemanalChart(grouped, level, selYear, selMonth, selWeek, semanal);
  }, [semanal, diario, level, selYear, selMonth, selWeek, groupData, renderKPIChart, renderSemanalChart]);

  // ─── Drill handlers ───────────────────────────────────────────────────────
  const handleDrillInto = useCallback(async (meta, lvl, sY, sM, sW, semanalData) => {
    if (!baseFiRef.current) { baseFiRef.current = fi; baseFfRef.current = ff; }
    let newFi = baseFiRef.current, newFf = baseFfRef.current;
    let newLevel = lvl, newSelYear = sY, newSelMonth = sM, newSelWeek = sW;

    if (lvl === "year") { newSelYear = meta.anio; newLevel = "month"; }
    else if (lvl === "month") { newSelMonth = meta.mes; newLevel = "week"; }
    else if (lvl === "week") { newSelWeek = meta.semana; newLevel = "day"; }

    if (newSelWeek && semanalData.length) {
      const sem = semanalData.find((d) => d.semana == newSelWeek);
      if (sem) { newFi = sem.semana_inicio; const fin = new Date(sem.semana_inicio + "T12:00:00"); fin.setDate(fin.getDate() + 6); newFf = fin.toISOString().slice(0, 10); }
    } else if (newSelMonth && newSelYear) {
      newFi = `${newSelYear}-${String(newSelMonth).padStart(2, "0")}-01`;
      const last = new Date(newSelYear, newSelMonth, 0).getDate();
      newFf = `${newSelYear}-${String(newSelMonth).padStart(2, "0")}-${last}`;
    } else if (newSelYear) {
      newFi = `${newSelYear}-01-01`; newFf = `${newSelYear}-12-31`;
    }

    setFi(newFi); setFf(newFf);
    setLevel(newLevel); setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
    setContextText(buildContextText(newLevel, newSelYear, newSelMonth, newSelWeek));
    await fetchLocalData({ tipo_servicio: tipo || null, local: local || null, fecha_inicio: newFi, fecha_fin: newFf });
  }, [fi, ff, tipo, local, fetchLocalData, buildContextText]);

  const handleSetLevel = async (newLevel) => {
    const ni = HD_LEVELS.indexOf(newLevel), ci = HD_LEVELS.indexOf(level);
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
    setContextText(buildContextText(newLevel, newSelYear, newSelMonth, newSelWeek));
    await fetchLocalData({ tipo_servicio: tipo || null, local: local || null, fecha_inicio: newFi, fecha_fin: newFf });
  };

  const handleDrillUp = async () => {
    const i = HD_LEVELS.indexOf(level); if (i <= 0) return;
    const newLevel = HD_LEVELS[i - 1];
    let newFi = fi, newFf = ff;
    let newSelYear = selYear, newSelMonth = selMonth, newSelWeek = selWeek;
    if (i - 1 === 0) { newSelYear = null; newSelMonth = null; newSelWeek = null; }
    if (i - 1 === 1) { newSelMonth = null; newSelWeek = null; }
    if (i - 1 === 2) { newSelWeek = null; }
    if (newLevel === "year" || (!newSelYear && !newSelMonth && !newSelWeek)) {
      if (baseFiRef.current) { newFi = baseFiRef.current; newFf = baseFfRef.current; baseFiRef.current = null; baseFfRef.current = null; }
    } else {
      if (newSelMonth && newSelYear) { newFi = `${newSelYear}-${String(newSelMonth).padStart(2, "0")}-01`; const last = new Date(newSelYear, newSelMonth, 0).getDate(); newFf = `${newSelYear}-${String(newSelMonth).padStart(2, "0")}-${last}`; }
      else if (newSelYear) { newFi = `${newSelYear}-01-01`; newFf = `${newSelYear}-12-31`; }
    }
    setFi(newFi); setFf(newFf);
    setLevel(newLevel); setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
    setContextText(buildContextText(newLevel, newSelYear, newSelMonth, newSelWeek));
    await fetchLocalData({ tipo_servicio: tipo || null, local: local || null, fecha_inicio: newFi, fecha_fin: newFf });
  };

  const handleReset = () => {
    const hoy = new Date();
    const newFi = `${hoy.getFullYear()}-01-01`, newFf = hoy.toISOString().slice(0, 10);
    setTipo(""); setLocal(""); setFi(newFi); setFf(newFf);
    setLevel("week"); setSelYear(null); setSelMonth(null); setSelWeek(null);
    baseFiRef.current = null; baseFfRef.current = null;
    loadAll("", "", newFi, newFf, "week", null, null, null);
  };

  const levelTitle = { year: "por Año", month: "por Mes", week: "por Semana", day: "por Día" }[level] || "";

  return (
    <div className="db-main">
      {/* Filter bar */}
      <div className="db-filter-bar">
        <label>Tipo Servicio</label>
        <select value={tipo} onChange={(e) => { setTipo(e.target.value); setLocal(""); loadAll(e.target.value, "", fi, ff, level, selYear, selMonth, selWeek); }}>
          <option value="">Ambos</option>
          <option value="Estival">Estival</option>
          <option value="Modelo Mixto">Modelo Mixto</option>
        </select>
        <label>Local</label>
        <select value={local} onChange={(e) => { setLocal(e.target.value); loadAll(tipo, e.target.value, fi, ff, level, selYear, selMonth, selWeek); }}>
          <option value="">Todos</option>
          {localOpts.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <label>Desde</label>
        <input type="date" value={fi} onChange={(e) => { setFi(e.target.value); loadAll(tipo, local, e.target.value, ff, level, selYear, selMonth, selWeek); }} />
        <label>Hasta</label>
        <input type="date" value={ff} onChange={(e) => { setFf(e.target.value); loadAll(tipo, local, fi, e.target.value, level, selYear, selMonth, selWeek); }} />
        <button className="db-btn-ghost" onClick={handleReset}>↩ Reiniciar</button>
        <span className="db-range-label">{fi && ff ? `${fi} → ${ff}` : ""}</span>
      </div>

      {/* Context bar */}
      <div className="db-context-bar">{contextText}</div>

      {/* KPI cards */}
      <div className="db-kpis-5">
        <div className="db-kpi"><div className="db-kpi-label">Pedidos</div><div className="db-kpi-val pink">{kpiPedidos}</div></div>
        <div className="db-kpi"><div className="db-kpi-label">Rutas</div><div className="db-kpi-val navy">{kpiRutas}</div></div>
        <div className="db-kpi"><div className="db-kpi-label">Móviles</div><div className="db-kpi-val" style={{ color: "#7C3AED" }}>{kpiMoviles}</div></div>
        <div className="db-kpi"><div className="db-kpi-label">Productividad</div><div className="db-kpi-val warn">{kpiProd}</div><div className="db-kpi-sub">rutas/móvil/día</div></div>
        <div className="db-kpi"><div className="db-kpi-label">% OnTime</div><div className="db-kpi-val" style={{ color: "#1B8A5A" }}>{kpiOntime}</div></div>
      </div>

      {/* Charts row */}
      <div className="db-grid-2" style={{ marginBottom: "1rem" }}>
        {/* Performance por Local */}
        <div className="db-chart-panel">
          <div className="db-chart-head"><div><div className="db-chart-title">Performance por Local</div><div className="db-chart-sub">Rutas · Móviles · Productividad · %OnTime</div></div></div>
          <div style={{ position: "relative", height: "320px" }}><canvas ref={localCanvasRef} /></div>
        </div>

        {/* KPI Operaciones */}
        <div className="db-chart-panel">
          <div className="db-chart-head"><div><div className="db-chart-title">KPI Operaciones</div><div className="db-chart-sub">%OnTime · Productividad por Semana</div></div></div>
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            {HD_LEVELS.map((l, i) => (
              <span key={l} style={{ display: "contents" }}>
                {i > 0 && <span className="db-hier-sep">›</span>}
                <button className={`db-hier-pill${level === l ? " active" : ""}`} onClick={() => handleSetLevel(l)}>
                  {l === "year" ? "Año" : l === "month" ? "Mes" : l === "week" ? "Semana" : "Día"}
                </button>
              </span>
            ))}
            <button className="db-btn-up" disabled={level === "year"} onClick={handleDrillUp} style={{ marginLeft: "auto" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg> Subir
            </button>
          </div>
          <div style={{ position: "relative", height: "260px" }}><canvas ref={kpiCanvasRef} /></div>
        </div>
      </div>

      {/* Semanal full-width */}
      <div className="db-chart-panel">
        <div className="db-chart-head">
          <div>
            <div className="db-chart-title">Rutas · Móviles · Productividad {levelTitle}</div>
            <div className="db-chart-sub">Haz clic en una barra para profundizar</div>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div className="db-leg"><div className="db-leg-sq" style={{ background: "#4B9FE1" }} /> Rutas</div>
            <div className="db-leg"><div className="db-leg-line" style={{ background: "#0B1C49" }} /> Móviles</div>
            <div className="db-leg"><div className="db-leg-dot" style={{ background: "#D98A00" }} /> Productividad</div>
          </div>
        </div>
        <div style={{ position: "relative", height: "380px" }}><canvas ref={semanalCanvasRef} /></div>
      </div>
    </div>
  );
}
