import { Suspense, lazy } from "react";
import { useParams } from "react-router-dom";
import "./dashboard/dashboard.css";

const PanelLAT         = lazy(() => import("./dashboard/PanelLAT"));
const PanelSecundarias = lazy(() => import("./dashboard/PanelSecundarias"));
const PanelHD          = lazy(() => import("./dashboard/PanelHD"));
const PanelFalabella   = lazy(() => import("./dashboard/PanelFalabella"));

export default function DashboardPFA() {
  const { panel = "lat" } = useParams();

  return (
    <div className="dashboard-pfa">
      <div className="db-content" style={{ width: "100%" }}>
        <Suspense fallback={
          <div style={{ padding: "2rem", color: "#8A94A8", fontFamily: "Montserrat, sans-serif" }}>
            Cargando panel…
          </div>
        }>
          {/* Todos los paneles montados — solo se ocultan con CSS */}
          <div style={{ display: panel === "lat"         ? "block" : "none" }}><PanelLAT /></div>
          <div style={{ display: panel === "secundarias" ? "block" : "none" }}><PanelSecundarias /></div>
          <div style={{ display: panel === "hd"          ? "block" : "none" }}><PanelHD /></div>
          <div style={{ display: panel === "falabella"   ? "block" : "none" }}><PanelFalabella /></div>
        </Suspense>
      </div>
    </div>
  );
}
