// src/services/mesaOcupacion.service.ts
import mongoose, { Types } from 'mongoose'
import {
  MesaOcupacionRepository,
  mesaOcupacionRepository,
  IMesaOcupacionTemporal
} from '../repositories/mesaOcupacion.repo'
import { MesaRepository, mesaRepository } from '../repositories/mesa.repo'
import { PedidoRepository, pedidoRepository } from '../repositories/pedido.repo'
import { mesaService, MesaResponseDTO } from './mesa.service'
import { getIO } from '../socket/socket'
import { ESTADOS_MESA } from '../utils/constants'

export class MesaOcupacionServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'MesaOcupacionServiceError'
  }
}

export interface MesaOcupacionResponseDTO {
  mesaId: string
  usuarioId: string
  creadaEn: Date
  expiraEn: Date
}

export interface OcupacionInfoDTO {
  activa: boolean
  mesaId?: string
  usuarioId?: string
  creadaEn?: Date
  expiraEn?: Date
  segundosRestantes?: number
}

export class MesaOcupacionService {
  private intervalId: NodeJS.Timeout | null = null

  constructor(
    private mesaOcupacionRepo: MesaOcupacionRepository = mesaOcupacionRepository,
    private mesaRepo: MesaRepository = mesaRepository,
    private pedidoRepo: PedidoRepository = pedidoRepository
  ) {}

  /**
   * Obtiene la duración de ocupación temporal en minutos desde variables de entorno (default: 10)
   */
  obtenerTimeoutMinutos(): number {
    const val = process.env.MESA_OCUPACION_TIMEOUT_MINUTOS
    if (val) {
      const parsed = parseInt(val, 10)
      if (!isNaN(parsed) && parsed > 0) {
        return parsed
      }
    }
    return 10
  }

  /**
   * Ocupa una mesa temporalmente para un usuario Mesero o Administrador.
   * Concurrencia segura: la transición atómica y el índice único previenen colisiones.
   */
  async ocuparMesaTemporal(
    mesaId: string,
    usuarioId: string
  ): Promise<{ mesa: MesaResponseDTO; ocupacion: MesaOcupacionResponseDTO }> {
    if (!mongoose.Types.ObjectId.isValid(mesaId)) {
      throw new MesaOcupacionServiceError(400, 'ID de mesa inválido')
    }

    if (!usuarioId) {
      throw new MesaOcupacionServiceError(401, 'Usuario no autenticado')
    }

    // 1. Limpiar si esta mesa específica tiene una ocupación previa expirada
    await this.verificarYLimpiarMesaExpirada(mesaId)

    // 2. Verificar existencia de la mesa
    const mesaExistente = await this.mesaRepo.buscarPorId(mesaId)
    if (!mesaExistente) {
      throw new MesaOcupacionServiceError(404, 'Mesa no encontrada')
    }

    // 3. Validación de estado: la mesa DEBE estar Libre
    if (mesaExistente.estado !== ESTADOS_MESA.LIBRE) {
      throw new MesaOcupacionServiceError(409, 'La mesa ya está ocupada.')
    }

    // 4. Parámetros de tiempo
    const timeoutMinutos = this.obtenerTimeoutMinutos()
    const creadaEn = new Date()
    const expiraEn = new Date(creadaEn.getTime() + timeoutMinutos * 60 * 1000)

    // 5. Transición atómica en base de datos (garantiza que solo un worker gane si hay solicitudes concurrentes)
    const mesaOcupada = await this.mesaRepo.ocuparMesaSiLibre(mesaId)
    if (!mesaOcupada) {
      throw new MesaOcupacionServiceError(409, 'La mesa ya está ocupada.')
    }

    let ocupacionCreada: IMesaOcupacionTemporal
    try {
      ocupacionCreada = await this.mesaOcupacionRepo.crear({
        mesaId,
        usuarioId,
        creadaEn,
        expiraEn
      })
    } catch (err: any) {
      // Si la inserción falló por índice único o condición de carrera, revertimos la mesa a Libre
      await this.mesaRepo.actualizarEstado(mesaId, ESTADOS_MESA.LIBRE)
      throw new MesaOcupacionServiceError(409, 'La mesa ya está ocupada.')
    }

    const mesaDTO = mesaService.mapMesa(mesaOcupada)!

    // 6. Emitir evento Socket.IO mesas:updated
    try {
      getIO().emit('mesas:updated', mesaDTO)
    } catch (e) {
      console.warn('Socket emit error en ocuparMesaTemporal:', e)
    }

    return {
      mesa: mesaDTO,
      ocupacion: {
        mesaId: ocupacionCreada.mesaId.toString(),
        usuarioId: ocupacionCreada.usuarioId.toString(),
        creadaEn: ocupacionCreada.creadaEn,
        expiraEn: ocupacionCreada.expiraEn
      }
    }
  }

