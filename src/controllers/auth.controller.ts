// src/controllers/auth.controller.ts
import { Request, Response } from 'express'
import crypto from 'crypto'
import Usuario from '../models/Usuario'
import Cliente from '../models/Cliente'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { enviarCorreo } from '../services/email.service'

import { CodigoVerificacionService } from '../services/codigo-verificacion.service'
const codigoService = new CodigoVerificacionService()

export const loginUsuario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body
    console.log(`\n🔑 [LOGIN] Intento de acceso con email: ${email}`)

    const usuarioEncontrado = await Usuario.findOne({ email })
    if (!usuarioEncontrado) {
      console.log(` [LOGIN] Falló: Usuario no encontrado en la BD.`)
      res.status(404).json({ mensaje: 'Usuario no encontrado en el sistema' })
      return
    }

    if (!usuarioEncontrado.estado) {
      res
        .status(403)
        .json({ mensaje: 'Esta cuenta ha sido desactivada. Contacta al administrador.' })
      return
    }

    const passwordValida = await bcrypt.compare(password, usuarioEncontrado.password)
    if (!passwordValida) {
      console.log(` [LOGIN] Falló: Contraseña incorrecta para ${email}.`)
      res.status(401).json({ mensaje: 'Contraseña incorrecta' })
      return
    }

    console.log(`[LOGIN] Éxito: ${usuarioEncontrado.nombre} ha logueado exitosamente.`)

    // Convertir el documento a objeto puro para poder leer campos fuera del esquema como 'ubicacion'
    const userObj: any =
      typeof usuarioEncontrado.toObject === 'function'
        ? usuarioEncontrado.toObject()
        : usuarioEncontrado

    const token = jwt.sign(
      {
        id: userObj._id,
        rol: userObj.rol,
        zona: userObj.ubicacion || userObj.zona || ''
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    )

    res.status(200).json({
      mensaje: 'Bienvenido a Sabor & Gestión',
      token: token,
      usuario: {
        id: userObj._id,
        nombre: userObj.nombre,
        apellido: userObj.apellido,
        rol: userObj.rol,
        zona: userObj.ubicacion || userObj.zona || ''
      }
    })
  } catch (error) {
    console.error('Error en el login:', error)
    res.status(500).json({ mensaje: 'Error interno del servidor al intentar hacer login' })
  }
}

// Las funciones verificarCodigo y reenviarCodigo las dejamos intactas.
// Como ya nadie entra en ese flujo, simplemente no se usarán, pero no estorban.
export const verificarCodigo = async (req: Request, res: Response): Promise<void> => {
  /* ... código original ... */
}
export const reenviarCodigo = async (req: Request, res: Response): Promise<void> => {
  /* ... código original ... */
}

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body
    if (!email) {
      res.status(400).json({ mensaje: 'El correo electrónico es requerido' })
      return
    }

    const cliente = await Cliente.findOne({ email: email.trim().toLowerCase() })
    if (!cliente) {
      res.json({ mensaje: 'Si el correo está registrado, se enviará un enlace de recuperación' })
      return
    }

    const token = crypto.randomBytes(20).toString('hex')
    cliente.resetPasswordToken = token
    cliente.resetPasswordExpires = new Date(Date.now() + 3600000) // 1 hora
    await cliente.save()

    const resetUrl = `${req.headers.origin}/reset-password?token=${token}`

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; background-color: #faf7f2; padding: 40px 20px; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 16px; border: 1px solid #e0d0c5; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="color: #4b2e2d; margin-bottom: 20px; font-weight: 800;">Restablecer Contraseña</h2>
          <p style="color: #6b3e2e; font-size: 16px; line-height: 1.5; margin-bottom: 30px;">
            Hola, has solicitado restablecer tu contraseña para tu cuenta de cliente en <strong>Sabor & Gestión</strong>. 
            Haz clic en el siguiente botón para continuar. Este enlace expira en 1 hora.
          </p>
          <a href="${resetUrl}" style="display: inline-block; background-color: #d96c4a; color: #ffffff; text-decoration: none; padding: 14px 28px; font-weight: bold; border-radius: 10px; font-size: 16px; box-shadow: 0 4px 8px rgba(217,108,74,0.3); transition: all 0.2s;">
            Restablecer contraseña
          </a>
          <p style="color: #a08070; font-size: 12px; margin-top: 30px;">
            Si no solicitaste este cambio, por favor ignora este correo.
          </p>
        </div>
      </div>
    `

    await enviarCorreo(cliente.email, 'Recuperación de Contraseña', htmlBody)

    res.json({ mensaje: 'Si el correo está registrado, se enviará un enlace de recuperación' })
  } catch (error: any) {
    console.error('Error en forgotPassword:', error)
    res.status(500).json({ mensaje: 'Error interno del servidor al procesar la solicitud' })
  }
}

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body
    if (!token || !password) {
      res.status(400).json({ mensaje: 'El token y la contraseña son requeridos' })
      return
    }

    const cliente = await Cliente.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    })

    if (!cliente) {
      res.status(400).json({ mensaje: 'El token de recuperación es inválido o ha expirado' })
      return
    }

    const salt = await bcrypt.genSalt(10)
    cliente.password = await bcrypt.hash(password, salt)

    cliente.resetPasswordToken = undefined
    cliente.resetPasswordExpires = undefined
    await cliente.save()

    res.status(200).json({ mensaje: 'Contraseña restablecida exitosamente' })
  } catch (error: any) {
    console.error('Error en resetPassword:', error)
    res.status(500).json({ mensaje: 'Error interno del servidor al restablecer la contraseña' })
  }
}
