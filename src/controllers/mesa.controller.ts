// src/controllers/mesa.controller.ts
import { Request, Response } from 'express'
import { mesaService, MesaServiceError } from '../services/mesa.service'
import { getIO } from '../socket/socket'

export const crearMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const resultado = await mesaService.crearMesa(req.body)

    try {
      getIO().emit('mesas:created', resultado)
    } catch (e) {
      console.warn('Socket error', e)
    }

    res.status(201).json(resultado)
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al crear la mesa', error: err.message || err })
  }
}

export const obtenerMesas = async (req: Request, res: Response): Promise<void> => {
  try {
    const location = req.query.location ? String(req.query.location) : undefined
    const mesas = await mesaService.obtenerMesas(location)
    res.status(200).json(mesas)
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al obtener las mesas', error: err.message || err })
  }
}

export const obtenerMesaPorId = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const mesa = await mesaService.obtenerMesaPorId(id)
    res.status(200).json(mesa)
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al obtener la mesa', error: err.message || err })
  }
}

export const actualizarMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const mesaActualizada = await mesaService.actualizarMesa(id, req.body)

    try {
      getIO().emit('mesas:updated', mesaActualizada)
    } catch (e) {}

    res.status(200).json(mesaActualizada)
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al actualizar la mesa', error: err.message || err })
  }
}

export const actualizarEstadoMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const { estado } = req.body
    const mesaActualizada = await mesaService.actualizarEstadoMesa(id, estado)

    try {
      getIO().emit('mesas:updated', mesaActualizada)
    } catch (e) {}

    res.status(200).json(mesaActualizada)
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al actualizar estado', error: err.message || err })
  }
}

export const eliminarMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const mesaEliminada = await mesaService.eliminarMesa(id)

    try {
      getIO().emit('mesas:deleted', mesaEliminada)
    } catch (e) {}

    res.status(200).json({ mensaje: 'Mesa eliminada', mesa: mesaEliminada })
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al eliminar mesa', error: err.message || err })
  }
}
