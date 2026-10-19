// src/routes/pago.routes.ts
import { Router } from 'express'
import {
  generarPagoQR,
  procesarPagoFinal,
  consultarEstadoPagoQR,
  confirmarPagoQR,
  simularPagoQR,
  enviarReciboCorreo,
  listarPagos,
  obtenerDetallePago
} from '../controllers/pago.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { permitirRoles } from '../middlewares/rol.middleware'

const router = Router()

// Administrador: historial global. Cajero: solo sus propios pagos.
router.get(
  '/',
  verificarToken,
  permitirRoles('Administrador', 'Cajero'),
  listarPagos
)

router.get(
  '/:id',
  verificarToken,
  permitirRoles('Administrador', 'Cajero'),
  obtenerDetallePago
)

// 1. Ruta para cuando el cliente quiere pagar con QR estático (Opcional si mantienes el anterior)
router.post(
  '/generar-qr/:pedidoId',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  generarPagoQR
)

// 2. Ruta principal que conecta con tu botón naranja de "Confirmar Pago"
router.post(
  '/:pedidoId/procesar',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  procesarPagoFinal
)

// El token aleatorio actúa como credencial temporal del QR.
// Se envía en JSON para no exponerlo en la URL de la API.
router.post('/qr/estado', consultarEstadoPagoQR)
router.post('/qr/confirmar', confirmarPagoQR)

// Endpoint heredado deshabilitado: ya no se confirma un pago solo con el ID.
router.post('/notificar-qr/:pedidoId', simularPagoQR)

router.post(
  '/:pedidoId/enviar-recibo',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  enviarReciboCorreo
)

export default router
