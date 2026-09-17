// src/controllers/reserva.controller.ts
import { Response } from 'express'
import mongoose from 'mongoose'
import Reserva from '../models/Reserva'
import Mesa from '../models/Mesa'
import { getIO } from '../socket/socket'
import { CustomRequest } from '../middlewares/auth.middleware'
import Contador from '../models/Contador'
import { obtenerFechaBolivia } from '../utils/fechaBolivia'

const formatearFechaReservaBolivia = (fechaReserva: string, horaReserva: string): string => {
  const [anio, mes, dia] = String(fechaReserva).split('T')[0].split('-')
  const horaNormalizada = String(horaReserva).length === 5 ? `${horaReserva}:00` : horaReserva

  return `${dia}/${mes}/${anio}, ${horaNormalizada}`
}

export const crearReserva = async (req: CustomRequest, res: Response): Promise<any> => {
  try {
    const { mesa, tableId, date, fecha, time, hora, clientName, guestCount } = req.body

    const mesaId = mesa || tableId
    const fechaReserva = date || fecha
    const horaReserva = time || hora
    const nombreCliente = clientName
    const cantidadPersonas = guestCount
    const usuarioId = req.usuario?.id

    if (!usuarioId) {
      return res.status(401).json({ mensaje: 'Usuario no autenticado.' })
    }

    if (!mesaId || !fechaReserva || !horaReserva || !nombreCliente || !cantidadPersonas) {
      return res.status(400).json({
        mensaje:
          'Faltan datos obligatorios: mesa/tableId, date/fecha, time/hora, clientName y guestCount.'
      })
    }

    if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/.test(nombreCliente)) {
      return res.status(400).json({
        mensaje: 'El nombre del cliente solo debe contener letras. Ejemplo: "Maria Lopez"'
      })
    }

    if (cantidadPersonas < 1 || cantidadPersonas > 20) {
      return res.status(400).json({ mensaje: 'El número de personas debe estar entre 1 y 20.' })
    }

    if (!mongoose.Types.ObjectId.isValid(mesaId)) {
      return res.status(400).json({ mensaje: 'El id de la mesa no es válido.' })
    }

    const mesaEncontrada = await Mesa.findById(mesaId)
    if (!mesaEncontrada) {
      return res.status(404).json({ mensaje: 'La mesa no existe en la base de datos.' })
    }

    if (cantidadPersonas > mesaEncontrada.capacidad) {
      return res.status(400).json({
        mensaje: `La cantidad de personas (${cantidadPersonas}) supera la capacidad de la mesa (${mesaEncontrada.capacidad}).`
      })
    }

    const reservaExistente = await Reserva.findOne({
      mesa: mesaId,
      fecha: new Date(fechaReserva),
      hora: horaReserva
    })

    if (reservaExistente) {
      return res.status(409).json({
        mensaje: 'Ya existe una reserva para esa mesa en esa fecha y hora.'
      })
    }

    const contadorDoc: any = await Contador.findOneAndUpdate(
      { nombre_secuencia: 'reservas_restaurante' },
      { $inc: { secuencia: 1 } },
      { returnDocument: 'after', upsert: true } // Si no existe, lo crea y le pone 1
    )

    const elPedidoIdFormateado = `Pedido ${contadorDoc.secuencia}`

    // RESOLUCIÓN RIESGO LÓGICO: Usamos el contador atómico para asegurar que el código RES-XXXX sea único
    const codigoGenerado = `RES-${String(contadorDoc.secuencia).padStart(4, '0')}`

    // RESOLUCIÓN: Mantenemos ambos identificadores para compatibilidad con el equipo
    const nuevaReserva = new Reserva({
      codigo: codigoGenerado,
      pedidoId: elPedidoIdFormateado, // <--- 🛠️ LÍNEA RESTAURADA PARA EVITAR EL ERROR DE MONGODB
      fechaBolivia: formatearFechaReservaBolivia(fechaReserva, horaReserva),
      fecha: new Date(fechaReserva),
      hora: horaReserva,
      clienteNombre: nombreCliente,
      cantidadPersonas,
      mesa: mesaId,
      usuario: usuarioId,
      usuarioModel: req.usuario?.rol === 'Cliente' ? 'Cliente' : 'Usuario'
    })

    await nuevaReserva.save()

    // 1. Cambio de estado instantáneo: Pasamos a 'Reservada' si actualmente está 'Libre'
    let cambiarAReservada = false
    if (mesaEncontrada.estado === 'Libre') {
      await Mesa.findByIdAndUpdate(mesaId, { estado: 'Reservada' })
      cambiarAReservada = true
    }

    // 2. Lógica de clonD: Hacemos el populate para tener toda la info
    const reservaGuardada = await Reserva.findById(nuevaReserva._id)
      .populate('mesa', 'numero ubicacion capacidad estado')
      .populate('usuario', 'nombre apellido apellidos email rol')

    // RESOLUCIÓN: Agregamos tanto 'codigo' como 'numeroPedido' en la salida JSON
    const reservaFormateada = {
      id: reservaGuardada?._id,
      _id: reservaGuardada?._id,
      codigo: reservaGuardada?.codigo,
      clientName: reservaGuardada?.clienteNombre,
      clienteNombre: reservaGuardada?.clienteNombre,
      guestCount: reservaGuardada?.cantidadPersonas,
      cantidadPersonas: reservaGuardada?.cantidadPersonas,
      dateBolivia: reservaGuardada?.fechaBolivia,
      date: reservaGuardada?.fecha,
      time: reservaGuardada?.hora,
      startTime: reservaGuardada?.hora,
      mesa: reservaGuardada?.mesa,
      usuario: reservaGuardada?.usuario,
      createdAt: reservaGuardada?.createdAt
    }

    // 3. Lógica de Gustavo: Emitimos la reserva por WebSockets (pero con los datos formateados)
    try {
      getIO().emit('nueva_reserva', reservaFormateada)

      if (cambiarAReservada) {
        // Emitimos también que la mesa se actualizó para que en el mapa cambie a "Reservada" en tiempo real
        getIO().emit('mesas:updated', { id: mesaId, status: 'Reservada' })
      }
    } catch (socketError) {
      console.error('Socket no inicializado o error al emitir:', socketError)
    }

    return res.status(201).json(reservaFormateada)
  } catch (error) {
    console.error('Error al crear la reserva:', error)
    return res.status(500).json({ mensaje: 'Error al crear la reserva', error })
  }
}

