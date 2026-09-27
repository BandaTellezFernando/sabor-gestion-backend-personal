// src/services/reserva.service.ts
import { Types } from 'mongoose'
import {
  ReservaRepository,
  reservaRepository,
  IReserva
} from '../repositories/reserva.repo'
import { MesaRepository, mesaRepository } from '../repositories/mesa.repo'
import { generarSiguienteCodigoReserva } from './contador.service'
import { obtenerFechaBolivia } from '../utils/fechaBolivia'

export class ReservaServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'ReservaServiceError'
  }
}

export interface CrearReservaDTO {
  mesa?: string
  tableId?: string
  date?: string
  fecha?: string
  time?: string
  hora?: string
  clientName?: string
  guestCount?: number
}

export interface ReservaFormateadaDTO {
  id?: any
  _id?: any
  codigo?: string
  numeroReserva?: string
  pedidoId?: string
  fechaDiaBolivia?: string
  clientName?: string
  clienteNombre?: string
  guestCount?: number
  cantidadPersonas?: number
  dateBolivia?: string
  date?: Date
  time?: string
  startTime?: string
  mesa?: any
  usuario?: any
  createdAt?: Date
}

export interface ResultadoCreacionReserva {
  reserva: ReservaFormateadaDTO
  mesaActualizadaAReservada: boolean
  mesaId: string
}

export interface ResultadoEliminacionReserva {
  reservaId: string
  mesaId: string
  mesaLiberada: boolean
}

export const formatearFechaReservaBolivia = (
  fechaReserva: string,
  horaReserva: string
): string => {
  const [anio, mes, dia] = String(fechaReserva).split('T')[0].split('-')
  const horaNormalizada =
    String(horaReserva).length === 5 ? `${horaReserva}:00` : horaReserva

  return `${dia}/${mes}/${anio}, ${horaNormalizada}`
}

const mapearReservaFormateada = (doc: any): ReservaFormateadaDTO => ({
  id: doc?._id,
  _id: doc?._id,
  codigo: doc?.codigo,
  numeroReserva: doc?.numeroReserva || doc?.pedidoId,
  pedidoId: doc?.pedidoId || doc?.numeroReserva,
  fechaDiaBolivia: doc?.fechaDiaBolivia,
  clientName: doc?.clienteNombre,
  clienteNombre: doc?.clienteNombre,
  guestCount: doc?.cantidadPersonas,
  cantidadPersonas: doc?.cantidadPersonas,
  dateBolivia: doc?.fechaBolivia,
  date: doc?.fecha,
  time: doc?.hora,
  startTime: doc?.hora,
  mesa: doc?.mesa,
  usuario: doc?.usuario,
  createdAt: doc?.createdAt
})

export class ReservaService {
  constructor(
    private reservaRepo: ReservaRepository = reservaRepository,
    private mesaRepo: MesaRepository = mesaRepository
  ) {}

  /**
   * Valida las reglas de negocio y crea una nueva reserva
   */
  async crearReserva(
    datos: CrearReservaDTO,
    usuarioId?: string
  ): Promise<ResultadoCreacionReserva> {
    if (!usuarioId) {
      throw new ReservaServiceError(401, 'Usuario no autenticado.')
    }

    const mesaId = datos.mesa || datos.tableId
    const fechaReserva = datos.date || datos.fecha
    const horaReserva = datos.time || datos.hora
    const nombreCliente = datos.clientName
    const cantidadPersonas = datos.guestCount

    if (
      !mesaId ||
      !fechaReserva ||
      !horaReserva ||
      !nombreCliente ||
      !cantidadPersonas
    ) {
      throw new ReservaServiceError(
        400,
        'Faltan datos obligatorios: mesa/tableId, date/fecha, time/hora, clientName y guestCount.'
      )
    }

    if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/.test(nombreCliente)) {
      throw new ReservaServiceError(
        400,
        'El nombre del cliente solo debe contener letras. Ejemplo: "Maria Lopez"'
      )
    }

