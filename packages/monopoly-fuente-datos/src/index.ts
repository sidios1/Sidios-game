// API pública de monopoly-fuente-datos: fuente real de sobres (S2) sobre los
// datasets EA FC de datos/. Solo lo consume packages/server (Node); no hay
// bundle de navegador que proteger, así que no hace falta un exports map con
// subpaths puros/Node como en meloquiz-fuente-local.

export * from "./tiposCrudos.js";
export * from "./mapaLigas.js";
export * from "./elegibilidad.js";
export * from "./construirPoolSobres.js";
export * from "./clubes.js";
export * from "./fuenteDatosArchivo.js";
