// src/controllers/pago.controller.ts
import { Request, Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import { getIO } from '../socket/socket'
import { obtenerFechaBolivia } from '../utils/fechaBolivia'
import { pagoService, PagoServiceError } from '../services/pago.service'
import { mesaService } from '../services/mesa.service'

/**
 * 1. Generador de QR estático con ID y total del pedido
 */
export const generarPagoQR = async (req: Request, res: Response): Promise<void> => {
  try {
    const pedidoId = String(req.params.pedidoId)
    const resultado = await pagoService.generarPagoQR(pedidoId)
    res.json(resultado)
  } catch (error) {
    if (error instanceof PagoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    res.status(500).json({ mensaje: 'Error al generar QR' })
  }
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
      porcentajeDescuento = 0,
      porcentajePropina = 0,
      montoDescuento,
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
      porcentajeDescuento,
      porcentajePropina,
      montoDescuento,
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
      io.emit('cocina:actualizar_tablero', resultado.pedidoActualizado)

      if (resultado.pedidoActualizado.mesa) {
        const mesaIdStr = (
          (resultado.pedidoActualizado.mesa as any)._id || resultado.pedidoActualizado.mesa
        ).toString()
        const mesaNombre = resultado.mesaLiberada?.numero || 'Mesa'

        try {
          const mesaDTO = await mesaService.obtenerMesaPorId(mesaIdStr)
          io.emit('mesas:updated', mesaDTO)
        } catch (mesaErr) {
          console.warn('Error al obtener mesa poblada para mesas:updated:', mesaErr)
        }

        io.emit('mesas:pago_completado', {
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
      comprobante: resultado.comprobante
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
 * 3. Simulador de Pago desde Celular (QR Dinámico)
 */
export const simularPagoQR = async (req: Request, res: Response): Promise<void> => {
  try {
    const pedidoId = String(req.params.pedidoId)
    const pedido = await pagoService.obtenerPedidoParaSimulacion(pedidoId)

    // Emitimos los WebSockets correspondientes
    try {
      const io = getIO()

      // 1. Avisar a la caja
      io.emit('caja:pago_confirmado', {
        pedidoId,
        mensaje: 'Transferencia QR recibida',
        fecha: obtenerFechaBolivia()
      })

      // 2. Avisar al cliente en tiempo real
      io.emit(`pedido:pago_recibido:${pedidoId}`, {
        pedidoId,
        mensaje: 'Pago QR recibido correctamente',
        pedido
      })
    } catch (socketError) {
      console.warn('Falló la emisión del WebSocket de simulación:', socketError)
    }

    res.status(200).json({
      exito: true,
      mensaje: 'Simulación de pago exitosa. Notificando a la caja...'
    })
  } catch (error) {
    if (error instanceof PagoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    res.status(500).json({ mensaje: 'Error al simular el pago' })
  }
}

/**
 * 4. Enviar recibo detallado por correo electrónico
 */
export const enviarReciboCorreo = async (req: Request, res: Response): Promise<void> => {
  try {
    const pedidoId = String(req.params.pedidoId)
    const { email, clienteNombre, clienteCI } = req.body

    if (!email) {
      res.status(400).json({ mensaje: 'Debe proporcionar un correo electrónico' })
      return
    }

    await pagoService.enviarReciboCorreo(pedidoId, email, clienteNombre, clienteCI)

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
