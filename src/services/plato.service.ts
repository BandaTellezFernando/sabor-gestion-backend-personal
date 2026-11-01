// src/services/plato.service.ts
import mongoose, { Types, ClientSession, QueryFilter } from 'mongoose'
import PlatoModel, { IPlato } from '../models/Plato'
import RecetaModel from '../models/Receta'
import IngredienteModel, { IIngrediente } from '../models/Ingrediente'
import { PlatoRepository } from '../repositories/plato.repo'
import { toIdString, toOptionalDate, toPlainRecord, toText } from '../utils/mongoosePlain'
import {
  RecetaRepository,
  recetaRepository,
  IRecetaIngredienteInput
} from '../repositories/receta.repo'
import { eliminarDeCloudinary } from '../configs/cloudinary'
import {
  esUnidadMedida,
  obtenerFamiliaUnidad,
  validarCantidadParaUnidad,
} from '../utils/unidades'

export class PlatoServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PlatoServiceError'
  }
}

export interface CategoriaPlatoDTO {
  id: string
  _id: string
  nombre: string
  createdAt?: Date
  updatedAt?: Date
}

export interface PlatoIngredienteInputDTO {
  ingrediente: string | Types.ObjectId
  cantidadNecesaria: number | string
  unidadMedida: string
}

export interface PlatoCrearDTO {
  nombre: string
  descripcion: string
  precio: number
  imagenUrl?: string
  imagenPublicId?: string
  categoria: string | Types.ObjectId
  ingredientes?: PlatoIngredienteInputDTO[]
}

export interface PlatoActualizarDTO {
  nombre?: string
  descripcion?: string
  precio?: number
  imagenUrl?: string
  imagenPublicId?: string
  disponible?: boolean
  categoria?: string | Types.ObjectId
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
  categoria: string | CategoriaPlatoDTO | null | undefined
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
    const raw = toPlainRecord(p)
    const id = toIdString(raw._id) ?? toIdString(raw.id) ?? ''

    const categoriaValor = raw.categoria
    let categoria: PlatoResponseDTO['categoria'] =
      categoriaValor === null ? null : undefined

    if (categoriaValor) {
      const catRaw = toPlainRecord(categoriaValor)
      const esPoblado =
        !(categoriaValor instanceof Types.ObjectId) &&
        typeof catRaw.nombre === 'string'

      if (esPoblado) {
        const catId = toIdString(catRaw._id) ?? toIdString(catRaw.id) ?? ''
        categoria = {
          id: catId,
          _id: catId,
          nombre: toText(catRaw.nombre),
          createdAt: toOptionalDate(catRaw.createdAt),
          updatedAt: toOptionalDate(catRaw.updatedAt)
        }
      } else {
        categoria = toIdString(catRaw._id) ??
          toIdString(catRaw.id) ??
          toIdString(categoriaValor) ??
          ''
      }
    }

    return {
      id,
      _id: id,
      nombre: toText(raw.nombre),
      descripcion: toText(raw.descripcion),
      precio: Number(raw.precio || 0),
      imagenUrl: toText(raw.imagenUrl),
      imagenPublicId: toText(raw.imagenPublicId),
      disponible: raw.disponible !== undefined ? Boolean(raw.disponible) : true,
      categoria,
      createdAt: toOptionalDate(raw.createdAt),
      updatedAt: toOptionalDate(raw.updatedAt)
    }
  }

  /**
   * Valida reglas de negocio y crea un nuevo plato
   */
  async crearPlato(datos: PlatoCrearDTO): Promise<PlatoResponseDTO> {
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
    let session: ClientSession
    try {
      session = await mongoose.startSession()
      session.startTransaction()
    } catch {
      throw new PlatoServiceError(500, 'El servidor MongoDB no soporta transacciones (requiere Replica Set). No se puede garantizar la creación atómica de Plato y Receta.')
    }

    let nuevoPlato: IPlato
    try {
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
      const uniqueIds = new Set<string>()
      const ingredientesNormalizados: IRecetaIngredienteInput[] = []
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
        ingredientesNormalizados.push({
          ingrediente: ing.ingrediente,
          cantidadNecesaria: cantidad,
          unidadMedida: ing.unidadMedida
        })
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
        ingredientes: ingredientesNormalizados
      }], { session })

      await session.commitTransaction()
    } catch (error) {
      await session.abortTransaction()
      throw new PlatoServiceError(400, error instanceof Error ? error.message : 'Error al crear plato y receta')
    } finally {
      session.endSession()
    }

    const platoCreado = await this.platoRepo.buscarPorId(nuevoPlato._id.toString())
    return this.toDTO(platoCreado)
  }

  /**
   * Obtiene la lista de platos con filtros opcionales (ej: categoría)
   */
  async obtenerPlatos(category?: string): Promise<PlatoResponseDTO[]> {
    let filtro: QueryFilter<IPlato> = {}
    if (category) {
      filtro = { categoria: category }
    }
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
  async actualizarPlato(id: string, datos: PlatoActualizarDTO): Promise<PlatoResponseDTO> {
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
