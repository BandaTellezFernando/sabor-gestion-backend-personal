import app from './app.js'
import { connectDB } from './configs/db.js'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { initSocket } from './socket/socket'
import { mesaOcupacionService } from './services/mesaOcupacion.service'

dotenv.config()

const PORT = process.env.PORT || 3000
const httpServer = createServer(app)

// Inicializamos el Socket
initSocket(httpServer)

connectDB().then(() => {
  // Iniciar limpieza periódica de ocupaciones temporales expiradas
  mesaOcupacionService.iniciarLimpiezaAutomatica()

  httpServer.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`)
    console.log(`🩺 Health check: http://localhost:${PORT}/api/health`)
    console.log(`🚀 Servidor con WebSockets en http://localhost:${PORT}`)
  })
})
export default httpServer
