// ============================================================
//  PICKERPRO | VALDISHOPPER — codigo.gs
// ============================================================

const SPREADSHEET_ID = '1AqYcQ4Y9C7yQiyw5f6DO91zAYguSx3UChxUV4obq8C4';
const SHEET_PO       = 'Picker Outsourcing';
const SHEET_BUK      = 'BUK';
const SHEET_PANEL    = 'BD_Panel';

const PANEL_HEADERS = [
  'Semana','Fecha','Tienda','RUT','Nombre','Email',
  'Pedidos Total','AAT','Contacto Perfecto','Completitud',
  'Total Unidades','Horas Conexion','UPH','Tasa Reclamos',
  'Total Items','Pago Variable','Cumple SKU','Rango'
];

// ── doGet ────────────────────────────────────────────────────
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('PickerPro | Valdishopper')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ── Utilidades ───────────────────────────────────────────────
function normalizarRut(rut) {
  if (!rut) return '';
  return rut.toString().toLowerCase().replace(/[^0-9k]/g, '');
}

function pct(val) {
  const n = parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 1000) / 10;
}

// ── Escala de bono escalonada ────────────────────────────────
// T0: 0-200   → $0
// T1: 201-250 → $80/SKU  (sobre los SKUs en ese rango)
// T2: 251-300 → $90/SKU
// T3: 301-350 → $100/SKU
// T4: 351+    → $110/SKU
//
// Lógica escalonada (Opción C):
// Se paga por cada SKU según el tramo en que cae.
// Ej: 280 SKU → 50 SKU × $80 (T1: 201-250) + 30 SKU × $90 (T2: 251-280) = $6.700

function calcularPagoVariable(sku) {
  if (sku <= 200) return 0;

  const tramos = [
    { desde: 201, hasta: 250, tarifa: 80  },
    { desde: 251, hasta: 300, tarifa: 90  },
    { desde: 301, hasta: 350, tarifa: 100 },
    { desde: 351, hasta: Infinity, tarifa: 110 }
  ];

  let pago = 0;
  for (const t of tramos) {
    if (sku < t.desde) break;
    const skusEnTramo = Math.min(sku, t.hasta === Infinity ? sku : t.hasta) - t.desde + 1;
    if (skusEnTramo > 0) pago += skusEnTramo * t.tarifa;
  }
  return pago;
}

// Retorna el nombre del tramo según SKU
function nombreTramo(sku) {
  if (sku <= 200) return 'T0';
  if (sku <= 250) return 'T1';
  if (sku <= 300) return 'T2';
  if (sku <= 350) return 'T3';
  return 'T4';
}

// ── Directorio BUK ───────────────────────────────────────────
function getDirectorioBuk() {
  const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hoja = ss.getSheetByName(SHEET_BUK);
  const datos= hoja.getDataRange().getValues();
  const dir  = {};
  for (let i = 1; i < datos.length; i++) {
    const f   = datos[i];
    const rsd = String(f[15] || '').replace('.0', '').trim();
    if (!rsd) continue;
    dir[rsd] = {
      nombre: ((f[1] || '') + ' ' + (f[2] || '')).trim(),
      pila  : String(f[1] || '').trim().split(' ')[0],
      email : String(f[3] || '').trim()
    };
  }
  return dir;
}

