import { Request, Response } from 'express'
import {
  movimientoInventarioService,
  MovimientoInventarioServiceError,
} from '../services/movimientoInventario.service'

export const obtenerMovimientosInventario = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const esTexto = (valor: unknown): string | undefined =>
      typeof valor === 'string' ? valor : undefined

    const resultado = await movimientoInventarioService.obtenerMovimientos({
      pagina: esTexto(req.query.pagina),
      limite: esTexto(req.query.limite),
      codigoPedido: esTexto(req.query.codigoPedido),
      desde: esTexto(req.query.desde),
      hasta: esTexto(req.query.hasta),
    })

    res.status(200).json(resultado)
  } catch (error) {
    if (error instanceof MovimientoInventarioServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }

    console.error('Error al consultar el historial de inventario:', error)
    res.status(500).json({
      mensaje: 'Error al consultar el historial de inventario',
    })
  }
}
