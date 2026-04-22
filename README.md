# SIGMC Design System

*Generated from source: `agustinyamaha66-lab/union-data-bi-mejoracontinua` (master branch)*
*Live app: https://sigmc-5fae5.web.app*

---

## Product Context

**SIGMC** (Sistema de Información de Gestión de Mejora Continua) is an internal BI web application for **Valdishopper** — a Chilean e-commerce logistics operation. It processes and visualizes dispatch (Beetrak) and picking (PFA) data for store operations and continuous improvement analysis.

**Stack:** React + Vite frontend, FastAPI backend on Cloud Run, BigQuery for data storage, Firebase Auth (Google login), Firebase Hosting.

### Products / Views
| View | Role | Description |
|------|------|-------------|
| **Carga de Datos** (`/master`) | master, admin | Upload Beetrak + PFA Excel/CSV files via drag-and-drop |
| **Finanzas** (`/finanzas`) | finanzas, admin | Query and export PFA financial data from BigQuery |
| **Mejora Continua** (`/mejora`) | mejora, admin | View + export Beetrak + PFA clean data with date filters |
| **Geosort** (`/falabella`) | admin | Load Geosort Falabella data from GCS bucket |
| **Admin** (`/admin`) | admin | Manage users and roles |
| **Login** | public | Google OAuth, only @valdishopper.com accounts |

---

## ⚡ Brand Kit Oficial (marzo 2026)

Integrado desde el skill `valdishopper-linea-grafica` + **PDF: BrandKit Valdishopper.pdf** (16 págs).

**El PDF es la fuente de verdad.** Confirma:
- Colores: Pink `#D64294`, Oxford Blue `#0B1C49`, China Rose `#9F4F69`, Claret `#7E143A`
- Tipografía títulos: **Montserrat** (700–800)
- Tipografía textos: **Poppins** (300–400)
- Contenido del PDF: análisis del feed Instagram actual + propuestas de rediseño (posts, stories, promos, LinkedIn, logo navidad, roles Shopper/Driver/Picker)

> ⚠️ **Corrección:** El skill `valdishopper-linea-grafica` indicaba "League Spartan + Montserrat" — esto fue un error. El PDF oficial confirma **Montserrat + Poppins**, que es exactamente lo que usa la app SIGMC.

| Aspecto | Brand Kit Oficial (PDF) | App SIGMC actual |
|---------|-------------------------|-----------------|
| Tipografía títulos | **Montserrat** 700-800 ✅ | Montserrat 800 ✅ |
| Tipografía cuerpo | **Poppins** 300-400 ✅ | Poppins 300-400 ✅ |
| Color primario | `#D64294` ✅ | `#D64294` ✅ |
| Color secundario | `#0B1C49` ✅ | `#0B1C49` ✅ |
| Color obsoleto | ~~`#E31E24`~~ — NO usar | no presente ✅ |
| Radios | 6/10/16/pill | 8/12/16/20/24px |
| Sombras | 3 niveles navy-based | card + modal + btn-pink |
| Toasts | Navy + border-left coloreado | flash msg inline pill |
| Iconos | Lucide Icons (CDN) | Unicode chars (✓ ✗) |

**Para nuevos diseños:** usar `--vs-*` tokens.
**Para editar la app actual:** usar tokens `--font-head / --font-body` y clases existentes.

---

## Content Fundamentals

### Language & Tone
- **Language:** Spanish — all UI copy is in Spanish (Chilean locale)
- **Voice:** Technical and direct. No marketing fluff, no warmth. This is an internal ops tool.
- **Casing:** Sentence case for labels; ALL CAPS for section labels, badges, and technical abbreviations (e.g. `BEETRAK`, `PFA`, `CARGA DE DATOS`)
- **Pronouns:** "Tú" implicit (imperative verbs: *"Selecciona archivos"*, *"Buscar"*, *"Exportar Excel"*)
- **Numbers/data:** Chilean notation not enforced in UI; dates as `YYYY-MM-DD` (ISO) in inputs
- **Emoji:** Not used in UI copy. Unicode checkmarks (✓) and X marks used as status icons.
- **Microcopy examples:**
  - *"Mostrando 100 de N registros"*
  - *"Solo cuentas @valdishopper.com"*
  - *"Arrastra o haz clic"*
  - *"Exportar Excel"*
  - *"Salir"*
