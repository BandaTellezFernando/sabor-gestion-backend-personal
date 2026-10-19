// src/repositories/pedido.repo.ts
import { Types, ClientSession, type QueryFilter } from 'mongoose'
import Pedido, { IDetallePedido, IPedido, ITandaCocina } from '../models/Pedido'
import type {
  DetallePedidoPago,
  MesaPagoResumen,
  PedidoPagoConRelaciones,
  UsuarioPagoResumen
} from '../types/pago.types'
import {
  ESTADOS_CUENTA,
  ESTADOS_PEDIDO,
  ESTADOS_TANDA_COCINA,
  EstadoTandaCocina,
  EstadoCuenta
} from '../utils/constants'

export { IPedido } from '../models/Pedido'

export interface PedidoCrearDatos {
  _id?: Types.ObjectId
  codigo: string
  fechaDiaBolivia: string
  fechaHoraBolivia?: string
  fechaHora: Date
  estado?: string
  estadoCuenta?: EstadoCuenta
  tandas?: ITandaCocina[]
  total: number
  subtotalCierre?: number
  montoPropina?: number
  mesa?: string | Types.ObjectId
  usuario: string | Types.ObjectId
  detalles: IDetallePedido[]
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  cajeroAsignado?: string | Types.ObjectId
  recogido?: boolean
  fechaRecogida?: Date
  recogidoPor?: string | Types.ObjectId
}

export interface PedidoActualizarDatos {
  detalles?: IDetallePedido[]
  estado?: string
  total?: number
  subtotalCierre?: number
  montoPropina?: number
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  cajeroAsignado?: string | Types.ObjectId
  recogido?: boolean
  fechaRecogida?: Date | null
  recogidoPor?: Types.ObjectId | null
}

export class PedidoRepository {
  /**
   * Crea y persiste un nuevo pedido en MongoDB
   */
  async crear(datos: PedidoCrearDatos, session?: ClientSession): Promise<IPedido> {
    const nuevoPedido = new Pedido(datos)
    return await nuevoPedido.save(session ? { session } : undefined)
  }

