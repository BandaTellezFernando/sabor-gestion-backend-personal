// src/services/mesa.service.ts
import {
  MesaRepository,
  mesaRepository,
  MesaPobladaDoc,
  PopulatedUbicacion,
  MesaCrearDatos,
  MesaActualizarDatos
} from '../repositories/mesa.repo'

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
  type?: string
  tipo?: string
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
  type: string
  createdAt: Date
  updatedAt: Date
}

export class MesaService {
  private mesaRepo: MesaRepository

  constructor(mesaRepo?: MesaRepository) {
    this.mesaRepo = mesaRepo || mesaRepository
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
      type: m.tipo || 'normal',
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
        tipo: p.type || p.tipo || 'normal',
        location: p.location || p.ubicacion
      }))

      const creadas = await this.mesaRepo.crearLote(datosLote)
      return creadas.map((m) => this.mapMesa(m)!)
    }

    const datosIndividual: MesaCrearDatos = {
      numero: body.name || body.numero || '',
      capacidad: body.capacity || body.capacidad || 0,
      estado: this.estadoFrontendToBackend(body.status || body.estado) || 'Libre',
      tipo: body.type || body.tipo || 'normal',
      location: body.location || body.ubicacion
    }

    const nuevaMesa = await this.mesaRepo.crearIndividual(datosIndividual)
    return this.mapMesa(nuevaMesa)!
  }

  /**
   * Valida reglas de negocio y actualiza los campos generales de una mesa
   */
  async actualizarMesa(id: string, body: MesaPayloadDTO): Promise<MesaResponseDTO> {
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

    if (body.status !== undefined) {
      datosActualizar.estado = this.estadoFrontendToBackend(body.status)
    } else if (body.estado !== undefined) {
      datosActualizar.estado = this.estadoFrontendToBackend(body.estado)
    }

    if (body.type !== undefined) datosActualizar.tipo = body.type
    if (body.tipo !== undefined && datosActualizar.tipo === undefined) {
      datosActualizar.tipo = body.tipo
    }

    const mesaActualizada = await this.mesaRepo.actualizar(id, datosActualizar)
    if (!mesaActualizada) {
      throw new MesaServiceError(404, 'Mesa no encontrada')
    }

    return this.mapMesa(mesaActualizada)!
  }

  /**
   * Actualiza únicamente el estado de una mesa
   */
  async actualizarEstadoMesa(id: string, estado: string): Promise<MesaResponseDTO> {
    const backendStatus = this.estadoFrontendToBackend(estado) || estado
    const mesaActualizada = await this.mesaRepo.actualizarEstado(id, backendStatus)

    if (!mesaActualizada) {
      throw new MesaServiceError(404, 'Mesa no encontrada')
    }

    return this.mapMesa(mesaActualizada)!
  }

  /**
   * Elimina una mesa de la base de datos
   */
  async eliminarMesa(id: string): Promise<MesaResponseDTO> {
    const eliminado = await this.mesaRepo.eliminar(id)
    if (!eliminado) {
      throw new MesaServiceError(404, 'Mesa no encontrada')
    }

    return this.mapMesa(eliminado)!
  }
}

export const mesaService = new MesaService()
