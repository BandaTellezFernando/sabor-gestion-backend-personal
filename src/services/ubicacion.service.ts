// src/services/ubicacion.service.ts
import {
  UbicacionRepository,
  ubicacionRepository,
  IUbicacion
} from '../repositories/ubicacion.repo'

export class UbicacionServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public extra?: Record<string, any>
  ) {
    super(message)
    this.name = 'UbicacionServiceError'
  }
}

export interface UbicacionPayloadDTO {
  nombre?: string
  name?: string
  descripcion?: string
}

export interface UbicacionResponseDTO {
  id: string
  nombre: string
}

export class UbicacionService {
  private ubicacionRepo: UbicacionRepository

  constructor(ubicacionRepo?: UbicacionRepository) {
    this.ubicacionRepo = ubicacionRepo || ubicacionRepository
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private mapUbicacion(u: IUbicacion): UbicacionResponseDTO {
    return {
      id: String(u._id),
      nombre: u.nombre || u.name || ''
    }
  }

  /**
   * Obtiene todas las ubicaciones ordenadas alfabéticamente
   */
  async obtenerUbicaciones(): Promise<UbicacionResponseDTO[]> {
    const ubicaciones = await this.ubicacionRepo.buscarTodos()
    return ubicaciones.map((u) => this.mapUbicacion(u))
  }

  /**
   * Valida reglas de negocio y crea una nueva ubicación
   */
  async crearUbicacion(body: UbicacionPayloadDTO): Promise<UbicacionResponseDTO> {
    const finalName = (body.nombre || body.name || '').toString().trim()
    if (!finalName) {
      throw new UbicacionServiceError(400, 'Nombre de ubicación requerido')
    }

    let regex: RegExp
    try {
      regex = new RegExp(`^${this.escapeRegex(finalName)}$`, 'i')
    } catch (findErr: any) {
      throw new UbicacionServiceError(400, 'Nombre de ubicación inválido', {
        error: findErr.message || findErr
      })
    }

    const existente = await this.ubicacionRepo.buscarPorNombreOAlias(regex)
    if (existente) {
      throw new UbicacionServiceError(400, 'Ubicación ya existe', {
        ubicacion: this.mapUbicacion(existente)
      })
    }

    try {
      const nueva = await this.ubicacionRepo.crear({
        nombre: finalName,
        name: finalName,
        descripcion: body.descripcion
      })
      return this.mapUbicacion(nueva)
    } catch (err: any) {
      if (err && (err.code === 11000 || (err.code && err.code === 11000))) {
        throw new UbicacionServiceError(400, 'Ubicación ya existe (duplicada por índice)')
      }
      if (err && err.keyValue) {
        throw new UbicacionServiceError(400, 'Error creando ubicación', {
          detalle: err.keyValue
        })
      }
      throw err
    }
  }

  /**
   * Valida reglas de negocio y actualiza una ubicación existente
   */
  async actualizarUbicacion(
    id: string,
    body: UbicacionPayloadDTO
  ): Promise<UbicacionResponseDTO> {
    const finalName = (body.nombre || body.name || '').toString().trim()
    if (!finalName) {
      throw new UbicacionServiceError(400, 'Nombre de ubicación requerido')
    }

    const regex = new RegExp(`^${this.escapeRegex(finalName)}$`, 'i')
    const existente = await this.ubicacionRepo.buscarPorNombreOAlias(regex, id)
    if (existente) {
      throw new UbicacionServiceError(400, 'La ubicación ya existe')
    }

    const actualizada = await this.ubicacionRepo.actualizar(id, {
      nombre: finalName,
      name: finalName,
      descripcion: body.descripcion
    })

    if (!actualizada) {
      throw new UbicacionServiceError(404, 'Ubicación no encontrada')
    }

    return this.mapUbicacion(actualizada)
  }

  /**
   * Elimina una ubicación por su ID
   */
  async eliminarUbicacion(id: string): Promise<void> {
    const eliminada = await this.ubicacionRepo.eliminar(id)
    if (!eliminada) {
      throw new UbicacionServiceError(404, 'Ubicación no encontrada')
    }
  }
}

export const ubicacionService = new UbicacionService()
