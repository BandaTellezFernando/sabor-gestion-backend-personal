//src/routes/ubicacion.routes.ts
import { Router } from 'express'
import {
  obtenerUbicaciones,
  crearUbicacion,
  actualizarUbicacion,
  eliminarUbicacion
} from '../controllers/ubicacion.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { soloAdmins } from '../middlewares/rol.middleware'

const router = Router()

// Listar ubicaciones (cualquier usuario autenticado)
router.get('/', verificarToken, obtenerUbicaciones)

// Crear ubicacion (solo admin)
router.post('/', verificarToken, soloAdmins, crearUbicacion)

// Actualizar ubicacion (solo admin)
router.put('/:id', verificarToken, soloAdmins, actualizarUbicacion)

// Eliminar ubicacion (solo admin)
router.delete('/:id', verificarToken, soloAdmins, eliminarUbicacion)

export default router
