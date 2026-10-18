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

function obtenerIdReferenciaMesa(valor: unknown): string | undefined {
  if (typeof valor === 'string') {
    return valor
  }

  if (!valor || typeof valor !== 'object') {
    return undefined
  }

  if ('_id' in valor) {
    const id = obtenerIdReferenciaMesa(valor._id)
    if (id) return id
  }

  const id = String(valor)
  return id !== '[object Object]' ? id : undefined
}

function obtenerNombreMesa(valor: unknown): string | undefined {
  if (!valor || typeof valor !== 'object') {
    return undefined
  }

  const numero = 'numero' in valor ? valor.numero : undefined
  const name = 'name' in valor ? valor.name : undefined
  const nombre = 'nombre' in valor ? valor.nombre : undefined

  for (const candidato of [numero, name, nombre]) {
    if (typeof candidato === 'string' || typeof candidato === 'number') {
      return String(candidato)
    }
  }

  return undefined
}


export const crearPedido = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const usuarioAuthId = req.usuario?.id
    const resultado = await pedidoService.crearPedido(req.body, usuarioAuthId)

    // Notificaciones en tiempo real
    try {
      const io = getIO()

      // Notificar a todos los meseros que la mesa ahora está ocupada (se pone roja)
      if (resultado.mesaActualizada) {
        try {
          const mesaDTO = await mesaService.obtenerMesaPorId(
            resultado.mesaActualizada._id.toString()
          )
          io.emit('mesas:updated', mesaDTO)
        } catch (mesaErr) {
          console.warn('Error al obtener mesa para mesas:updated:', mesaErr)
        }
      }
    } catch {
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
    console.error('Error al registrar el pedido:', error)
    res.status(500).json({ mensaje: 'Error al registrar el pedido' })
  }
}

export const crearTandaPedido = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const usuarioAuthId = req.usuario?.id

    if (!usuarioAuthId) {
      res.status(401).json({ mensaje: 'Usuario no autenticado' })
      return
    }

    const detalles = req.body?.detalles

    const resultado = await pedidoService.crearTandaPedido(
      String(req.params.id),
      { detalles },
      usuarioAuthId,
      req.usuario?.rol
    )

    res.status(201).json({
      mensaje: 'Tanda creada como borrador. Todavía no se ha enviado a cocina.',
      ...resultado
    })
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message,
        ...error.extra
      })
      return
    }

    console.error('Error al crear la tanda:', error)
    res.status(500).json({ mensaje: 'Error al crear la tanda' })
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

export const cancelarTandaPedido = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const usuarioAuthId = req.usuario?.id

    if (!usuarioAuthId) {
      res.status(401).json({ mensaje: 'Usuario no autenticado' })
      return
    }

    const resultado = await pedidoService.cancelarTandaPedido(
      String(req.params.id),
      String(req.params.tandaId),
      usuarioAuthId,
      req.usuario?.rol,
      typeof req.body?.motivo === 'string' ? req.body.motivo : undefined
    )

    try {
      const io = getIO()
      const evento = {
        pedidoId: resultado.pedido._id?.toString() || String(req.params.id),
        tandaId: resultado.tanda._id?.toString() || String(req.params.tandaId),
        numeroTanda: resultado.tanda.numeroTanda,
        estado: resultado.tanda.estado,
        pedido: resultado.pedido,
        cuentaCancelada: resultado.cuentaCancelada
      }

      io.emit('cocina:tanda_cancelada', evento)
      io.emit('cocina:tanda_actualizada', evento)

      if (resultado.mesaLiberada) {
        const mesaDTO = await mesaService.obtenerMesaPorId(
          resultado.mesaLiberada._id.toString()
        )
        io.emit('mesas:updated', mesaDTO)
      }
    } catch (socketError) {
      console.warn(
        'Tanda cancelada, pero falló la notificación Socket.IO:',
        socketError
      )
    }

    res.status(200).json({
      mensaje: resultado.cuentaCancelada
        ? 'Tanda cancelada; la cuenta quedó cancelada y la mesa fue liberada.'
        : 'Tanda cancelada correctamente.',
      pedido: resultado.pedido,
      tanda: resultado.tanda,
      cuentaCancelada: resultado.cuentaCancelada
    })
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message,
        ...error.extra
      })
      return
    }

    console.error('Error al cancelar tanda:', error)
    res.status(500).json({ mensaje: 'Error al cancelar la tanda' })
  }
}

