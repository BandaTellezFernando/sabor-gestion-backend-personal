// src/controllers/pedido.controller.ts
import { Request, Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import { getIO } from '../socket/socket'
import {
  PedidoService,
  pedidoService,
  PedidoServiceError
} from '../services/pedido.service'
import { mesaService } from '../services/mesa.service'

export const crearPedido = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const usuarioAuthId = req.usuario?.id
    const resultado = await pedidoService.crearPedido(req.body, usuarioAuthId)

    // Notificaciones en tiempo real
       // Notificaciones en tiempo real.
    // La creación guarda el borrador, pero no lo envía a cocina.
    try {
      const io = getIO()

      // Notificar a los meseros si cambió el estado de la mesa.
      if (resultado.mesaActualizada) {
        try {
          const mesaDTO = await mesaService.obtenerMesaPorId(
            resultado.mesaActualizada._id.toString()
          )
          io.to('room:mesas').emit('mesas:updated', mesaDTO)
        } catch (mesaErr) {
          console.warn('Error al obtener mesa para mesas:updated:', mesaErr)
        }
      }
    } catch {
      console.warn(
        'Pedido guardado como borrador, pero falló la notificación de la mesa'
      )
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
    console.error('Error al registrar el pedido:', error)
    res.status(500).json({ mensaje: 'Error al registrar el pedido' })
  }
}

export const enviarPedidoCocina = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const usuarioAuthId = req.usuario?.id

    if (!usuarioAuthId) {
      res.status(401).json({
        mensaje: 'Usuario no autenticado'
      })
      return
    }

    const resultado = await pedidoService.enviarPedidoCocina(
      String(req.params.id),
      usuarioAuthId,
      req.usuario?.rol
    )

    // Emitir el ticket a cocina solamente en el primer envío.
    if (!resultado.yaEnviado) {
      try {
getIO().to('room:cocina').emit('cocina:nuevo_pedido', resultado.pedido)      } catch (socketError) {
        console.warn(
          'Pedido enviado, pero falló la notificación a cocina:',
          socketError
        )
      }
    }

    res.status(200).json({
      mensaje: resultado.yaEnviado
        ? 'El pedido ya había sido enviado a cocina'
        : 'Pedido enviado a cocina correctamente',
      pedido: resultado.pedido,
      yaEnviado: resultado.yaEnviado
    })
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({
        success: false,
        mensaje: error.message,
        ...error.extra
      })
      return
    }

    console.error('Error al enviar el pedido a cocina:', error)

    res.status(500).json({
      mensaje: 'Error al enviar el pedido a cocina'
    })
  }
}

export const obtenerPedidos = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const datos = await pedidoService.obtenerPedidos(
      req.query,
      req.usuario?.id,
      req.usuario?.rol
    )
    res.status(200).json(datos)
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    console.error('Error al obtener los pedidos:', error)
    res.status(500).json({ mensaje: 'Error al obtener los pedidos' })
  }
}

export const obtenerPedidoPorId = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const pedido = await pedidoService.obtenerPedidoPorId(
      String(id),
      req.usuario?.id,
      req.usuario?.rol
    )
    res.status(200).json(pedido)
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    console.error('Error al obtener el pedido:', error)
    res.status(500).json({ mensaje: 'Error al obtener el pedido' })
  }
}

