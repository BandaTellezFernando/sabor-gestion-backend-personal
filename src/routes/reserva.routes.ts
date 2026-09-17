//src/routes/reserva.routes.ts
import { Router } from 'express'
import { crearReserva, obtenerReservas, eliminarReserva } from '../controllers/reserva.controller'
import { verificarToken } from '../middlewares/auth.middleware'

const router = Router()

router.post('/', verificarToken, crearReserva)
router.get('/', verificarToken, obtenerReservas)
router.delete('/:id', verificarToken, eliminarReserva)

export default router
