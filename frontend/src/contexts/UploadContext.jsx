import { createContext, useContext, useState, useCallback } from "react";
import * as XLSX from "xlsx";

const API        = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";
const CHUNK_SIZE = 5000;

const UploadContext = createContext(null);

const IDLE = { estado: "idle", filename: null, loteActual: 0, totalLotes: 0, error: null, stats: null };

function leerHoja(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  const rawMatrix  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const rawHeaders = rawMatrix[0] ?? [];
  const seenHdr    = {};
  const headers    = rawHeaders.map(h => {
    const key = String(h);
    if (seenHdr[key] !== undefined) { seenHdr[key]++; return `${key}.${seenHdr[key]}`; }
    seenHdr[key] = 0;
    return key;
  });

  // Construir mapa de hipervínculos por (fila, col) para capturar URLs de celdas clickeables
  // Cubre dos casos: hipervínculo Excel (cell.l.Target) y fórmula =HYPERLINK("url","texto") (cell.f)
  const hyperlinkMap = {};
  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell?.l?.Target) {
          hyperlinkMap[`${r},${c}`] = cell.l.Target;
        } else if (cell?.f) {
          const m = cell.f.match(/HYPERLINK\("([^"]+)"/i);
          if (m) hyperlinkMap[`${r},${c}`] = m[1];
        }
      }
    }
  }

  // La fila de datos empieza en índice 1 del sheet (fila 0 = headers)
  return rawMatrix.slice(1).map((row, rowIdx) => {
    const sheetRow = rowIdx + 1;
    const obj = {};
    headers.forEach((h, i) => {
      const link   = hyperlinkMap[`${sheetRow},${i}`];
      const rawVal = row[i] ?? "";
      // Convertir fechas a ISO antes de String() — String(Date) da formato locale, no ISO
      const rawStr = rawVal instanceof Date ? rawVal.toISOString() : (rawVal !== "" ? String(rawVal) : "");
      // Si el texto de celda ya es una URL (o lista de URLs), usarlo directamente.
      // Si el texto no es URL pero existe un hipervínculo, preferir el hipervínculo.
      // Esto cubre celdas con =HYPERLINK("url","Ver foto") donde el texto no es la URL.
      const isUrlLike = rawStr.startsWith("http") || rawStr.startsWith("//");
      const val = rawStr && isUrlLike ? rawStr : (link || rawStr || "");
      obj[h] = val;
    });
    return obj;
  });
}

