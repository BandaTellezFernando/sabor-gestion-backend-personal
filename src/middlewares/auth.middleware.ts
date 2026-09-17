//src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// 1. Definimos la estructura exacta de nuestro Token
export interface UsuarioTokenPayload {
  id: string
  rol: string
}

// Extendemos la interfaz Request de Express para que acepte nuestro usuario
export interface CustomRequest extends Request {
  usuario?: UsuarioTokenPayload
}

export const verificarToken = (
  req: CustomRequest,
  res: Response,
  next: NextFunction
): void | Response => {
  try {
    // 1. Obtener el token del header (viene como "Bearer eyJhbGci...")
    const tokenHeader = req.header('Authorization')
    console.log(`\n[MIDDLEWARE] Verificando Token...`)
    if (!tokenHeader) {
      console.log(` [MIDDLEWARE] Bloqueado: No hay token en la petición.`)
      return res.status(401).json({ mensaje: 'Acceso denegado. No se proporcionó un token.' })
    }

    // 2. Extraer solo el token (quitamos la palabra "Bearer ")
    const token = tokenHeader.split(' ')[1]

    if (!process.env.JWT_SECRET) {
      throw new Error('FATAL ERROR: JWT_SECRET no está configurado en el servidor.')
    }

    // 3. Verificar si el token es real y no ha expirado
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as UsuarioTokenPayload

    // 4. Guardar los datos del usuario en la petición para usarlos después
    req.usuario = decoded

    console.log(` [MIDDLEWARE] Token válido. Usuario Rol: ${req.usuario.rol}`)

    // 5. ¡Pase adelante! (Va al siguiente middleware o controlador)
    next()
  } catch (error) {
    console.log(` [MIDDLEWARE] Bloqueado: Token falso o expirado.`)
    return res.status(401).json({ mensaje: 'Token inválido o expirado.' })
  }
}
