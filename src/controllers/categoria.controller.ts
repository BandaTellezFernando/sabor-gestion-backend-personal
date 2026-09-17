// src/controllers/categoria.controller.ts
import { Request, Response } from 'express'
import Categoria from '../models/Categoria'

export const crearCategoria = async (req: Request, res: Response): Promise<any> => {
  try {
    const { nombre } = req.body

    if (!nombre || nombre.trim() === '') {
      return res
        .status(400)
        .json({ mensaje: 'El nombre de la categoría es requerido. Ejemplo: "Bebidas"' })
    }

    const regexValido = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/
    if (!regexValido.test(nombre)) {
      return res.status(400).json({
        mensaje: 'El nombre solo debe contener letras y espacios. Ejemplo: "Postres"'
      })
    }

    const categoriaExistente = await Categoria.findOne({
      nombre: { $regex: new RegExp(`^${nombre.trim()}$`, 'i') }
    })

    if (categoriaExistente) {
      return res.status(400).json({ mensaje: 'Ya existe una categoría con ese nombre' })
    }

    const nuevaCategoria = new Categoria({ ...req.body, nombre: nombre.trim() })
    await nuevaCategoria.save()
    res.status(201).json(nuevaCategoria)
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear la categoría', error })
  }
}

export const obtenerCategorias = async (req: Request, res: Response) => {
  try {
    const categorias = await Categoria.find()
    res.status(200).json(categorias)
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener las categorías', error })
  }
}

// NUEVO: Editar Categoría
export const actualizarCategoria = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params
    const { nombre } = req.body

    if (!nombre || nombre.trim() === '') {
      return res
        .status(400)
        .json({ mensaje: 'El nombre de la categoría es requerido. Ejemplo: "Bebidas"' })
    }

    const regexValido = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/
    if (!regexValido.test(nombre)) {
      return res.status(400).json({
        mensaje: 'El nombre solo debe contener letras y espacios. Ejemplo: "Postres"'
      })
    }

    const categoriaExistente = await Categoria.findOne({
      nombre: { $regex: new RegExp(`^${nombre.trim()}$`, 'i') },
      _id: { $ne: id }
    })

    if (categoriaExistente) {
      return res.status(400).json({ mensaje: 'Ya existe otra categoría con ese nombre' })
    }

    const categoriaActualizada = await Categoria.findByIdAndUpdate(
      id,
      { nombre: nombre.trim() },
      { new: true }
    )

    if (!categoriaActualizada) {
      return res.status(404).json({ mensaje: 'Categoría no encontrada' })
    }

    res.status(200).json(categoriaActualizada)
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar la categoría', error })
  }
}

// NUEVO: Eliminar Categoría
export const eliminarCategoria = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params
    const categoriaEliminada = await Categoria.findByIdAndDelete(id)

    if (!categoriaEliminada) {
      return res.status(404).json({ mensaje: 'Categoría no encontrada' })
    }

    res.status(200).json({ mensaje: 'Categoría eliminada correctamente' })
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar la categoría', error })
  }
}
