// src/services/plato.service.ts
import { Types } from 'mongoose'
import { PlatoRepository } from '../repositories/plato.repo'
import { RecetaRepository, recetaRepository } from '../repositories/receta.repo'
import { eliminarDeCloudinary } from '../configs/cloudinary'

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
  categoria: any
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

  private toDTO(p: any): PlatoResponseDTO {
    const raw =
      p && typeof p.toObject === 'function'
        ? p.toObject()
        : p && p._doc
          ? p._doc
          : p || {}
    const id = raw._id ? raw._id.toString() : raw.id ? raw.id.toString() : ''

    let categoria = raw.categoria
    if (categoria) {
      const catRaw =
        typeof categoria.toObject === 'function'
          ? categoria.toObject()
          : categoria._doc || categoria

      const esPoblado =
        catRaw &&
        typeof catRaw === 'object' &&
        !(catRaw instanceof Types.ObjectId) &&
        typeof catRaw.nombre === 'string'

      if (esPoblado) {
        const catId = catRaw._id ? catRaw._id.toString() : catRaw.id ? catRaw.id.toString() : ''
        categoria = {
          id: catId,
          _id: catId,
          nombre: catRaw.nombre,
          createdAt: catRaw.createdAt,
          updatedAt: catRaw.updatedAt
        }
      } else {
        const catId =
          catRaw && (catRaw._id || catRaw.id)
            ? (catRaw._id || catRaw.id).toString()
            : categoria.toString()
        categoria = catId
      }
    }

    return {
      id,
      _id: id,
      nombre: raw.nombre || '',
      descripcion: raw.descripcion || '',
      precio: Number(raw.precio || 0),
      imagenUrl: raw.imagenUrl || '',
      imagenPublicId: raw.imagenPublicId || '',
      disponible: raw.disponible !== undefined ? Boolean(raw.disponible) : true,
      categoria,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    }
  }

  /**
   * Valida reglas de negocio y crea un nuevo plato
   */
  async crearPlato(datos: any): Promise<PlatoResponseDTO> {
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
        if (ing.cantidadNecesaria <= 0) {
          throw new Error('La cantidad necesaria debe ser mayor a 0')
        }
        const ingId = String(ing.ingrediente)
        if (uniqueIds.has(ingId)) {
          throw new Error('No se puede duplicar el mismo ingrediente en la receta')
        }
        uniqueIds.add(ingId)
      }

      const IngredienteModel = mongoose.model('Ingrediente')
      const foundIngredients = await IngredienteModel.find({ _id: { $in: Array.from(uniqueIds) } }).session(session)
      if (foundIngredients.length !== uniqueIds.size) {
        throw new Error('Uno o más ingredientes especificados no existen')
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
    let filtro: Record<string, any> = {}
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
  async actualizarPlato(id: string, datos: any): Promise<PlatoResponseDTO> {
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