// ── consolidarBD ─────────────────────────────────────────────
function consolidarBD() {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hojaPO = ss.getSheetByName(SHEET_PO);
  const dir    = getDirectorioBuk();
  const bukRuts= new Set(Object.keys(dir));

  let hojaPanel = ss.getSheetByName(SHEET_PANEL);
  if (!hojaPanel) {
    hojaPanel = ss.insertSheet(SHEET_PANEL);
    hojaPanel.appendRow(PANEL_HEADERS);
    const rng = hojaPanel.getRange(1, 1, 1, PANEL_HEADERS.length);
    rng.setFontWeight('bold').setBackground('#0B1C49').setFontColor('#FFFFFF');
    hojaPanel.setFrozenRows(1);
  }

  const panelData        = hojaPanel.getDataRange().getValues();
  const fechasExistentes = new Set();
  const tz               = Session.getScriptTimeZone();
  for (let i = 1; i < panelData.length; i++) {
  const f = panelData[i][1];
  if (!f) continue;
  // Normalizar igual que consolidarBD hace con las fechas nuevas
  let fechaObj;
  if (f instanceof Date && !isNaN(f.getTime())) {
    fechaObj = f;
  } else {
    const s = String(f).trim();
    if (s.includes('/')) {
      const p = s.split('/');
      fechaObj = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
    } else if (s.includes('-') && s.length >= 10) {
      const p = s.substring(0, 10).split('-');
      fechaObj = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
    }
  }
  if (fechaObj && !isNaN(fechaObj.getTime())) {
    // Guardar en mismo formato dd/MM/yyyy que usa ultimaStr
    const dd   = String(fechaObj.getDate()).padStart(2, '0');
    const mm   = String(fechaObj.getMonth() + 1).padStart(2, '0');
    const yyyy = fechaObj.getFullYear();
    fechasExistentes.add(`${dd}/${mm}/${yyyy}`);
  }
}

  const poDatos   = hojaPO.getDataRange().getValues();
  let ultimaFecha = null;

  for (let i = 1; i < poDatos.length; i++) {
    const f = new Date(poDatos[i][1]);
    if (!isNaN(f.getTime()) && (!ultimaFecha || f > ultimaFecha)) ultimaFecha = f;
  }

  if (!ultimaFecha) return 'ℹ️ Sin fechas en Picker Outsourcing.';

  const ultimaStr = Utilities.formatDate(ultimaFecha, tz, 'dd/MM/yyyy');
  if (fechasExistentes.has(ultimaStr)) return `ℹ️ ${ultimaStr} ya está consolidada. Sin cambios.`;

  const nuevas = [];

  for (let i = 1; i < poDatos.length; i++) {
    const r       = poDatos[i];
    const fechaRaw= r[1];
    if (!fechaRaw) continue;
    const fecha    = new Date(fechaRaw);
    if (isNaN(fecha.getTime())) continue;
    const fechaStr = Utilities.formatDate(fecha, tz, 'dd/MM/yyyy');
    if (fechaStr !== ultimaStr) continue;

    const rutNorm = normalizarRut(r[4]);
    const rsd     = rutNorm.slice(0, -1);
    if (!bukRuts.has(rsd)) continue;

    const info = dir[rsd];
    nuevas.push([
      Number(r[0])  || 0,
      fechaStr,
      String(r[2])  || '',
      String(r[4])  || '',
      info.nombre,
      info.email,
      Number(r[10]) || 0,
      pct(r[11]),
      pct(r[12]),
      pct(r[15]),
      Number(r[16]) || 0,
      Math.round((Number(r[17]) || 0) * 100) / 100,
      Math.round((Number(r[18]) || 0) * 10)  / 10,
      pct(r[19]),
      Number(r[21]) || 0,
      Number(r[23]) || 0,
      Number(r[25]) >= 1 ? 'SÍ' : 'NO',
      String(r[26]) || ''
    ]);
  }

  if (nuevas.length > 0) {
    hojaPanel.getRange(
      hojaPanel.getLastRow() + 1, 1,
      nuevas.length, PANEL_HEADERS.length
    ).setValues(nuevas);
    return `✅ ${nuevas.length} pickers BUK agregados para ${ultimaStr}.`;
  }
  return `ℹ️ Sin pickers BUK nuevos para ${ultimaStr}.`;
}

// ── instalarTrigger ──────────────────────────────────────────
function instalarTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'consolidarBD') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('consolidarBD')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  Logger.log('Trigger instalado: consolidarBD corre diariamente a las 08:00');
}

