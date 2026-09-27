// src/repositories/receta.repo.ts
import Receta, { IReceta, IRecetaIngrediente } from '../models/Receta'
import { Types } from 'mongoose'

export { IReceta, IRecetaIngrediente } from '../models/Receta'

export interface IRecetaIngredienteInput {
  ingrediente: string | Types.ObjectId
  cantidadNecesaria: number
}

export interface RecetaCrearDatos {
  plato: string | Types.ObjectId
  ingredientes: IRecetaIngredienteInput[]
}

export class RecetaRepository {
  /**
   * Obtiene todas las recetas con sus platos e ingredientes asociados
   */
  async buscarTodos(): Promise<IReceta[]> {
    return await Receta.find()
      .populate('plato', 'nombre precio')
      .populate('ingredientes.ingrediente', 'nombre unidadMedida disponible')
  }

  /**
   * Busca una receta por su identificador único
   */
  async buscarPorId(id: string): Promise<IReceta | null> {
    return await Receta.findById(id)
  }

  /**
   * Busca la receta asociada a un plato específico (relación 1:1)
   */
  async buscarPorPlatoId(platoId: string): Promise<IReceta | null> {
    return await Receta.findOne({ plato: platoId })
  }

  /**
   * Busca una receta por el ID del plato con los datos del ingrediente poblados
   */
  async buscarPorPlatoIdConIngredientes(platoId: string): Promise<IReceta | null> {
    return await Receta.findOne({ plato: platoId }).populate(
      'ingredientes.ingrediente'
    )
  }

  /**
   * Crea y guarda una nueva receta en la base de datos
   */
  async crear(datos: RecetaCrearDatos): Promise<IReceta> {
    const nuevaReceta = new Receta(datos)
    return await nuevaReceta.save()
  }

  /**
   * Actualiza el listado de ingredientes y sus cantidades necesarias de una receta existente
   */
  async actualizarIngredientes(
    id: string,
    ingredientes: IRecetaIngredienteInput[]
  ): Promise<IReceta | null> {
    return await Receta.findByIdAndUpdate(
      id,
      { ingredientes },
      { returnDocument: 'after', runValidators: true }
    )
  }

  /**
   * Elimina una receta por su identificador único
   */
  async eliminar(id: string): Promise<IReceta | null> {
    return await Receta.findByIdAndDelete(id)
  }
}

export const recetaRepository = new RecetaRepository()
