//src/repositories/cuentaMesa.repo.ts
import { Types, ClientSession } from 'mongoose'
import CuentaMesa, {
  ICuentaMesa,
  ESTADOS_CUENTA_MESA
} from '../models/CuentaMesa'

export { ICuentaMesa } from '../models/CuentaMesa'

export interface CuentaMesaCrearDatos {
  codigoCuenta: string
  mesa: string | Types.ObjectId
  pedidos: Array<string | Types.ObjectId>
  subtotal: number
  montoPropina?: number
  total: number
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  metodoPago?: string
  cajero?: string | Types.ObjectId
  creadoPor: string | Types.ObjectId
  pago?: string | Types.ObjectId
}

export interface CuentaMesaActualizarDatos {
  estado?: typeof ESTADOS_CUENTA_MESA[keyof typeof ESTADOS_CUENTA_MESA]
  montoPropina?: number
  total?: number
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  metodoPago?: string
  cajero?: string | Types.ObjectId | null
  pago?: string | Types.ObjectId | null
  fechaPago?: Date | null
}

export class CuentaMesaRepository {
  /**
   * Crea una cuenta dentro de una transacción opcional.
   */
  async crear(
    datos: CuentaMesaCrearDatos,
    session?: ClientSession
  ): Promise<ICuentaMesa> {
    const nuevaCuenta = new CuentaMesa(datos)

    return await nuevaCuenta.save(
      session ? { session } : undefined
    )
  }

  /**
   * Busca una cuenta por su ID.
   */
  async buscarPorId(
    id: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<ICuentaMesa | null> {
    return await CuentaMesa.findById(id)
      .session(session ?? null)
  }

  /**
   * Busca la cuenta pendiente de pago de una mesa.
   */
  async buscarPendientePorMesa(
    mesaId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<ICuentaMesa | null> {
    return await CuentaMesa.findOne({
      mesa: mesaId,
      estado: ESTADOS_CUENTA_MESA.PENDIENTE_PAGO
    }).session(session ?? null)
  }

  /**
   * Busca una cuenta mediante el token asociado a su QR.
   */
  async buscarPorTokenQR(
    token: string,
    session?: ClientSession
  ): Promise<ICuentaMesa | null> {
    return await CuentaMesa.findOne({
      qrToken: token
    }).session(session ?? null)
  }

  /**
   * Recupera la cuenta con sus pedidos y datos de mesa.
   */
    /**
   * Recupera una cuenta con relaciones pobladas,
   * opcionalmente dentro de una transacción.
   */
  async buscarPorIdPoblado(
    id: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<ICuentaMesa | null> {
    return await CuentaMesa.findById(id)
      .session(session ?? null)
      .populate('mesa', 'numero estado')
      .populate(
        'pedidos',
        'codigo estado total detalles usuario fechaHora recogido'
      )
      .populate('cajero', 'nombre apellido')
      .populate('creadoPor', 'nombre apellido')
      .populate('pago')
  }

  /**
   * Guarda los cambios de una cuenta existente.
   */
  async guardar(
    cuenta: ICuentaMesa,
    session?: ClientSession
  ): Promise<ICuentaMesa> {
    return await cuenta.save(
      session ? { session } : undefined
    )
  }

  /**
   * Actualiza una cuenta solo si sigue pendiente de pago.
   * Devuelve null si otro proceso ya cambió su estado.
   */
  async actualizarSiPendiente(
    id: string | Types.ObjectId,
    datos: CuentaMesaActualizarDatos,
    session?: ClientSession
  ): Promise<ICuentaMesa | null> {
    return await CuentaMesa.findOneAndUpdate(
      {
        _id: id,
        estado: ESTADOS_CUENTA_MESA.PENDIENTE_PAGO
      },
      {
        $set: datos
      },
      {
        new: true,
        session,
        runValidators: true
      }
    )
  }
    /**
   * Lista las cuentas pendientes de pago con sus comandas y mesa.
   */
  async listarPendientes(): Promise<ICuentaMesa[]> {
    return await CuentaMesa.find({
      estado: ESTADOS_CUENTA_MESA.PENDIENTE_PAGO
    })
      .sort({ fechaSolicitud: 1 })
      .populate('mesa', 'numero estado')
      .populate({
        path: 'pedidos',
        select: 'codigo estado total detalles usuario fechaHora recogido',
        populate: [
          {
            path: 'usuario',
            select: 'nombre apellido apellidos'
          },
          {
            path: 'detalles.plato',
            select: 'nombre precio'
          }
        ]
      })
      .populate('cajero', 'nombre apellido')
      .populate('creadoPor', 'nombre apellido')
      .populate('pago')
  }
}

export const cuentaMesaRepository =
  new CuentaMesaRepository()