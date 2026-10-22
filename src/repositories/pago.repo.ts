// src/repositories/pago.repo.ts
import { Types, ClientSession } from 'mongoose'
import Pago, { IPago } from '../models/Pago'
import { PagoCrearDatos } from '../types/pago.types'

export { IPago } from '../models/Pago'
export { PagoCrearDatos } from '../types/pago.types'

export interface ResumenCierreCaja {
  totalDia: number
  efectivo: number
  tarjeta: number
  qr: number
  propinas: number
  pagosProcesados: number
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

    async buscarPagoIndividualPagadoPorPedidoId(
    pedidoId: string
  ): Promise<IPago | null> {
    if (!Types.ObjectId.isValid(pedidoId)) {
      return null
    }

    return await Pago.findOne({
      pedido: new Types.ObjectId(pedidoId),
      cuentaMesa: null,
      estadoPago: 'Pagado'
    }).exec()
  }

    /**
   * Busca el pago asociado a una cuenta de mesa.
   * Permite consultar dentro de una transacción MongoDB.
   */
  async buscarPorCuentaMesa(
    cuentaMesaId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<IPago | null> {
    return await Pago.findOne({
      cuentaMesa: cuentaMesaId
    })
      .session(session ?? null)
      .populate('mesa', 'numero ubicacion')
      .populate('mesero', 'nombre apellido')
      .populate('cajero', 'nombre apellido')
      .populate('cuentaMesa')
      .populate('pedidos', 'codigo total estado')
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


    async calcularResumenCierreCaja(
    cajeroId: string,
    desdeFecha: Date,
    hastaFecha: Date,
    session?: ClientSession
  ): Promise<ResumenCierreCaja> {
    if (!Types.ObjectId.isValid(cajeroId)) {
      throw new Error('El identificador del cajero no es válido.')
    }

    const consulta = Pago.aggregate<ResumenCierreCaja>([
      {
        $match: {
          cajero: new Types.ObjectId(cajeroId),
          estadoPago: 'Pagado',
          fechaPago: {
            $gt: desdeFecha,
            $lte: hastaFecha
          }
        }
      },
      {
        $group: {
          _id: null,
          totalDia: {
            $sum: { $ifNull: ['$totalFinal', 0] }
          },
          efectivo: {
            $sum: {
              $cond: [
                { $eq: ['$metodoPago', 'Efectivo'] },
                { $ifNull: ['$totalFinal', 0] },
                0
              ]
            }
          },
          tarjeta: {
            $sum: {
              $cond: [
                { $eq: ['$metodoPago', 'Tarjeta'] },
                { $ifNull: ['$totalFinal', 0] },
                0
              ]
            }
          },
          qr: {
            $sum: {
              $cond: [
                { $eq: ['$metodoPago', 'QR'] },
                { $ifNull: ['$totalFinal', 0] },
                0
              ]
            }
          },
          propinas: {
            $sum: { $ifNull: ['$propina', 0] }
          },
          pagosProcesados: {
            $sum: 1
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalDia: { $round: ['$totalDia', 2] },
          efectivo: { $round: ['$efectivo', 2] },
          tarjeta: { $round: ['$tarjeta', 2] },
          qr: { $round: ['$qr', 2] },
          propinas: { $round: ['$propinas', 2] },
          pagosProcesados: 1
        }
      }
    ])

    if (session) {
      consulta.session(session)
    }

    const resultados = await consulta.exec()

    return resultados[0] ?? {
      totalDia: 0,
      efectivo: 0,
      tarjeta: 0,
      qr: 0,
      propinas: 0,
      pagosProcesados: 0
    }
  }
  /**
   * Cuenta la cantidad de pagos que coinciden con un criterio de búsqueda.
   */
  async contar(filtros: Record<string, any> = {}): Promise<number> {
    return await Pago.countDocuments(filtros)
  }
}

export const pagoRepository = new PagoRepository()
