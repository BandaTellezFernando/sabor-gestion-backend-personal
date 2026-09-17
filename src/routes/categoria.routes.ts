// src/routes/categoria.routes.ts
import { Router } from 'express'
import {
  crearCategoria,
  obtenerCategorias,
  actualizarCategoria,
  eliminarCategoria
} from '../controllers/categoria.controller'

// Importamos tus middlewares de seguridad
import { verificarToken } from '../middlewares/auth.middleware'
import { soloAdmins } from '../middlewares/rol.middleware'

const router = Router()

// GET: Ruta pública para que el menú de clientes funcione sin iniciar sesión
router.get('/', obtenerCategorias)

// POST, PUT, DELETE: Solo el Administrador puede modificar las categorías
router.post('/', verificarToken, soloAdmins, crearCategoria)
router.put('/:id', verificarToken, soloAdmins, actualizarCategoria)
router.delete('/:id', verificarToken, soloAdmins, eliminarCategoria)

export default router
