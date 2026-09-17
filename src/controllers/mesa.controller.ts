// src/controllers/mesa.controller.ts
import { Request, Response } from 'express'
import Mesa, { IMesa } from '../models/Mesa'
import { getIO } from '../socket/socket'
import mongoose from 'mongoose'
// --- INTERFACES DE AYUDA PARA TYPESCRIPT ---

// Interfaz para recibir datos del frontend
interface MesaPayload {
  name?: string
  numero?: string
  capacity?: number
  capacidad?: number
  status?: string
  estado?: string
  type?: string
  tipo?: string
  location?: string
  ubicacion?: string | mongoose.Types.ObjectId
}

// Interfaz para la mesa cuando le hacemos .populate('ubicacionId')
interface PopulatedUbicacion {
  _id: mongoose.Types.ObjectId
  nombre?: string
  name?: string
}

type MesaPoblada = Omit<IMesa, 'ubicacionId'> & {
  _id: mongoose.Types.ObjectId
  ubicacionId?: PopulatedUbicacion | mongoose.Types.ObjectId | null
}

// --------------------------------------------

const estadoBackendToFrontend = (estado: string | undefined): string => {
  if (!estado) return 'Disponible'
  if (estado === 'Libre') return 'Disponible'
  if (estado === 'Cuenta Solicitada') return 'Esperando pago'
  return estado
}

const estadoFrontendToBackend = (status: string | undefined): string | undefined => {
  if (!status) return undefined
  if (status === 'Disponible') return 'Libre'
  if (status === 'Esperando pago') return 'Cuenta Solicitada'
  return status
}

const validarNombreMesa = (nombre: string | undefined): { valido: boolean; mensaje?: string } => {
  if (!nombre) return { valido: false, mensaje: 'El nombre de la mesa es requerido.' }
  const nom = String(nombre).toLowerCase().trim()

  if (String(nombre).length > 25) {
    return {
      valido: false,
      mensaje: 'El identificador de mesa no puede superar los 25 caracteres.'
    }
  }

  const regexEspeciales = /^[a-záéíóúñ0-9\s]+$/i
  if (!regexEspeciales.test(nom))
    return { valido: false, mensaje: 'No se permiten símbolos especiales.' }

  if (!nom.includes('mesa'))
    return { valido: false, mensaje: 'El nombre debe incluir la palabra "mesa".' }

  const ubicaciones = ['interior', 'patio', 'terraza']
  if (!ubicaciones.some((ub) => nom.includes(ub))) {
    return {
      valido: false,
      mensaje: 'El nombre debe incluir una ubicación válida (interior, patio, terraza).'
    }
  }

  const numeros = nom.match(/\d+/g)
  if (numeros) {
    for (const numStr of numeros) {
      if (numStr.length > 3)
        return { valido: false, mensaje: 'No se permiten más de 3 dígitos numéricos consecutivos.' }
      if (parseInt(numStr, 10) > 50)
        return { valido: false, mensaje: 'El número de mesa no puede ser mayor a 50.' }
    }
  }
  return { valido: true }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const mapMesa = (m: MesaPoblada | null) => {
  if (!m) return null

  let locationName = ''

  // Validamos si ubicacionId es un objeto poblado (tiene propiedad 'nombre' o 'name')
  if (
    m.ubicacionId &&
    typeof m.ubicacionId === 'object' &&
    !(m.ubicacionId instanceof mongoose.Types.ObjectId)
  ) {
    const loc = m.ubicacionId as PopulatedUbicacion
    locationName = loc.nombre || loc.name || ''
  }

  if (!locationName) {
    locationName = m.ubicacion || ''
  }

  // Extraemos el ID como string asegurándonos del tipado
  const ubicacionRef = m.ubicacionId as
    | PopulatedUbicacion
    | mongoose.Types.ObjectId
    | undefined
    | null

  return {
    // Usamos String() en lugar de .toString() para evitar el choque de tipos
    id: String(m._id),
    _id: String(m._id),

    name: m.numero || '',
    numero: m.numero || '',
    capacity: m.capacidad ?? 0,
    location: locationName,

    // También aplicamos String() aquí
    locationId:
      ubicacionRef && typeof ubicacionRef === 'object' && '_id' in ubicacionRef
        ? String(ubicacionRef._id)
        : ubicacionRef
          ? String(ubicacionRef)
          : null,

    status: estadoBackendToFrontend(m.estado),
    type: m.tipo || 'normal',
    createdAt: m.createdAt,
    updatedAt: m.updatedAt
  }
}

export const crearMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body

    // Si envían un array de mesas
    if (Array.isArray(body)) {
      const input = body.map((p: MesaPayload) => {
        const base: Partial<IMesa> = {
          numero: p.name || p.numero,
          capacidad: p.capacity || p.capacidad,
          estado: estadoFrontendToBackend(p.status || p.estado) || 'Libre',
          tipo: p.type || p.tipo || 'normal'
        }

        const loc = p.location || p.ubicacion
        if (loc && mongoose.Types.ObjectId.isValid(String(loc))) {
          base.ubicacionId = new mongoose.Types.ObjectId(String(loc))
        } else if (loc) {
          base.ubicacion = String(loc)
        }
        return base
      })

      const nuevasMesas = await Mesa.insertMany(input)

      const pobladas = (await Mesa.find({
        _id: { $in: nuevasMesas.map((m) => m._id) }
      }).populate('ubicacionId', 'nombre')) as MesaPoblada[]

      const mapped = pobladas.map(mapMesa)

      try {
        getIO().emit('mesas:created', mapped)
      } catch (e) {
        console.warn('Socket error', e)
      }
      res.status(201).json(mapped)
      return
    }

    // Si envían una sola mesa
    const mesaData: Partial<IMesa> = {
      numero: body.name || body.numero,
      capacidad: body.capacity || body.capacidad,
      estado: estadoFrontendToBackend(body.status || body.estado) || 'Libre',
      tipo: body.type || body.tipo || 'normal'
    }

    const loc = body.location || body.ubicacion
    if (loc !== undefined) {
      if (mongoose.Types.ObjectId.isValid(String(loc))) {
        mesaData.ubicacionId = new mongoose.Types.ObjectId(String(loc))
      } else {
        mesaData.ubicacion = String(loc)
      }
    }

    const nuevaMesa = new Mesa(mesaData)
    await nuevaMesa.save()

    const nuevaMesaPoblada = (await Mesa.findById(nuevaMesa._id).populate(
      'ubicacionId',
      'nombre'
    )) as MesaPoblada
    const mapped = mapMesa(nuevaMesaPoblada)

    try {
      getIO().emit('mesas:created', mapped)
    } catch (e) {}

    res.status(201).json(mapped)
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al crear la mesa', error: err.message || err })
  }
}

