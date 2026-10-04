// src/repositories/mesa.repo.ts
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
   */
  async buscarPorId(id: string): Promise<MesaPobladaDoc | null> {
    return (await Mesa.findById(id).populate('ubicacionId', 'nombre')) as MesaPobladaDoc | null
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
   * Crea una sola mesa y la devuelve con su ubicación poblada.
   */
  async crearIndividual(datos: MesaCrearDatos): Promise<MesaPobladaDoc> {
    const base: Partial<IMesa> = {
      numero: datos.numero,
      capacidad: datos.capacidad,
      estado: datos.estado
    }

    if (datos.location !== undefined) {
      if (mongoose.Types.ObjectId.isValid(datos.location)) {
        base.ubicacionId = new mongoose.Types.ObjectId(datos.location)
      } else {
        base.ubicacion = datos.location
      }
    }

    const nuevaMesa = new Mesa(base)
    await nuevaMesa.save()

    return (await Mesa.findById(nuevaMesa._id).populate(
      'ubicacionId',
      'nombre'
    )) as MesaPobladaDoc
  }

  /**
   * Crea un lote de mesas y las devuelve todas con su ubicación poblada.
   */
  async crearLote(datosLote: MesaCrearDatos[]): Promise<MesaPobladaDoc[]> {
    const inputs = datosLote.map((item) => {
      const base: Partial<IMesa> = {
        numero: item.numero,
        capacidad: item.capacidad,
        estado: item.estado
      }

      if (item.location) {
        if (mongoose.Types.ObjectId.isValid(item.location)) {
          base.ubicacionId = new mongoose.Types.ObjectId(item.location)
        } else {
          base.ubicacion = item.location
        }
      }
      return base
    })

    const nuevasMesas = await Mesa.insertMany(inputs)

    return (await Mesa.find({
      _id: { $in: nuevasMesas.map((m) => m._id) }
    }).populate('ubicacionId', 'nombre')) as MesaPobladaDoc[]
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
