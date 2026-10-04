// src/repositories/plato.repo.ts
import Plato, { IPlato } from '../models/Plato'
export { IPlato } from '../models/Plato'

export class PlatoRepository {
  /**
   * Obtiene todos los platos con su categoría poblada, aplicando filtros opcionales
   */
  async buscarTodos(filtro: Record<string, any> = {}): Promise<IPlato[]> {
    return await Plato.find(filtro).populate('categoria', 'nombre')
  }

  /**
   * Busca un plato por su ID (sin populate)
   */
  async buscarPorId(id: string): Promise<IPlato | null> {
    return await Plato.findById(id)
  }

  /**
   * Busca un plato por su ID con la categoría poblada
   */
  async buscarPorIdConCategoria(id: string): Promise<IPlato | null> {
    return await Plato.findById(id).populate('categoria', 'nombre')
  }

  /**
   * Crea y guarda un nuevo plato en MongoDB
   */
  async crear(datos: Record<string, any>): Promise<IPlato> {
    const nuevoPlato = new Plato(datos)
    return await nuevoPlato.save()
  }

  /**
   * Actualiza los datos de un plato por su ID ejecutando validadores de esquema
   */
  async actualizar(id: string, datos: Record<string, any>): Promise<IPlato | null> {
    return await Plato.findByIdAndUpdate(id, datos, {
      returnDocument: 'after',
      runValidators: true
    })
  }

  /**
   * Elimina un plato de MongoDB por su ID
   */
  async eliminar(id: string): Promise<IPlato | null> {
    return await Plato.findByIdAndDelete(id)
  }

  /**
   * Actualiza exclusivamente el estado de disponibilidad del plato
   */
  async actualizarDisponibilidad(id: string, disponible: boolean): Promise<IPlato | null> {
    return await Plato.findByIdAndUpdate(id, { disponible }, { returnDocument: 'after' })
  }

  /**
   * Cuenta cuántos platos están asociados a una categoría específica
   */
  async contarPorCategoriaId(categoriaId: string): Promise<number> {
    return await Plato.countDocuments({ categoria: categoriaId })
  }
}

export const platoRepository = new PlatoRepository()
