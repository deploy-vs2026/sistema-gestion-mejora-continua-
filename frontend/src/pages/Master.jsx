import { useState, useRef, useCallback, useEffect } from "react";
import { useUpload } from "../contexts/UploadContext";
import { useAuth } from "../contexts/AuthContext";

const API = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";

const PAGE_ACCENT  = "#00C48C";   // verde — color de sección Carga de Datos en SIGMC
const ACENTO_GEOSORT = "#7C3AED";
const PINK   = "#D64294";
const NAVY   = "#0B1C49";
const RED    = "#FF4466";
const BLUE   = "#4A90E2";

const TIPOS = {
  beetrak: { label: "Beetrack", color: "#00E5C3", desc: "Archivo de seguimiento",  icon: "↗" },
  pfa:     { label: "PFA",      color: "#FF6B35", desc: "Archivo(s) de proceso",   icon: "≣" },
};

// ─── Helpers visuales ────────────────────────────────────────────────────────
const eyebrow = {
  fontFamily: "var(--font-head)",
  fontSize: 10, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.12em",
  color: "var(--text3)",
};

const cardBase = {
  background: "var(--bg2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  position: "relative",
  overflow: "hidden",
};

const sectionLabel = (text, hint) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "8px 4px 14px" }}>
    <span style={eyebrow}>{text}</span>
    {hint && <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 300 }}>{hint}</span>}
    <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 8 }} />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// FileZone — Beetrack single file
// ─────────────────────────────────────────────────────────────────────────────
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
      style={{
        "--accent": cfg.color,
        borderColor: drag ? cfg.color : undefined,
        background: drag ? `${cfg.color}0d` : undefined,
        cursor: activo ? "default" : "pointer",
      }}
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
        <span className="tipo-badge" style={{
          background: cfg.color + "1f",
          color: cfg.color,
          borderColor: cfg.color + "44",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>{cfg.icon}</span>
          {cfg.label}
        </span>
        <span className="tipo-desc">{cfg.desc}</span>
      </div>
      <div className="zone-body">
        {estadoIcon}
        <p className="zone-status">{estadoLabel}</p>
        {file && estado === "idle" && (
          <p className="zone-size">
            {(file.size / 1024).toFixed(1)} KB · {file.name.split(".").pop().toUpperCase()}
          </p>
        )}
      </div>
      {estado === "idle" && !file && <p className="zone-hint">xlsx · xls · csv</p>}
    </div>
  );
}

const PFA_COLOR = TIPOS.pfa.color;

