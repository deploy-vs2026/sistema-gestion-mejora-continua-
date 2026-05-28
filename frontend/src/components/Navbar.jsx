import { useUpload } from "../contexts/UploadContext";
import { useAuth }   from "../contexts/AuthContext";

const UPLOAD_COLOR = {
  beetrak: "#00E5C3", pfa: "#FF6B35", pfa_delivery: "#A78BFA",
  falabella: "#7C3AED", falabella_historico: "#e11d48",
};

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
          <strong>
            {tipo === "pfa_delivery"       ? "DELIVERY"
             : tipo === "beetrak"          ? "BEETRACK"
             : tipo === "falabella_historico" ? "FAL. HISTÓRICO"
             : tipo.toUpperCase()}
          </strong>
          {filename && <span className="upload-pill-file"> · {filename}</span>}
        </span>
        <div className="upload-pill-bar">
          <div className="upload-pill-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="upload-pill-pct">
          {estado === "leyendo" ? label : `${label} · ${pct}%`}
        </span>
      </div>
    </div>
  );
}

/* Ícono hamburguesa / X */
function MenuIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {open ? (
        <>
          <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </>
      ) : (
        <>
          <line x1="3" y1="5"  x2="17" y2="5"  stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="3" y1="15" x2="17" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </>
      )}
    </svg>
  );
}

export default function Navbar({ onMenuToggle, menuOpen }) {
  const { user, rol, logout } = useAuth();
  const { uploads }           = useUpload();

  const activos = Object.entries(uploads).filter(
    ([, u]) => u.estado !== "idle" && u.estado !== "listo" && u.estado !== "error"
  );

  return (
    <nav className="navbar">
      {/* ── Izquierda: hamburguesa (mobile) + logo + brand ── */}
      <div className="navbar-left">
        <button
          className="btn-hamburger"
          onClick={onMenuToggle}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
        >
          <MenuIcon open={menuOpen} />
        </button>

        <img src="/image.png" alt="Logo" className="logo-img" />
        <span className="navbar-brand">
          <span className="brand-full">Sistema de Gestión Mejora Continua</span>
          <span className="brand-short">SIGMC</span>
        </span>
      </div>

      {/* ── Derecha: pills + user + salir ── */}
      <div className="navbar-right">
        {/* Upload pills */}
        <div className="upload-pills-wrap">
          {activos.map(([tipo, upload]) => (
            <UploadIndicator key={tipo} tipo={tipo} upload={upload} />
          ))}
        </div>

        {/* Upload badge mini — solo mobile si hay activos */}
        {activos.length > 0 && (
          <div className="upload-badge-mobile" title="Subiendo archivos...">
            <span className="upload-spinner" style={{ "--up-color": "#00E5C3" }} />
            <span className="upload-badge-count">{activos.length}</span>
          </div>
        )}

        <div className="user-info">
          <span className="user-email">{user?.displayName || user?.email}</span>
          <span className="user-rol">{rol}</span>
        </div>

        <button className="btn-nav-out" onClick={logout}>Salir</button>
      </div>
    </nav>
  );
}
