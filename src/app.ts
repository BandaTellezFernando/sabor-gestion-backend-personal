//src/app.ts
import express, { Application, Request, Response } from 'express'
import cors from 'cors'
import morgan from 'morgan'
import path from 'path' // <-- Por si necesitas servir imágenes

// 1. Importamos las rutas
import authRoutes from './routes/auth.routes'
import usuarioRoutes from './routes/usuario.routes'
import categoriaRoutes from './routes/categoria.routes'
import mesaRoutes from './routes/mesa.routes'
import ubicacionRoutes from './routes/ubicacion.routes'
import platoRoutes from './routes/plato.routes'
import reservaRoutes from './routes/reserva.routes'
import pedidoRoutes from './routes/pedido.routes'
import pagoRoutes from './routes/pago.routes'
import dashboardRoutes from './routes/dashboard.routes'
import uploadRouters from './routes/upload.routes' // <-- Sin el .js
import inventarioRoutes from './routes/inventario.routes'

const app: Application = express()

// Middlewares globales
app.use(morgan('dev'))
// Localización: src/app.ts
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'https://quirquinita.onrender.com', // <-- Reemplaza la URL vieja por esta
      'https://tis-pied.vercel.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Servir archivos estáticos (Descomenta esto si guardas imágenes localmente en una carpeta 'uploads')
// app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// Rutas
app.use('/api/upload', uploadRouters)
app.use('/api/auth', authRoutes)
app.use('/api/usuarios', usuarioRoutes)
app.use('/api/categorias', categoriaRoutes)
app.use('/api/mesas', mesaRoutes)
app.use('/api/ubicaciones', ubicacionRoutes)
app.use('/api/platos', platoRoutes)
app.use('/api/reservas', reservaRoutes)
app.use('/api/pedidos', pedidoRoutes)
app.use('/api/pagos', pagoRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/inventario', inventarioRoutes)
// Health check / Ruta de prueba
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'API de Sabor & Gestión funcionando correctamente 🚀'
  })
})

export default app
