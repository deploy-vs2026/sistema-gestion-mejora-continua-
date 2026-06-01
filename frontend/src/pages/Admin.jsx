import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { VISTAS } from "../permisos";

const API   = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const ROLES = ["admin", "master", "finanzas", "mejora", "operaciones"];

const LOCAL_PREFIJOS_DEFAULT = {
  "41":  ["LTVS", "DRVS", "LTTH", "DRTH"],
  "42":  ["LTVS", "DRVS"],
  "45":  ["HDVS"],
  "54":  ["LTVS", "DRVS"],
  "58":  ["HDVS"],
  "71":  ["LTVS", "DRVS"],
  "75":  ["LTVS", "DRVS"],
  "76":  ["LTVS", "DRVS"],
  "88":  ["LTVS", "DRVS", "LTBM", "DRBM", "UBER"],
  "94":  ["LTVS", "DRVS", "HDVS"],
  "95":  ["HDVS"],
  "98":  ["LTVS", "DRVS", "HDVS"],
  "99":  ["LTVS", "DRVS", "HDVS"],
  "120": ["LTVS", "DRVS", "HDVS"],
  "121": ["LTVS", "DRVS", "HDVS", "LTZB", "DRZB"],
  "143": ["LTVS", "DRVS"],
  "144": ["LTVS", "DRVS"],
  "146": ["LTVS", "DRVS"],
  "182": ["LTVS", "DRVS"],
  "276": ["LTVS", "DRVS"],
  "518": ["LTVS", "DRVS", "LTGP", "DRGP"],
  "608": ["LTVS", "DRVS", "HDVS"],
  "611": ["LTVS", "DRVS"],
  "618": ["LTVS", "DRVS", "HDVS"],
  "627": ["LTVS", "DRVS"],
  "647": ["LTVS", "DRVS"],
  "655": ["LTVS", "DRVS"],
  "657": ["LTVS", "DRVS", "HDVS"],
  "658": ["LTVS", "DRVS"],
  "693": ["LTVS", "DRVS"],
  "697": ["LTVS", "DRVS"],
  "929": ["LTVS", "DRVS"],
  "952": ["LTVS", "DRVS"],
};

const ACENTO = "#0B1C49";   // navy
const PINK   = "#D64294";
const GREEN  = "#00C48C";
const ORANGE = "#FF6B35";
const RED    = "#FF4466";

const ROLE_COLOR = {
  admin:       PINK,
  master:      ACENTO,
  finanzas:    "#7C3AED",
  mejora:      "#9F4F69",
  operaciones: "#F59E0B",
};

// ─── Estilos compartidos ────────────────────────────────────────────────────
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

const sectionTitle = (icon, color, title, hint) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
    {icon && (
      <span style={{
        width: 32, height: 32, borderRadius: 10,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: `${color}14`, color, fontSize: 16, fontWeight: 700,
      }}>{icon}</span>
    )}
    <div>
      <p style={{
        fontFamily: "var(--font-head)", fontSize: 14, fontWeight: 700,
        color: "var(--text)", margin: 0, letterSpacing: "-0.01em",
      }}>{title}</p>
      {hint && (
        <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0", fontWeight: 300 }}>{hint}</p>
      )}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   Locales y prefijos válidos
═══════════════════════════════════════════════════════════════════════════ */
function configToLocalesRows(config) {
  return Object.entries(config)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([local, prefijos]) => ({
      id:      `${local}__${Date.now() * Math.random()}`,
      local,
      prefijos: prefijos.join(", "),
    }));
}

function rowsToLocalesConfig(rows) {
  const out = {};
  rows.forEach(r => {
    const local = r.local.trim();
    if (!local) return;
    const prefijos = r.prefijos
      .split(",")
      .map(p => p.trim().toUpperCase())
      .filter(Boolean);
    if (prefijos.length) out[local] = prefijos;
  });
  return out;
}