export const obtenerMesas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { location } = req.query
    let filtro: Record<string, any> = {}

    if (location) {
      if (mongoose.Types.ObjectId.isValid(String(location))) {
        filtro = { ubicacionId: location }
      } else {
        filtro = { ubicacion: location }
      }
    }

    const mesas = (await Mesa.find(filtro).populate('ubicacionId', 'nombre')) as MesaPoblada[]
    res.status(200).json(mesas.map(mapMesa))
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al obtener las mesas', error: err.message || err })
  }
}

export const obtenerMesaPorId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const mesa = (await Mesa.findById(id).populate('ubicacionId', 'nombre')) as MesaPoblada | null

    if (!mesa) {
      res.status(404).json({ mensaje: 'Mesa no encontrada' })
      return
    }

    res.status(200).json(mapMesa(mesa))
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al obtener la mesa', error: err.message || err })
  }
}

export const actualizarMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const body: MesaPayload = req.body
    const update: Record<string, any> = {}

    if (body.name !== undefined) {
      const validacion = validarNombreMesa(body.name)
      if (!validacion.valido) {
        res.status(400).json({ mensaje: validacion.mensaje })
        return
      }

      const regexNombre = new RegExp(`^${escapeRegex((body.name || '').trim())}$`, 'i')
      const existente = await Mesa.findOne({ numero: regexNombre, _id: { $ne: id } })
      if (existente) {
        res
          .status(400)
          .json({ mensaje: 'El nombre de la mesa ya está en uso. Intenta con otro nombre.' })
        return
      }
      update.numero = body.name.trim()
    }
    if (body.capacity !== undefined) update.capacidad = body.capacity

    const loc = body.location || body.ubicacion
    if (loc !== undefined) {
      if (mongoose.Types.ObjectId.isValid(String(loc))) {
        update.ubicacionId = new mongoose.Types.ObjectId(String(loc))
        update.$unset = { ubicacion: 1 } // Eliminamos el campo de texto si hay ID
      } else {
        update.ubicacion = String(loc)
        update.$unset = { ubicacionId: 1 } // Eliminamos el ID si mandan texto
      }
    }

    if (body.status !== undefined) update.estado = estadoFrontendToBackend(body.status)
    if (body.type !== undefined) update.tipo = body.type

    const mesaActualizada = (await Mesa.findByIdAndUpdate(id, update, {
      returnDocument: 'after'
    }).populate('ubicacionId', 'nombre')) as MesaPoblada | null

    if (!mesaActualizada) {
      res.status(404).json({ mensaje: 'Mesa no encontrada' })
      return
    }

    const mapped = mapMesa(mesaActualizada)
    try {
      getIO().emit('mesas:updated', mapped)
    } catch (e) {}

    res.status(200).json(mapped)
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al actualizar la mesa', error: err.message || err })
  }
}

export const actualizarEstadoMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { estado } = req.body
    const backendStatus = estadoFrontendToBackend(estado) || estado

    const mesaActualizada = (await Mesa.findByIdAndUpdate(
      id,
      { estado: backendStatus },
      { returnDocument: 'after' }
    ).populate('ubicacionId', 'nombre')) as MesaPoblada | null

    if (!mesaActualizada) {
      res.status(404).json({ mensaje: 'Mesa no encontrada' })
      return
    }

    const mapped = mapMesa(mesaActualizada)
    try {
      getIO().emit('mesas:updated', mapped)
    } catch (e) {}

    res.status(200).json(mapped)
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al actualizar estado', error: err.message || err })
  }
}

export const eliminarMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const eliminado = (await Mesa.findByIdAndDelete(id)) as MesaPoblada | null

    if (!eliminado) {
      res.status(404).json({ mensaje: 'Mesa no encontrada' })
      return
    }

    const mapped = mapMesa(eliminado)
    try {
      getIO().emit('mesas:deleted', mapped)
    } catch (e) {}

    res.status(200).json({ mensaje: 'Mesa eliminada', mesa: mapped })
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al eliminar mesa', error: err.message || err })
  }
}
