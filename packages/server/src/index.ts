// API pública de @juegos/server: orquestador autoritativo + transportes.
// El cliente (Fase 3) importa de aquí los tipos del protocolo, la vista y
// la interfaz TransporteCliente; jamás reglas del juego (viven en el core).

export * from "./transporte.js";
export * from "./protocolo.js";
export * from "./vista.js";
export * from "./motor.js";
export * from "./orquestador.js";
export * from "./registroMotores.js";
export * from "./transporteMemoria.js";
export * from "./transporteLan.js";
