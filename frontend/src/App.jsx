import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { UploadProvider } from "./contexts/UploadContext";
import ProtectedRoute   from "./components/ProtectedRoute";
import Navbar           from "./components/Navbar";
import Sidebar          from "./components/Sidebar";
import Login            from "./pages/Login";
import AccessDenied     from "./pages/AccessDenied";
import WaitingAccess    from "./pages/WaitingAccess";
import Master           from "./pages/Master";
import Admin            from "./pages/Admin";
import Finanzas         from "./pages/Finanzas";
import Mejora           from "./pages/Mejora";
import Falabella        from "./pages/Falabella";
import FalabellaHistorico from "./pages/FalabellaHistorico";
import Instaleep        from "./pages/Instaleep";
import PickerOutsourcing from "./pages/PickerOutsourcing";
import DashboardPFA     from "./pages/DashboardPFA";
import { PERMISOS } from "./permisos";
import "./App.css";

const PICKER_URL =
  "https://script.google.com/a/macros/valdishopper.com/s/AKfycbydbxuIbAEi5BCyIqRUuxQJeWLUkFMSEXa7ZbBRsaZetzChX1QFUU3QhpRM-V9M-yO4/exec";


const SHELL_EXCLUDED = ["/login", "/denied", "/waiting"];

function AppContent() {
  const location      = useLocation();
  const { rol, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showShell    = user && !SHELL_EXCLUDED.includes(location.pathname);
  const pickerActive = location.pathname === "/picker-outsourcing";
  const hasAccess    = PERMISOS[rol]?.includes("picker-outsourcing");

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <>
      {showShell && (
        <Navbar
          onMenuToggle={() => setSidebarOpen(v => !v)}
          menuOpen={sidebarOpen}
        />
      )}

      <div className={`app-shell ${showShell ? "app-shell--with-nav" : ""}`}>
        {showShell && (
          <Sidebar
            mobileOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        <main className={`app-main ${showShell ? "app-main--with-sidebar" : ""}`}>

          {/* ── Iframe Picker: siempre montado, se muestra/oculta con CSS ── */}
          {hasAccess && (
            <div style={{
              display:       pickerActive ? "flex" : "none",
              flexDirection: "column",
              height:        "calc(100vh - 64px)",   /* viewport menos el navbar */
            }}>
              <iframe
                src={PICKER_URL}
                title="Reporte Picker Outsourcing"
                style={{ flex: 1, border: "none", width: "100%" }}
                allow="same-origin"
              />
            </div>
          )}

          {/* ── Resto de rutas — ocultas cuando está picker activo ── */}
          <div style={{ display: pickerActive ? "none" : "block" }}>
            <Routes>
              <Route path="/login"   element={<Login />} />
              <Route path="/denied"  element={<AccessDenied />} />
              <Route path="/waiting" element={<WaitingAccess />} />

              <Route path="/master" element={
                <ProtectedRoute view="master"><Master /></ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute view="admin"><Admin /></ProtectedRoute>
              } />
              <Route path="/finanzas" element={
                <ProtectedRoute view="finanzas"><Finanzas /></ProtectedRoute>
              } />
              <Route path="/mejora" element={
                <ProtectedRoute view="mejora"><Mejora /></ProtectedRoute>
              } />
              <Route path="/falabella" element={
                <ProtectedRoute view="falabella"><Falabella /></ProtectedRoute>
              } />
              <Route path="/falabella-historico" element={
                <ProtectedRoute view="falabella-historico"><FalabellaHistorico /></ProtectedRoute>
              } />
              <Route path="/instaleep" element={
                <ProtectedRoute view="instaleep"><Instaleep /></ProtectedRoute>
              } />
              <Route path="/picker-outsourcing" element={
                <ProtectedRoute view="picker-outsourcing"><PickerOutsourcing /></ProtectedRoute>
              } />
              <Route path="/dashboard-pfa" element={<Navigate to="/dashboard-pfa/lat" replace />} />
              <Route path="/dashboard-pfa/:panel" element={
                <ProtectedRoute view="dashboard-pfa"><DashboardPFA /></ProtectedRoute>
              } />

              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </div>

        </main>
      </div>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <UploadProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </UploadProvider>
    </AuthProvider>
  );
}
