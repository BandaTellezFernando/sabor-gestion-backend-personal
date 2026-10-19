// src/repositories/dashboard.repo.ts
import { Types } from 'mongoose'
import Pedido from '../models/Pedido'
import Pago from '../models/Pago'
import Mesa from '../models/Mesa'
import { ESTADOS_MESA, ESTADOS_TANDA_COCINA } from '../utils/constants'
import {
  VentasHoyRaw,
  PlatoPopularRaw,
  CategoriaPopularRaw,
  OrdenRecienteRaw,
  MesaOrdenRecienteRaw
} from '../types/dashboard.types'

export {
  VentasHoyRaw,
  PlatoPopularRaw,
  CategoriaPopularRaw,
  OrdenRecienteRaw,
  MesaOrdenRecienteRaw
} from '../types/dashboard.types'

/**
 * Repositorio de consultas y agregaciones analíticas para el módulo Dashboard
 */
export class DashboardRepository {
/**
   * Consulta A: resume pagos confirmados en el intervalo recibido.
   * Cuenta cada pedido una sola vez, según el modelo de pago completo.
   */
  async obtenerVentasYOrdenesDia(
    inicio: Date,
    hastaExclusivo: Date
  ): Promise<VentasHoyRaw> {
    const resultado = await Pago.aggregate<VentasHoyRaw>([
      {
        $match: {
          estadoPago: 'Pagado',
          fechaPago: { $gte: inicio, $lt: hastaExclusivo }
        }
      },
      { $sort: { fechaPago: 1, _id: 1 } },
      {
        $group: {
          _id: '$pedido',
          totalFinal: { $first: '$totalFinal' }
        }
      },
      {
        $group: {
          _id: null,
          totalVentas: { $sum: '$totalFinal' },
          totalOrdenes: { $sum: 1 }
        }
      }
    ])

    return resultado[0] || { totalVentas: 0, totalOrdenes: 0 }
  }

/**
   * Consulta B: cuenta mesas que están ocupadas o esperando el cobro.
   */
  async contarMesasActivas(): Promise<number> {
    return await Mesa.countDocuments({
      estado: {
        $in: [
          ESTADOS_MESA.OCUPADA,
          ESTADOS_MESA.CUENTA_SOLICITADA
        ]
      }
    })
  }

/**
   * Consulta C: platos más vendidos en pedidos pagados durante el período.
   * Excluye detalles vinculados a tandas canceladas.
   */
  async obtenerPlatosMasVendidos(
    inicio: Date,
    hastaExclusivo: Date,
    limite: number = 5
  ): Promise<PlatoPopularRaw[]> {
    return await Pago.aggregate<PlatoPopularRaw>([
      {
        $match: {
          estadoPago: 'Pagado',
          fechaPago: { $gte: inicio, $lt: hastaExclusivo }
        }
      },
      // Un pedido se analiza una sola vez aunque existan pagos duplicados.
      { $group: { _id: '$pedido' } },
      {
        $lookup: {
          from: 'pedidos',
          localField: '_id',
          foreignField: '_id',
          as: 'pedido'
        }
      },
      { $unwind: '$pedido' },
      { $match: { 'pedido.estado': 'CERRADO' } },
      {
        $addFields: {
          _tandasCanceladasIds: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ['$pedido.tandas', []] },
                  as: 'tanda',
                  cond: {
                    $eq: [
                      '$$tanda.estado',
                      ESTADOS_TANDA_COCINA.CANCELADA
                    ]
                  }
                }
              },
              as: 'tandaCancelada',
              in: '$$tandaCancelada._id'
            }
          }
        }
      },
      { $unwind: '$pedido.detalles' },
      {
        $match: {
          $or: [
            { 'pedido.detalles.tandaId': { $exists: false } },
            { 'pedido.detalles.tandaId': null },
            {
              $expr: {
                $not: [
                  {
                    $in: [
                      '$pedido.detalles.tandaId',
                      '$_tandasCanceladasIds'
                    ]
                  }
                ]
              }
            }
          ]
        }
      },
      {
        $group: {
          _id: '$pedido.detalles.plato',
          cantidadVendida: { $sum: '$pedido.detalles.cantidad' }
        }
      },
      { $sort: { cantidadVendida: -1 } },
      { $limit: limite },
      {
        $lookup: {
          from: 'platos',
          localField: '_id',
          foreignField: '_id',
          as: 'datosPlato'
        }
      },
      { $unwind: '$datosPlato' }
    ])
  }

