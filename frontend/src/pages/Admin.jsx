import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";

const API   = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const ROLES = ["admin", "master", "finanzas", "mejora"];

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
  const [confirmarId,  setConfirmarId]  = useState(null); // id del local pendiente de borrar

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
    <div className="admin-section">
      <div className="admin-section-header">Locales válidos (Beetrak)</div>
      <p style={{ padding: "12px 0", color: "var(--text3)", fontSize: 13 }}>Cargando...</p>
    </div>
  );

  const localPendiente = rows?.find(r => r.id === confirmarId);

  return (
    <div className="admin-section">

      {confirmarId && (
        <div
          onClick={() => setConfirmarId(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(11,28,73,0.18)",
            backdropFilter: "blur(2px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--bg2)", border: "1px solid var(--border2)",
              borderRadius: 16, padding: "28px 32px", minWidth: 320, maxWidth: 420,
              boxShadow: "0 8px 40px rgba(11,28,73,0.12)",
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 8, fontFamily: "var(--font-head)" }}>
              ¿Eliminar local?
            </p>
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 6, lineHeight: 1.6 }}>
              Vas a eliminar el local{" "}
              <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{localPendiente?.local}</strong>
            </p>
            <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 24, fontFamily: "var(--font-mono)", background: "var(--bg)", borderRadius: 8, padding: "6px 10px" }}>
              {localPendiente?.prefijos}
            </p>
            <p style={{ fontSize: 11, color: "var(--text3)", marginBottom: 20 }}>
              Los cambios no se aplican hasta que presiones Guardar.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setConfirmarId(null)}>Cancelar</button>
              <button className="btn-del" onClick={confirmarEliminar} style={{ padding: "7px 20px", fontSize: 13 }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div
        className="admin-section-header"
        onClick={() => setAbierto(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ fontSize: 12, color: "var(--text3)", transition: "transform 0.2s", display: "inline-block", transform: abierto ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <span>Locales válidos (Beetrak)</span>
        <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400 }}>
          {rows.length} locales configurados
        </span>
        {editado && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>
            • Sin guardar
          </span>
        )}
      </div>

      {abierto && <>
      <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8, lineHeight: 1.5 }}>
        Al subir un archivo Beetrak, solo se procesan filas cuyo LOCAL esté en esta lista
        y cuyo Identificador empiece con uno de los prefijos permitidos.
      </p>

      <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowY: "auto", maxHeight: 420 }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 100 }}>Local</th>
                <th>Prefijos válidos <span style={{ fontWeight: 400, fontSize: 11 }}>(separados por coma)</span></th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const localDup = dupLocal && localesActivos.filter(l => l === r.local.trim()).length > 1;
                const sinPref  = r.local.trim() && !r.prefijos.trim();
                return (
                  <tr key={r.id}>
                    <td style={{ padding: "3px 8px" }}>
                      <input
                        className="input-text"
                        style={{
                          width: "100%", fontSize: 12, padding: "3px 7px",
                          fontFamily: "var(--font-mono)",
                          borderColor: localDup ? "#EF4444" : undefined,
                        }}
                        value={r.local}
                        placeholder="Ej: 41"
                        onChange={e => editLocal(r.id, e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "3px 8px" }}>
                      <input
                        className="input-text"
                        style={{
                          width: "100%", fontSize: 12, padding: "3px 7px",
                          fontFamily: "var(--font-mono)",
                          borderColor: sinPref ? "#EF4444" : undefined,
                        }}
                        value={r.prefijos}
                        placeholder="Ej: LTVS, DRVS, LTTH"
                        onChange={e => editPrefijos(r.id, e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "3px 6px", textAlign: "center" }}>
                      <button
                        className="btn-del"
                        onClick={() => eliminar(r.id)}
                        style={{ padding: "2px 8px", fontSize: 11 }}
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

      {dupLocal  && <p style={{ fontSize: 12, color: "#EF4444", marginTop: 5 }}>Hay locales duplicados.</p>}
      {hayVacios && <p style={{ fontSize: 12, color: "#EF4444", marginTop: 5 }}>Hay locales sin prefijos definidos.</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn-add" onClick={guardar} disabled={!editado || guardando || hayError}>
          {guardando ? "Guardando..." : `Guardar (${rows.length} locales)`}
        </button>
        <button className="btn-ghost" onClick={agregar}>+ Agregar local</button>
        <button className="btn-ghost" onClick={restaurar} style={{ marginLeft: "auto" }}>Restaurar defaults</button>
      </div>
      </>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Admin page
═══════════════════════════════════════════════════════════════════════════ */
export default function Admin() {
  const [usuarios, setUsuarios] = useState({});
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

  return (
    <div className="page">
      <Navbar />
      <div className="page-content">
        <div className="page-header">
          <h2 className="page-title" style={{ "--accent": "rgba(255,255,255,0.5)" }}>Panel Admin</h2>
          {msg && <div className={`flash-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
        </div>

        <div className="admin-section">
          <div className="admin-section-header">Agregar / actualizar usuario</div>
          <div className="admin-add-form">
            <div className="filter-group">
              <label>Correo</label>
              <input
                className="input-text"
                type="email"
                placeholder="usuario@valdishopper.com"
                value={correo}
                onChange={e => setCorreo(e.target.value)}
                onKeyDown={e => e.key === "Enter" && agregar()}
                style={{ width: 280 }}
              />
            </div>
            <div className="filter-group">
              <label>Rol</label>
              <select className="select-rol" value={rol} onChange={e => setRol(e.target.value)}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn-add" onClick={agregar}>Guardar</button>
          </div>
        </div>

        <div className="table-wrap">
          {loading && <p className="table-msg">Cargando usuarios...</p>}
          {error   && <p className="table-msg error">{error}</p>}
          {!loading && !error && (
            <>
              <p className="table-count">{Object.keys(usuarios).length} usuarios</p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>Correo</th><th>Rol</th><th>Acción</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(usuarios).map(([email, r]) => (
                      <tr key={email}>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{email}</td>
                        <td>
                          <select className="rol-select" value={r} onChange={e => cambiarRol(email, e.target.value)}>
                            {ROLES.map(ro => <option key={ro} value={ro}>{ro}</option>)}
                          </select>
                        </td>
                        <td><button className="btn-del" onClick={() => eliminar(email)}>Eliminar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <LocalesPrefijosSection flash={flash} />
      </div>
    </div>
  );
}
