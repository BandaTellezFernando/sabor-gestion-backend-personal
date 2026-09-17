//src/configs/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary'
import multer from 'multer'
import dotenv from 'dotenv'

dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// Guarda el archivo en memoria (buffer) en vez de disco
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
  fileFilter: (_req, file, cb) => {
    // Esto nos avisará en la terminal si Multer está leyendo el archivo
    console.log('🧐 Multer revisando archivo:', file.originalname, 'Tipo:', file.mimetype)

    // Agregamos 'image/jpg' por si las moscas
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']

    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Formato no permitido: ${file.mimetype}`))
    }
  }
})

// Función para subir buffer a Cloudinary
export const uploadToCloudinary = (
  buffer: Buffer,
  filename: string
): Promise<{ url: string; publicId: string }> => {
  return new Promise((resolve, reject) => {
    // Limpiamos el nombre: quitamos la extensión (.jpg/.png) para evitar errores en Cloudinary
    const nombreSinExtension = filename.replace(/\.[a-zA-Z0-9]+$/, '')
    const nombreLimpio = nombreSinExtension.replace(/[^a-zA-Z0-9]/g, '_')

    cloudinary.uploader
      .upload_stream(
        {
          folder: 'sabor-gestion/platos',
          public_id: `plato_${Date.now()}_${nombreLimpio}`,
          transformation: [{ width: 800, height: 600, crop: 'limit' }]
        },
        (error, result) => {
          if (error || !result) return reject(error)
          resolve({ url: result.secure_url, publicId: result.public_id })
        }
      )
      .end(buffer)
  })
}

export { cloudinary }
