//src/app.ts
import express, { Application, Request, Response } from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { ALLOWED_ORIGINS } from './utils/constants'
import cuentaMesaRoutes from './routes/cuentaMesa.routes'
import usuarioRoutes from './routes/usuario.routes'
import categoriaRoutes from './routes/categoria.routes'
import mesaRoutes from './routes/mesa.routes'
import ubicacionRoutes from './routes/ubicacion.routes'
import platoRoutes from './routes/plato.routes'
import pedidoRoutes from './routes/pedido.routes'
import pagoRoutes from './routes/pago.routes'
import dashboardRoutes from './routes/dashboard.routes'
import uploadRouters from './routes/upload.routes' // <-- Sin el .js
import inventarioRoutes from './routes/inventario.routes'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'

const app: Application = express()

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    mensaje:
      'Demasiadas solicitudes. Inténtalo de nuevo más tarde.'
  }
})

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    mensaje:
      'Demasiados intentos de inicio de sesión. Inténtalo más tarde.'
  }
})

const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    mensaje:
      'Se alcanzó el límite de subidas. Inténtalo más tarde.'
  }
})

const qrPublicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    mensaje:
      'Demasiadas solicitudes QR. Inténtalo de nuevo más tarde.'
  }
})

// Middlewares globales
app.use(helmet())
app.use(morgan('dev'))

app.use(
  cors({
    origin: [...ALLOWED_ORIGINS],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
)

// Límite general para la API.
app.use('/api', apiRateLimiter)

// Límites específicos para endpoints sensibles.
app.use('/api/usuarios/login', loginRateLimiter)
app.use('/api/upload', uploadRateLimiter)
app.use('/api/pagos/cuentas/qr', qrPublicRateLimiter)

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({
  extended: true,
  limit: '1mb'
}))
// Localización: src/app.ts
app.use(
  cors({
    origin: [...ALLOWED_ORIGINS],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/api/cuentas-mesa', cuentaMesaRoutes)
// Servir archivos estáticos (Descomenta esto si guardas imágenes localmente en una carpeta 'uploads')
// app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// Rutas
app.use('/api/upload', uploadRouters)
app.use('/api/usuarios', usuarioRoutes)
app.use('/api/categorias', categoriaRoutes)
app.use('/api/mesas', mesaRoutes)
app.use('/api/ubicaciones', ubicacionRoutes)
app.use('/api/platos', platoRoutes)
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
