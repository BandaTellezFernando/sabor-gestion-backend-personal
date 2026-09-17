// src/routes/inventario.routes.ts
import { Router } from 'express'
import {
  obtenerEstadoInventario,
  registrarEntradaStock,
  crearIngrediente,
  actualizarIngrediente,
  eliminarIngrediente,
  obtenerRecetas,
  guardarReceta,
  eliminarReceta,
  obtenerAlertas
} from '../controllers/inventario.controller'
// Middlewares de seguridad
import { verificarToken } from '../middlewares/auth.middleware'
import { soloAdmins } from '../middlewares/rol.middleware'

const router = Router()

// ─── RUTAS PARA INGREDIENTES ─────────────────────────────────────────────────

// GET: Todos los usuarios con sesión iniciada (Cocinero y Admin) pueden ver el stock
router.get('/estado', verificarToken, obtenerEstadoInventario)

// POST: Solo el Administrador puede registrar entradas manuales de stock y modificar ingredientes
router.post('/entrada', verificarToken, soloAdmins, registrarEntradaStock)
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

// ─── RUTAS PARA ALERTAS DE STOCK ─────────────────────────────────────────────

// GET: Obtener las alertas activas (Pendientes) para mostrar en la interfaz
router.get('/alertas', verificarToken, obtenerAlertas)

export default router
