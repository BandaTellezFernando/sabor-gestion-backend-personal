// src/controllers/ingrediente.controller.ts
import { Request, Response } from 'express'
import {
  ingredienteService,
  IngredienteServiceError
} from '../services/ingrediente.service'
import { getIO } from '../socket/socket'

export const obtenerEstadoInventario = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ingredientes = await ingredienteService.obtenerIngredientes()
    res.status(200).json(ingredientes)
  } catch (error) {
    if (error instanceof IngredienteServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res.status(500).json({
      mensaje: 'Error al obtener el estado del inventario',
      error: err.message
    })
  }
}

export const crearIngrediente = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const nuevoIngrediente = await ingredienteService.crearIngrediente(req.body)

    try {
      getIO().emit('inventario:actualizado')
    } catch (e) {
      console.warn('Socket no inicializado', e)
    }

    res.status(201).json({
      mensaje: 'Ingrediente creado con éxito',
      ingrediente: nuevoIngrediente
    })
  } catch (error) {
    if (error instanceof IngredienteServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res.status(500).json({
      mensaje: 'Error al crear ingrediente',
      error: err.message
    })
  }
}

export const actualizarIngrediente = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id)
    const ingrediente = await ingredienteService.actualizarIngrediente(id, req.body)

    try {
      getIO().emit('inventario:actualizado')
    } catch (e) {
      console.warn('Socket no inicializado', e)
    }

    res.status(200).json({
      mensaje: 'Ingrediente actualizado',
      ingrediente
    })
  } catch (error) {
    if (error instanceof IngredienteServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res.status(500).json({
      mensaje: 'Error al actualizar ingrediente',
      error: err.message
    })
  }
}

export const eliminarIngrediente = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id)
    await ingredienteService.eliminarIngrediente(id)

    try {
      getIO().emit('inventario:actualizado')
    } catch (e) {
      console.warn('Socket no inicializado', e)
    }

    res.status(200).json({
      mensaje: 'Ingrediente eliminado exitosamente'
    })
  } catch (error) {
    if (error instanceof IngredienteServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res.status(500).json({
      mensaje: 'Error al eliminar ingrediente',
      error: err.message
    })
  }
}
