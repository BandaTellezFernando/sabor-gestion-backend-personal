import { Request, Response } from 'express'
import {
  reportesService,
  ReportesServiceError
} from '../services/reportes.service'
import type { ParametrosReportePeriodo } from '../services/reportes.service'

function leerParametroFecha(
  valor: unknown,
  nombre: string
): string | undefined {
  if (valor === undefined) {
    return undefined
  }

  if (typeof valor !== 'string') {
    throw new ReportesServiceError(
      400,
      'El parámetro ' + nombre + ' debe contener una sola fecha YYYY-MM-DD.'
    )
  }

  return valor
}

function leerParametros(req: Request): ParametrosReportePeriodo {
  return {
    desde: leerParametroFecha(req.query.desde, 'desde'),
    hasta: leerParametroFecha(req.query.hasta, 'hasta')
  }
}

async function ejecutarReporte(
  req: Request,
  res: Response,
  accion: (params: ParametrosReportePeriodo) => Promise<unknown>,
  mensajeError: string
): Promise<void> {
  try {
    const resultado = await accion(leerParametros(req))
    res.status(200).json(resultado)
  } catch (error: unknown) {
    if (error instanceof ReportesServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }

    console.error(mensajeError, error)
    res.status(500).json({ mensaje: mensajeError })
  }
}

export const obtenerReporteVentas = async (
  req: Request,
  res: Response
): Promise<void> => {
  await ejecutarReporte(
    req,
    res,
    (params) => reportesService.obtenerReporteVentas(params),
    'Error al generar el reporte de ventas.'
  )
}

export const obtenerReporteMetodosPago = async (
  req: Request,
  res: Response
): Promise<void> => {
  await ejecutarReporte(
    req,
    res,
    (params) => reportesService.obtenerReporteMetodosPago(params),
    'Error al generar el reporte por método de pago.'
  )
}

export const obtenerReporteCajeros = async (
  req: Request,
  res: Response
): Promise<void> => {
  await ejecutarReporte(
    req,
    res,
    (params) => reportesService.obtenerReporteCajeros(params),
    'Error al generar el reporte por cajero.'
  )
}

export const obtenerReporteProductos = async (
  req: Request,
  res: Response
): Promise<void> => {
  await ejecutarReporte(
    req,
    res,
    (params) => reportesService.obtenerReporteProductos(params),
    'Error al generar el reporte de productos y categorías.'
  )
}