    if (cantidadPersonas < 1 || cantidadPersonas > 20) {
      throw new ReservaServiceError(
        400,
        'El número de personas debe estar entre 1 y 20.'
      )
    }

    if (!Types.ObjectId.isValid(mesaId)) {
      throw new ReservaServiceError(400, 'El id de la mesa no es válido.')
    }

    const mesaEncontrada = await this.mesaRepo.buscarPorId(mesaId)
    if (!mesaEncontrada) {
      throw new ReservaServiceError(
        404,
        'La mesa no existe en la base de datos.'
      )
    }

    if (cantidadPersonas > mesaEncontrada.capacidad) {
      throw new ReservaServiceError(
        400,
        `La cantidad de personas (${cantidadPersonas}) supera la capacidad de la mesa (${mesaEncontrada.capacidad}).`
      )
    }

    const fechaObj = new Date(fechaReserva)
    const reservaExistente = await this.reservaRepo.buscarPorMesaYHorario(
      mesaId,
      fechaObj,
      horaReserva
    )

    if (reservaExistente) {
      throw new ReservaServiceError(
        409,
        'Ya existe una reserva para esa mesa en esa fecha y hora.'
      )
    }

    const { codigo, numeroReserva, pedidoId, fechaDiaBolivia } =
      await generarSiguienteCodigoReserva()

    const fechaBolivia = formatearFechaReservaBolivia(fechaReserva, horaReserva)

    const nuevaReserva = await this.reservaRepo.crear({
      codigo,
      numeroReserva,
      pedidoId,
      fechaDiaBolivia,
      fechaBolivia,
      fecha: fechaObj,
      hora: horaReserva,
      clienteNombre: nombreCliente,
      cantidadPersonas,
      mesa: mesaId,
      usuario: usuarioId
    })

    let mesaActualizadaAReservada = false
    if (mesaEncontrada.estado === 'Libre') {
      await this.mesaRepo.actualizarEstado(mesaId, 'Reservada')
      mesaActualizadaAReservada = true
    }

    const reservaGuardada = await this.reservaRepo.buscarPorIdPoblada(
      nuevaReserva._id.toString()
    )

    const reservaFormateada = mapearReservaFormateada(reservaGuardada)

    return {
      reserva: reservaFormateada,
      mesaActualizadaAReservada,
      mesaId
    }
  }

  /**
   * Obtiene todas las reservas registradas formateadas para la vista
   */
  async obtenerReservas(): Promise<ReservaFormateadaDTO[]> {
    const reservas = await this.reservaRepo.buscarTodos()
    return reservas.map((r) => mapearReservaFormateada(r))
  }

  /**
   * Elimina una reserva y libera la mesa si no le quedan reservas futuras
   */
  async eliminarReserva(id: string): Promise<ResultadoEliminacionReserva> {
    if (!Types.ObjectId.isValid(id)) {
      throw new ReservaServiceError(400, 'El id de la reserva no es válido.')
    }

    const reserva = await this.reservaRepo.buscarPorId(id)
    if (!reserva) {
      throw new ReservaServiceError(404, 'Reserva no encontrada.')
    }

    const mesaId = reserva.mesa.toString()
    const mesaActual = await this.mesaRepo.buscarPorId(mesaId)

    await this.reservaRepo.eliminar(id)

    const inicioHoy = obtenerFechaBolivia()
    inicioHoy.setHours(0, 0, 0, 0)
    const reservasRestantes =
      await this.reservaRepo.contarReservasFuturasPorMesa(mesaId, inicioHoy)

    let mesaLiberada = false
    if (mesaActual && mesaActual.estado === 'Reservada') {
      if (reservasRestantes === 0) {
        await this.mesaRepo.actualizarEstado(mesaId, 'Libre')
        mesaLiberada = true
      }
    }

    return {
      reservaId: id,
      mesaId,
      mesaLiberada
    }
  }
}

export const reservaService = new ReservaService()
