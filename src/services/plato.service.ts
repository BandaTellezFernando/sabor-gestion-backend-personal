// src/services/plato.service.ts
import { PlatoRepository, IPlato } from '../repositories/plato.repo'
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

export class PlatoService {
  private platoRepo: PlatoRepository

  constructor(platoRepo?: PlatoRepository) {
    this.platoRepo = platoRepo || new PlatoRepository()
  }

  /**
   * Valida reglas de negocio y crea un nuevo plato
   */
  async crearPlato(datos: any): Promise<IPlato> {
    const { nombre, descripcion, precio, imagenUrl, imagenPublicId, categoria } = datos

    if (!imagenUrl || !imagenPublicId) {
      throw new PlatoServiceError(
        400,
        'Se requiere subir una imagen primero usando POST /api/upload'
      )
    }

    return await this.platoRepo.crear({
      nombre,
      descripcion,
      precio,
      imagenUrl,
      imagenPublicId,
      categoria
    })
  }

  /**
   * Obtiene la lista de platos con filtros opcionales (ej: categoría)
   */
  async obtenerPlatos(category?: string): Promise<IPlato[]> {
    let filtro: Record<string, any> = {}
    if (category) {
      filtro = { categoria: category }
    }
    return await this.platoRepo.buscarTodos(filtro)
  }

  /**
   * Obtiene el detalle de un plato por su ID
   */
  async obtenerPlatoPorId(id: string): Promise<IPlato> {
    const plato = await this.platoRepo.buscarPorIdConCategoria(id)
    if (!plato) {
      throw new PlatoServiceError(404, 'Plato no encontrado')
    }
    return plato
  }

  /**
   * Actualiza los datos de un plato y limpia la imagen anterior en Cloudinary si fue sustituida
   */
  async actualizarPlato(id: string, datos: any): Promise<IPlato> {
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

    return platoActualizado
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

    await this.platoRepo.eliminar(id)
  }
}

export const platoService = new PlatoService()
