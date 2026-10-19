import { Router } from 'express'
import { verificarToken } from '../middlewares/auth.middleware'
import {
  cerrarCaja,
  listarCierresCaja
} from '../controllers/cierreCaja.controller'

const router = Router()

// Los permisos sobre el cajero y su alcance se validan también en el servicio.
router.post('/', verificarToken, cerrarCaja)
router.get('/', verificarToken, listarCierresCaja)

export default router
