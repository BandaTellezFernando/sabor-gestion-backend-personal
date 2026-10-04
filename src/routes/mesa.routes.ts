//src/routes/mesa.routes.ts
import { Router } from 'express'
import { crearMesa, obtenerMesas } from '../controllers/mesa.controller'
import {
  actualizarEstadoMesa,
  obtenerMesaPorId,
  actualizarMesa,
  eliminarMesa,
  ocuparMesaTemporal,
  cancelarOcupacionTemporal,
  consultarOcupacionTemporal
} from '../controllers/mesa.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { soloAdmins, permitirRoles } from '../middlewares/rol.middleware'

const router = Router()

router.post('/', verificarToken, soloAdmins, crearMesa)
router.get('/', verificarToken, permitirRoles('Mesero', 'Administrador'), obtenerMesas)
router.get('/:id', verificarToken, permitirRoles('Mesero', 'Administrador'), obtenerMesaPorId)
// Actualizar campos generales de la mesa (solo admin)
router.put('/:id', verificarToken, soloAdmins, actualizarMesa)
// Actualizar solo el estado (p. ej. mesero cambia a 'Ocupada' / 'Disponible')
router.patch(
  '/:id/estado',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  actualizarEstadoMesa
)

// Ocupación temporal de mesa (flujo comanda 10 minutos)
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

// Eliminar mesa (solo admin)
router.delete('/:id', verificarToken, soloAdmins, eliminarMesa)

export default router
