//src/routes/cuentaMesa.routes.ts
import { Router } from 'express'
import {
  crearCuentaPorMesa,
  obtenerCuentaMesaPorId,
  listarCuentasPendientes
} from '../controllers/cuentaMesa.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { permitirRoles } from '../middlewares/rol.middleware'

const router = Router()

router.post(
  '/mesas/:mesaId',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  crearCuentaPorMesa
)

// Listar cuentas pendientes de pago.
router.get(
  '/',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  listarCuentasPendientes
)

// Consultar una cuenta por ID.
router.get(
  '/:id',
  verificarToken,
  permitirRoles('Mesero', 'Cajero', 'Administrador'),
  obtenerCuentaMesaPorId
)

export default router