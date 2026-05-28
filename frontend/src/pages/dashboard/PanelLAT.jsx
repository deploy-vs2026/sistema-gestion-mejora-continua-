import { useState, useEffect, useRef, useCallback } from "react";
import { Chart } from "chart.js/auto";

const API = "https://dataflow-api-519623119758.us-central1.run.app";
const LEVELS = ["year", "month", "week", "day"];
const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIAS_S = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("es-CL"));
const pad = (n) => String(n).padStart(2, "0");

function qs(p = {}) {
  const e = Object.entries(p)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return e ? "?" + e : "";
}

function fmtDateShort(s) {
  if (!s) return "";
  const d = new Date(s + "T12:00:00");
  return `${d.getDate()} ${MESES[d.getMonth() + 1]} ${d.getFullYear()}`;
}

export default function PanelLAT() {
  const today = new Date();
  const [fi, setFi] = useState(`${today.getFullYear()}-01-01`);
  const [ff, setFf] = useState(today.toISOString().slice(0, 10));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [localOpts, setLocalOpts] = useState([]);
  const [tipoOpts, setTipoOpts] = useState([]);
  const [rolOpts, setRolOpts] = useState([]);
  const [local, setLocal] = useState("");
  const [tipo, setTipo] = useState("");
  const [rol, setRol] = useState("");

  // State S
  const [level, setLevel] = useState("week");
  const [selYear, setSelYear] = useState(null);
  const [selMonth, setSelMonth] = useState(null);
  const [selWeek, setSelWeek] = useState(null);
  const [semanal, setSemanal] = useState([]);
  const [diario, setDiario] = useState([]);
  const [operacion, setOperacion] = useState([]);
  const [loading, setLoading] = useState(false);
  const [opLoading, setOpLoading] = useState(false);

  // KPIs
  const [kpiPed, setKpiPed] = useState("—");
  const [kpiPrest, setKpiPrest] = useState("—");
  const [kpiProd, setKpiProd] = useState("—");
  const [kpiOntime, setKpiOntime] = useState("—");
  const [kpiComp, setKpiComp] = useState("—");
  const [kpiTiempo, setKpiTiempo] = useState("—");
  const [kpiItems, setKpiItems] = useState("—");

  // Op metric toggles
  const [visOntime, setVisOntime] = useState(true);
  const [visComp, setVisComp] = useState(true);
  const [visTiempo, setVisTiempo] = useState(true);
  const [visItems, setVisItems] = useState(true);

  // Stored orig dates for drill-up
  const origFiRef = useRef(fi);
  const origFfRef = useRef(ff);

  // Chart refs
  const mainCanvasRef = useRef(null);
  const opCanvasRef = useRef(null);
  const chartMainRef = useRef(null);
  const chartOpRef = useRef(null);

  // ─── group data for main chart ───────────────────────────────────────────
  const groupData = useCallback((semanalData, diarioData, lvl, sY, sM, sW) => {
    const raw = semanalData.filter(
      (d) => d.fecha_inicio_semana && d.fecha_inicio_semana !== "null"
    );
    if (lvl === "day") {
      let rows = diarioData;
      if (sW) rows = rows.filter((d) => d.semana == sW);
      if (sY) rows = rows.filter((d) => d.anio == sY);
      if (sM)
        rows = rows.filter((d) => {
          const dt = new Date(d.dia + "T12:00:00");
          return dt.getMonth() + 1 === sM;
        });
      return rows
        .sort((a, b) => a.dia.localeCompare(b.dia))
        .map((d) => {
          const dt = new Date(d.dia + "T12:00:00");
          return {
            label: `${dt.getDate()} ${MESES[dt.getMonth() + 1]}`,
            labelFull: `${DIAS_S[dt.getDay()]} ${dt.getDate()} ${MESES[dt.getMonth() + 1]}`,
            pedidos: d.cantidad_pedidos,
            prestadores: d.prestadores,
            productividad: d.productividad,
            meta: d,
            canDrill: false,
          };
        });
    }
    if (lvl === "week") {
      let rows = raw;
      if (sY) rows = rows.filter((d) => d.anio == sY);
      if (sM)
        rows = rows.filter((d) => {
          const dt = new Date(d.fecha_inicio_semana + "T12:00:00");
          return dt.getMonth() + 1 === sM;
        });
      return [...rows]
        .sort((a, b) => a.fecha_inicio_semana.localeCompare(b.fecha_inicio_semana))
        .map((d) => ({
          label: `S${d.semana}`,
          labelFull: `Semana ${d.semana} — ${fmtDateShort(d.fecha_inicio_semana)}`,
          pedidos: d.cantidad_pedidos,
          prestadores: d.prestadores,
          productividad: d.productividad,
          meta: d,
          canDrill: true,
        }));
    }
    if (lvl === "month") {
      let rows = raw;
      if (sY) rows = rows.filter((d) => d.anio == sY);
      const map = {};
      rows.forEach((d) => {
        const dt = new Date(d.fecha_inicio_semana + "T12:00:00");
        const m = dt.getMonth() + 1, y = dt.getFullYear(), k = `${y}-${m}`;
        if (!map[k]) map[k] = { anio: y, mes: m, pedidos: 0, prestadores: 0, ps: 0, pc: 0 };
        map[k].pedidos += d.cantidad_pedidos || 0;
        map[k].prestadores = Math.max(map[k].prestadores, d.prestadores || 0);
        if (d.productividad != null) { map[k].ps += d.productividad; map[k].pc++; }
      });
      return Object.values(map)
        .sort((a, b) => a.anio - b.anio || a.mes - b.mes)
        .map((d) => ({
          label: `${MESES[d.mes]} ${d.anio}`,
          labelFull: `${MESES[d.mes]} ${d.anio}`,
          pedidos: d.pedidos,
          prestadores: d.prestadores,
          productividad: d.pc ? +(d.ps / d.pc).toFixed(1) : null,
          meta: d,
          canDrill: true,
        }));
    }
    // year
    const map = {};
    raw.forEach((d) => {
      const y = d.anio; if (!y) return;
      if (!map[y]) map[y] = { anio: y, pedidos: 0, prestadores: 0, ps: 0, pc: 0 };
      map[y].pedidos += d.cantidad_pedidos || 0;
      map[y].prestadores = Math.max(map[y].prestadores, d.prestadores || 0);
      if (d.productividad != null) { map[y].ps += d.productividad; map[y].pc++; }
    });
    return Object.values(map)
      .sort((a, b) => a.anio - b.anio)
      .map((d) => ({
        label: String(d.anio),
        labelFull: String(d.anio),
        pedidos: d.pedidos,
        prestadores: d.prestadores,
        productividad: d.pc ? +(d.ps / d.pc).toFixed(1) : null,
        meta: d,
        canDrill: true,
      }));
  }, []);

  const groupOpData = useCallback((opData, lvl, sY, sM) => {
    const raw = opData.filter((d) => d.semana_inicio && d.semana_inicio !== "null");
    if (lvl === "day") {
      return [...raw]
        .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))
        .map((d) => {
          const dt = new Date(d.semana_inicio + "T12:00:00");
          return {
            label: `${dt.getDate()} ${MESES[dt.getMonth() + 1]}`,
            labelFull: `${DIAS_S[dt.getDay()]} ${dt.getDate()} ${MESES[dt.getMonth() + 1]}`,
            ontime: d.ontime_pct,
            completitud: d.completitud_pct,
            tiempo: d.tiempo_armado_min,
            items: d.promedio_items,
          };
        });
    }
    if (lvl === "week") {
      let rows = raw;
      if (sY) rows = rows.filter((d) => d.anio == sY);
      if (sM) rows = rows.filter((d) => { const dt = new Date(d.semana_inicio + "T12:00:00"); return dt.getMonth() + 1 === sM; });
      return [...rows]
        .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))
        .map((d) => ({
          label: `S${d.semana}`,
          labelFull: `Semana ${d.semana} — ${fmtDateShort(d.semana_inicio)}`,
          ontime: d.ontime_pct,
          completitud: d.completitud_pct,
          tiempo: d.tiempo_armado_min,
          items: d.promedio_items,
        }));
    }
    if (lvl === "month") {
      let rows = raw;
      if (sY) rows = rows.filter((d) => d.anio == sY);
      const map = {};
      rows.forEach((d) => {
        const dt = new Date(d.semana_inicio + "T12:00:00");
        const m = dt.getMonth() + 1, y = dt.getFullYear(), k = `${y}-${pad(m)}`;
        if (!map[k]) map[k] = { anio: y, mes: m, oc: 0, os: 0, cc: 0, cs: 0, tc: 0, ts: 0, ic: 0, is: 0 };
        if (d.ontime_pct != null) { map[k].os += d.ontime_pct; map[k].oc++; }
        if (d.completitud_pct != null) { map[k].cs += d.completitud_pct; map[k].cc++; }
        if (d.tiempo_armado_min != null) { map[k].ts += d.tiempo_armado_min; map[k].tc++; }
        if (d.promedio_items != null) { map[k].is += d.promedio_items; map[k].ic++; }
      });
      return Object.values(map)
        .sort((a, b) => a.anio - b.anio || a.mes - b.mes)
        .map((d) => ({
          label: `${MESES[d.mes]} ${d.anio}`,
          labelFull: `${MESES[d.mes]} ${d.anio}`,
          ontime: d.oc ? +(d.os / d.oc).toFixed(1) : null,
          completitud: d.cc ? +(d.cs / d.cc).toFixed(1) : null,
          tiempo: d.tc ? +(d.ts / d.tc).toFixed(1) : null,
          items: d.ic ? +(d.is / d.ic).toFixed(0) : null,
        }));
    }
    const map = {};
    raw.forEach((d) => {
      const y = d.anio; if (!y) return;
      if (!map[y]) map[y] = { anio: y, oc: 0, os: 0, cc: 0, cs: 0, tc: 0, ts: 0, ic: 0, is: 0 };
      if (d.ontime_pct != null) { map[y].os += d.ontime_pct; map[y].oc++; }
      if (d.completitud_pct != null) { map[y].cs += d.completitud_pct; map[y].cc++; }
      if (d.tiempo_armado_min != null) { map[y].ts += d.tiempo_armado_min; map[y].tc++; }
      if (d.promedio_items != null) { map[y].is += d.promedio_items; map[y].ic++; }
    });
    return Object.values(map)
      .sort((a, b) => a.anio - b.anio)
      .map((d) => ({
        label: String(d.anio),
        labelFull: String(d.anio),
        ontime: d.oc ? +(d.os / d.oc).toFixed(1) : null,
        completitud: d.cc ? +(d.cs / d.cc).toFixed(1) : null,
        tiempo: d.tc ? +(d.ts / d.tc).toFixed(1) : null,
        items: d.ic ? +(d.is / d.ic).toFixed(0) : null,
      }));
  }, []);

  // ─── Render main chart ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mainCanvasRef.current) return;
    const grouped = groupData(semanal, diario, level, selYear, selMonth, selWeek);
    const isDayLevel = level === "day";
    const canDrill = grouped.some((d) => d.canDrill);

    if (chartMainRef.current) { chartMainRef.current.destroy(); chartMainRef.current = null; }

    const labelPlugin = {
      id: "vs-lbl",
      afterDatasetsDraw(chart) {
        const c = chart.ctx;
        chart.data.datasets.forEach((ds, di) => {
          if (!chart.isDatasetVisible(di)) return;
          const meta = chart.getDatasetMeta(di);
          meta.data.forEach((el, j) => {
            if (isDayLevel && meta.data.length > 14 && j % 2 !== 0) return;
            const v = ds.data[j]; if (v == null || v === 0) return;
            c.save(); c.textAlign = "center";
            if (di === 0) {
              c.font = "700 9px 'Montserrat',sans-serif"; c.fillStyle = "#9B1E6E";
              c.textBaseline = "bottom"; c.fillText(Number(v).toLocaleString("es-CL"), el.x, el.y - 4);
            } else if (di === 1) {
              c.font = "600 9px 'Montserrat',sans-serif"; c.fillStyle = "#0B1C49";
              c.textBaseline = "bottom"; c.fillText(Number(v).toLocaleString("es-CL"), el.x, el.y - 12);
            } else if (di === 2) {
              c.font = "600 9px 'Montserrat',sans-serif"; c.fillStyle = "#7C3AED";
              c.textBaseline = "top"; c.fillText(v.toFixed(1), el.x, el.y + 14);
            }
            c.restore();
          });
        });
      },
    };

    const ctx = mainCanvasRef.current.getContext("2d");
    chartMainRef.current = new Chart(ctx, {
      plugins: [labelPlugin],
      data: {
        labels: grouped.map((d) => d.label),
        datasets: [
          { type: "bar", label: "Pedidos", data: grouped.map((d) => d.pedidos), backgroundColor: "rgba(214,66,148,.75)", borderColor: "#D64294", hoverBackgroundColor: "#D64294", borderRadius: isDayLevel ? 4 : 5, barThickness: isDayLevel ? "flex" : undefined, yAxisID: "y", order: 3 },
          { type: "line", label: "Prestadores", data: grouped.map((d) => d.prestadores), borderColor: "#0B1C49", backgroundColor: "transparent", pointBackgroundColor: "#FFFFFF", pointBorderColor: "#0B1C49", pointBorderWidth: 2, pointRadius: 4, borderWidth: 2, tension: 0.35, yAxisID: "y2", order: 1 },
          { type: "line", label: "Productividad", data: grouped.map((d) => d.productividad), borderColor: "#7C3AED", backgroundColor: "transparent", pointBackgroundColor: "#7C3AED", pointRadius: 4, borderWidth: 2.5, tension: 0.35, yAxisID: "y3", order: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        onClick: canDrill
          ? (evt, els) => { if (els.length) drillInto(grouped[els[0].index].meta); }
          : null,
        plugins: {
          tooltip: {
            mode: "index", intersect: false, backgroundColor: "#0B1C49",
            titleColor: "#fff", bodyColor: "#8A94A8",
            callbacks: {
              title: (items) => grouped[items[0].dataIndex]?.labelFull || items[0].label,
              label: (ctx) => {
                const v = ctx.parsed.y; if (v == null) return null;
                if (ctx.dataset.label === "Productividad") return ` Productividad: ${v.toFixed(1)}`;
                if (ctx.dataset.label === "Prestadores") return ` Prestadores: ${Number(v).toLocaleString("es-CL")}`;
                return ` Pedidos: ${Number(v).toLocaleString("es-CL")}`;
              },
              afterBody: canDrill ? () => ["", "  → Clic para ver detalle"] : null,
            },
          },
          legend: { display: true, labels: { color: "#8A94A8", boxWidth: 12, font: { size: 11, family: "'Montserrat',sans-serif" } } },
        },
        scales: {
          x: { type: "category", ticks: { color: "#8A94A8", font: { size: isDayLevel ? 9 : 11 }, maxRotation: isDayLevel ? 90 : 0 }, grid: { color: "rgba(211,213,232,.5)" } },
          y: { position: "left", ticks: { color: "#D64294", font: { size: 10 }, callback: (v) => Number(v).toLocaleString("es-CL") }, grid: { color: "rgba(211,213,232,.4)" }, title: { display: true, text: "Pedidos", color: "#D64294", font: { size: 10 } } },
          y2: { position: "right", ticks: { color: "#0B1C49", font: { size: 10 }, callback: (v) => fmt(v) }, grid: { drawOnChartArea: false }, title: { display: true, text: "Prestadores", color: "#0B1C49", font: { size: 10 } } },
          y3: { position: "right", ticks: { color: "#7C3AED", font: { size: 10 } }, grid: { drawOnChartArea: false }, title: { display: true, text: "Productividad", color: "#7C3AED", font: { size: 10 } } },
        },
      },
    });
    if (mainCanvasRef.current) mainCanvasRef.current.style.cursor = canDrill ? "pointer" : "default";

    return () => { if (chartMainRef.current) { chartMainRef.current.destroy(); chartMainRef.current = null; } };
  }, [semanal, diario, level, selYear, selMonth, selWeek, groupData]);

  // ─── Render op chart ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!opCanvasRef.current) return;
    const grouped = groupOpData(operacion, level, selYear, selMonth);

    const _avg = (arr) => { const v = arr.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    setKpiOntime(_avg(grouped.map((d) => d.ontime)) != null ? _avg(grouped.map((d) => d.ontime)).toFixed(1) + "%" : "—");
    setKpiComp(_avg(grouped.map((d) => d.completitud)) != null ? _avg(grouped.map((d) => d.completitud)).toFixed(1) + "%" : "—");
    setKpiTiempo(_avg(grouped.map((d) => d.tiempo)) != null ? _avg(grouped.map((d) => d.tiempo)).toFixed(1) + " min" : "—");
    const avgItems = _avg(grouped.map((d) => d.items));
    setKpiItems(avgItems != null ? Math.round(avgItems).toLocaleString("es-CL") : "—");

    if (chartOpRef.current) { chartOpRef.current.destroy(); chartOpRef.current = null; }

    const ds = [
      { label: "% OnTime", data: grouped.map((d) => d.ontime), borderColor: "#1B8A5A", backgroundColor: "transparent", pointBackgroundColor: "#1B8A5A", pointRadius: 4, borderWidth: 2.5, tension: 0.35, yAxisID: "yLeft" },
      { label: "% Completitud", data: grouped.map((d) => d.completitud), borderColor: "#D64294", backgroundColor: "transparent", pointBackgroundColor: "#D64294", pointRadius: 4, borderWidth: 2.5, tension: 0.35, yAxisID: "yLeft" },
      { label: "Tiempo Armado (min)", data: grouped.map((d) => d.tiempo), borderColor: "#D98A00", backgroundColor: "transparent", pointBackgroundColor: "#D98A00", pointRadius: 4, borderWidth: 2, tension: 0.35, yAxisID: "yRight" },
      { label: "Promedio Items", data: grouped.map((d) => d.items), borderColor: "#3D5490", backgroundColor: "transparent", pointBackgroundColor: "#3D5490", pointRadius: 4, borderWidth: 2, tension: 0.35, yAxisID: "yRight" },
    ];

    const opLabelPlugin = {
      id: "op-lbl",
      afterDatasetsDraw(chart) {
        const c = chart.ctx;
        chart.data.datasets.forEach((ds, di) => {
          if (!chart.isDatasetVisible(di)) return;
          const meta = chart.getDatasetMeta(di);
          meta.data.forEach((el, j) => {
            const v = ds.data[j]; if (v == null) return;
            c.save(); c.font = "600 9px 'Montserrat',sans-serif";
            if (ds.label === "% OnTime") { c.fillStyle = "#1B8A5A"; c.textAlign = "center"; c.textBaseline = "bottom"; c.fillText(v.toFixed(1) + "%", el.x, el.y - 12); }
            else if (ds.label === "% Completitud") { c.fillStyle = "#D64294"; c.textAlign = "center"; c.textBaseline = "top"; c.fillText(v.toFixed(1) + "%", el.x, el.y + 12); }
            else if (ds.label === "Tiempo Armado (min)" && j % 2 === 0) { c.fillStyle = "#D98A00"; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(v.toFixed(1) + " min", el.x + 6, el.y); }
            c.restore();
          });
        });
      },
    };

    const legendMargin = {
      id: "legendMargin",
      beforeInit(chart) {
        const originalFit = chart.legend.fit;
        chart.legend.fit = function fit() {
          originalFit.bind(chart.legend)();
          this.height += 30;
        };
      },
    };

    const ctx = opCanvasRef.current.getContext("2d");
    chartOpRef.current = new Chart(ctx, {
      type: "line",
      data: { labels: grouped.map((d) => d.label), datasets: ds },
      plugins: [opLabelPlugin, legendMargin],
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true, labels: { color: "#8A94A8", boxWidth: 12, font: { size: 11, family: "'Montserrat',sans-serif" } } },
          tooltip: {
            backgroundColor: "#0B1C49", titleColor: "#fff", bodyColor: "#8A94A8",
            callbacks: {
              title: (items) => grouped[items[0].dataIndex]?.labelFull || items[0].label,
              label: (ctx) => {
                const v = ctx.parsed.y; if (v == null) return null;
                if (ctx.dataset.label === "Tiempo Armado (min)") return ` Tiempo Armado: ${v.toFixed(1)} min`;
                if (ctx.dataset.label === "Promedio Items") return ` Promedio Items: ${Math.round(v)}`;
                return ` ${ctx.dataset.label}: ${v.toFixed(1)}%`;
              },
            },
          },
        },
        scales: {
          x: { type: "category", ticks: { color: "#8A94A8", font: { size: 11 }, maxRotation: 0 }, grid: { color: "rgba(211,213,232,.5)" } },
          yLeft: { position: "left", min: 0, max: 100, ticks: { color: "#1B8A5A", font: { size: 10 }, callback: (v) => v + "%" }, grid: { color: "rgba(211,213,232,.4)" } },
          yRight: { position: "right", ticks: { color: "#D98A00", font: { size: 10 } }, grid: { drawOnChartArea: false } },
        },
      },
    });

    // Sync dataset visibility with toggles
    if (chartOpRef.current) {
      [visOntime, visComp, visTiempo, visItems].forEach((vis, idx) => {
        const meta = chartOpRef.current.getDatasetMeta(idx);
        meta.hidden = !vis;
      });
      chartOpRef.current.update();
    }

    return () => { if (chartOpRef.current) { chartOpRef.current.destroy(); chartOpRef.current = null; } };
  }, [operacion, level, selYear, selMonth, visOntime, visComp, visTiempo, visItems, groupOpData]);

  // ─── Fetch helpers ────────────────────────────────────────────────────────
  const loadFiltros = useCallback(async (fiVal, ffVal) => {
    try {
      const data = await fetch(API + "/api/lat/filtros" + qs({ fecha_inicio: fiVal, fecha_fin: ffVal })).then((r) => r.json());
      setLocalOpts(data.locales || []);
      setTipoOpts(data.tipos_servicio || []);
      setRolOpts(data.roles || []);
    } catch (e) { console.error("Error cargando filtros:", e); }
  }, []);

  const loadKPIsLAT = useCallback(async (fiVal, ffVal, localVal, tipoVal, rolVal) => {
    try {
      const d = await fetch(API + "/api/lat/kpis" + qs({ fecha_inicio: fiVal, fecha_fin: ffVal, local: localVal || null, tipo_servicio: tipoVal || null, rol: rolVal || null })).then((r) => r.json());
      setKpiPed(fmt(d.pedidos));
      setKpiPrest(fmt(d.prestadores));
      setKpiProd(d.productividad != null ? d.productividad.toFixed(1) : "—");
    } catch (e) { console.error("Error KPIs LAT:", e); }
  }, []);

  const loadKpiOperacion = useCallback(async (fiVal, ffVal, localVal, tipoVal, rolVal, lvl, sW) => {
    setOpLoading(true);
    const params = { fecha_inicio: fiVal, fecha_fin: ffVal };
    if (localVal) params.local = localVal;
    if (tipoVal) params.tipo_servicio = tipoVal;
    if (rolVal) params.rol = rolVal;
    if (lvl === "day" && sW) params.semana = sW;
    try {
      const data = await fetch(API + "/api/kpi-operacion" + qs(params)).then((r) => r.json());
      setOperacion(data);
    } catch (e) { console.error(e); }
    finally { setOpLoading(false); }
  }, []);

  const loadAll = useCallback(async (fiVal, ffVal, localVal, tipoVal, rolVal, lvl, sY, sM, sW) => {
    loadKPIsLAT(fiVal, ffVal, localVal, tipoVal, rolVal);
    setLoading(true);
    try {
      const [sem, dia] = await Promise.all([
        fetch(API + "/api/kpi-semanal" + qs({ fecha_inicio: fiVal, fecha_fin: ffVal, local: localVal || null, tipo_servicio: tipoVal || null, rol: rolVal || null })).then((r) => r.json()),
        fetch(API + "/api/kpi-diario" + qs({ fecha_inicio: fiVal, fecha_fin: ffVal, local: localVal || null, tipo_servicio: tipoVal || null, rol: rolVal || null })).then((r) => r.json()),
      ]);
      setSemanal(sem);
      setDiario(dia);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
    loadKpiOperacion(fiVal, ffVal, localVal, tipoVal, rolVal, lvl, sW);
  }, [loadKPIsLAT, loadKpiOperacion]);

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadFiltros(fi, ff);
    loadAll(fi, ff, "", "", "", "week", null, null, null);
  }, []); // eslint-disable-line

  // ─── Drill helpers ────────────────────────────────────────────────────────
  const drillInto = useCallback((meta) => {
    setLevel((prevLevel) => {
      let newFi = fi, newFf = ff;
      let newSelYear = selYear, newSelMonth = selMonth, newSelWeek = selWeek;
      let newLevel = prevLevel;

      if (prevLevel === "year") { newSelYear = meta.anio; newLevel = "month"; newFi = `${meta.anio}-01-01`; newFf = `${meta.anio}-12-31`; }
      else if (prevLevel === "month") { newSelMonth = meta.mes; newLevel = "week"; const ld = new Date(meta.anio, meta.mes, 0).getDate(); newFi = `${meta.anio}-${pad(meta.mes)}-01`; newFf = `${meta.anio}-${pad(meta.mes)}-${pad(ld)}`; }
      else if (prevLevel === "week" && meta.fecha_inicio_semana) { newSelWeek = meta.semana; newLevel = "day"; const dt = new Date(meta.fecha_inicio_semana + "T12:00:00"); const en = new Date(dt); en.setDate(en.getDate() + 6); newFi = meta.fecha_inicio_semana; newFf = en.toISOString().slice(0, 10); }

      setFi(newFi); setFf(newFf); setYear("");
      setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
      loadAll(newFi, newFf, local, tipo, rol, newLevel, newSelYear, newSelMonth, newSelWeek);
      return newLevel;
    });
  }, [fi, ff, local, tipo, rol, selYear, selMonth, selWeek, loadAll]);

  const handleSetLevel = (newLevel) => {
    const ci = LEVELS.indexOf(level), ni = LEVELS.indexOf(newLevel);
    let newFi = fi, newFf = ff;
    let newSelYear = selYear, newSelMonth = selMonth;
    let newSelWeek = selWeek;

    if (ni < ci) {
      if (ni <= 0) { newSelYear = null; newSelMonth = null; newSelWeek = null; }
      if (ni <= 1) { newSelMonth = null; newSelWeek = null; }
      if (ni <= 2) { newSelWeek = null; }
    }

    if (newLevel === "month" && newSelYear) {
      newFi = `${newSelYear}-01-01`; newFf = `${newSelYear}-12-31`;
    } else if (newLevel === "week" && newSelYear && newSelMonth) {
      const ld = new Date(newSelYear, newSelMonth, 0).getDate();
      newFi = `${newSelYear}-${pad(newSelMonth)}-01`; newFf = `${newSelYear}-${pad(newSelMonth)}-${pad(ld)}`;
    } else {
      newFi = origFiRef.current || fi; newFf = origFfRef.current || ff;
    }

    setLevel(newLevel); setFi(newFi); setFf(newFf); setYear("");
    setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
    loadAll(newFi, newFf, local, tipo, rol, newLevel, newSelYear, newSelMonth, newSelWeek);
    loadKpiOperacion(newFi, newFf, local, tipo, rol, newLevel, newSelWeek);
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

    if (i - 1 === 2 && newSelYear && newSelMonth) {
      const ld = new Date(newSelYear, newSelMonth, 0).getDate();
      newFi = `${newSelYear}-${pad(newSelMonth)}-01`; newFf = `${newSelYear}-${pad(newSelMonth)}-${pad(ld)}`;
    } else if (i - 1 === 1 && newSelYear) {
      newFi = `${newSelYear}-01-01`; newFf = `${newSelYear}-12-31`;
    } else {
      newFi = origFiRef.current || fi; newFf = origFfRef.current || ff;
    }

    setLevel(newLevel); setFi(newFi); setFf(newFf); setYear("");
    setSelYear(newSelYear); setSelMonth(newSelMonth); setSelWeek(newSelWeek);
    loadAll(newFi, newFf, local, tipo, rol, newLevel, newSelYear, newSelMonth, newSelWeek);
    loadKpiOperacion(newFi, newFf, local, tipo, rol, newLevel, newSelWeek);
  };

  const handleApply = () => {
    origFiRef.current = fi; origFfRef.current = ff;
    loadAll(fi, ff, local, tipo, rol, level, selYear, selMonth, selWeek);
  };

  const handleReset = () => {
    const hoy = new Date();
    const newFi = `${hoy.getFullYear()}-01-01`, newFf = hoy.toISOString().slice(0, 10);
    setFi(newFi); setFf(newFf); setYear(String(hoy.getFullYear()));
    setLocal(""); setTipo(""); setRol("");
    setLevel("week"); setSelYear(null); setSelMonth(null); setSelWeek(null);
    origFiRef.current = newFi; origFfRef.current = newFf;
    loadAll(newFi, newFf, "", "", "", "week", null, null, null);
  };

  const syncYear = (y) => {
    setYear(y);
    if (!y) return;
    const hoy = new Date();
    const newFi = `${y}-01-01`;
    const newFf = parseInt(y) === hoy.getFullYear() ? hoy.toISOString().slice(0, 10) : `${y}-12-31`;
    setFi(newFi); setFf(newFf);
    origFiRef.current = newFi; origFfRef.current = newFf;
    loadAll(newFi, newFf, local, tipo, rol, level, selYear, selMonth, selWeek);
  };

  const handleToggleMetric = (key) => {
    if (key === "ontime") setVisOntime((v) => !v);
    if (key === "completitud") setVisComp((v) => !v);
    if (key === "tiempo") setVisTiempo((v) => !v);
    if (key === "items") setVisItems((v) => !v);
  };

  // Drill context text
  const drillParts = [];
  if (selYear) drillParts.push(<strong key="y">{selYear}</strong>);
  if (selMonth) drillParts.push(<strong key="m">{MESES[selMonth]}</strong>);
  if (selWeek) drillParts.push(<strong key="w">S{selWeek}</strong>);
  const drillCtx = drillParts.length ? (
    <span>📍 {drillParts.reduce((acc, el, i) => [...acc, ...(i > 0 ? [" › "] : []), el], [])}</span>
  ) : null;

  const levelTitles = { year: "por Año", month: "por Mes", week: "por Semana", day: "por Día" };

  return (
    <div className="db-main">
      {/* Filter bar */}
      <div className="db-filter-bar">
        <label>Desde</label>
        <input type="date" value={fi} onChange={(e) => setFi(e.target.value)} />
        <label>Hasta</label>
        <input type="date" value={ff} onChange={(e) => setFf(e.target.value)} />
        <label>Año rápido</label>
        <select value={year} onChange={(e) => syncYear(e.target.value)}>
          <option value="">Personalizado</option>
          <option value="2024">2024</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
        </select>
        <label>Local</label>
        <select value={local} onChange={(e) => { setLocal(e.target.value); loadAll(fi, ff, e.target.value, tipo, rol, level, selYear, selMonth, selWeek); }}>
          <option value="">Todos</option>
          {localOpts.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <label>Tipo servicio</label>
        <select value={tipo} onChange={(e) => { setTipo(e.target.value); loadAll(fi, ff, local, e.target.value, rol, level, selYear, selMonth, selWeek); }}>
          <option value="">Todos</option>
          {tipoOpts.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <label>Rol</label>
        <select value={rol} onChange={(e) => { setRol(e.target.value); loadAll(fi, ff, local, tipo, e.target.value, level, selYear, selMonth, selWeek); }}>
          <option value="">Todos</option>
          {rolOpts.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button className="db-btn-primary" onClick={handleApply}>Aplicar</button>
        <button className="db-btn-ghost" onClick={handleReset}>↩ Reiniciar</button>
        <span className="db-range-label">{fi && ff ? `${fi} → ${ff}` : ""}</span>
      </div>

      {/* KPI row 1 */}
      <div className="db-kpis">
        <div className="db-kpi"><div className="db-kpi-label">Pedidos</div><div className="db-kpi-val pink">{kpiPed}</div></div>
        <div className="db-kpi"><div className="db-kpi-label">Prestadores</div><div className="db-kpi-val navy">{kpiPrest}</div></div>
        <div className="db-kpi"><div className="db-kpi-label">Productividad</div><div className="db-kpi-val warn">{kpiProd}</div><div className="db-kpi-sub">pedidos/prestador/día</div></div>
      </div>

      {/* Main chart */}
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
            <button className="db-btn-up" disabled={level === "year"} onClick={handleDrillUp}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg> Subir
            </button>
            <span className="db-drill-ctx">{drillCtx}</span>
          </div>
        </div>
        <div className="db-chart-head">
          <div>
            <div className="db-chart-title">Pedidos · Prestadores · Productividad {levelTitles[level]}</div>
            <div className="db-chart-sub">Cambia nivel con los botones arriba, o haz clic en una barra</div>
          </div>
        </div>
        <div className="db-chart-wrap" style={{ position: "relative" }}>
          <canvas ref={mainCanvasRef} />
          <div className={`db-chart-loading${loading ? " show" : ""}`}>Cargando datos…</div>
        </div>
      </div>

      {/* KPI row 2 */}
      <div className="db-kpis-4">
        <div className="db-kpi"><div className="db-kpi-label">% OnTime</div><div className="db-kpi-val" style={{ color: "#1B8A5A" }}>{kpiOntime}</div><div className="db-kpi-sub">entregas a tiempo</div></div>
        <div className="db-kpi"><div className="db-kpi-label">% Completitud</div><div className="db-kpi-val" style={{ color: "#A02D6E" }}>{kpiComp}</div><div className="db-kpi-sub">uds pickeadas/solicitadas</div></div>
        <div className="db-kpi"><div className="db-kpi-label">Tiempo Armado</div><div className="db-kpi-val" style={{ color: "#7C3AED" }}>{kpiTiempo}</div><div className="db-kpi-sub">minutos promedio</div></div>
        <div className="db-kpi"><div className="db-kpi-label">Items Promedio</div><div className="db-kpi-val" style={{ color: "#3D5490" }}>{kpiItems}</div><div className="db-kpi-sub">items solicitados</div></div>
      </div>

      {/* Op chart */}
      <div className="db-chart-panel" style={{ marginTop: "1.25rem" }}>
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
            <button className="db-btn-up" disabled={level === "year"} onClick={handleDrillUp}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg> Subir
            </button>
            <span className="db-drill-ctx">{drillCtx}</span>
          </div>
        </div>
        <div className="db-chart-head">
          <div>
            <div className="db-chart-title">KPI Operación {levelTitles[level]}</div>
            <div className="db-chart-sub">Usa los botones de jerarquía para cambiar el nivel de agregación</div>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
            {[
              { key: "ontime", label: "% OnTime", color: "#1B8A5A", vis: visOntime },
              { key: "completitud", label: "% Completitud", color: "#D64294", vis: visComp },
              { key: "tiempo", label: "Tiempo Armado", color: "#D98A00", vis: visTiempo },
              { key: "items", label: "Items", color: "#3D5490", vis: visItems },
            ].map(({ key, label, color, vis }) => (
              <button key={key} className={`db-op-toggle${vis ? " active" : ""}`} style={{ color, borderColor: color }} onClick={() => handleToggleMetric(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="db-chart-wrap" style={{ position: "relative", height: "350px" }}>
          <canvas ref={opCanvasRef} />
          <div className={`db-chart-loading${opLoading ? " show" : ""}`}>Cargando datos…</div>
        </div>
      </div>
    </div>
  );
}
