//src/routes/mesa.routes.ts
import { Router } from 'express'
import { crearMesa, obtenerMesas } from '../controllers/mesa.controller'
import {
  actualizarEstadoMesa,
  obtenerMesaPorId,
  actualizarMesa,
  eliminarMesa
} from '../controllers/mesa.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { soloAdmins } from '../middlewares/rol.middleware'

const router = Router()

router.post('/', verificarToken, soloAdmins, crearMesa)
router.get('/', verificarToken, obtenerMesas)
router.get('/:id', verificarToken, obtenerMesaPorId)
// Actualizar campos generales de la mesa (solo admin)
router.put('/:id', verificarToken, soloAdmins, actualizarMesa)
// Actualizar solo el estado (p. ej. mesero cambia a 'Ocupada' / 'Disponible')
router.patch('/:id/estado', verificarToken, actualizarEstadoMesa)
// Eliminar mesa (solo admin)
router.delete('/:id', verificarToken, soloAdmins, eliminarMesa)

export default router
