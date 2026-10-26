// src/repositories/mesa.repo.ts
import { ESTADOS_MESA } from '../utils/constants'
import mongoose, { Types, ClientSession } from 'mongoose'
import Mesa, { IMesa } from '../models/Mesa'

export { IMesa } from '../models/Mesa'

// Interfaz para la ubicación poblada desde MongoDB
export interface PopulatedUbicacion {
  _id: Types.ObjectId
  nombre?: string
  name?: string
}

// Tipo para el documento de Mesa cuando se le aplica .populate('ubicacionId')
export type MesaPobladaDoc = Omit<IMesa, 'ubicacionId'> & {
  _id: Types.ObjectId
  ubicacionId?: PopulatedUbicacion | Types.ObjectId | null
}

// Interfaz de datos para inserción en la base de datos
export interface MesaCrearDatos {
  numero: string
  capacidad: number
  estado: string
  location?: string
}

// Interfaz de datos para actualización en la base de datos
export interface MesaActualizarDatos {
  numero?: string
  capacidad?: number
  estado?: string
  location?: string
}

export class MesaRepository {
  /**
   * Obtiene todas las mesas con su ubicación poblada, aplicando filtro opcional de ubicación.
   */
  async buscarTodos(location?: string): Promise<MesaPobladaDoc[]> {
    let filtro: Record<string, any> = {}

    if (location) {
      if (mongoose.Types.ObjectId.isValid(location)) {
        filtro = { ubicacionId: new mongoose.Types.ObjectId(location) }
      } else {
        filtro = { ubicacion: location }
      }
    }

    return (await Mesa.find(filtro).populate('ubicacionId', 'nombre')) as MesaPobladaDoc[]
  }

   /**
   * Busca una mesa por su ID con su ubicación poblada.
   * Permite participar en transacciones MongoDB.
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
   * Busca si existe una mesa con el mismo número (insensible a mayúsculas/minúsculas),
   * excluyendo un ID opcional (para validación de duplicados al actualizar).
   */
  async buscarPorNumeroExcluyendoId(
    numeroRegex: RegExp,
    excluirId?: string
  ): Promise<IMesa | null> {
    const filtro: Record<string, any> = { numero: numeroRegex }
    if (excluirId) {
      filtro._id = { $ne: excluirId }
    }
    return await Mesa.findOne(filtro)
  }

  /**
   * Crea una sola mesa o actualiza una existente con el mismo número (upsert seguro)
   * y la devuelve con su ubicación poblada, evitando errores E11000 duplicate key.
   */
  async crearIndividual(datos: MesaCrearDatos): Promise<MesaPobladaDoc> {
    const numeroTrim = (datos.numero || '').trim()
    const base: Partial<IMesa> = {
      numero: numeroTrim,
      capacidad: datos.capacidad,
      estado: datos.estado || 'Libre'
    }

    if (datos.location !== undefined) {
      if (mongoose.Types.ObjectId.isValid(datos.location)) {
        base.ubicacionId = new mongoose.Types.ObjectId(datos.location)
      } else {
        base.ubicacion = datos.location
      }
    }

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`^${escapeRegex(numeroTrim)}$`, 'i')

    // 1. Si la mesa ya existe por número (insensible a mayúsculas/minúsculas), actualizarla
    const existente = await Mesa.findOne({ numero: regex })
    if (existente) {
      existente.capacidad = datos.capacidad
      existente.estado = datos.estado || 'Libre'
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

    // 2. Si no existe, crearla protegiendo contra posibles condiciones de carrera (E11000)
    try {
      const nuevaMesa = new Mesa(base)
      await nuevaMesa.save()

      return (await Mesa.findById(nuevaMesa._id).populate(
        'ubicacionId',
        'nombre'
      )) as MesaPobladaDoc
    } catch (err: any) {
      if (err?.code === 11000 || err?.name === 'MongoServerError') {
        const colision = await Mesa.findOne({ numero: regex })
        if (colision) {
          colision.capacidad = datos.capacidad
          colision.estado = datos.estado || 'Libre'
          if (datos.location !== undefined) {
            if (mongoose.Types.ObjectId.isValid(datos.location)) {
              colision.ubicacionId = new mongoose.Types.ObjectId(datos.location)
              colision.set('ubicacion', undefined)
            } else {
              colision.ubicacion = datos.location
              colision.set('ubicacionId', undefined)
            }
          }
          await colision.save()
          return (await Mesa.findById(colision._id).populate(
            'ubicacionId',
            'nombre'
          )) as MesaPobladaDoc
        }
      }
      throw err
    }
  }

  /**
   * Crea un lote de mesas y las devuelve todas con su ubicación poblada.
   * Utiliza crearIndividual para garantizar upsert seguro y prevenir colisiones E11000.
   */
  async crearLote(datosLote: MesaCrearDatos[]): Promise<MesaPobladaDoc[]> {
    const resultados: MesaPobladaDoc[] = []
    for (const item of datosLote) {
      resultados.push(await this.crearIndividual(item))
    }
    return resultados
  }

  /**
   * Actualiza los campos de una mesa existente y la devuelve con su ubicación poblada.
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
        update.$unset = { ubicacion: 1 } // Eliminamos el campo de texto si hay ID
      } else {
        update.ubicacion = datos.location
        update.$unset = { ubicacionId: 1 } // Eliminamos el ID si mandan texto
      }
    }

    return (await Mesa.findByIdAndUpdate(id, update, {
      returnDocument: 'after',
      session,
      runValidators: true
    }).populate('ubicacionId', 'nombre')) as MesaPobladaDoc | null
  }

  /**
   * Actualiza únicamente el estado de una mesa y la devuelve con su ubicación poblada.
   */
  async actualizarEstado(
    id: string,
    backendStatus: string,
    session?: ClientSession
  ): Promise<MesaPobladaDoc | null> {
    return (await Mesa.findByIdAndUpdate(
      id,
      { estado: backendStatus },
      { returnDocument: 'after', session, runValidators: true }
    ).populate('ubicacionId', 'nombre')) as MesaPobladaDoc | null
  }

    /**
   * Cambia una mesa ocupada a Cuenta Solicitada.
   * Solo permite la transición desde Ocupada o si ya está
   * en Cuenta Solicitada.
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
        }
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
   * Actualiza atómicamente el estado de una mesa a 'Ocupada' ÚNICAMENTE si actualmente está 'Libre'.
   * Previene condiciones de carrera concurrentes a nivel de base de datos.
   */
  async ocuparMesaSiLibre(
    id: string,
    session?: ClientSession
  ): Promise<MesaPobladaDoc | null> {
    return (await Mesa.findOneAndUpdate(
      { _id: id, estado: 'Libre' },
      { estado: 'Ocupada' },
      { returnDocument: 'after', session, runValidators: true }
    ).populate('ubicacionId', 'nombre')) as MesaPobladaDoc | null
  }

  /**
   * Elimina una mesa por su identificador único.
   */
  async eliminar(id: string): Promise<MesaPobladaDoc | null> {
    return (await Mesa.findByIdAndDelete(id)) as MesaPobladaDoc | null
  }

  /**
   * Cuenta las mesas asignadas a una ubicación por su clave foránea ubicacionId
   */
  async contarPorUbicacionId(ubicacionId: string | mongoose.Types.ObjectId): Promise<number> {
    return await Mesa.countDocuments({ ubicacionId })
  }
}

export const mesaRepository = new MesaRepository()
