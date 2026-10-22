
//src/socket/socket.ts
import {
  Server as SocketIOServer,
  Socket,
  DefaultEventsMap
} from 'socket.io'
import { Server as HTTPServer } from 'http'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { UsuarioTokenPayload } from '../middlewares/auth.middleware'
import Usuario from '../models/Usuario'
import { ALLOWED_ORIGINS } from '../utils/constants'

export interface UsuarioSocketPayload extends UsuarioTokenPayload {
  iat?: number
  exp?: number
}

export interface CustomSocketData {
  usuario?: UsuarioSocketPayload
}

export type CustomSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  CustomSocketData
>

let io: SocketIOServer<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  CustomSocketData
> | undefined

export const autenticarSocket = async (
  socket: CustomSocket,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    const authToken = socket.handshake.auth?.token
    const authHeader = socket.handshake.headers.authorization

    let token: string | null = null

    if (
      typeof authToken === 'string' &&
      authToken.trim() !== ''
    ) {
      token = authToken.trim()
    } else if (typeof authHeader === 'string') {
      const coincidencia = /^Bearer\s+(\S+)$/i.exec(
        authHeader.trim()
      )

      token = coincidencia?.[1] ?? null
    }

    if (!token) {
      return next(new Error('Unauthorized'))
    }

    const jwtSecret = process.env.JWT_SECRET

    if (!jwtSecret) {
      console.error(
        'FATAL ERROR: JWT_SECRET no está configurado para WebSockets.'
      )
      return next(new Error('Unauthorized'))
    }

    const decoded = jwt.verify(token, jwtSecret)

    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.id !== 'string' ||
      !mongoose.Types.ObjectId.isValid(decoded.id) ||
      typeof decoded.exp !== 'number' ||
      decoded.exp * 1000 <= Date.now()
    ) {
      return next(new Error('Unauthorized'))
    }

    // Verificar la cuenta y los permisos actuales en MongoDB.
    const usuario = await Usuario.findById(decoded.id)
      .select('rol estado')
      .lean()
      .exec()

    if (
      !usuario ||
      usuario.estado === false ||
      typeof usuario.rol !== 'string' ||
      !usuario.rol.trim()
    ) {
      return next(new Error('Unauthorized'))
    }

    // No confiar en el rol antiguo incluido en el JWT.
    socket.data.usuario = {
      id: String(usuario._id),
      rol: usuario.rol,
      iat:
        typeof decoded.iat === 'number'
          ? decoded.iat
          : undefined,
      exp: decoded.exp
    }

    next()
  } catch{
    console.warn(
      'Socket rechazado: token inválido o sesión no verificable.'
    )
    next(new Error('Unauthorized'))
  }
}

export const initSocket = (httpServer: HTTPServer) => {
  io = new SocketIOServer<
    DefaultEventsMap,
    DefaultEventsMap,
    DefaultEventsMap,
    CustomSocketData
  >(httpServer, {
    cors: {
      origin: [...ALLOWED_ORIGINS],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true
    }
  })

  io.use(autenticarSocket)

  io.on('connection', (socket: CustomSocket) => {
    const usuario = socket.data.usuario

    if (!usuario || typeof usuario.exp !== 'number') {
      socket.disconnect(true)
      return
    }

    const expiracionMs = usuario.exp * 1000 - Date.now()

    if (expiracionMs <= 0) {
      socket.emit('auth:unauthorized', {
        mensaje: 'Tu sesión ha expirado. Inicia sesión nuevamente.'
      })
      socket.disconnect(true)
      return
    }

    // Desconectar el socket al caducar su JWT.
    const temporizadorExpiracion = setTimeout(() => {
      socket.emit('auth:unauthorized', {
        mensaje: 'Tu sesión ha expirado. Inicia sesión nuevamente.'
      })
      socket.disconnect(true)
    }, expiracionMs)

    temporizadorExpiracion.unref?.()

    const rolUsuario = usuario.rol

    console.log(
      `Usuario conectado por Socket.IO: ${socket.id} (Rol: ${rolUsuario})`
    )

       const rolNormalizado = rolUsuario.toLowerCase()

    if (rolNormalizado === 'mesero') {
      socket.join('room:meseros')
      socket.join('room:mesas')
    } else if (rolNormalizado === 'cajero') {
      socket.join('room:caja')
      socket.join('room:mesas')
    } else if (rolNormalizado === 'cocinero') {
      socket.join('room:cocina')
    } else if (rolNormalizado === 'administrador') {
      socket.join('room:meseros')
      socket.join('room:caja')
      socket.join('room:cocina')
      socket.join('room:mesas')
    }

    socket.join(`user:${usuario.id}`)

    socket.on('disconnect', () => {
      clearTimeout(temporizadorExpiracion)
      console.log(`Usuario desconectado: ${socket.id}`)
    })
  })

  return io
}

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io no ha sido inicializado')
  }

  return io
}
