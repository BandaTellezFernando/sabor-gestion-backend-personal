// src/routes/pago.routes.ts
import { Router } from 'express'
import {
  generarPagoQR,
  procesarPagoFinal,
  simularPagoQR,
  enviarReciboCorreo
} from '../controllers/pago.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { permitirRoles } from '../middlewares/rol.middleware'

const router = Router()

// 1. Ruta para cuando el cliente quiere pagar con QR estático (Opcional si mantienes el anterior)
router.post('/generar-qr/:pedidoId', verificarToken, generarPagoQR)

// 2. Ruta principal que conecta con tu botón naranja de "Confirmar Pago"
router.post(
  '/:pedidoId/procesar',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  procesarPagoFinal
)

// 3. NUEVA RUTA PÚBLICA: Escucha la señal del celular simulado (Sin verificarToken)
router.post('/notificar-qr/:pedidoId', simularPagoQR)

router.post(
  '/:pedidoId/enviar-recibo',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  enviarReciboCorreo
)

export default router