// ── getAllData ────────────────────────────────────────────────
function getAllData() {
  try {
    const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hoja = ss.getSheetByName(SHEET_PANEL);
    if (!hoja) return { success: false, error: 'Ejecuta consolidarBD() primero.' };

    // Usamos getValues() (valores crudos) para tener las fechas como objetos Date
    // y getDisplayValues() para los campos de texto/número ya formateados
    const rawVals  = hoja.getDataRange().getValues();
    const dispVals = hoja.getDataRange().getDisplayValues();

    if (rawVals.length <= 1) return { success: true, data: [], ultimaFecha: 0 };

    const tz = Session.getScriptTimeZone();
    const results = [];
    let ultimaFechaEncontrada = 0;

    for (let i = 1; i < rawVals.length; i++) {
      const raw  = rawVals[i];
      const disp = dispVals[i];

      // Col B (idx 1) es la fecha — puede ser objeto Date o string dd/MM/yyyy
      let fechaObj;
      const rawFecha = raw[1];

      if (rawFecha instanceof Date && !isNaN(rawFecha.getTime())) {
        // Es un objeto Date (formato de Sheets cuando se guarda como fecha)
        fechaObj = rawFecha;
      } else {
        // Es string — intentar parsear dd/MM/yyyy o yyyy-MM-dd
        const s = String(rawFecha).trim();
        if (s.includes('/')) {
          const p = s.split('/');
          // dd/MM/yyyy
          fechaObj = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
        } else if (s.includes('-') && s.length >= 10) {
          // yyyy-MM-dd o yyyy-MM-dd HH:mm:ss
          const p = s.substring(0,10).split('-');
          fechaObj = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
        } else {
          continue; // fecha inválida, saltar fila
        }
      }

      if (isNaN(fechaObj.getTime())) continue;

      // Normalizar fechaStr SIEMPRE como dd/MM/yyyy para consistencia
      const dd   = String(fechaObj.getDate()).padStart(2, '0');
      const mm   = String(fechaObj.getMonth() + 1).padStart(2, '0');
      const yyyy = fechaObj.getFullYear();
      const fechaStr = `${dd}/${mm}/${yyyy}`;

      // fechaTime: medianoche local del día (sin horas)
      const time = new Date(yyyy, fechaObj.getMonth(), fechaObj.getDate()).getTime();
      if (time > ultimaFechaEncontrada) ultimaFechaEncontrada = time;

      results.push({
        fechaStr,
        fechaTime  : time,
        tienda     : String(raw[2]  || 'S/I'),   // string para consistencia
        rut        : String(raw[3]  || ''),
        nombre     : disp[4] || 'Sin Nombre',
        email      : disp[5] || '',
        pedidos    : Number(raw[6])  || 0,
        aat        : Number(raw[7])  || 0,
        contacto   : Number(raw[8])  || 0,
        completitud: Number(raw[9])  || 0,
        unidades   : Number(raw[10]) || 0,
        horasCx    : Number(raw[11]) || 0,
        uph        : Number(raw[12]) || 0,
        reclamos   : Number(raw[13]) || 0,
        sku        : Number(raw[14]) || 0,
        pago       : Number(raw[15]) || 0,
        cumpleSku  : raw[16] === 'SÍ' || raw[16] === true || Number(raw[16]) >= 1,
        rango      : disp[17] || ''
      });
    }

    results.sort((a, b) => a.fechaTime - b.fechaTime);
    return { success: true, data: results, ultimaFecha: ultimaFechaEncontrada };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ── enviarReportesDesdePanel ─────────────────────────────────
function enviarReportesDesdePanel(datosParaEnviar, mensajeExtra, rangoFechas) {
  try {
    let enviados = 0;
    const porRut = datosParaEnviar.reduce((acc, c) => {
      if (!acc[c.rut]) acc[c.rut] = [];
      acc[c.rut].push(c);
      return acc;
    }, {});

    for (const rut in porRut) {
      const registros = porRut[rut];
      const email     = registros[0].email;
      if (!email || !email.includes('@')) continue;
      const htmlBody = generarCuerpoCorreo(registros, mensajeExtra, rangoFechas);
      MailApp.sendEmail({
        to      : email,
        subject : `📊 Detalle Gestión Picker PRO — ${rangoFechas}`,
        htmlBody: htmlBody
      });
      enviados++;
    }
    return `✅ ¡Éxito! Se enviaron ${enviados} reportes personalizados.`;
  } catch(e) {
    return '❌ Error: ' + e.toString();
  }
}

// ── generarCuerpoCorreo ──────────────────────────────────────
function generarCuerpoCorreo(registros, mensajeExtra, rangoFechas) {
  const n      = registros.length;
  const prom   = attr => registros.reduce((acc, c) => acc + (c[attr] || 0), 0) / n;
  const nombre = registros[0].nombre;
  const pila   = nombre.split(' ')[0];

  // ── Calcular pago variable escalonado por día ──────────────
  // T0: 0-200 → $0 | T1: 201-250 → $80 | T2: 251-300 → $90
  // T3: 301-350 → $100 | T4: 351+ → $110
  // Lógica: cada SKU se paga según el tramo en que cae (escalonado)
  function calcPago(sku) {
    if (sku <= 200) return 0;
    const tramos = [
      { desde: 201, hasta: 250,      tarifa: 80  },
      { desde: 251, hasta: 300,      tarifa: 90  },
      { desde: 301, hasta: 350,      tarifa: 100 },
      { desde: 351, hasta: Infinity, tarifa: 110 }
    ];
    let total = 0;
    for (const t of tramos) {
      if (sku < t.desde) break;
      const limite      = t.hasta === Infinity ? sku : Math.min(sku, t.hasta);
      const skusEnTramo = limite - t.desde + 1;
      if (skusEnTramo > 0) total += skusEnTramo * t.tarifa;
    }
    return total;
  }

  function getTramo(sku) {
    if (sku <= 200) return { nombre: 'T0', color: '#8A94A8' };
    if (sku <= 250) return { nombre: 'T1', color: '#1B8A5A' };
    if (sku <= 300) return { nombre: 'T2', color: '#1B8A5A' };
    if (sku <= 350) return { nombre: 'T3', color: '#D98A00' };
    return              { nombre: 'T4', color: '#D64294'  };
  }

  // ── fmtCLP declarado ANTES del map para evitar "Cannot access before initialization"
  const fmtCLP = v => new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', minimumFractionDigits: 0
  }).format(v);

  // Totales
  let totPago = 0, totPedidos = 0, totHoras = 0;
  let totAat = 0, totContacto = 0, totCompletitud = 0, totUph = 0, totReclamos = 0, totSku = 0;
  let diasCumple = 0;

  const filas = registros.map(r => {
    const pagoDelDia = calcPago(r.sku);
    const tramo      = getTramo(r.sku);
    totPago        += pagoDelDia;
    totPedidos     += r.pedidos;
    totHoras       += r.horasCx;
    totAat         += r.aat;
    totContacto    += r.contacto;
    totCompletitud += r.completitud;
    totUph         += r.uph;
    totReclamos    += r.reclamos;
    totSku         += r.sku;
    if (r.sku >= 201) diasCumple++;

    return `<tr style="background:${r.sku >= 201 ? '#ffffff' : '#fafafa'};">
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;font-size:11px;font-weight:600;white-space:nowrap;">${r.fechaStr}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;font-size:11px;">${r.pedidos}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;font-size:11px;">
        <span style="font-weight:700;">${r.sku}</span><br>
        <span style="padding:1px 5px;border-radius:10px;font-size:9px;font-weight:700;background:${tramo.color}22;color:${tramo.color};">${tramo.nombre}</span>
      </td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;font-size:11px;">${r.horasCx.toFixed(1)}h</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;font-size:11px;">${r.uph.toFixed(1)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;font-size:11px;font-weight:700;color:${pagoDelDia > 0 ? '#1B8A5A' : '#8A94A8'};white-space:nowrap;">
        ${pagoDelDia > 0 ? fmtCLP(pagoDelDia) : '$0'}
      </td>
    </tr>`;
  }).join('');

  // Promedios
  const aContacto     = (totContacto    / n).toFixed(1);
  const aCompletitud  = (totCompletitud / n).toFixed(1);
  const aReclamos     = (totReclamos    / n).toFixed(2);
  const aAat          = (totAat         / n).toFixed(1);
  const aSku          = (totSku         / n).toFixed(1);
  const aUph          = (totUph         / n).toFixed(1);
  const aHorasCx      = (totHoras       / n).toFixed(1);
  const pctCumple     = Math.round(diasCumple / n * 100);

  // Semáforo inline para correo
  const clr = (v, meta, inv) => {
    const tol = meta * 0.1;
    if (!inv) return v >= meta ? '#1B8A5A' : v >= meta - tol ? '#D98A00' : '#C0392B';
    return v <= meta ? '#1B8A5A' : v <= meta + tol ? '#D98A00' : '#C0392B';
  };

  // Mensaje motivacional
  const [msgBg, msgBorder, msgColor, msgTxt] = totPago < 5000
    ? ['#fff8fb','#f3d6e6','#7a3b5c',
       'Cada periodo es una nueva oportunidad para seguir creciendo. Queremos acompañarte para alcanzar un mejor resultado. ¡Trabajemos juntos!']
    : ['#f3fff8','#bfead3','#1e6b4a',
       '¡Qué alegría saludarte! Queremos compartir contigo el resumen de tu desempeño e incentivos generados. ¡Sigue así!'];

  // KPI box usando tabla para compatibilidad Gmail móvil
  const kpiBox = (lbl, val, color, sub) =>
    `<td width="25%" style="padding:4px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fc;border:1px solid #eee;border-radius:8px;">
        <tr><td style="padding:10px 6px;text-align:center;">
          <div style="font-size:9px;color:#8A94A8;text-transform:uppercase;font-weight:700;margin-bottom:4px;">${lbl}</div>
          <div style="font-size:18px;font-weight:700;color:${color};">${val}</div>
          <div style="font-size:9px;color:#aaa;margin-top:2px;">${sub}</div>
        </td></tr>
      </table>
    </td>`;

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;background:#f4f4f4;">
<tr><td align="center" style="padding:16px 8px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0;">

  <!-- HEADER -->
  <tr><td style="background:#0B1C49;padding:24px 20px;text-align:center;border-bottom:4px solid #D64294;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#D64294;margin-bottom:6px;">VALDISHOPPER · PICKER PRO</div>
    <div style="font-size:20px;font-weight:700;color:#ffffff;margin:0;">📊 Resumen de Gestión</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:6px;">${rangoFechas}</div>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:20px 16px;">

    <p style="font-size:15px;margin:0 0 16px 0;">Hola <b>${pila}</b> 👋,</p>

    <!-- MENSAJE MOTIVACIONAL -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
    <tr><td style="background:${msgBg};border:1px solid ${msgBorder};color:${msgColor};padding:14px;border-radius:10px;font-size:13px;line-height:1.6;">
      ${msgTxt}<br><br>
      <b>Este incentivo se suma a tu remuneración base.</b> A partir de <b>201 SKU/día</b> comienzas a generar un pago variable.
    </td></tr></table>

    ${mensajeExtra ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr><td style="background:#fff9fe;border-left:4px solid #D64294;padding:12px 14px;font-style:italic;color:#555;font-size:13px;">${mensajeExtra}</td></tr></table>` : ''}

    <!-- ESCALA DE TRAMOS -->
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#8A94A8;font-weight:700;margin-bottom:8px;">Escala de Pago Variable</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;background:#f8f9fc;border:1px solid #eee;border-radius:10px;">
    <tr>
      <td width="20%" style="padding:8px 4px;text-align:center;">
        <div style="font-size:11px;font-weight:700;color:#8A94A8;">T0</div>
        <div style="font-size:10px;color:#555;">0–200</div>
        <div style="font-size:11px;font-weight:700;color:#8A94A8;">$0</div>
      </td>
      <td width="20%" style="padding:8px 4px;text-align:center;background:#EAF7F1;border-radius:6px;">
        <div style="font-size:11px;font-weight:700;color:#1B8A5A;">T1</div>
        <div style="font-size:10px;color:#555;">201–250</div>
        <div style="font-size:11px;font-weight:700;color:#1B8A5A;">$80</div>
      </td>
      <td width="20%" style="padding:8px 4px;text-align:center;background:#EAF7F1;border-radius:6px;">
        <div style="font-size:11px;font-weight:700;color:#1B8A5A;">T2</div>
        <div style="font-size:10px;color:#555;">251–300</div>
        <div style="font-size:11px;font-weight:700;color:#1B8A5A;">$90</div>
      </td>
      <td width="20%" style="padding:8px 4px;text-align:center;background:#FEF7E6;border-radius:6px;">
        <div style="font-size:11px;font-weight:700;color:#D98A00;">T3</div>
        <div style="font-size:10px;color:#555;">301–350</div>
        <div style="font-size:11px;font-weight:700;color:#D98A00;">$100</div>
      </td>
      <td width="20%" style="padding:8px 4px;text-align:center;background:#FBF0F7;border-radius:6px;">
        <div style="font-size:11px;font-weight:700;color:#D64294;">T4</div>
        <div style="font-size:10px;color:#555;">351+</div>
        <div style="font-size:11px;font-weight:700;color:#D64294;">$110</div>
      </td>
    </tr>
    <tr><td colspan="5" style="padding:4px 8px 8px;text-align:center;font-size:9px;color:#aaa;">precio por SKU según tramo · lógica escalonada</td></tr>
    </table>

    <!-- KPIs SERVICIO — 2x2 en móvil -->
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#8A94A8;font-weight:700;margin-bottom:8px;">Indicadores de Servicio</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
      <tr>
        ${kpiBox('Contactabilidad', aContacto+'%',    clr(+aContacto,95,false),   'meta ≥95%')}
        ${kpiBox('Completitud',     aCompletitud+'%', clr(+aCompletitud,98,false),'meta ≥98%')}
        ${kpiBox('Tasa Reclamo',    aReclamos+'%',    clr(+aReclamos,1.5,true),   'meta ≤1.5%')}
        ${kpiBox('AAT',             aAat+'%',         clr(+aAat,100,false),       'meta 100%')}
      </tr>
    </table>

    <!-- KPIs PRODUCTIVIDAD -->
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#8A94A8;font-weight:700;margin:12px 0 8px 0;">Indicadores de Productividad</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        ${kpiBox('SKU Promedio', aSku,        clr(+aSku,200,false), 'meta ≥200')}
        ${kpiBox('UPH Promedio', aUph,        clr(+aUph,75,false),  'meta ~75')}
        ${kpiBox('Hrs Conexión', aHorasCx+'h','#0B1C49',            'ref. 5.5h')}
        ${kpiBox('Días ≥T1',     pctCumple+'%','#D64294',           diasCumple+'/'+n+' días')}
      </tr>
    </table>

    <!-- TABLA DETALLE DIARIO -->
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#8A94A8;font-weight:700;margin-bottom:8px;">Detalle Diario</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#0B1C49;color:#ffffff;">
          <th style="padding:9px 6px;text-align:center;font-size:10px;font-weight:700;">FECHA</th>
          <th style="padding:9px 6px;text-align:center;font-size:10px;font-weight:700;">PED.</th>
          <th style="padding:9px 6px;text-align:center;font-size:10px;font-weight:700;">SKU</th>
          <th style="padding:9px 6px;text-align:center;font-size:10px;font-weight:700;">HRS</th>
          <th style="padding:9px 6px;text-align:center;font-size:10px;font-weight:700;">UPH</th>
          <th style="padding:9px 6px;text-align:right;font-size:10px;font-weight:700;">PAGO</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr style="background:#f0f0f0;">
          <td colspan="5" style="padding:10px 6px;font-size:11px;font-weight:700;color:#555;text-align:center;">TOTAL PERIODO</td>
          <td style="padding:10px 6px;text-align:right;font-size:13px;font-weight:700;color:${totPago > 0 ? '#1B8A5A' : '#8A94A8'};">${fmtCLP(totPago)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- BLOQUE TOTAL — tabla en lugar de flex -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-radius:10px;overflow:hidden;">
    <tr style="background:#0B1C49;">
      <td style="padding:18px 16px;">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.6);margin-bottom:4px;">Total Incentivo a Pago</div>
        <div style="font-size:28px;font-weight:700;color:#ffffff;">${fmtCLP(totPago)}</div>
      </td>
      <td style="padding:18px 16px;text-align:right;vertical-align:middle;">
        <div style="font-size:11px;color:rgba(255,255,255,0.75);line-height:1.8;">
          ${n} días operados<br>
          ${totPedidos} pedidos<br>
          ${diasCumple} días con bono
        </div>
      </td>
    </tr>
    </table>

    <p style="font-size:10px;color:#aaa;margin-top:20px;text-align:center;border-top:1px solid #eee;padding-top:14px;">
      Reporte automático PickerPro · Dudas: responde este correo o contacta a tu supervisor.
    </p>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f8f9fc;padding:12px;text-align:center;font-size:10px;color:#bbb;">
    © Valdishopper | Mejora Continua
  </td></tr>

</table>
</td></tr>
</table>`;
}