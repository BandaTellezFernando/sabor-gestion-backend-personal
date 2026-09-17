//src/controllers/direccion.controller.ts
import { Response } from 'express'
import Usuario from '../models/Usuario'
import { CustomRequest } from '../middlewares/auth.middleware'

const coordenadaValida = (lat: unknown, lng: unknown): boolean => {
  const latNum = Number(lat)
  const lngNum = Number(lng)

  return (
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    latNum !== 0 &&
    lngNum !== 0 &&
    latNum >= -90 &&
    latNum <= 90 &&
    lngNum >= -180 &&
    lngNum <= 180
  )
}

export const agregarDireccionEntrega = async (req: CustomRequest, res: Response): Promise<any> => {
  try {
    const { lat, lng, etiqueta } = req.body

    if (!coordenadaValida(lat, lng)) {
      return res.status(400).json({
        success: false,
        mensaje:
          'Las coordenadas no pueden ser nulas, cero o estar fuera de rango. La geolocalizacion es obligatoria.'
      })
    }

    const clienteId = req.usuario?.id
    if (!clienteId) {
      return res.status(401).json({ success: false, mensaje: 'Usuario no autenticado' })
    }

    const usuarioActualizado = await Usuario.findByIdAndUpdate(
      clienteId,
      {
        $push: {
          direccionesDelivery: {
            etiqueta: (etiqueta || 'Direccion de Entrega').toString().trim(),
            lat: Number(lat),
            lng: Number(lng)
          }
        }
      },
      { returnDocument: 'after' }
    )

    if (!usuarioActualizado) {
      return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' })
    }

    return res.status(201).json({
      success: true,
      mensaje: 'Direccion anadida exitosamente al perfil',
      direcciones: usuarioActualizado.direccionesDelivery
    })
  } catch (error: any) {
    console.error('agregarDireccionEntrega error:', error)
    return res.status(500).json({
      success: false,
      mensaje: 'Error en el servidor al actualizar las direcciones',
      error: error.message || error
    })
  }
}

export const listarDireccionesEntrega = async (req: CustomRequest, res: Response): Promise<any> => {
  try {
    const clienteId = req.usuario?.id
    if (!clienteId) {
      return res.status(401).json({ success: false, mensaje: 'Usuario no autenticado' })
    }

    const usuario = await Usuario.findById(clienteId).select('direccionesDelivery')
    if (!usuario) {
      return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' })
    }

    return res.status(200).json({ success: true, direcciones: usuario.direccionesDelivery })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      mensaje: 'Error al obtener direcciones',
      error: error.message || error
    })
  }
}

export const eliminarDireccionEntrega = async (req: CustomRequest, res: Response): Promise<any> => {
  try {
    const clienteId = req.usuario?.id
    const { id } = req.params

    if (!clienteId) {
      return res.status(401).json({ success: false, mensaje: 'Usuario no autenticado' })
    }

    const usuarioActualizado = await Usuario.findByIdAndUpdate(
      clienteId,
      { $pull: { direccionesDelivery: { _id: id } } },
      { returnDocument: 'after' }
    )

    if (!usuarioActualizado) {
      return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' })
    }

    return res.status(200).json({
      success: true,
      mensaje: 'Direccion eliminada exitosamente',
      direcciones: usuarioActualizado.direccionesDelivery
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      mensaje: 'Error al eliminar direccion',
      error: error.message || error
    })
  }
}
