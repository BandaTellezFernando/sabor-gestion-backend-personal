//src/services/cuentaMesa.service.ts
import mongoose, { Types } from 'mongoose'

import {
  CuentaMesaRepository,
  cuentaMesaRepository
} from '../repositories/cuentaMesa.repo'

import {
  PedidoRepository,
  pedidoRepository
} from '../repositories/pedido.repo'

import {
  MesaRepository,
  mesaRepository
} from '../repositories/mesa.repo'

import {
  ICuentaMesa
} from '../models/CuentaMesa'

import {
  ESTADOS_MESA,
  ESTADOS_PEDIDO
} from '../utils/constants'

import { randomBytes } from 'node:crypto'

export class CuentaMesaServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'CuentaMesaServiceError'
  }
}

export class CuentaMesaService {
  constructor(
    private cuentaRepo: CuentaMesaRepository = cuentaMesaRepository,
    private pedidoRepo: PedidoRepository = pedidoRepository,
    private mesaRepo: MesaRepository = mesaRepository
  ) {}

  /**
   * Consolida las comandas de una mesa en una cuenta pendiente.
   *
   * Solo admite pedidos entregados y recogidos.
   * La creación, asociación de comandas y actualización de mesa
   * se ejecutan en una única transacción.
   */
  async crearCuentaPorMesa(
    mesaId: string,
    usuarioId: string
  ): Promise<ICuentaMesa> {
    if (!Types.ObjectId.isValid(mesaId)) {
      throw new CuentaMesaServiceError(400, 'El ID de mesa no es válido.')
    }

    if (!Types.ObjectId.isValid(usuarioId)) {
      throw new CuentaMesaServiceError(
        401,
        'El usuario autenticado no es válido.'
      )
    }

    const session = await mongoose.startSession()
    let cuentaId: Types.ObjectId | null = null

    try {
      await session.withTransaction(async () => {
        // 1. Validar que exista la mesa.
        const mesa = await this.mesaRepo.buscarPorId(
          mesaId,
          session
        )

        if (!mesa) {
          throw new CuentaMesaServiceError(
            404,
            'No se encontró la mesa solicitada.'
          )
        }

        if (
          mesa.estado !== ESTADOS_MESA.OCUPADA &&
          mesa.estado !== ESTADOS_MESA.CUENTA_SOLICITADA
        ) {
          throw new CuentaMesaServiceError(
            409,
            'La mesa no está ocupada ni tiene una cuenta pendiente de solicitud.'
          )
        }

        // 2. Si ya existe una cuenta pendiente, devolverla.
        // Esto permite repetir la petición sin crear otra cuenta.
        const cuentaExistente =
          await this.cuentaRepo.buscarPendientePorMesa(
            mesaId,
            session
          )

        if (cuentaExistente) {
          cuentaId = cuentaExistente._id as Types.ObjectId
          return
        }

        // 3. Obtener todas las comandas no cerradas ni canceladas.
        const pedidos =
          await this.pedidoRepo.buscarPedidosActivosPorMesaParaCuenta(
            mesaId,
            session
          )

        if (pedidos.length === 0) {
          throw new CuentaMesaServiceError(
            409,
            'La mesa no tiene comandas pendientes de cobro.'
          )
        }

        // 4. Todos los pedidos deben estar entregados y recogidos.
        const pedidosNoListos = pedidos.filter(
  (pedido) =>
    (
      pedido.estado !== ESTADOS_PEDIDO.LISTO &&
      pedido.estado !== ESTADOS_PEDIDO.ENTREGADO
    ) ||
    pedido.recogido !== true
)

        if (pedidosNoListos.length > 0) {
          const codigos = pedidosNoListos
            .map((pedido) => pedido.codigo)
            .filter(Boolean)
            .join(', ')

          throw new CuentaMesaServiceError(
            409,
            `No se puede solicitar la cuenta. Hay comandas pendientes de entrega o recogida: ${codigos}.`
          )
        }

        // 5. Ninguna comanda puede pertenecer a otra cuenta.
        const pedidosAsignados = pedidos.filter(
          (pedido) => pedido.cuentaMesa
        )

        if (pedidosAsignados.length > 0) {
          throw new CuentaMesaServiceError(
            409,
            'Una o más comandas ya pertenecen a otra cuenta. Actualiza la información e inténtalo nuevamente.'
          )
        }

        // 6. Calcular importes usando los detalles persistidos.
        // Nunca confiamos en importes enviados por el frontend.
        let subtotal = 0
        let montoPropina = 0

        for (const pedido of pedidos) {
          if (!Array.isArray(pedido.detalles) || pedido.detalles.length === 0) {
            throw new CuentaMesaServiceError(
              409,
              `La comanda ${pedido.codigo} no contiene detalles para calcular la cuenta.`
            )
          }

          const subtotalPedido = pedido.detalles.reduce(
            (acumulado, detalle) => {
              const importe =
                detalle.subtotal !== undefined &&
                detalle.subtotal !== null
                  ? Number(detalle.subtotal)
                  : Number(detalle.precioUnitario) *
                    Number(detalle.cantidad)

              if (!Number.isFinite(importe) || importe < 0) {
                throw new CuentaMesaServiceError(
                  409,
                  `La comanda ${pedido.codigo} contiene un importe inválido.`
                )
              }

              return acumulado + importe
            },
            0
          )

                    const propinaPedido = Number(
            pedido.montoPropina ?? 0
          )

          if (
            !Number.isFinite(propinaPedido) ||
            propinaPedido < 0
          ) {
            throw new CuentaMesaServiceError(
              409,
              `La comanda ${pedido.codigo} tiene un importe de propina inválido.`
            )
          }

          subtotal += subtotalPedido
          montoPropina += propinaPedido
        }

               subtotal = Number(subtotal.toFixed(2))
        montoPropina = Number(montoPropina.toFixed(2))

        const total = Number(
          (subtotal + montoPropina).toFixed(2)
        )

        // 7. Crear una cuenta con un código único.
        const nuevaCuenta = await this.cuentaRepo.crear(
          {
            codigoCuenta: `CTA-${randomBytes(5)
              .toString('hex')
              .toUpperCase()}`,

            mesa: new Types.ObjectId(mesaId),

            pedidos: pedidos.map(
              (pedido) => pedido._id as Types.ObjectId
            ),

            subtotal,
            montoPropina,
            total,

            creadoPor: new Types.ObjectId(usuarioId)
          },
          session
        )

        // 8. Asociar todas las comandas a la cuenta.
        const pedidosAsignadosCount =
          await this.pedidoRepo.asignarCuentaMesa(
            pedidos.map(
              (pedido) => pedido._id as Types.ObjectId
            ),
            nuevaCuenta._id as Types.ObjectId,
            session
          )

        if (pedidosAsignadosCount !== pedidos.length) {
          throw new CuentaMesaServiceError(
            409,
            'No fue posible asociar todas las comandas a la cuenta. Se cancelaron los cambios.'
          )
        }

        // 9. Cambiar la mesa a Cuenta Solicitada.
        const mesaActualizada =
          await this.mesaRepo.marcarCuentaSolicitadaSiOcupada(
            mesaId,
            session
          )

        if (!mesaActualizada) {
          throw new CuentaMesaServiceError(
            409,
            'La mesa cambió de estado durante la operación. No se creó la cuenta.'
          )
        }

        cuentaId = nuevaCuenta._id as Types.ObjectId
      })

      if (!cuentaId) {
        throw new CuentaMesaServiceError(
          500,
          'No se pudo recuperar la cuenta creada.'
        )
      }

      // 10. Devolver la cuenta con la mesa y las comandas pobladas.
      const cuenta = await this.cuentaRepo.buscarPorIdPoblado(
        cuentaId
      )

      if (!cuenta) {
        throw new CuentaMesaServiceError(
          500,
          'La cuenta se creó, pero no se pudo recuperar su información.'
        )
      }

      return cuenta
    } catch (error: unknown) {
      if (error instanceof CuentaMesaServiceError) {
        throw error
      }

      // Una colisión de índice único puede ocurrir con peticiones simultáneas.
      const codigoError =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? (error as { code?: number }).code
          : undefined

      if (codigoError === 11000) {
        throw new CuentaMesaServiceError(
          409,
          'Ya existe una cuenta pendiente para esta mesa. Actualiza la información.'
        )
      }

      throw error
    } finally {
      await session.endSession()
    }
  }

  /**
   * Consulta una cuenta por ID.
   */
  async obtenerCuentaPorId(
    cuentaId: string
  ): Promise<ICuentaMesa> {
    if (!Types.ObjectId.isValid(cuentaId)) {
      throw new CuentaMesaServiceError(
        400,
        'El ID de cuenta no es válido.'
      )
    }

    const cuenta = await this.cuentaRepo.buscarPorIdPoblado(
      cuentaId
    )

    if (!cuenta) {
      throw new CuentaMesaServiceError(
        404,
        'No se encontró la cuenta solicitada.'
      )
    }

    return cuenta
  }

    /**
   * Recupera las cuentas que todavía esperan el pago.
   */
  async listarCuentasPendientes(): Promise<ICuentaMesa[]> {
    return await this.cuentaRepo.listarPendientes()
  }
}

export const cuentaMesaService = new CuentaMesaService()