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

export default function Login() {
  const { authState, rol, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authState === "ok")      navigate(ROLE_REDIRECT[rol] ?? "/master", { replace: true });
    if (authState === "denied")  navigate("/denied",  { replace: true });
    if (authState === "waiting") navigate("/waiting", { replace: true });
  }, [authState, rol, navigate]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img src="/image.png" alt="Logo" className="logo-img large" />
        <h1>SIGMC</h1>
        <p className="auth-subtitle"></p>
        <button className="btn-google" onClick={login}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z"/>
          </svg>
          Iniciar sesión con Google
        </button>
        <p className="auth-hint">Solo cuentas @valdishopper.com</p>
      </div>
    </div>
  );
}
