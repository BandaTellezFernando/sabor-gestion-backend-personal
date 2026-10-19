import mongoose, { Types } from 'mongoose'
import CierreCaja from '../models/CierreCaja'
import CierreCajaLock from '../models/CierreCajaLock'
import { pagoRepository } from '../repositories/pago.repo'
import { usuarioRepository } from '../repositories/usuarios.repo'
import {
  obtenerRangoInclusivoBolivia,
  obtenerFechaISO_Bolivia,
  formatearFechaBolivia
} from '../utils/fechaBolivia'

export class CierreCajaServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'CierreCajaServiceError'
  }
}

export interface CerrarCajaDTO {
  periodoDesde: string
  periodoHasta: string
  efectivoContado: number
  cajeroId?: string
}

export interface ContextoCierreCaja {
  id: string
  rol: string
}

const redondearDinero = (valor: number): number =>
  Math.round((valor + Number.EPSILON) * 100) / 100

export class CierreCajaService {
  async listarCierres(
    usuarioAuth: ContextoCierreCaja,
    filtros: { desde?: string; hasta?: string; cajeroId?: string } = {}
  ): Promise<any[]> {
    if (!usuarioAuth?.id || !Types.ObjectId.isValid(usuarioAuth.id)) {
      throw new CierreCajaServiceError(401, 'Usuario no autenticado.')
    }

    const rol = String(usuarioAuth.rol || '').toLowerCase()
    const esCajero = rol === 'cajero'
    const esAdmin = rol === 'administrador' || rol === 'superadmin'

    if (!esCajero && !esAdmin) {
      throw new CierreCajaServiceError(
        403,
        'No tienes permiso para consultar cierres de caja.'
      )
    }

    const filtro: Record<string, any> = {}

    if (esCajero) {
      if (filtros.cajeroId && filtros.cajeroId !== usuarioAuth.id) {
        throw new CierreCajaServiceError(
          403,
          'Un cajero solo puede consultar sus propios cierres.'
        )
      }
      filtro.cajeroId = usuarioAuth.id
    } else if (filtros.cajeroId) {
      if (!Types.ObjectId.isValid(filtros.cajeroId)) {
        throw new CierreCajaServiceError(400, 'El identificador del cajero no es válido.')
      }
      filtro.cajeroId = filtros.cajeroId
    }

    const desde = filtros.desde
    const hasta = filtros.hasta

    if (desde || hasta) {
      try {
        obtenerRangoInclusivoBolivia(desde || hasta!, hasta || desde!)
      } catch (error) {
        throw new CierreCajaServiceError(
          400,
          error instanceof Error ? error.message : 'El filtro de fechas no es válido.'
        )
      }

      // Un cierre aparece si su período se cruza con el período consultado.
      if (desde && hasta) {
        filtro.periodoDesde = { $lte: hasta }
        filtro.periodoHasta = { $gte: desde }
      } else if (desde) {
        filtro.periodoHasta = { $gte: desde }
      } else if (hasta) {
        filtro.periodoDesde = { $lte: hasta }
      }
    }

    return await CierreCaja.find(filtro)
      .sort({ fechaCierre: -1 })
      .lean()
  }