- **Error copy:** Direct, lowercase: *"Error al cargar"*, *"No hay datos"*

---

## Visual Foundations

### Color System
Primary palette is **dark navy + hot pink**, creating a high-contrast internal tool aesthetic that feels modern and bold, not enterprise-gray.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#F0F2F8` | Page background |
| `--bg2` | `#FFFFFF` | Card/panel surface |
| `--bg3` | `#E4E8F4` | Subtle highlight, table alternating row, footer strips |
| `--border` | `rgba(11,28,73,0.10)` | Default borders |
| `--border2` | `rgba(11,28,73,0.18)` | Stronger borders, scrollbar thumbs |
| `--text` | `#0B1C49` | Primary text (dark navy) |
| `--text2` | `#3A4A6B` | Secondary text |
| `--text3` | `#7A869E` | Muted / labels |
| `--pink` | `#D64294` | **Brand primary accent** — buttons, active nav, borders |
| `--claret` | `#7E143A` | Gradient endpoint, deep brand |
| `--china` | `#9F4F69` | Mejora Continua section accent |
| `--green` | `#00C48C` | Success, upload done, pulse dot |
| `--blue` | `#4A90E2` | Join hints, info states |
| `--red` | `#FF4466` | Errors, destructive actions |
| `--orange` | `#FF6B35` | PFA upload progress indicator |
| `--gradient` | `linear-gradient(135deg, #D64294, #7E143A)` | Logo mark, page title gradient text |

**Background treatment:** Page body has two radial gradient overlays (fixed): blue `rgba(42,68,148,0.12)` at top-left, pink `rgba(214,66,148,0.06)` at bottom-right. This gives the flat `#F0F2F8` background a subtle atmospheric depth.

**Per-section accent:** Components use a `--accent` CSS variable (e.g. `--accent: var(--green)`) to allow section-specific color theming while sharing component code (e.g. `.metric-card { border-top: 2px solid var(--accent) }`).

### Typography
- **Heading font:** `Montserrat` (weights 400, 700, 800) — bold, geometric, uppercase for labels
- **Body font:** `Poppins` (weights 300, 400, 700) — clean humanist, default weight 300 (light)
- **Base font size:** 14px, line-height 1.5
- **Heading patterns:** `font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em` for section labels — the "eyebrow" treatment is pervasive
- **Page titles:** `font-size: 20px; font-weight: 800; border-left: 3px solid var(--accent)`
- **Stat values:** `font-size: 28px; font-weight: 800; font-family: Montserrat` — big, bold numbers
- **Data table headers:** 10px uppercase Montserrat with `letter-spacing: 0.06em`
- **Gradient text:** Auth screen brand title uses `-webkit-background-clip: text` with `--gradient`

### Spacing & Layout
- Page content padding: `32px`
- Card/panel padding: `20px`
- Gap between grid items: `16px–24px`
- Two-column master layout: `1fr 320px` (main + sidebar)
- Responsive breakpoint at `900px` → single column

### Borders & Radii
| Element | Radius |
|---------|--------|
| Inputs, selects | `8px` |
| Cards, panels, tables | `12px` |
| Modals | `16px` |
| Auth card | `20px` |
| Buttons, pills, nav links | `24px` (fully rounded) |

**Border style:** `1px solid var(--border)` everywhere. File zones use `1px dashed` to signal droppability. Top accent line on cards is `2px solid var(--accent)` — a deliberate design signature.

### Shadows
- Cards: minimal to none in most views — borders do the separation work
- Auth card: `box-shadow: 0 8px 40px rgba(11,28,73,0.08)` — only elevated surface
- Modal: `box-shadow: 0 20px 60px rgba(0,0,0,0.25)` — full overlay elevation
- Button hover: `box-shadow: 0 4px 20px rgba(214,66,148,0.30)` — pink glow

### Animations
- `fadeIn`: `opacity: 0 → 1` + `translateY(4px → 0)`, 0.3s ease — cards appearing after data load
- `slideUp`: `translateY(16px → 0)` + opacity, 0.2s ease — modal entrance
- `spin`: 0.8s linear infinite — spinner
- `pulse`: 2s ease-in-out infinite — status dot breathing animation
- Upload progress bar: CSS `transition: width 0.3s ease`
- Button hover: `translateY(-1px)` + `filter: brightness(1.15)` + pink box-shadow

