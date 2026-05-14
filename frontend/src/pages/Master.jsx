import { useState, useRef, useCallback, useEffect } from "react";
import Navbar from "../components/Navbar";
import { useUpload } from "../contexts/UploadContext";
import { useAuth } from "../contexts/AuthContext";

const API = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";

const TIPOS = {
  beetrak: { label: "Beetrack", color: "#00E5C3", desc: "Archivo de seguimiento" },
  pfa:     { label: "PFA",      color: "#FF6B35", desc: "Archivo de proceso" },
};

function FileZone({ tipo, onFile, file, estado }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);
  const cfg = TIPOS[tipo];

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(tipo, f);
  }, [tipo, onFile]);

  const activo = estado === "leyendo" || estado === "subiendo";

  const estadoIcon = {
    idle:     null,
    leyendo:  <span className="spinner" />,
    subiendo: <span className="spinner alt" />,
    listo:    <span className="check">✓</span>,
    error:    <span className="x-mark">✗</span>,
  }[estado] ?? null;

  const estadoLabel = {
    idle:     file ? file.name : "Arrastra o haz clic",
    leyendo:  "Leyendo archivo...",
    subiendo: "Subiendo al servidor...",
    listo:    "¡Procesado!",
    error:    "Error al procesar",
  }[estado];

  return (
    <div
      className={`file-zone ${drag ? "drag-over" : ""} ${estado}`}
      style={{ "--accent": cfg.color }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => !activo && inputRef.current.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files[0]; if (f) onFile(tipo, f); }}
      />
      <div className="zone-header">
        <span className="tipo-badge" style={{ background: cfg.color + "22", color: cfg.color, borderColor: cfg.color + "44" }}>
          {cfg.label}
        </span>
        <span className="tipo-desc">{cfg.desc}</span>
      </div>
      <div className="zone-body">
        {estadoIcon}
        <p className="zone-status">{estadoLabel}</p>
        {file && estado === "idle" && (
          <p className="zone-size">{(file.size / 1024).toFixed(1)} KB · {file.name.split(".").pop().toUpperCase()}</p>
        )}
      </div>
      {estado === "idle" && !file && <p className="zone-hint">xlsx · xls · csv</p>}
    </div>
  );
}

const PFA_COLOR = TIPOS.pfa.color;

