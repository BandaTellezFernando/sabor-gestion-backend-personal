//src/routes/usuario.routes.ts
import { Router } from 'express'
import {
  obtenerUsuarios,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario,
  eliminarUsuario,
  loginUsuario
} from '../controllers/usuario.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { soloAdmins, permitirRoles } from '../middlewares/rol.middleware'

const router = Router()

// Ruta pública para inicio de sesión de empleados
router.post('/login', loginUsuario)

router.get('/', verificarToken, soloAdmins, obtenerUsuarios)
router.post('/', verificarToken, soloAdmins, crearUsuario)
router.put('/:id', verificarToken, soloAdmins, actualizarUsuario)
router.patch(
  '/:id/estado',
  verificarToken,
  permitirRoles('Administrador', 'Cajero'),
  cambiarEstadoUsuario
)
router.delete('/:id', verificarToken, soloAdmins, eliminarUsuario)

export default router
