// Mapa centralizado: rol → vistas permitidas
// Para dar más accesos a un rol, solo agrega la vista acá.
export const PERMISOS = {
  admin:       ["master", "finanzas", "mejora", "falabella", "falabella-historico", "instaleep", "picker-outsourcing", "dashboard-pfa", "admin"],
  master:      ["master"],
  finanzas:    ["master", "finanzas", "dashboard-pfa"],
  mejora:      ["mejora", "master"],
  operaciones: ["dashboard-pfa", "picker-outsourcing"],
};
