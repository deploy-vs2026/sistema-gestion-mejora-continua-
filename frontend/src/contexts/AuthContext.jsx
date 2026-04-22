import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

const ADMIN_EMAIL   = "agustin.williamson@valdishopper.com";
const ALLOWED_DOMAIN = "valdishopper.com";
const API           = import.meta.env.VITE_API_URL || "https://dataflow-api-519623119758.us-central1.run.app";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null);
  const [rol,       setRol]       = useState(null);
  // "loading" | "anon" | "denied" | "waiting" | "ok"
  const [authState, setAuthState] = useState("loading");

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
    <AuthContext.Provider value={{ user, rol, authState, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
