import app from './app.js'
import { connectDB } from './configs/db.js'
import dotenv from 'dotenv'
import { createServer } from 'http' // <--- NUEVO
import { initSocket } from './socket/socket' // <--- NUEVO
import { startAssignmentTimeout } from './jobs/assignmentTimeout'
import { startSignalMonitor } from './jobs/signalMonitor'

dotenv.config()

const PORT = process.env.PORT || 3000
const httpServer = createServer(app) // Creamos el servidor HTTP con Express

// Inicializamos el Socket
initSocket(httpServer)
startAssignmentTimeout()
startSignalMonitor()

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:3000`)
    console.log(`🩺 Health check: http://localhost:3000/api/health`)
    console.log(`🚀 Servidor con WebSockets en http://localhost:${PORT}`)
  })
})
export default httpServer
