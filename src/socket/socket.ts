import { Server as SocketIOServer, Socket, DefaultEventsMap } from 'socket.io'
import { Server as HTTPServer } from 'http'
import jwt from 'jsonwebtoken'
import { UsuarioTokenPayload } from '../middlewares/auth.middleware'
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
>

export const autenticarSocket = (socket: CustomSocket, next: (err?: Error) => void) => {
  try {
    const authToken = socket.handshake.auth?.token
    const authHeader = socket.handshake.headers.authorization

    const token =
      (typeof authToken === 'string' ? authToken : null) ||
      (typeof authHeader === 'string' ? authHeader.split(' ')[1] : null)

    if (!token) {
      console.log(`⚡ Socket rechazado (sin token) id=${socket.id}`)
      return next(new Error('Unauthorized'))
    }

    if (!process.env.JWT_SECRET) {
      console.error('⚡ FATAL ERROR: JWT_SECRET no está configurado en el servidor para WebSockets.')
      return next(new Error('Unauthorized'))
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as UsuarioSocketPayload

    // Guardar info de usuario en el socket para usos posteriores
    socket.data = socket.data || {}
    socket.data.usuario = decoded

    return next()
  } catch {
    console.log(`⚡ Socket rechazado (token inválido) id=${socket.id}`)
    return next(new Error('Unauthorized'))
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

  // Middleware de autenticación para el handshake de socket
  io.use(autenticarSocket)

  io.on('connection', (socket: CustomSocket) => {
    const rolUsuario = socket.data?.usuario?.rol
    console.log(`⚡ Usuario conectado: ${socket.id} (Rol: ${rolUsuario || 'Desconocido'})`)

    if (rolUsuario === 'Mesero') {
      socket.join('room:meseros')
    } else if (rolUsuario === 'Cajero') {
      socket.join('room:caja')
      const usuarioId = socket.data?.usuario?.id
      if (usuarioId) {
        socket.join(`user:${usuarioId}`)
      }
    }

    socket.on('disconnect', () => {
      console.log(`🔥 Usuario desconectado: ${socket.id}`)
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
