// src/services/contador.service.ts
import { ClientSession } from 'mongoose'
import { ContadorRepository, contadorRepository } from '../repositories/contador.repo'
import { PedidoRepository, pedidoRepository } from '../repositories/pedido.repo'
import { ReservaRepository, reservaRepository } from '../repositories/reserva.repo'
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

export class ContadorService {
  private contadorRepo: ContadorRepository
  private pedidoRepo: PedidoRepository
  private reservaRepo: ReservaRepository

  constructor(
    contadorRepo: ContadorRepository = contadorRepository,
    pedidoRepo: PedidoRepository = pedidoRepository,
    reservaRepo: ReservaRepository = reservaRepository
  ) {
    this.contadorRepo = contadorRepo
    this.pedidoRepo = pedidoRepo
    this.reservaRepo = reservaRepo
  }

  /**
   * Genera el siguiente código secuencial diario para Pedidos (ej. PED-0001).
   * Implementa Smart Seed atómico con $setOnInsert + $inc para evitar condiciones de carrera.
   * Es compatible con sesiones de transacciones MongoDB.
   */
  async generarSiguienteCodigoPedido(
    session?: ClientSession,
    fechaOverride?: string
  ): Promise<ResultadoCodigoPedido> {
    const fechaDiaBolivia = fechaOverride || obtenerFechaISO_Bolivia()
    const claveSecuencia = `pedidos_${fechaDiaBolivia}`

    // 1. Determinar el punto de partida (Smart Seed) inspeccionando pedidos existentes del día
    const pedidosDelDia = await this.pedidoRepo.obtenerCodigosPorFechaDia(fechaDiaBolivia, session)

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
    await this.contadorRepo.inicializarSecuenciaSiNoExiste(claveSecuencia, maxSecuencia, session)

    // 3. Incremento atómico
    const doc = await this.contadorRepo.incrementarSecuencia(claveSecuencia, session)
    if (!doc) {
      throw new Error(`Error al incrementar la secuencia del contador: ${claveSecuencia}`)
    }

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
  async generarSiguienteCodigoReserva(
    fechaOverride?: string
  ): Promise<ResultadoCodigoReserva> {
    const fechaDiaBolivia = fechaOverride || obtenerFechaISO_Bolivia()
    const claveSecuencia = `reservas_${fechaDiaBolivia}`

    // 1. Determinar el punto de partida (Smart Seed) inspeccionando reservas existentes del día
    const reservasDelDia = await this.reservaRepo.obtenerCodigosPorFechaDia(fechaDiaBolivia)

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
    await this.contadorRepo.inicializarSecuenciaSiNoExiste(claveSecuencia, maxSecuencia)

    // 3. Incremento atómico independiente
    const doc = await this.contadorRepo.incrementarSecuencia(claveSecuencia)
    if (!doc) {
      throw new Error(`Error al incrementar la secuencia del contador: ${claveSecuencia}`)
    }

    const codigo = `RES-${String(doc.secuencia).padStart(4, '0')}`
    const numeroReserva = `Reserva ${doc.secuencia}`

    return {
      codigo,
      numeroReserva,
      pedidoId: numeroReserva, // Retrocompatibilidad temporal para pantallas que lean pedidoId
      fechaDiaBolivia
    }
  }
}

export const contadorService = new ContadorService()

/**
 * Funciones exportadas para mantener compatibilidad 100% transparente con consumidores existentes
 */
export async function generarSiguienteCodigoPedido(
  session?: ClientSession,
  fechaOverride?: string
): Promise<ResultadoCodigoPedido> {
  return await contadorService.generarSiguienteCodigoPedido(session, fechaOverride)
}

export async function generarSiguienteCodigoReserva(
  fechaOverride?: string
): Promise<ResultadoCodigoReserva> {
  return await contadorService.generarSiguienteCodigoReserva(fechaOverride)
}
