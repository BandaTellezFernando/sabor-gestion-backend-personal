// src/repositories/ubicacion.repo.ts
import Ubicacion, { IUbicacion } from '../models/Ubicacion'

export { IUbicacion } from '../models/Ubicacion'

export interface UbicacionDatos {
  nombre: string
  name: string
  descripcion?: string
}

export class UbicacionRepository {
  /**
   * Obtiene todas las ubicaciones ordenadas alfabéticamente por nombre
   */
  async buscarTodos(): Promise<IUbicacion[]> {
    return await Ubicacion.find().sort({ nombre: 1 })
  }

  /**
   * Busca una ubicación por su identificador único
   */
  async buscarPorId(id: string): Promise<IUbicacion | null> {
    return await Ubicacion.findById(id)
  }

  /**
   * Busca si existe una ubicación coincidente por 'nombre' o 'name' (case-insensitive),
   * excluyendo opcionalmente un ID específico para validaciones al actualizar.
   */
  async buscarPorNombreOAlias(regex: RegExp, excluirId?: string): Promise<IUbicacion | null> {
    const filtro: Record<string, any> = {
      $or: [{ nombre: regex }, { name: regex }]
    }
    if (excluirId) {
      filtro._id = { $ne: excluirId }
    }
    return await Ubicacion.findOne(filtro)
  }

  /**
   * Crea y guarda una nueva ubicación en MongoDB
   */
  async crear(datos: UbicacionDatos): Promise<IUbicacion> {
    const nueva = new Ubicacion(datos)
    return await nueva.save()
  }

  /**
   * Actualiza los datos de una ubicación por su ID
   */
  async actualizar(id: string, datos: UbicacionDatos): Promise<IUbicacion | null> {
    return await Ubicacion.findByIdAndUpdate(id, datos, { returnDocument: 'after' })
  }

  /**
   * Elimina una ubicación por su identificador único
   */
  async eliminar(id: string): Promise<IUbicacion | null> {
    return await Ubicacion.findByIdAndDelete(id)
  }
}

export const ubicacionRepository = new UbicacionRepository()
