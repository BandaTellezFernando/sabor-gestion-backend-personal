// src/services/receta.service.ts
import { Types } from 'mongoose'
import IngredienteModel, { IIngrediente } from '../models/Ingrediente'
import {
  RecetaRepository,
  recetaRepository,
  IRecetaIngredienteInput
} from '../repositories/receta.repo'
import { PlatoRepository, platoRepository } from '../repositories/plato.repo'
import {
  esUnidadMedida,
  obtenerFamiliaUnidad,
  validarCantidadParaUnidad,
} from '../utils/unidades'

type RegistroReceta = Record<string, unknown>

export interface PlatoRecetaResumenDTO {
  id: string
  _id: string
  nombre: string
  precio?: number
  createdAt?: Date
  updatedAt?: Date
}

export interface IngredienteRecetaResumenDTO {
  id: string
  _id: string
  nombre: string
  unidadMedida: string
  disponible: boolean
}

export interface IngredienteRecetaResponseDTO {
  ingrediente:
    | string
    | IngredienteRecetaResumenDTO
    | null
    | undefined
  cantidadNecesaria: number
  unidadMedida: string
}

function esRegistroReceta(valor: unknown): valor is RegistroReceta {
  return typeof valor === 'object' && valor !== null
}

function aRegistroReceta(valor: unknown): RegistroReceta {
  if (!esRegistroReceta(valor)) return {}

  const documento = valor as RegistroReceta & {
    toObject?: () => unknown
    _doc?: unknown
  }

  if (typeof documento.toObject === 'function') {
    const plano = documento.toObject()
    if (esRegistroReceta(plano)) return plano
  }

  if (esRegistroReceta(documento._doc)) return documento._doc
  return documento
}

function aIdReceta(valor: unknown): string {
  if (typeof valor === 'string') return valor
  if (typeof valor === 'number') return String(valor)
  if (valor instanceof Types.ObjectId) return valor.toString()

  if (esRegistroReceta(valor) && typeof valor.toString === 'function') {
    return valor.toString()
  }

  return ''
}

function aFechaReceta(valor: unknown): Date | undefined {
  return valor instanceof Date ? valor : undefined
}

function aTextoReceta(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

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
  plato: string | PlatoRecetaResumenDTO | null | undefined
  ingredientes: IngredienteRecetaResponseDTO[]
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
    const raw = aRegistroReceta(r)
    const id = aIdReceta(raw._id) || aIdReceta(raw.id)

    let plato: RecetaResponseDTO['plato'] =
      raw.plato === undefined
        ? undefined
        : raw.plato === null
          ? null
          : typeof raw.plato === 'string'
            ? raw.plato
            : undefined

    const platoValor = raw.plato
    if (platoValor) {
      const platoRaw = aRegistroReceta(platoValor)
      const esPlatoPoblado =
        !(platoValor instanceof Types.ObjectId) &&
        typeof platoRaw.nombre === 'string'

      if (esPlatoPoblado) {
        const platoId =
          aIdReceta(platoRaw._id) || aIdReceta(platoRaw.id)

        plato = {
          id: platoId,
          _id: platoId,
          nombre: aTextoReceta(platoRaw.nombre),
          precio:
            platoRaw.precio !== undefined
              ? Number(platoRaw.precio)
              : undefined,
          createdAt: aFechaReceta(platoRaw.createdAt),
          updatedAt: aFechaReceta(platoRaw.updatedAt)
        }
      } else {
        plato =
          aIdReceta(platoRaw._id) ||
          aIdReceta(platoRaw.id) ||
          aIdReceta(platoValor)
      }
    }

    const ingredientes: IngredienteRecetaResponseDTO[] =
      Array.isArray(raw.ingredientes)
        ? raw.ingredientes.map((item: unknown) => {
            const itemRaw = aRegistroReceta(item)
            const ingredienteValor = itemRaw.ingrediente

            let ingrediente: IngredienteRecetaResponseDTO['ingrediente'] =
              ingredienteValor === undefined
                ? undefined
                : ingredienteValor === null
                  ? null
                  : ''

            if (ingredienteValor) {
              const ingRaw = aRegistroReceta(ingredienteValor)
              const esIngredientePoblado =
                !(ingredienteValor instanceof Types.ObjectId) &&
                typeof ingRaw.nombre === 'string'

              if (esIngredientePoblado) {
                const ingId =
                  aIdReceta(ingRaw._id) || aIdReceta(ingRaw.id)

                ingrediente = {
                  id: ingId,
                  _id: ingId,
                  nombre: aTextoReceta(ingRaw.nombre),
                  unidadMedida: aTextoReceta(ingRaw.unidadMedida),
                  disponible:
                    ingRaw.disponible !== undefined
                      ? Boolean(ingRaw.disponible)
                      : true
                }
              } else {
                ingrediente =
                  aIdReceta(ingRaw._id) ||
                  aIdReceta(ingRaw.id) ||
                  aIdReceta(ingredienteValor)
              }
            }

            return {
              ingrediente,
              cantidadNecesaria: Number(itemRaw.cantidadNecesaria || 0),
              unidadMedida: aTextoReceta(itemRaw.unidadMedida)
            }
          })
        : []

    return {
      id,
      _id: id,
      plato,
      ingredientes,
      createdAt: aFechaReceta(raw.createdAt),
      updatedAt: aFechaReceta(raw.updatedAt)
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

    // Validar existencia de ingredientes
    // Import ingredienteRepo to do this (I will just use mongoose.model)
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
