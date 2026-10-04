// src/services/receta.service.ts
import { Types } from 'mongoose'
import {
  RecetaRepository,
  recetaRepository,
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

export interface RecetaResponseDTO {
  id: string
  _id: string
  plato: any
  ingredientes: any[]
  createdAt?: Date
  updatedAt?: Date
}

export interface ResultadoGuardarReceta {
  accion: 'creada' | 'actualizada'
  receta: RecetaResponseDTO
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

  private toDTO(r: any): RecetaResponseDTO {
    const raw =
      r && typeof r.toObject === 'function'
        ? r.toObject()
        : r && r._doc
          ? r._doc
          : r || {}
    const id = raw._id ? raw._id.toString() : raw.id ? raw.id.toString() : ''

    let plato = raw.plato
    if (plato) {
      const platoRaw =
        typeof plato.toObject === 'function'
          ? plato.toObject()
          : plato._doc || plato

      const esPlatoPoblado =
        platoRaw &&
        typeof platoRaw === 'object' &&
        !(platoRaw instanceof Types.ObjectId) &&
        typeof platoRaw.nombre === 'string'

      if (esPlatoPoblado) {
        const platoId = platoRaw._id ? platoRaw._id.toString() : platoRaw.id ? platoRaw.id.toString() : ''
        plato = {
          id: platoId,
          _id: platoId,
          nombre: platoRaw.nombre,
          precio: platoRaw.precio !== undefined ? Number(platoRaw.precio) : undefined,
          createdAt: platoRaw.createdAt,
          updatedAt: platoRaw.updatedAt
        }
      } else {
        const platoId =
          platoRaw && (platoRaw._id || platoRaw.id)
            ? (platoRaw._id || platoRaw.id).toString()
            : plato.toString()
        plato = platoId
      }
    }

    const ingredientes = Array.isArray(raw.ingredientes)
      ? raw.ingredientes.map((item: any) => {
          const itemRaw =
            item && typeof item.toObject === 'function'
              ? item.toObject()
              : item && item._doc
                ? item._doc
                : item || {}
          let ing = itemRaw.ingrediente
          if (ing) {
            const ingRaw =
              typeof ing.toObject === 'function'
                ? ing.toObject()
                : ing._doc || ing

            const esIngPoblado =
              ingRaw &&
              typeof ingRaw === 'object' &&
              !(ingRaw instanceof Types.ObjectId) &&
              typeof ingRaw.nombre === 'string'

            if (esIngPoblado) {
              const ingId = ingRaw._id ? ingRaw._id.toString() : ingRaw.id ? ingRaw.id.toString() : ''
              ing = {
                id: ingId,
                _id: ingId,
                nombre: ingRaw.nombre,
                unidadMedida: ingRaw.unidadMedida || '',
                disponible: ingRaw.disponible !== undefined ? Boolean(ingRaw.disponible) : true
              }
            } else {
              const ingId =
                ingRaw && (ingRaw._id || ingRaw.id)
                  ? (ingRaw._id || ingRaw.id).toString()
                  : ing.toString()
              ing = ingId
            }
          }
          return {
            ingrediente: ing,
            cantidadNecesaria: Number(itemRaw.cantidadNecesaria || 0)
          }
        })
      : []

    return {
      id,
      _id: id,
      plato,
      ingredientes,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    }
  }

  /**
   * Obtiene todas las recetas con sus platos e ingredientes asociados
   */
  async obtenerRecetas(): Promise<RecetaResponseDTO[]> {
    const recetas = await this.recetaRepo.buscarTodos()
    return recetas.map((r) => this.toDTO(r))
  }

  /**
   * Obtiene una receta por su identificador único
   */
  async obtenerRecetaPorId(id: string): Promise<RecetaResponseDTO> {
    const receta = await this.recetaRepo.buscarPorId(id)
    if (!receta) {
      throw new RecetaServiceError(404, 'Receta no encontrada')
    }
    return this.toDTO(receta)
  }

  /**
   * Obtiene la receta asociada a un plato específico
   */
  async obtenerRecetaPorPlato(platoId: string): Promise<RecetaResponseDTO> {
    const receta = await this.recetaRepo.buscarPorPlatoId(platoId)
    if (!receta) {
      throw new RecetaServiceError(404, 'Receta no encontrada')
    }
    return this.toDTO(receta)
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
        receta: this.toDTO(recetaActualizada || recetaExistente)
      }
    } else {
      const nuevaReceta = await this.recetaRepo.crear({
        plato,
        ingredientes
      })
      return {
        accion: 'creada',
        receta: this.toDTO(nuevaReceta)
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
