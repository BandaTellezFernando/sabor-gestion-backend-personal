//src/middlewares/auth.middleware.ts

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import Usuario from '../models/Usuario'

// Estructura de identidad utilizada por los controladores.
export interface UsuarioTokenPayload {
  id: string
  rol: string
}

// Express Request con la identidad autenticada.
export interface CustomRequest extends Request {
  usuario?: UsuarioTokenPayload
}

export const verificarToken = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const tokenHeader = req.header('Authorization')

  if (!tokenHeader) {
    res.status(401).json({
      mensaje: 'Acceso denegado. No se proporcionó un token.'
    })
    return
  }

  // Exigir el formato exacto: Authorization: Bearer <token>
  const partes = tokenHeader.trim().split(/\s+/)

  if (
    partes.length !== 2 ||
    partes[0] !== 'Bearer' ||
    !partes[1]
  ) {
    res.status(401).json({
      mensaje: 'Formato del token de autenticación inválido.'
    })
    return
  }

  const jwtSecret = process.env.JWT_SECRET

  if (!jwtSecret) {
    console.error(
      'FATAL ERROR: JWT_SECRET no está configurado.'
    )

    res.status(500).json({
      mensaje: 'Error de configuración de autenticación.'
    })
    return
  }

  let payload: jwt.JwtPayload

  // Primero validar la firma y la expiración del token.
  try {
    const decoded = jwt.verify(partes[1], jwtSecret)

    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.id !== 'string' ||
      !mongoose.Types.ObjectId.isValid(decoded.id)
    ) {
      res.status(401).json({
        mensaje: 'Token inválido o expirado.'
      })
      return
    }

    payload = decoded
  } catch {
    res.status(401).json({
      mensaje: 'Token inválido o expirado.'
    })
    return
  }

  // Después comprobar la existencia, el estado y el rol actuales.
  try {
    const usuario = await Usuario.findById(payload.id)
      .select('rol estado')
      .lean()
      .exec()

    if (
      !usuario ||
      usuario.estado === false ||
      typeof usuario.rol !== 'string' ||
      !usuario.rol.trim()
    ) {
      res.status(401).json({
        mensaje:
          'La sesión ya no es válida. Inicia sesión nuevamente.'
      })
      return
    }

    // No confiar en el rol antiguo incluido en el JWT.
    req.usuario = {
      id: String(usuario._id),
      rol: usuario.rol
    }

    next()
  } catch (error: unknown) {
    console.error(
      'Error al comprobar el estado del usuario autenticado:',
      error
    )

    res.status(500).json({
      mensaje: 'No se pudo validar la sesión.'
    })
  }
}
