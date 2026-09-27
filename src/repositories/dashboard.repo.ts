// src/repositories/dashboard.repo.ts
import { Types } from 'mongoose'
import Pedido from '../models/Pedido'
import Mesa from '../models/Mesa'
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
   * Consulta A: Agregación de ventas totales y cantidad de órdenes cerradas dentro de un rango de fechas
   */
  async obtenerVentasYOrdenesDia(inicio: Date, fin: Date): Promise<VentasHoyRaw> {
    const resultado = await Pedido.aggregate<VentasHoyRaw>([
      {
        $match: {
          createdAt: { $gte: inicio, $lte: fin },
          estado: 'CERRADO'
        }
      },
      {
        $group: {
          _id: null,
          totalVentas: { $sum: '$total' },
          totalOrdenes: { $count: {} }
        }
      }
    ])

    return resultado[0] || { totalVentas: 0, totalOrdenes: 0 }
  }

  /**
   * Consulta B: Conteo de mesas activas (cuyo estado sea distinto a 'Libre')
   */
  async contarMesasActivas(): Promise<number> {
    return await Mesa.countDocuments({ estado: { $ne: 'Libre' } })
  }

  /**
   * Consulta C: Agregación de los platos más vendidos históricos en pedidos cerrados
   */
  async obtenerPlatosMasVendidos(limite: number = 5): Promise<PlatoPopularRaw[]> {
    return await Pedido.aggregate<PlatoPopularRaw>([
      { $match: { estado: 'CERRADO' } },
      { $unwind: '$detalles' },
      {
        $group: {
          _id: '$detalles.plato',
          cantidadVendida: { $sum: '$detalles.cantidad' }
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
   * Consulta D: Agregación de popularidad de categorías con doble lookup (Pedido -> Plato -> Categoria)
   */
  async obtenerCategoriasPopulares(): Promise<CategoriaPopularRaw[]> {
    return await Pedido.aggregate<CategoriaPopularRaw>([
      { $match: { estado: 'CERRADO' } },
      { $unwind: '$detalles' },
      {
        $lookup: {
          from: 'platos',
          localField: 'detalles.plato',
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
          totalPedidos: { $sum: '$detalles.cantidad' }
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
