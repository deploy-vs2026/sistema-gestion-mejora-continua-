// Mapa centralizado: rol → vistas permitidas.
// DEFAULT — se usa como fallback si el backend no responde. La configuración
// vigente se edita desde el Panel Admin y se persiste en BigQuery
// (endpoint /configuracion/permisos). Debe coincidir con server.py PERMISOS_DEFAULT.
export const PERMISOS = {
  admin:       ["master", "finanzas", "mejora", "falabella", "falabella-historico", "instaleep", "picker-outsourcing", "dashboard-pfa", "admin"],
  master:      ["master"],
  finanzas:    ["master", "finanzas", "dashboard-pfa"],
  mejora:      ["mejora", "master"],
  operaciones: ["dashboard-pfa", "picker-outsourcing"],
};

// Roles editables en el Panel Admin
export const ROLES = ["admin", "master", "finanzas", "mejora", "operaciones"];

// Vistas/pestañas asignables a cada rol (con etiqueta legible para el editor)
export const VISTAS = [
  { view: "master",              label: "Carga de Datos" },
  { view: "finanzas",            label: "Finanzas" },
  { view: "mejora",              label: "Mejora Continua" },
  { view: "falabella",           label: "Geosort" },
  { view: "falabella-historico", label: "F. Histórico" },
  { view: "instaleep",           label: "Instaleap" },
  { view: "dashboard-pfa",       label: "Paneles Operativos" },
  { view: "picker-outsourcing",  label: "Picker Outsourcing" },
  { view: "admin",               label: "Admin" },
];
