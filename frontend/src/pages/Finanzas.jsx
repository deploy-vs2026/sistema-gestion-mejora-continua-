import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import Navbar from "../components/Navbar";
import Paginator, { paginar } from "../components/Paginator";
import { getCached, setCached, invalidate } from "../dataCache";

const API           = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const DISPLAY_LIMIT = 100;

const COLS = [
  "empresa", "rut_empresa", "shipping_group", "nro_local", "fecha_control",
  "tipo_servicio", "rol_persona", "rut_persona", "fecha_compromiso", "ventana",
  "inicio_picking", "fin_picking",
  "unidades_solicitadas", "unidades_pickeadas", "unidades_sustituidas",
  "items_solicitados", "items_a_pagar", "doble_pedido",
];

const EMPTY = { total: 0, rows: [] };

export default function Finanzas() {
  const [dataset,    setDataset]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [exportando, setExportando] = useState(false);
  const [page,       setPage]       = useState(0);

  const ds = dataset ?? EMPTY;

  const buildUrl = useCallback(({ allRows = false } = {}) => {
    const params = new URLSearchParams();
    if (fechaDesde) params.set("desde", fechaDesde);
    if (fechaHasta) params.set("hasta", fechaHasta);
    if (!allRows)   params.set("limit", DISPLAY_LIMIT);
    return `${API}/datos/pfa_finanzas?${params.toString()}`;
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
      const ws = XLSX.utils.json_to_sheet(rows.map(r => Object.fromEntries(COLS.map(c => [c, r[c] ?? ""]))));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "PFA Finanzas");
      XLSX.writeFile(wb, `pfa_finanzas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      alert(`Error al exportar: ${e.message}`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="page">
      <Navbar />
      <div className="page-content">

        {/* ── Header + filtros ── */}
        <div className="page-header">
          <h2 className="page-title" style={{ "--accent": "var(--pink)" }}>Vista Finanzas</h2>
          <div className="page-actions">
            <div className="filter-group">
              <label>Desde</label>
              <input type="date" className="input-date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Hasta</label>
              <input type="date" className="input-date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={buscar} disabled={loading}>
              Buscar
            </button>
            <button
              className="btn-export"
              onClick={exportar}
              disabled={exportando || ds.total === 0}
            >
              {exportando ? "Descargando..." : `Exportar Excel (${ds.total.toLocaleString()})`}
            </button>
          </div>
        </div>

        {/* ── Estados ── */}
        {loading && <p className="table-msg">Cargando datos...</p>}
        {error   && <p className="table-msg error">{error} — procesá un PFA primero en Vista Maestra.</p>}

        {/* ── Tabla ── */}
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
                  <tr>{COLS.map(c => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {paginar(ds.rows, page).map((row, i) => (
                    <tr key={i}>{COLS.map(c => <td key={c}>{row[c] ?? ""}</td>)}</tr>
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
      </div>
    </div>
  );
}
