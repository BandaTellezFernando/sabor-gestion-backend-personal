// src/controllers/ubicacion.controller.ts
import { Request, Response } from 'express'
import { ubicacionService, UbicacionServiceError } from '../services/ubicacion.service'

export const obtenerUbicaciones = async (req: Request, res: Response): Promise<void> => {
  try {
    const ubicaciones = await ubicacionService.obtenerUbicaciones()
    res.status(200).json(ubicaciones)
  } catch (error: any) {
    if (error instanceof UbicacionServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    const err = error as Error
    res
      .status(500)
      .json({ mensaje: 'Error al obtener ubicaciones', error: err.message || err })
  }
}

export const crearUbicacion = async (req: Request, res: Response): Promise<void> => {
  try {
    const nueva = await ubicacionService.crearUbicacion(req.body)
    res.status(201).json(nueva)
  } catch (error: any) {
    if (error instanceof UbicacionServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    const err = error as Error
    console.error('crearUbicacion error:', error)
    res.status(500).json({ mensaje: 'Error al crear ubicacion', error: err.message || err })
  }
}

export const actualizarUbicacion = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const actualizada = await ubicacionService.actualizarUbicacion(id, req.body)
    res.status(200).json(actualizada)
  } catch (error: any) {
    if (error instanceof UbicacionServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    const err = error as Error
    res
      .status(500)
      .json({ mensaje: 'Error al actualizar ubicación', error: err.message || err })
  }
}

export const eliminarUbicacion = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    await ubicacionService.eliminarUbicacion(id)
    res.status(200).json({ mensaje: 'Ubicación eliminada correctamente' })
  } catch (error: any) {
    if (error instanceof UbicacionServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message, ...error.extra })
      return
    }
    const err = error as Error
    res
      .status(500)
      .json({ mensaje: 'Error al eliminar ubicación', error: err.message || err })
  }
}