  /**
   * Cancela la ocupación temporal de una mesa, devolviéndola a 'Libre' si no tiene pedidos activos.
   */
  async cancelarOcupacionTemporal(
    mesaId: string,
    usuarioId: string,
    usuarioRol: string
  ): Promise<{ mensaje: string; mesa?: MesaResponseDTO }> {
    if (!mongoose.Types.ObjectId.isValid(mesaId)) {
      throw new MesaOcupacionServiceError(400, 'ID de mesa inválido')
    }

    const ocupacion = await this.mesaOcupacionRepo.buscarPorMesaId(mesaId)
    if (!ocupacion) {
      throw new MesaOcupacionServiceError(
        404,
        'No existe una ocupación temporal activa para esta mesa.'
      )
    }

    // Verificar si ya expiró
    if (ocupacion.expiraEn <= new Date()) {
      await this.verificarYLimpiarMesaExpirada(mesaId)
      throw new MesaOcupacionServiceError(404, 'La ocupación temporal ya ha expirado.')
    }

    // Autorización: solo el usuario creador o un Administrador
    const esDuenio = ocupacion.usuarioId.toString() === usuarioId
    const esAdmin = usuarioRol === 'Administrador' || usuarioRol === 'superadmin'
    if (!esDuenio && !esAdmin) {
      throw new MesaOcupacionServiceError(
        403,
        'No tienes permiso para cancelar la ocupación de esta mesa.'
      )
    }

    // Comprobar si ya existe un Pedido activo asociado a la mesa
    const pedidoActivo = await this.pedidoRepo.buscarPedidoActivoPorMesa(mesaId)
    const mesa = await this.mesaRepo.buscarPorId(mesaId)
    if (pedidoActivo || mesa?.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
      throw new MesaOcupacionServiceError(
        409,
        'La ocupación temporal ya fue convertida en una comanda real y no puede ser cancelada.'
      )
    }

    // Eliminar ocupación temporal
    await this.mesaOcupacionRepo.eliminarPorMesaId(mesaId)

    // Liberar la mesa
    const mesaLiberada = await this.mesaRepo.actualizarEstado(mesaId, ESTADOS_MESA.LIBRE)
    const mesaDTO = mesaLiberada ? (mesaService.mapMesa(mesaLiberada) || undefined) : undefined

    if (mesaDTO) {
      try {
        getIO().emit('mesas:updated', mesaDTO)
      } catch (e) {
        console.warn('Socket emit error en cancelarOcupacionTemporal:', e)
      }
    }

    return {
      mensaje: 'Ocupación temporal cancelada exitosamente',
      mesa: mesaDTO
    }
  }

  /**
   * Consulta el estado de la ocupación temporal de una mesa.
   */
  async consultarOcupacionTemporal(
    mesaId: string,
    usuarioId?: string,
    usuarioRol?: string
  ): Promise<OcupacionInfoDTO> {
    if (!mongoose.Types.ObjectId.isValid(mesaId)) {
      throw new MesaOcupacionServiceError(400, 'ID de mesa inválido')
    }

    const ocupacion = await this.mesaOcupacionRepo.buscarPorMesaId(mesaId)
    if (!ocupacion) {
      return { activa: false }
    }

    const ahora = new Date()
    if (ocupacion.expiraEn <= ahora) {
      await this.verificarYLimpiarMesaExpirada(mesaId)
      return { activa: false }
    }

    const segundosRestantes = Math.max(
      0,
      Math.round((ocupacion.expiraEn.getTime() - ahora.getTime()) / 1000)
    )

    const esDuenio = Boolean(usuarioId && ocupacion.usuarioId.toString() === usuarioId)
    const esAdmin = usuarioRol === 'Administrador' || usuarioRol === 'superadmin'

    if (esDuenio || esAdmin) {
      return {
        activa: true,
        mesaId: ocupacion.mesaId.toString(),
        usuarioId: ocupacion.usuarioId.toString(),
        creadaEn: ocupacion.creadaEn,
        expiraEn: ocupacion.expiraEn,
        segundosRestantes
      }
    }

    // Para otros meseros, no revelar información de identidad del usuario
    return {
      activa: true,
      mesaId: ocupacion.mesaId.toString(),
      expiraEn: ocupacion.expiraEn,
      segundosRestantes
    }
  }

