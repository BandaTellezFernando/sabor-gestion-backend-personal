// src/services/categoria.service.ts
import { CategoriaRepository, ICategoria } from '../repositories/categoria.repo'

export class CategoriaServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'CategoriaServiceError'
  }
}

export interface CategoriaResponseDTO {
  id: string
  _id: string
  nombre: string
  createdAt?: Date
  updatedAt?: Date
}

export class CategoriaService {
  private categoriaRepo: CategoriaRepository

  constructor(categoriaRepo?: CategoriaRepository) {
    this.categoriaRepo = categoriaRepo || new CategoriaRepository()
  }

  private toDTO(c: any): CategoriaResponseDTO {
    const raw =
      c && typeof c.toObject === 'function'
        ? c.toObject()
        : c && c._doc
          ? c._doc
          : c || {}
    const id = raw._id ? raw._id.toString() : raw.id ? raw.id.toString() : ''
    return {
      id,
      _id: id,
      nombre: raw.nombre || '',
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    }
  }

  /**
   * Obtiene todas las categorías registradas
   */
  async obtenerCategorias(): Promise<CategoriaResponseDTO[]> {
    const categorias = await this.categoriaRepo.buscarTodos()
    return categorias.map((c) => this.toDTO(c))
  }

  /**
   * Obtiene una categoría por su identificador
   */
  async obtenerCategoriaPorId(id: string): Promise<CategoriaResponseDTO> {
    const categoria = await this.categoriaRepo.buscarPorId(id)
    if (!categoria) {
      throw new CategoriaServiceError(404, 'Categoría no encontrada')
    }
    return this.toDTO(categoria)
  }

  /**
   * Valida las reglas de negocio y crea una nueva categoría
   */
  async crearCategoria(datos: { nombre?: string; [key: string]: any }): Promise<CategoriaResponseDTO> {
    const { nombre } = datos

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      throw new CategoriaServiceError(
        400,
        'El nombre de la categoría es requerido. Ejemplo: "Bebidas"'
      )
    }

    const regexValido = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/
    if (!regexValido.test(nombre)) {
      throw new CategoriaServiceError(
        400,
        'El nombre solo debe contener letras y espacios. Ejemplo: "Postres"'
      )
    }

    const nombreNormalizado = nombre.trim()
    const categoriaExistente = await this.categoriaRepo.buscarPorNombre(nombreNormalizado)

    if (categoriaExistente) {
      throw new CategoriaServiceError(400, 'Ya existe una categoría con ese nombre')
    }

    const nuevaCategoria = await this.categoriaRepo.crear({
      ...datos,
      nombre: nombreNormalizado
    })
    return this.toDTO(nuevaCategoria)
  }

  /**
   * Valida las reglas de negocio y actualiza una categoría existente
   */
  async actualizarCategoria(
    id: string,
    datos: { nombre?: string; [key: string]: any }
  ): Promise<CategoriaResponseDTO> {
    const { nombre } = datos

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      throw new CategoriaServiceError(
        400,
        'El nombre de la categoría es requerido. Ejemplo: "Bebidas"'
      )
    }

    const regexValido = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/
    if (!regexValido.test(nombre)) {
      throw new CategoriaServiceError(
        400,
        'El nombre solo debe contener letras y espacios. Ejemplo: "Postres"'
      )
    }

    const nombreNormalizado = nombre.trim()
    const categoriaExistente = await this.categoriaRepo.buscarPorNombre(nombreNormalizado, id)

    if (categoriaExistente) {
      throw new CategoriaServiceError(400, 'Ya existe otra categoría con ese nombre')
    }

    const categoriaActualizada = await this.categoriaRepo.actualizar(id, {
      nombre: nombreNormalizado
    })

    if (!categoriaActualizada) {
      throw new CategoriaServiceError(404, 'Categoría no encontrada')
    }

    return this.toDTO(categoriaActualizada)
  }

  /**
   * Elimina una categoría por su identificador
   */
  async eliminarCategoria(id: string): Promise<void> {
    const categoriaEliminada = await this.categoriaRepo.eliminar(id)

    if (!categoriaEliminada) {
      throw new CategoriaServiceError(404, 'Categoría no encontrada')
    }
  }
}

export const categoriaService = new CategoriaService()