// ─────────────────────────────────────────────────────────────────────────────
// PFAMultiZone — múltiples archivos
// ─────────────────────────────────────────────────────────────────────────────
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

  const totalKb = archivos.reduce((a, f) => a + f.size, 0) / 1024;

  return (
    <div
      className={`file-zone ${drag ? "drag-over" : ""} idle`}
      style={{
        "--accent": PFA_COLOR,
        minHeight: 120,
        borderColor: drag ? PFA_COLOR : undefined,
        background: drag ? `${PFA_COLOR}0d` : undefined,
      }}
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
        <span className="tipo-badge" style={{
          background: PFA_COLOR + "1f",
          color: PFA_COLOR,
          borderColor: PFA_COLOR + "44",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>{TIPOS.pfa.icon}</span>
          PFA
        </span>
        <span className="tipo-desc">{TIPOS.pfa.desc}</span>
        {!procesando && (
          <button
            onClick={(e) => { e.stopPropagation(); inputRef.current.click(); }}
            style={{
              marginLeft: "auto",
              background: PFA_COLOR + "1f",
              color: PFA_COLOR,
              border: `1px solid ${PFA_COLOR}44`,
              borderRadius: 6,
              padding: "2px 12px",
              cursor: "pointer",
              fontSize: 16, lineHeight: 1, fontWeight: 700,
              transition: "background 0.12s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = PFA_COLOR + "33"}
            onMouseLeave={e => e.currentTarget.style.background = PFA_COLOR + "1f"}
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
        <div style={{ padding: "6px 14px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {archivos.map((f, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8, fontSize: 12,
              padding: "5px 8px", borderRadius: 6,
              background: "var(--bg)",
            }}>
              {procesando && estado !== "listo"
                ? <span className="spinner" style={{ width: 10, height: 10 }} />
                : <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: PFA_COLOR, flexShrink: 0,
                  }} />
              }
              <span style={{
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 11.5,
              }}>
                {f.name}
              </span>
              <span style={{ color: "var(--text3)", flexShrink: 0, fontSize: 11 }}>
                {(f.size / 1024).toFixed(0)} KB
              </span>
              {!procesando && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemover(i); }}
                  style={{
                    background: "none", border: "none",
                    color: "var(--text3)", cursor: "pointer",
                    padding: "0 4px", fontSize: 13,
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = RED}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text3)"}
                  title="Quitar"
                >✕</button>
              )}
            </div>
          ))}
          <div style={{
            marginTop: 4, fontSize: 11, color: "var(--text3)",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>
              {archivos.length} archivo{archivos.length > 1 ? "s" : ""} seleccionado{archivos.length > 1 ? "s" : ""}
            </span>
            <span style={{ fontWeight: 600, color: "var(--text2)" }}>
              {totalKb.toFixed(0)} KB total
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatsCard — con stripe accent + eyebrow + grid limpia
// ─────────────────────────────────────────────────────────────────────────────
function StatsCard({ stats, tipo }) {
  if (!stats) return null;
  const cfg = TIPOS[tipo];
  const esPfa = tipo === "pfa";

  const items = esPfa ? [
    { val: stats.filas_originales,            key: "originales" },
    { val: stats.filas_finanzas,              key: "pfa_finanzas" },
    { val: stats.filas_limpias,               key: "pfa_limpia" },
    { val: stats.duplicados_eliminados,       key: "duplicados eliminados" },
    stats.stats?.min_picking_promedio != null && {
      val: stats.stats.min_picking_promedio, suffix: " min", key: "picking promedio" },
    stats.stats?.dobles_pedidos != null && {
      val: stats.stats.dobles_pedidos,        key: "dobles pedidos" },
  ].filter(Boolean) : [
    { val: stats.filas_originales,            key: "originales" },
    { val: stats.columnas_eliminadas,         key: "cols. eliminadas" },
    stats.stats?.ordenes_unicas && {
      val: stats.stats.ordenes_unicas,        key: "órdenes únicas" },
  ].filter(Boolean);

  return (
    <div style={{ ...cardBase, padding: "20px 22px 18px", "--accent": cfg.color }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: cfg.color }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 12px", borderRadius: 99,
          background: cfg.color + "1f", color: cfg.color, border: `1px solid ${cfg.color}44`,
          fontFamily: "var(--font-head)", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          <span>{cfg.icon}</span>
          {cfg.label}
        </span>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>
          {esPfa
            ? `${stats.filas_originales?.toLocaleString()} originales`
            : `${stats.filas_limpias?.toLocaleString()} filas limpias`}
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
        gap: 12,
        marginBottom: 14,
      }}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: "flex", flexDirection: "column", gap: 2,
            padding: "10px 12px",
            background: "var(--bg)",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}>
            <span style={{
              fontFamily: "var(--font-head)", fontSize: 20, fontWeight: 800,
              color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1,
            }}>
              {typeof it.val === "number" ? it.val.toLocaleString("es-CL") : it.val}
              {it.suffix && <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: 2 }}>{it.suffix}</span>}
            </span>
            <span style={{
              fontSize: 10, color: "var(--text3)",
              textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
            }}>{it.key}</span>
          </div>
        ))}
      </div>

      <p style={{
        fontSize: 10.5, color: "var(--text3)",
        fontFamily: "var(--font-mono)",
        display: "flex", alignItems: "center", gap: 6,
        flexWrap: "wrap",
      }}>
        <span style={{ color: cfg.color, fontWeight: 700 }}>→</span>
        {esPfa
          ? <>{stats.archivo_finanzas} <span style={{ color: "var(--border2)" }}>·</span> {stats.archivo_limpio}</>
          : stats.archivo_limpio}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JoinCard — con stripe gradiente + % match destacado
