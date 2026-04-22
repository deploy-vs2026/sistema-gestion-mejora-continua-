# SIGMC UI Kit

A high-fidelity clickable prototype of the SIGMC internal BI application.

## Source
- Codebase: `agustinyamaha66-lab/union-data-bi-mejoracontinua` (master)
- Live app: https://sigmc-5fae5.web.app

## Screens included
1. **Login** — Google auth screen with Valdishopper branding
2. **Carga de Datos** (`/master`) — Drag-and-drop file upload with progress
3. **Mejora Continua** (`/mejora`) — Date filter + BigQuery data table + metrics
4. **Finanzas** (`/finanzas`) — Date filter + PFA financial table + export
5. **Admin** (`/admin`) — User management table with role assignment

## Usage
Open `index.html` in a browser. Click nav links to switch between screens.
All data is mocked — no real API calls.

## Components
- `Navbar.jsx` — Sticky nav with upload progress pills
- `Login.jsx` — Auth screen
- `Master.jsx` — File upload zones + log panel
- `Mejora.jsx` — Metrics + data table + filters
- `Finanzas.jsx` — Finance table + filters
