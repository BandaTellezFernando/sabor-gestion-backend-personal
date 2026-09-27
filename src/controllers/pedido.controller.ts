// src/controllers/pedido.controller.ts
import { Request, Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import { getIO } from '../socket/socket'
import { ESTADOS_MESA } from '../utils/constants'
import {
  PedidoService,
  pedidoService,
  PedidoServiceError
} from '../services/pedido.service'

export const crearPedido = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const usuarioAuthId = req.usuario?.id
    const resultado = await pedidoService.crearPedido(req.body, usuarioAuthId)

    // Notificaciones en tiempo real
    try {
      const io = getIO()

      // Notificar a cocina para que aparezca el ticket en "Por hacer"
      io.emit('cocina:nuevo_pedido', resultado.pedidoPoblado)

      // Notificar a todos los meseros que la mesa ahora está ocupada (se pone roja)
      if (resultado.mesaActualizada) {
        io.emit('mesas:updated', {
          id: resultado.mesaActualizada._id.toString(),
          status: ESTADOS_MESA.OCUPADA,
          name: resultado.mesaActualizada.numero
        })
      }
    } catch (socketError) {
      console.warn('Pedido guardado, pero falló la notificación en tiempo real')
    }

    res.status(201).json(resultado.nuevoPedido)
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({
        success: false,
        mensaje: error.message,
        ...error.extra
      })
      return
    }
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al registrar el pedido', error: err.message })
  }
}

export const obtenerPedidos = async (req: Request, res: Response): Promise<void> => {
  try {
    const datos = await pedidoService.obtenerPedidos(req.query)
    res.status(200).json(datos)
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al obtener los pedidos', error: err.message })
  }
}

export const cancelarPedido = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const resultado = await pedidoService.cancelarPedido(String(id))

    // Avisar por WebSocket que la mesa vuelve a estar disponible (verde) o reservada
    if (resultado.mesaLiberada) {
      try {
        getIO().emit('mesas:updated', {
          id: resultado.mesaLiberada._id.toString(),
          status: resultado.statusSocket
        })
      } catch (socketError) {
        console.warn('Fallo al emitir actualización de mesa por socket')
      }
    }

    res.status(200).json({
      mensaje: 'Pedido anulado y mesa liberada correctamente',
      pedido: resultado.pedido
    })
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al procesar la cancelación', error: err.message })
  }
}

export const actualizarEstadoPedido = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { estado } = req.body

    const { pedidoActualizado, disparaAlertaListo } =
      await pedidoService.actualizarEstadoService(String(id), String(estado))

    try {
      const io = getIO()

      // A) Mover la tarjeta en el tablero de cocina
      io.emit('cocina:actualizar_tablero', pedidoActualizado)

      // B) Alerta "¡Listo!" hacia los meseros cuando el chef termina el pedido
      if (disparaAlertaListo) {
        console.log(
          ' [WEBSOCKET] Emitiendo alerta de listo a meseros para pedido:',
          pedidoActualizado._id.toString()
        )
        io.emit('mesas:alerta_listo', {
          pedidoId: pedidoActualizado._id.toString(),
          mesaId: pedidoActualizado.mesa
            ? (pedidoActualizado.mesa as any)._id?.toString() ||
              pedidoActualizado.mesa.toString()
            : undefined,
          mesaNombre: pedidoActualizado.mesa
            ? (pedidoActualizado.mesa as any).numero ||
              (pedidoActualizado.mesa as any).name ||
              (pedidoActualizado.mesa as any).nombre ||
              'Mesa'
            : '?'
        })
      }
    } catch (socketError) {
      console.warn('Estado actualizado, pero falló la emisión del socket')
    }

    res.status(200).json({
      mensaje: `Pedido movido a ${estado}`,
      pedido: PedidoService.agregarFechaBoliviaPedido(pedidoActualizado)
    })
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    const err = error as Error
    res
      .status(500)
      .json({ mensaje: 'Error al actualizar el estado del pedido', error: err.message })
  }
}

export const actualizarPedido = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const resultado = await pedidoService.actualizarPedido(String(id), req.body)

    if (resultado.mesaReactivada) {
      try {
        getIO().emit('mesas:updated', {
          id: resultado.mesaReactivada._id.toString(),
          status: ESTADOS_MESA.OCUPADA,
          name: (resultado.pedidoDoc.mesa as any)?.numero || 'Mesa'
        })
      } catch (e) {}
    }

    try {
      getIO().emit('cocina:actualizar_tablero', resultado.pedidoDoc)
    } catch (e) {}

    if (resultado.cajeroAsignado) {
      const payloadCaja = PedidoService.formatearPayloadCaja(resultado.pedidoDoc)
      try {
        const io = getIO()
        io.emit('caja:nueva_cuenta', payloadCaja)
        io.emit('caja:solicitud_pago', payloadCaja)
      } catch (e) {}
    }

    res.status(200).json(resultado.pedidoActualizado)
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al actualizar el pedido', error: err.message })
  }
}

export const obtenerPedidosPendientesCobro = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { cajero } = req.query
    const respuesta = await pedidoService.obtenerPedidosPendientesCobro(
      cajero ? String(cajero) : undefined
    )
    res.status(200).json(respuesta)
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    const err = error as Error
    res.status(500).json({
      mensaje: 'Error al obtener pedidos pendientes de cobro',
      error: err.message
    })
  }
}

export const solicitarCuentaPedido = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { payload, mesaActualizada } = await pedidoService.solicitarCuentaPedido(String(id))

    try {
      const io = getIO()
      io.emit('caja:nueva_cuenta', payload)
      io.emit('caja:solicitud_pago', payload)
      io.emit('mesas:updated', {
        id: mesaActualizada._id.toString(),
        status: 'Esperando pago',
        name: mesaActualizada.numero
      })
    } catch (socketError) {
      console.warn('Cuenta solicitada, pero falló la notificación en tiempo real')
    }

    res.status(200).json({
      mensaje: 'Cuenta solicitada correctamente',
      solicitud: payload
    })
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    const err = error as Error
    res.status(500).json({
      mensaje: 'Error al solicitar la cuenta',
      error: err.message
    })
  }
}
