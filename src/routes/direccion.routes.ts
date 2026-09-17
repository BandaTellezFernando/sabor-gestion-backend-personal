import { Router } from 'express'
import {
  agregarDireccionEntrega,
  listarDireccionesEntrega,
  eliminarDireccionEntrega
} from '../controllers/direccion.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { permitirRoles } from '../middlewares/rol.middleware'

const router = Router()

router.use(verificarToken)
router.use(permitirRoles('Cliente'))

router.get('/', listarDireccionesEntrega)
router.post('/', agregarDireccionEntrega)
router.delete('/:id', eliminarDireccionEntrega)

export default router
