import { useAuth } from "../contexts/AuthContext";

export default function WaitingAccess() {
  const { user, logout } = useAuth();
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-icon waiting">⏳</div>
        <h2>Esperando acceso</h2>
        <p className="auth-subtitle">
          Tu cuenta <strong>{user?.email}</strong> aún no tiene rol asignado.
        </p>
        <p className="auth-hint">Contacta al administrador para obtener acceso.</p>
        <button className="btn-ghost" onClick={logout}>Cerrar sesión</button>
      </div>
    </div>
  );
}