// ─────────────────────────────────────────────────────────────────────────────
function JoinCard({ joinData }) {
  if (!joinData) return null;

  const pct = joinData.pct_match ?? 0;
  const pctColor = pct >= 90 ? "var(--green)" : pct >= 70 ? "var(--orange)" : RED;

  return (
    <div style={{
      ...cardBase, padding: "22px 22px 20px",
      marginTop: 14,
      background: `linear-gradient(180deg, ${BLUE}06 0%, var(--bg2) 60%)`,
    }}>
      <div style={{
        position: "absolute", inset: "0 0 auto 0", height: 2,
        background: `linear-gradient(90deg, ${TIPOS.beetrak.color}, ${TIPOS.pfa.color})`,
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: BLUE + "14", color: BLUE,
          fontSize: 18, fontWeight: 700,
        }}>⟷</span>
        <div style={{ flex: 1 }}>
          <p style={{
            fontFamily: "var(--font-head)", fontSize: 14, fontWeight: 700,
            color: "var(--text)", margin: 0, letterSpacing: "-0.01em",
          }}>
            JOIN Beetrack ↔ PFA
          </p>
          <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0", fontWeight: 300 }}>
            Cruce por orden ↔ shipping_group — mide cuántas órdenes están en ambos sistemas
          </p>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 12,
      }}>
        <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 20, fontWeight: 800, color: TIPOS.beetrak.color, letterSpacing: "-0.02em" }}>
            {joinData.filas_beetrak?.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            beetrack
          </div>
        </div>
        <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 20, fontWeight: 800, color: TIPOS.pfa.color, letterSpacing: "-0.02em" }}>
            {joinData.filas_pfa?.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            pfa
          </div>
        </div>
        <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>
            {joinData.filas_con_match?.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            con match
          </div>
        </div>
        <div style={{
          padding: "12px 14px",
          background: pctColor + "10",
          borderRadius: 8, border: `1px solid ${pctColor}33`,
        }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 24, fontWeight: 800, color: pctColor, letterSpacing: "-0.02em" }}>
            {pct}%
          </div>
          <div style={{ fontSize: 10, color: pctColor, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
            coincidencia
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LogPanel
// ─────────────────────────────────────────────────────────────────────────────
function LogPanel({ logs }) {
  const dotColor = (tipo) => tipo === "success" ? "var(--green)" : tipo === "error" ? RED : "var(--text3)";

  return (
    <div className="log-panel" style={{ ...cardBase, padding: 0 }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: NAVY }} />
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "14px 18px 10px",
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "var(--green)",
          animation: "pulse 2s ease-in-out infinite",
          flexShrink: 0,
        }} />
        <span style={{ ...eyebrow, fontSize: 10 }}>Log de actividad</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text3)" }}>
          {logs.length} eventos
        </span>
      </div>
      <div style={{
        padding: "8px 14px 14px",
        maxHeight: 360, overflowY: "auto",
        fontFamily: "var(--font-mono)", fontSize: 11.5,
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        {logs.length === 0 && (
          <p style={{ color: "var(--text3)", fontStyle: "italic", padding: "10px 4px" }}>
            Sin actividad aún...
          </p>
        )}
        {logs.map((l, i) => (
          <div key={i} style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            padding: "5px 8px",
            borderRadius: 6,
            background: l.tipo === "error" ? `${RED}08` : l.tipo === "success" ? `var(--green)08` : "transparent",
            color: l.tipo === "error" ? RED : "var(--text2)",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: dotColor(l.tipo),
              marginTop: 5, flexShrink: 0,
            }} />
            <span style={{ color: "var(--text3)", flexShrink: 0, fontSize: 10.5 }}>{l.ts}</span>
            <span style={{ flex: 1, wordBreak: "break-word" }}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GeosortPanel
// ─────────────────────────────────────────────────────────────────────────────
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
        <span className="tipo-badge" style={{
          background: ACENTO_GEOSORT + "1f",
          color: ACENTO_GEOSORT,
          borderColor: ACENTO_GEOSORT + "44",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>◎</span>
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
            <p className="zone-size" style={{ color: "var(--text3)" }}>Se sincroniza una vez por día</p>
          </>
        ) : cargando ? (
          <>
            <span className="spinner" />
            <p className="zone-status">Cargando desde Drive...</p>
          </>
        ) : (
          <>
            <p className="zone-status">Listo para cargar</p>
            <p className="zone-size" style={{ color: "var(--text3)" }}>Solo admin · sincroniza desde Google Drive</p>
          </>
        )}
      </div>
      <button
        onClick={handleCargar}
        disabled={bloqueado || cargando}
        style={{
          margin: "0 14px 14px",
          padding: "8px 0",
          width: "calc(100% - 28px)",
          background: bloqueado || cargando ? "transparent" : ACENTO_GEOSORT + "1f",
          color: bloqueado || cargando ? "var(--text3)" : ACENTO_GEOSORT,
          border: `1px solid ${bloqueado || cargando ? "var(--border)" : ACENTO_GEOSORT + "44"}`,
          borderRadius: 8,
          cursor: bloqueado || cargando ? "not-allowed" : "pointer",
          fontSize: 12, fontWeight: 600,
          fontFamily: "var(--font-body)",
          transition: "background 0.12s",
        }}
        onMouseEnter={e => { if (!bloqueado && !cargando) e.currentTarget.style.background = ACENTO_GEOSORT + "33"; }}
        onMouseLeave={e => { if (!bloqueado && !cargando) e.currentTarget.style.background = ACENTO_GEOSORT + "1f"; }}
      >
        {cargando ? "Cargando..." : bloqueado ? "✓ Ya cargado hoy" : "Cargar datos"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Historial modal
// ─────────────────────────────────────────────────────────────────────────────
const TIPO_COLOR = {
  beetrak:      { color: "#00C48C", bg: "rgba(0,196,140,0.12)"   },
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

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(11,28,73,0.22)",
        backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{
        background: "var(--bg2)",
        border: "1px solid var(--border2)",
        borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        width: "100%", maxWidth: 720, maxHeight: "82vh",
        display: "flex", flexDirection: "column",
        position: "relative", overflow: "hidden",
        animation: "slideUp 0.2s ease-out",
      }}>
        <div style={{ position: "absolute", inset: "0 0 auto 0", height: 3, background: "var(--gradient)" }} />

        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "20px 24px 14px",
          borderBottom: "1px solid var(--border)",
        }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: PINK + "14", color: PINK,
            fontSize: 16, fontWeight: 700,
          }}>≣</span>
          <div style={{ flex: 1 }}>
            <p style={{
              fontFamily: "var(--font-head)", fontSize: 15, fontWeight: 700,
              color: "var(--text)", margin: 0, letterSpacing: "-0.01em",
            }}>Historial de cargas</p>
            <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0", fontWeight: 300 }}>
              Todas las cargas Beetrack, PFA y Geosort procesadas
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: "var(--bg)", border: "1px solid var(--border)",
              color: "var(--text2)", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 500,
              transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${RED}10`; e.currentTarget.style.color = RED; e.currentTarget.style.borderColor = `${RED}40`; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.color = "var(--text2)"; e.currentTarget.style.borderColor = "var(--border)"; }}
            title="Cerrar (Esc)"
          >✕</button>
        </div>

        <div style={{ padding: "14px 24px 22px", overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "30px 0", color: "var(--text3)", fontSize: 13, justifyContent: "center" }}>
              <span className="spinner" style={{
                width: 16, height: 16, border: "2px solid var(--border)", borderTopColor: PINK,
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
              }} />
              Cargando historial...
            </div>
          )}
          {!loading && items?.length === 0 && (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ fontSize: 32, color: "var(--text3)", marginBottom: 8 }}>◌</div>
              <p style={{ fontSize: 13, color: "var(--text2)", fontWeight: 500 }}>
                Sin cargas registradas aún
              </p>
            </div>
          )}
          {!loading && items?.length > 0 && (
            <table className="hist-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...eyebrow, fontSize: 10, padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Fecha</th>
                  <th style={{ ...eyebrow, fontSize: 10, padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Tipo</th>
                  <th style={{ ...eyebrow, fontSize: 10, padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Archivo</th>
                  <th style={{ ...eyebrow, fontSize: 10, padding: "10px 12px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>Filas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => {
                  const c = TIPO_COLOR[row.tipo] || { color: "var(--text2)", bg: "var(--bg3)" };
                  return (
                    <tr key={i} style={{ transition: "background 0.12s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(214,66,148,0.04)"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={{ color: "var(--text3)", fontFamily: "var(--font-mono)", fontSize: 11, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                        {row.cargado_en}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                        <span style={{
                          display: "inline-block",
                          color: c.color, background: c.bg,
                          border: `1px solid ${c.color}44`,
                          padding: "2px 10px", borderRadius: 99,
                          fontSize: 10.5, fontWeight: 700,
                          letterSpacing: "0.04em", textTransform: "uppercase",
                        }}>
                          {row.tipo === "beetrak" ? "beetrack" : row.tipo}
                        </span>
                      </td>
                      <td style={{
                        maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        padding: "10px 12px", borderBottom: "1px solid var(--border)",
                        fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text)",
                      }}>
                        {row.archivo}
                      </td>
                      <td style={{
                        textAlign: "right", padding: "10px 12px", borderBottom: "1px solid var(--border)",
                        fontFamily: "var(--font-head)", fontWeight: 700, color: "var(--text)",
                      }}>
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
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center",
          padding: "10px 16px",
          background: "var(--bg2)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = PINK;
          e.currentTarget.style.color = PINK;
          e.currentTarget.style.background = `${PINK}06`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.color = "var(--text)";
          e.currentTarget.style.background = "var(--bg2)";
        }}
      >
        <span style={{
          width: 6, height: 6,
          background: BLUE, borderRadius: "50%",
          display: "inline-block",
        }} />
        Historial de archivos
      </button>
      {open && <HistorialModal onClose={() => setOpen(false)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Master — página principal
// ─────────────────────────────────────────────────────────────────────────────
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
  const haySeleccion = archivoBeetrak !== null || archivosPfa.length > 0;
  const totalSeleccionados = (archivoBeetrak ? 1 : 0) + archivosPfa.length;

  return (
    <div className="page">
      <div className="master-layout">

        <section className="upload-section">

          {/* Page header */}
          <div className="page-header" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <h2 className="page-title" style={{ "--accent": PAGE_ACCENT }}>Carga de Datos</h2>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 11, padding: "4px 10px", borderRadius: 99,
                background: `${PAGE_ACCENT}14`, color: PAGE_ACCENT,
                fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
              }}>Pipeline diario</span>
              {haySeleccion && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 11, padding: "4px 10px", borderRadius: 99,
                  background: `${PINK}14`, color: PINK,
                  fontWeight: 600,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: PINK }} />
                  {totalSeleccionados} archivo{totalSeleccionados !== 1 ? "s" : ""} listo{totalSeleccionados !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {sectionLabel("Archivos", "arrastra o haz clic en cada zona — xlsx · xls · csv")}

          <div className="zones-grid" style={{ alignItems: "start" }}>
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
            <div style={{
              marginTop: 14,
              padding: "12px 16px",
              background: `linear-gradient(90deg, ${TIPOS.beetrak.color}10, ${TIPOS.pfa.color}10)`,
              border: `1px solid ${BLUE}33`,
              borderRadius: 10,
              display: "flex", alignItems: "center", gap: 10,
              fontSize: 12.5, color: "var(--text2)",
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: "50%",
                background: BLUE + "14", color: BLUE,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, flexShrink: 0,
              }}>⟷</span>
              <span>
                <strong style={{ color: "var(--text)", fontWeight: 600 }}>Ambos archivos cargados</strong>
                {" — "}
                al procesar se hará automáticamente el <strong style={{ color: "var(--text)", fontWeight: 600 }}>JOIN por orden ↔ shipping_group</strong>.
              </span>
            </div>
          )}

          {/* Acciones */}
          <div className="actions" style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={procesarTodo} disabled={!puedeProcessar || hayPendientes}>
              {hayPendientes ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className="spinner" style={{
                    width: 12, height: 12,
                    border: "2px solid rgba(255,255,255,0.45)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                    display: "inline-block",
                  }} />
                  Procesando...
                </span>
              ) : "Limpiar y procesar"}
            </button>
            <button className="btn-ghost" onClick={reset} disabled={hayPendientes}>
              ↺ Reiniciar
            </button>
          </div>

          {/* Resultados */}
          {(uploads.beetrak.stats || statsParaMostrarPfa) && (
            <div className="stats-section">
              {sectionLabel("Resultado", "filas procesadas, duplicados removidos y archivos generados")}
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

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