### Hover & Press States
- **Primary buttons:** `brightness(1.15)` + `translateY(-1px)` + pink `box-shadow`
- **Ghost buttons:** border color → `var(--pink)`, text color → `var(--pink)`
- **Nav links:** subtle `rgba(11,28,73,0.05)` background
- **Table rows:** `rgba(214,66,148,0.05)` pink tint on hover
- **File zones:** dashed border → solid pink border + `rgba(214,66,148,0.06)` fill

### Imagery
- **Logo:** Valdishopper mark (`assets/logo-valdishopper.png`) — white "V" + cart+pin icon on `#0B1C49` dark navy square
- **Hero:** `assets/hero.png` — used in some dashboard states
- No background images, no full-bleed photos, no illustrations
- No gradients on backgrounds (only subtle fixed radial glows on body)

### Cards
- Background: `var(--bg2)` (#fff)
- Border: `1px solid var(--border)`
- Border-radius: `12px`
- Top accent: `2px solid var(--accent)` (color varies by section)
- No drop shadows on cards (except auth card)
- Padding: `20px`

---

## Iconography (Brand Kit Oficial)

**Librería recomendada:** [Lucide Icons](https://unpkg.com/lucide@latest) — coherente con el estilo flat de la marca.
- CDN: `https://unpkg.com/lucide@latest`
- Color primario sobre fondo claro: `var(--vs-navy)`
- Color sobre fondo navy: `var(--vs-pink)` o `var(--vs-white)`
- Stroke width recomendado: `1.5px`

**App actual (SIGMC):** usa caracteres Unicode como iconos — no hay librería de iconos. Ver sección anterior.

## Iconography (App actual)

**Approach:** The app uses **Unicode characters and emoji as inline icons** — not an icon library or icon font. Specific patterns:
- ✓ Checkmark: `.check` element, `font-size: 22px; color: var(--green)`
- ✗ X mark: `.x-mark` element, `font-size: 22px; color: var(--red)`
- Spinner: Pure CSS `border` animation, not an icon
- Status pulse dot: CSS `border-radius: 50%` with `pulse` animation

**Social icons:** `assets/icons.svg` is a sprite containing social media icons (GitHub, X/Twitter, Discord, Bluesky, etc.) — likely from the project template, not product UI.

**Logo mark fallback:** When no `<img>` is available, a CSS `.logo-mark` hexagon shape is used with `var(--gradient)` fill and `clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)`.

**Navigation section colors** (used to color-code nav links and accents):
- Carga de Datos → `var(--green)` `#00C48C`
- Finanzas → `var(--pink)` `#D64294`
- Mejora Continua → `var(--china)` `#9F4F69`
- Geosort → `#7C3AED` (violet)
- Admin → `rgba(255,255,255,0.6)`

---

## File Index

```
README.md                    ← This file
SKILL.md                     ← Agent skill definition
colors_and_type.css          ← CSS custom properties (tokens + semantic)
assets/
  logo-valdishopper.png      ← Valdishopper brand logo
  favicon.svg                ← App favicon
  icons.svg                  ← Social icon SVG sprite
  hero.png                   ← Dashboard hero image
preview/
  colors-base.html           ← Base color palette swatches
  colors-semantic.html       ← Semantic + section accent colors
  type-scale.html            ← Typography scale specimen
  type-components.html       ← Component typography patterns
  spacing-radii.html         ← Corner radius tokens
  spacing-layout.html        ← Spacing scale + layout grid
  components-buttons.html    ← Button variants + states
  components-nav.html        ← Navbar + nav links
  components-cards.html      ← Card + metric card variants
  components-table.html      ← Data table + paginator
  components-forms.html      ← Input, select, date filter
  components-badges.html     ← Badges, pills, status indicators
  components-upload.html     ← File zone + upload pill
  brand-logo.html            ← Logo + logo mark usage
ui_kits/
  sigmc/
    README.md
    index.html               ← Full SIGMC app prototype
    Navbar.jsx
    Login.jsx
    Master.jsx
    Mejora.jsx
    Finanzas.jsx
```
