import { Router } from 'express'
import {
  obtenerReporteVentas,
  obtenerReporteMetodosPago,
  obtenerReporteCajeros,
  obtenerReporteProductos
} from '../controllers/reportes.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { soloAdmins } from '../middlewares/rol.middleware'

const router = Router()

// Todos los reportes financieros globales son exclusivos del Administrador.
router.use(verificarToken, soloAdmins)

router.get('/ventas', obtenerReporteVentas)
router.get('/metodos-pago', obtenerReporteMetodosPago)
router.get('/cajeros', obtenerReporteCajeros)
router.get('/productos', obtenerReporteProductos)

export default router
