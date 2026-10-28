// src/repositories/mesa.repo.ts
import mongoose, { Types, ClientSession } from 'mongoose'
import Mesa, { IMesa, MesaOrigenFusion } from '../models/Mesa'
import {
  ESTADOS_MESA,
  ESTADOS_FUSION_MESA,
  type EstadoFusionMesa
} from '../utils/constants'

export { IMesa } from '../models/Mesa'

export interface PopulatedUbicacion {
  _id: Types.ObjectId
  nombre?: string
  name?: string
}

export type MesaPobladaDoc = Omit<IMesa, 'ubicacionId'> & {
  _id: Types.ObjectId
  ubicacionId?: PopulatedUbicacion | Types.ObjectId | null
}

export interface MesaCrearDatos {
  numero: string
  capacidad: number
  estado: string
  location?: string
}

export interface MesaActualizarDatos {
  numero?: string
  capacidad?: number
  estado?: string
  location?: string
}

export interface MesaCrearFusionDatos {
  numero: string
  capacidad: number
  ubicacion: string
  ubicacionId?: Types.ObjectId | null
  mesasOrigen: MesaOrigenFusion[]
}

export interface MesaFusionActualizarDatos {
  estado?: string
  estadoFusion?: EstadoFusionMesa
  fusionadaEn?: Types.ObjectId | null
  mesasOrigen?: MesaOrigenFusion[]
  fusionDisueltaAt?: Date | null
  fusionCanceladaAt?: Date | null
}

const ESTADOS_ESTRUCTURALES_ACTIVOS = [
  ESTADOS_FUSION_MESA.INDIVIDUAL,
  ESTADOS_FUSION_MESA.FUSIONADA,
  ESTADOS_FUSION_MESA.INTEGRADA
]

const ESTADOS_OPERATIVOS = [
  ESTADOS_FUSION_MESA.INDIVIDUAL,
  ESTADOS_FUSION_MESA.FUSIONADA
]

/**
 * Incluye documentos antiguos que todavía no poseen estadoFusion.
 * Esos registros deben tratarse como mesas individuales hasta ejecutar
 * la migración de datos correspondiente.
 */
function filtroMesasOperativas() {
  return {
    $or: [
      { estadoFusion: { $in: ESTADOS_OPERATIVOS } },
      { estadoFusion: { $exists: false } }
    ]
  }
}

function filtroMesaIndividual() {
  return {
    $or: [
      { estadoFusion: ESTADOS_FUSION_MESA.INDIVIDUAL },
      { estadoFusion: { $exists: false } }
    ]
  }
}

export class MesaRepository {
  /**
   * Obtiene las mesas operativas y su ubicación.
   * Las mesas integradas o fusionadas históricas no aparecen en el listado.
   */
  async buscarTodos(location?: string): Promise<MesaPobladaDoc[]> {
    const filtro: Record<string, any> = filtroMesasOperativas()

    if (location) {
      if (mongoose.Types.ObjectId.isValid(location)) {
        filtro.ubicacionId = new mongoose.Types.ObjectId(location)
      } else {
        filtro.ubicacion = location
      }
    }

    return (await Mesa.find(filtro).populate(
      'ubicacionId',
      'nombre'
    )) as MesaPobladaDoc[]
  }

  /**
   * Busca una mesa por ID.
   * Incluye registros históricos porque también se necesita consultarlos
   * durante validaciones y para conservar referencias de pedidos y pagos.
   */
  async buscarPorId(
    id: string,
    session?: ClientSession
  ): Promise<MesaPobladaDoc | null> {
    return (await Mesa.findById(id)
      .session(session ?? null)
      .populate('ubicacionId', 'nombre')) as MesaPobladaDoc | null
  }

  /**
   * Busca varias mesas en una misma consulta.
   * Puede utilizarse dentro de una transacción.
   */
  async buscarPorIds(
    ids: string[],
    session?: ClientSession
  ): Promise<MesaPobladaDoc[]> {
    return (await Mesa.find({
      _id: { $in: ids }
    })
      .session(session ?? null)
      .populate('ubicacionId', 'nombre')) as MesaPobladaDoc[]
  }

  /**
   * Busca un número reservado por una mesa operativa,
   * incluyendo mesas integradas que todavía conservan su nombre.
   * Las fusiones canceladas o disueltas no reservan el nombre.
   */
  async buscarPorNumeroExcluyendoId(
    numeroRegex: RegExp,
    excluirId?: string,
    session?: ClientSession
  ): Promise<IMesa | null> {
    const filtro: Record<string, any> = {
      numero: numeroRegex,
      $or: [
        { estadoFusion: { $in: ESTADOS_ESTRUCTURALES_ACTIVOS } },
        { estadoFusion: { $exists: false } }
      ]
    }

    if (excluirId) {
      filtro._id = { $ne: excluirId }
    }

    return await Mesa.findOne(filtro).session(session ?? null)
  }

