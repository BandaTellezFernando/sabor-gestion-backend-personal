// src/services/usuario.service.ts
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {
  UsuarioRepository,
  usuarioRepository,
  UsuarioActualizarDatos
} from '../repositories/usuarios.repo'
import { formatearFechaHoraBolivia } from '../utils/fechaBolivia'
import { getIO } from '../socket/socket'

function esRegistroUsuario(
  valor: unknown
): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}

function obtenerRegistroUsuario(valor: unknown): Record<string, unknown> {
  if (!esRegistroUsuario(valor)) return {}

  const documento = valor as Record<string, unknown> & {
    toObject?: () => unknown
    _doc?: unknown
  }

  if (typeof documento.toObject === 'function') {
    const plano = documento.toObject()
    if (esRegistroUsuario(plano)) return plano
  }

  if (esRegistroUsuario(documento._doc)) return documento._doc
  return documento
}

function fechaUsuario(valor: unknown): Date | undefined {
  if (valor instanceof Date) return valor
  if (typeof valor !== 'string' && typeof valor !== 'number') return undefined

  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? undefined : fecha
}

function textoUsuario(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

export class UsuarioServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'UsuarioServiceError'
  }
}


const ROLES_USUARIO = ['Administrador', 'Mesero', 'Cocinero', 'Cajero'] as const
const CI_MAX_DIGITOS = 20 // Límite técnico, no longitud oficial del SEGIP.
const EMAIL_MAX_CARACTERES = 254
const PASSWORD_MIN_CARACTERES = 8
const PASSWORD_MAX_BYTES = 72

const EMAIL_REGEX_USUARIO =
  /^[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/i

function textoObligatorio(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new UsuarioServiceError(400, `${campo} es obligatorio.`)
  }
  return valor.trim()
}

function validarNombreUsuario(valor: unknown, campo: string): string {
  const nombre = textoObligatorio(valor, campo)
  const regex = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/
  if (!regex.test(nombre) || nombre.length > 30) {
    throw new UsuarioServiceError(
      400,
      `${campo} solo debe contener letras y espacios y tener máximo 30 caracteres.`
    )
  }
  return nombre
}

function normalizarCIUsuario(valor: unknown): string {
  const ci = textoObligatorio(valor, 'El número de CI')
  if (!/^\d+$/.test(ci) || ci.length > CI_MAX_DIGITOS) {
    throw new UsuarioServiceError(
      400,
      `El CI debe contener únicamente dígitos y no superar ${CI_MAX_DIGITOS} dígitos.`
    )
  }
  return ci
}

function normalizarComplementoCI(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null
  if (typeof valor !== 'string') {
    throw new UsuarioServiceError(400, 'El complemento de CI debe ser texto.')
  }
  const complemento = valor.trim().toUpperCase()
  if (complemento === '') return null
  if (!/^\d[A-Z]$/.test(complemento)) {
    throw new UsuarioServiceError(
      400,
      'El complemento debe tener el formato de un dígito seguido de una letra, por ejemplo 1A.'
    )
  }
  return complemento
}

function normalizarCorreoUsuario(valor: unknown): string {
  const email = textoObligatorio(valor, 'El correo electrónico').toLowerCase()
  const parteLocal = email.split('@')[0] ?? ''
  if (
    email.length > EMAIL_MAX_CARACTERES ||
    parteLocal.length > 64 ||
    !EMAIL_REGEX_USUARIO.test(email)
  ) {
    throw new UsuarioServiceError(400, 'El correo electrónico no tiene un formato válido.')
  }
  return email
}

function validarPasswordUsuario(valor: unknown): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new UsuarioServiceError(400, 'La contraseña es obligatoria.')
  }
  if (Array.from(valor).length < PASSWORD_MIN_CARACTERES) {
    throw new UsuarioServiceError(
      400,
      `La contraseña debe tener al menos ${PASSWORD_MIN_CARACTERES} caracteres.`
    )
  }
  if (Buffer.byteLength(valor, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new UsuarioServiceError(
      400,
      `La contraseña no puede superar ${PASSWORD_MAX_BYTES} bytes en UTF-8.`
    )
  }
  return valor
}

