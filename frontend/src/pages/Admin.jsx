import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import Navbar from "../components/Navbar";

const API   = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const ROLES = ["admin", "master", "finanzas", "mejora"];

const COLUMNAS_DEFAULT_BEETRAK = {
  "Identificador ruta":   "identificador_ruta",
  "Identificador":        "identificador",
  "Orden":                "orden",
  "LOCAL":                "local",
  "Tipo de despacho":     "tipo_despacho",
  "Fecha estimada":       "fecha_estimada",
  "Fecha Llegada":        "fecha_llegada",
  "Estado":               "estado",
  "Subestado":            "subestado",
  "Usuario móvil":        "nombre_movil",
  "Teléfono usuario":     "telefono_usuario",
  "Dirección cliente":    "direccion_cliente",
  "Fecha de creacion":    "fecha_creacion",
  "Fecha primer intento": "fecha_primer_intento",
  "# intentos":           "intentos",
  "Usuario móvil.1":      "rut_movil",
  "Tiempo min entrega":   "tiempo_min_entrega",
  "Tiempo max entrega":   "tiempo_max_entrega",
  "Fecha ruta":           "fecha_ruta",
  "Inicio de ruta":       "inicio_ruta",
  "Fin de ruta":          "fin_ruta",
  "Número de intento":    "numero_intento",
  "Coordenadas":          "coordenadas",
  "Fecha de picking":     "fecha_picking",
  "Latitud":              "latitud",
  "Longitud":             "longitud",
};

function suggestBqName(col) {
  return String(col)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

// Convierte {excelCol: bqField} → rows
function configToRows(config) {
  return Object.entries(config).map(([excel, bq]) => ({
    id:    `${excel}__${bq}`,
    excel,
    bq,
    activo:    true,
    esNueva:   false,
    enArchivo: null, // null = sin archivo cargado
  }));
}

// Convierte rows → {excelCol: bqField} (solo activas y con nombres válidos)
function rowsToConfig(rows) {
  const out = {};
  rows.forEach(r => {
    if (r.activo && r.excel.trim() && r.bq.trim()) out[r.excel.trim()] = r.bq.trim();
  });
  return out;
}

// Lee solo la primera fila de un Excel (solo headers, muy rápido)
async function leerHeadersExcel(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, {
    type: "array", sheetRows: 2,
    cellDates: false, cellFormula: false, cellHTML: false, cellNF: false, cellStyles: false,
  });
  const sheetName =
    wb.SheetNames.includes("Datos")          ? "Datos"          :
    wb.SheetNames.includes("DispatchTrack")  ? "DispatchTrack"  :
    wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  if (!ws || !ws["!ref"]) throw new Error(`No se pudo leer la hoja "${sheetName}"`);

  const rawHeaders = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })[0] ?? [];

  // Normalizar duplicados igual que UploadContext
  const seen = {};
  return {
    sheetName,
    headers: rawHeaders.map(h => {
      const key = String(h);
      if (seen[key] !== undefined) { seen[key]++; return `${key}.${seen[key]}`; }
      seen[key] = 0;
      return key;
    }).filter(h => h.trim()),
  };
}

