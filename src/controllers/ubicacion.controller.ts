//src/controllers/ubicacion.controller.ts
import { Request, Response } from 'express'
import Ubicacion from '../models/Ubicacion'

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const obtenerUbicaciones = async (req: Request, res: Response) => {
  try {
    const ubicaciones = await Ubicacion.find().sort({ nombre: 1 })
    res
      .status(200)
      .json(ubicaciones.map((u) => ({ id: u._id, nombre: u.nombre || (u as any).name })))
  } catch (error: any) {
    res.status(500).json({ mensaje: 'Error al obtener ubicaciones', error: error.message || error })
  }
}

export const crearUbicacion = async (req: Request, res: Response) => {
  try {
    const { nombre, name } = req.body
    const finalName = (nombre || name || '').toString().trim()
    if (!finalName) return res.status(400).json({ mensaje: 'Nombre de ubicación requerido' })

    // Evitar duplicados (case-insensitive) tanto en 'nombre' como en campo legacy 'name'
    const regex = { $regex: `^${escapeRegex(finalName)}$`, $options: 'i' }
    let existente
    try {
      existente = await Ubicacion.findOne({ $or: [{ nombre: regex }, { name: regex }] })
    } catch (findErr: any) {
      // Problema en la consulta (ej. construcción de regex inválido) -> devolver 400
      return res
        .status(400)
        .json({ mensaje: 'Nombre de ubicación inválido', error: findErr.message || findErr })
    }

    if (existente)
      return res.status(400).json({
        mensaje: 'Ubicación ya existe',
        ubicacion: { id: existente._id, nombre: existente.nombre || (existente as any).name }
      })

    try {
      const nueva = new Ubicacion({ nombre: finalName, name: finalName })
      await nueva.save()
      res.status(201).json({ id: nueva._id, nombre: nueva.nombre || (nueva as any).name })
    } catch (err: any) {
      // Manejar duplicado por índice directamente (concurrency) y otros errores previsibles
      if (err && (err.code === 11000 || (err.code && err.code === 11000))) {
        return res.status(400).json({ mensaje: 'Ubicación ya existe (duplicada por índice)' })
      }
      // Si el error tiene keyValue/name problema, devolver 400 con detalle
      if (err && err.keyValue) {
        return res.status(400).json({ mensaje: 'Error creando ubicación', detalle: err.keyValue })
      }
      throw err
    }
  } catch (error: any) {
    console.error('crearUbicacion error:', error)
    res.status(500).json({ mensaje: 'Error al crear ubicacion', error: error.message || error })
  }
}

export const actualizarUbicacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { nombre, name } = req.body
    const finalName = (nombre || name || '').toString().trim()
    if (!finalName) return res.status(400).json({ mensaje: 'Nombre de ubicación requerido' })

    // Evitar que al editar se pise el nombre de otra ubicación existente
    const regex = { $regex: `^${escapeRegex(finalName)}$`, $options: 'i' }
    const existente = await Ubicacion.findOne({
      $or: [{ nombre: regex }, { name: regex }],
      _id: { $ne: id }
    })

    if (existente) {
      return res.status(400).json({ mensaje: 'La ubicación ya existe' })
    }

    const actualizada = await Ubicacion.findByIdAndUpdate(
      id,
      { nombre: finalName, name: finalName },
      { returnDocument: 'after' }
    )
    if (!actualizada) return res.status(404).json({ mensaje: 'Ubicación no encontrada' })

    res
      .status(200)
      .json({ id: actualizada._id, nombre: actualizada.nombre || (actualizada as any).name })
  } catch (error: any) {
    res
      .status(500)
      .json({ mensaje: 'Error al actualizar ubicación', error: error.message || error })
  }
}

export const eliminarUbicacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const eliminada = await Ubicacion.findByIdAndDelete(id)
    if (!eliminada) return res.status(404).json({ mensaje: 'Ubicación no encontrada' })
    res.status(200).json({ mensaje: 'Ubicación eliminada correctamente' })
  } catch (error: any) {
    res.status(500).json({ mensaje: 'Error al eliminar ubicación', error: error.message || error })
  }
}
