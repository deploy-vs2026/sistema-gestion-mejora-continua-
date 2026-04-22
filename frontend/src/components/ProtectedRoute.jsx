import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { PERMISOS } from "../permisos";

export default function ProtectedRoute({ children, view }) {
  const { authState, rol } = useAuth();

  if (authState === "loading") return <div className="loading-screen">Cargando...</div>;
  if (authState === "anon")    return <Navigate to="/login" replace />;
  if (authState === "denied")  return <Navigate to="/denied" replace />;
  if (authState === "waiting") return <Navigate to="/waiting" replace />;

  if (view && !PERMISOS[rol]?.includes(view)) return <Navigate to="/login" replace />;

  return children;
}
