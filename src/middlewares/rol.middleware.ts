// src/middlewares/rol.middleware.ts
import { Response, NextFunction } from 'express'
import { CustomRequest } from './auth.middleware'

export const permitirRoles = (...rolesPermitidos: string[]) => {
  return (req: CustomRequest, res: Response, next: NextFunction): any => {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: 'Acceso denegado. Usuario no autenticado.'
      })
    }

    const userRole = String(req.usuario.rol || '')
      .toLowerCase()
      .trim()
    const allowed = rolesPermitidos.some((role) => {
      const r = role.toLowerCase().trim()
      if (r === userRole) return true
      if (
        (r === 'repartidor' || r === 'delivery') &&
        (userRole === 'repartidor' || userRole === 'delivery')
      )
        return true
      return false
    })

    if (!allowed) {
      return res.status(403).json({
        mensaje: 'Acceso denegado. No tienes permisos para realizar esta acción.'
      })
    }

    next()
  }
}

export const soloAdmins = permitirRoles('Administrador')
