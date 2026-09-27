// src/controllers/inventario.controller.ts

// ─── GESTIÓN DE INGREDIENTES Y ESTADO (RE-EXPORTADO) ─────────────────────────
export {
  obtenerEstadoInventario,
  crearIngrediente,
  actualizarIngrediente,
  eliminarIngrediente
} from './ingrediente.controller'

// ─── GESTIÓN DE RECETAS / ESCANDALLOS (RE-EXPORTADO) ─────────────────────────
export {
  obtenerRecetas,
  guardarReceta,
  eliminarReceta
} from './receta.controller'
