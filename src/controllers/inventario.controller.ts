// src/controllers/inventario.controller.ts
import { Request, Response } from 'express'
import mongoose from 'mongoose'
import Ingrediente from '../models/Ingrediente'
import MovimientoInventario from '../models/MovimientoInventario'
import Receta from '../models/Receta'
import Plato from '../models/Plato'
import AlertaStock from '../models/AlertaStock'
import { getIO } from '../socket/socket' // <-- Importación del WebSocket

// ─── GESTIÓN DE ESTADO Y ENTRADAS ────────────────────────────────────────────

export const obtenerEstadoInventario = async (req: Request, res: Response): Promise<void> => {
  try {
    const ingredientes = await Ingrediente.find().sort({ stockActual: 1 })
    res.status(200).json(ingredientes)
  } catch (error) {
    const err = error as Error
    res.status(500).json({
      mensaje: 'Error al obtener el estado del inventario',
      error: err.message
    })
  }
}

export const registrarEntradaStock = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { ingredienteId, cantidad, costo } = req.body

    if (!ingredienteId || cantidad === undefined || cantidad === null) {
      res.status(400).json({ mensaje: 'Los campos ingredienteId y cantidad son requeridos.' })
      await session.abortTransaction()
      session.endSession()
      return
    }

    const cantidadNum = Number(cantidad)
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      res.status(400).json({ mensaje: 'La cantidad debe ser un número mayor a cero.' })
      await session.abortTransaction()
      session.endSession()
      return
    }

    const ingrediente = await Ingrediente.findById(ingredienteId).session(session)
    if (!ingrediente) {
      res.status(404).json({ mensaje: 'Ingrediente no encontrado.' })
      await session.abortTransaction()
      session.endSession()
      return
    }

    const stockAnterior = ingrediente.stockActual
    const nuevoStock = stockAnterior + cantidadNum

    let nuevoEstado: 'Disponible' | 'Bajo' | 'Agotado' = 'Disponible'
    if (nuevoStock <= 0) {
      nuevoEstado = 'Agotado'
    } else if (nuevoStock <= ingrediente.stockMinimo) {
      nuevoEstado = 'Bajo'
    }

    ingrediente.stockActual = nuevoStock
    ingrediente.estado = nuevoEstado
    await ingrediente.save({ session })

    const descripcionMovimiento = costo
      ? `Entrada manual de stock. Costo asociado: Bs. ${costo}`
      : 'Entrada manual de stock'

    const [nuevoMovimiento] = await MovimientoInventario.create(
      [
        {
          ingrediente: ingrediente._id,
          tipoMovimiento: 'Entrada',
          cantidad: cantidadNum,
          descripcion: descripcionMovimiento
        }
      ],
      { session }
    )

    await session.commitTransaction()
    session.endSession()

    // Emitir evento de actualización por WebSockets
    try {
      getIO().emit('inventario:actualizado')
    } catch (e) {
      console.warn('Socket no inicializado', e)
    }

    res.status(200).json({
      mensaje: 'Entrada de stock registrada correctamente.',
      ingrediente: {
        id: ingrediente._id,
        nombre: ingrediente.nombre,
        stockAnterior,
        stockActual: nuevoStock,
        estado: nuevoEstado
      },
      movimiento: nuevoMovimiento
    })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    const err = error as Error
    res.status(500).json({
      mensaje: 'Error al registrar la entrada de stock.',
      error: err.message
    })
  }
}

// ─── GESTIÓN DE INGREDIENTES (CRUD) ──────────────────────────────────────────

export const crearIngrediente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, unidadMedida, stockActual = 0, stockMinimo = 0 } = req.body

    if (!nombre || !unidadMedida) {
      res.status(400).json({ mensaje: 'El nombre y la unidad de medida son obligatorios.' })
      return
    }

    let estado = 'Disponible'
    if (stockActual <= 0) estado = 'Agotado'
    else if (stockActual <= stockMinimo) estado = 'Bajo'

    const nuevoIngrediente = new Ingrediente({
      nombre,
      unidadMedida,
      stockActual,
      stockMinimo,
      estado
    })

    await nuevoIngrediente.save()

    // Emitir evento de actualización
    try {
      getIO().emit('inventario:actualizado')
    } catch (e) {
      console.warn('Socket no inicializado', e)
    }

    res.status(201).json({ mensaje: 'Ingrediente creado con éxito', ingrediente: nuevoIngrediente })
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al crear ingrediente', error: err.message })
  }
}

