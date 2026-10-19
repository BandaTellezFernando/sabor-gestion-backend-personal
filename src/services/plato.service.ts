// src/services/plato.service.ts
import { Types } from 'mongoose'
import { PlatoRepository } from '../repositories/plato.repo'
import { RecetaRepository, recetaRepository, IRecetaIngredienteInput } from '../repositories/receta.repo'
import IngredienteModel, { IIngrediente } from '../models/Ingrediente'
import { eliminarDeCloudinary } from '../configs/cloudinary'
import {
  esUnidadMedida,
  obtenerFamiliaUnidad,
  validarCantidadParaUnidad,
} from '../utils/unidades'

type RegistroPlato = Record<string, unknown>

export interface CategoriaPlatoResponseDTO {
  id: string
  _id: string
  nombre: string
  createdAt?: Date
  updatedAt?: Date
}

export interface IngredientePlatoInput {
  ingrediente: string | Types.ObjectId
  cantidadNecesaria: number
  unidadMedida: string
}

export interface CrearPlatoDTO {
  nombre?: string
  descripcion?: string
  precio?: number
  imagenUrl?: string
  imagenPublicId?: string
  categoria?: string | Types.ObjectId
  ingredientes?: IRecetaIngredienteInput[]
}

export interface ActualizarPlatoDTO {
  nombre?: string
  descripcion?: string
  precio?: number
  imagenUrl?: string
  imagenPublicId?: string
  categoria?: string | Types.ObjectId
  disponible?: boolean
  [campo: string]: unknown
}

function esRegistroPlato(valor: unknown): valor is RegistroPlato {
  return typeof valor === 'object' && valor !== null
}

function aRegistroPlato(valor: unknown): RegistroPlato {
  if (!esRegistroPlato(valor)) return {}

  const documento = valor as RegistroPlato & {
    toObject?: () => unknown
    _doc?: unknown
  }

  if (typeof documento.toObject === 'function') {
    const plano = documento.toObject()
    if (esRegistroPlato(plano)) return plano
  }

  if (esRegistroPlato(documento._doc)) return documento._doc
  return documento
}

function aIdPlato(valor: unknown): string {
  if (typeof valor === 'string') return valor
  if (typeof valor === 'number') return String(valor)
  if (valor instanceof Types.ObjectId) return valor.toString()

  if (esRegistroPlato(valor) && typeof valor.toString === 'function') {
    return valor.toString()
  }

  return ''
}

function aFechaPlato(valor: unknown): Date | undefined {
  return valor instanceof Date ? valor : undefined
}

function aTextoPlato(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

export class PlatoServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PlatoServiceError'
  }
}

export interface PlatoResponseDTO {
  id: string
  _id: string
  nombre: string
  descripcion: string
  precio: number
  imagenUrl: string
  imagenPublicId: string
  disponible: boolean
  categoria: string | CategoriaPlatoResponseDTO | null | undefined
  createdAt?: Date
  updatedAt?: Date
}

export class PlatoService {
  private platoRepo: PlatoRepository
  private recetaRepo: RecetaRepository

  constructor(
    platoRepo?: PlatoRepository,
    recetaRepo?: RecetaRepository
  ) {
    this.platoRepo = platoRepo || new PlatoRepository()
    this.recetaRepo = recetaRepo || recetaRepository
  }