export function UploadProvider({ children }) {
  const [uploads, setUploads] = useState({
    beetrak:      { ...IDLE },
    pfa:          { ...IDLE },
    pfa_delivery: { ...IDLE },
  });
  const [logs, setLogs] = useState([]);

  // ── Estado persistente de Falabella Histórico ────────────────────────────────
  const [falabellaItems,      setFalabellaItems]      = useState([]);
  const [falabellaProcesando, setFalabellaProcesando] = useState(false);
  const [falabellaPreviewId,  setFalabellaPreviewId]  = useState(null);

  const falabellaPatchItem = useCallback((id, data) =>
    setFalabellaItems(prev => prev.map(it => it.id === id ? { ...it, ...data } : it)),
  []);

  const addLog = (msg, tipo = "info") => {
    const ts = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs(prev => [{ msg, tipo, ts }, ...prev].slice(0, 80));
  };

  const patch = (tipo, data) =>
    setUploads(prev => ({ ...prev, [tipo]: { ...prev[tipo], ...data } }));

  const _subirLotes = async (tipoEndpoint, rows, filename, patchKey, label) => {
    const totalLotes = Math.ceil(rows.length / CHUNK_SIZE);
    patch(patchKey, { estado: "subiendo", totalLotes, loteActual: 0 });
    addLog(`${label}: ${rows.length.toLocaleString()} filas — ${totalLotes} lote(s)`);

    let lastData = null;
    for (let i = 0; i < totalLotes; i++) {
      const chunk = rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      patch(patchKey, { loteActual: i + 1 });
      addLog(`${label} — lote ${i + 1}/${totalLotes} (${chunk.length} filas)`);

      const res  = await fetch(`${API}/procesar-json/${tipoEndpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ filename, rows: chunk }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error del servidor");
      lastData = data;
    }
    return { lastData, totalLotes, count: rows.length };
  };

  const iniciarUpload = async (tipo, file) => {
    patch(tipo, { ...IDLE, estado: "leyendo", filename: file.name });
    addLog(`Leyendo ${tipo.toUpperCase()}: ${file.name}...`);

    try {
      const buffer = await file.arrayBuffer();
      let wb = XLSX.read(buffer, { type: "array", cellDates: true });
      addLog(`Hojas disponibles: ${wb.SheetNames.map(s => `"${s}"`).join(", ")}`);

      const sheetName = wb.SheetNames.includes("Datos") ? "Datos"
        : tipo === "beetrak" && wb.SheetNames.includes("DispatchTrack") ? "DispatchTrack"
        : tipo === "pfa"     && wb.SheetNames.includes("Picking")       ? "Picking"
        : wb.SheetNames[0];

      addLog(`Hoja detectada: "${sheetName}"`);

      // Si el sheet no se parseó, reintentar con opciones mínimas (solo valores)
      if (!wb.Sheets[sheetName] || !wb.Sheets[sheetName]["!ref"]) {
        addLog("Sheet incompleto — reintentando en modo liviano...");
        wb = XLSX.read(buffer, {
          type: "array",
          cellDates: false,
          cellFormula: false,
          cellHTML: false,
          cellNF: false,
          cellStyles: false,
          dense: true,
        });
      }

      addLog(`Rango hoja: ${wb.Sheets[sheetName]?.["!ref"] ?? "(sin rango)"}`);

      let allRows = leerHoja(wb, sheetName);

      // Si la primera hoja está vacía, buscar la primera hoja con datos
      if (allRows.length === 0 && wb.SheetNames.length > 1) {
        for (const s of wb.SheetNames.slice(1)) {
          const rows = leerHoja(wb, s);
          if (rows.length > 0) {
            addLog(`Hoja "${sheetName}" vacía — usando "${s}" (${rows.length.toLocaleString()} filas)`);
            allRows = rows;
            break;
          }
        }
      }
      const { lastData, totalLotes, count } = await _subirLotes(tipo, allRows, file.name, tipo, tipo.toUpperCase());

      patch(tipo, { estado: "listo", stats: lastData, loteActual: totalLotes });
      addLog(`✓ ${tipo.toUpperCase()} completado — ${count.toLocaleString()} filas procesadas`, "success");

      // Si es PFA y existe hoja Delivery, subirla también
      if (tipo === "pfa" && wb.SheetNames.includes("Delivery")) {
        addLog(`Hoja Delivery detectada — iniciando carga...`);
        patch("pfa_delivery", { ...IDLE, estado: "leyendo", filename: file.name });

        const deliveryRows = leerHoja(wb, "Delivery");
        const { lastData: dData, totalLotes: dLotes, count: dCount } =
          await _subirLotes("pfa_delivery", deliveryRows, file.name, "pfa_delivery", "DELIVERY");

        patch("pfa_delivery", { estado: "listo", stats: dData, loteActual: dLotes });
        addLog(`✓ DELIVERY completado — ${dCount.toLocaleString()} filas guardadas`, "success");
      }

      return lastData;

    } catch (err) {
      patch(tipo, { estado: "error", error: err.message });
      addLog(`Error en ${tipo.toUpperCase()}: ${err.message}`, "error");
      return null;
    }
  };

  const resetUpload = (tipo) => patch(tipo, { ...IDLE });

  const resetTodo = () => {
    setUploads({ beetrak: { ...IDLE }, pfa: { ...IDLE }, pfa_delivery: { ...IDLE } });
    addLog("Sesión reiniciada");
  };

  // Sintetizar entry para el Navbar (mismo formato que uploads regulares)
  const uploadingFab = falabellaItems.filter(it => it.estado === "subiendo");
  const falabellaHistoricoEntry = falabellaProcesando && uploadingFab.length > 0
    ? {
        estado: "subiendo",
        filename: uploadingFab[0]?.file.name ?? null,
        loteActual: uploadingFab.reduce((s, it) => s + it.progresoLote, 0),
        totalLotes: uploadingFab.reduce((s, it) => s + it.totalLotes, 0),
        error: null, stats: null,
      }
    : { ...IDLE };

  const allUploads = { ...uploads, falabella_historico: falabellaHistoricoEntry };

  return (
    <UploadContext.Provider value={{
      uploads: allUploads, logs, addLog, iniciarUpload, resetUpload, resetTodo,
      falabellaItems, setFalabellaItems,
      falabellaProcesando, setFalabellaProcesando,
      falabellaPreviewId, setFalabellaPreviewId,
      falabellaPatchItem,
    }}>
      {children}
    </UploadContext.Provider>
  );
}

export const useUpload = () => useContext(UploadContext);
