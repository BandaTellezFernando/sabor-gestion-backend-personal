// src/services/mesa.service.ts
import mongoose from 'mongoose'
import {
  MesaRepository,
  mesaRepository,
  MesaPobladaDoc,
  PopulatedUbicacion,
  MesaCrearDatos,
  MesaActualizarDatos
} from '../repositories/mesa.repo'
import {
  MesaOcupacionRepository,
  mesaOcupacionRepository
} from '../repositories/mesaOcupacion.repo'
import {
  PedidoRepository,
  pedidoRepository
} from '../repositories/pedido.repo'

export class MesaServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'MesaServiceError'
  }
}

// DTO para recibir datos de mesa en creación o actualización
export interface MesaPayloadDTO {
  name?: string
  numero?: string
  capacity?: number
  capacidad?: number
  status?: string
  estado?: string
  location?: string
  ubicacion?: string
}

// DTO de respuesta estructurada para el cliente
export interface MesaResponseDTO {
  id: string
  _id: string
  name: string
  numero: string
  capacity: number
  location: string
  locationId: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}

export class MesaService {
  private mesaRepo: MesaRepository
  private mesaOcupacionRepo: MesaOcupacionRepository
  private pedidoRepo: PedidoRepository

  constructor(
    mesaRepo?: MesaRepository,
    mesaOcupacionRepo?: MesaOcupacionRepository,
    pedidoRepo?: PedidoRepository
  ) {
    this.mesaRepo = mesaRepo || mesaRepository
    this.mesaOcupacionRepo = mesaOcupacionRepo || mesaOcupacionRepository
    this.pedidoRepo = pedidoRepo || pedidoRepository
  }

  /**
   * Mapea el estado almacenado en MongoDB al estado esperado por el frontend
   */
  estadoBackendToFrontend(estado: string | undefined): string {
    if (!estado) return 'Disponible'
    if (estado === 'Libre') return 'Disponible'
    if (estado === 'Cuenta Solicitada') return 'Esperando pago'
    return estado
  }

  /**
   * Mapea el estado recibido del frontend al formato correspondiente de MongoDB
   */
  estadoFrontendToBackend(status: string | undefined): string | undefined {
    if (!status) return undefined
    if (status === 'Disponible') return 'Libre'
    if (status === 'Esperando pago') return 'Cuenta Solicitada'
    return status
  }