function ColsBeetrakSection({ flash }) {
  const [rows,      setRows]      = useState(null);
  const [editado,   setEditado]   = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [dragging,  setDragging]  = useState(false);
  const [fileInfo,  setFileInfo]  = useState(null); // {name, sheetName, total}
  const [leyendo,   setLeyendo]   = useState(false);
  const fileRef = useRef();

  const cargarConfig = () => {
    fetch(`${API}/configuracion/beetrak`)
      .then(r => r.json())
      .then(d  => { setRows(configToRows(d)); setEditado(false); })
      .catch(() => { setRows(configToRows(COLUMNAS_DEFAULT_BEETRAK)); setEditado(false); });
  };

  useEffect(cargarConfig, []);

  /* ── Merge archivo con config actual ─────────────────────────────────── */
  const procesarArchivo = useCallback(async (file) => {
    setLeyendo(true);
    try {
      const { sheetName, headers } = await leerHeadersExcel(file);
      const fileSet = new Set(headers);

      setRows(prev => {
        const configExcelSet = new Set(prev.map(r => r.excel));

        // Marcar filas existentes si están o no en el archivo
        const actualizadas = prev.map(r => ({
          ...r,
          enArchivo: fileSet.has(r.excel),
        }));

        // Agregar columnas del archivo que NO están en config (inactivas por defecto)
        const nuevas = headers
          .filter(h => !configExcelSet.has(h))
          .map(h => ({
            id:        `new_${h}`,
            excel:     h,
            bq:        suggestBqName(h),
            activo:    false,
            esNueva:   true,
            enArchivo: true,
          }));

        return [...actualizadas, ...nuevas];
      });

      setFileInfo({ name: file.name, sheetName, total: headers.length });
      setEditado(true);
      flash(`${headers.length} columnas detectadas en "${sheetName}"`);
    } catch (e) {
      flash(`Error leyendo archivo: ${e.message}`, false);
    } finally {
      setLeyendo(false);
    }
  }, [flash]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) procesarArchivo(f);
  }, [procesarArchivo]);

  /* ── Edición de filas ────────────────────────────────────────────────── */
  const toggleActivo = (id) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, activo: !r.activo } : r));
    setEditado(true);
  };

  const editExcel = (id, val) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, excel: val } : r));
    setEditado(true);
  };

  const editBq = (id, val) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, bq: val } : r));
    setEditado(true);
  };

  const eliminarFila = (id) => {
    setRows(prev => prev.filter(r => r.id !== id));
    setEditado(true);
  };

  const agregarFila = () => {
    const id = `manual_${Date.now()}`;
    setRows(prev => [...prev, { id, excel: "", bq: "", activo: true, esNueva: true, enArchivo: null }]);
    setEditado(true);
  };

  const limpiarArchivo = () => {
    setFileInfo(null);
    setRows(prev => prev
      .filter(r => !r.esNueva)
      .map(r => ({ ...r, enArchivo: null }))
    );
    setEditado(false);
  };

  /* ── Validación ──────────────────────────────────────────────────────── */
  const activasConNombre = rows?.filter(r => r.activo && r.excel.trim() && r.bq.trim()) ?? [];
  const excels  = activasConNombre.map(r => r.excel.trim());
  const bqs     = activasConNombre.map(r => r.bq.trim());
  const dupExcel = excels.length !== new Set(excels).size;
  const dupBq   = bqs.length   !== new Set(bqs).size;
  const hayError = dupExcel || dupBq;

  /* ── Guardar ─────────────────────────────────────────────────────────── */
  const guardar = async () => {
    if (hayError) return;
    setGuardando(true);
    try {
      const res = await fetch(`${API}/configuracion/beetrak`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(rowsToConfig(rows)),
      });
      if (!res.ok) throw new Error("Error al guardar");
      flash("Configuración guardada");
      setEditado(false);
      // Refresh rows from saved config
      cargarConfig();
      setFileInfo(null);
    } catch (e) {
      flash(e.message, false);
    } finally {
      setGuardando(false);
    }
  };

  const restaurar = () => {
    setRows(configToRows(COLUMNAS_DEFAULT_BEETRAK).map(r => ({ ...r, enArchivo: null })));
    setFileInfo(null);
    setEditado(true);
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  if (!rows) return (
    <div className="admin-section">
      <div className="admin-section-header">Columnas Beetrak</div>
      <p style={{ padding: "12px 0", color: "var(--text3)", fontSize: 13 }}>Cargando...</p>
    </div>
  );

  const totalActivas = rows.filter(r => r.activo).length;
  const totalNuevas  = rows.filter(r => r.esNueva && r.enArchivo).length;

  return (
    <div className="admin-section">

      {/* Header */}
      <div className="admin-section-header" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>Columnas Beetrak</span>
        <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400 }}>
          {totalActivas} activas · {rows.length} totales
        </span>
        {totalNuevas > 0 && (
          <span style={{ fontSize: 11, color: "#A78BFA", fontWeight: 600 }}>
            +{totalNuevas} nuevas detectadas
          </span>
        )}
        {editado && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>
            • Sin guardar
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        className={`cols-dropzone ${dragging ? "dragging" : ""} ${leyendo ? "loading" : ""}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !leyendo && fileRef.current.click()}
        style={{
          border: `1.5px dashed ${dragging ? "var(--green)" : "var(--border)"}`,
          borderRadius: 8,
          padding: "10px 16px",
          marginBottom: 10,
          cursor: leyendo ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: dragging ? "rgba(0,229,195,0.05)" : "var(--bg2)",
          transition: "all 0.15s",
          fontSize: 12,
          color: "var(--text3)",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files[0]; if (f) procesarArchivo(f); e.target.value = ""; }}
        />
        <span style={{ fontSize: 16 }}>📂</span>
        {leyendo ? (
          <span>Leyendo columnas...</span>
        ) : fileInfo ? (
          <span>
            <strong style={{ color: "var(--text1)" }}>{fileInfo.name}</strong>
            {" "}· hoja <em>{fileInfo.sheetName}</em> · {fileInfo.total} columnas detectadas
            <button
              onClick={e => { e.stopPropagation(); limpiarArchivo(); }}
              style={{ marginLeft: 10, fontSize: 11, color: "var(--text3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              limpiar
            </button>
          </span>
        ) : (
          <span>Arrastra un archivo Beetrak (.xlsx) para detectar todas sus columnas</span>
        )}
      </div>

      {/* Leyenda */}
      {fileInfo && (
        <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 11, color: "var(--text3)" }}>
          <span><span style={{ color: "var(--green)" }}>●</span> En config + encontrada en archivo</span>
          <span><span style={{ color: "#A78BFA" }}>●</span> Nueva (del archivo, no estaba en config)</span>
          <span><span style={{ color: "#F59E0B" }}>●</span> En config pero NO encontrada en archivo</span>
        </div>
      )}

      {/* Tabla */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowY: "auto", maxHeight: 480 }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: "center" }}>✓</th>
                <th>Columna en Excel</th>
                <th>Campo BigQuery</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const bqDup   = dupBq   && r.activo && bqs.filter(b => b === r.bq.trim()).length > 1;
                const exDup   = dupExcel && r.activo && excels.filter(e => e === r.excel.trim()).length > 1;

                // Color de la fila según estado
                let rowAccent = null;
                if (fileInfo) {
                  rowAccent = r.esNueva && r.enArchivo ? "#A78BFA"
                    : r.enArchivo === false ? "#F59E0B"
                    : "var(--green)";
                }

                return (
                  <tr
                    key={r.id}
                    style={{
                      opacity: r.activo ? 1 : 0.45,
                      background: r.esNueva && r.enArchivo ? "rgba(167,139,250,0.04)" : undefined,
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ textAlign: "center", padding: "3px 6px" }}>
                      <input
                        type="checkbox"
                        checked={r.activo}
                        onChange={() => toggleActivo(r.id)}
                        style={{ cursor: "pointer", accentColor: "var(--green)" }}
                      />
                    </td>

                    {/* Excel col */}
                    <td style={{ padding: "3px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {rowAccent && (
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: rowAccent, flexShrink: 0 }} />
                        )}
                        <input
                          className="input-text"
                          style={{
                            flex: 1, fontSize: 12, padding: "3px 7px",
                            borderColor: exDup ? "#EF4444" : undefined,
                          }}
                          value={r.excel}
                          placeholder="Nombre columna Excel"
                          onChange={e => editExcel(r.id, e.target.value)}
                        />
                      </div>
                    </td>

                    {/* BQ field */}
                    <td style={{ padding: "3px 8px" }}>
                      <input
                        className="input-text"
                        style={{
                          width: "100%", fontSize: 12, padding: "3px 7px",
                          fontFamily: "var(--font-mono)",
                          borderColor: bqDup ? "#EF4444" : undefined,
                        }}
                        value={r.bq}
                        placeholder="campo_bigquery"
                        onChange={e => editBq(r.id, e.target.value)}
                      />
                    </td>

                    {/* Eliminar */}
                    <td style={{ padding: "3px 6px", textAlign: "center" }}>
                      <button
                        className="btn-del"
                        onClick={() => eliminarFila(r.id)}
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

      {/* Errores */}
      {dupExcel && <p style={{ fontSize: 12, color: "#EF4444", marginTop: 5 }}>Hay columnas Excel duplicadas entre las activas.</p>}
      {dupBq    && <p style={{ fontSize: 12, color: "#EF4444", marginTop: 5 }}>Hay campos BigQuery duplicados entre las activas.</p>}

      {/* Acciones */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn-add" onClick={guardar} disabled={!editado || guardando || hayError}>
          {guardando ? "Guardando..." : `Guardar (${totalActivas} activas)`}
        </button>
        <button className="btn-ghost" onClick={agregarFila}>+ Agregar fila</button>
        <button className="btn-ghost" onClick={restaurar} style={{ marginLeft: "auto" }}>Restaurar defaults</button>
      </div>

      <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 8, lineHeight: 1.5 }}>
        Arrastra un archivo Beetrak para ver todas sus columnas y activar las que quieras guardar en BigQuery.
        Las columnas nuevas se agregan automáticamente al schema de BigQuery.
      </p>
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

        <ColsBeetrakSection flash={flash} />
      </div>
    </div>
  );
}
