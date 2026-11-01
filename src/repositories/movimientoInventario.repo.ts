//src/repositories/movimientoInventario.repo.ts
import { Types } from 'mongoose'
import MovimientoInventario, {
  IMovimientoConsumoIngrediente
} from '../models/MovimientoInventario'

export interface UsuarioMovimientoPoblado {
  _id: Types.ObjectId
  nombre?: string
  apellido?: string
  apellidos?: string
}

export interface MovimientoInventarioListado {
  _id: Types.ObjectId
  pedido: Types.ObjectId
  codigoPedido: string
  fechaHora: Date
  usuario: UsuarioMovimientoPoblado | Types.ObjectId | null
  consumos: IMovimientoConsumoIngrediente[]
  revertido?: boolean
  fechaReversion?: Date | null
  usuarioReversion?: Types.ObjectId | null
  createdAt?: Date
  updatedAt?: Date
}

export class MovimientoInventarioRepository {
  async buscarPaginado(
    filtro: Record<string, unknown>,
    pagina: number,
    limite: number,
  ): Promise<{ movimientos: MovimientoInventarioListado[]; total: number }> {
    const [movimientos, total] = await Promise.all([
      MovimientoInventario.find(filtro)
        .populate<{ usuario: UsuarioMovimientoPoblado | null }>(
          'usuario',
          'nombre apellido apellidos'
        )
        .sort({ fechaHora: -1, createdAt: -1 })
        .skip((pagina - 1) * limite)
        .limit(limite)
        .lean<MovimientoInventarioListado[]>()
        .exec(),
      MovimientoInventario.countDocuments(filtro).exec(),
    ])

    return { movimientos, total }
  }
}

export const movimientoInventarioRepository =
  new MovimientoInventarioRepository()
