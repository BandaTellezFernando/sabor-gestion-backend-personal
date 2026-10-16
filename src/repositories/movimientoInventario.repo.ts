import MovimientoInventario from '../models/MovimientoInventario'

export class MovimientoInventarioRepository {
  async buscarPaginado(
    filtro: Record<string, unknown>,
    pagina: number,
    limite: number,
  ): Promise<{ movimientos: any[]; total: number }> {
    const [movimientos, total] = await Promise.all([
      MovimientoInventario.find(filtro)
        .populate('usuario', 'nombre apellido apellidos')
        .sort({ fechaHora: -1, createdAt: -1 })
        .skip((pagina - 1) * limite)
        .limit(limite)
        .lean()
        .exec(),
      MovimientoInventario.countDocuments(filtro).exec(),
    ])

    return { movimientos, total }
  }
}

export const movimientoInventarioRepository =
  new MovimientoInventarioRepository()
