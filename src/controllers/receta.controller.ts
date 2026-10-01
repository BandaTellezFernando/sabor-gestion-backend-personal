// src/controllers/receta.controller.ts
import { Request, Response } from 'express'
import { recetaService, RecetaServiceError } from '../services/receta.service'
import { getIO } from '../socket/socket'

/**
 * Obtiene todas las recetas registradas con sus platos e ingredientes
 */
export const obtenerRecetas = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const recetas = await recetaService.obtenerRecetas()
    res.status(200).json(recetas)
  } catch (error) {
    if (error instanceof RecetaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al obtener recetas:', error)
    res.status(500).json({
      mensaje: 'Error al obtener recetas'
    })
  }
}

/**
 * Crea una nueva receta o actualiza sus ingredientes si ya existe para el plato indicado
 */
export const guardarReceta = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const resultado = await recetaService.guardarReceta(req.body)

    try {
      getIO().emit('inventario:actualizado')
    } catch (e) {
      console.warn('Socket no inicializado', e)
    }

    if (resultado.accion === 'actualizada') {
      res.status(200).json({
        mensaje: 'Receta actualizada exitosamente',
        receta: resultado.receta
      })
    } else {
      res.status(201).json({
        mensaje: 'Receta creada exitosamente',
        receta: resultado.receta
      })
    }
  } catch (error) {
    if (error instanceof RecetaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al guardar la receta:', error)
    res.status(500).json({
      mensaje: 'Error al guardar la receta'
    })
  }
}

/**
 * Elimina una receta por su identificador único
 */
export const eliminarReceta = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id)
    await recetaService.eliminarReceta(id)

    try {
      getIO().emit('inventario:actualizado')
    } catch (e) {
      console.warn('Socket no inicializado', e)
    }

    res.status(200).json({
      mensaje: 'Receta eliminada exitosamente'
    })
  } catch (error) {
    if (error instanceof RecetaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al eliminar receta:', error)
    res.status(500).json({
      mensaje: 'Error al eliminar receta'
    })
  }
}