export const obtenerReservas = async (req: CustomRequest, res: Response): Promise<any> => {
  try {
    const reservas = await Reserva.find()
      .populate('mesa', 'numero ubicacion capacidad estado')
      .populate('usuario', 'nombre apellido apellidos email rol')
      .sort({ createdAt: -1 })

    // RESOLUCIÓN: Devolvemos tanto 'codigo' como 'numeroPedido' en el listado
    const reservasFormateadas = reservas.map((reserva) => ({
      id: reserva._id,
      codigo: reserva.codigo,
      //numeroPedido: reserva.pedidoId, // <--- 🛠️ RESTAURADO PARA EL FRONTEND
      clientName: reserva.clienteNombre,
      guestCount: reserva.cantidadPersonas,
      dateBolivia: reserva.fechaBolivia,
      date: reserva.fecha,
      time: reserva.hora,
      mesa: reserva.mesa,
      usuario: reserva.usuario,
      createdAt: reserva.createdAt
    }))

    return res.status(200).json(reservasFormateadas)
  } catch (error) {
    console.error('Error al obtener las reservas:', error)
    return res.status(500).json({ mensaje: 'Error al obtener las reservas', error })
  }
}

export const eliminarReserva = async (req: CustomRequest, res: Response) => {
  try {
    const id = String(req.params.id)

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ mensaje: 'El id de la reserva no es válido.' })
    }

    const reserva = await Reserva.findById(id)

    if (!reserva) {
      return res.status(404).json({ mensaje: 'Reserva no encontrada.' })
    }

    const mesaId = reserva.mesa
    const mesaActual = await Mesa.findById(mesaId) // Recuperamos su estado real antes de eliminar

    await Reserva.findByIdAndDelete(id)

    // Contamos solo las reservas desde hoy hacia el futuro (las pasadas ya no importan)
    const inicioHoy = obtenerFechaBolivia()
    inicioHoy.setHours(0, 0, 0, 0)
    const reservasRestantes = await Reserva.countDocuments({
      mesa: mesaId,
      fecha: { $gte: inicioHoy }
    })

    try {
      // Siempre avisamos que la reserva desapareció de la lista de la interfaz
      getIO().emit('reserva_eliminada', { id, tableId: mesaId })

      // PROTECCIÓN CRÍTICA (Bug 3): Solo pasamos a Libre si la mesa actualmente estaba "Reservada"
      // Si estaba "Ocupada" o "Cuenta Solicitada", NO debemos tocarla.
      if (mesaActual && mesaActual.estado === 'Reservada') {
        if (reservasRestantes === 0) {
          await Mesa.findByIdAndUpdate(mesaId, { estado: 'Libre' })
          getIO().emit('mesas:updated', { id: mesaId, status: 'Disponible' })
        }
        // Si quedan reservas (> 0), se queda en Reservada, no hacemos nada más.
      }
    } catch (e) {
      console.warn('Error emitiendo socket de eliminación', e)
    }

    return res.status(200).json({
      mensaje: 'Reserva eliminada correctamente.'
    })
  } catch (error) {
    console.error('Error al eliminar la reserva:', error)
    return res.status(500).json({ mensaje: 'Error al eliminar la reserva', error })
  }
}
