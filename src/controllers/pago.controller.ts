// src/controllers/pago.controller.ts
import { Request, Response } from 'express'
import { Types } from 'mongoose'
import { CustomRequest } from '../middlewares/auth.middleware'
import { getIO } from '../socket/socket'
import { obtenerFechaBolivia } from '../utils/fechaBolivia'
import { pagoService, PagoServiceError } from '../services/pago.service'
import { mesaService } from '../services/mesa.service'

/**
 * 1. Generador de QR estático con ID y total del pedido
 */
export const generarPagoQR = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const pedidoId = String(req.params.pedidoId)
    const cajeroId =
      req.usuario?.rol.toLowerCase() === 'cajero'
        ? req.usuario.id
        : undefined
    const resultado = await pagoService.generarPagoQR(pedidoId, cajeroId)
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
      porcentajePropina = 0,
      montoPropina,
      subtotalCierre,
      cajeroAsignado,
      clienteNombre,
      clienteApellido,
      clienteExtensionCI,
      clienteCI,
      clienteCIComplemento,
      clienteNIT,
      nombreCliente,
      apellidoCliente,
      extensionCI,
      ci,
      ciComplemento,
      nit
    } = req.body

    const cajeroId = req.usuario?.id

    const resultado = await pagoService.procesarPagoFinal({
      pedidoId,
      metodoPago,
      porcentajePropina,
      montoPropina,
      subtotalCierre,
      cajeroAsignado,
      cajeroId,
      clienteNombre: clienteNombre !== undefined ? clienteNombre : nombreCliente,
      clienteApellido: clienteApellido !== undefined ? clienteApellido : apellidoCliente,
      clienteExtensionCI:
        clienteExtensionCI !== undefined ? clienteExtensionCI : extensionCI,
      clienteCI: clienteCI !== undefined ? clienteCI : ci,
      clienteCIComplemento: clienteCIComplemento !== undefined ? clienteCIComplemento : ciComplemento,
      clienteNIT: clienteNIT !== undefined ? clienteNIT : nit
    })

    // Eventos WebSocket (fuera de la transacción — no son operaciones de BD críticas)
    try {
      const io = getIO()
      io.emit('cocina:actualizar_tablero', resultado.pedidoActualizado)

      const mesaRelacion = resultado.pedidoActualizado.mesa
      if (mesaRelacion) {
        const mesaIdStr =
          mesaRelacion instanceof Types.ObjectId
            ? mesaRelacion.toString()
            : mesaRelacion._id.toString()
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
 * Consulta el estado del QR sin consumirlo.
 * El token se recibe en el cuerpo JSON, no en la URL de la API.
 */
export const consultarEstadoPagoQR = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.set('Cache-Control', 'no-store')

  try {
    const token = typeof req.body?.token === 'string' ? req.body.token : ''
    const estado = await pagoService.consultarEstadoPagoQR(token)
    res.status(200).json(estado)
  } catch (error) {
    if (error instanceof PagoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }

    console.error('Error al consultar estado QR:', error)
    res.status(500).json({ mensaje: 'Error al consultar el estado del QR' })
  }
}

/**
 * Confirma el pago simulado. Los eventos se emiten únicamente después
 * de que el servicio haya confirmado la transacción en la base de datos.
 */
export const confirmarPagoQR = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.set('Cache-Control', 'no-store')

  try {
    const body = req.body ?? {}
    const token = typeof body.token === 'string' ? body.token : ''
    const resultado = await pagoService.confirmarPagoQR(token, {
      clienteNombre:
        body.clienteNombre !== undefined ? body.clienteNombre : body.nombreCliente,
      clienteApellido:
        body.clienteApellido !== undefined ? body.clienteApellido : body.apellidoCliente,
      clienteCI: body.clienteCI !== undefined ? body.clienteCI : body.ci,
      clienteCIComplemento:
        body.clienteCIComplemento !== undefined ? body.clienteCIComplemento : body.ciComplemento,
      clienteExtensionCI:
        body.clienteExtensionCI !== undefined ? body.clienteExtensionCI : body.extensionCI,
      clienteNIT: body.clienteNIT !== undefined ? body.clienteNIT : body.nit
    })
    const pedidoId = String(resultado.pedidoActualizado._id)

    try {
      const io = getIO()

      io.emit('cocina:actualizar_tablero', resultado.pedidoActualizado)

      const mesaRelacion = resultado.pedidoActualizado.mesa
      if (mesaRelacion) {
        const mesaIdStr =
          mesaRelacion instanceof Types.ObjectId
            ? mesaRelacion.toString()
            : mesaRelacion._id.toString()

        const mesaNombre = resultado.mesaLiberada?.numero || 'Mesa'

        try {
          const mesaDTO = await mesaService.obtenerMesaPorId(mesaIdStr)
          io.emit('mesas:updated', mesaDTO)
        } catch (mesaErr) {
          console.warn('No se pudo actualizar la mesa por WebSocket:', mesaErr)
        }

        io.emit('mesas:pago_completado', {
          mesaId: mesaIdStr,
          mesaNombre,
          pedidoId,
          mensaje: 'Pago procesado exitosamente'
        })
      }

      io.emit('caja:pago_confirmado', {
        pedidoId,
        mensaje: 'Pago QR simulado confirmado',
        fecha: obtenerFechaBolivia()
      })

      io.emit(`pedido:pago_recibido:${pedidoId}`, {
        pedidoId,
        mensaje: 'Pago QR recibido correctamente',
        pedido: resultado.pedidoActualizado
      })
    } catch (socketError) {
      console.warn(
        'Pago registrado, pero falló la emisión de WebSocket:',
        socketError
      )
    }

    res.status(200).json({
      exito: true,
      estado: 'UTILIZADO',
      mensaje: 'Pago QR simulado confirmado.',
      comprobante: resultado.comprobante
    })
  } catch (error) {
    if (error instanceof PagoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }

    console.error('Error al confirmar pago QR:', error)
    res.status(500).json({ mensaje: 'Error al confirmar el pago QR' })
  }
}

