import { useState, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../contexts/AuthContext";
import { useUpload } from "../contexts/UploadContext";

const API        = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const ACENTO     = "#e11d48";
const CHUNK_SIZE = 5000;
const PREVIEW_N  = 100;
const COLS_REQ   = ["Idruta", "Posicionruta"];

let _uid = 0;
const newId = () => ++_uid;

// ── Excel parsing ─────────────────────────────────────────────────────────────
function leerHoja(wb, sheetName) {
  const ws       = wb.Sheets[sheetName];
  const matrix   = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const headers  = (matrix[0] ?? []).map(h => String(h));
  return matrix.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i] ?? "";
      obj[h] = v instanceof Date ? v.toISOString() : v;
    });
    return obj;
  });
}

async function parseFile(file) {
  const isCSV = /\.csv$/i.test(file.name);
  if (isCSV) {
    const text = await file.text();
    const firstLine = text.split("\n")[0] ?? "";
    const delimiter = firstLine.includes(";") ? ";" : ",";
    const wb = XLSX.read(text, { type: "string", FS: delimiter, cellDates: true });
    const sheetName = wb.SheetNames[0];
    const rows = leerHoja(wb, sheetName);
    const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { rows, cols };
  }
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const rows = leerHoja(wb, sheetName);
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, cols };
}

// ── Validation ────────────────────────────────────────────────────────────────
function validar(rows, cols) {
  const faltantes = COLS_REQ.filter(c => !cols.includes(c));
  if (faltantes.length > 0) return { valido: false, faltantes, errores: [] };

  const errores = [];
  rows.forEach((row, i) => {
    COLS_REQ.forEach(col => {
      if (row[col] === "" || row[col] == null) {
        errores.push({ fila: i + 2, col, msg: "Valor vacío" });
      }
    });
  });
  return { valido: true, faltantes: [], errores };
}

// ── Status badge ──────────────────────────────────────────────────────────────
const ESTADO_CFG = {
  leyendo:  { label: "Leyendo...",    color: "#F59E0B" },
  valido:   { label: "Válido",        color: "#10B981" },
  errores:  { label: "Con advertencias", color: "#F59E0B" },
  invalido: { label: "Sin columnas",  color: "#EF4444" },
  subiendo: { label: "Subiendo...",   color: ACENTO    },
  ok:       { label: "Cargado ✓",    color: "#10B981" },
  fallo:    { label: "Error",         color: "#EF4444" },
};

function Badge({ estado }) {
  const { label, color } = ESTADO_CFG[estado] ?? { label: estado, color: "var(--text3)" };
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      background: color + "22", color, border: `1px solid ${color}44`,
      whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function DropZone({ onFiles, disabled }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  const handle = (files) => {
    const valid = Array.from(files).filter(f => /\.(xlsx|xls|csv)$/i.test(f.name));
    if (valid.length) onFiles(valid);
  };

  return (
    <div
      className={`file-zone ${drag ? "drag-over" : ""}`}
      style={{ "--accent": ACENTO, cursor: disabled ? "default" : "pointer", minHeight: 90 }}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (!disabled) handle(e.dataTransfer.files); }}
      onClick={() => !disabled && inputRef.current.click()}
    >
      <input
        ref={inputRef} type="file" accept=".xlsx,.xls,.csv" multiple
        style={{ display: "none" }}
        onChange={e => { handle(e.target.files); e.target.value = ""; }}
      />
      <div className="zone-header">
        <span className="tipo-badge" style={{ background: ACENTO + "22", color: ACENTO, borderColor: ACENTO + "44" }}>
          Falabella Histórico
        </span>
        <span className="tipo-desc">Datos históricos de despacho</span>
      </div>
      <div className="zone-body" style={{ cursor: disabled ? "default" : "pointer" }}>
        <p className="zone-status">{disabled ? "Procesando..." : "Arrastra archivos o haz clic"}</p>
        <p className="zone-hint">xlsx · xls · csv · múltiples archivos</p>
      </div>
    </div>
  );
}

