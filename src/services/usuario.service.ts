// src/services/usuario.service.ts
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {
  UsuarioRepository,
  usuarioRepository,
  UsuarioActualizarDatos
} from '../repositories/usuarios.repo'
import {
  obtenerFechaBolivia,
  formatearFechaBolivia,
  formatearFechaHoraBolivia
} from '../utils/fechaBolivia'

export class UsuarioServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'UsuarioServiceError'
  }
}

export interface ContextoAutenticacionUsuario {
  id: string
  rol: string
}

export interface UsuarioCrearDTO {
  nombre?: string
  apellido?: string
  ci?: string
  email?: string
  password?: string
  rol?: string
}

export interface UsuarioActualizarDTO {
  nombre?: string
  apellido?: string
  ci?: string
  email?: string
  password?: string
  rol?: string
}

export interface ReporteCierreCajaDTO {
  totalDia?: number
  efectivo?: number
  tarjeta?: number
  qr?: number
  descuentos?: number
  propinas?: number
  pagosProcesados?: number
}

export interface UsuarioCambioEstadoDTO {
  estado: boolean | string
  reporte?: ReporteCierreCajaDTO
}

export interface UsuarioNormalizado {
  id: string
  nombre: string
  apellido: string
  ci: string
  email: string
  rol: string
  estado: boolean
  verificado: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ResultadoCambioEstado {
  estado: boolean
  usuario: any
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
  private normalizarUsuario(u: any): UsuarioNormalizado {
    const raw =
      u && typeof u.toObject === 'function'
        ? u.toObject()
        : u && u._doc
          ? u._doc
          : u || {}
    const id = raw._id ? raw._id.toString() : raw.id ? raw.id.toString() : ''

    return {
      id,
      nombre: raw.nombre || '',
      apellido: raw.apellido || '',
      ci: raw.ci || '',
      email: raw.email || '',
      rol: raw.rol || '',
      estado: raw.estado !== undefined ? raw.estado : true,
      verificado: raw.verificado !== undefined ? raw.verificado : true,
      createdAt: raw.createdAt ? formatearFechaHoraBolivia(raw.createdAt) : undefined,
      updatedAt: raw.updatedAt ? formatearFechaHoraBolivia(raw.updatedAt) : undefined
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
    const nombre = dto.nombre ? String(dto.nombre).trim() : ''
    const apellido = dto.apellido ? String(dto.apellido).trim() : ''
    const ci = dto.ci ? String(dto.ci).trim() : ''
    const email = dto.email ? String(dto.email).trim() : ''
    const password = dto.password ? String(dto.password) : ''
    const rol = dto.rol ? String(dto.rol).trim() : ''

    const regexNombres = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/
    if (!regexNombres.test(nombre) || nombre.length > 30) {
      throw new UsuarioServiceError(
        400,
        'El nombre solo debe contener letras y máximo 30 caracteres.'
      )
    }
    if (!regexNombres.test(apellido) || apellido.length > 30) {
      throw new UsuarioServiceError(
        400,
        'Los apellidos solo deben contener letras y máximo 30 caracteres.'
      )
    }
    if (!/^\d+$/.test(ci) || ci.length > 8) {
      throw new UsuarioServiceError(
        400,
        'El CI solo debe contener números y máximo 8 dígitos.'
      )
    }

    // 1. Verificación de unicidad dual
    const usuarioExistente = await this.usuarioRepo.buscarPorEmailOCi(email, ci)
    if (usuarioExistente) {
      if (usuarioExistente.ci === ci) {
        throw new UsuarioServiceError(
          400,
          'Ya existe un usuario registrado con este Carnet de Identidad'
        )
      }
      throw new UsuarioServiceError(
        400,
        'El correo electrónico ya está registrado'
      )
    }

    // 2. Hasheo seguro de contraseña con salt 10
    const salt = await bcrypt.genSalt(10)
    const passwordHasheada = await bcrypt.hash(password, salt)

    // 3. Crear en la base de datos
    const nuevoUsuario = await this.usuarioRepo.crear({
      nombre,
      apellido,
      ci,
      email,
      password: passwordHasheada,
      rol
    })

    const usuarioCreado = await this.usuarioRepo.buscarPorId(nuevoUsuario._id.toString())
    return this.normalizarUsuario(usuarioCreado)
  }

  /**
   * Valida existencia, reglas de formato, unicidad y actualiza datos (incluyendo contraseña si viene definida)
   */
  async actualizarUsuario(
    id: string,
    dto: UsuarioActualizarDTO
  ): Promise<UsuarioNormalizado> {
    const usuarioActual = await this.usuarioRepo.buscarPorIdConPassword(id)
    if (!usuarioActual) {
      throw new UsuarioServiceError(404, 'Usuario no encontrado')
    }

    const regexNombres = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/
    if (dto.nombre && (!regexNombres.test(dto.nombre) || dto.nombre.length > 30)) {
      throw new UsuarioServiceError(
        400,
        'El nombre solo debe contener letras y máximo 30 caracteres.'
      )
    }
    if (dto.apellido && (!regexNombres.test(dto.apellido) || dto.apellido.length > 30)) {
      throw new UsuarioServiceError(
        400,
        'Los apellidos solo deben contener letras y máximo 30 caracteres.'
      )
    }
    if (dto.ci && (!/^\d+$/.test(dto.ci) || dto.ci.length > 8)) {
      throw new UsuarioServiceError(
        400,
        'El CI solo debe contener números y máximo 8 dígitos.'
      )
    }

    // Comprobación de duplicados excluyendo el propio ID
    const emailAChequear = dto.email !== undefined && dto.email !== usuarioActual.email ? dto.email : undefined
    const ciAChequear = dto.ci !== undefined && dto.ci !== usuarioActual.ci ? dto.ci : undefined

    if (emailAChequear !== undefined || ciAChequear !== undefined) {
      const duplicado = await this.usuarioRepo.buscarDuplicadoEnActualizacion(
        id,
        emailAChequear,
        ciAChequear
      )

      if (duplicado) {
        if (ciAChequear !== undefined && duplicado.ci === ciAChequear) {
          throw new UsuarioServiceError(
            400,
            'El CI ya está en uso por otro usuario'
          )
        }
        throw new UsuarioServiceError(
          400,
          'El correo ya está en uso por otro usuario'
        )
      }
    }

    const datosActualizados: UsuarioActualizarDatos = {}
    if (dto.nombre !== undefined) datosActualizados.nombre = dto.nombre
    if (dto.apellido !== undefined) datosActualizados.apellido = dto.apellido
    if (dto.ci !== undefined) datosActualizados.ci = dto.ci
    if (dto.email !== undefined) datosActualizados.email = dto.email
    if (dto.rol !== undefined) datosActualizados.rol = dto.rol

    // Si viene nueva contraseña no vacía, se hashea con salt 10
    if (dto.password && typeof dto.password === 'string' && dto.password.trim() !== '') {
      const salt = await bcrypt.genSalt(10)
      datosActualizados.password = await bcrypt.hash(dto.password, salt)
    }

    const usuarioActualizado = await this.usuarioRepo.actualizar(id, datosActualizados)
    if (!usuarioActualizado) {
      throw new UsuarioServiceError(404, 'Usuario no encontrado tras actualizar')
    }

    return this.normalizarUsuario(usuarioActualizado)
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

    // 3. Registro automático de cierre de caja en MongoDB si aplica
    if (estadoBool === false && dto.reporte) {
      const fechaCierre = obtenerFechaBolivia()
      await this.usuarioRepo.registrarCierreCaja({
        cajeroId: id,
        cajeroNombre: `${usuarioActualizado.nombre} ${usuarioActualizado.apellido || ''}`.trim(),
        totalDia: dto.reporte.totalDia || 0,
        efectivo: dto.reporte.efectivo || 0,
        tarjeta: dto.reporte.tarjeta || 0,
        qr: dto.reporte.qr || 0,
        descuentos: dto.reporte.descuentos || 0,
        propinas: dto.reporte.propinas || 0,
        pagosProcesados: dto.reporte.pagosProcesados || 0,
        fechaCierreBolivia: formatearFechaBolivia(fechaCierre),
        fechaCierre
      })
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
