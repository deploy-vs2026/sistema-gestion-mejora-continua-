import { useState, useEffect, useRef, useCallback } from "react";
import { Chart } from "chart.js/auto";

const API = "https://dataflow-api-519623119758.us-central1.run.app";
const LEVELS = ["year", "month", "week", "day"];
const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const pad = (n) => String(n).padStart(2, "0");

const TRANSP_COLORS = {
  Valdishopper: "#D64294",
  Titask: "#2EBD8E",
  Boosmap: "#6B007B",
  Foxer: "#F47920",
  GPS: "#1B8A5A",
  Zubale: "#118DFF",
  Uber: "#06C167",
  "Sin clasificar": "#D0D5E8",
};

const PPU_COLORS = {
  DRVS: "#D64294", LTVS: "#911D5D", HDVS: "#630A3B",
  DRTH: "#2EBD8E", LTTH: "#1B7356",
  DRBM: "#6B007B", LTBM: "#42004C",
  DRFX: "#F47920", LTFX: "#A84C0B",
  LTGP: "#1B8A5A", DRGP: "#0F5235",
  DRZB: "#118DFF", LTZB: "#0A5499",
  Uber: "#06C167",
};

const START_DATE_POR_LOCAL = {
  "54": "2026-03-31", "88": "2025-07-17", "121": "2025-08-11",
  "518": "2025-10-01", "94": "2026-03-31", "98": "2026-03-30",
  "99": "2026-03-31", "120": "2026-03-31",
};

function qs(p = {}) {
  const e = Object.entries(p).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return e ? "?" + e : "";
}

