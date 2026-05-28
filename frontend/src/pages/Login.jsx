import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const ROLE_REDIRECT = {
  admin:    "/admin",
  master:   "/master",
  finanzas: "/finanzas",
  personas: "/personas",
  mejora:   "/mejora",
};

const FEATURES = [
  { icon: "↑",  label: "Carga de datos",     hint: "Beetrak, PFA y Geosort en un solo flujo" },
  { icon: "◴",  label: "KPIs operacionales", hint: "Fill rate, tiempos y productividad de pickers" },
  { icon: "≣",  label: "Datos limpios",      hint: "Exporta a Excel para análisis de mejora continua" },
];

export default function Login() {
  const { authState, rol, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authState === "ok")      navigate(ROLE_REDIRECT[rol] ?? "/master", { replace: true });
    if (authState === "denied")  navigate("/denied",  { replace: true });
    if (authState === "waiting") navigate("/waiting", { replace: true });
  }, [authState, rol, navigate]);

  return (
    <div
      className="auth-screen auth-screen--login"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        backgroundImage: `url('/FONDOCyber2.png')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        className="auth-card"
        style={{
          background: "var(--bg2)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: "44px 40px 36px",
          width: "100%",
          maxWidth: 440,
          boxShadow: "0 12px 48px rgba(11,28,73,0.10)",
          position: "relative",
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        {/* Banner superior con gradiente brand */}
        <div style={{
          position: "absolute", inset: "0 0 auto 0",
          height: 4, background: "var(--gradient)",
        }} />

        {/* Logo */}
        <img
          src="/valdishopper-logo.jpeg"
          alt="Valdishopper"
          className="logo-img large"
          style={{ width: 72, height: 72, objectFit: "contain", marginBottom: 18 }}
        />

        {/* Wordmark con texto gradiente */}
        <h1 style={{
          fontFamily: "var(--font-head)",
          fontSize: 36, fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: 0,
          background: "var(--gradient)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}>
          SIGMC
        </h1>

        <p style={{
          fontFamily: "var(--font-body)",
          fontSize: 11, color: "var(--text3)",
          letterSpacing: "0.18em", textTransform: "uppercase",
          fontWeight: 600, marginTop: 6,
        }}>
          Valdishopper · Mejora Continua
        </p>

        <p
          className="auth-subtitle"
          style={{
            fontSize: 13, color: "var(--text2)",
            margin: "20px 0 26px", lineHeight: 1.55, fontWeight: 300,
          }}
        >
          Sistema de Información para Gestión de Mejora Continua.
          Inicia sesión con tu cuenta corporativa para acceder a los datos
          de dispatch, picking y ruteo.
        </p>

        {/* Botón Google */}
        <button
          className="btn-google"
          onClick={login}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%",
            padding: "12px 22px",
            background: "var(--bg2)",
            color: "var(--text)",
            border: "1px solid var(--border2)",
            borderRadius: 99,
            fontFamily: "var(--font-body)",
            fontSize: 14, fontWeight: 600,
            cursor: "pointer",
            transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--pink)";
            e.currentTarget.style.boxShadow = "0 4px 18px rgba(214,66,148,0.18)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border2)";
            e.currentTarget.style.boxShadow = "";
            e.currentTarget.style.transform = "";
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z"/>
          </svg>
          Iniciar sesión con Google
        </button>

        {/* Hint */}
        <div
          className="auth-hint"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            marginTop: 14,
            padding: "5px 12px",
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: 99,
            fontSize: 11, color: "var(--text2)",
            fontWeight: 500,
          }}
        >
          <span style={{ color: "var(--green)", fontSize: 10 }}>●</span>
          Solo cuentas <strong style={{ fontWeight: 700, color: "var(--text)" }}>@valdishopper.com</strong>
        </div>

        {/* Línea de features didácticas */}
        <div style={{
          marginTop: 32, paddingTop: 24,
          borderTop: "1px solid var(--border)",
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14,
          textAlign: "left",
        }}>
          {FEATURES.map(f => (
            <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{
                width: 26, height: 26, borderRadius: 8,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "rgba(214,66,148,0.10)", color: "var(--pink)",
                fontSize: 13, fontWeight: 700,
              }}>{f.icon}</span>
              <span style={{
                fontFamily: "var(--font-head)",
                fontSize: 11, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.06em",
                color: "var(--text)",
              }}>{f.label}</span>
              <span style={{ fontSize: 10.5, color: "var(--text3)", lineHeight: 1.4 }}>
                {f.hint}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p style={{
          marginTop: 22, fontSize: 10, color: "var(--text3)",
          letterSpacing: "0.06em",
        }}>
          © {new Date().getFullYear()} Valdishopper SpA · Uso interno
        </p>
      </div>
    </div>
  );
}
