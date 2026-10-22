//src/configs/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary'
import multer from 'multer'
import dotenv from 'dotenv'
import { randomUUID } from 'node:crypto'

dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// Guarda el archivo en memoria (buffer) en vez de disco
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const formatosPermitidos = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ]

    if (!formatosPermitidos.includes(file.mimetype)) {
      cb(
        new Error(
          'Formato no permitido. Utiliza una imagen JPEG, PNG o WebP.'
        )
      )
      return
    }

    cb(null, true)
  }
})

type FormatoImagen = 'jpeg' | 'png' | 'webp'

function detectarFormatoImagen(
  buffer: Buffer
): FormatoImagen | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'jpeg'
  }

  const firmaPNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a
  ])

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(firmaPNG)
  ) {
    return 'png'
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }

  return null
}



// Función para subir buffer a Cloudinary
export const uploadToCloudinary = (
  buffer: Buffer,
  filename: string
): Promise<{ url: string; publicId: string }> => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return Promise.reject(
      new Error('El archivo está vacío o no es válido.')
    )
  }

  if (buffer.length > 5 * 1024 * 1024) {
    return Promise.reject(
      new Error('La imagen supera el límite de 5 MB.')
    )
  }

  const formato = detectarFormatoImagen(buffer)

  if (!formato) {
    return Promise.reject(
      new Error(
        'El contenido no corresponde a una imagen JPEG, PNG o WebP válida.'
      )
    )
  }

  const nombreSinExtension = filename
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60)

  const nombreLimpio = nombreSinExtension || 'imagen'
  const publicId = `plato_${randomUUID()}_${nombreLimpio}`

  return new Promise<{ url: string; publicId: string }>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'image',
            folder: 'sabor-gestion/platos',
            public_id: publicId,
            transformation: [
              {
                width: 800,
                height: 600,
                crop: 'limit'
              }
            ]
          },
          (error, resultado) => {
            if (error) {
              reject(error)
              return
            }

            if (
              !resultado ||
              typeof resultado.secure_url !== 'string' ||
              typeof resultado.public_id !== 'string'
            ) {
              reject(
                new Error(
                  'Cloudinary no devolvió un resultado válido.'
                )
              )
              return
            }

            resolve({
              url: resultado.secure_url,
              publicId: resultado.public_id
            })
          }
        )
        .end(buffer)
    }
  )
}


export const eliminarDeCloudinary = async (
  publicId: string
) => {
  return await cloudinary.uploader.destroy(publicId)
}

export { cloudinary }
