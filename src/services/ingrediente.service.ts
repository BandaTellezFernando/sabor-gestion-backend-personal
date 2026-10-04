// src/services/ingrediente.service.ts
import {
  IngredienteRepository,
  ingredienteRepository,
  IngredienteActualizarDatos
} from '../repositories/ingrediente.repo'
import { RecetaRepository, recetaRepository } from '../repositories/receta.repo'

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

export interface IngredienteResponseDTO {
  id: string
  _id: string
  nombre: string
  unidadMedida: string
  disponible: boolean
  fechaRegistro?: Date
  createdAt?: Date
  updatedAt?: Date
}

export class IngredienteService {
  private ingredienteRepo: IngredienteRepository
  private recetaRepo: RecetaRepository

  constructor(
    ingredienteRepo?: IngredienteRepository,
    recetaRepo?: RecetaRepository
  ) {
    this.ingredienteRepo = ingredienteRepo || ingredienteRepository
    this.recetaRepo = recetaRepo || recetaRepository
  }

  private toDTO(i: any): IngredienteResponseDTO {
    const raw =
      i && typeof i.toObject === 'function'
        ? i.toObject()
        : i && i._doc
          ? i._doc
          : i || {}
    const id = raw._id ? raw._id.toString() : raw.id ? raw.id.toString() : ''
    return {
      id,
      _id: id,
      nombre: raw.nombre || '',
      unidadMedida: raw.unidadMedida || '',
      disponible: raw.disponible !== undefined ? Boolean(raw.disponible) : true,
      fechaRegistro: raw.fechaRegistro,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    }
  }

  /**
   * Obtiene todos los ingredientes ordenados alfabéticamente
   */
  async obtenerIngredientes(): Promise<IngredienteResponseDTO[]> {
    const ingredientes = await this.ingredienteRepo.buscarTodos()
    return ingredientes.map((i) => this.toDTO(i))
  }

  /**
   * Obtiene un ingrediente por su identificador único
   */
  async obtenerIngredientePorId(id: string): Promise<IngredienteResponseDTO> {
    const ingrediente = await this.ingredienteRepo.buscarPorId(id)
    if (!ingrediente) {
      throw new IngredienteServiceError(404, 'Ingrediente no encontrado')
    }
    return this.toDTO(ingrediente)
  }

  /**
   * Valida reglas de negocio y crea un nuevo ingrediente con disponibilidad booleana
   */
  async crearIngrediente(body: IngredienteInputDTO): Promise<IngredienteResponseDTO> {
    const nombre = body.nombre ? String(body.nombre).trim() : ''
    const unidadMedida = body.unidadMedida ? String(body.unidadMedida).trim() : ''

    if (!nombre || !unidadMedida) {
      throw new IngredienteServiceError(
        400,
        'El nombre y la unidad de medida son obligatorios.'
      )
    }

    const duplicado = await this.ingredienteRepo.buscarPorNombre(nombre)
    if (duplicado) {
      throw new IngredienteServiceError(
        400,
        'Ya existe un ingrediente con ese nombre.'
      )
    }

    const disponible = body.disponible !== undefined ? Boolean(body.disponible) : true

    const nuevoIngrediente = await this.ingredienteRepo.crear({
      nombre,
      unidadMedida,
      disponible
    })
    return this.toDTO(nuevoIngrediente)
  }

  /**
   * Valida reglas de negocio y actualiza los campos de un ingrediente existente
   */
  async actualizarIngrediente(
    id: string,
    body: IngredienteInputDTO
  ): Promise<IngredienteResponseDTO> {
    const existente = await this.ingredienteRepo.buscarPorId(id)
    if (!existente) {
      throw new IngredienteServiceError(404, 'Ingrediente no encontrado')
    }

    const update: IngredienteActualizarDatos = {}
    if (body.nombre !== undefined) {
      const nombreNormalizado = String(body.nombre).trim()
      if (!nombreNormalizado) {
        throw new IngredienteServiceError(
          400,
          'El nombre del ingrediente no puede estar vacío.'
        )
      }
      const duplicado = await this.ingredienteRepo.buscarPorNombre(nombreNormalizado)
      const duplicadoId = duplicado ? (duplicado._id ? duplicado._id.toString() : (duplicado as any).id) : null
      if (duplicado && duplicadoId !== id) {
        throw new IngredienteServiceError(
          400,
          'Ya existe otro ingrediente con ese nombre.'
        )
      }
      update.nombre = nombreNormalizado
    }
    if (body.unidadMedida !== undefined) update.unidadMedida = String(body.unidadMedida).trim()
    if (body.disponible !== undefined) update.disponible = Boolean(body.disponible)

    const actualizado = await this.ingredienteRepo.actualizar(id, update)
    if (!actualizado) {
      throw new IngredienteServiceError(404, 'Ingrediente no encontrado')
    }

    return this.toDTO(actualizado)
  }

  /**
   * Elimina un ingrediente por su identificador único
   */
  async eliminarIngrediente(id: string): Promise<void> {
    const recetasCount = await this.recetaRepo.contarPorIngredienteId(id)
    if (recetasCount > 0) {
      throw new IngredienteServiceError(
        400,
        'No se puede eliminar el ingrediente porque está asociado a una o más recetas.'
      )
    }

    const eliminado = await this.ingredienteRepo.eliminar(id)
    if (!eliminado) {
      throw new IngredienteServiceError(404, 'Ingrediente no encontrado')
    }
  }
}

export const ingredienteService = new IngredienteService()
