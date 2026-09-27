// src/controllers/categoria.controller.ts
import { Request, Response } from 'express'
import { categoriaService, CategoriaServiceError } from '../services/categoria.service'

export const crearCategoria = async (req: Request, res: Response): Promise<any> => {
  try {
    const nuevaCategoria = await categoriaService.crearCategoria(req.body)
    return res.status(201).json(nuevaCategoria)
  } catch (error: any) {
    if (error instanceof CategoriaServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    return res.status(500).json({ mensaje: 'Error al crear la categoría', error })
  }
}

export const obtenerCategorias = async (req: Request, res: Response): Promise<any> => {
  try {
    const categorias = await categoriaService.obtenerCategorias()
    return res.status(200).json(categorias)
  } catch (error: any) {
    if (error instanceof CategoriaServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    return res.status(500).json({ mensaje: 'Error al obtener las categorías', error })
  }
}

export const actualizarCategoria = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id)
    const categoriaActualizada = await categoriaService.actualizarCategoria(id, req.body)
    return res.status(200).json(categoriaActualizada)
  } catch (error: any) {
    if (error instanceof CategoriaServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    return res.status(500).json({ mensaje: 'Error al actualizar la categoría', error })
  }
}

export const eliminarCategoria = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id)
    await categoriaService.eliminarCategoria(id)
    return res.status(200).json({ mensaje: 'Categoría eliminada correctamente' })
  } catch (error: any) {
    if (error instanceof CategoriaServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    return res.status(500).json({ mensaje: 'Error al eliminar la categoría', error })
  }
}