// ── Preview table ─────────────────────────────────────────────────────────────
function PreviewTable({ item }) {
  if (!item || !item.rows.length) return null;
  const previewRows = item.rows.slice(0, PREVIEW_N);
  const cols = item.cols;

  return (
    <div>
      <p className="table-count" style={{ marginBottom: 8 }}>
        Vista previa de <strong>{item.file.name}</strong> — mostrando{" "}
        <strong>{previewRows.length.toLocaleString()}</strong> de{" "}
        <strong>{item.rows.length.toLocaleString()}</strong> filas
      </p>
      <div className="table-scroll" style={{ maxHeight: 360, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
        <table className="data-table" style={{ margin: 0 }}>
          <thead>
            <tr>{cols.map(c => <th key={c} style={{ fontSize: 11, padding: "6px 8px", whiteSpace: "nowrap" }}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i}>
                {cols.map(c => (
                  <td key={c} style={{ fontSize: 11, padding: "4px 8px", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {String(row[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Error panel ───────────────────────────────────────────────────────────────
function ErrorPanel({ item }) {
  const [expand, setExpand] = useState(false);
  if (!item) return null;

  if (item.estado === "invalido") {
    return (
      <div style={{ background: "#EF444411", border: "1px solid #EF444433", borderRadius: 8, padding: "12px 16px", marginTop: 12 }}>
        <p style={{ fontWeight: 700, color: "#EF4444", fontSize: 13, margin: 0 }}>
          Columnas requeridas no encontradas
        </p>
        <p style={{ fontSize: 12, color: "var(--text2)", margin: "6px 0 0" }}>
          Faltan: <strong>{item.faltantes.join(", ")}</strong>
        </p>
        {item.errorMsg && (
          <p style={{ fontSize: 11, color: "var(--text3)", margin: "4px 0 0", fontFamily: "var(--font-mono)" }}>{item.errorMsg}</p>
        )}
      </div>
    );
  }

  if (item.estado === "fallo") {
    return (
      <div style={{ background: "#EF444411", border: "1px solid #EF444433", borderRadius: 8, padding: "12px 16px", marginTop: 12 }}>
        <p style={{ fontWeight: 700, color: "#EF4444", fontSize: 13, margin: 0 }}>Error al cargar</p>
        <p style={{ fontSize: 12, color: "var(--text2)", margin: "6px 0 0", fontFamily: "var(--font-mono)" }}>{item.errorMsg}</p>
      </div>
    );
  }

  if (!item.errores?.length) return null;

  const visible = expand ? item.errores : item.errores.slice(0, 10);

  return (
    <div style={{ background: "#F59E0B11", border: "1px solid #F59E0B33", borderRadius: 8, padding: "12px 16px", marginTop: 12 }}>
      <p style={{ fontWeight: 700, color: "#F59E0B", fontSize: 13, margin: "0 0 8px" }}>
        {item.errores.length} advertencia{item.errores.length > 1 ? "s" : ""} de validación
        <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)", marginLeft: 8 }}>
          (filas con clave vacía — se ignorarán en el MERGE)
        </span>
      </p>
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
        <table className="data-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={{ width: 80 }}>Fila</th>
              <th style={{ width: 160 }}>Columna</th>
              <th>Problema</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e, i) => (
              <tr key={i}>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{e.fila}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: ACENTO }}>{e.col}</td>
                <td style={{ fontSize: 12 }}>{e.msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {item.errores.length > 10 && (
        <button
          onClick={() => setExpand(v => !v)}
          style={{ marginTop: 8, background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 12 }}
        >
          {expand ? "▲ Mostrar menos" : `▼ Ver ${item.errores.length - 10} más`}
        </button>
      )}
    </div>
  );
}

// ── Historial ─────────────────────────────────────────────────────────────────
function Historial({ data, onRecargar }) {
  if (!data) return null;
  return (
    <div className="admin-section" style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div className="admin-section-header" style={{ margin: 0 }}>Historial de cargas Falabella</div>
        <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 10px" }} onClick={onRecargar}>
          Actualizar
        </button>
      </div>
      {data.length === 0 ? (
        <p style={{ color: "var(--text3)", fontSize: 13 }}>Sin cargas registradas.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha (Chile)</th>
                <th>Archivo</th>
                <th style={{ textAlign: "right" }}>Filas</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--text3)", fontFamily: "var(--font-body)", fontSize: 12 }}>{row.cargado_en}</td>
                  <td style={{ fontSize: 12, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}>{row.archivo}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-head)", fontWeight: 700 }}>
                    {row.filas?.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Confirmation modal ────────────────────────────────────────────────────────
function ConfirmModal({ items, onConfirm, onCancel }) {
  const validos  = items.filter(it => it.estado === "valido");
  const conAdv   = items.filter(it => it.estado === "errores");
  const total    = [...validos, ...conAdv].reduce((s, it) => s + it.rows.length, 0);

  return (
    <div
      onClick={e => e.target === e.currentTarget && onCancel()}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(11,28,73,0.22)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--border2)",
        borderRadius: 16, padding: "28px 32px", minWidth: 340, maxWidth: 460,
        boxShadow: "0 8px 40px rgba(11,28,73,0.14)",
      }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 12, fontFamily: "var(--font-head)" }}>
          Confirmar carga histórica
        </p>
        <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, marginBottom: 8 }}>
          <div>• <strong>{validos.length + conAdv.length}</strong> archivo{validos.length + conAdv.length > 1 ? "s" : ""} a procesar</div>
          <div>• <strong>{total.toLocaleString()}</strong> filas en total</div>
          {conAdv.length > 0 && (
            <div style={{ color: "#F59E0B" }}>
              • {conAdv.length} archivo{conAdv.length > 1 ? "s" : ""} con advertencias — se cargarán igualmente
            </div>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 24, lineHeight: 1.5 }}>
          Los registros existentes se actualizarán (MERGE por IDruta + Posicionruta). Los nuevos se insertarán.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 22px", background: ACENTO + "22", color: ACENTO,
              border: `1px solid ${ACENTO}44`, borderRadius: 8, cursor: "pointer",
              fontFamily: "var(--font-head)", fontWeight: 700, fontSize: 13,
            }}
          >
            Confirmar y cargar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgresoBarra({ lote, total }) {
  if (!total) return null;
  const pct = Math.round((lote / total) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
      <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: ACENTO, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 10, color: "var(--text3)", whiteSpace: "nowrap" }}>{lote}/{total}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FalabellaHistorico() {
  const { rol } = useAuth();
  const {
    falabellaItems: items,
    setFalabellaItems: setItems,
    falabellaProcesando: procesando,
    setFalabellaProcesando: setProcesando,
    falabellaPreviewId: previewId,
    setFalabellaPreviewId: setPreviewId,
    falabellaPatchItem: patchItem,
  } = useUpload();
  const [historial, setHistorial] = useState(null);
  const [confirmar, setConfirmar] = useState(false);

  const cargarHistorial = useCallback(() => {
    fetch(`${API}/historial/falabella`)
      .then(r => r.json())
      .then(setHistorial)
      .catch(() => setHistorial([]));
  }, []);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  const agregarArchivos = useCallback(async (files) => {
    const nuevos = files.map(f => ({
      id: newId(), file: f, estado: "leyendo",
      rows: [], cols: [], errores: [], faltantes: [],
      resultado: null, errorMsg: null, progresoLote: 0, totalLotes: 0,
    }));
    setItems(prev => [...prev, ...nuevos]);
    if (nuevos.length) setPreviewId(nuevos[0].id);

    for (const item of nuevos) {
      try {
        const { rows, cols } = await parseFile(item.file);
        const { valido, faltantes, errores } = validar(rows, cols);
        patchItem(item.id, {
          rows, cols, faltantes, errores,
          estado: !valido ? "invalido" : errores.length > 0 ? "errores" : "valido",
        });
      } catch (e) {
        patchItem(item.id, { estado: "invalido", errorMsg: e.message });
      }
    }
  }, [patchItem]);

  const removerItem = (id) => {
    setItems(prev => prev.filter(it => it.id !== id));
    if (previewId === id) setPreviewId(null);
  };

  const subirTodo = async () => {
    setProcesando(true);
    setConfirmar(false);
    const pendientes = items.filter(it => it.estado === "valido" || it.estado === "errores");

    for (const item of pendientes) {
      const total = Math.ceil(item.rows.length / CHUNK_SIZE);
      patchItem(item.id, { estado: "subiendo", progresoLote: 0, totalLotes: total });

      try {
        for (let i = 0; i < total; i++) {
          patchItem(item.id, { progresoLote: i + 1 });
          const chunk = item.rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const res = await fetch(`${API}/procesar-json/falabella`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ filename: item.file.name, rows: chunk }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Error HTTP ${res.status}`);
          }
          await res.json();
        }
        patchItem(item.id, { estado: "ok", resultado: { filas: item.rows.length } });
      } catch (e) {
        patchItem(item.id, { estado: "fallo", errorMsg: e.message });
      }
    }

    setProcesando(false);
    cargarHistorial();
  };

  if (rol !== "admin") {
    return (
      <div className="page">
          <div className="page-content">
          <p style={{ color: "var(--text3)", marginTop: 40, textAlign: "center" }}>
            Acceso restringido a administradores.
          </p>
        </div>
      </div>
    );
  }

  const preview   = items.find(it => it.id === previewId);
  const validos   = items.filter(it => it.estado === "valido" || it.estado === "errores");
  const listos    = items.filter(it => it.estado === "ok").length;
  const fallidos  = items.filter(it => it.estado === "fallo").length;
  const invalidos = items.filter(it => it.estado === "invalido").length;
  const hayResultados = listos > 0 || fallidos > 0;

  return (
    <div className="page">
      {confirmar && (
        <ConfirmModal
          items={items}
          onConfirm={subirTodo}
          onCancel={() => setConfirmar(false)}
        />
      )}
      <div className="page-content">
        <div className="page-header">
          <h2 className="page-title" style={{ "--accent": ACENTO }}>Falabella Histórico</h2>
          <p style={{ fontSize: 12, color: "var(--text3)", margin: "4px 0 0" }}>
            Carga masiva de datos históricos de despacho Falabella
          </p>
        </div>

        {/* ── Zona de carga ── */}
        <DropZone onFiles={agregarArchivos} disabled={procesando} />

        {/* ── Lista de archivos ── */}
        {items.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="section-label">Archivos seleccionados</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {items.map(it => (
                <div
                  key={it.id}
                  onClick={() => setPreviewId(it.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: previewId === it.id ? ACENTO + "11" : "var(--bg2)",
                    border: `1px solid ${previewId === it.id ? ACENTO + "44" : "var(--border)"}`,
                    borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  <Badge estado={it.estado} />
                  <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.file.name}
                  </span>
                  {it.rows.length > 0 && (
                    <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>
                      {it.rows.length.toLocaleString()} filas
                    </span>
                  )}
                  {it.estado === "subiendo" && (
                    <ProgresoBarra lote={it.progresoLote} total={it.totalLotes} />
                  )}
                  {it.estado === "ok" && (
                    <span style={{ fontSize: 11, color: "#10B981", flexShrink: 0 }}>
                      {it.resultado?.filas?.toLocaleString()} cargadas
                    </span>
                  )}
                  {!procesando && it.estado !== "subiendo" && (
                    <button
                      onClick={e => { e.stopPropagation(); removerItem(it.id); }}
                      style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 13, padding: "0 2px", flexShrink: 0 }}
                      title="Quitar"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* ── Botones de acción ── */}
            {!procesando && (
              <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                {validos.length > 0 && (
                  <button
                    className="btn-primary"
                    style={{ background: ACENTO + "22", color: ACENTO, borderColor: ACENTO + "55" }}
                    onClick={() => setConfirmar(true)}
                  >
                    Confirmar y cargar ({validos.length} archivo{validos.length > 1 ? "s" : ""})
                  </button>
                )}
                <button className="btn-ghost" onClick={() => { setItems([]); setPreviewId(null); }}>
                  Limpiar todo
                </button>
                {invalidos > 0 && (
                  <span style={{ fontSize: 12, color: "#EF4444" }}>
                    {invalidos} archivo{invalidos > 1 ? "s" : ""} inválido{invalidos > 1 ? "s" : ""} — no se cargarán
                  </span>
                )}
              </div>
            )}

            {/* ── Resultado resumen ── */}
            {hayResultados && !procesando && (
              <div style={{
                marginTop: 14, padding: "12px 16px",
                background: fallidos > 0 ? "#EF444411" : "#10B98111",
                border: `1px solid ${fallidos > 0 ? "#EF444433" : "#10B98133"}`,
                borderRadius: 8, fontSize: 13,
              }}>
                {listos > 0 && (
                  <span style={{ color: "#10B981", fontWeight: 700 }}>
                    ✓ {listos} archivo{listos > 1 ? "s" : ""} cargado{listos > 1 ? "s" : ""} correctamente
                  </span>
                )}
                {listos > 0 && fallidos > 0 && <span style={{ margin: "0 8px", color: "var(--text3)" }}>·</span>}
                {fallidos > 0 && (
                  <span style={{ color: "#EF4444", fontWeight: 700 }}>
                    ✗ {fallidos} archivo{fallidos > 1 ? "s" : ""} fallido{fallidos > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Vista previa + errores ── */}
        {preview && (preview.estado === "valido" || preview.estado === "errores" || preview.estado === "ok" || preview.estado === "fallo") && (
          <div style={{ marginTop: 28 }}>
            <div className="section-label" style={{ marginBottom: 12 }}>Vista previa</div>
            <PreviewTable item={preview} />
            <ErrorPanel item={preview} />
          </div>
        )}

        {preview && preview.estado === "invalido" && (
          <div style={{ marginTop: 28 }}>
            <div className="section-label" style={{ marginBottom: 12 }}>Diagnóstico</div>
            <ErrorPanel item={preview} />
          </div>
        )}

        {/* ── Historial ── */}
        <Historial data={historial} onRecargar={cargarHistorial} />
      </div>
    </div>
  );
}
