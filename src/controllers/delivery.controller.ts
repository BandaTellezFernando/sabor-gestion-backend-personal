//src/controllers/delivery.controller.ts
import { Response } from 'express'
import Pedido from '../models/Pedido'
import Usuario from '../models/Usuario'
import { CustomRequest } from '../middlewares/auth.middleware'
import {
  contarPedidosActivosRepartidor,
  MAX_PEDIDOS_REPARTIDOR
} from '../services/delivery.service'
import { procesarDescuentoPedido } from '../services/inventario.service'
import { getIO } from '../socket/socket'

export interface AuthRequest extends CustomRequest {
  user?: any
}

const obtenerUsuarioId = (req: AuthRequest): string | undefined =>
  req.usuario?.id || req.user?.id || req.user?._id

const emitirDeliveryPedido = (evento: string, pedido: any): void => {
  try {
    const io = getIO()
    io.to(String(pedido._id)).emit(evento, pedido)
    io.emit(evento, pedido)
  } catch (error) {
    console.warn(`[Delivery] Pedido actualizado, pero fallo el socket ${evento}`)
  }
}

// PUT /api/delivery/status
export const updateDeliveryStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { isAvailable } = req.body
    const repartidorId = obtenerUsuarioId(req)

    if (!repartidorId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' })
      return
    }

    const repartidor = await Usuario.findByIdAndUpdate(
      repartidorId,
      { isAvailable: Boolean(isAvailable) },
      { returnDocument: 'after' }
    )

    res.status(200).json({ success: true, isAvailable: repartidor?.isAvailable })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error actualizando estado' })
  }
}

// GET /api/delivery/queue
export const getDeliveryQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const repartidorId = obtenerUsuarioId(req)
    if (!repartidorId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' })
      return
    }

    const pedidos = await Pedido.find({
      repartidorId,
      estado: { $in: ['Pendiente_de_Aceptacion', 'Repartidor_Esperando', 'En_Transito'] }
    })
      .populate('detalles.plato', 'nombre precio')
      .populate('usuario', 'nombre apellido apellidos')

    if (pedidos.length > MAX_PEDIDOS_REPARTIDOR) {
      console.warn(`Repartidor ${repartidorId} supero el limite de pedidos activos.`)
    }

    res.status(200).json({ success: true, pedidos, limite: MAX_PEDIDOS_REPARTIDOR })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error obteniendo cola de pedidos' })
  }
}

// PUT /api/delivery/orders/:id/accept
export const acceptOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const repartidorId = obtenerUsuarioId(req)

    if (!repartidorId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' })
      return
    }

    const pedidosActivos = await contarPedidosActivosRepartidor(repartidorId)
    if (pedidosActivos >= MAX_PEDIDOS_REPARTIDOR) {
      res.status(409).json({
        success: false,
        message: `No puedes aceptar mas de ${MAX_PEDIDOS_REPARTIDOR} pedidos activos.`
      })
      return
    }

    const pedido = await Pedido.findOneAndUpdate(
      {
        _id: id,
        repartidorId,
        estado: 'Pendiente_de_Aceptacion'
      },
      { estado: 'Repartidor_Esperando' },
      { returnDocument: 'after' }
    )
      .populate('detalles.plato', 'nombre precio')
      .populate('usuario', 'nombre apellido apellidos')

    if (!pedido) {
      res
        .status(404)
        .json({ success: false, message: 'Pedido no encontrado o no asignado al repartidor' })
      return
    }

    emitirDeliveryPedido('delivery:pedido_aceptado', pedido)
    res.status(200).json({ success: true, pedido })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error aceptando pedido' })
  }
}

// PUT /api/delivery/orders/:id/reject
export const rejectOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const repartidorId = obtenerUsuarioId(req)

    if (!repartidorId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' })
      return
    }

    const pedido = await Pedido.findOneAndUpdate(
      {
        _id: id,
        repartidorId,
        estado: 'Pendiente_de_Aceptacion'
      },
      { $unset: { repartidorId: '' } },
      { returnDocument: 'after' }
    )

    if (!pedido) {
      res
        .status(404)
        .json({ success: false, message: 'Pedido no encontrado o no asignado al repartidor' })
      return
    }

    emitirDeliveryPedido('delivery:pedido_rechazado', pedido)
    res.status(200).json({ success: true, pedido })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error rechazando pedido' })
  }
}

// PUT /api/delivery/orders/:id/state
export const updateOrderState = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { estado } = req.body
    const repartidorId = obtenerUsuarioId(req)

    if (!repartidorId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' })
      return
    }

    const estadosValidos = [
      'Pendiente_de_Aceptacion',
      'En_Cocina',
      'Repartidor_Esperando',
      'En_Transito',
      'Entregado',
      'Senal_Debil'
    ]
    if (!estadosValidos.includes(estado)) {
      res.status(400).json({ success: false, message: 'Estado invalido' })
      return
    }

    const pedido = await Pedido.findOneAndUpdate(
      { _id: id, repartidorId },
      { estado },
      { returnDocument: 'after' }
    )
      .populate('detalles.plato', 'nombre precio')
      .populate('usuario', 'nombre apellido apellidos')

    if (!pedido) {
      res
        .status(404)
        .json({ success: false, message: 'Pedido no encontrado o no asignado al repartidor' })
      return
    }

    if (estado === 'Entregado') {
      try {
        await procesarDescuentoPedido(String(pedido._id))
      } catch (inventarioError) {
        console.error(
          `[Delivery] Error descontando inventario del pedido ${pedido._id}:`,
          inventarioError
        )
      }
    }

    emitirDeliveryPedido('delivery:estado_actualizado', pedido)
    res.status(200).json({ success: true, pedido })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error actualizando estado del pedido' })
  }
}