function normalizarRolUsuario(valor: unknown): string {
  const rol = textoObligatorio(valor, 'El rol')
  const canonico = ROLES_USUARIO.find(
    permitido => permitido.toLowerCase() === rol.toLowerCase()
  )
  if (!canonico) {
    throw new UsuarioServiceError(400, 'El rol indicado no es válido.')
  }
  return canonico
}

function esDuplicadoMongo(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}

export interface ContextoAutenticacionUsuario {
  id: string
  rol: string
}

export interface UsuarioCrearDTO {
  nombre?: string
  apellido?: string
  ci?: string
  ciComplemento?: string | null
  email?: string
  password?: string
  rol?: string
}

export interface UsuarioActualizarDTO {
  nombre?: string
  apellido?: string
  ci?: string
  ciComplemento?: string | null
  email?: string
  password?: string
  rol?: string
}

export interface UsuarioCambioEstadoDTO {
  estado: boolean | string
}

export interface UsuarioNormalizado {
  id: string
  nombre: string
  apellido: string
  ci: string
  ciComplemento?: string
  email: string
  rol: string
  estado: boolean
  verificado: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ResultadoCambioEstado {
  estado: boolean
  usuario: UsuarioNormalizado
}

export interface ResultadoLoginUsuario {
  token: string
  usuario: UsuarioNormalizado
}

export class UsuarioService {
  private usuarioRepo: UsuarioRepository

  constructor(usuarioRepo?: UsuarioRepository) {
    this.usuarioRepo = usuarioRepo || usuarioRepository
  }

  /**
   * Mapea un documento de usuario de MongoDB al formato requerido por el frontend,
   * exponiendo únicamente id (sin _id) y con fechas formateadas en hora de Bolivia.
   */
  private normalizarUsuario(u: unknown): UsuarioNormalizado {
    const raw = obtenerRegistroUsuario(u)
    const id = String(raw._id ?? raw.id ?? '')

    return {
      id,
      nombre: textoUsuario(raw.nombre),
      apellido: textoUsuario(raw.apellido),
      ci: textoUsuario(raw.ci),
      ciComplemento: textoUsuario(raw.ciComplemento) || undefined,
      email: textoUsuario(raw.email),
      rol: textoUsuario(raw.rol),
      estado: raw.estado !== undefined ? Boolean(raw.estado) : true,
      verificado:
        raw.verificado !== undefined ? Boolean(raw.verificado) : true,
      createdAt: fechaUsuario(raw.createdAt)
        ? formatearFechaHoraBolivia(fechaUsuario(raw.createdAt)!)
        : undefined,
      updatedAt: fechaUsuario(raw.updatedAt)
        ? formatearFechaHoraBolivia(fechaUsuario(raw.updatedAt)!)
        : undefined
    }
  }

  /**
   * Obtiene la lista completa de usuarios sin contraseñas
   */
  async obtenerUsuarios(): Promise<UsuarioNormalizado[]> {
    const usuarios = await this.usuarioRepo.buscarTodos()
    return usuarios.map((u) => this.normalizarUsuario(u))
  }

  /**
   * Obtiene un usuario por ID sin contraseña
   */
  async obtenerUsuarioPorId(id: string): Promise<UsuarioNormalizado> {
    const usuario = await this.usuarioRepo.buscarPorId(id)
    if (!usuario) {
      throw new UsuarioServiceError(404, 'Usuario no encontrado')
    }
    return this.normalizarUsuario(usuario)
  }

  /**
   * Valida reglas de formato, unicidad dual (CI/Email), encripta la contraseña y crea el usuario
   */