  /**
   * Valida las reglas de negocio para el identificador/nombre de una mesa
   */
  validarNombreMesa(nombre: string | undefined): { valido: boolean; mensaje?: string } {
    if (!nombre) return { valido: false, mensaje: 'El nombre de la mesa es requerido.' }
    const nom = String(nombre).toLowerCase().trim()

    if (String(nombre).length > 25) {
      return {
        valido: false,
        mensaje: 'El identificador de mesa no puede superar los 25 caracteres.'
      }
    }

    const regexEspeciales = /^[a-záéíóúñ0-9\s]+$/i
    if (!regexEspeciales.test(nom)) {
      return { valido: false, mensaje: 'No se permiten símbolos especiales.' }
    }

    if (!nom.includes('mesa')) {
      return { valido: false, mensaje: 'El nombre debe incluir la palabra "mesa".' }
    }

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
        if (numStr.length > 3) {
          return {
            valido: false,
            mensaje: 'No se permiten más de 3 dígitos numéricos consecutivos.'
          }
        }
        if (parseInt(numStr, 10) > 50) {
          return { valido: false, mensaje: 'El número de mesa no puede ser mayor a 50.' }
        }
      }
    }
    return { valido: true }
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * Transforma el documento poblado de MongoDB a la interfaz de salida DTO
   */
  mapMesa(m: MesaPobladaDoc | null): MesaResponseDTO | null {
    if (!m) return null

    let locationName = ''

    if (
      m.ubicacionId &&
      typeof m.ubicacionId === 'object' &&
      ('nombre' in m.ubicacionId || 'name' in m.ubicacionId)
    ) {
      const loc = m.ubicacionId as PopulatedUbicacion
      locationName = loc.nombre || loc.name || ''
    }

    if (!locationName) {
      locationName = m.ubicacion || ''
    }

    const ubicacionRef = m.ubicacionId

    return {
      id: String(m._id),
      _id: String(m._id),
      name: m.numero || '',
      numero: m.numero || '',
      capacity: m.capacidad ?? 0,
      location: locationName,
      locationId:
        ubicacionRef && typeof ubicacionRef === 'object' && '_id' in ubicacionRef
          ? String(ubicacionRef._id)
          : ubicacionRef
            ? String(ubicacionRef)
            : null,
      status: this.estadoBackendToFrontend(m.estado),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt
    }
  }

  /**
   * Obtiene la lista de mesas registradas con filtro opcional de ubicación
   */
  async obtenerMesas(location?: string): Promise<MesaResponseDTO[]> {
    const mesas = await this.mesaRepo.buscarTodos(location)
    return mesas.map((m) => this.mapMesa(m)!)
  }

  /**
   * Obtiene los datos detallados de una mesa por su ID
   */
  async obtenerMesaPorId(id: string): Promise<MesaResponseDTO> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new MesaServiceError(400, 'ID de mesa inválido')
    }
    const mesa = await this.mesaRepo.buscarPorId(id)
    if (!mesa) {
      throw new MesaServiceError(404, 'Mesa no encontrada')
    }
    return this.mapMesa(mesa)!
  }

  /**
   * Crea una mesa o un lote de mesas según la estructura del payload
   */
  async crearMesa(
    body: MesaPayloadDTO | MesaPayloadDTO[]
  ): Promise<MesaResponseDTO | MesaResponseDTO[]> {
    if (Array.isArray(body)) {
      const datosLote: MesaCrearDatos[] = body.map((p) => ({
        numero: p.name || p.numero || '',
        capacidad: p.capacity || p.capacidad || 0,
        estado: this.estadoFrontendToBackend(p.status || p.estado) || 'Libre',
        location: p.location || p.ubicacion
      }))

      const creadas = await this.mesaRepo.crearLote(datosLote)
      return creadas.map((m) => this.mapMesa(m)!)
    }

    const datosIndividual: MesaCrearDatos = {
      numero: body.name || body.numero || '',
      capacidad: body.capacity || body.capacidad || 0,
      estado: this.estadoFrontendToBackend(body.status || body.estado) || 'Libre',
      location: body.location || body.ubicacion
    }

    const nuevaMesa = await this.mesaRepo.crearIndividual(datosIndividual)
    return this.mapMesa(nuevaMesa)!
  }

  /**
   * Valida reglas de negocio y actualiza los campos generales de una mesa
   */
  async actualizarMesa(id: string, body: MesaPayloadDTO): Promise<MesaResponseDTO> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new MesaServiceError(400, 'ID de mesa inválido')
    }

    const datosActualizar: MesaActualizarDatos = {}

    const nombreAValidar = body.name !== undefined ? body.name : body.numero
    if (nombreAValidar !== undefined) {
      const validacion = this.validarNombreMesa(nombreAValidar)
      if (!validacion.valido) {
        throw new MesaServiceError(400, validacion.mensaje!)
      }

      const regexNombre = new RegExp(`^${this.escapeRegex(nombreAValidar.trim())}$`, 'i')
      const existente = await this.mesaRepo.buscarPorNumeroExcluyendoId(regexNombre, id)
      if (existente) {
        throw new MesaServiceError(
          400,
          'El nombre de la mesa ya está en uso. Intenta con otro nombre.'
        )
      }
      datosActualizar.numero = nombreAValidar.trim()
    }

    if (body.capacity !== undefined) datosActualizar.capacidad = body.capacity
    if (body.capacidad !== undefined && datosActualizar.capacidad === undefined) {
      datosActualizar.capacidad = body.capacidad
    }

    const loc = body.location || body.ubicacion
    if (loc !== undefined) {
      datosActualizar.location = String(loc)
    }

    const estadoRaw = body.status !== undefined ? body.status : body.estado
    if (estadoRaw !== undefined) {
      if (typeof estadoRaw !== 'string' || estadoRaw.trim() === '') {
        throw new MesaServiceError(400, 'El estado de la mesa es requerido')
      }
      const backendStatus = this.estadoFrontendToBackend(estadoRaw.trim()) || estadoRaw.trim()
      const ESTADOS_VALIDOS = ['Libre', 'Ocupada', 'Cuenta Solicitada']
      if (!ESTADOS_VALIDOS.includes(backendStatus)) {
        throw new MesaServiceError(
          400,
          'Estado de mesa no válido. Estados aceptados: Libre, Ocupada, Cuenta Solicitada (o Disponible, Esperando pago)'
        )
      }
      datosActualizar.estado = backendStatus

      if (mongoose.Types.ObjectId.isValid(id)) {
        const ocupacion = await this.mesaOcupacionRepo.buscarPorMesaId(id)
        if (ocupacion && ocupacion.expiraEn > new Date()) {
          const pedidoActivo = await this.pedidoRepo.buscarPedidoActivoPorMesa(id)
          if (!pedidoActivo && backendStatus === 'Cuenta Solicitada') {
            throw new MesaServiceError(
              400,
              'No se puede cambiar el estado a Cuenta Solicitada: la mesa tiene una ocupación temporal activa sin pedido.'
            )
          }
          if (backendStatus === 'Libre') {
            await this.mesaOcupacionRepo.eliminarPorMesaId(id)
          }
        }
      }
    }

    try {
      const mesaActualizada = await this.mesaRepo.actualizar(id, datosActualizar)
      if (!mesaActualizada) {
        throw new MesaServiceError(404, 'Mesa no encontrada')
      }

      return this.mapMesa(mesaActualizada)!
    } catch (err: any) {
      if (err instanceof MesaServiceError) throw err
      if (err?.name === 'ValidationError' || err?.name === 'CastError') {
        throw new MesaServiceError(400, err.message)
      }
      throw err
    }
  }

  /**
   * Actualiza únicamente el estado de una mesa
   */
  async actualizarEstadoMesa(
    id: string,
    estado: any,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<MesaResponseDTO> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new MesaServiceError(400, 'ID de mesa inválido')
    }

    if (estado === undefined || estado === null) {
      throw new MesaServiceError(400, 'El estado de la mesa es requerido')
    }

    if (typeof estado !== 'string') {
      throw new MesaServiceError(400, 'El estado de la mesa debe ser un texto válido')
    }

    const trimmed = estado.trim()
    if (trimmed === '') {
      throw new MesaServiceError(400, 'El estado de la mesa es requerido')
    }

    const backendStatus = this.estadoFrontendToBackend(trimmed) || trimmed
    const ESTADOS_VALIDOS = ['Libre', 'Ocupada', 'Cuenta Solicitada']
    if (!ESTADOS_VALIDOS.includes(backendStatus)) {
      throw new MesaServiceError(
        400,
        'Estado de mesa no válido. Estados aceptados: Libre, Ocupada, Cuenta Solicitada (o Disponible, Esperando pago)'
      )
    }

    // Si la mesa se encuentra ocupada temporalmente por otro usuario, impedir manipulación no autorizada
    if (mongoose.Types.ObjectId.isValid(id)) {
      const ocupacion = await this.mesaOcupacionRepo.buscarPorMesaId(id)
      if (ocupacion && ocupacion.expiraEn > new Date()) {
        const esDuenio = usuarioAuthId ? ocupacion.usuarioId.toString() === usuarioAuthId : false
        const esAdmin = usuarioRol === 'Administrador' || usuarioRol === 'superadmin'
        if (usuarioAuthId && !esDuenio && !esAdmin) {
          throw new MesaServiceError(
            409,
            'La mesa se encuentra ocupada temporalmente por otro usuario.'
          )
        }

        // Mientras exista una ocupación temporal sin Pedido, no debe ser posible saltarse el flujo
        // cambiando manualmente la mesa a "Cuenta Solicitada" ni a otro estado que no corresponda
        const pedidoActivo = await this.pedidoRepo.buscarPedidoActivoPorMesa(id)
        if (!pedidoActivo && backendStatus === 'Cuenta Solicitada') {
          throw new MesaServiceError(
            400,
            'No se puede cambiar el estado a Cuenta Solicitada: la mesa tiene una ocupación temporal activa sin pedido.'
          )
        }

        // Si el dueño o administrador libera la mesa explícitamente, remover la ocupación temporal
        if (backendStatus === 'Libre') {
          await this.mesaOcupacionRepo.eliminarPorMesaId(id)
        }
      }
    }

    try {
      const mesaActualizada = await this.mesaRepo.actualizarEstado(id, backendStatus)

      if (!mesaActualizada) {
        throw new MesaServiceError(404, 'Mesa no encontrada')
      }

      return this.mapMesa(mesaActualizada)!
    } catch (err: any) {
      if (err instanceof MesaServiceError) throw err
      if (err?.name === 'ValidationError' || err?.name === 'CastError') {
        throw new MesaServiceError(400, err.message)
      }
      throw err
    }
  }

  /**
   * Elimina una mesa de la base de datos
   */
  async eliminarMesa(id: string): Promise<MesaResponseDTO> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new MesaServiceError(400, 'ID de mesa inválido')
    }
    const eliminado = await this.mesaRepo.eliminar(id)
    if (!eliminado) {
      throw new MesaServiceError(404, 'Mesa no encontrada')
    }

    return this.mapMesa(eliminado)!
  }
}

export const mesaService = new MesaService()
