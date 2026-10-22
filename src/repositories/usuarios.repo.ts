// src/repositories/usuarios.repo.ts
import { ClientSession, Types } from 'mongoose'
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
  estado?: boolean
  verificado?: boolean
}

export interface UsuarioActualizarDatos {
  nombre?: string
  apellido?: string
  ci?: string
  email?: string
  password?: string
  rol?: string
  estado?: boolean
  verificado?: boolean
}

export interface CierreCajaCrearDatos {
  cajeroId: string
  cajeroNombre: string
  totalDia?: number
  efectivo?: number
  tarjeta?: number
  qr?: number
  propinas?: number
  pagosProcesados?: number
  fechaCierreBolivia?: string
  fechaCierre?: Date
}

export interface UsuarioSinPassword {
  _id: Types.ObjectId
  nombre: string
  apellido: string
  ci: string
  email: string
  rol: string
  estado: boolean
  verificado: boolean
  createdAt?: Date
  updatedAt?: Date
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
    async buscarPorIdConPassword(
    id: string,
    session?: ClientSession
  ): Promise<IUsuario | null> {
    const consulta = Usuario.findById(id)

    if (session) {
      consulta.session(session)
    }

    return await consulta.exec()
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
     async contarCajerosActivos(
    excluirId?: string,
    session?: ClientSession
  ): Promise<number> {
    if (
      excluirId !== undefined &&
      !Types.ObjectId.isValid(excluirId)
    ) {
      throw new Error(
        'El identificador del cajero no es válido.'
      )
    }

    const filtro = {
      rol: { $regex: /^cajero$/i },
      estado: true,
      ...(excluirId
        ? {
            _id: {
              $ne: new Types.ObjectId(excluirId)
            }
          }
        : {})
    }

    const consulta = Usuario.countDocuments(filtro)

    if (session) {
      consulta.session(session)
    }

    return await consulta.exec()
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
    async actualizarEstado(
    id: string,
    estado: boolean,
    session?: ClientSession
  ): Promise<UsuarioSinPassword | null> {
    const consulta = Usuario.findByIdAndUpdate(
      id,
      { estado },
      {
        returnDocument: 'after',
        ...(session ? { session } : {})
      }
    )
      .select('-password')
      .lean<UsuarioSinPassword>()

    return await consulta.exec()
  }



  /**
   * Elimina físicamente un usuario por su identificador único
   */
  async eliminar(id: string): Promise<IUsuario | null> {
    return await Usuario.findByIdAndDelete(id)
  }

    async buscarUltimoCierreCaja(
    cajeroId: string,
    session?: ClientSession
  ): Promise<ICierreCaja | null> {
    const consulta = CierreCaja.findOne({ cajeroId })
      .sort({ fechaCierre: -1 })

    if (session) {
      consulta.session(session)
    }

    return await consulta.exec()
  }

  /**
   * Registra un nuevo documento de cierre de caja en la base de datos
   */
    async registrarCierreCaja(
    datos: CierreCajaCrearDatos,
    session?: ClientSession
  ): Promise<ICierreCaja> {
    const nuevoCierre = new CierreCaja(datos)

    return await nuevoCierre.save(
      session ? { session } : undefined
    )
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
