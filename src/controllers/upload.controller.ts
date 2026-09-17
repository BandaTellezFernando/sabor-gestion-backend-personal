//src/controllers/upload.controller.ts
import { Request, Response } from 'express'
import { uploadToCloudinary } from '../configs/cloudinary'

export const subirImagen = async (req: Request, res: Response): Promise<any> => {
  try {
    // 1. Verificamos que multer haya dejado pasar el archivo
    if (!req.file) {
      return res.status(400).json({ mensaje: 'No se proporcionó ninguna imagen válida.' })
    }

    // 2. Usamos tu función para subir el buffer a Cloudinary
    const resultado = await uploadToCloudinary(req.file.buffer, req.file.originalname)

    // 3. Devolvemos la URL segura al frontend
    return res.status(200).json({
      mensaje: 'Imagen subida con éxito',
      url: resultado.url,
      publicId: resultado.publicId
    })
  } catch (error) {
    console.error('Error en el controlador al subir imagen:', error)
    return res.status(500).json({ mensaje: 'Error interno del servidor al procesar la imagen.' })
  }
}