export const cancelarPedido = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params

    const resultado = await pedidoService.cancelarPedido(
      String(id),
      req.usuario?.id,
      req.usuario?.rol
    )

    if (resultado.mesaLiberada) {
      try {
        const mesaDTO = await mesaService.obtenerMesaPorId(
          resultado.mesaLiberada._id.toString()
        )

        getIO().emit('mesas:updated', mesaDTO)
      } catch (socketError) {
        console.warn(
          'Fallo al emitir la actualización de mesa por socket:',
          socketError
        )
      }
    }

    const mensaje =
      resultado.nuevoEstadoMesa === 'Ocupada'
        ? 'Pedido anulado correctamente. La mesa permanece ocupada porque tiene otras comandas activas.'
        : resultado.mesaLiberada
          ? 'Pedido anulado y mesa liberada correctamente.'
          : 'Pedido anulado correctamente.'

    res.status(200).json({
      mensaje,
      pedido: resultado.pedido,
      nuevoEstadoMesa: resultado.nuevoEstadoMesa
    })
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message,
        ...error.extra
      })
      return
    }

    console.error('Error al procesar la cancelación:', error)

    res.status(500).json({
      mensaje: 'Error al procesar la cancelación'
    })
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
      io.to('room:cocina').emit('cocina:actualizar_tablero', pedidoActualizado)

      // B) Alerta "¡Listo!" hacia los meseros cuando el chef termina el pedido
      if (disparaAlertaListo) {
        console.log(
          ' [WEBSOCKET] Emitiendo alerta de listo a meseros para pedido:',
          pedidoActualizado._id.toString()
        )
        io.to('room:meseros').emit('mesas:alerta_listo', {
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
    } catch {
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
    console.error('Error al actualizar el estado del pedido:', error)
    res
      .status(500)
      .json({ mensaje: 'Error al actualizar el estado del pedido' })
  }
}

export const actualizarPedido = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const resultado = await pedidoService.actualizarPedido(
      String(id),
      req.body,
      req.usuario?.id,
      req.usuario?.rol
    )

    if (resultado.mesaReactivada) {
      try {
        const mesaDTO = await mesaService.obtenerMesaPorId(
          resultado.mesaReactivada._id.toString()
        )
        getIO().emit('mesas:updated', mesaDTO)
      } catch (e) {
        console.warn('Error al emitir mesas:updated en actualizarPedido:', e)
      }
    }

    try {
      getIO().to('room:cocina').emit('cocina:actualizar_tablero', resultado.pedidoDoc)
    } catch (e) {
      console.warn('Error al emitir cocina:actualizar_tablero en actualizarPedido:', e)
    }

    if (resultado.cajeroAsignado) {
      const payloadCaja = PedidoService.formatearPayloadCaja(resultado.pedidoDoc)
      try {
        const io = getIO()
        const cajeroTarget = resultado.cajeroAsignado.toString()
        io.to(`user:${cajeroTarget}`).emit('caja:nueva_cuenta', payloadCaja)
        io.to(`user:${cajeroTarget}`).emit('caja:solicitud_pago', payloadCaja)
      } catch (e) {
        console.warn('Error al emitir eventos de caja en actualizarPedido:', e)
      }
    }

    res.status(200).json(resultado.pedidoActualizado)
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    console.error('Error al actualizar el pedido:', error)
    res.status(500).json({ mensaje: 'Error al actualizar el pedido' })
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
    console.error('Error al obtener pedidos pendientes de cobro:', error)
    res.status(500).json({
      mensaje: 'Error al obtener pedidos pendientes de cobro'
    })
  }
}

export const solicitarCuentaPedido = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params
    const { payload, mesaActualizada, cajeroAsignado } =
      await pedidoService.solicitarCuentaPedido(
        String(id),
        req.usuario?.id,
        req.usuario?.rol
      )

    try {
      const io = getIO()
      if (cajeroAsignado) {
        const cajeroTarget = cajeroAsignado.toString()
        io.to(`user:${cajeroTarget}`).emit('caja:nueva_cuenta', payload)
        io.to(`user:${cajeroTarget}`).emit('caja:solicitud_pago', payload)
      } else {
        io.to('room:caja').emit('caja:nueva_cuenta', payload)
        io.to('room:caja').emit('caja:solicitud_pago', payload)
      }
      try {
        if (mesaActualizada) {
          const mesaDTO = await mesaService.obtenerMesaPorId(
            mesaActualizada._id.toString()
          )

          io.to('room:mesas').emit('mesas:updated', mesaDTO)
        }
      } catch (mesaErr) {
        console.warn(
          'Error al obtener mesa para mesas:updated en solicitarCuenta:',
          mesaErr
        )
      }
    } catch (socketError) {
      console.warn('Cuenta solicitada, pero falló la notificación en tiempo real:', socketError)
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
    console.error('Error al solicitar la cuenta:', error)
    res.status(500).json({
      mensaje: 'Error al solicitar la cuenta'
    })
  }
}

export const marcarPedidoRecogido = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params
    const usuarioAuthId = req.usuario?.id
    const usuarioRol = req.usuario?.rol || ''
    if (!usuarioAuthId) {
      res.status(401).json({ mensaje: 'Usuario no autenticado' })
      return
    }

    const resultado = await pedidoService.marcarPedidoRecogido(
      String(id),
      usuarioAuthId,
      usuarioRol
    )

    // Emitir eventos Socket.IO para sincronizar Cocina en tiempo real
    try {
      const io = getIO()
      io.to('room:cocina').emit('cocina:pedido_recogido', {
        pedidoId: resultado.pedido._id ? resultado.pedido._id.toString() : String(id),
        codigo: resultado.pedido.codigo,
        mesaId: resultado.pedido.mesa?._id || resultado.pedido.mesa,
        mesaNombre: (resultado.pedido.mesa as any)?.numero || 'Mesa',
        recogido: true,
        recogidoPor: usuarioAuthId,
        fechaRecogida: resultado.fechaRecogida
      })
      io.to('room:cocina').emit('cocina:actualizar_tablero', resultado.pedido)
    } catch (socketError) {
      console.warn(
        'Pedido marcado como recogido, pero falló la notificación Socket.IO:',
        socketError
      )
    }

    res.status(200).json(resultado)
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    console.error('Error al marcar pedido como recogido:', error)
    res.status(500).json({
      mensaje: 'Error al marcar pedido como recogido'
    })
  }
}

export const obtenerPedidosCocina = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const pedidos = await pedidoService.obtenerPedidosCocina()
    res.status(200).json(pedidos)
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    console.error('Error al obtener los pedidos de cocina:', error)
    res.status(500).json({ mensaje: 'Error al obtener los pedidos de cocina' })
  }
}
