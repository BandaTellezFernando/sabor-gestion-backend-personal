// src/routes/mesa.routes.ts
import { Router } from 'express'

import {
  crearMesa,
  obtenerMesas,
  obtenerMesaPorId,
  actualizarMesa,
  actualizarEstadoMesa,
  eliminarMesa,
  ocuparMesaTemporal,
  cancelarOcupacionTemporal,
  consultarOcupacionTemporal,
  unirMesas,
  cancelarFusionMesa,
  separarFusionMesa
} from '../controllers/mesa.controller'

import { verificarToken } from '../middlewares/auth.middleware'
import {
  soloAdmins,
  permitirRoles
} from '../middlewares/rol.middleware'

const router = Router()

// ─── Operaciones de fusión ───────────────────────────────────────────

// Une mesas libres o amplía una fusión existente.
router.post(
  '/unir',
  verificarToken,
  soloAdmins,
  unirMesas
)

// Cancela una fusión que nunca tuvo pedidos.
router.post(
  '/:id/cancelar-fusion',
  verificarToken,
  soloAdmins,
  cancelarFusionMesa
)

// Separa una fusión que ya tuvo pedidos y no mantiene actividad pendiente.
router.post(
  '/:id/separar',
  verificarToken,
  soloAdmins,
  separarFusionMesa
)

// ─── CRUD de mesas ───────────────────────────────────────────────────

router.post(
  '/',
  verificarToken,
  soloAdmins,
  crearMesa
)

router.get(
  '/',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  obtenerMesas
)

router.get(
  '/:id',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  obtenerMesaPorId
)

router.put(
  '/:id',
  verificarToken,
  soloAdmins,
  actualizarMesa
)

router.patch(
  '/:id/estado',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  actualizarEstadoMesa
)

// ─── Ocupación temporal de mesas ─────────────────────────────────────

router.post(
  '/:id/ocupar-temporal',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  ocuparMesaTemporal
)

router.delete(
  '/:id/ocupar-temporal',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  cancelarOcupacionTemporal
)

router.get(
  '/:id/ocupar-temporal',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  consultarOcupacionTemporal
)

// ─── Eliminación de mesas individuales ────────────────────────────────

router.delete(
  '/:id',
  verificarToken,
  soloAdmins,
  eliminarMesa
)

export default router