export default function PanelSecundarias() {
  const today = new Date();
  const [local, setLocal] = useState("41");
  const [fi, setFi] = useState(`${today.getFullYear()}-01-01`);
  const [ff, setFf] = useState(today.toISOString().slice(0, 10));
  const [level, setLevel] = useState("week");
  const [selYear, setSelYear] = useState(null);
  const [selMonth, setSelMonth] = useState(null);
  const [selWeek, setSelWeek] = useState(null);
  const [semanal, setSemanal] = useState([]);
  const [diario, setDiario] = useState([]);
  const origFiRef = useRef(fi);
  const origFfRef = useRef(ff);
  const levelMetaRef = useRef([]);

  const chartRefs = useRef({ prestadores: null, pedidos: null, ppu: null, ontime: null });
  const canvasRefs = {
    prestadores: useRef(null),
    pedidos: useRef(null),
    ppu: useRef(null),
    ontime: useRef(null),
  };

  const destroyChart = (key) => {
    if (chartRefs.current[key]) { chartRefs.current[key].destroy(); chartRefs.current[key] = null; }
  };

  // ─── Build grouped data for current level ────────────────────────────────
  const buildGrouped = useCallback((semanalData, diarioData, lvl, sY, sM, sW) => {
    let filtered = lvl === "day" ? diarioData : semanalData;
    if (lvl === "day" && sW) filtered = filtered.filter((d) => d.semana === sW);
    if (lvl === "day" && sY) filtered = filtered.filter((d) => String(d.anio) === String(sY));
    if (lvl === "week" && sY) filtered = filtered.filter((d) => String(d.anio) === String(sY));
    if (lvl === "week" && sM) filtered = filtered.filter((d) => new Date(d.semana_inicio + "T12:00:00").getMonth() + 1 === sM);
    if (lvl === "month" && sY) filtered = filtered.filter((d) => String(d.anio) === String(sY));

    let timeKeys = [], getRowTime, buildLabel, buildMeta;

    if (lvl === "day") {
      timeKeys = [...new Set(filtered.map((d) => d.dia))].sort();
      getRowTime = (d) => d.dia;
      buildLabel = (s) => { const d = new Date(s + "T12:00:00"); return `${d.getDate()} ${MESES[d.getMonth() + 1]}`; };
      buildMeta = (s) => ({ dia: s });
    } else if (lvl === "week") {
      timeKeys = [...new Set(filtered.map((d) => d.semana_inicio))].sort();
      getRowTime = (d) => d.semana_inicio;
      buildLabel = (s) => `S${filtered.find((x) => x.semana_inicio === s)?.semana}`;
      buildMeta = (s) => { const row = filtered.find((x) => x.semana_inicio === s); const dt = new Date(s + "T12:00:00"); return { semana_inicio: s, anio: row?.anio, semana: row?.semana, month: dt.getMonth() + 1 }; };
    } else if (lvl === "month") {
      timeKeys = [...new Set(filtered.map((d) => `${new Date(d.semana_inicio + "T12:00:00").getFullYear()}-${pad(new Date(d.semana_inicio + "T12:00:00").getMonth() + 1)}`))].sort();
      getRowTime = (d) => `${new Date(d.semana_inicio + "T12:00:00").getFullYear()}-${pad(new Date(d.semana_inicio + "T12:00:00").getMonth() + 1)}`;
      buildLabel = (k) => { const [y, m] = k.split("-"); return `${MESES[parseInt(m)]} ${y}`; };
      buildMeta = (k) => { const [y, m] = k.split("-"); return { anio: parseInt(y), month: parseInt(m) }; };
    } else {
      timeKeys = [...new Set(filtered.map((d) => String(d.anio)))].sort();
      getRowTime = (d) => String(d.anio);
      buildLabel = (y) => y;
      buildMeta = (y) => ({ anio: parseInt(y) });
    }

    const labels = timeKeys.map(buildLabel);
    levelMetaRef.current = timeKeys.map(buildMeta);

    const allTransps = [...new Set(filtered.map((d) => d.transportadora))].sort();
    const orderedTransps = ["Valdishopper", ...allTransps.filter((t) => t !== "Valdishopper")];
    const allPpus = [...new Set(filtered.map((d) => d.ppu))].sort();

    const groupedData = {};
    orderedTransps.forEach((t) => {
      groupedData[t] = timeKeys.map((tk) => {
        const rows = filtered.filter((d) => getRowTime(d) === tk && d.transportadora === t);
        if (!rows.length) return { prestadores: 0, pedidos: 0, ontime: null };
        const totPed = rows.reduce((a, r) => a + r.pedidos, 0);
        let totPres = 0;
        const ppusInRows = [...new Set(rows.map((r) => r.ppu))];
        ppusInRows.forEach((p) => { totPres += Math.max(...rows.filter((r) => r.ppu === p).map((r) => r.prestadores)); });
        let wOntime = 0, countPed = 0;
        rows.forEach((r) => { if (r.ontime_pct != null) { wOntime += r.ontime_pct * r.pedidos; countPed += r.pedidos; } });
        return { prestadores: totPres, pedidos: totPed, ontime: countPed ? +(wOntime / countPed).toFixed(1) : null };
      });
    });

    const groupedPpuData = {};
    allPpus.forEach((p) => {
      const tr = filtered.find((d) => d.ppu === p)?.transportadora;
      groupedPpuData[p] = {
        transportadora: tr,
        data: timeKeys.map((tk) => {
          const rows = filtered.filter((d) => getRowTime(d) === tk && d.ppu === p);
          return rows.length ? Math.max(...rows.map((r) => r.prestadores)) : 0;
        }),
      };
    });

    const ppuData = orderedTransps.map((t) => ({ transportadora: t, pedidos: groupedData[t].reduce((s, d) => s + (d.pedidos || 0), 0) })).filter((d) => d.pedidos > 0);
    const ppuTotal = ppuData.reduce((s, d) => s + d.pedidos, 0);
    ppuData.forEach((d) => { d.pct = ppuTotal ? +(d.pedidos * 100 / ppuTotal).toFixed(1) : 0; });

    return { labels, orderedTransps, groupedData, groupedPpuData, ppuData };
  }, []);

  // ─── Render charts ────────────────────────────────────────────────────────
  const renderCharts = useCallback((semanalData, diarioData, lvl, sY, sM, sW) => {
    const { labels, orderedTransps, groupedData, groupedPpuData, ppuData } = buildGrouped(semanalData, diarioData, lvl, sY, sM, sW);

    const onChartClick = (evt, active) => {
      if (!active.length || lvl === "day") return;
      const meta = levelMetaRef.current[active[0].index];
      if (meta) drillInto(meta, lvl, sY, sM, sW);
    };

    // Prestadores chart
    destroyChart("prestadores");
    if (canvasRefs.prestadores.current) {
      const datasets = Object.keys(groupedPpuData).map((ppu) => {
        const info = groupedPpuData[ppu];
        return { label: ppu, data: info.data, stack: info.transportadora, backgroundColor: PPU_COLORS[ppu] || TRANSP_COLORS[info.transportadora] || "#8A94A8", borderRadius: 2 };
      });
      const lp = {
        id: "sec-lbl-p",
        afterDatasetsDraw(chart) {
          const c = chart.ctx;
          const totals = {}, tops = {};
          chart.data.datasets.forEach((ds, di) => {
            if (!chart.isDatasetVisible(di)) return;
            chart.getDatasetMeta(di).data.forEach((el, j) => {
              const v = ds.data[j]; if (!v) return;
              const stack = ds.stack, key = `${j}-${stack}`;
              if (!totals[key]) totals[key] = 0;
              totals[key] += v;
              tops[key] = Math.min(tops[key] || 9999, el.y);
              if (Math.abs(el.base - el.y) > 12) {
                c.save(); c.font = "600 8px 'Montserrat',sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#ffffff";
                c.fillText(v, el.x, (el.y + el.base) / 2); c.restore();
              }
            });
          });
          Object.keys(totals).forEach((key) => {
            const [j, stack] = key.split("-");
            let x = null;
            chart.data.datasets.forEach((ds, di) => { if (ds.stack === stack && chart.isDatasetVisible(di)) x = chart.getDatasetMeta(di).data[j].x; });
            if (x !== null) {
              c.save(); c.font = "700 10px 'Montserrat',sans-serif"; c.textAlign = "center"; c.textBaseline = "bottom";
              c.fillStyle = TRANSP_COLORS[stack] || "#3A3F52"; c.fillText(totals[key], x, tops[key] - 4); c.restore();
            }
          });
        },
      };
      chartRefs.current.prestadores = new Chart(canvasRefs.prestadores.current.getContext("2d"), {
        type: "bar", data: { labels, datasets }, plugins: [lp],
        options: { responsive: true, maintainAspectRatio: false, onClick: onChartClick, interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#8A94A8", boxWidth: 10, font: { size: 10 } } }, tooltip: { backgroundColor: "#0B1C49", titleColor: "#fff", bodyColor: "#8A94A8", borderColor: "#3D5490", borderWidth: 1, callbacks: { label: (ctx) => ctx.parsed.y > 0 ? ` ${ctx.dataset.label}: ${ctx.parsed.y}` : null } } },
          scales: { x: { stacked: true, ticks: { color: "#8A94A8", font: { size: 10 }, maxRotation: 45 }, grid: { color: "rgba(211,213,232,.4)" } }, y: { stacked: true, ticks: { color: "#8A94A8", font: { size: 10 } }, grid: { color: "rgba(211,213,232,.4)" } } } },
      });
    }

    // Pedidos chart
    destroyChart("pedidos");
    if (canvasRefs.pedidos.current) {
      const datasets = orderedTransps.map((t) => ({ label: t, data: groupedData[t].map((d) => d.pedidos), borderColor: TRANSP_COLORS[t] || "#8A94A8", backgroundColor: "transparent", pointBackgroundColor: TRANSP_COLORS[t] || "#8A94A8", pointRadius: 4, borderWidth: 2, tension: 0.3, spanGaps: true }));
      const lp = {
        id: "sec-lbl-ped",
        afterDatasetsDraw(chart) {
          const c = chart.ctx;
          chart.data.datasets.forEach((ds, di) => { chart.getDatasetMeta(di).data.forEach((el, j) => { const v = ds.data[j]; if (!v) return; c.save(); c.font = "600 9px 'Montserrat',sans-serif"; c.textAlign = "center"; c.textBaseline = "bottom"; c.fillStyle = TRANSP_COLORS[ds.label] || "#3A3F52"; c.fillText(Number(v).toLocaleString("es-CL"), el.x, el.y - 8); c.restore(); }); });
        },
      };
      chartRefs.current.pedidos = new Chart(canvasRefs.pedidos.current.getContext("2d"), {
        type: "line", data: { labels, datasets }, plugins: [lp],
        options: { responsive: true, maintainAspectRatio: false, onClick: onChartClick, interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#8A94A8", boxWidth: 10, font: { size: 10 } } }, tooltip: { backgroundColor: "#0B1C49", titleColor: "#fff", bodyColor: "#8A94A8", borderColor: "#3D5490", borderWidth: 1, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString("es-CL")}` } } },
          scales: { x: { ticks: { color: "#8A94A8", font: { size: 10 }, maxRotation: 45 }, grid: { color: "rgba(211,213,232,.4)" } }, y: { ticks: { color: "#8A94A8", font: { size: 10 }, callback: (v) => Number(v).toLocaleString("es-CL") }, grid: { color: "rgba(211,213,232,.4)" } } } },
      });
    }

    // PPU (doughnut)
    destroyChart("ppu");
    if (canvasRefs.ppu.current) {
      const lp = {
        id: "sec-lbl-ppu",
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(0);
          meta.data.forEach((arc, i) => {
            const d = ppuData[i]; if (!d || d.pct < 4) return;
            const midAngle = (arc.startAngle + arc.endAngle) / 2;
            const r = (arc.innerRadius + arc.outerRadius) / 2;
            const x = arc.x + r * Math.cos(midAngle), y = arc.y + r * Math.sin(midAngle);
            ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.font = "700 10px 'Montserrat',sans-serif"; ctx.fillStyle = "#fff";
            ctx.fillText(d.pct.toFixed(1) + "%", x, y); ctx.restore();
          });
        },
      };
      chartRefs.current.ppu = new Chart(canvasRefs.ppu.current.getContext("2d"), {
        type: "doughnut",
        data: { labels: ppuData.map((d) => d.transportadora), datasets: [{ data: ppuData.map((d) => d.pedidos), backgroundColor: ppuData.map((d) => TRANSP_COLORS[d.transportadora] || "#8A94A8"), borderColor: "#fff", borderWidth: 2, hoverOffset: 8 }] },
        plugins: [lp],
        options: { responsive: true, maintainAspectRatio: false, cutout: "60%",
          plugins: { legend: { position: "right", labels: { color: "#8A94A8", boxWidth: 10, font: { size: 10 }, padding: 8, generateLabels: (chart) => ppuData.map((d, i) => ({ text: `${d.transportadora} (${d.pct}%)`, fillStyle: TRANSP_COLORS[d.transportadora] || "#8A94A8", strokeStyle: "#fff", lineWidth: 1, index: i, hidden: false })) } }, tooltip: { backgroundColor: "#0B1C49", titleColor: "#fff", bodyColor: "#8A94A8", borderColor: "#3D5490", borderWidth: 1, callbacks: { label: (ctx) => ` ${ppuData[ctx.dataIndex].transportadora}: ${Number(ctx.parsed).toLocaleString("es-CL")} pedidos (${ppuData[ctx.dataIndex].pct}%)` } } } },
      });
    }

    // OnTime chart
    destroyChart("ontime");
    if (canvasRefs.ontime.current) {
      const datasets = orderedTransps.map((t) => ({ label: t, data: groupedData[t].map((d) => d.ontime), borderColor: TRANSP_COLORS[t] || "#8A94A8", backgroundColor: "transparent", pointBackgroundColor: TRANSP_COLORS[t] || "#8A94A8", pointRadius: 4, borderWidth: 2, tension: 0.3, spanGaps: true }));
      const lp = {
        id: "sec-lbl-o",
        afterDatasetsDraw(chart) {
          const c = chart.ctx;
          chart.data.datasets.forEach((ds, di) => { chart.getDatasetMeta(di).data.forEach((el, j) => { const v = ds.data[j]; if (v == null) return; c.save(); c.font = "600 9px 'Montserrat',sans-serif"; c.textAlign = "center"; c.textBaseline = "bottom"; c.fillStyle = TRANSP_COLORS[ds.label] || "#3A3F52"; c.fillText(v.toFixed(1) + "%", el.x, el.y - 8); c.restore(); }); });
        },
      };
      chartRefs.current.ontime = new Chart(canvasRefs.ontime.current.getContext("2d"), {
        type: "line", data: { labels, datasets }, plugins: [lp],
        options: { responsive: true, maintainAspectRatio: false, onClick: onChartClick, interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#8A94A8", boxWidth: 10, font: { size: 10 } } }, tooltip: { backgroundColor: "#0B1C49", titleColor: "#fff", bodyColor: "#8A94A8", borderColor: "#3D5490", borderWidth: 1, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}%` } } },
          scales: { x: { ticks: { color: "#8A94A8", font: { size: 10 }, maxRotation: 45 }, grid: { color: "rgba(211,213,232,.4)" } }, y: { min: 70, max: 100, ticks: { color: "#8A94A8", font: { size: 10 }, callback: (v) => v + "%" }, grid: { color: "rgba(211,213,232,.4)" } } } },
      });
    }
  }, [buildGrouped]);

  // ─── Drill logic ──────────────────────────────────────────────────────────
  const drillInto = useCallback((meta, lvl, sY, sM, sW) => {
    let newFi, newFf, newSelYear = sY, newSelMonth = sM, newSelWeek = sW, newLevel = lvl;
    if (lvl === "year") { newSelYear = meta.anio; newLevel = "month"; newFi = `${meta.anio}-01-01`; newFf = `${meta.anio}-12-31`; }
    else if (lvl === "month") { newSelYear = meta.anio; newSelMonth = meta.month; newLevel = "week"; const ld = new Date(meta.anio, meta.month, 0).getDate(); newFi = `${meta.anio}-${pad(meta.month)}-01`; newFf = `${meta.anio}-${pad(meta.month)}-${pad(ld)}`; }
    else if (lvl === "week" && meta.semana_inicio) { newSelWeek = meta.semana; newLevel = "day"; const dt = new Date(meta.semana_inicio + "T12:00:00"); const en = new Date(dt); en.setDate(en.getDate() + 6); newFi = meta.semana_inicio; newFf = en.toISOString().slice(0, 10); }
    if (newFi) { setFi(newFi); setFf(newFf); }
    setLevel(newLevel); setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
  }, []);

  // ─── Re-render charts when data or level changes ──────────────────────────
  useEffect(() => {
    if (semanal.length || diario.length) {
      renderCharts(semanal, diario, level, selYear, selMonth, selWeek);
    }
    return () => { Object.keys(chartRefs.current).forEach(destroyChart); };
  }, [semanal, diario, level, selYear, selMonth, selWeek, renderCharts]);

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async (localVal, fiVal, ffVal) => {
    const params = { local: localVal, fecha_inicio: fiVal, fecha_fin: ffVal };
    try {
      const [sem, dia] = await Promise.all([
        fetch(API + "/api/secundarias/semanal" + qs(params)).then((r) => r.json()),
        fetch(API + "/api/secundarias/diario" + qs(params)).then((r) => r.json()),
      ]);
      setSemanal(sem);
      setDiario(dia);
    } catch (e) { console.error("Error secundarias:", e); }
  }, []);

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => { loadAll("41", fi, ff); }, []); // eslint-disable-line

  const handleLocalChange = (newLocal) => {
    setLocal(newLocal);
    let newFi = fi;
    if (START_DATE_POR_LOCAL[newLocal]) { newFi = START_DATE_POR_LOCAL[newLocal]; setFi(newFi); origFiRef.current = newFi; }
    loadAll(newLocal, newFi, ff);
  };

  const handleSetLevel = (newLevel) => {
    let newFi = fi, newFf = ff;
    let newSelYear = selYear, newSelMonth = selMonth, newSelWeek = selWeek;
    if (newLevel === "year") { newSelYear = null; newSelMonth = null; newSelWeek = null; }
    if (newLevel === "month") { newSelMonth = null; newSelWeek = null; }
    if (newLevel === "week") { newSelWeek = null; }
    if (newLevel === "month" && newSelYear) { newFi = `${newSelYear}-01-01`; newFf = `${newSelYear}-12-31`; }
    else if (newLevel === "week" && newSelYear && newSelMonth) { const ld = new Date(newSelYear, newSelMonth, 0).getDate(); newFi = `${newSelYear}-${pad(newSelMonth)}-01`; newFf = `${newSelYear}-${pad(newSelMonth)}-${pad(ld)}`; }
    else { newFi = origFiRef.current || fi; newFf = origFfRef.current || ff; }
    setLevel(newLevel); setFi(newFi); setFf(newFf);
    setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
  };

  const handleDrillUp = () => {
    const i = LEVELS.indexOf(level);
    if (i <= 0) return;
    const newLevel = LEVELS[i - 1];
    let newFi = fi, newFf = ff;
    let newSelYear = selYear, newSelMonth = selMonth, newSelWeek = selWeek;
    if (i - 1 === 0) { newSelYear = null; newSelMonth = null; newSelWeek = null; }
    if (i - 1 === 1) { newSelMonth = null; newSelWeek = null; }
    if (i - 1 === 2) { newSelWeek = null; }
    if (i - 1 === 2 && newSelYear && newSelMonth) { const ld = new Date(newSelYear, newSelMonth, 0).getDate(); newFi = `${newSelYear}-${pad(newSelMonth)}-01`; newFf = `${newSelYear}-${pad(newSelMonth)}-${pad(ld)}`; }
    else if (i - 1 === 1 && newSelYear) { newFi = `${newSelYear}-01-01`; newFf = `${newSelYear}-12-31`; }
    else { newFi = origFiRef.current || fi; newFf = origFfRef.current || ff; }
    setLevel(newLevel); setFi(newFi); setFf(newFf);
    setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
  };

  const handleReset = () => {
    const hoy = new Date();
    const newFi = `${hoy.getFullYear()}-01-01`, newFf = hoy.toISOString().slice(0, 10);
    setLocal("41"); setFi(newFi); setFf(newFf);
    setLevel("week"); setSelYear(null); setSelMonth(null); setSelWeek(null);
    origFiRef.current = newFi; origFfRef.current = newFf;
    loadAll("41", newFi, newFf);
  };

  const handleApply = () => { origFiRef.current = fi; origFfRef.current = ff; loadAll(local, fi, ff); };

  // Drill context
  const drillParts = [];
  if (selYear) drillParts.push(<strong key="y">{selYear}</strong>);
  if (selMonth) drillParts.push(<strong key="m">{MESES[selMonth]}</strong>);
  if (selWeek) drillParts.push(<strong key="w">S{selWeek}</strong>);
  const drillCtx = drillParts.length
    ? <span>📍 {drillParts.reduce((acc, el, i) => [...acc, ...(i > 0 ? [" › "] : []), el], [])}</span>
    : null;

  return (
    <div className="db-main">
      {/* Filter bar */}
      <div className="db-filter-bar">
        <label>Local</label>
        <select value={local} onChange={(e) => handleLocalChange(e.target.value)}>
          {["41","54","76","88","94","98","99","120","121","518"].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <label>Desde</label>
        <input type="date" value={fi} onChange={(e) => setFi(e.target.value)} />
        <label>Hasta</label>
        <input type="date" value={ff} onChange={(e) => setFf(e.target.value)} />
        <button className="db-btn-primary" onClick={handleApply}>Aplicar</button>
        <button className="db-btn-ghost" onClick={handleReset}>↩ Reiniciar</button>
        <span className="db-range-label">{fi && ff ? `${fi} → ${ff}` : ""}</span>
      </div>

      {/* Hierarchy toolbar */}
      <div className="db-chart-panel" style={{ marginBottom: "1.25rem" }}>
        <div className="db-chart-toolbar">
          {LEVELS.map((l, i) => (
            <span key={l} style={{ display: "contents" }}>
              {i > 0 && <span className="db-hier-sep">›</span>}
              <button className={`db-hier-pill${level === l ? " active" : ""}`} onClick={() => handleSetLevel(l)}>
                {l === "year" ? "Año" : l === "month" ? "Mes" : l === "week" ? "Semana" : "Día"}
              </button>
            </span>
          ))}
          <div className="db-toolbar-right">
            <button className="db-btn-up" disabled={level === "year"} onClick={handleDrillUp}>↑ Subir</button>
            <span className="db-drill-ctx">{drillCtx}</span>
          </div>
        </div>
      </div>

      {/* 2x2 Chart grid */}
      <div className="db-grid-2">
        <div className="db-chart-panel">
          <div className="db-chart-head"><div><div className="db-chart-title">Prestadores por Nivel y Transportadora</div><div className="db-chart-sub">Barras agrupadas</div></div></div>
          <div className="db-chart-wrap" style={{ height: "300px", position: "relative" }}>
            <canvas ref={canvasRefs.prestadores} />
          </div>
        </div>
        <div className="db-chart-panel">
          <div className="db-chart-head"><div><div className="db-chart-title">Pedidos por Transportadora</div><div className="db-chart-sub">Evolución temporal</div></div></div>
          <div className="db-chart-wrap" style={{ height: "300px", position: "relative" }}>
            <canvas ref={canvasRefs.pedidos} />
          </div>
        </div>
        <div className="db-chart-panel">
          <div className="db-chart-head"><div><div className="db-chart-title">Share de Pedidos por Transportadora</div><div className="db-chart-sub">Distribución del volumen total</div></div></div>
          <div className="db-chart-wrap" style={{ height: "300px", position: "relative" }}>
            <canvas ref={canvasRefs.ppu} />
          </div>
        </div>
        <div className="db-chart-panel">
          <div className="db-chart-head"><div><div className="db-chart-title">% OnTime por Transportadora</div><div className="db-chart-sub">Evolución temporal</div></div></div>
          <div className="db-chart-wrap" style={{ height: "300px", position: "relative" }}>
            <canvas ref={canvasRefs.ontime} />
          </div>
        </div>
      </div>
    </div>
  );
}
