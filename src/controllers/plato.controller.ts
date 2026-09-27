// src/controllers/plato.controller.ts
import { Request, Response } from 'express'
import { platoService, PlatoServiceError } from '../services/plato.service'

// POST /api/platos
export const crearPlato = async (req: Request, res: Response): Promise<any> => {
  try {
    const nuevoPlato = await platoService.crearPlato(req.body)
    return res.status(201).json(nuevoPlato)
  } catch (error: any) {
    if (error instanceof PlatoServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    return res.status(500).json({ mensaje: 'Error al crear el plato', error })
  }
}

// GET /api/platos
export const obtenerPlatos = async (req: Request, res: Response): Promise<any> => {
  try {
    const category = req.query.category ? String(req.query.category) : undefined
    const platos = await platoService.obtenerPlatos(category)
    return res.status(200).json(platos)
  } catch (error: any) {
    if (error instanceof PlatoServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    return res.status(500).json({ mensaje: 'Error al obtener los platos', error })
  }
}

// GET /api/platos/:id
export const obtenerPlatoPorId = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id)
    const plato = await platoService.obtenerPlatoPorId(id)
    return res.status(200).json(plato)
  } catch (error: any) {
    if (error instanceof PlatoServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    return res.status(500).json({ mensaje: 'Error al obtener el plato', error })
  }
}

// PUT /api/platos/:id
export const actualizarPlato = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id)
    const platoActualizado = await platoService.actualizarPlato(id, req.body)
    return res.status(200).json(platoActualizado)
  } catch (error: any) {
    if (error instanceof PlatoServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    return res.status(500).json({ mensaje: 'Error al actualizar el plato', error })
  }
}

// DELETE /api/platos/:id
export const eliminarPlato = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id)
    await platoService.eliminarPlato(id)
    return res.status(200).json({ mensaje: 'Plato e imagen eliminados correctamente' })
  } catch (error: any) {
    if (error instanceof PlatoServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    return res.status(500).json({ mensaje: 'Error al eliminar el plato', error })
  }
}

// PATCH /api/platos/:id/disponibilidad (Función preservada; sin endpoint activo en rutas)
export const cambiarDisponibilidad = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = String(req.params.id)
    const resultado = await platoService.cambiarDisponibilidad(id)
    return res.status(200).json(resultado)
  } catch (error: any) {
    if (error instanceof PlatoServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    return res.status(500).json({ mensaje: 'Error al cambiar disponibilidad', error })
  }
}
