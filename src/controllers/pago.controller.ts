// src/controllers/pago.controller.ts
import { Request, Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import { getIO } from '../socket/socket'
import { pagoService, PagoServiceError } from '../services/pago.service'
import { mesaService } from '../services/mesa.service'

/**
 * Ruta antigua de QR por pedido, retirada.
 * Los pagos QR deben utilizar el flujo seguro de cuenta con token.
 */
export const generarPagoQR = async (
  _req: Request,
  res: Response
): Promise<void> => {
  res.status(410).json({
    exito: false,
    mensaje:
      'El QR por pedido fue retirado. Utiliza el flujo QR de cuenta con token.'
  })
}

/**
 * 2. Procesamiento de Pago Final
 * Delega la transacción y cálculos a PagoService y emite los eventos WebSocket tras el éxito.
 */
export const procesarPagoFinal = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const pedidoId = String(req.params.pedidoId)
        const {
      metodoPago,
      porcentajePropina = 0,
      montoPropina,
      subtotalCierre,
      cajeroAsignado,
      clienteNombre,
      clienteCI,
      clienteNIT,
      nombreCliente,
      ci,
      nit
    } = req.body

    const cajeroId = (req as any).usuario?.id

        const resultado = await pagoService.procesarPagoFinal({
      pedidoId,
      metodoPago,
      porcentajePropina,
      montoPropina,
      subtotalCierre,
      cajeroAsignado,
      cajeroId,
      clienteNombre: clienteNombre !== undefined ? clienteNombre : nombreCliente,
      clienteCI: clienteCI !== undefined ? clienteCI : ci,
      clienteNIT: clienteNIT !== undefined ? clienteNIT : nit
    })

    // Eventos WebSocket (fuera de la transacción — no son operaciones de BD críticas)
    try {
      const io = getIO()
      io.to('room:cocina').emit('cocina:actualizar_tablero', resultado.pedidoActualizado)

      if (resultado.pedidoActualizado.mesa) {
        const mesaIdStr = (
          (resultado.pedidoActualizado.mesa as any)._id || resultado.pedidoActualizado.mesa
        ).toString()
        const mesaNombre = resultado.mesaLiberada?.numero || 'Mesa'

        try {
          const mesaDTO = await mesaService.obtenerMesaPorId(mesaIdStr)
          io.to('room:mesas').emit('mesas:updated', mesaDTO)
        } catch (mesaErr) {
          console.warn('Error al obtener mesa poblada para mesas:updated:', mesaErr)
        }

       io.to('room:mesas').emit('mesas:pago_completado', {
          mesaId: mesaIdStr,
          mesaNombre: mesaNombre,
          pedidoId: resultado.pedidoActualizado._id.toString(),
          mensaje: 'Pago procesado exitosamente'
        })
      }
    } catch (socketError) {
      console.warn('Pago guardado, pero falló la emisión del WebSocket:', socketError)
    }

        res.status(200).json({
      mensaje: 'Pago procesado exitosamente',
      comprobante: resultado.comprobante,
      comprobantePdf: resultado.comprobantePdf
    })
  } catch (error) {
    if (error instanceof PagoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error en la transacción de pago:', error)
    res.status(500).json({ mensaje: 'Error al procesar el pago' })
  }
}

/**
 * Ruta antigua de notificación QR, retirada.
 * Una notificación no constituye un pago registrado.
 */
export const simularPagoQR = async (
  _req: Request,
  res: Response
): Promise<void> => {
  res.status(410).json({
    exito: false,
    mensaje:
      'Esta confirmación QR fue retirada. Utiliza el flujo QR de cuenta con token.'
  })
}

/**
 * 4. Enviar recibo detallado por correo electrónico
 */
export const enviarReciboCorreo = async (req: Request, res: Response): Promise<void> => {
  try {
       const pedidoId = String(req.params.pedidoId)
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim()
        : ''

    if (!email) {
      res.status(400).json({ mensaje: 'Debe proporcionar un correo electrónico' })
      return
    }

       await pagoService.enviarReciboCorreo(pedidoId, email)

    res.status(200).json({ mensaje: 'Recibo enviado por correo exitosamente' })
  } catch (error) {
    if (error instanceof PagoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al enviar recibo:', error)
    res.status(500).json({ mensaje: 'Error al enviar el correo' })
  }
}
