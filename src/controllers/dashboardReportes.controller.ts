import { Request, Response } from 'express'
import {
  generarReporteVentasBuffer,
  ReporteVentasError
} from '../services/reporteVentas.service'

function obtenerParametroFecha(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null
}

/**
 * Genera un PDF de ventas con base en pagos confirmados.
 * Esta ruta debe permanecer detrás de verificarToken y soloAdmins.
 */
export const obtenerReporteVentasPdf = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const desde = obtenerParametroFecha(req.query.desde)
    const hasta = obtenerParametroFecha(req.query.hasta)

    if (!desde || !hasta) {
      res.status(400).json({
        mensaje: 'Los parámetros desde y hasta son obligatorios.'
      })
      return
    }

    const reporte = await generarReporteVentasBuffer({ desde, hasta })

    res.status(200).json({
      nombreArchivo: reporte.nombreArchivo,
      tipoContenido: 'application/pdf',
      contenidoBase64: reporte.contenido.toString('base64')
    })
  } catch (error: unknown) {
    if (error instanceof ReporteVentasError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }

    console.error('Error al generar el reporte PDF de ventas:', error)
    res.status(500).json({
      mensaje: 'No se pudo generar el reporte de ventas. Inténtalo nuevamente.'
    })
  }
}
