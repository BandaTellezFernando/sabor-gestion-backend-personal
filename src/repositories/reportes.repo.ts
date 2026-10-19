import Pago from '../models/Pago'
import type { PipelineStage } from 'mongoose'
import { ESTADOS_TANDA_COCINA } from '../utils/constants'

export interface RangoReportePagos {
  desde?: Date
  hastaExclusivo: Date
}

export interface ResumenVentasReporte {
  totalCobrado: number
  cantidadOperaciones: number
  operacionesConPropina: number
  operacionesSinPropina: number
}

export interface EvolucionDiariaReporte {
  fecha: string
  totalCobrado: number
  cantidadOperaciones: number
  operacionesConPropina: number
}

export interface TotalMetodoPagoReporte {
  metodoPago: string
  totalCobrado: number
  cantidadOperaciones: number
  operacionesConPropina: number
  operacionesSinPropina: number
}

export interface TotalCajeroReporte {
  cajeroId: string | null
  nombreCajero: string
  totalCobrado: number
  cantidadOperaciones: number
  operacionesConPropina: number
  operacionesSinPropina: number
}

export interface ProductoReporte {
  platoId: string
  nombre: string
  categoria: string
  unidadesVendidas: number
  importeVendido: number
}

export interface CategoriaReporte {
  categoriaId: string
  nombre: string
  unidadesVendidas: number
  importeVendido: number
}

interface FiltroPagosReporte {
  estadoPago: 'Pagado'
  fechaPago: {
    $type: 'date'
    $lt: Date
    $gte?: Date
  }
}

type ExpresionTienePropina = {
  $gt: [
    { $ifNull: ['$propina', 0] },
    0
  ]
}

export class ReportesRepository {
  /**
   * Construye un único filtro financiero para todos los reportes.
   * No consulta pagos pendientes, procesados ni anulados.
   */
  private construirFiltroPagos(
    rango: RangoReportePagos
  ): FiltroPagosReporte {
    const fechaPago: FiltroPagosReporte['fechaPago'] = {
      $type: 'date',
      $lt: rango.hastaExclusivo
    }

    if (rango.desde) {
      fechaPago.$gte = rango.desde
    }

    return {
      estadoPago: 'Pagado',
      fechaPago
    }
  }

  private expresionTienePropina(): ExpresionTienePropina {
    return {
      $gt: [{ $ifNull: ['$propina', 0] }, 0]
    }
  }