  /**
   * Limpia las ocupaciones temporales que hayan superado su tiempo de expiración.
   * Si la mesa no tiene un pedido activo que justifique seguir ocupada, la transiciona a 'Libre'.
   */
  async limpiarOcupacionesExpiradas(): Promise<number> {
    const expiradas = await this.mesaOcupacionRepo.buscarExpirados()
    let limpiadas = 0

    for (const doc of expiradas) {
      await this.mesaOcupacionRepo.eliminarPorId(doc._id)
      limpiadas++

      const mesaIdStr = doc.mesaId.toString()
      const pedidoActivo = await this.pedidoRepo.buscarPedidoActivoPorMesa(mesaIdStr)
      const mesa = await this.mesaRepo.buscarPorId(mesaIdStr)

      // Si NO tiene pedido activo y no está en Cuenta Solicitada, devolver a Libre
      if (!pedidoActivo && mesa && mesa.estado !== ESTADOS_MESA.CUENTA_SOLICITADA) {
        if (mesa.estado === ESTADOS_MESA.OCUPADA) {
          const mesaLiberada = await this.mesaRepo.actualizarEstado(mesaIdStr, ESTADOS_MESA.LIBRE)
          if (mesaLiberada) {
            try {
              getIO().emit('mesas:updated', mesaService.mapMesa(mesaLiberada))
            } catch (e) {
              console.warn('Socket error al limpiar ocupación expirada:', e)
            }
          }
        }
      }
    }

    return limpiadas
  }

  /**
   * Limpia de forma puntual e inmediata una mesa específica si su ocupación expiró.
   */
  async verificarYLimpiarMesaExpirada(mesaId: string): Promise<boolean> {
    const ocupacion = await this.mesaOcupacionRepo.buscarPorMesaId(mesaId)
    if (!ocupacion) return false

    if (ocupacion.expiraEn <= new Date()) {
      await this.mesaOcupacionRepo.eliminarPorId(ocupacion._id)
      const pedidoActivo = await this.pedidoRepo.buscarPedidoActivoPorMesa(mesaId)
      const mesa = await this.mesaRepo.buscarPorId(mesaId)

      if (!pedidoActivo && mesa && mesa.estado !== ESTADOS_MESA.CUENTA_SOLICITADA) {
        if (mesa.estado === ESTADOS_MESA.OCUPADA) {
          const mesaLiberada = await this.mesaRepo.actualizarEstado(mesaId, ESTADOS_MESA.LIBRE)
          if (mesaLiberada) {
            try {
              getIO().emit('mesas:updated', mesaService.mapMesa(mesaLiberada))
            } catch (e) {}
          }
        }
      }
      return true
    }
    return false
  }

  /**
   * Inicia el proceso de limpieza periódica en segundo plano
   */
  iniciarLimpiezaAutomatica(intervalMs: number = 30000): void {
    if (this.intervalId) return
    this.intervalId = setInterval(async () => {
      try {
        await this.limpiarOcupacionesExpiradas()
      } catch (err) {
        console.error('Error en tarea de limpieza de ocupaciones temporales:', err)
      }
    }, intervalMs)

    if (this.intervalId.unref) {
      this.intervalId.unref()
    }
  }

  /**
   * Detiene el proceso de limpieza periódica
   */
  detenerLimpiezaAutomatica(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}

export const mesaOcupacionService = new MesaOcupacionService()
