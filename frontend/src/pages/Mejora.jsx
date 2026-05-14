import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import Navbar from "../components/Navbar";
import Paginator, { paginar } from "../components/Paginator";
import { getCached, setCached, invalidate } from "../dataCache";

const API      = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const CHINA    = "#9F4F69";
const DISPLAY_LIMIT = 100;

const COLS_PFA = [
  "shipping_group", "nro_local", "fecha_control", "tipo_servicio", "rol_persona", "rut_persona",
  "fecha_compromiso", "ventana", "inicio_picking", "fin_picking",
  "unidades_solicitadas", "unidades_pickeadas", "unidades_sustituidas",
  "items_solicitados", "items_a_pagar", "minutos_picking", "doble_pedido",
];

const COLS_BEETRAK = [
  "identificador_ruta", "identificador", "orden", "local", "tipo_despacho",
  "fecha_estimada", "fecha_llegada", "estado", "subestado",
  "nombre_movil", "telefono_usuario", "direccion_cliente",
  "fecha_creacion", "fecha_primer_intento", "intentos", "rut_movil",
  "tiempo_min_entrega", "tiempo_max_entrega", "fecha_ruta",
  "inicio_ruta", "fin_ruta", "numero_intento", "latitud", "longitud",
  "fecha_picking", "foto_bultos",
];

const TABS = [
  { id: "pfa_limpia", label: "PFA Limpia", endpoint: "/datos/pfa_limpia" },
  { id: "beetrak",    label: "Beetrack",   endpoint: "/datos/beetrak"    },
];

const EMPTY = { total: 0, rows: [] };

function defaultUrl(endpoint) {
  return `${API}${endpoint}?limit=${DISPLAY_LIMIT}`;
}