/**
 * Compatibilidad temporal con la ruta antigua.
 * No se debe marcar un pago como confirmado usando únicamente el pedidoId.
 */
export const simularPagoQR = async (
  _req: Request,
  res: Response
): Promise<void> => {
  res.set('Cache-Control', 'no-store')
  res.status(410).json({
    exito: false,
    mensaje:
      'La confirmación antigua fue deshabilitada. Utiliza un QR vigente para confirmar el pago.'
  })
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


/**
 * Valida que cada parámetro de consulta aparezca como un único valor.
 */
const leerParametroQuery = (
  valor: unknown,
  nombre: string
): string | undefined => {
  if (valor === undefined) return undefined
  if (typeof valor !== 'string') {
    throw new PagoServiceError(
      400,
      `El parámetro "${nombre}" debe enviarse una sola vez como texto.`
    )
  }
  return valor
}

/**
 * GET /api/pagos
 * Historial paginado. Solo accesible por Administrador (controlado en la ruta).
 */
export const listarPagos = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const usuario = req.usuario
    const rol = usuario?.rol.trim().toLowerCase()

    if (!usuario || !['administrador', 'cajero'].includes(rol ?? '')) {
      res.status(usuario ? 403 : 401).json({
        mensaje: 'No tienes permiso para consultar pagos.'
      })
      return
    }

    const resultado = await pagoService.listarPagos({
      desde: leerParametroQuery(req.query.desde, 'desde'),
      hasta: leerParametroQuery(req.query.hasta, 'hasta'),
      estadoPago: leerParametroQuery(req.query.estadoPago, 'estadoPago'),
      metodoPago: leerParametroQuery(req.query.metodoPago, 'metodoPago'),
      pagina: leerParametroQuery(req.query.pagina, 'pagina'),
      limite: leerParametroQuery(req.query.limite, 'limite'),
      // Este ID procede del JWT, nunca de req.query.
      cajeroId: rol === 'cajero' ? usuario.id : undefined
    })

    res.status(200).json(resultado)
  } catch (error) {
    if (error instanceof PagoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }

    console.error('Error al consultar historial de pagos:', error)
    res.status(500).json({ mensaje: 'Error al consultar el historial de pagos.' })
  }
}

/**
 * GET /api/pagos/:id
 * Detalle individual de un pago. Solo accesible por Administrador.
 */
export const obtenerDetallePago = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const usuario = req.usuario
    const rol = usuario?.rol.trim().toLowerCase()

    if (!usuario || !['administrador', 'cajero'].includes(rol ?? '')) {
      res.status(usuario ? 403 : 401).json({
        mensaje: 'No tienes permiso para consultar pagos.'
      })
      return
    }

    const pago = await pagoService.obtenerDetallePago(
      String(req.params.id),
      rol === 'cajero' ? usuario.id : undefined
    )
    res.status(200).json({
      sinDatos: false,
      mensaje: 'Pago encontrado.',
      datos: pago
    })
  } catch (error) {
    if (error instanceof PagoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }

    console.error('Error al consultar el detalle del pago:', error)
    res.status(500).json({ mensaje: 'Error al consultar el detalle del pago.' })
  }
}