  private toDTO(p: unknown): PlatoResponseDTO {
    const raw = aRegistroPlato(p)
    const id = aIdPlato(raw._id) || aIdPlato(raw.id)

    let categoria: PlatoResponseDTO['categoria']
    const categoriaValor = raw.categoria

    if (categoriaValor === null) {
      categoria = null
    } else if (
      categoriaValor !== undefined &&
      categoriaValor !== ''
    ) {
      const catRaw = aRegistroPlato(categoriaValor)
      const esPoblada =
        !(categoriaValor instanceof Types.ObjectId) &&
        typeof catRaw.nombre === 'string'

      if (esPoblada) {
        const catId =
          aIdPlato(catRaw._id) || aIdPlato(catRaw.id)

        categoria = {
          id: catId,
          _id: catId,
          nombre: aTextoPlato(catRaw.nombre),
          createdAt: aFechaPlato(catRaw.createdAt),
          updatedAt: aFechaPlato(catRaw.updatedAt)
        }
      } else {
        categoria =
          aIdPlato(catRaw._id) ||
          aIdPlato(catRaw.id) ||
          aIdPlato(categoriaValor)
      }
    }

    return {
      id,
      _id: id,
      nombre: aTextoPlato(raw.nombre),
      descripcion: aTextoPlato(raw.descripcion),
      precio: Number(raw.precio || 0),
      imagenUrl: aTextoPlato(raw.imagenUrl),
      imagenPublicId: aTextoPlato(raw.imagenPublicId),
      disponible:
        raw.disponible !== undefined
          ? Boolean(raw.disponible)
          : true,
      categoria,
      createdAt: aFechaPlato(raw.createdAt),
      updatedAt: aFechaPlato(raw.updatedAt)
    }
  }

  /**
   * Valida reglas de negocio y crea un nuevo plato
   */
  async crearPlato(datos: CrearPlatoDTO): Promise<PlatoResponseDTO> {
    const { nombre, descripcion, precio, imagenUrl, imagenPublicId, categoria, ingredientes } = datos

    if (!imagenUrl || !imagenPublicId) {
      throw new PlatoServiceError(
        400,
        'Se requiere subir una imagen primero usando POST /api/upload'
      )
    }
    
    // REGLA: Un plato vendible debe tener una receta. Si no mandan ingredientes, no podemos crearlo con receta,
    // o al menos validamos. El prompt dice "NO permitir crear un Plato vendible sin Recipe válida."
    // Asumimos que los ingredientes vienen en la solicitud.
    if (!ingredientes || !Array.isArray(ingredientes) || ingredientes.length === 0) {
      throw new PlatoServiceError(400, 'Debe especificar los ingredientes (receta) para crear el plato')
    }

    // Usar sesión si es posible para asegurar consistencia
    const mongoose = require('mongoose')
    let session = null
    try {
      session = await mongoose.startSession()
      session.startTransaction()
    } catch {
      throw new PlatoServiceError(500, 'El servidor MongoDB no soporta transacciones (requiere Replica Set). No se puede garantizar la creación atómica de Plato y Receta.')
    }

    let nuevoPlato
    try {
      const PlatoModel = mongoose.model('Plato')
      const newPlatoArr = await PlatoModel.create([{
        nombre,
        descripcion,
        precio,
        imagenUrl,
        imagenPublicId,
        categoria
      }], { session })
      nuevoPlato = newPlatoArr[0]
      
      // We do manual validation and creation to use session
      const RecetaModel = mongoose.model('Receta')
      
      const uniqueIds = new Set<string>()
      for (const ing of ingredientes) {
        if (!ing || typeof ing !== 'object') {
          throw new Error('Cada ingrediente de la receta debe ser válido.')
        }
        const cantidad = Number(ing.cantidadNecesaria)
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          throw new Error('La cantidad necesaria debe ser finita y mayor a 0.')
        }
        if (!esUnidadMedida(ing.unidadMedida)) {
          throw new Error('Cada ingrediente debe tener una unidad válida: kg, g, mg, L, ml o unidad.')
        }
        if (!validarCantidadParaUnidad(cantidad, ing.unidadMedida)) {
          throw new Error('La cantidad no es válida para su unidad; las unidades contables deben ser enteras.')
        }
        ing.cantidadNecesaria = cantidad
        const ingId = String(ing.ingrediente)
        if (uniqueIds.has(ingId)) {
          throw new Error('No se puede duplicar el mismo ingrediente en la receta')
        }
        uniqueIds.add(ingId)
      }

      const foundIngredients = await IngredienteModel.find({ _id: { $in: Array.from(uniqueIds) } }).session(session)
      if (foundIngredients.length !== uniqueIds.size) {
        throw new Error('Uno o más ingredientes especificados no existen')
      }

      const ingredientesPorId = new Map<string, IIngrediente>()
      for (const ingrediente of foundIngredients) {
        ingredientesPorId.set(String(ingrediente._id), ingrediente)
      }
      for (const ing of ingredientes) {
        const ingrediente = ingredientesPorId.get(String(ing.ingrediente))
        if (!ingrediente) {
          throw new Error('Uno o más ingredientes especificados no existen')
        }
        const familiaStock = obtenerFamiliaUnidad(String(ingrediente.unidadMedida || ''))
        const familiaReceta = obtenerFamiliaUnidad(ing.unidadMedida)
        if (!familiaStock || familiaStock !== familiaReceta) {
          throw new Error(
            `La unidad ${ing.unidadMedida} no es compatible con el stock (${ingrediente.unidadMedida}) del ingrediente ${ingrediente.nombre}.`,
          )
        }
      }

      await RecetaModel.create([{
        plato: nuevoPlato._id,
        ingredientes
      }], { session })

      if (session) {
        await session.commitTransaction()
      }
    } catch (error) {
      if (session) {
        await session.abortTransaction()
      }
      throw new PlatoServiceError(400, error instanceof Error ? error.message : 'Error al crear plato y receta')
    } finally {
      if (session) {
        session.endSession()
      }
    }

