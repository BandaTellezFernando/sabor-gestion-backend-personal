// src/services/mesaFusion.service.ts
import mongoose, { ClientSession, Types } from 'mongoose'

import {
  MesaRepository,
  mesaRepository,
  MesaPobladaDoc
} from '../repositories/mesa.repo'

import {
  MesaOcupacionRepository,
  mesaOcupacionRepository
} from '../repositories/mesaOcupacion.repo'

import type { MesaOrigenFusion } from '../models/Mesa'
import Pedido from '../models/Pedido'
import CuentaMesa, {
  ESTADOS_CUENTA_MESA
} from '../models/CuentaMesa'

import {
  ESTADOS_MESA,
  ESTADOS_PEDIDO,
  ESTADOS_FUSION_MESA,
  type EstadoFusionMesa
} from '../utils/constants'

export interface UnirMesasDTO {
  mesaIds: string[]
}

export type AccionFusionMesa =
  | 'fusionada'
  | 'ampliada'
  | 'cancelada'
  | 'disuelta'

export interface ResultadoFusionMesa {
  accion: AccionFusionMesa
  mesa: MesaPobladaDoc
  mesasActualizadas: MesaPobladaDoc[]
}

interface DatosUbicacionMesa {
  nombre: string
  id: Types.ObjectId | null
}

const ESTADOS_PEDIDO_ACTIVOS = [
  ESTADOS_PEDIDO.BORRADOR,
  ESTADOS_PEDIDO.PENDIENTE,
  ESTADOS_PEDIDO.ABIERTO,
  ESTADOS_PEDIDO.EN_PREPARACION,
  ESTADOS_PEDIDO.LISTO,
  ESTADOS_PEDIDO.ENTREGADO
]

export class MesaFusionServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'MesaFusionServiceError'
  }
}

export class MesaFusionService {
  constructor(
    private mesaRepo: MesaRepository = mesaRepository,
    private ocupacionRepo: MesaOcupacionRepository =
      mesaOcupacionRepository
  ) {}

