import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { PERMISOS as PERMISOS_DEFAULT } from "../permisos";

const ADMIN_EMAIL   = "agustin.williamson@valdishopper.com";
const ALLOWED_DOMAIN = "valdishopper.com";
const API           = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null);
  const [rol,       setRol]       = useState(null);
  // Mapa rol→vistas. Arranca con el default estático (nunca queda vacío) y se
  // hidrata desde el backend. Si el backend falla, se mantiene el default.
  const [permisos,  setPermisos]  = useState(PERMISOS_DEFAULT);
  // "loading" | "anon" | "denied" | "waiting" | "ok"
  const [authState, setAuthState] = useState("loading");

  const reloadPermisos = useCallback(() => {
    fetch(`${API}/configuracion/permisos`)
      .then(r => r.json())
      .then(d => { if (d && typeof d === "object" && Object.keys(d).length) setPermisos(d); })
      .catch(() => { /* se mantiene el default */ });
  }, []);

  useEffect(() => { reloadPermisos(); }, [reloadPermisos]);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setRol(null);
        setAuthState("anon");
        return;
      }

      const email  = firebaseUser.email;
      const domain = email.split("@")[1];

      if (domain !== ALLOWED_DOMAIN) {
        setUser(firebaseUser);
        setRol(null);
        setAuthState("denied");
        return;
      }

      if (email === ADMIN_EMAIL) {
        setUser(firebaseUser);
        setRol("admin");
        setAuthState("ok");
        return;
      }

      try {
        const res  = await fetch(`${API}/usuarios`);
        const data = await res.json();
        const userRol = data[email];
        if (userRol) {
          setUser(firebaseUser);
          setRol(userRol);
          setAuthState("ok");
        } else {
          setUser(firebaseUser);
          setRol(null);
          setAuthState("waiting");
        }
      } catch {
        setUser(firebaseUser);
        setRol(null);
        setAuthState("waiting");
      }
    });
  }, []);

  const login  = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, rol, authState, permisos, reloadPermisos, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