  async crearUsuario(dto: UsuarioCrearDTO): Promise<UsuarioNormalizado> {
    if (!dto || typeof dto !== 'object' || Array.isArray(dto)) {
      throw new UsuarioServiceError(400, 'Los datos del usuario deben ser un objeto.')
    }

    const nombre = validarNombreUsuario(dto.nombre, 'El nombre')
    const apellido = validarNombreUsuario(dto.apellido, 'El apellido')
    const ci = normalizarCIUsuario(dto.ci)
    const ciComplemento = normalizarComplementoCI(dto.ciComplemento)
    const email = normalizarCorreoUsuario(dto.email)
    const password = validarPasswordUsuario(dto.password)
    const rol = normalizarRolUsuario(dto.rol)

    const existente = await this.usuarioRepo.buscarPorEmailOCi(email, ci, ciComplemento)
    if (existente) {
      if (String(existente.email).trim().toLowerCase() === email) {
        throw new UsuarioServiceError(400, 'El correo electrónico ya está registrado.')
      }
      throw new UsuarioServiceError(400, 'La combinación de CI y complemento ya está registrada.')
    }

    const passwordHasheada = await bcrypt.hash(password, await bcrypt.genSalt(10))
    let nuevoUsuario
    try {
      nuevoUsuario = await this.usuarioRepo.crear({
        nombre, apellido, ci, ciComplemento, email,
        password: passwordHasheada,
        rol
      })
    } catch (error: unknown) {
      if (esDuplicadoMongo(error)) {
        throw new UsuarioServiceError(400, 'El correo o la combinación de CI y complemento ya están registrados.')
      }
      throw error
    }

    const usuarioCreado = await this.usuarioRepo.buscarPorId(String(nuevoUsuario._id))
    return this.normalizarUsuario(usuarioCreado)
  }

  /**
   * Valida existencia, reglas de formato, unicidad y actualiza datos (incluyendo contraseña si viene definida)
   */

  async actualizarUsuario(
    id: string,
    dto: UsuarioActualizarDTO
  ): Promise<UsuarioNormalizado> {
    if (!dto || typeof dto !== 'object' || Array.isArray(dto)) {
      throw new UsuarioServiceError(400, 'Los datos de actualización deben ser un objeto.')
    }

    const usuarioActual = await this.usuarioRepo.buscarPorIdConPassword(id)
    if (!usuarioActual) throw new UsuarioServiceError(404, 'Usuario no encontrado')

    const datosActualizados: UsuarioActualizarDatos = {}
    if (dto.nombre !== undefined) datosActualizados.nombre = validarNombreUsuario(dto.nombre, 'El nombre')
    if (dto.apellido !== undefined) datosActualizados.apellido = validarNombreUsuario(dto.apellido, 'El apellido')
    if (dto.ci !== undefined) datosActualizados.ci = normalizarCIUsuario(dto.ci)
    if (dto.ciComplemento !== undefined) datosActualizados.ciComplemento = normalizarComplementoCI(dto.ciComplemento)
    if (dto.email !== undefined) datosActualizados.email = normalizarCorreoUsuario(dto.email)
    if (dto.rol !== undefined) datosActualizados.rol = normalizarRolUsuario(dto.rol)
    if (dto.password !== undefined) {
      const password = validarPasswordUsuario(dto.password)
      datosActualizados.password = await bcrypt.hash(password, await bcrypt.genSalt(10))
    }

    const emailOriginal = String(usuarioActual.email).trim()
    const emailNuevo = datosActualizados.email
    const emailAChequear = emailNuevo !== undefined && emailNuevo !== emailOriginal ? emailNuevo : undefined
    const ciAnterior = String(usuarioActual.ci)
    const complementoAnterior = typeof usuarioActual.ciComplemento === 'string' && usuarioActual.ciComplemento.trim() !== ''
      ? usuarioActual.ciComplemento.trim().toUpperCase()
      : null
    const ciNuevo = datosActualizados.ci ?? ciAnterior
    const complementoNuevo = dto.ciComplemento !== undefined
      ? datosActualizados.ciComplemento ?? null
      : complementoAnterior
    const identidadCambio = ciNuevo !== ciAnterior || complementoNuevo !== complementoAnterior

    if (emailAChequear !== undefined || identidadCambio) {
      const duplicado = await this.usuarioRepo.buscarDuplicadoEnActualizacion(
        id,
        emailAChequear,
        identidadCambio ? ciNuevo : undefined,
        complementoNuevo
      )
      if (duplicado) {
        if (emailAChequear !== undefined && String(duplicado.email).trim().toLowerCase() === emailAChequear) {
          throw new UsuarioServiceError(400, 'El correo ya está en uso por otro usuario.')
        }
        throw new UsuarioServiceError(400, 'La combinación de CI y complemento ya está en uso por otro usuario.')
      }
    }

    try {
      const usuarioActualizado = await this.usuarioRepo.actualizar(id, datosActualizados)
      if (!usuarioActualizado) throw new UsuarioServiceError(404, 'Usuario no encontrado tras actualizar')
      return this.normalizarUsuario(usuarioActualizado)
    } catch (error: unknown) {
      if (error instanceof UsuarioServiceError) throw error
      if (esDuplicadoMongo(error)) {
        throw new UsuarioServiceError(400, 'El correo o la combinación de CI y complemento ya están registrados.')
      }
      throw error
    }
  }

