// src/services/contador.service.ts
import mongoose from 'mongoose'
import Contador from '../models/Contador'
import Pedido from '../models/Pedido'
import Reserva from '../models/Reserva'
import { obtenerFechaISO_Bolivia } from '../utils/fechaBolivia'

export interface ResultadoCodigoPedido {
  codigo: string
  fechaDiaBolivia: string
}

export interface ResultadoCodigoReserva {
  codigo: string
  numeroReserva: string
  pedidoId: string
  fechaDiaBolivia: string
}

/**
 * Genera el siguiente código secuencial diario para Pedidos (ej. PED-0001).
 * Implementa Smart Seed atómico con $setOnInsert + $inc para evitar condiciones de carrera.
 * Es compatible con sesiones de transacciones MongoDB.
 */
export async function generarSiguienteCodigoPedido(
  session?: mongoose.ClientSession,
  fechaOverride?: string
): Promise<ResultadoCodigoPedido> {
  const fechaDiaBolivia = fechaOverride || obtenerFechaISO_Bolivia()
  const claveSecuencia = `pedidos_${fechaDiaBolivia}`

  // 1. Determinar el punto de partida (Smart Seed) inspeccionando pedidos existentes del día
  const queryOptions = session ? { session } : {}
  const pedidosDelDia = await Pedido.find(
    { fechaDiaBolivia, codigo: /^PED-\d{4}$/ },
    { codigo: 1 },
    queryOptions
  ).lean()

  const maxSecuencia =
    pedidosDelDia.length > 0
      ? Math.max(
          0,
          ...pedidosDelDia.map((p) => {
            const num = parseInt(String(p.codigo).replace('PED-', ''), 10)
            return Number.isFinite(num) ? num : 0
          })
        )
      : 0

  // 2. Siembra atómica idempotente: si la secuencia no existe, la crea con maxSecuencia.
  // Si ya existe, es un no-op garantizado por MongoDB sin errores E11000.
  await Contador.updateOne(
    { nombre_secuencia: claveSecuencia },
    { $setOnInsert: { nombre_secuencia: claveSecuencia, secuencia: maxSecuencia } },
    { upsert: true, session }
  )

  // 3. Incremento atómico
  const doc: any = await Contador.findOneAndUpdate(
    { nombre_secuencia: claveSecuencia },
    { $inc: { secuencia: 1 } },
    { returnDocument: 'after', session }
  )

  const codigo = `PED-${String(doc.secuencia).padStart(4, '0')}`

  return {
    codigo,
    fechaDiaBolivia
  }
}

/**
 * Genera el siguiente código secuencial diario para Reservas (ej. RES-0001, Reserva 1).
 * Implementa Smart Seed atómico con $setOnInsert + $inc independiente de los pedidos.
 */
export async function generarSiguienteCodigoReserva(
  fechaOverride?: string
): Promise<ResultadoCodigoReserva> {
  const fechaDiaBolivia = fechaOverride || obtenerFechaISO_Bolivia()
  const claveSecuencia = `reservas_${fechaDiaBolivia}`

  // 1. Determinar el punto de partida (Smart Seed) inspeccionando reservas existentes del día
  const reservasDelDia = await Reserva.find(
    { fechaDiaBolivia, codigo: /^RES-\d{4}$/ },
    { codigo: 1 }
  ).lean()

  const maxSecuencia =
    reservasDelDia.length > 0
      ? Math.max(
          0,
          ...reservasDelDia.map((r) => {
            const num = parseInt(String(r.codigo).replace('RES-', ''), 10)
            return Number.isFinite(num) ? num : 0
          })
        )
      : 0

  // 2. Siembra atómica idempotente
  await Contador.updateOne(
    { nombre_secuencia: claveSecuencia },
    { $setOnInsert: { nombre_secuencia: claveSecuencia, secuencia: maxSecuencia } },
    { upsert: true }
  )

  // 3. Incremento atómico independiente
  const doc: any = await Contador.findOneAndUpdate(
    { nombre_secuencia: claveSecuencia },
    { $inc: { secuencia: 1 } },
    { returnDocument: 'after' }
  )

  const codigo = `RES-${String(doc.secuencia).padStart(4, '0')}`
  const numeroReserva = `Reserva ${doc.secuencia}`

  return {
    codigo,
    numeroReserva,
    pedidoId: numeroReserva, // Retrocompatibilidad temporal para pantallas que lean pedidoId
    fechaDiaBolivia
  }
}
