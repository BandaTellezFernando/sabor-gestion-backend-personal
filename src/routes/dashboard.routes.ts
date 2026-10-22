//src/routes/dashboard.routes.ts
import { Router } from 'express'
import { obtenerResumenDashboard } from '../controllers/dashboard.controller'
import { obtenerReporteVentasPdf } from '../controllers/dashboardReportes.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { soloAdmins } from '../middlewares/rol.middleware'

const router = Router()

// Solo el dueño/admin puede ver el dinero y métricas
router.get('/resumen', verificarToken, soloAdmins, obtenerResumenDashboard)

// Endpoint adicional protegido; no modifica los endpoints operativos existentes.
router.get('/reportes/pdf', verificarToken, soloAdmins, obtenerReporteVentasPdf)

export default router
