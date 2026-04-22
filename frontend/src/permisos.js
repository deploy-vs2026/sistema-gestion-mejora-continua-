// Mapa centralizado: rol → vistas permitidas
// Para dar más accesos a un rol, solo agrega la vista acá.
export const PERMISOS = {
  admin:    ["master", "finanzas", "mejora", "falabella", "admin"],
  master:   ["master"],
  finanzas: ["master", "finanzas"],
  mejora:   ["mejora", "master"],
};
