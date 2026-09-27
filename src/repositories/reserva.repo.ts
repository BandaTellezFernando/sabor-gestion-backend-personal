// src/repositories/reserva.repo.ts
import { Types } from 'mongoose'
import Reserva, { IReserva } from '../models/Reserva'

export { IReserva } from '../models/Reserva'

export interface ReservaCrearDatos {
  codigo: string
  numeroReserva?: string
  pedidoId?: string
  fechaDiaBolivia?: string
  fechaBolivia?: string
  fecha: Date
  hora: string
  clienteNombre: string
  cantidadPersonas: number
  vip?: boolean
  mesa: string | Types.ObjectId
  usuario: string | Types.ObjectId
}

export class ReservaRepository {
  /**
   * Obtiene todas las reservas con mesa y usuario poblados, ordenadas por fecha de creación descendente
   */
  async buscarTodos(): Promise<IReserva[]> {
    return await Reserva.find()
      .populate('mesa', 'numero ubicacion capacidad estado')
      .populate('usuario', 'nombre apellido apellidos email rol')
      .sort({ createdAt: -1 })
  }

  /**
   * Busca una reserva por su identificador único (sin populate)
   */
  async buscarPorId(id: string): Promise<IReserva | null> {
    return await Reserva.findById(id)
  }

  /**
   * Busca una reserva por su identificador único con mesa y usuario poblados
   */
  async buscarPorIdPoblada(id: string): Promise<IReserva | null> {
    return await Reserva.findById(id)
      .populate('mesa', 'numero ubicacion capacidad estado')
      .populate('usuario', 'nombre apellido apellidos email rol')
  }

  /**
   * Busca si ya existe una reserva para una mesa específica en una fecha y hora determinadas
   */
  async buscarPorMesaYHorario(
    mesaId: string | Types.ObjectId,
    fecha: Date,
    hora: string
  ): Promise<IReserva | null> {
    return await Reserva.findOne({
      mesa: mesaId,
      fecha,
      hora
    })
  }

  /**
   * Crea y guarda una nueva reserva en MongoDB
   */
  async crear(datos: ReservaCrearDatos): Promise<IReserva> {
    const nuevaReserva = new Reserva(datos)
    return await nuevaReserva.save()
  }

  /**
   * Elimina una reserva de MongoDB por su identificador único
   */
  async eliminar(id: string): Promise<IReserva | null> {
    return await Reserva.findByIdAndDelete(id)
  }

  /**
   * Cuenta cuántas reservas activas/futuras tiene una mesa a partir de una fecha dada
   */
  async contarReservasFuturasPorMesa(
    mesaId: string | Types.ObjectId,
    desdeFecha: Date
  ): Promise<number> {
    return await Reserva.countDocuments({
      mesa: mesaId,
      fecha: { $gte: desdeFecha }
    })
  }
}

export const reservaRepository = new ReservaRepository()
