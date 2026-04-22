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
  const [estado,    setEstado]    = useState(null);   // null = cargando
  const [cargando,  setCargando]  = useState(false);
  const [resultado, setResultado] = useState(null);

  const esLunes = new Date().getDay() === 1;

  useEffect(() => {
    if (rol !== "admin") return;
    fetch(`${API}/estado-geosort`)
      .then(r => r.json())
      .then(setEstado)
      .catch(() => setEstado({ ya_cargado: false }));
  }, [rol]);

  if (rol !== "admin") return null;

  const bloqueado    = !esLunes || estado?.ya_cargado;
  const motivoLabel  = resultado
    ? "Datos cargados"
    : !esLunes
      ? "Disponible los lunes"
      : estado?.ya_cargado
        ? "Ya cargado esta semana"
        : estado === null
          ? "Verificando..."
          : "Listo para cargar";

  const handleCargar = async () => {
    setCargando(true);
    addLog("Iniciando carga de datos Geosort desde bucket...");
    try {
      const res  = await fetch(`${API}/cargar-geosort`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error del servidor");
      setResultado(data);
      setEstado({ ya_cargado: true });
      addLog(
        `✓ Geosort cargado — ${data.filas_totales.toLocaleString()} filas en ${data.archivos.length} archivo(s)`,
        "success"
      );
    } catch (err) {
      addLog(`Error Geosort: ${err.message}`, "error");
    } finally {
      setCargando(false);
    }
  };

  const activo = !bloqueado && !cargando && estado !== null && !resultado;

  return (
    <div className="file-zone" style={{ "--accent": ACENTO_GEOSORT }}>
      <div className="zone-header">
        <span className="tipo-badge" style={{ background: ACENTO_GEOSORT + "22", color: ACENTO_GEOSORT, borderColor: ACENTO_GEOSORT + "44" }}>
          Geosort
        </span>
        <span className="tipo-desc">Reportes de rutas Falabella</span>
      </div>
      <div className="zone-body">
        {resultado ? (
          <>
            <span className="check">✓</span>
            <p className="zone-status">Cargado correctamente</p>
            <p className="zone-size">
              {resultado.filas_totales.toLocaleString()} filas · {resultado.archivos.length} archivo(s)
            </p>
          </>
        ) : (
          <p className="zone-status">{motivoLabel}</p>
        )}
      </div>
      <button
        onClick={handleCargar}
        disabled={!activo}
        style={{
          margin: "8px 12px 12px",
          padding: "8px 0",
          width: "calc(100% - 24px)",
          background: activo ? ACENTO_GEOSORT : "var(--bg3)",
          color: activo ? "#fff" : "var(--text3)",
          border: "none",
          borderRadius: 6,
          cursor: activo ? "pointer" : "not-allowed",
          fontFamily: "var(--font-head)",
          fontSize: 13,
          fontWeight: 600,
          transition: "background 0.2s",
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

export default function Master() {
  const { uploads, logs, iniciarUpload, resetTodo, addLog } = useUpload();

  const [archivos,   setArchivos]   = useState({ beetrak: null, pfa: null });
  const [joinData,   setJoinData]   = useState(null);

  const handleFile = (tipo, file) => {
    setArchivos(prev => ({ ...prev, [tipo]: file }));
    addLog(`Archivo ${tipo.toUpperCase()} seleccionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  };

  const procesarTodo = async () => {
    setJoinData(null);
    const tareas = Object.entries(archivos)
      .filter(([tipo, file]) => file && uploads[tipo].estado === "idle")
      .map(([tipo, file]) => iniciarUpload(tipo, file));

    await Promise.all(tareas);

    const ambosListos = ["beetrak", "pfa"].every(t => archivos[t] !== null);
    if (ambosListos) {
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
    setArchivos({ beetrak: null, pfa: null });
    setJoinData(null);
    resetTodo();
  };

  const hayPendientes  = Object.values(uploads).some(u => u.estado === "leyendo" || u.estado === "subiendo");
  const puedeProcessar = Object.entries(archivos).some(([t, f]) => f && uploads[t].estado === "idle");

  return (
    <div className="page">
      <Navbar />
      <div className="master-layout">
        <section className="upload-section">
          <div className="section-label">Archivos</div>
          <div className="zones-grid">
            <FileZone tipo="beetrak" onFile={handleFile} file={archivos.beetrak} estado={uploads.beetrak.estado} />
            <FileZone tipo="pfa"     onFile={handleFile} file={archivos.pfa}     estado={uploads.pfa.estado} />
            <GeosortPanel />
          </div>
          {archivos.beetrak && archivos.pfa && (
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
          {(uploads.beetrak.stats || uploads.pfa.stats) && (
            <div className="stats-section">
              <div className="section-label" style={{ marginTop: 24 }}>Resultado</div>
              <div className="zones-grid">
                {uploads.beetrak.stats && <StatsCard stats={uploads.beetrak.stats} tipo="beetrak" />}
                {uploads.pfa.stats     && <StatsCard stats={uploads.pfa.stats}     tipo="pfa" />}
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
