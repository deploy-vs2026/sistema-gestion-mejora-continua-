import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PERMISOS } from "../permisos";

/* ── Íconos SVG inline ── */
const ICONS = {
  master: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h14M3 8h8M3 12h5" />
      <path d="M13 12l2 2 4-4" />
    </svg>
  ),
  finanzas: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="16" height="12" rx="2" />
      <path d="M2 9h16M7 5V3M13 5V3" />
    </svg>
  ),
  mejora: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,14 7,9 11,12 18,5" />
      <polyline points="14,5 18,5 18,9" />
    </svg>
  ),
  falabella: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2C6.69 2 4 4.69 4 8c0 4.5 6 10 6 10s6-5.5 6-10c0-3.31-2.69-6-6-6z" />
      <circle cx="10" cy="8" r="2" />
    </svg>
  ),
  "falabella-historico": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 18a8 8 0 100-16 8 8 0 000 16z" />
      <polyline points="10,6 10,10 13,12" />
    </svg>
  ),
  instaleep: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13,2 3,12 10,12 7,18 17,8 10,8" />
    </svg>
  ),
  "picker-outsourcing": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="6" r="3" />
      <path d="M2 18c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  ),
  "dashboard-pfa": (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="7" height="8" rx="1" />
      <rect x="11" y="2" width="7" height="5" rx="1" />
      <rect x="11" y="9" width="7" height="9" rx="1" />
      <rect x="2" y="12" width="7" height="6" rx="1" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.22 3.22l1.42 1.42M15.36 15.36l1.42 1.42M3.22 16.78l1.42-1.42M15.36 4.64l1.42-1.42" />
    </svg>
  ),
};

const NAV_ITEMS = [
  { path: "/master",              view: "master",              label: "Carga de Datos",  color: "var(--green)" },
  { path: "/finanzas",            view: "finanzas",            label: "Finanzas",         color: "var(--pink)"  },
  { path: "/mejora",              view: "mejora",              label: "Mejora Continua",  color: "var(--china)" },
  { path: "/falabella",           view: "falabella",           label: "Geosort",          color: "#A78BFA"      },
  { path: "/falabella-historico", view: "falabella-historico", label: "F. Histórico",     color: "#e11d48"      },
  { path: "/instaleep",           view: "instaleep",           label: "Instaleap",        color: "#6366F1"      },
  { path: "/admin",               view: "admin",               label: "Admin",            color: "rgba(255,255,255,0.45)" },
];

const DASH_COLOR = "#F59E0B";
const DASH_SUB_ITEMS = [
  { path: "/dashboard-pfa/lat",         label: "Operación LAT",     view: "dashboard-pfa"      },
  { path: "/dashboard-pfa/secundarias", label: "Secundarias",        view: "dashboard-pfa"      },
  { path: "/dashboard-pfa/hd",          label: "Operación HD",       view: "dashboard-pfa"      },
  { path: "/dashboard-pfa/falabella",   label: "Falabella",          view: "dashboard-pfa"      },
  { path: "/picker-outsourcing",         label: "Picker Outsourcing", view: "picker-outsourcing" },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { rol, permisos } = useAuth();
  const location   = useLocation();

  const isDashActive = location.pathname.startsWith("/dashboard-pfa") || location.pathname === "/picker-outsourcing";
  const [dashOpen, setDashOpen] = useState(isDashActive);

  useEffect(() => {
    if (isDashActive) setDashOpen(true);
  }, [isDashActive]);

  const perms   = (permisos ?? PERMISOS)[rol] ?? PERMISOS[rol] ?? [];
  const hasDash = perms.includes("dashboard-pfa") || perms.includes("picker-outsourcing");
  const visible   = NAV_ITEMS.filter(item => perms.includes(item.view));
  const mainItems = visible.filter(i => i.view !== "admin" && i.view !== "picker-outsourcing");
  const adminItem = visible.find(i => i.view === "admin");

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={onClose} aria-hidden="true" />
      )}

      <aside className={`sidebar ${mobileOpen ? "sidebar--mobile-open" : ""}`}>
        <nav className="sidebar-nav">

          {mainItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                style={{ "--s-color": item.color }}
                onClick={onClose}
                title={item.label}
              >
                <span className="sidebar-icon">{ICONS[item.view] ?? ICONS.admin}</span>
                <span className="sidebar-label">{item.label}</span>
              </Link>
            );
          })}

          {/* ── Dashboard PFA expandible ── */}
          {hasDash && (
            <>
              <button
                className={`sidebar-link${isDashActive ? " active" : ""}`}
                style={{ "--s-color": DASH_COLOR, background: "none", border: "none", cursor: "pointer", width: "100%" }}
                onClick={() => setDashOpen(v => !v)}
                title="Paneles Operativos"
              >
                <span className="sidebar-icon">{ICONS["dashboard-pfa"]}</span>
                <span className="sidebar-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  Paneles Operativos
                  <svg
                    width="11" height="11" viewBox="0 0 12 12" fill="none"
                    stroke="currentColor" strokeWidth="2.5"
                    style={{ flexShrink: 0, transform: dashOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}
                  >
                    <polyline points="2,4 6,8 10,4"/>
                  </svg>
                </span>
              </button>

              {dashOpen && DASH_SUB_ITEMS.filter(s => perms.includes(s.view)).map(sub => {
                const isActive = location.pathname === sub.path || location.pathname.startsWith(sub.path + "/");
                return (
                  <Link
                    key={sub.path}
                    to={sub.path}
                    className={`sidebar-link sidebar-sub${isActive ? " active" : ""}`}
                    style={{ "--s-color": DASH_COLOR, paddingLeft: "2.2rem" }}
                    onClick={onClose}
                    title={sub.label}
                  >
                    <span className="sidebar-sub-dot" />
                    <span className="sidebar-label">{sub.label}</span>
                  </Link>
                );
              })}
            </>
          )}

          {adminItem && (() => {
            const isActive = location.pathname === adminItem.path;
            return (
              <Link
                to={adminItem.path}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                style={{ "--s-color": adminItem.color }}
                onClick={onClose}
                title={adminItem.label}
              >
                <span className="sidebar-icon">{ICONS.admin}</span>
                <span className="sidebar-label">{adminItem.label}</span>
              </Link>
            );
          })()}

        </nav>
      </aside>
    </>
  );
}
