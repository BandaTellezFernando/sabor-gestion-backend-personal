import { Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import {
  CierreCajaServiceError,
  cierreCajaService
} from '../services/cierreCaja.service'

const contextoUsuario = (req: CustomRequest) => ({
  id: req.usuario?.id || '',
  rol: req.usuario?.rol || ''
})

const responderError = (
  res: Response,
  error: unknown,
  operacion: string
): void => {
  if (error instanceof CierreCajaServiceError) {
    res.status(error.statusCode).json({ mensaje: error.message })
    return
  }

  console.error(`Error al ${operacion}:`, error)
  res.status(500).json({ mensaje: `Error al ${operacion}` })
}

export const cerrarCaja = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const cierre = await cierreCajaService.cerrarCaja(
      {
        periodoDesde: req.body?.periodoDesde,
        periodoHasta: req.body?.periodoHasta,
        efectivoContado: req.body?.efectivoContado,
        cajeroId:
          typeof req.body?.cajeroId === 'string'
            ? req.body.cajeroId
            : undefined
      },
      contextoUsuario(req)
    )

    res.status(201).json({
      mensaje: 'Cierre de caja registrado correctamente.',
      cierre
    })
  } catch (error) {
    responderError(res, error, 'registrar el cierre de caja')
  }
}

export const listarCierresCaja = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const cierres = await cierreCajaService.listarCierres(
      contextoUsuario(req),
      {
        desde: typeof req.query.desde === 'string' ? req.query.desde : undefined,
        hasta: typeof req.query.hasta === 'string' ? req.query.hasta : undefined,
        cajeroId:
          typeof req.query.cajeroId === 'string'
            ? req.query.cajeroId
            : undefined
      }
    )

    res.status(200).json({ cierres })
  } catch (error) {
    responderError(res, error, 'consultar los cierres de caja')
  }
}
