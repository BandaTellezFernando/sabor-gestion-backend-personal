// src/controllers/usuario.controller.ts
import { Request, Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import { usuarioService, UsuarioServiceError } from '../services/usuario.service'

/**
 * Listar todos los usuarios para la tabla principal (excluyendo contraseñas)
 */
export const obtenerUsuarios = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const usuarios = await usuarioService.obtenerUsuarios()
    res.status(200).json(usuarios)
  } catch (error) {
    if (error instanceof UsuarioServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al obtener usuarios:', error)
    res.status(500).json({ mensaje: 'Error al obtener los usuarios' })
  }
}

/**
 * Crear un nuevo usuario desde el modal de administración
 */
export const crearUsuario = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const usuario = await usuarioService.crearUsuario(req.body)
    res.status(201).json({
      mensaje: 'Usuario creado exitosamente',
      usuario
    })
  } catch (error: any) {
    if (error instanceof UsuarioServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('ERROR DETALLADO:', error)
    res.status(500).json({
      mensaje: 'Error en el servidor',
      error: error.message
    })
  }
}

/**
 * Actualizar datos de un usuario existente
 */
export const actualizarUsuario = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id)
    const usuario = await usuarioService.actualizarUsuario(id, req.body)
    res.status(200).json({
      mensaje: 'Usuario actualizado',
      usuario
    })
  } catch (error: any) {
    if (error instanceof UsuarioServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al actualizar:', error)
    res.status(500).json({
      mensaje: 'Error al actualizar el usuario',
      error: error.message || error
    })
  }
}

/**
 * Cambiar el estado activo/inactivo de un usuario (y registrar CierreCaja si aplica)
 */
export const cambiarEstadoUsuario = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id)
    const usuarioAuth = req.usuario
      ? { id: req.usuario.id, rol: req.usuario.rol }
      : undefined

    const resultado = await usuarioService.cambiarEstadoUsuario(
      id,
      req.body,
      usuarioAuth
    )

    res.status(200).json({
      mensaje: `Usuario marcado como ${resultado.estado ? 'Activo' : 'Inactivo'}`,
      usuario: resultado.usuario
    })
  } catch (error: any) {
    if (error instanceof UsuarioServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al cambiar estado:', error)
    res.status(500).json({ mensaje: 'Error al cambiar el estado del usuario' })
  }
}

/**
 * Eliminar físicamente un usuario por su ID
 */
export const eliminarUsuario = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id)
    await usuarioService.eliminarUsuario(id)
    res.status(200).json({
      mensaje: 'Usuario eliminado del sistema exitosamente'
    })
  } catch (error: any) {
    if (error instanceof UsuarioServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al eliminar:', error)
    res.status(500).json({ mensaje: 'Error al eliminar el usuario' })
  }
}

/**
 * Iniciar sesión de empleado (Administrador, Mesero, Cajero, Cocinero)
 */
export const loginUsuario = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ mensaje: 'El correo electrónico y la contraseña son requeridos' })
      return
    }

    const resultado = await usuarioService.loginUsuario(email, password)
    res.status(200).json({
      mensaje: 'Login exitoso',
      token: resultado.token,
      usuario: resultado.usuario
    })
  } catch (error: any) {
    if (error instanceof UsuarioServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error en loginUsuario:', error)
    res.status(500).json({ mensaje: 'Error interno del servidor al iniciar sesión' })
  }
}
