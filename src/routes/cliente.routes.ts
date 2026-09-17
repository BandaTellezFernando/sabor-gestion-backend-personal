import { Router } from 'express'
import {
  registrarCliente,
  loginCliente,
  loginGoogleCliente,
  obtenerClientes,
  obtenerClientePorId,
  actualizarCliente,
  eliminarCliente
} from '../controllers/cliente.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { permitirRoles } from '../middlewares/rol.middleware'

const router = Router()

// Rutas públicas
router.post('/auth/register', registrarCliente)
router.post('/auth/login', loginCliente)
router.post('/auth/google', loginGoogleCliente)

// Rutas protegidas (Para el propio cliente o administrador)
router.get('/:id', verificarToken, obtenerClientePorId)
router.put('/:id', verificarToken, actualizarCliente)

// Rutas protegidas (Solo Administrador)
router.get('/', verificarToken, permitirRoles('Administrador'), obtenerClientes)
router.delete('/:id', verificarToken, permitirRoles('Administrador'), eliminarCliente)

export default router
