// src/services/ingrediente.service.ts
import {
  IngredienteRepository,
  ingredienteRepository,
  IIngrediente,
  IngredienteActualizarDatos
} from '../repositories/ingrediente.repo'

export class IngredienteServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'IngredienteServiceError'
  }
}

export interface IngredienteInputDTO {
  nombre?: string
  unidadMedida?: string
  disponible?: boolean | string
}

export class IngredienteService {
  private ingredienteRepo: IngredienteRepository

  constructor(ingredienteRepo?: IngredienteRepository) {
    this.ingredienteRepo = ingredienteRepo || ingredienteRepository
  }

  /**
   * Obtiene todos los ingredientes ordenados alfabéticamente
   */
  async obtenerIngredientes(): Promise<IIngrediente[]> {
    return await this.ingredienteRepo.buscarTodos()
  }

  /**
   * Obtiene un ingrediente por su identificador único
   */
  async obtenerIngredientePorId(id: string): Promise<IIngrediente> {
    const ingrediente = await this.ingredienteRepo.buscarPorId(id)
    if (!ingrediente) {
      throw new IngredienteServiceError(404, 'Ingrediente no encontrado')
    }
    return ingrediente
  }

  /**
   * Valida reglas de negocio y crea un nuevo ingrediente con disponibilidad booleana
   */
  async crearIngrediente(body: IngredienteInputDTO): Promise<IIngrediente> {
    const nombre = body.nombre ? String(body.nombre).trim() : ''
    const unidadMedida = body.unidadMedida ? String(body.unidadMedida).trim() : ''

    if (!nombre || !unidadMedida) {
      throw new IngredienteServiceError(
        400,
        'El nombre y la unidad de medida son obligatorios.'
      )
    }

    const disponible = body.disponible !== undefined ? Boolean(body.disponible) : true

    return await this.ingredienteRepo.crear({
      nombre,
      unidadMedida,
      disponible
    })
  }

  /**
   * Valida reglas de negocio y actualiza los campos de un ingrediente existente
   */
  async actualizarIngrediente(
    id: string,
    body: IngredienteInputDTO
  ): Promise<IIngrediente> {
    const existente = await this.ingredienteRepo.buscarPorId(id)
    if (!existente) {
      throw new IngredienteServiceError(404, 'Ingrediente no encontrado')
    }

    const update: IngredienteActualizarDatos = {}
    if (body.nombre !== undefined) update.nombre = String(body.nombre).trim()
    if (body.unidadMedida !== undefined) update.unidadMedida = String(body.unidadMedida).trim()
    if (body.disponible !== undefined) update.disponible = Boolean(body.disponible)

    const actualizado = await this.ingredienteRepo.actualizar(id, update)
    if (!actualizado) {
      throw new IngredienteServiceError(404, 'Ingrediente no encontrado')
    }

    return actualizado
  }

  /**
   * Elimina un ingrediente por su identificador único
   */
  async eliminarIngrediente(id: string): Promise<void> {
    const eliminado = await this.ingredienteRepo.eliminar(id)
    if (!eliminado) {
      throw new IngredienteServiceError(404, 'Ingrediente no encontrado')
    }
  }
}

export const ingredienteService = new IngredienteService()