    const platoCreado = await this.platoRepo.buscarPorId(nuevoPlato._id.toString())
    return this.toDTO(platoCreado)
  }

  /**
   * Obtiene la lista de platos con filtros opcionales (ej: categoría)
   */
  async obtenerPlatos(category?: string): Promise<PlatoResponseDTO[]> {
    const filtro: Record<string, string> = category
      ? { categoria: category }
      : {}
    const platos = await this.platoRepo.buscarTodos(filtro)
    return platos.map((p) => this.toDTO(p))
  }

  /**
   * Obtiene el detalle de un plato por su ID
   */
  async obtenerPlatoPorId(id: string): Promise<PlatoResponseDTO> {
    const plato = await this.platoRepo.buscarPorIdConCategoria(id)
    if (!plato) {
      throw new PlatoServiceError(404, 'Plato no encontrado')
    }
    return this.toDTO(plato)
  }

  /**
   * Actualiza los datos de un plato y limpia la imagen anterior en Cloudinary si fue sustituida
   */
  async actualizarPlato(id: string, datos: ActualizarPlatoDTO): Promise<PlatoResponseDTO> {
    const plato = await this.platoRepo.buscarPorId(id)
    if (!plato) {
      throw new PlatoServiceError(404, 'Plato no encontrado')
    }

    const { imagenUrl, imagenPublicId, ...resto } = datos

    // Si viene imagen nueva, eliminar la anterior de Cloudinary
    if (imagenPublicId && imagenPublicId !== plato.imagenPublicId && plato.imagenPublicId) {
      try {
        await eliminarDeCloudinary(plato.imagenPublicId)
      } catch (err) {
        console.error('Error al eliminar imagen previa de Cloudinary:', err)
      }
    }

    const platoActualizado = await this.platoRepo.actualizar(id, {
      ...resto,
      imagenUrl,
      imagenPublicId
    })

    if (!platoActualizado) {
      throw new PlatoServiceError(404, 'Plato no encontrado')
    }

    return this.toDTO(platoActualizado)
  }

  /**
   * Elimina un plato y su imagen asociada en Cloudinary
   */
  async eliminarPlato(id: string): Promise<void> {
    const plato = await this.platoRepo.buscarPorId(id)
    if (!plato) {
      throw new PlatoServiceError(404, 'Plato no encontrado')
    }

    // Eliminar imagen de Cloudinary antes de borrar el plato
    if (plato.imagenPublicId) {
      try {
        await eliminarDeCloudinary(plato.imagenPublicId)
      } catch (err) {
        console.error('Error al eliminar imagen de Cloudinary:', err)
      }
    }

    // Eliminar receta asociada (cascada)
    await this.recetaRepo.eliminarPorPlatoId(id)

    await this.platoRepo.eliminar(id)
  }
}

export const platoService = new PlatoService()
