// src/controllers/reserva.controller.ts
import { Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import {
  reservaService,
  ReservaServiceError
} from '../services/reserva.service'
import { getIO } from '../socket/socket'

/**
 * Registra una nueva reserva tras validar reglas de negocio y disponibilidad de mesa
 */
export const crearReserva = async (
  req: CustomRequest,
  res: Response
): Promise<any> => {
  try {
    const usuarioId = req.usuario?.id
    const resultado = await reservaService.crearReserva(req.body, usuarioId)

    try {
      getIO().emit('nueva_reserva', resultado.reserva)

      if (resultado.mesaActualizadaAReservada) {
        getIO().emit('mesas:updated', {
          id: resultado.mesaId,
          status: 'Reservada'
        })
      }
    } catch (socketError) {
      console.error('Socket no inicializado o error al emitir:', socketError)
    }

    return res.status(201).json(resultado.reserva)
  } catch (error: any) {
    if (error instanceof ReservaServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    console.error('Error al crear la reserva:', error)
    return res
      .status(500)
      .json({ mensaje: 'Error al crear la reserva', error: error?.message || error })
  }
}

/**
 * Obtiene el listado completo de reservas registradas
 */
export const obtenerReservas = async (
  _req: CustomRequest,
  res: Response
): Promise<any> => {
  try {
    const reservas = await reservaService.obtenerReservas()
    return res.status(200).json(reservas)
  } catch (error: any) {
    if (error instanceof ReservaServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    console.error('Error al obtener las reservas:', error)
    return res
      .status(500)
      .json({ mensaje: 'Error al obtener las reservas', error: error?.message || error })
  }
}

/**
 * Elimina una reserva y libera la mesa si no tiene más reservas futuras
 */
export const eliminarReserva = async (
  req: CustomRequest,
  res: Response
): Promise<any> => {
  try {
    const id = String(req.params.id)
    const resultado = await reservaService.eliminarReserva(id)

    try {
      getIO().emit('reserva_eliminada', {
        id: resultado.reservaId,
        tableId: resultado.mesaId
      })

      if (resultado.mesaLiberada) {
        getIO().emit('mesas:updated', {
          id: resultado.mesaId,
          status: 'Disponible'
        })
      }
    } catch (e) {
      console.warn('Error emitiendo socket de eliminación', e)
    }

    return res.status(200).json({
      mensaje: 'Reserva eliminada correctamente.'
    })
  } catch (error: any) {
    if (error instanceof ReservaServiceError) {
      return res.status(error.statusCode).json({ mensaje: error.message })
    }
    console.error('Error al eliminar la reserva:', error)
    return res
      .status(500)
      .json({ mensaje: 'Error al eliminar la reserva', error: error?.message || error })
  }
}