export default function Mejora() {
  const [tab,         setTab]         = useState("pfa_limpia");
  const [datasets,    setDatasets]    = useState(() => ({
    pfa_limpia: getCached(defaultUrl(TABS[0].endpoint)),
    beetrak:    getCached(defaultUrl(TABS[1].endpoint)),
  }));
  const [loading,     setLoading]     = useState({ pfa_limpia: false, beetrak: false });
  const [errors,      setErrors]      = useState({ pfa_limpia: null,  beetrak: null  });
  const [fechaDesde,  setFechaDesde]  = useState("");
  const [fechaHasta,  setFechaHasta]  = useState("");
  const [localFiltro, setLocalFiltro] = useState("todos");
  const [locales,     setLocales]     = useState([]);
  const [exportando,  setExportando]  = useState(false);
  const [page,        setPage]        = useState(0);

  const tabCfg = TABS.find(t => t.id === tab);
  const cols   = tab === "pfa_limpia" ? COLS_PFA : COLS_BEETRAK;
  const ds     = datasets[tab] ?? EMPTY;

  // ── Cargar locales de beetrak una sola vez ──────────────────────────────────
  useEffect(() => {
    fetch(`${API}/locales/beetrak`)
      .then(r => r.json())
      .then(setLocales)
      .catch(() => {});
  }, []);

  // ── Construir URL con filtros ───────────────────────────────────────────────
  const buildUrl = useCallback((endpoint, { allRows = false } = {}) => {
    const params = new URLSearchParams();
    if (fechaDesde) params.set("desde", fechaDesde);
    if (fechaHasta) params.set("hasta", fechaHasta);
    if (!allRows)   params.set("limit", DISPLAY_LIMIT);
    if (tab === "beetrak" && localFiltro !== "todos") params.set("local", localFiltro);
    return `${API}${endpoint}?${params.toString()}`;
  }, [fechaDesde, fechaHasta, localFiltro, tab]);

  // ── Fetch datos (display) ───────────────────────────────────────────────────
  const fetchData = useCallback((forzar = false) => {
    if (!forzar && datasets[tab] !== null) return;
    const url = buildUrl(tabCfg.endpoint);
    if (!forzar) {
      const cached = getCached(url);
      if (cached) { setDatasets(p => ({ ...p, [tab]: cached })); return; }
    }
    setLoading(p => ({ ...p, [tab]: true }));
    setErrors(p => ({ ...p, [tab]: null }));
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json(); })
      .then(d  => { setCached(url, d); setDatasets(p => ({ ...p, [tab]: d })); })
      .catch(e => setErrors(p => ({ ...p, [tab]: e.message })))
      .finally(() => setLoading(p => ({ ...p, [tab]: false })));
  }, [tab, datasets, buildUrl, tabCfg]);

  useEffect(() => { fetchData(); }, [tab]);
  useEffect(() => { setPage(0); },  [tab, fechaDesde, fechaHasta, localFiltro]);

  const buscar = () => {
    invalidate(buildUrl(tabCfg.endpoint));
    setDatasets(p => ({ ...p, [tab]: null }));
    fetchData(true);
  };

  // ── Exportar: fetch completo, sin guardar en estado ─────────────────────────
  const exportar = async () => {
    setExportando(true);
    try {
      const url = buildUrl(tabCfg.endpoint, { allRows: true });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const { rows } = await res.json();
      const ws = XLSX.utils.json_to_sheet(rows.map(r => Object.fromEntries(cols.map(c => [c, r[c] ?? ""]))));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tabCfg.label);
      XLSX.writeFile(wb, `mejora_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      alert(`Error al exportar: ${e.message}`);
    } finally {
      setExportando(false);
    }
  };

  const handleTab = (id) => {
    setTab(id);
    setFechaDesde("");
    setFechaHasta("");
    setLocalFiltro("todos");
    setPage(0);
  };

  const isLoading = loading[tab];
  const error     = errors[tab];

  return (
    <div className="page">
      <Navbar />
      <div className="page-content">

        {/* ── Header + filtros ── */}
        <div className="page-header">
          <h2 className="page-title" style={{ "--accent": CHINA }}>Mejora Continua</h2>
          <div className="page-actions">
            <div className="filter-group">
              <label>Desde</label>
              <input type="date" className="input-date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Hasta</label>
              <input type="date" className="input-date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
            </div>
            {tab === "beetrak" && (
              <div className="filter-group">
                <label>Local</label>
                <select className="select-rol" value={localFiltro} onChange={e => setLocalFiltro(e.target.value)}>
                  <option value="todos">Todos</option>
                  {locales.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
            <button className="btn-primary" style={{ background: CHINA }} onClick={buscar} disabled={isLoading}>
              Buscar
            </button>
            <button
              className="btn-export"
              style={{ color: CHINA, borderColor: "rgba(159,79,105,0.3)" }}
              onClick={exportar}
              disabled={exportando || ds.total === 0}
            >
              {exportando
                ? "Descargando..."
                : `Exportar Excel (${ds.total.toLocaleString()})`}
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="tab-toggle" style={{ "--tab-color": CHINA }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab-btn ${tab === t.id ? "active" : ""}`}
              onClick={() => handleTab(t.id)}
            >
              {t.label}
              {datasets[t.id] !== null && (
                <span className="tab-count">{datasets[t.id].total.toLocaleString()}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Estados ── */}
        {isLoading && <p className="table-msg">Cargando {tabCfg.label}...</p>}
        {error     && <p className="table-msg error">{error} — procesá el archivo primero en Vista Maestra.</p>}

        {/* ── Tabla ── */}
        {!isLoading && !error && ds.rows.length > 0 && (
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
                  {paginar(ds.rows, page).map((row, i) => (
                    <tr key={i}>{cols.map(c => (
                      <td key={c}>
                        {c === "minutos_picking" && row[c] != null && row[c] !== ""
                          ? Number(row[c]).toFixed(1)
                          : c === "foto_bultos" && row[c]
                          ? row[c].split(",").map((url, idx) => (
                              <a key={idx} href={url.trim()} target="_blank" rel="noopener noreferrer"
                                 style={{ color: CHINA, display: "block", whiteSpace: "nowrap" }}>
                                Foto {idx + 1}
                              </a>
                            ))
                          : (row[c] ?? "")}
                      </td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginator total={ds.rows.length} page={page} onPage={setPage} />
          </div>
        )}

        {!isLoading && !error && datasets[tab] !== null && ds.rows.length === 0 && (
          <p className="table-msg">Sin resultados para el rango seleccionado.</p>
        )}
      </div>
    </div>
  );
}