  /**
   * Reporte de ventas del período.
   * Total cobrado = subtotal + propina.
   */
  async obtenerResumenVentas(
    rango: RangoReportePagos
  ): Promise<{
    totalCobrado: number
    cantidadOperaciones: number
    operacionesConPropina: number
    operacionesSinPropina: number
  }> {
    const tienePropina = this.expresionTienePropina()

    const resultado = await Pago.aggregate<ResumenVentasReporte>([
      {
        $match: this.construirFiltroPagos(rango)
      },
      {
        $group: {
          _id: null,
          totalCobrado: { $sum: '$totalFinal' },
          cantidadOperaciones: { $sum: 1 },
          operacionesConPropina: {
            $sum: { $cond: [tienePropina, 1, 0] }
          },
          operacionesSinPropina: {
            $sum: { $cond: [tienePropina, 0, 1] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalCobrado: 1,
          cantidadOperaciones: 1,
          operacionesConPropina: 1,
          operacionesSinPropina: 1
        }
      }
    ])

    return resultado[0] ?? {
      totalCobrado: 0,
      cantidadOperaciones: 0,
      operacionesConPropina: 0,
      operacionesSinPropina: 0
    }
  }

  /**
   * Evolución diaria usando el calendario de Bolivia.
   */
  async obtenerEvolucionDiaria(
    rango: RangoReportePagos
  ): Promise<EvolucionDiariaReporte[]> {
    const tienePropina = this.expresionTienePropina()

    return await Pago.aggregate<EvolucionDiariaReporte>([
      {
        $match: this.construirFiltroPagos(rango)
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$fechaPago',
              timezone: 'America/La_Paz'
            }
          },
          totalCobrado: { $sum: '$totalFinal' },
          cantidadOperaciones: { $sum: 1 },
          operacionesConPropina: {
            $sum: { $cond: [tienePropina, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          fecha: '$_id',
          totalCobrado: 1,
          cantidadOperaciones: 1,
          operacionesConPropina: 1
        }
      }
    ])
  }

  /**
   * Consolidado global por método de pago.
   * No aplica filtros por cajero.
   */
  async obtenerTotalesPorMetodoPago(
    rango: RangoReportePagos
  ): Promise<TotalMetodoPagoReporte[]> {
    const tienePropina = this.expresionTienePropina()

    return await Pago.aggregate<TotalMetodoPagoReporte>([
      {
        $match: this.construirFiltroPagos(rango)
      },
      {
        $group: {
          _id: { $ifNull: ['$metodoPago', 'Sin método'] },
          totalCobrado: { $sum: '$totalFinal' },
          cantidadOperaciones: { $sum: 1 },
          operacionesConPropina: {
            $sum: { $cond: [tienePropina, 1, 0] }
          },
          operacionesSinPropina: {
            $sum: { $cond: [tienePropina, 0, 1] }
          }
        }
      },
      { $sort: { totalCobrado: -1, _id: 1 } },
      {
        $project: {
          _id: 0,
          metodoPago: '$_id',
          totalCobrado: 1,
          cantidadOperaciones: 1,
          operacionesConPropina: 1,
          operacionesSinPropina: 1
        }
      }
    ])
  }

  /**
   * Consolidado automático por cajero.
   * No acepta cajeroId como filtro de entrada.
   */
  async obtenerTotalesPorCajero(
    rango: RangoReportePagos
  ): Promise<TotalCajeroReporte[]> {
    const tienePropina = this.expresionTienePropina()

    return await Pago.aggregate<TotalCajeroReporte>([
      {
        $match: this.construirFiltroPagos(rango)
      },
      {
        $group: {
          _id: '$cajero',
          totalCobrado: { $sum: '$totalFinal' },
          cantidadOperaciones: { $sum: 1 },
          operacionesConPropina: {
            $sum: { $cond: [tienePropina, 1, 0] }
          },
          operacionesSinPropina: {
            $sum: { $cond: [tienePropina, 0, 1] }
          }
        }
      },
      {
        $lookup: {
          from: 'usuarios',
          localField: '_id',
          foreignField: '_id',
          as: 'datosCajero'
        }
      },
      {
        $unwind: {
          path: '$datosCajero',
          preserveNullAndEmptyArrays: true
        }
      },
      { $sort: { totalCobrado: -1 } },
      {
        $project: {
          _id: 0,
          cajeroId: {
            $cond: [
              { $eq: [{ $ifNull: ['$_id', null] }, null] },
              null,
              { $toString: '$_id' }
            ]
          },
          nombreCajero: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$datosCajero.nombre', ''] },
                  ' ',
                  { $ifNull: ['$datosCajero.apellido', ''] }
                ]
              }
            }
          },
          totalCobrado: 1,
          cantidadOperaciones: 1,
          operacionesConPropina: 1,
          operacionesSinPropina: 1
        }
      }
    ])
  }

  /**
   * Base común para consultar los productos de pedidos pagados.
   * Excluye los detalles asociados a tandas canceladas.
   */
  private construirPipelineDetallesPagados(
    rango: RangoReportePagos
  ): PipelineStage[] {
    return [
      {
        $match: this.construirFiltroPagos(rango)
      },
      // Cada pedido se analiza una sola vez.
      { $group: { _id: '$pedido' } },
      {
        $lookup: {
          from: 'pedidos',
          localField: '_id',
          foreignField: '_id',
          as: 'pedidoDoc'
        }
      },
      { $unwind: '$pedidoDoc' },
      { $match: { 'pedidoDoc.estado': 'CERRADO' } },
      {
        $addFields: {
          _tandasCanceladasIds: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ['$pedidoDoc.tandas', []] },
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
      { $unwind: '$pedidoDoc.detalles' },
      {
        $match: {
          $expr: {
            $not: [
              {
                $in: [
                  {
                    $ifNull: [
                      '$pedidoDoc.detalles.tandaId',
                      null
                    ]
                  },
                  '$_tandasCanceladasIds'
                ]
              }
            ]
          }
        }
      }
    ]
  }

  /**
   * Productos y categorías vendidos en el período.
   * El importe vendido procede del subtotal histórico de cada detalle;
   * las propinas no se imputan artificialmente a productos.
   */
  async obtenerProductosYCategorias(
    rango: RangoReportePagos
  ): Promise<{
    productos: ProductoReporte[]
    categorias: CategoriaReporte[]
  }> {
    const base = this.construirPipelineDetallesPagados(rango)

    const productos = await Pago.aggregate<ProductoReporte>([
      ...base,
      {
        $group: {
          _id: '$pedidoDoc.detalles.plato',
          unidadesVendidas: {
            $sum: '$pedidoDoc.detalles.cantidad'
          },
          importeVendido: {
            $sum: {
              $ifNull: ['$pedidoDoc.detalles.subtotal', 0]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'platos',
          localField: '_id',
          foreignField: '_id',
          as: 'datosPlato'
        }
      },
      { $unwind: '$datosPlato' },
      {
        $lookup: {
          from: 'categorias',
          localField: 'datosPlato.categoria',
          foreignField: '_id',
          as: 'datosCategoria'
        }
      },
      {
        $project: {
          _id: 0,
          platoId: { $toString: '$_id' },
          nombre: '$datosPlato.nombre',
          categoria: {
            $ifNull: [
              { $arrayElemAt: ['$datosCategoria.nombre', 0] },
              'Sin categoría'
            ]
          },
          unidadesVendidas: 1,
          importeVendido: 1
        }
      },
      { $sort: { importeVendido: -1, nombre: 1 } }
    ])

    const categorias = await Pago.aggregate<CategoriaReporte>([
      ...base,
      {
        $lookup: {
          from: 'platos',
          localField: 'pedidoDoc.detalles.plato',
          foreignField: '_id',
          as: 'datosPlato'
        }
      },
      { $unwind: '$datosPlato' },
      {
        $lookup: {
          from: 'categorias',
          localField: 'datosPlato.categoria',
          foreignField: '_id',
          as: 'datosCategoria'
        }
      },
      { $unwind: '$datosCategoria' },
      {
        $group: {
          _id: '$datosCategoria._id',
          nombre: { $first: '$datosCategoria.nombre' },
          unidadesVendidas: {
            $sum: '$pedidoDoc.detalles.cantidad'
          },
          importeVendido: {
            $sum: {
              $ifNull: ['$pedidoDoc.detalles.subtotal', 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          categoriaId: { $toString: '$_id' },
          nombre: 1,
          unidadesVendidas: 1,
          importeVendido: 1
        }
      },
      { $sort: { importeVendido: -1, nombre: 1 } }
    ])

    return { productos, categorias }
  }
}

export const reportesRepository = new ReportesRepository()
