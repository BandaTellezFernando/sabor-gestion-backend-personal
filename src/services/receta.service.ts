// src/services/receta.service.ts
import {
  RecetaRepository,
  recetaRepository,
  IReceta,
  IRecetaIngredienteInput
} from '../repositories/receta.repo'
import { PlatoRepository, platoRepository } from '../repositories/plato.repo'

export class RecetaServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'RecetaServiceError'
  }
}

export interface GuardarRecetaDTO {
  plato?: string
  ingredientes?: IRecetaIngredienteInput[]
}

export interface ResultadoGuardarReceta {
  accion: 'creada' | 'actualizada'
  receta: IReceta
}

export class RecetaService {
  private recetaRepo: RecetaRepository
  private platoRepo: PlatoRepository

  constructor(
    recetaRepo?: RecetaRepository,
    platoRepo?: PlatoRepository
  ) {
    this.recetaRepo = recetaRepo || recetaRepository
    this.platoRepo = platoRepo || platoRepository
  }

  /**
   * Obtiene todas las recetas con sus platos e ingredientes asociados
   */
  async obtenerRecetas(): Promise<IReceta[]> {
    return await this.recetaRepo.buscarTodos()
  }

  /**
   * Obtiene una receta por su identificador único
   */
  async obtenerRecetaPorId(id: string): Promise<IReceta> {
    const receta = await this.recetaRepo.buscarPorId(id)
    if (!receta) {
      throw new RecetaServiceError(404, 'Receta no encontrada')
    }
    return receta
  }

  /**
   * Obtiene la receta asociada a un plato específico
   */
  async obtenerRecetaPorPlato(platoId: string): Promise<IReceta> {
    const receta = await this.recetaRepo.buscarPorPlatoId(platoId)
    if (!receta) {
      throw new RecetaServiceError(404, 'Receta no encontrada')
    }
    return receta
  }

  /**
   * Guarda una receta para un plato:
   * - Si ya existe una receta para el plato, actualiza sus ingredientes (200).
   * - Si no existe, crea una nueva receta (201).
   */
  async guardarReceta(body: GuardarRecetaDTO): Promise<ResultadoGuardarReceta> {
    const { plato, ingredientes } = body

    if (!plato || !ingredientes || !Array.isArray(ingredientes)) {
      throw new RecetaServiceError(
        400,
        'Faltan datos: se requiere el ID del plato y un arreglo de ingredientes.'
      )
    }

    const platoExiste = await this.platoRepo.buscarPorId(String(plato))
    if (!platoExiste) {
      throw new RecetaServiceError(
        404,
        'El plato indicado no existe en la base de datos.'
      )
    }

    const recetaExistente = await this.recetaRepo.buscarPorPlatoId(String(plato))

    if (recetaExistente) {
      const recetaActualizada = await this.recetaRepo.actualizarIngredientes(
        recetaExistente._id.toString(),
        ingredientes
      )
      return {
        accion: 'actualizada',
        receta: (recetaActualizada || recetaExistente) as IReceta
      }
    } else {
      const nuevaReceta = await this.recetaRepo.crear({
        plato,
        ingredientes
      })
      return {
        accion: 'creada',
        receta: nuevaReceta
      }
    }
  }

  /**
   * Elimina una receta por su identificador único
   */
  async eliminarReceta(id: string): Promise<void> {
    const eliminada = await this.recetaRepo.eliminar(id)
    if (!eliminada) {
      throw new RecetaServiceError(404, 'Receta no encontrada')
    }
  }
}

export const recetaService = new RecetaService()
