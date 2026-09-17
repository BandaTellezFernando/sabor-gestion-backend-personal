//src/routes/upload.routes.ts
import { Router } from 'express'
import { subirImagen } from '../controllers/upload.controller'
import { upload } from '../configs/cloudinary' // Importamos tu multer configurado
import { verificarToken } from '../middlewares/auth.middleware'
import { soloAdmins } from '../middlewares/rol.middleware'

const router = Router()

// El endpoint será POST /api/upload
// Importante: El frontend debe enviar el archivo en un campo llamado 'imagen'
router.post('/', verificarToken, soloAdmins, upload.single('imagen'), subirImagen)

export default router
