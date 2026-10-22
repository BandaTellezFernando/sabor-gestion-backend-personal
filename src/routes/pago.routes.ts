// src/routes/pago.routes.ts
import { Router } from 'express'
import {
  generarPagoQR,
  procesarPagoFinal,
  simularPagoQR,
  enviarReciboCorreo
} from '../controllers/pago.controller'

import {
  procesarPagoCuenta,
  generarQRCuentaMesa,
  consultarEstadoQRCuenta,
  confirmarPagoQRCuenta
} from '../controllers/cuentaMesaPago.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { permitirRoles } from '../middlewares/rol.middleware'


const router = Router()

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

// 3. NUEVA RUTA PÚBLICA: Escucha la señal del celular simulado (Sin verificarToken)
router.post('/notificar-qr/:pedidoId', simularPagoQR)

router.post(
  '/:pedidoId/enviar-recibo',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  enviarReciboCorreo
)
// ─── PAGOS AGRUPADOS POR CUENTA DE MESA ───────────────────────

// Procesar efectivo o tarjeta para una cuenta completa.
router.post(
  '/cuentas/:cuentaId/procesar',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  procesarPagoCuenta
)

// Obtener los datos QR de una cuenta desde Caja.
router.get(
  '/cuentas/:cuentaId/qr',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  generarQRCuentaMesa
)

// Consultar el estado del QR desde la pantalla del cliente.
// El token aleatorio es la credencial de acceso.
router.post(
  '/cuentas/qr/estado',
  consultarEstadoQRCuenta
)

// Confirmar la simulación del pago desde la pantalla del cliente.
router.post(
  '/cuentas/qr/confirmar',
  confirmarPagoQRCuenta
)
export default router
