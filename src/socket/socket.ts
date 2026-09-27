// src/socket/socket.ts
import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as HTTPServer } from 'http'
import jwt from 'jsonwebtoken'

let io: SocketIOServer

export const initSocket = (httpServer: HTTPServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://quirquinita.onrender.com'
      ],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true
    }
  })

  // Middleware de autenticación para el handshake de socket
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        ((socket.handshake.headers as any)?.authorization
          ? (socket.handshake.headers as any).authorization.split(' ')[1]
          : null)

      if (!token) {
        console.log(`⚡ Socket rechazado (sin token) id=${socket.id}`)
        return next(new Error('Unauthorized'))
      }

      const secret = process.env.JWT_SECRET || 'secreto_temporal_de_desarrollo'
      const decoded = jwt.verify(token, secret) as any

      // Guardar info de usuario en el socket para usos posteriores
      ;(socket as any).data = (socket as any).data || {}
      ;(socket as any).data.usuario = decoded

      return next()
    } catch (err) {
      console.log(`⚡ Socket rechazado (token inválido) id=${socket.id}`)
      return next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const rolUsuario = (socket as any).data?.usuario?.rol
    console.log(`⚡ Usuario conectado: ${socket.id} (Rol: ${rolUsuario || 'Desconocido'})`)

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