export const actualizarIngrediente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { nombre, unidadMedida, stockActual, stockMinimo } = req.body

    const ingrediente = await Ingrediente.findById(id)
    if (!ingrediente) {
      res.status(404).json({ mensaje: 'Ingrediente no encontrado' })
      return
    }

    if (nombre !== undefined) ingrediente.nombre = nombre
    if (unidadMedida !== undefined) ingrediente.unidadMedida = unidadMedida
    if (stockActual !== undefined) ingrediente.stockActual = stockActual
    if (stockMinimo !== undefined) ingrediente.stockMinimo = stockMinimo

    if (ingrediente.stockActual <= 0) {
      ingrediente.estado = 'Agotado'
    } else if (ingrediente.stockActual <= ingrediente.stockMinimo) {
      ingrediente.estado = 'Bajo'
    } else {
      ingrediente.estado = 'Disponible'
    }

    await ingrediente.save()

    // Emitir evento de actualización
    try {
      getIO().emit('inventario:actualizado')
    } catch (e) {
      console.warn('Socket no inicializado', e)
    }

    res.status(200).json({ mensaje: 'Ingrediente actualizado', ingrediente })
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al actualizar ingrediente', error: err.message })
  }
}

export const eliminarIngrediente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const ingredienteEliminado = await Ingrediente.findByIdAndDelete(id)

    if (!ingredienteEliminado) {
      res.status(404).json({ mensaje: 'Ingrediente no encontrado' })
      return
    }

    // Emitir evento de actualización
    try {
      getIO().emit('inventario:actualizado')
    } catch (e) {
      console.warn('Socket no inicializado', e)
    }

    res.status(200).json({ mensaje: 'Ingrediente eliminado exitosamente' })
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al eliminar ingrediente', error: err.message })
  }
}

// ─── GESTIÓN DE RECETAS / ESCANDALLOS ────────────────────────────────────────

export const obtenerRecetas = async (req: Request, res: Response): Promise<void> => {
  try {
    const recetas = await Receta.find()
      .populate('plato', 'nombre precio')
      .populate('ingredientes.ingrediente', 'nombre unidadMedida stockActual')

    res.status(200).json(recetas)
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al obtener recetas', error: err.message })
  }
}

export const guardarReceta = async (req: Request, res: Response): Promise<void> => {
  try {
    const { plato, ingredientes } = req.body

    if (!plato || !ingredientes || !Array.isArray(ingredientes)) {
      res.status(400).json({
        mensaje: 'Faltan datos: se requiere el ID del plato y un arreglo de ingredientes.'
      })
      return
    }

    const platoExiste = await Plato.findById(plato)
    if (!platoExiste) {
      res.status(404).json({ mensaje: 'El plato indicado no existe en la base de datos.' })
      return
    }

    let receta = await Receta.findOne({ plato })

    if (receta) {
      receta.ingredientes = ingredientes
      await receta.save()

      try {
        getIO().emit('inventario:actualizado')
      } catch (e) {}

      res.status(200).json({ mensaje: 'Receta actualizada exitosamente', receta })
    } else {
      receta = await Receta.create({ plato, ingredientes })

      try {
        getIO().emit('inventario:actualizado')
      } catch (e) {}

      res.status(201).json({ mensaje: 'Receta creada exitosamente', receta })
    }
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al guardar la receta', error: err.message })
  }
}

export const eliminarReceta = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const recetaEliminada = await Receta.findByIdAndDelete(id)

    if (!recetaEliminada) {
      res.status(404).json({ mensaje: 'Receta no encontrada' })
      return
    }

    try {
      getIO().emit('inventario:actualizado')
    } catch (e) {
      console.warn('Socket no inicializado', e)
    }

    res.status(200).json({ mensaje: 'Receta eliminada exitosamente' })
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al eliminar receta', error: err.message })
  }
}

// ─── GESTIÓN DE ALERTAS ──────────────────────────────────────────────────────

export const obtenerAlertas = async (req: Request, res: Response): Promise<void> => {
  try {
    const alertas = await AlertaStock.find({ estado: 'Pendiente' })
      .populate('ingrediente', 'nombre unidadMedida stockActual stockMinimo')
      .sort({ createdAt: -1 })

    res.status(200).json(alertas)
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al obtener alertas', error: err.message })
  }
}
