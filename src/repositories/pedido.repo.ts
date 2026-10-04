// src/repositories/pedido.repo.ts
import mongoose, { Types, ClientSession } from 'mongoose'
import Pedido, { IPedido } from '../models/Pedido'
import CierreCaja from '../models/CierreCaja'
import { ESTADOS_PEDIDO } from '../utils/constants'

export { IPedido } from '../models/Pedido'

export interface PedidoCrearDatos {
  _id?: Types.ObjectId
  codigo: string
  fechaDiaBolivia: string
  fechaHoraBolivia?: string
  fechaHora: Date
  estado?: string
  total: number
  mesa?: string | Types.ObjectId
  usuario: string | Types.ObjectId
  detalles: any[]
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  cajeroAsignado?: string | Types.ObjectId
  [key: string]: any
}

export class PedidoRepository {
  /**
   * Crea y persiste un nuevo pedido en MongoDB
   */
  async crear(datos: PedidoCrearDatos): Promise<IPedido> {
    const nuevoPedido = new Pedido(datos)
    return await nuevoPedido.save()
  }

  /**
   * Busca un pedido por ID simple (sin populates)
   */
  async buscarPorId(id: string | Types.ObjectId): Promise<IPedido | null> {
    return await Pedido.findById(id)
  }

  /**
   * Busca un pedido por ID con populate completo para cocina y meseros
   */
  async buscarPorIdPoblado(id: string | Types.ObjectId): Promise<IPedido | null> {
    return await Pedido.findById(id)
      .populate('detalles.plato', 'nombre precio')
      .populate('mesa', 'numero')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('recogidoPor', 'nombre apellido apellidos')
  }

  /**
   * Busca un pedido por ID con populate completo para la vista de caja
   */
  async buscarPorIdPobladoCaja(id: string | Types.ObjectId): Promise<IPedido | null> {
    return await Pedido.findById(id)
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('recogidoPor', 'nombre apellido apellidos')
      .populate('detalles.plato', 'nombre precio')
  }

  /**
   * Busca pedidos aplicando filtros dinámicos con populates profundos (incluyendo categoría del plato)
   */
  async buscarConFiltros(filtro: Record<string, any>): Promise<IPedido[]> {
    return await Pedido.find(filtro)
      .populate('mesa', 'numero')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('cajeroAsignado', 'nombre apellido')
      .populate('recogidoPor', 'nombre apellido apellidos')
      .populate({
        path: 'detalles.plato',
        select: 'nombre precio',
        populate: { path: 'categoria', select: 'nombre' }
      })
      .sort({ createdAt: -1 })
  }

  /**
   * Marca un pedido como recogido físicamente por el mesero
   */
  async marcarComoRecogido(
    id: string | Types.ObjectId,
    usuarioId: string | Types.ObjectId,
    fechaRecogida: Date,
    session?: ClientSession
  ): Promise<IPedido | null> {
    return await Pedido.findByIdAndUpdate(
      id,
      {
        $set: {
          recogido: true,
          recogidoPor: usuarioId,
          fechaRecogida
        }
      },
      { returnDocument: 'after', session }
    )
      .populate('mesa', 'numero')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('recogidoPor', 'nombre apellido apellidos')
      .populate('detalles.plato', 'nombre precio')
  }

  /**
   * Actualiza campos arbitrarios de un pedido y retorna el documento actualizado poblado
   */
  async actualizar(
    id: string | Types.ObjectId,
    updates: Record<string, any>,
    session?: ClientSession
  ): Promise<IPedido | null> {
    return await Pedido.findByIdAndUpdate(
      id,
      { $set: updates },
      { returnDocument: 'after', session }
    )
      .populate('detalles.plato', 'nombre precio')
      .populate('mesa', 'numero')
      .populate('usuario', 'nombre apellido apellidos')
  }

  /**
   * Actualiza exclusivamente el estado de un pedido y retorna el documento poblado
   */
  async actualizarEstado(
    id: string | Types.ObjectId,
    nuevoEstado: string,
    session?: ClientSession
  ): Promise<IPedido | null> {
    return await Pedido.findByIdAndUpdate(
      id,
      { estado: nuevoEstado },
      { returnDocument: 'after', session }
    )
      .populate('mesa', 'numero')
      .populate('detalles.plato', 'nombre precio')
      .populate('usuario', 'nombre apellido')
  }

  /**
   * Guarda las modificaciones de una instancia de pedido ya existente
   */
  async guardar(pedidoDoc: IPedido, session?: ClientSession): Promise<IPedido> {
    return await pedidoDoc.save(session ? { session } : undefined)
  }

  /**
   * Busca pedidos pendientes de cobro para mesas en estado 'Cuenta Solicitada'
   */
  async buscarPendientesCobro(
    mesaIds: (string | Types.ObjectId)[],
    cajero?: string
  ): Promise<IPedido[]> {
    const filtroPedidos: any = {
      estado: { $nin: [ESTADOS_PEDIDO.CERRADO, ESTADOS_PEDIDO.CANCELADO] },
      mesa: { $in: mesaIds }
    }

    if (cajero) {
      filtroPedidos.$or = [
        { cajeroAsignado: cajero },
        { cajeroAsignado: null },
        { cajeroAsignado: { $exists: false } }
      ]
    }

    return await Pedido.find(filtroPedidos)
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('detalles.plato', 'nombre precio')
      .sort({ updatedAt: -1 })
  }

  /**
   * Consulta los reportes de cierre de caja recientes (últimas 48h)
   * Encapsulada temporalmente aquí para preservar GET /api/pedidos?reportesCierre=true
   */
  async buscarReportesCierre(desdeFecha: Date): Promise<any[]> {
    return await CierreCaja.find({
      fechaCierre: { $gte: desdeFecha }
    }).sort({ fechaCierre: -1 })
  }

  /**
   * Obtiene los códigos de pedidos registrados en un día específico de Bolivia
   * Utilizado para inicializar la secuencia del contador diario (Smart Seed)
   */
  async obtenerCodigosPorFechaDia(
    fechaDiaBolivia: string,
    session?: ClientSession
  ): Promise<{ codigo: string }[]> {
    return await Pedido.find(
      { fechaDiaBolivia, codigo: /^PED-\d{4}$/ },
      { codigo: 1 },
      session ? { session } : {}
    ).lean()
  }

  /**
   * Busca un pedido activo en curso para una mesa (ABIERTO, EN_PREPARACION, ENTREGADO).
   * Determina si la mesa debe permanecer ocupada por una comanda real.
   */
  async buscarPedidoActivoPorMesa(
    mesaId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<IPedido | null> {
    return await Pedido.findOne({
      mesa: mesaId,
      estado: {
        $in: [
          ESTADOS_PEDIDO.ABIERTO,
          ESTADOS_PEDIDO.EN_PREPARACION,
          ESTADOS_PEDIDO.ENTREGADO
        ]
      }
    }).session(session || null)
  }
}

export const pedidoRepository = new PedidoRepository()

