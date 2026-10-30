
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
  configurarPropinaQRCuenta,
  consultarEstadoQRCuenta,
  confirmarPagoQRCuenta,
  enviarReciboCorreoCuenta,
  enviarReciboCorreoQRCuenta
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

// Configurar la propina de una cuenta antes de generar su QR.
router.patch(
  '/cuentas/:cuentaId/qr/propina',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  configurarPropinaQRCuenta
)

// Obtener los datos QR de una cuenta desde Caja.
router.get(
  '/cuentas/:cuentaId/qr',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  generarQRCuentaMesa
)

// Envío público por token QR; solo funciona después de un pago confirmado.
router.post(
  '/cuentas/qr/enviar-recibo',
  enviarReciboCorreoQRCuenta
)

// Enviar por correo el recibo consolidado de una cuenta ya pagada.
router.post(
  '/cuentas/:cuentaId/enviar-recibo',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  enviarReciboCorreoCuenta
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