/**
   * Consulta D: categorías populares según las cantidades vendidas
   * en pedidos pagados durante el período, excluyendo tandas canceladas.
   */
  async obtenerCategoriasPopulares(
    inicio: Date,
    hastaExclusivo: Date
  ): Promise<CategoriaPopularRaw[]> {
    return await Pago.aggregate<CategoriaPopularRaw>([
      {
        $match: {
          estadoPago: 'Pagado',
          fechaPago: { $gte: inicio, $lt: hastaExclusivo }
        }
      },
      { $group: { _id: '$pedido' } },
      {
        $lookup: {
          from: 'pedidos',
          localField: '_id',
          foreignField: '_id',
          as: 'pedido'
        }
      },
      { $unwind: '$pedido' },
      { $match: { 'pedido.estado': 'CERRADO' } },
      {
        $addFields: {
          _tandasCanceladasIds: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ['$pedido.tandas', []] },
                  as: 'tanda',
                  cond: {
                    $eq: [
                      '$$tanda.estado',
                      ESTADOS_TANDA_COCINA.CANCELADA
                    ]
                  }
                }
              },
              as: 'tandaCancelada',
              in: '$$tandaCancelada._id'
            }
          }
        }
      },
      { $unwind: '$pedido.detalles' },
      {
        $match: {
          $or: [
            { 'pedido.detalles.tandaId': { $exists: false } },
            { 'pedido.detalles.tandaId': null },
            {
              $expr: {
                $not: [
                  {
                    $in: [
                      '$pedido.detalles.tandaId',
                      '$_tandasCanceladasIds'
                    ]
                  }
                ]
              }
            }
          ]
        }
      },
      {
        $lookup: {
          from: 'platos',
          localField: 'pedido.detalles.plato',
          foreignField: '_id',
          as: 'plato'
        }
      },
      { $unwind: '$plato' },
      {
        $lookup: {
          from: 'categorias',
          localField: 'plato.categoria',
          foreignField: '_id',
          as: 'categoria'
        }
      },
      { $unwind: '$categoria' },
      {
        $group: {
          _id: '$categoria.nombre',
          totalPedidos: { $sum: '$pedido.detalles.cantidad' }
        }
      },
      { $sort: { totalPedidos: -1 } }
    ])
  }

  /**
   * Consulta E: Búsqueda de las órdenes más recientes con populate de mesa
   */
  async obtenerOrdenesRecientes(limite: number = 5): Promise<OrdenRecienteRaw[]> {
    const pedidos = await Pedido.find()
      .sort({ createdAt: -1 })
      .limit(limite)
      .populate<{ mesa: MesaOrdenRecienteRaw | null }>('mesa', 'numero')
      .lean()

    return pedidos.map((p) => {
      const mesaDoc =
        p.mesa && typeof p.mesa === 'object' && 'numero' in p.mesa
          ? { _id: p.mesa._id as Types.ObjectId, numero: p.mesa.numero }
          : null

      return {
        _id: p._id as Types.ObjectId,
        codigo: p.codigo,
        mesa: mesaDoc,
        fechaHora: p.fechaHora || new Date(),
        estado: p.estado,
        total: p.total
      }
    })
  }

  /**
   * Consulta F: Conteo total de mesas registradas en el sistema
   */
  async contarTotalMesas(): Promise<number> {
    return await Mesa.countDocuments()
  }
}

export const dashboardRepository = new DashboardRepository()