  /**
   * Crea una mesa individual o actualiza una mesa individual existente
   * con el mismo número.
   *
   * No actualiza una fusión activa, una mesa integrada ni un registro
   * histórico solo porque coincida el número.
   */
  async crearIndividual(datos: MesaCrearDatos): Promise<MesaPobladaDoc> {
    const numeroTrim = (datos.numero || '').trim()

    const base: Partial<IMesa> = {
      numero: numeroTrim,
      capacidad: datos.capacidad,
      estado: datos.estado || ESTADOS_MESA.LIBRE,
      estadoFusion: ESTADOS_FUSION_MESA.INDIVIDUAL
    }

    if (datos.location !== undefined) {
      if (mongoose.Types.ObjectId.isValid(datos.location)) {
        base.ubicacionId = new mongoose.Types.ObjectId(datos.location)
      } else {
        base.ubicacion = datos.location
      }
    }

    const escapeRegex = (valor: string) =>
      valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const regex = new RegExp(`^${escapeRegex(numeroTrim)}$`, 'i')

    const filtroExistente = {
      numero: regex,
      $or: [
        { estadoFusion: ESTADOS_FUSION_MESA.INDIVIDUAL },
        { estadoFusion: { $exists: false } }
      ]
    }

    const actualizarExistente = async (
      existente: IMesa
    ): Promise<MesaPobladaDoc> => {
      existente.capacidad = datos.capacidad
      existente.estado = datos.estado || ESTADOS_MESA.LIBRE

      // Completa el estado estructural de registros antiguos.
      existente.estadoFusion = ESTADOS_FUSION_MESA.INDIVIDUAL

      if (datos.location !== undefined) {
        if (mongoose.Types.ObjectId.isValid(datos.location)) {
          existente.ubicacionId = new mongoose.Types.ObjectId(datos.location)
          existente.set('ubicacion', undefined)
        } else {
          existente.ubicacion = datos.location
          existente.set('ubicacionId', undefined)
        }
      }

      await existente.save()

      return (await Mesa.findById(existente._id).populate(
        'ubicacionId',
        'nombre'
      )) as MesaPobladaDoc
    }

    const existente = await Mesa.findOne(filtroExistente)

    if (existente) {
      return actualizarExistente(existente)
    }

    try {
      const nuevaMesa = new Mesa(base)
      await nuevaMesa.save()

      return (await Mesa.findById(nuevaMesa._id).populate(
        'ubicacionId',
        'nombre'
      )) as MesaPobladaDoc
    } catch (error: unknown) {
      const err = error as { code?: number; name?: string }

      if (err.code === 11000 || err.name === 'MongoServerError') {
        const colision = await Mesa.findOne(filtroExistente)

        if (colision) {
          return actualizarExistente(colision)
        }
      }

      throw error
    }
  }

  /**
   * Crea varias mesas utilizando la misma validación de creación individual.
   */
  async crearLote(datosLote: MesaCrearDatos[]): Promise<MesaPobladaDoc[]> {
    const resultados: MesaPobladaDoc[] = []

    for (const item of datosLote) {
      resultados.push(await this.crearIndividual(item))
    }

    return resultados
  }

  /**
   * Actualiza una mesa operativa existente.
   * No modifica mesas integradas ni registros históricos.
   */
  async actualizar(
    id: string,
    datos: MesaActualizarDatos,
    session?: ClientSession
  ): Promise<MesaPobladaDoc | null> {
    const update: Record<string, any> = {}

    if (datos.numero !== undefined) update.numero = datos.numero
    if (datos.capacidad !== undefined) update.capacidad = datos.capacidad
    if (datos.estado !== undefined) update.estado = datos.estado

    if (datos.location !== undefined) {
      if (mongoose.Types.ObjectId.isValid(datos.location)) {
        update.ubicacionId = new mongoose.Types.ObjectId(datos.location)
        update.$unset = { ubicacion: 1 }
      } else {
        update.ubicacion = datos.location
        update.$unset = { ubicacionId: 1 }
      }
    }

    return (await Mesa.findOneAndUpdate(
      {
        _id: id,
        ...filtroMesasOperativas()
      },
      update,
      {
        returnDocument: 'after',
        session,
        runValidators: true
      }
    ).populate('ubicacionId', 'nombre')) as MesaPobladaDoc | null
  }

  /**
   * Actualiza el estado operativo solamente de una mesa operativa.
   */
  async actualizarEstado(
    id: string,
    backendStatus: string,
    session?: ClientSession
  ): Promise<MesaPobladaDoc | null> {
    return (await Mesa.findOneAndUpdate(
      {
        _id: id,
        estado: { $in: Object.values(ESTADOS_MESA) },
        ...filtroMesasOperativas()
      },
      { estado: backendStatus },
      {
        returnDocument: 'after',
        session,
        runValidators: true
      }
    ).populate('ubicacionId', 'nombre')) as MesaPobladaDoc | null
  }

