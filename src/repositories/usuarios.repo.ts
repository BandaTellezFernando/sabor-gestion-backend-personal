// src/repositories/usuarios.repo.ts
import { Types } from 'mongoose'
import Usuario, { IUsuario } from '../models/Usuario'
import CierreCaja, { ICierreCaja } from '../models/CierreCaja'

export { IUsuario } from '../models/Usuario'

export interface UsuarioCrearDatos {
  nombre: string
  apellido: string
  ci: string
  email: string
  password: string
  rol: string
  ubicacion?: string
  estado?: boolean
  verificado?: boolean
  telefono?: string
  direcciones?: any[]
}

export interface UsuarioActualizarDatos {
  nombre?: string
  apellido?: string
  ci?: string
  email?: string
  password?: string
  rol?: string
  ubicacion?: string
  estado?: boolean
  verificado?: boolean
  telefono?: string
  direcciones?: any[]
}

export interface CierreCajaCrearDatos {
  cajeroId: string
  cajeroNombre: string
  totalDia?: number
  efectivo?: number
  tarjeta?: number
  qr?: number
  descuentos?: number
  propinas?: number
  pagosProcesados?: number
  fechaCierreBolivia?: string
  fechaCierre?: Date
}

export class UsuarioRepository {
  /**
   * Obtiene todos los usuarios de la base de datos sin incluir sus contraseñas
   */
  async buscarTodos(): Promise<any[]> {
    return await Usuario.find().select('-password').lean()
  }

  /**
   * Busca un usuario por su identificador único excluyendo la contraseña
   */
  async buscarPorId(id: string): Promise<any | null> {
    return await Usuario.findById(id).select('-password').lean()
  }

  /**
   * Busca un usuario por su identificador único incluyendo su hash de contraseña
   */
  async buscarPorIdConPassword(id: string): Promise<IUsuario | null> {
    return await Usuario.findById(id)
  }

  /**
   * Busca un usuario por su correo electrónico
   */
  async buscarPorEmail(email: string): Promise<IUsuario | null> {
    return await Usuario.findOne({ email })
  }

  /**
   * Busca un usuario por su correo electrónico incluyendo su hash de contraseña para autenticación
   */
  async buscarPorEmailConPassword(email: string): Promise<IUsuario | null> {
    return await Usuario.findOne({ email })
  }

  /**
   * Busca un usuario por su carnet de identidad
   */
  async buscarPorCi(ci: string): Promise<IUsuario | null> {
    return await Usuario.findOne({ ci })
  }

  /**
   * Busca si existe algún usuario que coincida con el email o el CI indicados
   */
  async buscarPorEmailOCi(email: string, ci: string): Promise<IUsuario | null> {
    return await Usuario.findOne({
      $or: [{ email }, { ci }]
    })
  }

  /**
   * Busca si otro usuario (con ID diferente) ya está usando el email o el CI
   */
  async buscarDuplicadoEnActualizacion(
    id: string,
    email?: string,
    ci?: string
  ): Promise<IUsuario | null> {
    const orConditions: any[] = []
    if (email !== undefined) orConditions.push({ email })
    if (ci !== undefined) orConditions.push({ ci })

    if (orConditions.length === 0) return null

    const objectId = Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id

    return await Usuario.findOne({
      $or: orConditions,
      _id: { $ne: objectId }
    })
  }

  /**
   * Cuenta cuántos cajeros con estado activo existen, con opción de excluir un usuario
   */
  async contarCajerosActivos(excluirId?: string): Promise<number> {
    const filtro: any = {
      rol: { $regex: /^cajero$/i },
      estado: true
    }

    if (excluirId) {
      filtro._id = {
        $ne: Types.ObjectId.isValid(excluirId)
          ? new Types.ObjectId(excluirId)
          : excluirId
      }
    }

    return await Usuario.countDocuments(filtro)
  }

  /**
   * Crea y guarda un nuevo usuario en MongoDB
   */
  async crear(datos: UsuarioCrearDatos): Promise<IUsuario> {
    const nuevoUsuario = new Usuario(datos)
    return await nuevoUsuario.save()
  }

  /**
   * Actualiza los datos de un usuario por su ID y devuelve el documento actualizado sin contraseña
   */
  async actualizar(
    id: string,
    datos: UsuarioActualizarDatos
  ): Promise<any | null> {
    return await Usuario.findByIdAndUpdate(
      id,
      { $set: datos },
      { returnDocument: 'after' }
    )
      .select('-password')
      .lean()
  }

  /**
   * Actualiza exclusivamente el estado activo/inactivo de un usuario
   */
  async actualizarEstado(id: string, estado: boolean): Promise<any | null> {
    return await Usuario.findByIdAndUpdate(
      id,
      { estado },
      { returnDocument: 'after' }
    )
      .select('-password')
      .lean()
  }

  /**
   * Elimina físicamente un usuario por su identificador único
   */
  async eliminar(id: string): Promise<IUsuario | null> {
    return await Usuario.findByIdAndDelete(id)
  }

  /**
   * Registra un nuevo documento de cierre de caja en la base de datos
   */
  async registrarCierreCaja(datos: CierreCajaCrearDatos): Promise<ICierreCaja> {
    const nuevoCierre = new CierreCaja(datos)
    return await nuevoCierre.save()
  }
}

export const usuarioRepository = new UsuarioRepository()

// ─── FUNCIONES LEGACY RE-EXPORTADAS PARA RETROCOMPATIBILIDAD ────────────────
export const buscarPorEmail = async (email: string): Promise<IUsuario | null> => {
  return await usuarioRepository.buscarPorEmail(email)
}

export const obtenerUsuarioPorId = async (id: string): Promise<IUsuario | null> => {
  return await usuarioRepository.buscarPorIdConPassword(id)
}

export const crearUsuario = async (datos: Partial<IUsuario>): Promise<IUsuario> => {
  return await usuarioRepository.crear(datos as UsuarioCrearDatos)
}

export const marcarUsuarioComoVerificado = async (id: string): Promise<void> => {
  await Usuario.findByIdAndUpdate(id, { verificado: true })
}
