import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useUpload } from "../contexts/UploadContext";
import { PERMISOS } from "../permisos";

const NAV_ITEMS = [
  { path: "/master",    view: "master",    label: "Carga de Datos",  color: "var(--green)" },
  { path: "/finanzas",  view: "finanzas",  label: "Finanzas",        color: "var(--pink)"  },
  { path: "/mejora",    view: "mejora",    label: "Mejora Continua", color: "var(--china)" },
  { path: "/falabella", view: "falabella", label: "Geosort",         color: "#A78BFA"      },
  { path: "/admin",     view: "admin",     label: "Admin",           color: "rgba(255,255,255,0.5)" },
];

const UPLOAD_COLOR = { beetrak: "#00E5C3", pfa: "#FF6B35", pfa_delivery: "#A78BFA", falabella: "#7C3AED" };

function UploadIndicator({ tipo, upload }) {
  const { estado, loteActual, totalLotes, filename } = upload;
  if (estado === "idle" || estado === "listo" || estado === "error") return null;

  const pct   = totalLotes > 0 ? Math.round((loteActual / totalLotes) * 100) : 0;
  const color = UPLOAD_COLOR[tipo];
  const label = estado === "leyendo" ? "Leyendo..." : `${loteActual}/${totalLotes} lotes`;

  return (
    <div className="upload-pill" style={{ "--up-color": color }}>
      <span className="upload-spinner" />
      <div className="upload-pill-info">
        <span className="upload-pill-name">
          <strong>{tipo === "pfa_delivery" ? "DELIVERY" : tipo === "beetrak" ? "BEETRACK" : tipo.toUpperCase()}</strong>
          {filename && <span className="upload-pill-file"> · {filename}</span>}
        </span>
        <div className="upload-pill-bar">
          <div className="upload-pill-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="upload-pill-pct">{estado === "leyendo" ? label : `${label} · ${pct}%`}</span>
      </div>
    </div>
  );
}

export default function Navbar() {
  const { user, rol, logout } = useAuth();
  const { uploads }           = useUpload();
  const location              = useLocation();

  const visible = NAV_ITEMS.filter(item => PERMISOS[rol]?.includes(item.view));
  const activos = Object.entries(uploads).filter(([, u]) =>
    u.estado !== "idle" && u.estado !== "listo" && u.estado !== "error"
  );

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <img src="/image.png" alt="Logo" className="logo-img" />
        <span className="navbar-brand">SIGMC</span>
        <div className="nav-links">
          {visible.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? "active" : ""}`}
              style={{ "--link-color": item.color }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="navbar-right">
        {activos.map(([tipo, upload]) => (
          <UploadIndicator key={tipo} tipo={tipo} upload={upload} />
        ))}
        <div className="user-info">
          <span className="user-email">{user?.displayName || user?.email}</span>
          <span className="user-rol">{rol}</span>
        </div>
        <button className="btn-nav-out" onClick={logout}>Salir</button>
      </div>
    </nav>
  );
}
