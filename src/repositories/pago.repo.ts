// src/repositories/pago.repo.ts
import { Types, ClientSession } from 'mongoose'
import Pago, { IPago } from '../models/Pago'
import { PagoCrearDatos } from '../types/pago.types'

export { IPago } from '../models/Pago'
export { PagoCrearDatos } from '../types/pago.types'

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
  async buscarPorId(id: string | Types.ObjectId): Promise<IPago | null> {
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
  async buscarPorPedidoId(pedidoId: string | Types.ObjectId): Promise<IPago | null> {
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
  async buscarTodos(filtros: Record<string, any> = {}): Promise<IPago[]> {
    return await Pago.find(filtros)
      .populate('mesa', 'numero')
      .populate('mesero', 'nombre apellido')
      .populate('cajero', 'nombre apellido')
      .sort({ createdAt: -1 })
  }

  /**
   * Cuenta la cantidad de pagos que coinciden con un criterio de búsqueda.
   */
  async contar(filtros: Record<string, any> = {}): Promise<number> {
    return await Pago.countDocuments(filtros)
  }
}

export const pagoRepository = new PagoRepository()