  private escaparRegex(valor: string): string {
    return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private obtenerEstadoFusion(mesa: MesaPobladaDoc): EstadoFusionMesa {
    return mesa.estadoFusion ?? ESTADOS_FUSION_MESA.INDIVIDUAL
  }

  private obtenerUbicacion(mesa: MesaPobladaDoc): DatosUbicacionMesa {
    const referencia = mesa.ubicacionId

    let id: Types.ObjectId | null = null
    let nombre = (mesa.ubicacion || 'Salón Principal').trim()

    if (
      referencia &&
      typeof referencia === 'object' &&
      '_id' in referencia
    ) {
      const ubicacionPoblada = referencia as {
        _id: Types.ObjectId | string
        nombre?: string
        name?: string
      }

      const idTexto = String(ubicacionPoblada._id)

      if (Types.ObjectId.isValid(idTexto)) {
        id = new Types.ObjectId(idTexto)
      }

      nombre =
        ubicacionPoblada.nombre ||
        ubicacionPoblada.name ||
        nombre
    } else if (referencia) {
      const idTexto = String(referencia)

      if (Types.ObjectId.isValid(idTexto)) {
        id = new Types.ObjectId(idTexto)
      }
    }

    return { nombre, id }
  }

  private mismaUbicacion(
    primera: DatosUbicacionMesa,
    segunda: DatosUbicacionMesa
  ): boolean {
    if (primera.id && segunda.id) {
      return primera.id.equals(segunda.id)
    }

    if (primera.id || segunda.id) {
      return false
    }

    return (
      primera.nombre.trim().toLowerCase() ===
      segunda.nombre.trim().toLowerCase()
    )
  }

  private crearSnapshot(mesa: MesaPobladaDoc): MesaOrigenFusion {
    const ubicacion = this.obtenerUbicacion(mesa)

    return {
      mesaId: new Types.ObjectId(String(mesa._id)),
      numero: mesa.numero,
      capacidad: mesa.capacidad,
      ubicacion: ubicacion.nombre,
      ubicacionId: ubicacion.id
    }
  }

  private async validarIDs(mesaIds: string[]): Promise<void> {
    if (!Array.isArray(mesaIds) || mesaIds.length < 2) {
      throw new MesaFusionServiceError(
        400,
        'Debes seleccionar al menos dos mesas para realizar la fusión.'
      )
    }

    if (mesaIds.some((id) => typeof id !== 'string' || !Types.ObjectId.isValid(id))) {
      throw new MesaFusionServiceError(
        400,
        'Uno o más identificadores de mesa no son válidos.'
      )
    }

    const idsUnicos = new Set(mesaIds.map((id) => id.toLowerCase()))

    if (idsUnicos.size !== mesaIds.length) {
      throw new MesaFusionServiceError(
        400,
        'No puedes seleccionar la misma mesa más de una vez.'
      )
    }
  }

  private async obtenerMesasSeleccionadas(
    mesaIds: string[],
    session: ClientSession
  ): Promise<MesaPobladaDoc[]> {
    const encontradas = await this.mesaRepo.buscarPorIds(
      mesaIds,
      session
    )

    if (encontradas.length !== mesaIds.length) {
      throw new MesaFusionServiceError(
        404,
        'Una o más mesas seleccionadas no existen.'
      )
    }

    const porId = new Map(
      encontradas.map((mesa) => [String(mesa._id), mesa])
    )

    return mesaIds.map((id) => porId.get(id)!)
  }

  private async validarMesasLibres(
    mesas: MesaPobladaDoc[]
  ): Promise<void> {
    for (const mesa of mesas) {
      if (mesa.estado !== ESTADOS_MESA.LIBRE) {
        throw new MesaFusionServiceError(
          409,
          `La mesa "${mesa.numero}" debe estar libre para realizar esta operación.`
        )
      }
    }
  }

  private async validarSinOcupacionesTemporales(
    mesaIds: string[],
    session: ClientSession
  ): Promise<void> {
    const ahora = new Date()
    const idsUnicos = [...new Set(mesaIds)]

    for (const mesaId of idsUnicos) {
      const ocupacion = await this.ocupacionRepo.buscarPorMesaId(
        mesaId,
        session
      )

      if (!ocupacion) continue

      if (ocupacion.expiraEn > ahora) {
        throw new MesaFusionServiceError(
          409,
          'Una de las mesas tiene una ocupación temporal activa.'
        )
      }

      // Limpieza de ocupaciones vencidas dentro de la transacción.
      await this.ocupacionRepo.eliminarPorMesaId(
        mesaId,
        session
      )
    }
  }

  private async validarSinCuentasPendientes(
    mesaIds: string[],
    session: ClientSession
  ): Promise<void> {
    const ids = [
      ...new Set(mesaIds)
    ].map((id) => new Types.ObjectId(id))

    const cuentaPendiente = await CuentaMesa.findOne({
      mesa: { $in: ids },
      estado: ESTADOS_CUENTA_MESA.PENDIENTE_PAGO
    }).session(session)

    if (cuentaPendiente) {
      throw new MesaFusionServiceError(
        409,
        'No se puede modificar una fusión mientras exista una cuenta pendiente de pago.'
      )
    }
  }

  private async contarPedidosActivos(
    mesaIds: string[],
    session: ClientSession
  ): Promise<number> {
    const ids = [
      ...new Set(mesaIds)
    ].map((id) => new Types.ObjectId(id))

    return await Pedido.countDocuments({
      mesa: { $in: ids },
      estado: { $in: ESTADOS_PEDIDO_ACTIVOS }
    }).session(session)
  }

  private async contarPedidosHistoricos(
    mesaId: string,
    session: ClientSession
  ): Promise<number> {
    return await Pedido.countDocuments({
      mesa: new Types.ObjectId(mesaId)
    }).session(session)
  }

  private async validarNombreDisponible(
    numero: string,
    excluirId: string | undefined,
    session: ClientSession
  ): Promise<void> {
    const regex = new RegExp(
      `^${this.escaparRegex(numero.trim())}$`,
      'i'
    )

    const existente =
      await this.mesaRepo.buscarPorNumeroExcluyendoId(
        regex,
        excluirId,
        session
      )

    if (existente) {
      throw new MesaFusionServiceError(
        409,
        'El nombre compuesto de la fusión ya está reservado por otra mesa.'
      )
    }
  }

  private async integrarMesa(
    mesaId: string,
    fusionId: string,
    session: ClientSession
  ): Promise<MesaPobladaDoc> {
    const actualizada =
      await this.mesaRepo.actualizarEstructuraFusion(
        mesaId,
        {
          estado: ESTADOS_MESA.LIBRE,
          estadoFusion: ESTADOS_FUSION_MESA.INTEGRADA,
          fusionadaEn: new Types.ObjectId(fusionId),
          fusionDisueltaAt: null,
          fusionCanceladaAt: null
        },
        session
      )

    if (!actualizada) {
      throw new MesaFusionServiceError(
        409,
        'No se pudo integrar una de las mesas. La operación fue cancelada.'
      )
    }

    return actualizada
  }

  private async construirResultado(
    accion: AccionFusionMesa,
    fusionId: string,
    origenIds: string[],
    session: ClientSession
  ): Promise<ResultadoFusionMesa> {
    const fusion = await this.mesaRepo.buscarPorId(
      fusionId,
      session
    )

    if (!fusion) {
      throw new MesaFusionServiceError(
        404,
        'No se encontró el registro de la fusión.'
      )
    }

    const ids = [
      ...new Set([fusionId, ...origenIds])
    ]

    const mesasActualizadas =
      await this.mesaRepo.buscarPorIds(ids, session)

    return {
      accion,
      mesa: fusion,
      mesasActualizadas
    }
  }

  /**
   * Une mesas individuales libres o amplía una fusión existente
   * agregándole mesas individuales libres.
   *
   * La capacidad, ubicación y nombre compuesto se calculan en el backend.
   */
  async unirMesas(
    datos: UnirMesasDTO
  ): Promise<ResultadoFusionMesa> {
    await this.validarIDs(datos?.mesaIds)

    const session = await mongoose.startSession()
    let resultado: ResultadoFusionMesa | null = null

    try {
      await session.withTransaction(async () => {
        const seleccionadas = await this.obtenerMesasSeleccionadas(
          datos.mesaIds,
          session
        )

        const fusiones = seleccionadas.filter(
          (mesa) =>
            this.obtenerEstadoFusion(mesa) ===
            ESTADOS_FUSION_MESA.FUSIONADA
        )

        const individuales = seleccionadas.filter(
          (mesa) =>
            this.obtenerEstadoFusion(mesa) ===
            ESTADOS_FUSION_MESA.INDIVIDUAL
        )

        if (fusiones.length > 1) {
          throw new MesaFusionServiceError(
            409,
            'Selecciona como máximo una fusión existente y añade las mesas individuales que quieras incorporar.'
          )
        }

        if (
          individuales.length + fusiones.length !==
          seleccionadas.length
        ) {
          throw new MesaFusionServiceError(
            409,
            'Solo puedes unir mesas individuales o ampliar una fusión activa. Las mesas integradas o históricas no se pueden seleccionar.'
          )
        }

        if (fusiones.length === 1 && individuales.length === 0) {
          throw new MesaFusionServiceError(
            400,
            'Para ampliar una fusión debes seleccionar al menos una mesa individual adicional.'
          )
        }

        await this.validarMesasLibres(seleccionadas)

        const fusionExistente = fusiones[0] ?? null

        if (
          fusionExistente &&
          (!Array.isArray(fusionExistente.mesasOrigen) ||
            fusionExistente.mesasOrigen.length < 2)
        ) {
          throw new MesaFusionServiceError(
            409,
            'La fusión existente no tiene un registro de origen válido y no puede ampliarse.'
          )
        }

        const snapshotsAnteriores: MesaOrigenFusion[] =
          fusionExistente?.mesasOrigen ?? []

        const snapshotsNuevos = individuales.map((mesa) =>
          this.crearSnapshot(mesa)
        )

        const snapshots: MesaOrigenFusion[] = [
          ...snapshotsAnteriores,
          ...snapshotsNuevos
        ]

        const idsOrigen = snapshots.map((origen) =>
          String(origen.mesaId)
        )

        if (new Set(idsOrigen).size !== idsOrigen.length) {
          throw new MesaFusionServiceError(
            409,
            'La composición de la fusión contiene mesas de origen duplicadas.'
          )
        }

        const ubicacionBase = this.obtenerUbicacion(
          seleccionadas[0]
        )

        for (const mesa of seleccionadas.slice(1)) {
          const ubicacionActual = this.obtenerUbicacion(mesa)

          if (!this.mismaUbicacion(ubicacionBase, ubicacionActual)) {
            throw new MesaFusionServiceError(
              409,
              'Solo se pueden unir mesas pertenecientes a la misma ubicación.'
            )
          }
        }

        for (const origen of snapshots) {
          const ubicacionOrigen: DatosUbicacionMesa = {
            nombre: origen.ubicacion,
            id: origen.ubicacionId
              ? new Types.ObjectId(String(origen.ubicacionId))
              : null
          }

          if (!this.mismaUbicacion(ubicacionBase, ubicacionOrigen)) {
            throw new MesaFusionServiceError(
              409,
              'Todas las mesas de origen deben pertenecer a la misma ubicación.'
            )
          }
        }

        const fusionId = fusionExistente
          ? String(fusionExistente._id)
          : null

        const idsRelacionados = [
          ...(fusionId ? [fusionId] : []),
          ...idsOrigen,
          ...seleccionadas.map((mesa) => String(mesa._id))
        ]

        await this.validarSinOcupacionesTemporales(
          idsRelacionados,
          session
        )

        await this.validarSinCuentasPendientes(
          idsRelacionados,
          session
        )

        const pedidosActivos = await this.contarPedidosActivos(
          idsRelacionados,
          session
        )

        if (pedidosActivos > 0) {
          throw new MesaFusionServiceError(
            409,
            'No se pueden unir mesas que tengan pedidos activos.'
          )
        }

        // No ampliamos una fusión si ya se registraron pedidos
        // directamente contra su propio identificador.
        if (fusionExistente) {
          const pedidosHistoricos = await this.contarPedidosHistoricos(
            fusionId!,
            session
          )

          if (pedidosHistoricos > 0) {
            throw new MesaFusionServiceError(
              409,
              'Esta fusión ya tiene historial de pedidos y no puede ampliarse.'
            )
          }
        }

        const capacidadTotal = snapshots.reduce(
          (total, origen) => total + origen.capacidad,
          0
        )

        if (!Number.isFinite(capacidadTotal) || capacidadTotal < 2) {
          throw new MesaFusionServiceError(
            400,
            'La capacidad total de la fusión no es válida.'
          )
        }

        const numeroCompuesto = snapshots
          .map((origen) => origen.numero)
          .join(' + ')

        await this.validarNombreDisponible(
          numeroCompuesto,
          fusionId ?? undefined,
          session
        )

        let fusion: MesaPobladaDoc

        if (fusionExistente) {
          const ubicacionParaActualizar = ubicacionBase.id
            ? String(ubicacionBase.id)
            : ubicacionBase.nombre

          const actualizada = await this.mesaRepo.actualizar(
            String(fusionExistente._id),
            {
              numero: numeroCompuesto,
              capacidad: capacidadTotal,
              location: ubicacionParaActualizar,
              estado: ESTADOS_MESA.LIBRE
            },
            session
          )

          if (!actualizada) {
            throw new MesaFusionServiceError(
              409,
              'No se pudo actualizar la fusión existente.'
            )
          }

          const fusionEstructural =
            await this.mesaRepo.actualizarEstructuraFusion(
              String(fusionExistente._id),
              {
                estadoFusion: ESTADOS_FUSION_MESA.FUSIONADA,
                fusionadaEn: null,
                mesasOrigen: snapshots,
                fusionDisueltaAt: null,
                fusionCanceladaAt: null
              },
              session,
              [ESTADOS_FUSION_MESA.FUSIONADA]
            )

          if (!fusionEstructural) {
            throw new MesaFusionServiceError(
              409,
              'La fusión cambió durante la operación. No se aplicaron los cambios.'
            )
          }

          fusion = fusionEstructural
        } else {
          fusion = await this.mesaRepo.crearFusion(
            {
              numero: numeroCompuesto,
              capacidad: capacidadTotal,
              ubicacion: ubicacionBase.nombre,
              ubicacionId: ubicacionBase.id,
              mesasOrigen: snapshots
            },
            session
          )
        }

        for (const mesa of individuales) {
          await this.integrarMesa(
            String(mesa._id),
            String(fusion._id),
            session
          )
        }

        resultado = await this.construirResultado(
          fusionExistente ? 'ampliada' : 'fusionada',
          String(fusion._id),
          idsOrigen,
          session
        )
      })

      if (!resultado) {
        throw new MesaFusionServiceError(
          500,
          'No se obtuvo el resultado de la operación de fusión.'
        )
      }

      return resultado
    } catch (error: unknown) {
      const err = error as { code?: number }

      if (err?.code === 11000) {
        throw new MesaFusionServiceError(
          409,
          'Ya existe una mesa con el nombre generado para esta fusión.'
        )
      }

      throw error
    } finally {
      await session.endSession()
    }
  }

  /**
   * Cancela una fusión que nunca tuvo pedidos asociados.
   * No borra documentos: conserva el registro histórico de la fusión.
   */
  async cancelarFusion(
    fusionId: string
  ): Promise<ResultadoFusionMesa> {
    return await this.ejecutarSeparacionManual(
      fusionId,
      'cancelada'
    )
  }

  /**
   * Separa manualmente una fusión que ya tuvo pedidos,
   * siempre que vuelva a estar libre y no tenga actividad pendiente.
   */
  async separarFusion(
    fusionId: string
  ): Promise<ResultadoFusionMesa> {
    return await this.ejecutarSeparacionManual(
      fusionId,
      'disuelta'
    )
  }

  private async ejecutarSeparacionManual(
    fusionId: string,
    modo: 'cancelada' | 'disuelta'
  ): Promise<ResultadoFusionMesa> {
    if (!Types.ObjectId.isValid(fusionId)) {
      throw new MesaFusionServiceError(
        400,
        'El identificador de la fusión no es válido.'
      )
    }

    const session = await mongoose.startSession()
    let resultado: ResultadoFusionMesa | null = null

    try {
      await session.withTransaction(async () => {
        resultado = await this.restaurarFusion(
          fusionId,
          session,
          modo
        )
      })

      if (!resultado) {
        throw new MesaFusionServiceError(
          500,
          'No se obtuvo el resultado de la separación.'
        )
      }

      return resultado
    } finally {
      await session.endSession()
    }
  }

  /**
   * Se invoca desde el flujo de pago de una cuenta agrupada,
   * utilizando la misma sesión/transacción en la que se confirma el pago.
   *
   * Retorna null si el pago pertenece a una mesa individual.
   */
  async separarTrasPago(
    mesaId: string,
    session: ClientSession
  ): Promise<ResultadoFusionMesa | null> {
    if (!Types.ObjectId.isValid(mesaId)) {
      throw new MesaFusionServiceError(
        400,
        'El identificador de mesa no es válido.'
      )
    }

    const mesa = await this.mesaRepo.buscarPorId(
      mesaId,
      session
    )

    if (!mesa) {
      throw new MesaFusionServiceError(
        404,
        'No se encontró la mesa vinculada al pago.'
      )
    }

    if (
      this.obtenerEstadoFusion(mesa) !==
      ESTADOS_FUSION_MESA.FUSIONADA
    ) {
      return null
    }

    return await this.restaurarFusion(
      mesaId,
      session,
      'disuelta'
    )
  }

  private async restaurarFusion(
    fusionId: string,
    session: ClientSession,
    modo: 'cancelada' | 'disuelta'
  ): Promise<ResultadoFusionMesa> {
    const fusion = await this.mesaRepo.buscarPorId(
      fusionId,
      session
    )

    if (!fusion) {
      throw new MesaFusionServiceError(
        404,
        'No se encontró la fusión solicitada.'
      )
    }

    if (
      this.obtenerEstadoFusion(fusion) !==
      ESTADOS_FUSION_MESA.FUSIONADA
    ) {
      throw new MesaFusionServiceError(
        409,
        'La mesa seleccionada no es una fusión activa.'
      )
    }

    if (fusion.estado !== ESTADOS_MESA.LIBRE) {
      throw new MesaFusionServiceError(
        409,
        'La fusión debe estar libre antes de restaurar las mesas originales.'
      )
    }

    if (
      !Array.isArray(fusion.mesasOrigen) ||
      fusion.mesasOrigen.length < 2
    ) {
      throw new MesaFusionServiceError(
        409,
        'No se puede restaurar la fusión porque faltan las mesas de origen.'
      )
    }

    const origenIds = fusion.mesasOrigen.map((origen) =>
      String(origen.mesaId)
    )

    if (new Set(origenIds).size !== origenIds.length) {
      throw new MesaFusionServiceError(
        409,
        'La fusión contiene referencias de origen duplicadas.'
      )
    }

    const idsRelacionados = [
      fusionId,
      ...origenIds
    ]

    await this.validarSinOcupacionesTemporales(
      idsRelacionados,
      session
    )

    await this.validarSinCuentasPendientes(
      idsRelacionados,
      session
    )

    const pedidosActivos = await this.contarPedidosActivos(
      idsRelacionados,
      session
    )

    if (pedidosActivos > 0) {
      throw new MesaFusionServiceError(
        409,
        'No se puede separar una fusión que todavía tiene pedidos activos.'
      )
    }

    const pedidosHistoricos = await this.contarPedidosHistoricos(
      fusionId,
      session
    )

    if (modo === 'cancelada' && pedidosHistoricos > 0) {
      throw new MesaFusionServiceError(
        409,
        'Esta fusión ya tuvo pedidos y no se puede cancelar. Debe utilizarse la operación de separación.'
      )
    }

    if (modo === 'disuelta' && pedidosHistoricos === 0) {
      throw new MesaFusionServiceError(
        409,
        'Esta fusión nunca tuvo pedidos. Utiliza la operación de cancelar fusión.'
      )
    }

    const originales = await this.mesaRepo.buscarPorIds(
      origenIds,
      session
    )

    if (originales.length !== origenIds.length) {
      throw new MesaFusionServiceError(
        409,
        'No se encontraron todas las mesas originales. No se modificó la fusión.'
      )
    }

    for (const original of originales) {
      const fusionadaEn = original.fusionadaEn
        ? String(original.fusionadaEn)
        : null

      if (
        this.obtenerEstadoFusion(original) !==
          ESTADOS_FUSION_MESA.INTEGRADA ||
        fusionadaEn !== fusionId
      ) {
        throw new MesaFusionServiceError(
          409,
          `La mesa original "${original.numero}" ya no está vinculada correctamente a esta fusión.`
        )
      }
    }

    for (const original of originales) {
      const restaurada =
        await this.mesaRepo.actualizarEstructuraFusion(
          String(original._id),
          {
            estado: ESTADOS_MESA.LIBRE,
            estadoFusion: ESTADOS_FUSION_MESA.INDIVIDUAL,
            fusionadaEn: null,
            fusionDisueltaAt: null,
            fusionCanceladaAt: null
          },
          session,
          [ESTADOS_FUSION_MESA.INTEGRADA]
        )

      if (!restaurada) {
        throw new MesaFusionServiceError(
          409,
          `No se pudo restaurar la mesa "${original.numero}". La transacción se canceló.`
        )
      }
    }

    const ahora = new Date()

    const fusionHistorica =
      await this.mesaRepo.actualizarEstructuraFusion(
        fusionId,
        {
          estado: ESTADOS_MESA.LIBRE,
          estadoFusion:
            modo === 'cancelada'
              ? ESTADOS_FUSION_MESA.CANCELADA
              : ESTADOS_FUSION_MESA.DISUELTA,
          fusionadaEn: null,
          fusionCanceladaAt:
            modo === 'cancelada' ? ahora : null,
          fusionDisueltaAt:
            modo === 'disuelta' ? ahora : null
        },
        session,
        [ESTADOS_FUSION_MESA.FUSIONADA]
      )

    if (!fusionHistorica) {
      throw new MesaFusionServiceError(
        409,
        'No se pudo actualizar el registro histórico de la fusión.'
      )
    }

    return await this.construirResultado(
      modo === 'cancelada' ? 'cancelada' : 'disuelta',
      fusionId,
      origenIds,
      session
    )
  }
}

export const mesaFusionService = new MesaFusionService()