function LocalesPrefijosSection({ flash }) {
  const [rows,      setRows]      = useState(null);
  const [editado,   setEditado]   = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [abierto,      setAbierto]      = useState(false);
  const [confirmarId,  setConfirmarId]  = useState(null);

  const cargarConfig = () => {
    fetch(`${API}/configuracion/locales`)
      .then(r => r.json())
      .then(d  => { setRows(configToLocalesRows(d)); setEditado(false); })
      .catch(() => { setRows(configToLocalesRows(LOCAL_PREFIJOS_DEFAULT)); setEditado(false); });
  };

  useEffect(cargarConfig, []);

  const editLocal = (id, val) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, local: val } : r));
    setEditado(true);
  };

  const editPrefijos = (id, val) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, prefijos: val } : r));
    setEditado(true);
  };

  const eliminar = (id) => setConfirmarId(id);

  const confirmarEliminar = () => {
    setRows(prev => prev.filter(r => r.id !== confirmarId));
    setEditado(true);
    setConfirmarId(null);
  };

  const agregar = () => {
    setRows(prev => [...prev, { id: `new_${Date.now()}`, local: "", prefijos: "" }]);
    setEditado(true);
  };

  const restaurar = () => {
    setRows(configToLocalesRows(LOCAL_PREFIJOS_DEFAULT));
    setEditado(true);
  };

  const localesActivos = rows?.map(r => r.local.trim()).filter(Boolean) ?? [];
  const dupLocal  = localesActivos.length !== new Set(localesActivos).size;
  const hayVacios = rows?.some(r => r.local.trim() && !r.prefijos.trim()) ?? false;
  const hayError  = dupLocal || hayVacios;

  const guardar = async () => {
    if (hayError) return;
    setGuardando(true);
    try {
      const res = await fetch(`${API}/configuracion/locales`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(rowsToLocalesConfig(rows)),
      });
      if (!res.ok) throw new Error("Error al guardar");
      flash("Locales guardados");
      setEditado(false);
      cargarConfig();
    } catch (e) {
      flash(e.message, false);
    } finally {
      setGuardando(false);
    }
  };

  if (!rows) return (
    <div style={{ ...cardBase, padding: "18px 20px" }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: PINK }} />
      {sectionTitle("◫", PINK, "Locales válidos (Beetrak)", "cargando configuración...")}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", color: "var(--text3)", fontSize: 13 }}>
        <span className="spinner" style={{
          width: 16, height: 16, border: "2px solid var(--border)", borderTopColor: PINK,
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
        }} />
        Cargando...
      </div>
    </div>
  );

  const localPendiente = rows?.find(r => r.id === confirmarId);

  return (
    <div style={{ ...cardBase, padding: "18px 20px" }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: PINK }} />

      {confirmarId && (
        <div
          onClick={() => setConfirmarId(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(11,28,73,0.22)",
            backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--bg2)", border: "1px solid var(--border2)",
              borderRadius: 16, padding: 0, minWidth: 360, maxWidth: 440,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              position: "relative", overflow: "hidden",
              animation: "slideUp 0.18s ease-out",
            }}
          >
            <div style={{ position: "absolute", inset: "0 0 auto 0", height: 3, background: RED }} />
            <div style={{ padding: "28px 28px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 10,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: `${RED}14`, color: RED, fontSize: 18, fontWeight: 700,
                }}>⚠</span>
                <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-head)", letterSpacing: "-0.01em" }}>
                  ¿Eliminar este local?
                </p>
              </div>
              <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12, lineHeight: 1.55 }}>
                Vas a eliminar el local{" "}
                <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{localPendiente?.local}</strong>{" "}
                con los siguientes prefijos:
              </p>
              <p style={{
                fontSize: 12, color: "var(--text2)",
                marginBottom: 18, padding: "8px 12px",
                background: "var(--bg3)", borderRadius: 8,
                fontFamily: "var(--font-mono)",
                border: "1px solid var(--border)",
              }}>
                {localPendiente?.prefijos}
              </p>
              <p style={{ fontSize: 11, color: "var(--text3)", marginBottom: 22, lineHeight: 1.5 }}>
                Los cambios no se aplican hasta que presiones <strong style={{ color: "var(--text2)", fontWeight: 600 }}>Guardar</strong>.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn-ghost" onClick={() => setConfirmarId(null)}>Cancelar</button>
                <button className="btn-del" onClick={confirmarEliminar} style={{ padding: "8px 22px", fontSize: 13 }}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header colapsable */}
      <div
        onClick={() => setAbierto(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          cursor: "pointer", userSelect: "none",
          marginBottom: abierto ? 14 : 0,
        }}
      >
        <span style={{
          width: 32, height: 32, borderRadius: 10,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: `${PINK}14`, color: PINK, fontSize: 16, fontWeight: 700,
        }}>◫</span>
        <div style={{ flex: 1 }}>
          <p style={{
            fontFamily: "var(--font-head)", fontSize: 14, fontWeight: 700,
            color: "var(--text)", margin: 0, letterSpacing: "-0.01em",
          }}>Locales válidos (Beetrak)</p>
          <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0", fontWeight: 300 }}>
            {rows.length} locales configurados — filtran qué se procesa al subir Beetrak
          </p>
        </div>
        {editado && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11, padding: "4px 10px", borderRadius: 99,
            background: `${ORANGE}14`, color: ORANGE,
            fontWeight: 600,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: ORANGE }} />
            Sin guardar
          </span>
        )}
        <span style={{
          fontSize: 12, color: "var(--text3)",
          transition: "transform 0.2s",
          transform: abierto ? "rotate(90deg)" : "rotate(0deg)",
          display: "inline-block",
        }}>▶</span>
      </div>

      {abierto && <>
        <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12, lineHeight: 1.55 }}>
          Al subir un archivo Beetrak, solo se procesan filas cuyo <strong style={{ color: "var(--text)", fontWeight: 600 }}>LOCAL</strong> esté en esta lista
          y cuyo <strong style={{ color: "var(--text)", fontWeight: 600 }}>Identificador</strong> empiece con uno de los prefijos permitidos.
        </p>

        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowY: "auto", maxHeight: 420 }}>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Local</th>
                  <th>
                    Prefijos válidos{" "}
                    <span style={{ fontWeight: 400, fontSize: 10, color: "var(--text3)" }}>
                      (separados por coma)
                    </span>
                  </th>
                  <th style={{ width: 44 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const localDup = dupLocal && localesActivos.filter(l => l === r.local.trim()).length > 1;
                  const sinPref  = r.local.trim() && !r.prefijos.trim();
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "5px 8px" }}>
                        <input
                          className="input-text"
                          style={{
                            width: "100%", fontSize: 12, padding: "5px 9px",
                            fontFamily: "var(--font-mono)",
                            borderColor: localDup ? RED : undefined,
                            background: localDup ? `${RED}08` : undefined,
                          }}
                          value={r.local}
                          placeholder="Ej: 41"
                          onChange={e => editLocal(r.id, e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        <input
                          className="input-text"
                          style={{
                            width: "100%", fontSize: 12, padding: "5px 9px",
                            fontFamily: "var(--font-mono)",
                            borderColor: sinPref ? RED : undefined,
                            background: sinPref ? `${RED}08` : undefined,
                          }}
                          value={r.prefijos}
                          placeholder="Ej: LTVS, DRVS, LTTH"
                          onChange={e => editPrefijos(r.id, e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "5px 6px", textAlign: "center" }}>
                        <button
                          onClick={() => eliminar(r.id)}
                          title="Eliminar local"
                          style={{
                            width: 26, height: 26, borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "var(--bg2)",
                            color: "var(--text3)",
                            cursor: "pointer",
                            fontSize: 13,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.12s",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = RED;
                            e.currentTarget.style.color = RED;
                            e.currentTarget.style.background = `${RED}08`;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = "var(--border)";
                            e.currentTarget.style.color = "var(--text3)";
                            e.currentTarget.style.background = "var(--bg2)";
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {(dupLocal || hayVacios) && (
          <div style={{
            marginTop: 10,
            padding: "8px 12px",
            background: `${RED}0d`,
            border: `1px solid ${RED}33`,
            borderRadius: 8,
            fontSize: 12, color: RED, fontWeight: 500,
          }}>
            {dupLocal  && <div>⚠ Hay locales duplicados.</div>}
            {hayVacios && <div>⚠ Hay locales sin prefijos definidos.</div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn-add" onClick={guardar} disabled={!editado || guardando || hayError}>
            {guardando ? "Guardando..." : `Guardar (${rows.length} locales)`}
          </button>
          <button className="btn-ghost" onClick={agregar}>+ Agregar local</button>
          <button className="btn-ghost" onClick={restaurar} style={{ marginLeft: "auto" }}>
            ↺ Restaurar defaults
          </button>
        </div>
      </>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Pestañas por rol (rol → vistas permitidas)
═══════════════════════════════════════════════════════════════════════════ */
function PermisosSection({ flash }) {
  const { reloadPermisos } = useAuth();
  const [matrix,    setMatrix]    = useState(null);
  const [editado,   setEditado]   = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [abierto,   setAbierto]   = useState(false);

  const cargar = () => {
    fetch(`${API}/configuracion/permisos`)
      .then(r => r.json())
      .then(d => { setMatrix(d && typeof d === "object" ? d : {}); setEditado(false); })
      .catch(() => { setMatrix({}); setEditado(false); });
  };

  useEffect(cargar, []);

  // El rol admin siempre debe conservar acceso al panel admin (anti-bloqueo)
  const bloqueado = (rol, view) => rol === "admin" && view === "admin";

  const tiene = (rol, view) => (matrix?.[rol] ?? []).includes(view);

  const toggle = (rol, view) => {
    if (bloqueado(rol, view)) return;
    setMatrix(prev => {
      const actual = new Set(prev?.[rol] ?? []);
      if (actual.has(view)) actual.delete(view);
      else                  actual.add(view);
      // mantener el orden de VISTAS
      const ordenadas = VISTAS.filter(v => actual.has(v.view)).map(v => v.view);
      return { ...prev, [rol]: ordenadas };
    });
    setEditado(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      // Garantizar admin→admin antes de enviar
      const payload = { ...matrix };
      ROLES.forEach(r => { if (!payload[r]) payload[r] = []; });
      if (!payload.admin.includes("admin")) payload.admin = [...payload.admin, "admin"];

      const res = await fetch(`${API}/configuracion/permisos`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al guardar");
      flash("Permisos guardados");
      setEditado(false);
      reloadPermisos();   // refresca el sidebar/rutas en vivo
      cargar();
    } catch (e) {
      flash(e.message, false);
    } finally {
      setGuardando(false);
    }
  };

  if (!matrix) return (
    <div style={{ ...cardBase, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: ORANGE }} />
      {sectionTitle("⊞", ORANGE, "Pestañas por rol", "cargando configuración...")}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", color: "var(--text3)", fontSize: 13 }}>
        <span className="spinner" style={{
          width: 16, height: 16, border: "2px solid var(--border)", borderTopColor: ORANGE,
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
        }} />
        Cargando...
      </div>
    </div>
  );

  return (
    <div style={{ ...cardBase, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: ORANGE }} />

      {/* Header colapsable */}
      <div
        onClick={() => setAbierto(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          cursor: "pointer", userSelect: "none",
          marginBottom: abierto ? 14 : 0,
        }}
      >
        <span style={{
          width: 32, height: 32, borderRadius: 10,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: `${ORANGE}14`, color: ORANGE, fontSize: 16, fontWeight: 700,
        }}>⊞</span>
        <div style={{ flex: 1 }}>
          <p style={{
            fontFamily: "var(--font-head)", fontSize: 14, fontWeight: 700,
            color: "var(--text)", margin: 0, letterSpacing: "-0.01em",
          }}>Pestañas por rol</p>
          <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0", fontWeight: 300 }}>
            Marca qué vistas puede ver cada rol — afecta el menú y el acceso a las rutas
          </p>
        </div>
        {editado && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11, padding: "4px 10px", borderRadius: 99,
            background: `${ORANGE}14`, color: ORANGE, fontWeight: 600,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: ORANGE }} />
            Sin guardar
          </span>
        )}
        <span style={{
          fontSize: 12, color: "var(--text3)",
          transition: "transform 0.2s",
          transform: abierto ? "rotate(90deg)" : "rotate(0deg)",
          display: "inline-block",
        }}>▶</span>
      </div>

      {abierto && <>
        <div className="table-scroll" style={{ border: "1px solid var(--border)", borderRadius: 10 }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)" }}>Rol</th>
                {VISTAS.map(v => (
                  <th key={v.view} style={{ textAlign: "center" }}>{v.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map(rol => (
                <tr key={rol}>
                  <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg2)" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      fontSize: 11, padding: "3px 9px", borderRadius: 99,
                      background: `${ROLE_COLOR[rol] || ACENTO}14`, color: ROLE_COLOR[rol] || ACENTO,
                      fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: ROLE_COLOR[rol] || ACENTO }} />
                      {rol}
                    </span>
                  </td>
                  {VISTAS.map(v => {
                    const checked = tiene(rol, v.view);
                    const locked  = bloqueado(rol, v.view);
                    return (
                      <td key={v.view} style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          title={locked ? "El admin siempre conserva acceso al panel admin" : `${checked ? "Quitar" : "Dar"} acceso a "${v.label}"`}
                          onChange={() => toggle(rol, v.view)}
                          style={{
                            width: 16, height: 16,
                            cursor: locked ? "not-allowed" : "pointer",
                            accentColor: ROLE_COLOR[rol] || ACENTO,
                            opacity: locked ? 0.55 : 1,
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <button className="btn-add" onClick={guardar} disabled={!editado || guardando}>
            {guardando ? "Guardando..." : "Guardar permisos"}
          </button>
          <button className="btn-ghost" onClick={cargar} disabled={guardando}>
            ↺ Descartar cambios
          </button>
        </div>
      </>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Toast (flash messages)
═══════════════════════════════════════════════════════════════════════════ */
function Toast({ msg }) {
  if (!msg) return null;
  const ok = msg.ok;
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 2000,
      background: "var(--text)", color: "#fff",
      borderRadius: 10, padding: "12px 18px 12px 16px",
      fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500,
      boxShadow: "0 12px 32px rgba(11,28,73,0.20)",
      borderLeft: `4px solid ${ok ? GREEN : RED}`,
      display: "flex", alignItems: "center", gap: 10,
      animation: "slideInRight 0.22s ease-out",
      maxWidth: 360,
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: "50%",
        background: ok ? `${GREEN}33` : `${RED}33`,
        color: ok ? GREEN : RED,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700,
      }}>{ok ? "✓" : "✕"}</span>
      {msg.text}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Admin page
═══════════════════════════════════════════════════════════════════════════ */
export default function Admin() {
  const [usuarios, setUsuarios] = useState({});
  const [usuariosAbierto, setUsuariosAbierto] = useState(true);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [correo,   setCorreo]   = useState("");
  const [rol,      setRol]      = useState("master");
  const [msg,      setMsg]      = useState(null);

  const cargar = () => {
    setLoading(true);
    fetch(`${API}/usuarios`)
      .then(r => r.json())
      .then(d => { setUsuarios(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(cargar, []);

  const flash = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };

  const agregar = async () => {
    if (!correo.trim()) return;
    try {
      const res = await fetch(`${API}/usuarios`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ correo: correo.trim(), rol }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setCorreo("");
      cargar();
      flash("Usuario guardado");
    } catch (e) {
      flash(e.message, false);
    }
  };

  const cambiarRol = async (email, nuevoRol) => {
    try {
      await fetch(`${API}/usuarios`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ correo: email, rol: nuevoRol }),
      });
      cargar();
    } catch (e) {
      flash(e.message, false);
    }
  };

  const eliminar = async (email) => {
    if (!confirm(`¿Eliminar a ${email}?`)) return;
    try {
      await fetch(`${API}/usuarios/${encodeURIComponent(email)}`, { method: "DELETE" });
      cargar();
      flash("Usuario eliminado");
    } catch (e) {
      flash(e.message, false);
    }
  };

  const totalUsuarios = Object.keys(usuarios).length;
  const porRol = ROLES.reduce((acc, r) => {
    acc[r] = Object.values(usuarios).filter(v => v === r).length;
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-content">

        {/* Header */}
        <div className="page-header" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <h2 className="page-title" style={{ "--accent": ACENTO }}>Panel Admin</h2>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 11, padding: "4px 10px", borderRadius: 99,
              background: `${ACENTO}10`, color: ACENTO,
              fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
            }}>Solo administradores</span>
          </div>
        </div>

        <p style={{
          fontSize: 13, color: "var(--text2)", margin: "0 0 24px",
          maxWidth: 720, lineHeight: 1.55, fontWeight: 300,
        }}>
          Gestión de <strong style={{ color: "var(--text)", fontWeight: 600 }}>accesos y configuración</strong> del sistema. Administra qué cuentas pueden entrar y con qué rol, y define los locales válidos del pipeline Beetrak.
        </p>

        {/* Mini-resumen de usuarios por rol */}
        {!loading && !error && (
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            <div style={{
              ...cardBase, padding: "14px 18px",
              flex: 1, minWidth: 130,
              display: "flex", flexDirection: "column", gap: 2,
            }}>
              <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: ACENTO }} />
              <span style={{ ...eyebrow, fontSize: 9 }}>Total usuarios</span>
              <span style={{
                fontFamily: "var(--font-head)", fontSize: 24, fontWeight: 800,
                color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1,
              }}>
                {totalUsuarios}
              </span>
            </div>
            {ROLES.map(r => (
              <div key={r} style={{
                ...cardBase, padding: "14px 18px",
                flex: 1, minWidth: 110,
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: ROLE_COLOR[r] }} />
                <span style={{ ...eyebrow, fontSize: 9 }}>{r}</span>
                <span style={{
                  fontFamily: "var(--font-head)", fontSize: 22, fontWeight: 800,
                  color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1,
                }}>
                  {porRol[r] ?? 0}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Agregar usuario ── */}
        <div style={{ ...cardBase, overflow: "visible", padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: GREEN }} />
          {sectionTitle("+", GREEN, "Agregar / actualizar usuario", "ingresa un correo @valdishopper.com y asigna su rol")}

          <div className="admin-add-form" style={{
            display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end",
          }}>
            <div className="filter-group">
              <label>Correo</label>
              <input
                className="input-text"
                type="email"
                placeholder="usuario@valdishopper.com"
                value={correo}
                onChange={e => setCorreo(e.target.value)}
                onKeyDown={e => e.key === "Enter" && agregar()}
                style={{ width: 320 }}
              />
            </div>
            <div className="filter-group">
              <label>Rol</label>
              <select className="select-rol input-text" value={rol} onChange={e => setRol(e.target.value)} style={{ minWidth: 160 }}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn-add" onClick={agregar}>
              Guardar
            </button>
          </div>
        </div>

        {/* ── Lista de usuarios (colapsable) ── */}
        <div style={{ ...cardBase, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ position: "absolute", inset: "0 0 auto 0", height: 2, background: ACENTO }} />

          {/* Header colapsable */}
          <div
            onClick={() => setUsuariosAbierto(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              cursor: "pointer", userSelect: "none",
              marginBottom: usuariosAbierto ? 14 : 0,
            }}
          >
            <span style={{
              width: 32, height: 32, borderRadius: 10,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: `${ACENTO}14`, color: ACENTO, fontSize: 16, fontWeight: 700,
            }}>◉</span>
            <div style={{ flex: 1 }}>
              <p style={{
                fontFamily: "var(--font-head)", fontSize: 14, fontWeight: 700,
                color: "var(--text)", margin: 0, letterSpacing: "-0.01em",
              }}>Usuarios autorizados</p>
              <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0", fontWeight: 300 }}>
                {totalUsuarios} {totalUsuarios === 1 ? "usuario" : "usuarios"} — edita el rol desde el selector o elimínalos de la lista
              </p>
            </div>
            {totalUsuarios > 0 && (
              <div style={{ display: "flex", gap: 6 }}>
                {ROLES.filter(r => porRol[r] > 0).map(r => (
                  <span key={r} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 10, padding: "3px 9px", borderRadius: 99,
                    background: `${ROLE_COLOR[r]}14`, color: ROLE_COLOR[r],
                    fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: ROLE_COLOR[r] }} />
                    {r} · {porRol[r]}
                  </span>
                ))}
              </div>
            )}
            <span style={{
              fontSize: 12, color: "var(--text3)",
              transition: "transform 0.2s",
              transform: usuariosAbierto ? "rotate(90deg)" : "rotate(0deg)",
              display: "inline-block",
            }}>▶</span>
          </div>

          {usuariosAbierto && <>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0", color: "var(--text3)", fontSize: 13 }}>
              <span className="spinner" style={{
                width: 16, height: 16, border: "2px solid var(--border)", borderTopColor: ACENTO,
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
              }} />
              Cargando usuarios...
            </div>
          )}
          {error && <p className="table-msg error">{error}</p>}

          {!loading && !error && (
            <>
              <div className="table-scroll" style={{ border: "1px solid var(--border)", borderRadius: 10 }}>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Correo</th>
                      <th style={{ width: 200 }}>Rol</th>
                      <th style={{ width: 120, textAlign: "right" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(usuarios).map(([email, r]) => (
                      <tr key={email}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{
                              width: 28, height: 28, borderRadius: "50%",
                              background: `${ROLE_COLOR[r] || ACENTO}18`,
                              color: ROLE_COLOR[r] || ACENTO,
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              fontFamily: "var(--font-head)", fontSize: 11, fontWeight: 700,
                              flexShrink: 0,
                            }}>
                              {email.charAt(0).toUpperCase()}
                            </span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)" }}>
                              {email}
                            </span>
                          </div>
                        </td>
                        <td>
                          <select
                            className="rol-select"
                            value={r}
                            onChange={e => cambiarRol(email, e.target.value)}
                            style={{
                              fontFamily: "var(--font-body)",
                              fontSize: 12, fontWeight: 600,
                              padding: "5px 28px 5px 12px",
                              borderRadius: 99,
                              border: `1px solid ${ROLE_COLOR[r] || "var(--border)"}55`,
                              background: `${ROLE_COLOR[r] || ACENTO}10`,
                              color: ROLE_COLOR[r] || "var(--text)",
                              cursor: "pointer",
                              appearance: "none",
                              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='%237A869E' d='M5 6L0 0h10z'/></svg>\")",
                              backgroundRepeat: "no-repeat",
                              backgroundPosition: "right 10px center",
                            }}
                          >
                            {ROLES.map(ro => <option key={ro} value={ro}>{ro}</option>)}
                          </select>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button className="btn-del" onClick={() => eliminar(email)}>
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalUsuarios === 0 && (
                <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 12, textAlign: "center", padding: "20px 0" }}>
                  Sin usuarios registrados todavía.
                </p>
              )}
            </>
          )}
          </>}
        </div>

        {/* ── Pestañas por rol ── */}
        <PermisosSection flash={flash} />

        {/* ── Locales / prefijos ── */}
        <LocalesPrefijosSection flash={flash} />

      </div>

      <Toast msg={msg} />

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
