// src/repositories/pedido.repo.ts
import { Types, ClientSession } from 'mongoose'
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
  async crear(datos: PedidoCrearDatos, session?: any): Promise<IPedido> {
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
   * Recupera los detalles y el mesero de un pedido para el comprobante.
   * Participa en la transacción del pago.
   */
  async buscarPorIdPobladoParaComprobante(
    id: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<IPedido | null> {
    return await Pedido.findById(id)
      .session(session ?? null)
      .populate('detalles.plato', 'nombre precio')
      .populate('usuario', 'nombre apellido apellidos')
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
  async contarPedidosActivosPorMesa(
  mesaId: string | Types.ObjectId,
  session?: ClientSession
): Promise<number> {
  const consulta = Pedido.countDocuments({
    mesa: mesaId,
    estado: {
      $in: [
        ESTADOS_PEDIDO.BORRADOR,
        ESTADOS_PEDIDO.PENDIENTE,
        ESTADOS_PEDIDO.ABIERTO,
        ESTADOS_PEDIDO.EN_PREPARACION,
        ESTADOS_PEDIDO.LISTO,
        ESTADOS_PEDIDO.ENTREGADO
      ]
    }
  })

  if (session) {
    consulta.session(session)
  }

  return await consulta
}

  /**
   * Busca pedidos aplicando filtros dinámicos con populates profundos (incluyendo categoría del plato)
   */
  async buscarConFiltros(filtro: Record<string, any>): Promise<IPedido[]> {
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
      .populate('mesa', 'numero estado')
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
      .populate('mesa', 'numero estado')
      .populate('detalles.plato', 'nombre precio')
      .populate('usuario', 'nombre apellido')
  }

  /**
 * Cambia un pedido de BORRADOR a PENDIENTE únicamente si
 * todavía permanece en BORRADOR dentro de la transacción.
 */
async marcarPendienteSiBorrador(
  id: string | Types.ObjectId,
  session: ClientSession
): Promise<IPedido | null> {
  return await Pedido.findOneAndUpdate(
    {
      _id: id,
      estado: ESTADOS_PEDIDO.BORRADOR
    },
    {
      $set: {
        estado: ESTADOS_PEDIDO.PENDIENTE
      }
    },
    {
      returnDocument: 'after',
      session,
      runValidators: true
    }
  )
}

async marcarCanceladoSiCancelable(
  id: string | Types.ObjectId,
  session: ClientSession
): Promise<IPedido | null> {
  return await Pedido.findOneAndUpdate(
    {
      _id: id,
      estado: {
        $in: [
          ESTADOS_PEDIDO.BORRADOR,
          ESTADOS_PEDIDO.PENDIENTE,
          ESTADOS_PEDIDO.ABIERTO
        ]
      }
    },
    {
      $set: {
        estado: ESTADOS_PEDIDO.CANCELADO
      }
    },
    {
      returnDocument: 'after',
      session,
      runValidators: true
    }
  )
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
  ESTADOS_PEDIDO.BORRADOR,
  ESTADOS_PEDIDO.PENDIENTE,
  ESTADOS_PEDIDO.ABIERTO,
  ESTADOS_PEDIDO.EN_PREPARACION,
  ESTADOS_PEDIDO.LISTO,
  ESTADOS_PEDIDO.ENTREGADO
]
      }
    }).session(session || null)
  }
    /**
   * Obtiene todas las comandas no cerradas ni canceladas de una mesa.
   * Incluye borradores para que el servicio pueda detectar si existe
   * una comanda que impida consolidar la cuenta.
   */
  async buscarPedidosActivosPorMesaParaCuenta(
    mesaId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<IPedido[]> {
    return await Pedido.find({
      mesa: mesaId,
      estado: {
        $nin: [
          ESTADOS_PEDIDO.CERRADO,
          ESTADOS_PEDIDO.CANCELADO
        ]
      }
    })
      .session(session ?? null)
      .sort({ createdAt: 1 })
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('detalles.plato', 'nombre precio')
  }

  /**
   * Obtiene las comandas vinculadas a una cuenta específica.
   */
  async buscarPedidosPorCuentaMesa(
    cuentaMesaId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<IPedido[]> {
    return await Pedido.find({
      cuentaMesa: cuentaMesaId
    })
      .session(session ?? null)
      .sort({ createdAt: 1 })
      .populate('mesa', 'numero estado')
      .populate('usuario', 'nombre apellido apellidos')
      .populate('detalles.plato', 'nombre precio')
  }
  /**
   * Asocia únicamente comandas entregadas y recogidas
   * que todavía no pertenezcan a otra cuenta.
   */
  async asignarCuentaMesa(
    pedidoIds: Array<string | Types.ObjectId>,
    cuentaMesaId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<number> {
    if (pedidoIds.length === 0) return 0

    const resultado = await Pedido.updateMany(
      {
  _id: { $in: pedidoIds },
  cuentaMesa: null,
  estado: {
    $in: [
      ESTADOS_PEDIDO.LISTO,
      ESTADOS_PEDIDO.ENTREGADO
    ]
  },
  recogido: true
},
      {
        $set: { cuentaMesa: cuentaMesaId }
      },
      {
        session,
        runValidators: true
      }
    )

    return resultado.modifiedCount
  }

    /**
   * Cierra únicamente las comandas entregadas y recogidas
   * asociadas a la cuenta, dentro de la transacción del pago.
   */
  async cerrarPedidosDeCuentaMesa(
    cuentaMesaId: string | Types.ObjectId,
    session: ClientSession
  ): Promise<number> {
    const resultado = await Pedido.updateMany(
      {
  cuentaMesa: cuentaMesaId,
  estado: {
    $in: [
      ESTADOS_PEDIDO.LISTO,
      ESTADOS_PEDIDO.ENTREGADO
    ]
  },
  recogido: true
},
      {
        $set: {
          estado: ESTADOS_PEDIDO.CERRADO
        }
      },
      {
        session,
        runValidators: true
      }
    )

    return resultado.modifiedCount
  }
}

export const pedidoRepository = new PedidoRepository()

