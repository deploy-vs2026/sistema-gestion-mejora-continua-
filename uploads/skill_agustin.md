Markdown---
name: valdishopper-linea-grafica
description: >
  Línea gráfica oficial de Valdishopper SpA. Activar automáticamente cuando Agustín mencione
  "usar linea gráfica valdishopper", "colores valdishopper", "estilo valdishopper", o cuando se
  construya cualquier UI, componente, presentación, informe, artefacto HTML, o material visual
  relacionado con Valdishopper. Este skill reemplaza y corrige la paleta antigua del skill
  agustin-context (que tenía colores erróneos #E31E24). La fuente de verdad es el brand kit
  oficial entregado en marzo 2026.
---

# Valdishopper — Línea Gráfica Oficial

## 1. Paleta de Colores Principal (Brand Kit 2025)

| Token             | Hex       | Uso principal                                      |
|-------------------|-----------|----------------------------------------------------|
| `--vs-pink`       | `#D64294` | Color primario. CTAs, highlights, íconos activos   |
| `--vs-navy`       | `#0B1C49` | Color secundario. Fondos, headers, texto principal |
| `--vs-white`      | `#FFFFFF` | Fondo base, texto sobre navy                       |

> ⚠️ La paleta antigua (`#E31E24` rojo) está **obsoleta**. No usarla bajo ninguna circunstancia.

---

## 2. Paleta Extendida — Colores Compatibles (Generados)

Derivados armónicos para casos de uso donde se necesiten más colores sin romper la identidad:

| Token                  | Hex       | Derivación / Uso                                         |
|------------------------|-----------|----------------------------------------------------------|
| `--vs-pink-light`      | `#F0A0CC` | Fondos suaves, hover states, tags                        |
| `--vs-pink-dark`       | `#A02D6E` | Texto sobre fondo claro, estados pressed                 |
| `--vs-pink-subtle`     | `#FBF0F7` | Fondos de sección, tarjetas con acento pink              |
| `--vs-navy-light`      | `#1E3A7A` | Hover sobre navy, bordes secundarios                     |
| `--vs-navy-muted`      | `#3D5490` | Texto secundario sobre fondos oscuros                    |
| `--vs-navy-subtle`     | `#EEF1F8` | Fondos muy suaves con acento azul                        |
| `--vs-gray-light`      | `#F5F6FA` | Fondos neutros, filas alternas en tablas                 |
| `--vs-gray-mid`        | `#8A94A8` | Texto placeholder, subtítulos                            |
| `--vs-gray-dark`       | `#3A3F52` | Texto terciario, bordes sutiles                          |
| `--vs-success`         | `#1B8A5A` | Estados de éxito, confirmaciones                        |
| `--vs-warning`         | `#D98A00` | Alertas, avisos no críticos                              |
| `--vs-danger`          | `#C0392B` | Errores, acciones destructivas                           |

---

## 3. Tipografía

| Uso              | Fuente               | Peso       | Notas                                      |
|------------------|----------------------|------------|--------------------------------------------|
| Logo             | Gobold Italic        | Bold       | Solo para logo. No usar en UI              |
| Títulos web/app  | League Spartan       | 600-700    | Google Fonts. Disponible via CDN           |
| Cuerpo / UI      | Montserrat           | 400-600    | Google Fonts. Texto corrido y componentes  |
| Código           | JetBrains Mono       | 400        | Alternativa: monospace del sistema         |

### Google Fonts CDN para HTML:
```html
<link href="[https://fonts.googleapis.com/css2?family=League+Spartan:wght@600;700&family=Montserrat:wght@400;500;600&display=swap](https://fonts.googleapis.com/css2?family=League+Spartan:wght@600;700&family=Montserrat:wght@400;500;600&display=swap)" rel="stylesheet">
4. CSS Variables — Plantilla BaseIncluir siempre este bloque de variables al inicio del <style> en todo HTML/artefacto con línea gráfica Valdishopper:CSS:root {
  /* Colores primarios */
  --vs-pink:         #D64294;
  --vs-navy:         #0B1C49;
  --vs-white:        #FFFFFF;

  /* Extendida pink */
  --vs-pink-light:   #F0A0CC;
  --vs-pink-dark:    #A02D6E;
  --vs-pink-subtle:  #FBF0F7;

  /* Extendida navy */
  --vs-navy-light:   #1E3A7A;
  --vs-navy-muted:   #3D5490;
  --vs-navy-subtle:  #EEF1F8;

  /* Grises neutros */
  --vs-gray-light:   #F5F6FA;
  --vs-gray-mid:     #8A94A8;
  --vs-gray-dark:    #3A3F52;

  /* Semánticos */
  --vs-success:      #1B8A5A;
  --vs-warning:      #D98A00;
  --vs-danger:       #C0392B;

  /* Tipografía */
  --vs-font-title:   'League Spartan', sans-serif;
  --vs-font-body:    'Montserrat', sans-serif;

  /* Espaciado base */
  --vs-radius-sm:    6px;
  --vs-radius-md:    10px;
  --vs-radius-lg:    16px;
  --vs-radius-pill:  999px;

  /* Sombras */
  --vs-shadow-sm:    0 1px 4px rgba(11,28,73,0.10);
  --vs-shadow-md:    0 4px 16px rgba(11,28,73,0.14);
  --vs-shadow-lg:    0 8px 32px rgba(11,28,73,0.18);
}
5. Combinaciones de Color AprobadasEstas son las combinaciones con contraste suficiente y coherencia visual:FondoTexto / ElementoUso--vs-navy--vs-whiteHeaders, sidebars, hero sections--vs-navy--vs-pinkAccents, íconos sobre dark--vs-pink--vs-whiteBotones primarios, badges, CTAs--vs-white--vs-navyContenido principal--vs-white--vs-pinkLinks, highlights sobre blanco--vs-gray-light--vs-navyCards, fondos secundarios--vs-navy-subtle--vs-navyPanels, filas alternas--vs-pink-subtle--vs-pink-darkTags, badges soft❌ Combinaciones PROHIBIDAS:Pink sobre Navy sin suficiente tamaño de fuente (< 14px)Navy sobre NavyPink sobre PinkGris medio sobre blanco para texto importante6. Componentes ReutilizablesBotón PrimarioHTML<button style="
  background: var(--vs-pink);
  color: var(--vs-white);
  font-family: var(--vs-font-body);
  font-weight: 600;
  font-size: 14px;
  padding: 10px 24px;
  border: none;
  border-radius: var(--vs-radius-pill);
  cursor: pointer;
  letter-spacing: 0.3px;
  transition: background 0.2s;
" onmouseover="this.style.background='#A02D6E'" onmouseout="this.style.background='#D64294'">
  Acción principal
</button>
Botón SecundarioHTML<button style="
  background: transparent;
  color: var(--vs-navy);
  font-family: var(--vs-font-body);
  font-weight: 600;
  font-size: 14px;
  padding: 10px 24px;
  border: 1.5px solid var(--vs-navy);
  border-radius: var(--vs-radius-pill);
  cursor: pointer;
">
  Acción secundaria
</button>
Badge / TagHTML<span style="background: var(--vs-pink-subtle); color: var(--vs-pink-dark); font-family: var(--vs-font-body); font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: var(--vs-radius-pill);">Etiqueta</span>

<span style="background: var(--vs-navy-subtle); color: var(--vs-navy); font-family: var(--vs-font-body); font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: var(--vs-radius-pill);">Estado</span>
Card baseHTML<div style="
  background: var(--vs-white);
  border: 0.5px solid #D0D5E8;
  border-radius: var(--vs-radius-lg);
  padding: 20px 24px;
  box-shadow: var(--vs-shadow-sm);
  font-family: var(--vs-font-body);
">
  </div>
Header / Nav barHTML<header style="
  background: var(--vs-navy);
  padding: 14px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
">
  <span style="color: var(--vs-white); font-family: var(--vs-font-title); font-size: 18px; font-weight: 700; letter-spacing: -0.5px;">
    VALDI<span style="color: var(--vs-pink);">SHOPPER</span>
  </span>
</header>
Toast Notification (obligatorio por regla de Agustín)HTML<div style="position:fixed;bottom:24px;right:24px;background:var(--vs-navy);color:var(--vs-white);font-family:var(--vs-font-body);font-size:13px;padding:12px 18px;border-radius:var(--vs-radius-md);border-left:4px solid var(--vs-success);box-shadow:var(--vs-shadow-md);z-index:9999">
  ✓ Operación completada
</div>

<div style="position:fixed;bottom:24px;right:24px;background:var(--vs-navy);color:var(--vs-white);font-family:var(--vs-font-body);font-size:13px;padding:12px 18px;border-radius:var(--vs-radius-md);border-left:4px solid var(--vs-danger);box-shadow:var(--vs-shadow-md);z-index:9999">
  ✕ Error al procesar
</div>
7. ÍconosLibrería recomendada: Lucide Icons (coherente con el estilo flat de la marca)CDN: https://unpkg.com/lucide@latestColor primario de íconos sobre fondo claro: var(--vs-navy)Color de íconos sobre fondo navy: var(--vs-pink) o var(--vs-white)Stroke width recomendado: 1.5px8. Reglas de Diseño GeneralBordes sutiles: 0.5px o 1px solid. Nunca gruesos decorativos.Sin gradientes en UI funcional (solo permitidos en materiales de marketing).Espaciado generoso: padding mínimo 16px en cards, 24px en secciones.Animaciones: solo transform y opacity. Duración 150-300ms.Jerarquía tipográfica: Títulos en League Spartan, todo lo demás Montserrat.Modo oscuro de marca: usar --vs-navy como fondo base (NO negro puro).Consistencia en píldoras: borderRadius pill para botones y badges siempre.9. Aplicación por Tipo de ProyectoProyectoAplicación de línea gráficaApps HTML (ROTOR)CSS variables completas + League Spartan + Montserrat + Toasts navyDashboards PBIPaleta: Navy (#0B1C49), Pink (#D64294), Gris (#F5F6FA) como neutroBots TelegramTexto emoji + colores no aplican, usar nombres descriptivosPresentacionesFondos navy, texto blanco, accents pink, fuente MontserratDocumentos WordEncabezado navy, títulos navy, highlights pinkEmails HTMLHeader navy, CTA pill pink, fuente web-safe fallback Arial10. Referencia Rápida VisualPRIMARIO          SECUNDARIO        NEUTRO
██████ #D64294    ██████ #0B1C49    ██████ #FFFFFF
Pink              Navy              White

EXTENDIDOS PINK                    EXTENDIDOS NAVY
██████ #FBF0F7  subtle             ██████ #EEF1F8  subtle
██████ #F0A0CC  light              ██████ #3D5490  muted
██████ #A02D6E  dark               ██████ #1E3A7A  light

SEMÁNTICOS
██████ #1B8A5A  success
██████ #D98A00  warning
██████ #C0392B  danger
Brand Kit procesado: marzo 2026. Fuente: brand_kit_valdishopper.pngSkill adaptado para uso exclusivo de Agustín Williamson / Valdishopper SpA