export const cancelarPedido = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const resultado = await pedidoService.cancelarPedido(
      String(id),
      req.usuario?.id,
      req.usuario?.rol
    )

    // Avisar por WebSocket que la mesa vuelve a estar disponible (verde)
    if (resultado.mesaLiberada) {
      try {
        const mesaDTO = await mesaService.obtenerMesaPorId(
          resultado.mesaLiberada._id.toString()
        )
        getIO().emit('mesas:updated', mesaDTO)
      } catch (socketError) {
        console.warn('Fallo al emitir actualización de mesa por socket:', socketError)
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
    console.error('Error al procesar la cancelación:', error)
    res.status(500).json({ mensaje: 'Error al procesar la cancelación' })
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
        io.to('room:meseros').emit('mesas:alerta_listo', {
          pedidoId: pedidoActualizado._id.toString(),
          mesaId: obtenerIdReferenciaMesa(pedidoActualizado.mesa),
          mesaNombre: pedidoActualizado.mesa
            ? obtenerNombreMesa(pedidoActualizado.mesa) ?? 'Mesa'
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
      getIO().emit('cocina:actualizar_tablero', resultado.pedidoDoc)
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
        const mesaDTO = await mesaService.obtenerMesaPorId(mesaActualizada._id.toString())
        io.emit('mesas:updated', mesaDTO)
      } catch (mesaErr) {
        console.warn('Error al obtener mesa para mesas:updated en solicitarCuenta:', mesaErr)
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

export const marcarTandaEntregada = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const usuarioAuthId = req.usuario?.id
    const usuarioRol = req.usuario?.rol || ''

    if (!usuarioAuthId) {
      res.status(401).json({ mensaje: 'Usuario no autenticado' })
      return
    }

    const resultado = await pedidoService.marcarTandaEntregada(
      String(req.params.id),
      String(req.params.tandaId),
      usuarioAuthId,
      usuarioRol
    )

    try {
      const io = getIO()
      const pedidoId = resultado.pedido._id
        ? resultado.pedido._id.toString()
        : String(req.params.id)

      const evento = {
        pedidoId,
        tandaId: resultado.tanda._id?.toString() || String(req.params.tandaId),
        numeroTanda: resultado.tanda.numeroTanda,
        estado: resultado.tanda.estado,
        fechaRecogida: resultado.fechaRecogida,
        pedido: resultado.pedido
      }

      io.emit('cocina:tanda_actualizada', evento)
      io.emit('cocina:tanda_entregada', evento)
    } catch (socketError) {
      console.warn(
        'Tanda entregada, pero falló la notificación Socket.IO:',
        socketError
      )
    }

    res.status(200).json(resultado)
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message,
        ...error.extra
      })
      return
    }

    console.error('Error al marcar la tanda como entregada:', error)
    res.status(500).json({
      mensaje: 'Error al marcar la tanda como entregada'
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
      io.emit('cocina:pedido_recogido', {
        pedidoId: resultado.pedido._id ? resultado.pedido._id.toString() : String(id),
        codigo: resultado.pedido.codigo,
        mesaId: obtenerIdReferenciaMesa(resultado.pedido.mesa),
        mesaNombre: obtenerNombreMesa(resultado.pedido.mesa) ?? 'Mesa',
        recogido: true,
        recogidoPor: usuarioAuthId,
        fechaRecogida: resultado.fechaRecogida
      })
      io.emit('cocina:actualizar_tablero', resultado.pedido)
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

export const enviarTandaCocina = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const usuarioAuthId = req.usuario?.id

    if (!usuarioAuthId) {
      res.status(401).json({ mensaje: 'Usuario no autenticado' })
      return
    }

    const resultado = await pedidoService.enviarTandaCocina(
      String(req.params.id),
      String(req.params.tandaId),
      usuarioAuthId,
      req.usuario?.rol
    )

    // La notificación ocurre únicamente después de confirmar la transacción.
    try {
      getIO().emit('cocina:nueva_tanda', {
        pedidoId: resultado.pedido._id?.toString(),
        codigo: resultado.pedido.codigo,
        pedido: resultado.pedido,
        tanda: resultado.tanda
      })

      getIO().emit('cocina:actualizar_tablero', resultado.pedido)
    } catch (socketError) {
      console.warn(
        'Tanda enviada correctamente, pero falló la notificación Socket.IO:',
        socketError
      )
    }

    res.status(200).json({
      mensaje: 'Tanda enviada a cocina correctamente',
      ...resultado
    })
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message,
        ...error.extra
      })
      return
    }

    console.error('Error al enviar la tanda a cocina:', error)
    res.status(500).json({
      mensaje: 'Error al enviar la tanda a cocina'
    })
  }
}

export const actualizarEstadoTandaCocina = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const usuarioAuthId = req.usuario?.id
    if (!usuarioAuthId) {
      res.status(401).json({ mensaje: 'Usuario no autenticado' })
      return
    }

    const resultado = await pedidoService.actualizarEstadoTandaCocina(
      String(req.params.id),
      String(req.params.tandaId),
      String(req.body?.estado || ''),
      usuarioAuthId,
      req.usuario?.rol
    )

    try {
      const io = getIO()
      const evento = {
        pedidoId: resultado.pedido._id.toString(),
        codigo: resultado.pedido.codigo,
        tanda: resultado.tanda
      }

      io.emit('cocina:tanda_actualizada', evento)

      if (resultado.disparaAlertaListo) {
        io.to('room:meseros').emit('mesas:alerta_listo', evento)
      }
    } catch (socketError) {
      console.warn(
        'Estado de tanda actualizado, pero falló la notificación Socket.IO:',
        socketError
      )
    }

    res.status(200).json({
      mensaje: 'Estado de la tanda actualizado correctamente',
      pedidoId: resultado.pedido._id,
      tanda: resultado.tanda
    })
  } catch (error) {
    if (error instanceof PedidoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message,
        ...error.extra
      })
      return
    }

    console.error('Error al actualizar el estado de la tanda:', error)
    res.status(500).json({
      mensaje: 'Error al actualizar el estado de la tanda'
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
