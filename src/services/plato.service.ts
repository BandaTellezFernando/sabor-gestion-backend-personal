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
    const { nombre, descripcion, precio, imagenUrl, imagenPublicId, categoria } = datos

    if (!imagenUrl || !imagenPublicId) {
      throw new PlatoServiceError(
        400,
        'Se requiere subir una imagen primero usando POST /api/upload'
      )
    }

    const nuevoPlato = await this.platoRepo.crear({
      nombre,
      descripcion,
      precio,
      imagenUrl,
      imagenPublicId,
      categoria
    })
    return this.toDTO(nuevoPlato)
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
