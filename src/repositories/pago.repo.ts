// src/repositories/pago.repo.ts
import { Types, ClientSession } from 'mongoose'
import Pago, { IPago } from '../models/Pago'
import type { PagoCrearDatos, PagoConRelaciones } from '../types/pago.types'

export { IPago } from '../models/Pago'
export { PagoCrearDatos } from '../types/pago.types'

export interface FiltrosPagoConsulta {
  _id?: Types.ObjectId | string
  codigoPago?: string
  codigoPedido?: string
  pedido?: Types.ObjectId | string
  mesa?: Types.ObjectId | string
  mesero?: Types.ObjectId | string
  cajero?: Types.ObjectId | string | null
  estadoPago?: IPago['estadoPago'] | string
  metodoPago?: IPago['metodoPago'] | string | null
  createdAt?: {
    $gte?: Date
    $lt?: Date
  }
  fechaPago?: {
    $gte?: Date
    $lt?: Date
  }
}

export class PagoRepository {
  /**
   * Crea y persiste un nuevo registro en la colección 'pagos'.
   * Si se proporciona una ClientSession, la inserción se ejecuta de forma atómica dentro de la transacción.
   */
  async crear(datos: PagoCrearDatos, session?: ClientSession): Promise<IPago> {
    const nuevoPago = new Pago(datos)
    return await nuevoPago.save(session ? { session } : undefined)
  }

  /**
   * Busca un pago por su identificador único (_id)
   * con populate de mesa, mesero, cajero y pedido.
   */
  /**
   * Lista pagos con filtros y paginación.
   * Las fechas de este historial se aplican sobre createdAt.
   */
  async listarPaginado(
    filtros: FiltrosPagoConsulta,
    pagina: number,
    limite: number
  ): Promise<{ datos: PagoConRelaciones[]; total: number }> {
    const [datos, total] = await Promise.all([
      Pago.find(filtros)
        .populate('mesa', 'numero ubicacion')
        .populate('mesero', 'nombre apellido')
        .populate('cajero', 'nombre apellido')
        .populate('pedido', 'codigo total estado')
        .sort({ createdAt: -1, _id: -1 })
        .skip((pagina - 1) * limite)
        .limit(limite)
        .exec(),
      Pago.countDocuments(filtros).exec()
    ])

    return { datos, total }
  }

  async buscarPorId(
    id: string | Types.ObjectId
  ): Promise<PagoConRelaciones | null> {
    return await Pago.findById(id)
      .populate('mesa', 'numero ubicacion')
      .populate('mesero', 'nombre apellido')
      .populate('cajero', 'nombre apellido')
      .populate('pedido', 'codigo total estado')
  }

  /**
   * Busca un pago por su identificador único de forma simple (sin populates)
   */
  async buscarPorIdSimple(id: string | Types.ObjectId): Promise<IPago | null> {
    return await Pago.findById(id)
  }

  /**
   * Busca el pago registrado para un pedido determinado.
   */
  async buscarPorPedidoId(
    pedidoId: string | Types.ObjectId
  ): Promise<PagoConRelaciones | null> {
    return await Pago.findOne({ pedido: pedidoId })
      .populate('mesa', 'numero ubicacion')
      .populate('mesero', 'nombre apellido')
      .populate('cajero', 'nombre apellido')
  }

  /**
   * Busca un pago por su código alfanumérico único (ej. PAG-XXXXXX).
   */
  async buscarPorCodigoPago(codigoPago: string): Promise<IPago | null> {
    return await Pago.findOne({ codigoPago })
  }

  /**
   * Obtiene todos los pagos aplicando filtros opcionales, ordenados por fecha de creación descendente.
   */
  async buscarTodos(
    filtros: FiltrosPagoConsulta = {}
  ): Promise<PagoConRelaciones[]> {
    return await Pago.find(filtros)
      .populate('mesa', 'numero')
      .populate('mesero', 'nombre apellido')
      .populate('cajero', 'nombre apellido')
      .sort({ createdAt: -1 })
  }

  /**
   * Cuenta la cantidad de pagos que coinciden con un criterio de búsqueda.
   */
  async resumirPagosParaCierreCaja(
    cajeroId: string,
    desde: Date,
    hastaExclusivo: Date,
    session?: ClientSession
  ): Promise<
    Array<{
      metodoPago: string | null
      totalRecaudado: number
      propinas: number
      cantidad: number
    }>
  > {
    if (!Types.ObjectId.isValid(cajeroId)) {
      throw new Error('El identificador del cajero no es válido.')
    }

    return await Pago.aggregate<{
      metodoPago: string | null
      totalRecaudado: number
      propinas: number
      cantidad: number
    }>([
      {
        $match: {
          cajero: new Types.ObjectId(cajeroId),
          estadoPago: 'Pagado',
          fechaPago: { $gte: desde, $lt: hastaExclusivo }
        }
      },
      {
        $group: {
          _id: '$metodoPago',
          totalRecaudado: { $sum: '$totalFinal' },
          propinas: { $sum: '$propina' },
          cantidad: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          metodoPago: '$_id',
          totalRecaudado: 1,
          propinas: 1,
          cantidad: 1
        }
      }
    ]).session(session ?? null)
  }

  async contar(filtros: FiltrosPagoConsulta = {}): Promise<number> {
    return await Pago.countDocuments(filtros)
  }}

export const pagoRepository = new PagoRepository()