  /**
   * Busca un pedido por ID simple (sin populates)
   */
  async buscarPorId(
    id: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<IPedido | null> {
    return await Pedido.findById(id).session(session ?? null)
  }

  /**
   * Busca un pedido por ID con populate completo para cocina y meseros
   */
  async buscarPorIdPoblado(id: string | Types.ObjectId): Promise<IPedido | null> {
    return await Pedido.findById(id)
      .populate('detalles.plato', 'nombre precio')
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('recogidoPor', 'nombre apellido apellidos')
  }

  async buscarPorIdPobladoRecibo(
    id: string | Types.ObjectId
  ): Promise<PedidoPagoConRelaciones | null> {
    return await Pedido.findById(id)
      .populate<{ detalles: DetallePedidoPago[] }>(
        'detalles.plato',
        'nombre precio'
      )
      .populate<{ mesa: MesaPagoResumen | null }>('mesa', 'numero estado')
      .populate<{ usuario: UsuarioPagoResumen }>(
        'usuario',
        'nombre apellido apellidos'
      )
      .populate<{ recogidoPor: UsuarioPagoResumen | null }>(
        'recogidoPor',
        'nombre apellido apellidos'
      )
  }

  /**
   * Busca un pedido por ID con populate completo para la vista de caja
   */
  async buscarPorIdPobladoCaja(
    id: string | Types.ObjectId
  ): Promise<PedidoPagoConRelaciones | null> {
    return await Pedido.findById(id)
      .populate<{ mesa: MesaPagoResumen | null }>('mesa', 'numero estado')
      .populate<{ usuario: UsuarioPagoResumen }>(
        'usuario',
        'nombre apellido apellidos'
      )
      .populate<{ recogidoPor: UsuarioPagoResumen | null }>(
        'recogidoPor',
        'nombre apellido apellidos'
      )
      .populate<{ detalles: DetallePedidoPago[] }>(
        'detalles.plato',
        'nombre precio'
      )
  }

  /**
   * Busca un pedido por ID con populate completo general
   */
  async buscarPorIdCompleto(id: string | Types.ObjectId): Promise<IPedido | null> {
    return await Pedido.findById(id)
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('recogidoPor', 'nombre apellido apellidos')
      .populate('cajeroAsignado', 'nombre apellido')
      .populate('detalles.plato', 'nombre precio')
  }

  /**
   * Cuenta los pedidos activos vinculados a una mesa
   */
  async contarPedidosActivosPorMesa(mesaId: string | Types.ObjectId): Promise<number> {
    return await Pedido.countDocuments({
      mesa: mesaId,
      estado: {
        $in: [
          ESTADOS_PEDIDO.ABIERTO,
          ESTADOS_PEDIDO.EN_PREPARACION,
          ESTADOS_PEDIDO.ENTREGADO
        ]
      }
    })
  }

  /**
   * Busca pedidos aplicando filtros dinámicos con populates profundos (incluyendo categoría del plato)
   */
  async buscarConFiltros(filtro: QueryFilter<IPedido>): Promise<IPedido[]> {
    return await Pedido.find(filtro)
      .populate('mesa', 'numero estado')
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
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('recogidoPor', 'nombre apellido apellidos')
      .populate('detalles.plato', 'nombre precio')
  }

  /**
   * Cambia una tanda de BORRADOR a PENDIENTE de forma condicional.
   * Se ejecuta dentro de la misma transacción que el descuento de inventario.
   */
  /**
   * Cancela una tanda si sigue en el estado esperado.
   * Opcionalmente cancela también la cuenta cuando ya no quedan tandas
   * utilizables. Se ejecuta dentro de la transacción de inventario.
   */
  async cancelarTanda(
    pedidoId: string | Types.ObjectId,
    tandaId: Types.ObjectId,
    estadoActual: EstadoTandaCocina,
    usuarioId: Types.ObjectId,
    fecha: Date,
    motivo: string,
    subtotalCierre: number,
    total: number,
    cancelarCuenta: boolean,
    session: ClientSession
  ): Promise<IPedido | null> {
    const cambios: Record<string, unknown> = {
      'tandas.$.estado': ESTADOS_TANDA_COCINA.CANCELADA,
      'tandas.$.canceladaPor': usuarioId,
      'tandas.$.fechaCancelacion': fecha,
      'tandas.$.motivoCancelacion': motivo,
      subtotalCierre,
      total
    }

    if (cancelarCuenta) {
      cambios.estadoCuenta = ESTADOS_CUENTA.CANCELADA
      cambios.estado = ESTADOS_PEDIDO.CANCELADO
    }

    return await Pedido.findOneAndUpdate(
      {
        _id: pedidoId,
        estadoCuenta: ESTADOS_CUENTA.ABIERTA,
        estado: {
          $nin: [ESTADOS_PEDIDO.CERRADO, ESTADOS_PEDIDO.CANCELADO]
        },
        tandas: {
          $elemMatch: {
            _id: tandaId,
            estado: estadoActual
          }
        }
      },
      { $set: cambios },
      {
        returnDocument: 'after',
        session,
        runValidators: true
      }
    )
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('detalles.plato', 'nombre precio')
  }

  async marcarTandaEnviada(
    pedidoId: string | Types.ObjectId,
    tandaId: Types.ObjectId,
    usuarioId: Types.ObjectId,
    fechaEnvio: Date,
    session: ClientSession
  ): Promise<IPedido | null> {
    return await Pedido.findOneAndUpdate(
      {
        _id: pedidoId,
        estadoCuenta: ESTADOS_CUENTA.ABIERTA,
        estado: {
          $nin: [ESTADOS_PEDIDO.CERRADO, ESTADOS_PEDIDO.CANCELADO]
        },
        tandas: {
          $elemMatch: {
            _id: tandaId,
            estado: ESTADOS_TANDA_COCINA.BORRADOR
          }
        }
      },
      {
        $set: {
          'tandas.$.estado': ESTADOS_TANDA_COCINA.PENDIENTE,
          'tandas.$.enviadaPor': usuarioId,
          'tandas.$.fechaEnvio': fechaEnvio
        }
      },
      {
        returnDocument: 'after',
        session,
        runValidators: true
      }
    )
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('detalles.plato', 'nombre precio')
  }

  /**
   * Transiciona únicamente la tanda cuyo estado coincide con el esperado.
   * Una actualización concurrente no puede avanzar dos veces la misma transición.
   */
  async transicionarTandaEstado(
    pedidoId: string | Types.ObjectId,
    tandaId: Types.ObjectId,
    estadoActual: EstadoTandaCocina,
    estadoNuevo: EstadoTandaCocina,
    usuarioId: Types.ObjectId,
    fecha: Date
  ): Promise<IPedido | null> {
    const campos: Record<string, unknown> = {
      'tandas.$.estado': estadoNuevo
    }

    if (estadoNuevo === ESTADOS_TANDA_COCINA.EN_PREPARACION) {
      campos['tandas.$.iniciadaPor'] = usuarioId
      campos['tandas.$.fechaInicio'] = fecha
    } else if (estadoNuevo === ESTADOS_TANDA_COCINA.LISTA) {
      campos['tandas.$.listaPor'] = usuarioId
      campos['tandas.$.fechaLista'] = fecha
    } else if (estadoNuevo === ESTADOS_TANDA_COCINA.ENTREGADA) {
      campos['tandas.$.recogidaPor'] = usuarioId
      campos['tandas.$.fechaRecogida'] = fecha
    }

    return await Pedido.findOneAndUpdate(
      {
        _id: pedidoId,
        estadoCuenta: ESTADOS_CUENTA.ABIERTA,
        estado: {
          $nin: [ESTADOS_PEDIDO.CERRADO, ESTADOS_PEDIDO.CANCELADO]
        },
        tandas: {
          $elemMatch: {
            _id: tandaId,
            estado: estadoActual
          }
        }
      },
      { $set: campos },
      { returnDocument: 'after', runValidators: true }
    )
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('detalles.plato', 'nombre precio')
  }

  /**
   * Añade una tanda en borrador y sus detalles en una única operación atómica.
   * updatedAt evita sobrescribir cambios realizados por otra solicitud concurrente.
   */
  async agregarTandaBorrador(
    id: string | Types.ObjectId,
    updatedAtEsperado: Date,
    tanda: ITandaCocina,
    detalles: IDetallePedido[],
    subtotalCierre: number,
    total: number
  ): Promise<IPedido | null> {
    return await Pedido.findOneAndUpdate(
      {
        _id: id,
        updatedAt: updatedAtEsperado,
        estadoCuenta: ESTADOS_CUENTA.ABIERTA,
        estado: {
          $nin: [ESTADOS_PEDIDO.CERRADO, ESTADOS_PEDIDO.CANCELADO]
        }
      },
      {
        $push: {
          tandas: tanda,
          detalles: { $each: detalles }
        },
        $set: {
          subtotalCierre,
          total
        }
      },
      {
        returnDocument: 'after',
        runValidators: true
      }
    )
  }

  /**
   * Actualiza campos arbitrarios de un pedido y retorna el documento actualizado poblado
   */
  async actualizar(
    id: string | Types.ObjectId,
    updates: PedidoActualizarDatos,
    session?: ClientSession
  ): Promise<IPedido | null> {
    return await Pedido.findByIdAndUpdate(
      id,
      { $set: updates },
      { returnDocument: 'after', session }
    )
      .populate('detalles.plato', 'nombre precio')
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
  }

  /**
   * Solicita la cuenta solo cuando todas las tandas están entregadas o canceladas.
   * La condición se comprueba también al realizar la escritura.
   */
  async marcarCuentaSolicitadaPorTandas(
    id: string | Types.ObjectId,
    session: ClientSession
  ): Promise<IPedido | null> {
    return await Pedido.findOneAndUpdate(
      {
        _id: id,
        estadoCuenta: ESTADOS_CUENTA.ABIERTA,
        estado: {
          $nin: [ESTADOS_PEDIDO.CERRADO, ESTADOS_PEDIDO.CANCELADO]
        },
        'tandas.0': { $exists: true },
        $nor: [
          {
            tandas: {
              $elemMatch: {
                estado: {
                  $nin: [
                    ESTADOS_TANDA_COCINA.ENTREGADA,
                    ESTADOS_TANDA_COCINA.CANCELADA
                  ]
                }
              }
            }
          }
        ]
      },
      {
        $set: {
          estadoCuenta: ESTADOS_CUENTA.CUENTA_SOLICITADA
        }
      },
      {
        returnDocument: 'after',
        session,
        runValidators: true
      }
    )
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('detalles.plato', 'nombre precio')
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
      .populate('mesa', 'numero estado')
      .populate('detalles.plato', 'nombre precio')
      .populate('usuario', 'nombre apellido')
  }

  /**
   * Guarda las modificaciones de una instancia de pedido ya existente
   */
  async guardar<
    TPedido extends IPedido | PedidoPagoConRelaciones
  >(pedidoDoc: TPedido, session?: ClientSession): Promise<TPedido> {
    await pedidoDoc.save(session ? { session } : undefined)
    return pedidoDoc
  }

  /**
   * Busca pedidos pendientes de cobro para mesas en estado 'Cuenta Solicitada'
   */
  async buscarPendientesCobro(
    mesaIds: (string | Types.ObjectId)[],
    cajero?: string
  ): Promise<IPedido[]> {
    const filtroPedidos: QueryFilter<IPedido> = {
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