  /**
   * Cambia una mesa ocupada a Cuenta Solicitada.
   * La operación no puede afectar una mesa integrada o histórica.
   */
  async marcarCuentaSolicitadaSiOcupada(
    id: string,
    session?: ClientSession
  ): Promise<MesaPobladaDoc | null> {
    return (await Mesa.findOneAndUpdate(
      {
        _id: id,
        estado: {
          $in: [
            ESTADOS_MESA.OCUPADA,
            ESTADOS_MESA.CUENTA_SOLICITADA
          ]
        },
        ...filtroMesasOperativas()
      },
      {
        $set: {
          estado: ESTADOS_MESA.CUENTA_SOLICITADA
        }
      },
      {
        returnDocument: 'after',
        session,
        runValidators: true
      }
    ).populate('ubicacionId', 'nombre')) as MesaPobladaDoc | null
  }

  /**
   * Ocupa una mesa libre de forma atómica.
   * Solo admite mesas individuales o fusiones activas.
   */
  async ocuparMesaSiLibre(
    id: string,
    session?: ClientSession
  ): Promise<MesaPobladaDoc | null> {
    return (await Mesa.findOneAndUpdate(
      {
        _id: id,
        estado: ESTADOS_MESA.LIBRE,
        ...filtroMesasOperativas()
      },
      { estado: ESTADOS_MESA.OCUPADA },
      {
        returnDocument: 'after',
        session,
        runValidators: true
      }
    ).populate('ubicacionId', 'nombre')) as MesaPobladaDoc | null
  }

  /**
   * Crea una mesa fusionada dentro de la transacción suministrada.
   * La capacidad y las mesas de origen deben calcularse y validarse
   * en el servicio de fusiones, no confiarse al cliente.
   */
  async crearFusion(
    datos: MesaCrearFusionDatos,
    session: ClientSession
  ): Promise<MesaPobladaDoc> {
    const nuevaFusion = new Mesa({
      numero: datos.numero.trim(),
      capacidad: datos.capacidad,
      ubicacion: datos.ubicacion,
      ubicacionId: datos.ubicacionId ?? null,
      estado: ESTADOS_MESA.LIBRE,
      estadoFusion: ESTADOS_FUSION_MESA.FUSIONADA,
      fusionadaEn: null,
      mesasOrigen: datos.mesasOrigen,
      fusionDisueltaAt: null,
      fusionCanceladaAt: null
    })

    await nuevaFusion.save({ session })

    return (await Mesa.findById(nuevaFusion._id)
      .session(session)
      .populate('ubicacionId', 'nombre')) as MesaPobladaDoc
  }

  /**
   * Actualiza los metadatos estructurales de una fusión dentro
   * de una transacción.
   *
   * estadosEsperados permite evitar una actualización si otra operación
   * ya cambió el estado estructural del documento.
   */
  async actualizarEstructuraFusion(
    id: string,
    datos: MesaFusionActualizarDatos,
    session: ClientSession,
    estadosEsperados?: EstadoFusionMesa[]
  ): Promise<MesaPobladaDoc | null> {
    const set: Record<string, unknown> = {}

    if (datos.estado !== undefined) set.estado = datos.estado
    if (datos.estadoFusion !== undefined) {
      set.estadoFusion = datos.estadoFusion
    }
    if (datos.fusionadaEn !== undefined) {
      set.fusionadaEn = datos.fusionadaEn
    }
    if (datos.mesasOrigen !== undefined) {
      set.mesasOrigen = datos.mesasOrigen
    }
    if (datos.fusionDisueltaAt !== undefined) {
      set.fusionDisueltaAt = datos.fusionDisueltaAt
    }
    if (datos.fusionCanceladaAt !== undefined) {
      set.fusionCanceladaAt = datos.fusionCanceladaAt
    }

    const filtro: Record<string, unknown> = { _id: id }

    if (estadosEsperados?.length) {
      filtro.estadoFusion = { $in: estadosEsperados }
    }

    return (await Mesa.findOneAndUpdate(
      filtro,
      { $set: set },
      {
        returnDocument: 'after',
        session,
        runValidators: true
      }
    ).populate('ubicacionId', 'nombre')) as MesaPobladaDoc | null
  }

  /**
   * Elimina únicamente una mesa individual.
   * Las fusiones, las mesas integradas y los registros históricos
   * se conservan para proteger las referencias de pedidos y pagos.
   */
  async eliminar(
    id: string,
    session?: ClientSession
  ): Promise<MesaPobladaDoc | null> {
    return (await Mesa.findOneAndDelete({
      _id: id,
      ...filtroMesaIndividual()
    }).session(session ?? null)) as MesaPobladaDoc | null
  }

  /**
   * Cuenta las mesas asociadas a una ubicación.
   */
  async contarPorUbicacionId(
    ubicacionId: string | Types.ObjectId
  ): Promise<number> {
    return await Mesa.countDocuments({ ubicacionId })
  }
}

export const mesaRepository = new MesaRepository()