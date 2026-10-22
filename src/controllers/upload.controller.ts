//src/controllers/upload.controller.ts
import { Request, Response } from 'express'
import { uploadToCloudinary } from '../configs/cloudinary'

export const subirImagen = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.file) {
    res.status(400).json({
      mensaje: 'No se proporcionó ninguna imagen válida.'
    })
    return
  }

  try {
    const resultado = await uploadToCloudinary(
      req.file.buffer,
      req.file.originalname
    )

    res.status(200).json({
      mensaje: 'Imagen subida con éxito',
      url: resultado.url,
      publicId: resultado.publicId
    })
  } catch (error: unknown) {
    console.error(
      'Error al subir la imagen:',
      error instanceof Error
        ? error.message
        : 'Error desconocido'
    )

    res.status(500).json({
      mensaje:
        'Error interno del servidor al procesar la imagen.'
    })
  }
}