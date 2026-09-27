// src/repositories/categoria.repo.ts
import Categoria, { ICategoria } from '../models/Categoria'
export { ICategoria } from '../models/Categoria'

export class CategoriaRepository {
  /**
   * Obtiene todas las categorías de la base de datos
   */
  async buscarTodos(): Promise<ICategoria[]> {
    return await Categoria.find()
  }

  /**
   * Busca una categoría por su identificador único (_id)
   */
  async buscarPorId(id: string): Promise<ICategoria | null> {
    return await Categoria.findById(id)
  }

  /**
   * Busca una categoría por coincidencia de nombre insensible a mayúsculas/minúsculas.
   * Opcionalmente excluye un _id específico para validaciones al actualizar.
   */
  async buscarPorNombre(nombre: string, excluirId?: string): Promise<ICategoria | null> {
    const escaped = nombre.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const filtro: any = {
      nombre: { $regex: new RegExp(`^${escaped}$`, 'i') }
    }
    if (excluirId) {
      filtro._id = { $ne: excluirId }
    }
    return await Categoria.findOne(filtro)
  }

  /**
   * Crea y guarda una nueva categoría en MongoDB
   */
  async crear(datos: { nombre: string; [key: string]: any }): Promise<ICategoria> {
    const nuevaCategoria = new Categoria(datos)
    return await nuevaCategoria.save()
  }

  /**
   * Actualiza los datos de una categoría por su identificador
   */
  async actualizar(
    id: string,
    datos: { nombre: string; [key: string]: any }
  ): Promise<ICategoria | null> {
    return await Categoria.findByIdAndUpdate(id, datos, { returnDocument: 'after' })
  }

  /**
   * Elimina una categoría por su identificador
   */
  async eliminar(id: string): Promise<ICategoria | null> {
    return await Categoria.findByIdAndDelete(id)
  }
}

export const categoriaRepository = new CategoriaRepository()