  async cerrarCaja(
    dto: CerrarCajaDTO,
    usuarioAuth: ContextoCierreCaja
  ): Promise<any> {
    if (!usuarioAuth?.id || !Types.ObjectId.isValid(usuarioAuth.id)) {
      throw new CierreCajaServiceError(401, 'Usuario no autenticado.')
    }

    const rol = String(usuarioAuth.rol || '').toLowerCase()
    const esCajero = rol === 'cajero'
    const esAdmin = rol === 'administrador' || rol === 'superadmin'

    if (!esCajero && !esAdmin) {
      throw new CierreCajaServiceError(
        403,
        'No tienes permiso para cerrar una caja.'
      )
    }

    let cajeroId: string

    if (esCajero) {
      if (dto.cajeroId && dto.cajeroId !== usuarioAuth.id) {
        throw new CierreCajaServiceError(
          403,
          'Un cajero solo puede cerrar su propia caja.'
        )
      }
      cajeroId = usuarioAuth.id
    } else {
      cajeroId = String(dto.cajeroId || '')
      if (!Types.ObjectId.isValid(cajeroId)) {
        throw new CierreCajaServiceError(
          400,
          'El administrador debe indicar un cajero válido.'
        )
      }
    }

    if (
      typeof dto.efectivoContado !== 'number' ||
      !Number.isFinite(dto.efectivoContado) ||
      dto.efectivoContado < 0
    ) {
      throw new CierreCajaServiceError(
        400,
        'El efectivo contado debe ser un número válido y no negativo.'
      )
    }

    let rango: { desde: Date; hastaExclusivo: Date }

    try {
      rango = obtenerRangoInclusivoBolivia(
        dto.periodoDesde,
        dto.periodoHasta
      )
    } catch (error) {
      throw new CierreCajaServiceError(
        400,
        error instanceof Error ? error.message : 'El período no es válido.'
      )
    }

    if (dto.periodoHasta > obtenerFechaISO_Bolivia(new Date())) {
      throw new CierreCajaServiceError(
        400,
        'No se puede cerrar un período que todavía no ha terminado.'
      )
    }

    const cajero = await usuarioRepository.buscarPorId(cajeroId)

    if (!cajero) {
      throw new CierreCajaServiceError(404, 'Cajero no encontrado.')
    }

    if (String(cajero.rol || '').toLowerCase() !== 'cajero') {
      throw new CierreCajaServiceError(
        400,
        'El usuario seleccionado no tiene el rol Cajero.'
      )
    }

    // Garantiza que exista un documento de bloqueo por cajero.
    await CierreCajaLock.init()

    try {
      await CierreCajaLock.updateOne(
        { cajeroId },
        { $setOnInsert: { cajeroId, revision: 0 } },
        { upsert: true }
      )
    } catch (error) {
      const errorMongo = error as { code?: number }
      if (errorMongo.code !== 11000) throw error

      const bloqueoExiste = await CierreCajaLock.exists({ cajeroId })
      if (!bloqueoExiste) throw error
    }

    const session = await mongoose.startSession()

    try {
      session.startTransaction()

      // La escritura obliga a los cierres simultáneos del cajero
      // a competir por el mismo documento dentro de la transacción.
      const bloqueo = await CierreCajaLock.updateOne(
        { cajeroId },
        { $inc: { revision: 1 } },
        { session }
      )

      if (bloqueo.matchedCount !== 1) {
        throw new CierreCajaServiceError(
          409,
          'No se pudo bloquear la caja del cajero. Vuelve a intentarlo.'
        )
      }

      // Repetimos la comprobación dentro de la transacción:
      // la consulta inicial, por sí sola, no evita carreras concurrentes.
      const cierreSuperpuesto = await CierreCaja.findOne({
        cajeroId,
        periodoDesde: { $lte: dto.periodoHasta },
        periodoHasta: { $gte: dto.periodoDesde }
      }).session(session).lean()

      if (cierreSuperpuesto) {
        throw new CierreCajaServiceError(
          409,
          'Ya existe un cierre que se superpone con el período seleccionado.'
        )
      }

      const resumen = await pagoRepository.resumirPagosParaCierreCaja(
        cajeroId,
        rango.desde,
        rango.hastaExclusivo,
        session
      )

      let efectivo = 0
      let tarjeta = 0
      let qr = 0
      let propinas = 0
      let pagosProcesados = 0
      let totalRecaudado = 0

      for (const fila of resumen) {
        const total = Number(fila.totalRecaudado)
        const propina = Number(fila.propinas)
        const cantidad = Number(fila.cantidad)

        if (
          !Number.isFinite(total) ||
          !Number.isFinite(propina) ||
          !Number.isFinite(cantidad)
        ) {
          throw new CierreCajaServiceError(
            500,
            'Se encontró información financiera inválida en los pagos.'
          )
        }

        totalRecaudado += total
        propinas += propina
        pagosProcesados += cantidad

        switch (String(fila.metodoPago || '').trim().toLowerCase()) {
          case 'efectivo':
            efectivo += total
            break
          case 'tarjeta':
            tarjeta += total
            break
          case 'qr':
            qr += total
            break
          default:
            throw new CierreCajaServiceError(
              409,
              `Método de pago no reconocido al cerrar caja: ${fila.metodoPago || 'sin método'}.`
            )
        }
      }

      efectivo = redondearDinero(efectivo)
      tarjeta = redondearDinero(tarjeta)
      qr = redondearDinero(qr)
      propinas = redondearDinero(propinas)
      totalRecaudado = redondearDinero(totalRecaudado)

      const efectivoContado = redondearDinero(dto.efectivoContado)
      const diferenciaEfectivo = redondearDinero(
        efectivoContado - efectivo
      )
      const fechaCierre = new Date()

      const cierreCreado = new CierreCaja({
        cajeroId,
        cajeroNombre: `${cajero.nombre || ''} ${cajero.apellido || ''}`.trim(),
        totalDia: totalRecaudado,
        efectivo,
        tarjeta,
        qr,
        propinas,
        pagosProcesados,
        periodoDesde: dto.periodoDesde,
        periodoHasta: dto.periodoHasta,
        totalRecaudado,
        efectivoEsperado: efectivo,
        efectivoContado,
        diferenciaEfectivo,
        fechaCierreBolivia: formatearFechaBolivia(fechaCierre),
        fechaCierre
      })

      await cierreCreado.save({ session })
      await session.commitTransaction()

      return cierreCreado
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction()
      }

      if (error instanceof CierreCajaServiceError) {
        throw error
      }

      const errorMongo = error as {
        code?: number
        hasErrorLabel?: (label: string) => boolean
      }

      const conflictoConcurrencia =
        errorMongo.code === 11000 ||
        errorMongo.code === 112 ||
        errorMongo.code === 251 ||
        (typeof errorMongo.hasErrorLabel === 'function' &&
          errorMongo.hasErrorLabel('TransientTransactionError'))

      if (conflictoConcurrencia) {
        throw new CierreCajaServiceError(
          409,
          'Hay otro cierre de caja en curso para este cajero. Revisa los cierres y vuelve a intentarlo.'
        )
      }

      throw error
    } finally {
      await session.endSession()
    }
  }
}

export const cierreCajaService = new CierreCajaService()
