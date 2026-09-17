//src/controllers/plato.controller.ts
import { Request, Response } from 'express'
import Plato from '../models/Plato.js'
import { cloudinary } from '../configs/cloudinary.js'

// POST /api/platos
export const crearPlato = async (req: Request, res: Response) => {
  try {
    const { nombre, descripcion, precio, imagenUrl, imagenPublicId, categoria } = req.body

    if (!imagenUrl || !imagenPublicId) {
      res
        .status(400)
        .json({ mensaje: 'Se requiere subir una imagen primero usando POST /api/upload' })
      return
    }

    const nuevoPlato = new Plato({
      nombre,
      descripcion,
      precio,
      imagenUrl,
      imagenPublicId,
      categoria
    })

    await nuevoPlato.save()
    res.status(201).json(nuevoPlato)
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear el plato', error })
  }
}

// GET /api/platos
// 🔥 ESTA ES LA FUNCIÓN CLAVE QUE NECESITAMOS
export const obtenerPlatos = async (req: Request, res: Response) => {
  try {
    const { category } = req.query // Extraemos el id de la categoría de la URL
    let filtro = {}

    // Si el usuario mandó ?category=ID, lo añadimos al filtro de búsqueda
    if (category) {
      filtro = { categoria: category }
    }

    const platos = await Plato.find(filtro).populate('categoria', 'nombre')

    res.status(200).json(platos)
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener los platos', error })
  }
}

// GET /api/platos/:id
export const obtenerPlatoPorId = async (req: Request, res: Response) => {
  try {
    const plato = await Plato.findById(req.params.id).populate('categoria', 'nombre')
    if (!plato) {
      res.status(404).json({ mensaje: 'Plato no encontrado' })
      return
    }
    res.status(200).json(plato)
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener el plato', error })
  }
}

// PUT /api/platos/:id
export const actualizarPlato = async (req: Request, res: Response) => {
  try {
    const plato = await Plato.findById(req.params.id)
    if (!plato) {
      res.status(404).json({ mensaje: 'Plato no encontrado' })
      return
    }

    const { imagenUrl, imagenPublicId, ...resto } = req.body

    // Si viene imagen nueva, eliminar la anterior de Cloudinary
    if (imagenPublicId && imagenPublicId !== plato.imagenPublicId && plato.imagenPublicId) {
      await cloudinary.uploader.destroy(plato.imagenPublicId)
    }

    const platoActualizado = await Plato.findByIdAndUpdate(
      req.params.id,
      { ...resto, imagenUrl, imagenPublicId },
      { returnDocument: 'after', runValidators: true }
    )

    res.status(200).json(platoActualizado)
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar el plato', error })
  }
}

// DELETE /api/platos/:id
export const eliminarPlato = async (req: Request, res: Response) => {
  try {
    const plato = await Plato.findById(req.params.id)
    if (!plato) {
      res.status(404).json({ mensaje: 'Plato no encontrado' })
      return
    }

    // Eliminar imagen de Cloudinary antes de borrar el plato
    if (plato.imagenPublicId) {
      await cloudinary.uploader.destroy(plato.imagenPublicId)
    }

    await plato.deleteOne()
    res.status(200).json({ mensaje: 'Plato e imagen eliminados correctamente' })
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar el plato', error })
  }
}

// PATCH /api/platos/:id/disponibilidad
export const cambiarDisponibilidad = async (req: Request, res: Response) => {
  try {
    const plato = await Plato.findById(req.params.id)
    if (!plato) {
      res.status(404).json({ mensaje: 'Plato no encontrado' })
      return
    }

    plato.disponible = !plato.disponible
    await plato.save()

    res.status(200).json({
      mensaje: `Plato marcado como ${plato.disponible ? 'disponible' : 'agotado'}`,
      disponible: plato.disponible
    })
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al cambiar disponibilidad', error })
  }
}
