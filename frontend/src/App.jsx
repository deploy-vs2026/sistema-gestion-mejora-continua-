import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { UploadProvider } from "./contexts/UploadContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login        from "./pages/Login";
import AccessDenied from "./pages/AccessDenied";
import WaitingAccess from "./pages/WaitingAccess";
import Master   from "./pages/Master";
import Admin    from "./pages/Admin";
import Finanzas  from "./pages/Finanzas";
import Mejora    from "./pages/Mejora";
import Falabella from "./pages/Falabella";
import "./App.css";

export default function App() {
  return (
    <AuthProvider>
      <UploadProvider>
      <BrowserRouter>
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

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      </UploadProvider>
    </AuthProvider>
  );
}
