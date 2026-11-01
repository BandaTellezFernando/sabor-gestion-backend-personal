// src/services/receta.service.ts
import { Types } from 'mongoose'
import IngredienteModel, { IIngrediente } from '../models/Ingrediente'
import {
  RecetaRepository,
  recetaRepository,
  IRecetaIngredienteInput
} from '../repositories/receta.repo'
import { PlatoRepository, platoRepository } from '../repositories/plato.repo'
import { toIdString, toOptionalDate, toPlainRecord, toText } from '../utils/mongoosePlain'
import {
  esUnidadMedida,
  obtenerFamiliaUnidad,
  validarCantidadParaUnidad,
} from '../utils/unidades'

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

export interface PlatoRecetaPobladoDTO {
  id: string
  _id: string
  nombre: string
  precio?: number
  createdAt?: Date
  updatedAt?: Date
}

export interface IngredienteRecetaPobladoDTO {
  id: string
  _id: string
  nombre: string
  unidadMedida: string
  disponible: boolean
}

export interface RecetaIngredienteResponseDTO {
  ingrediente: string | IngredienteRecetaPobladoDTO | null | undefined
  cantidadNecesaria: number
  unidadMedida: string
}

export interface RecetaResponseDTO {
  id: string
  _id: string
  plato: string | PlatoRecetaPobladoDTO | null | undefined
  ingredientes: RecetaIngredienteResponseDTO[]
  createdAt?: Date
  updatedAt?: Date
}

export interface ResultadoGuardarReceta {
  accion: 'actualizada'
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

  private toDTO(r: unknown): RecetaResponseDTO {
    const raw = toPlainRecord(r)
    const id = toIdString(raw._id) ?? toIdString(raw.id) ?? ''

    let plato: RecetaResponseDTO['plato'] =
      raw.plato === null ? null : undefined

    if (raw.plato) {
      const platoRaw = toPlainRecord(raw.plato)
      const esPlatoPoblado =
        !(raw.plato instanceof Types.ObjectId) &&
        typeof platoRaw.nombre === 'string'

      if (esPlatoPoblado) {
        const platoId = toIdString(platoRaw._id) ?? toIdString(platoRaw.id) ?? ''
        plato = {
          id: platoId,
          _id: platoId,
          nombre: toText(platoRaw.nombre),
          precio:
            platoRaw.precio !== undefined
              ? Number(platoRaw.precio)
              : undefined,
          createdAt: toOptionalDate(platoRaw.createdAt),
          updatedAt: toOptionalDate(platoRaw.updatedAt)
        }
      } else {
        plato =
          toIdString(platoRaw._id) ??
          toIdString(platoRaw.id) ??
          toIdString(raw.plato) ??
          ''
      }
    }

    const ingredientes = Array.isArray(raw.ingredientes)
      ? (raw.ingredientes as unknown[]).map((item: unknown) => {
          const itemRaw = toPlainRecord(item)
          let ingrediente: RecetaIngredienteResponseDTO['ingrediente'] =
            itemRaw.ingrediente === null ? null : undefined

          if (itemRaw.ingrediente) {
            const ingredienteRaw = toPlainRecord(itemRaw.ingrediente)
            const esIngredientePoblado =
              !(itemRaw.ingrediente instanceof Types.ObjectId) &&
              typeof ingredienteRaw.nombre === 'string'

            if (esIngredientePoblado) {
              const ingredienteId =
                toIdString(ingredienteRaw._id) ??
                toIdString(ingredienteRaw.id) ??
                ''
              ingrediente = {
                id: ingredienteId,
                _id: ingredienteId,
                nombre: toText(ingredienteRaw.nombre),
                unidadMedida: toText(ingredienteRaw.unidadMedida),
                disponible:
                  ingredienteRaw.disponible !== undefined
                    ? Boolean(ingredienteRaw.disponible)
                    : true
              }
            } else {
              ingrediente =
                toIdString(ingredienteRaw._id) ??
                toIdString(ingredienteRaw.id) ??
                toIdString(itemRaw.ingrediente) ??
                ''
            }
          }

          return {
            ingrediente,
            cantidadNecesaria: Number(itemRaw.cantidadNecesaria || 0),
            unidadMedida: toText(itemRaw.unidadMedida)
          }
        })
      : []

    return {
      id,
      _id: id,
      plato,
      ingredientes,
      createdAt: toOptionalDate(raw.createdAt),
      updatedAt: toOptionalDate(raw.updatedAt)
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

    // Validar cantidades, unidades y duplicados.
    const uniqueIds = new Set<string>()
    for (const ing of ingredientes) {
      if (!ing || typeof ing !== 'object') {
        throw new RecetaServiceError(400, 'Cada ingrediente de la receta debe ser válido.')
      }
      const cantidad = Number(ing.cantidadNecesaria)
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw new RecetaServiceError(400, 'La cantidad necesaria debe ser finita y mayor a 0.')
      }
      if (!esUnidadMedida(ing.unidadMedida)) {
        throw new RecetaServiceError(400, 'Cada ingrediente debe tener una unidad válida: kg, g, mg, L, ml o unidad.')
      }
      if (!validarCantidadParaUnidad(cantidad, ing.unidadMedida)) {
        throw new RecetaServiceError(400, 'La cantidad no es válida para su unidad; las unidades contables deben ser enteras.')
      }
      ing.cantidadNecesaria = cantidad
      const ingId = String(ing.ingrediente)
      if (uniqueIds.has(ingId)) {
        throw new RecetaServiceError(400, 'No se puede duplicar el mismo ingrediente en la receta')
      }
      uniqueIds.add(ingId)
    }

    // Validar existencia de ingredientes usando el modelo tipado.
    const foundIngredients = await IngredienteModel.find({
      _id: { $in: Array.from(uniqueIds) }
    })
    if (foundIngredients.length !== uniqueIds.size) {
      throw new RecetaServiceError(404, 'Uno o más ingredientes especificados no existen')
    }

    const ingredientesPorId = new Map<string, IIngrediente>()
    for (const ingrediente of foundIngredients) {
      ingredientesPorId.set(String(ingrediente._id), ingrediente)
    }
    for (const ing of ingredientes) {
      const ingrediente = ingredientesPorId.get(String(ing.ingrediente))
      if (!ingrediente) {
        throw new RecetaServiceError(404, 'Uno o más ingredientes especificados no existen')
      }
      const familiaStock = obtenerFamiliaUnidad(String(ingrediente.unidadMedida || ''))
      const familiaReceta = obtenerFamiliaUnidad(ing.unidadMedida)
      if (!familiaStock || familiaStock !== familiaReceta) {
        throw new RecetaServiceError(
          400,
          `La unidad ${ing.unidadMedida} no es compatible con el stock (${ingrediente.unidadMedida}) del ingrediente ${ingrediente.nombre}.`,
        )
      }
    }

    const platoExiste = await this.platoRepo.buscarPorId(String(plato))
    if (!platoExiste) {
      throw new RecetaServiceError(
        404,
        'El plato indicado no existe en la base de datos.'
      )
    }

    const recetaExistente = await this.recetaRepo.buscarPorPlatoId(String(plato))
    if (!recetaExistente) {
      throw new RecetaServiceError(
        404,
        'El plato no tiene una receta registrada. La receta se crea al registrar el plato.',
      )
    }

    const recetaActualizada = await this.recetaRepo.actualizarIngredientes(
      recetaExistente._id.toString(),
      ingredientes
    )
    return {
      accion: 'actualizada',
      receta: this.toDTO(recetaActualizada || recetaExistente)
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
