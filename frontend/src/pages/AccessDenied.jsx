import { useAuth } from "../contexts/AuthContext";

export default function AccessDenied() {
  const { logout } = useAuth();
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-icon denied">✗</div>
        <h2>Acceso denegado</h2>
        <p className="auth-subtitle">Esta plataforma es exclusiva para cuentas @valdishopper.com</p>
        <button className="btn-ghost" onClick={logout}>Cerrar sesión</button>
      </div>
    </div>
  );
}