function PFAMultiZone({ archivos, onAgregar, onRemover, estado }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  const procesando = estado === "leyendo" || estado === "subiendo";

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    if (procesando) return;
    Array.from(e.dataTransfer.files).forEach(f => onAgregar(f));
  }, [procesando, onAgregar]);

  const handleChange = (e) => {
    Array.from(e.target.files).forEach(f => onAgregar(f));
    e.target.value = "";
  };

  return (
    <div
      className={`file-zone ${drag ? "drag-over" : ""} ${archivos.length > 0 ? "idle" : "idle"}`}
      style={{ "--accent": PFA_COLOR, minHeight: 120 }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        multiple
        style={{ display: "none" }}
        onChange={handleChange}
      />
      <div className="zone-header">
        <span className="tipo-badge" style={{ background: PFA_COLOR + "22", color: PFA_COLOR, borderColor: PFA_COLOR + "44" }}>
          PFA
        </span>
        <span className="tipo-desc">Archivo(s) de proceso</span>
        {!procesando && (
          <button
            onClick={(e) => { e.stopPropagation(); inputRef.current.click(); }}
            style={{
              marginLeft: "auto",
              background: PFA_COLOR + "22",
              color: PFA_COLOR,
              border: `1px solid ${PFA_COLOR}44`,
              borderRadius: 4,
              padding: "2px 10px",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              fontWeight: 700,
            }}
            title="Agregar archivo(s)"
          >+</button>
        )}
      </div>

      {archivos.length === 0 ? (
        <div className="zone-body" onClick={() => !procesando && inputRef.current.click()} style={{ cursor: "pointer" }}>
          <p className="zone-status">Arrastra o haz clic</p>
          <p className="zone-hint">xlsx · xls · csv · varios archivos</p>
        </div>
      ) : (
        <div style={{ padding: "4px 12px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          {archivos.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              {procesando && estado !== "listo"
                ? <span className="spinner" style={{ width: 10, height: 10 }} />
                : <span style={{ color: PFA_COLOR, fontWeight: 700 }}>·</span>
              }
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text1)" }}>
                {f.name}
              </span>
              <span style={{ color: "var(--text3)", flexShrink: 0 }}>
                {(f.size / 1024).toFixed(0)} KB
              </span>
              {!procesando && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemover(i); }}
                  style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: "0 2px", fontSize: 13 }}
                  title="Quitar"
                >✕</button>
              )}
            </div>
          ))}
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text3)" }}>
            {archivos.length} archivo{archivos.length > 1 ? "s" : ""} seleccionado{archivos.length > 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function StatsCard({ stats, tipo }) {
  if (!stats) return null;
  const cfg = TIPOS[tipo];

  if (tipo === "pfa") {
    return (
      <div className="stats-card" style={{ "--accent": cfg.color }}>
        <div className="stats-header">
          <span className="tipo-badge small" style={{ background: cfg.color + "22", color: cfg.color, borderColor: cfg.color + "44" }}>
            PFA
          </span>
          <span className="stats-filas">{stats.filas_originales?.toLocaleString()} originales</span>
        </div>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-val">{stats.filas_finanzas?.toLocaleString()}</span>
            <span className="stat-key">pfa_finanzas</span>
          </div>
          <div className="stat-item">
            <span className="stat-val">{stats.filas_limpias?.toLocaleString()}</span>
            <span className="stat-key">pfa_limpia</span>
          </div>
          <div className="stat-item">
            <span className="stat-val">{stats.duplicados_eliminados}</span>
            <span className="stat-key">duplicados eliminados</span>
          </div>
          {stats.stats?.min_picking_promedio != null && (
            <div className="stat-item">
              <span className="stat-val">{stats.stats.min_picking_promedio} min</span>
              <span className="stat-key">picking promedio</span>
            </div>
          )}
          {stats.stats?.dobles_pedidos != null && (
            <div className="stat-item">
              <span className="stat-val">{stats.stats.dobles_pedidos}</span>
              <span className="stat-key">dobles pedidos</span>
            </div>
          )}
        </div>
        <p className="stats-archivo">→ {stats.archivo_finanzas} · {stats.archivo_limpio}</p>
      </div>
    );
  }

  return (
    <div className="stats-card" style={{ "--accent": cfg.color }}>
      <div className="stats-header">
        <span className="tipo-badge small" style={{ background: cfg.color + "22", color: cfg.color, borderColor: cfg.color + "44" }}>
          {cfg.label}
        </span>
        <span className="stats-filas">{stats.filas_limpias?.toLocaleString()} filas limpias</span>
      </div>
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-val">{stats.filas_originales?.toLocaleString()}</span>
          <span className="stat-key">originales</span>
        </div>
        <div className="stat-item">
          <span className="stat-val">{stats.columnas_eliminadas}</span>
          <span className="stat-key">cols. eliminadas</span>
        </div>
        {stats.stats?.ordenes_unicas && (
          <div className="stat-item">
            <span className="stat-val">{stats.stats.ordenes_unicas.toLocaleString()}</span>
            <span className="stat-key">órdenes únicas</span>
          </div>
        )}
      </div>
      <p className="stats-archivo">→ {stats.archivo_limpio}</p>
    </div>
  );
}

function JoinCard({ joinData }) {
  if (!joinData) return null;
  return (
    <div className="join-card">
      <div className="join-card-header">
        <span className="join-icon">⟷</span>
        <span>JOIN Beetrack ↔ PFA por orden</span>
      </div>
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-val" style={{ color: "#00E5C3" }}>{joinData.filas_beetrak?.toLocaleString()}</span>
          <span className="stat-key">beetrack</span>
        </div>
        <div className="stat-item">
          <span className="stat-val" style={{ color: "#FF6B35" }}>{joinData.filas_pfa?.toLocaleString()}</span>
          <span className="stat-key">pfa</span>
        </div>
        <div className="stat-item">
          <span className="stat-val">{joinData.filas_con_match?.toLocaleString()}</span>
          <span className="stat-key">con match</span>
        </div>
        <div className="stat-item">
          <span className="stat-val">{joinData.pct_match}%</span>
          <span className="stat-key">% coincidencia</span>
        </div>
      </div>
    </div>
  );
}

function LogPanel({ logs }) {
  return (
    <div className="log-panel">
      <div className="log-header"><span className="log-dot" /><span>Log de actividad</span></div>
      <div className="log-body">
        {logs.length === 0 && <p className="log-empty">Sin actividad aún...</p>}
        {logs.map((l, i) => (
          <div key={i} className={`log-line ${l.tipo}`}>
            <span className="log-ts">{l.ts}</span>
            <span className="log-msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ACENTO_GEOSORT = "#7C3AED";

function GeosortPanel() {
  const { rol } = useAuth();
  const { addLog } = useUpload();
  const [cargando,   setCargando]   = useState(false);
  const [yaCargado,  setYaCargado]  = useState(false);
  const [resultado,  setResultado]  = useState(null);

  useEffect(() => {
    fetch(`${API}/estado-geosort`)
      .then(r => r.json())
      .then(d => setYaCargado(d.ya_cargado))
      .catch(() => {});
  }, []);

  if (rol !== "admin") return null;

  const bloqueado = yaCargado;

  const handleCargar = async () => {
    setCargando(true);
    addLog("Cargando datos Geosort desde Drive...");
    try {
      const res  = await fetch(`${API}/cargar-geosort`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error del servidor");
      setResultado(data);
      setYaCargado(true);
      addLog(`✓ Geosort cargado — ${data.filas_insertadas.toLocaleString()} rutas · ${data.archivos_procesados} archivos`, "success");
    } catch (err) {
      addLog(`Error Geosort: ${err.message}`, "error");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="file-zone" style={{ "--accent": ACENTO_GEOSORT }}>
      <div className="zone-header">
        <span className="tipo-badge" style={{ background: ACENTO_GEOSORT + "22", color: ACENTO_GEOSORT, borderColor: ACENTO_GEOSORT + "44" }}>
          Geosort
        </span>
        <span className="tipo-desc">Reportes de rutas Falabella</span>
      </div>
      <div className="zone-body" style={{ cursor: "default" }}>
        {resultado ? (
          <>
            <span className="check">✓</span>
            <p className="zone-status">Cargado correctamente</p>
            <p className="zone-size">{resultado.filas_insertadas.toLocaleString()} rutas · {resultado.archivos_procesados} archivos</p>
          </>
        ) : yaCargado ? (
          <>
            <span className="check">✓</span>
            <p className="zone-status">Ya cargado hoy</p>
          </>
        ) : cargando ? (
          <p className="zone-status">Cargando desde Drive...</p>
        ) : (
          <p className="zone-status">Listo para cargar</p>
        )}
      </div>
      <button
        onClick={handleCargar}
        disabled={bloqueado || cargando}
        style={{
          margin: "0 12px 12px",
          padding: "6px 0",
          width: "calc(100% - 24px)",
          background: bloqueado || cargando ? "transparent" : ACENTO_GEOSORT + "22",
          color: bloqueado || cargando ? "var(--text3)" : ACENTO_GEOSORT,
          border: `1px solid ${bloqueado || cargando ? "var(--border)" : ACENTO_GEOSORT + "44"}`,
          borderRadius: 6,
          cursor: bloqueado || cargando ? "not-allowed" : "pointer",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {cargando ? "Cargando..." : "Cargar datos"}
      </button>
    </div>
  );
}

const TIPO_COLOR = {
  beetrak:      { color: "#00E5C3", bg: "rgba(0,229,195,0.12)"   },
  pfa:          { color: "#FF6B35", bg: "rgba(255,107,53,0.12)"  },
  pfa_delivery: { color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  falabella:    { color: "#7C3AED", bg: "rgba(124,58,237,0.12)"  },
};

function HistorialModal({ onClose }) {
  const [items,   setItems]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/historial`)
      .then(r => r.json())
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-header">
          <span className="modal-title">Historial de cargas</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading && <p className="modal-empty">Cargando...</p>}
          {!loading && items?.length === 0 && (
            <p className="modal-empty">Sin cargas registradas aún.</p>
          )}
          {!loading && items?.length > 0 && (
            <table className="hist-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Archivo</th>
                  <th style={{ textAlign: "right" }}>Filas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => {
                  const c = TIPO_COLOR[row.tipo] || { color: "var(--text2)", bg: "var(--bg3)" };
                  return (
                    <tr key={i}>
                      <td style={{ color: "var(--text3)", fontFamily: "var(--font-body)" }}>
                        {row.cargado_en}
                      </td>
                      <td>
                        <span className="hist-badge" style={{ color: c.color, background: c.bg, borderColor: c.color + "44" }}>
                          {row.tipo === "beetrak" ? "beetrack" : row.tipo}
                        </span>
                      </td>
                      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {row.archivo}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-head)", fontWeight: 700 }}>
                        {row.filas?.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function HistorialPanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-historial" onClick={() => setOpen(true)}>
        <span style={{ width: 6, height: 6, background: "var(--blue)", borderRadius: "50%", display: "inline-block" }} />
        Historial de archivos
      </button>
      {open && <HistorialModal onClose={() => setOpen(false)} />}
    </>
  );
}

function acumularStatsPfa(anterior, nuevo) {
  if (!anterior) return nuevo;
  return {
    ...nuevo,
    filas_originales:      (anterior.filas_originales      || 0) + (nuevo.filas_originales      || 0),
    filas_finanzas:        (anterior.filas_finanzas        || 0) + (nuevo.filas_finanzas        || 0),
    filas_limpias:         (anterior.filas_limpias         || 0) + (nuevo.filas_limpias         || 0),
    duplicados_eliminados: (anterior.duplicados_eliminados || 0) + (nuevo.duplicados_eliminados || 0),
  };
}

export default function Master() {
  const { uploads, logs, iniciarUpload, resetTodo, addLog } = useUpload();

  const [archivoBeetrak, setArchivoBeetrak] = useState(null);
  const [archivosPfa,    setArchivosPfa]    = useState([]);
  const [joinData,       setJoinData]       = useState(null);
  const [pfaStatsAcum,   setPfaStatsAcum]   = useState(null);

  const handleFileBeetrak = (tipo, file) => {
    setArchivoBeetrak(file);
    addLog(`Archivo BEETRAK seleccionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  };

  const handleAgregarPfa = (file) => {
    setArchivosPfa(prev => {
      if (prev.some(f => f.name === file.name && f.size === file.size)) return prev;
      addLog(`Archivo PFA agregado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      return [...prev, file];
    });
  };

  const handleRemoverPfa = (idx) => {
    setArchivosPfa(prev => prev.filter((_, i) => i !== idx));
  };

  const procesarTodo = async () => {
    setJoinData(null);
    setPfaStatsAcum(null);

    const tareas = [];

    if (archivoBeetrak && uploads.beetrak.estado === "idle") {
      tareas.push(iniciarUpload("beetrak", archivoBeetrak));
    }

    const pfaPendientes = archivosPfa;

    const procesarPfa = async () => {
      let acum = null;
      for (const file of pfaPendientes) {
        const stats = await iniciarUpload("pfa", file);
        if (stats) acum = acumularStatsPfa(acum, stats);
      }
      if (acum) setPfaStatsAcum(acum);
    };

    await Promise.all([...tareas, pfaPendientes.length > 0 ? procesarPfa() : Promise.resolve()]);

    const tieneBeetrak = archivoBeetrak !== null;
    const tienePfa     = archivosPfa.length > 0;
    if (tieneBeetrak && tienePfa) {
      try {
        addLog("Calculando JOIN Beetrack ↔ PFA...");
        const res  = await fetch(`${API}/join`, { method: "POST" });
        const data = await res.json();
        setJoinData(data);
        addLog(`JOIN: ${data.filas_con_match.toLocaleString()} órdenes con match (${data.pct_match}%)`, "success");
      } catch (err) {
        addLog(`JOIN falló: ${err.message}`, "error");
      }
    }
  };

  const reset = () => {
    setArchivoBeetrak(null);
    setArchivosPfa([]);
    setJoinData(null);
    setPfaStatsAcum(null);
    resetTodo();
  };

  const hayPendientes  = Object.values(uploads).some(u => u.estado === "leyendo" || u.estado === "subiendo");
  const puedeProcessar = (archivoBeetrak && uploads.beetrak.estado === "idle") || archivosPfa.length > 0;

  const statsParaMostrarPfa = pfaStatsAcum || uploads.pfa.stats;

  return (
    <div className="page">
      <Navbar />
      <div className="master-layout">
        <section className="upload-section">
          <div className="section-label">Archivos</div>
          <div className="zones-grid">
            <FileZone tipo="beetrak" onFile={handleFileBeetrak} file={archivoBeetrak} estado={uploads.beetrak.estado} />
            <PFAMultiZone
              archivos={archivosPfa}
              onAgregar={handleAgregarPfa}
              onRemover={handleRemoverPfa}
              estado={uploads.pfa.estado}
            />
            <GeosortPanel />
          </div>
          {archivoBeetrak && archivosPfa.length > 0 && (
            <div className="join-hint">
              ✦ Ambos archivos cargados — JOIN por orden ↔ shipping_group
            </div>
          )}
          <div className="actions">
            <button className="btn-primary" onClick={procesarTodo} disabled={!puedeProcessar || hayPendientes}>
              {hayPendientes ? "Procesando..." : "Limpiar y procesar"}
            </button>
            <button className="btn-ghost" onClick={reset}>Reiniciar</button>
          </div>
          {(uploads.beetrak.stats || statsParaMostrarPfa) && (
            <div className="stats-section">
              <div className="section-label" style={{ marginTop: 24 }}>Resultado</div>
              <div className="zones-grid">
                {uploads.beetrak.stats  && <StatsCard stats={uploads.beetrak.stats}  tipo="beetrak" />}
                {statsParaMostrarPfa    && <StatsCard stats={statsParaMostrarPfa}    tipo="pfa" />}
              </div>
              {joinData && <JoinCard joinData={joinData} />}
            </div>
          )}
        </section>

        <aside className="side-panel">
          <LogPanel logs={logs} />
          <HistorialPanel />
        </aside>
      </div>
    </div>
  );
}
