// src/routes/inventario.routes.ts
import { Router } from 'express'
import {
  obtenerEstadoInventario,
  crearIngrediente,
  actualizarIngrediente,
  eliminarIngrediente,
  obtenerRecetas,
  guardarReceta,
  eliminarReceta
} from '../controllers/inventario.controller'
// Middlewares de seguridad
import { verificarToken } from '../middlewares/auth.middleware'
import { soloAdmins } from '../middlewares/rol.middleware'

const router = Router()

// ─── RUTAS PARA INGREDIENTES ─────────────────────────────────────────────────

// GET: Todos los usuarios con sesión iniciada pueden ver los ingredientes y su disponibilidad
router.get('/estado', verificarToken, obtenerEstadoInventario)
router.get('/ingredientes', verificarToken, obtenerEstadoInventario)

// POST: Solo el Administrador puede crear ingredientes
router.post('/ingredientes', verificarToken, soloAdmins, crearIngrediente)

// PUT / DELETE: Actualizar y eliminar ingredientes
router.put('/ingredientes/:id', verificarToken, soloAdmins, actualizarIngrediente)
router.delete('/ingredientes/:id', verificarToken, soloAdmins, eliminarIngrediente)

// ─── RUTAS PARA RECETAS (ESCANDALLOS) ────────────────────────────────────────

// GET: Cocineros y Admins pueden ver la lista de recetas
router.get('/recetas', verificarToken, obtenerRecetas)

// POST: Crear o actualizar una receta (Solo admins)
router.post('/recetas', verificarToken, soloAdmins, guardarReceta)

// DELETE: Eliminar una receta existente (Solo admins)
router.delete('/recetas/:id', verificarToken, soloAdmins, eliminarReceta)

export default router
