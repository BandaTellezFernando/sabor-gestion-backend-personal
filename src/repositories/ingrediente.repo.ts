// src/repositories/ingrediente.repo.ts
import Ingrediente, { IIngrediente } from '../models/Ingrediente'

export { IIngrediente } from '../models/Ingrediente'

export interface IngredienteCrearDatos {
  nombre: string
  unidadMedida: string
  disponible?: boolean
}

export interface IngredienteActualizarDatos {
  nombre?: string
  unidadMedida?: string
  disponible?: boolean
}

export class IngredienteRepository {
  /**
   * Obtiene todos los ingredientes ordenados alfabéticamente por nombre
   */
  async buscarTodos(): Promise<IIngrediente[]> {
    return await Ingrediente.find().sort({ nombre: 1 })
  }

  /**
   * Busca un ingrediente por su ID
   */
  async buscarPorId(id: string): Promise<IIngrediente | null> {
    return await Ingrediente.findById(id)
  }

  /**
   * Crea y guarda un nuevo ingrediente en MongoDB
   */
  async crear(datos: IngredienteCrearDatos): Promise<IIngrediente> {
    const nuevo = new Ingrediente(datos)
    return await nuevo.save()
  }

  /**
   * Actualiza los datos de un ingrediente por su ID
   */
  async actualizar(
    id: string,
    datos: IngredienteActualizarDatos
  ): Promise<IIngrediente | null> {
    return await Ingrediente.findByIdAndUpdate(id, datos, { returnDocument: 'after' })
  }

  /**
   * Elimina un ingrediente por su ID
   */
  async eliminar(id: string): Promise<IIngrediente | null> {
    return await Ingrediente.findByIdAndDelete(id)
  }
}

export const ingredienteRepository = new IngredienteRepository()