  /**
   * Cambia el estado activo/inactivo de un usuario aplicando reglas estrictas de Cajero y Cierre de Caja
   */
  async cambiarEstadoUsuario(
    id: string,
    dto: UsuarioCambioEstadoDTO,
    usuarioAuth?: ContextoAutenticacionUsuario
  ): Promise<ResultadoCambioEstado> {
    const estadoBool =
      typeof dto.estado === 'string' ? dto.estado === 'true' : Boolean(dto.estado)

    // 1. Si el rol del usuario autenticado es Cajero, solo puede cambiar su propia caja
    if (
      usuarioAuth &&
      usuarioAuth.rol.toLowerCase() === 'cajero' &&
      usuarioAuth.id !== id
    ) {
      throw new UsuarioServiceError(
        403,
        'Acceso denegado. Un cajero solo puede cambiar el estado de su propia caja.'
      )
    }

    // 2. Mínimo 1 caja activa en el sistema al intentar desactivar
    if (estadoBool === false) {
      const usuarioTarget = await this.usuarioRepo.buscarPorId(id)
      if (usuarioTarget && usuarioTarget.rol.toLowerCase() === 'cajero') {
        const cajerosActivosRestantes = await this.usuarioRepo.contarCajerosActivos(id)
        if (cajerosActivosRestantes === 0) {
          throw new UsuarioServiceError(
            400,
            'Debe existir al menos una caja activa en el sistema.'
          )
        }
      }
    }

    const usuarioActualizado = await this.usuarioRepo.actualizarEstado(id, estadoBool)
    if (!usuarioActualizado) {
      throw new UsuarioServiceError(404, 'Usuario no encontrado')
    }

    // 4. Notificar vía socket si el usuario es desactivado
    if (estadoBool === false) {
      try {
        const io = getIO()
        io.to(`user:${id}`).emit('auth:unauthorized', {
          mensaje: 'Tu cuenta ha sido desactivada por un administrador.',
          usuarioId: id
        })
      } catch (e) {
        console.error('No se pudo emitir evento socket auth:unauthorized', e)
      }
    }

    return {
      estado: estadoBool,
      usuario: this.normalizarUsuario(usuarioActualizado)
    }
  }

  /**
   * Elimina un usuario por ID
   */
  async eliminarUsuario(id: string): Promise<void> {
    const eliminado = await this.usuarioRepo.eliminar(id)
    if (!eliminado) {
      throw new UsuarioServiceError(404, 'Usuario no encontrado')
    }

    try {
      const io = getIO()
      io.to(`user:${id}`).emit('auth:unauthorized', {
        mensaje: 'Tu cuenta ha sido eliminada del sistema.',
        usuarioId: id
      })
    } catch (e) {
      console.error('No se pudo emitir evento socket auth:unauthorized', e)
    }
  }

  /**
   * Inicia sesión de empleado validando credenciales y estado activo, emitiendo JWT con { id, rol }
   */
  async loginUsuario(email: string, password: string): Promise<ResultadoLoginUsuario> {
    if (!email || !password) {
      throw new UsuarioServiceError(400, 'El correo electrónico y la contraseña son requeridos')
    }

    const emailNormalizado = String(email).trim().toLowerCase()
    const usuario = await this.usuarioRepo.buscarPorEmailConPassword(emailNormalizado)

    if (!usuario) {
      throw new UsuarioServiceError(401, 'Credenciales inválidas')
    }

    if (usuario.estado === false) {
      throw new UsuarioServiceError(401, 'El usuario se encuentra inactivo. Contacte al administrador.')
    }

    const passwordValido = await bcrypt.compare(String(password), usuario.password)
    if (!passwordValido) {
      throw new UsuarioServiceError(401, 'Credenciales inválidas')
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET no está configurado en las variables de entorno')
    }

    const token = jwt.sign(
      {
        id: usuario._id.toString(),
        rol: usuario.rol
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )

    return {
      token,
      usuario: this.normalizarUsuario(usuario)
    }
  }
}

export const usuarioService = new UsuarioService()
