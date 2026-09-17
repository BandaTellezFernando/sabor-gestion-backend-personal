//src/controllers/cliente.controller.ts
import { Request, Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import Cliente from '../models/Cliente'
import { verifyGoogleToken } from '../utils/googleAuth'

export const registrarCliente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, apellidos, apellido, email, password, telefono, direccion } = req.body

    // Si envían "apellido" en vez de "apellidos", lo mapeamos
    const apellidosFinal = apellidos || apellido

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const nuevoCliente = new Cliente({
      nombre,
      apellidos: apellidosFinal,
      email,
      password: hashedPassword,
      telefono,
      direccion
    })

    await nuevoCliente.save()

    const clienteRespuesta = nuevoCliente.toObject()
    delete (clienteRespuesta as any).password

    res.status(201).json({
      mensaje: 'Cliente registrado exitosamente',
      cliente: clienteRespuesta
    })
  } catch (error: any) {
    // Manejo de error de clave duplicada de MongoDB (E11000) para el email
    if (error.code === 11000) {
      res.status(409).json({ mensaje: 'El email ya está registrado' })
      return
    }

    res.status(500).json({ mensaje: 'Error al registrar el cliente', error: error.message })
  }
}

export const loginCliente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body

    const cliente = await Cliente.findOne({ email })
    if (!cliente) {
      res.status(401).json({ mensaje: 'Credenciales inválidas' })
      return
    }

    const passwordValido = await bcrypt.compare(password, cliente.password)
    if (!passwordValido) {
      res.status(401).json({ mensaje: 'Credenciales inválidas' })
      return
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET no está configurado')
    }

    const token = jwt.sign({ id: cliente._id, rol: 'Cliente' }, process.env.JWT_SECRET, {
      expiresIn: '8h'
    })

    const clienteRespuesta = cliente.toObject()
    delete (clienteRespuesta as any).password

    res.status(200).json({
      mensaje: 'Login exitoso',
      token,
      cliente: clienteRespuesta
    })
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al iniciar sesión', error: err.message })
  }
}

export const obtenerClientes = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientes = await Cliente.find().select('-password')
    res.status(200).json(clientes)
  } catch (error) {
    const err = error as Error
    res.status(500).json({ mensaje: 'Error al obtener la lista de clientes', error: err.message })
  }
}

export const obtenerClientePorId = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Control de seguridad: solo el propio cliente o un administrador pueden ver la info
    if (req.usuario?.rol !== 'Administrador' && req.usuario?.id !== id) {
      res.status(403).json({ mensaje: 'No tiene permisos para acceder a esta información' })
      return
    }

    const cliente = await Cliente.findById(id).select('-password')
    if (!cliente) {
      res.status(404).json({ mensaje: 'Cliente no encontrado' })
      return
    }
    res.status(200).json(cliente)
  } catch (error: any) {
    res.status(500).json({ mensaje: 'Error al obtener el cliente', error: error.message })
  }
}

export const actualizarCliente = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { nombre, apellidos, telefono, password, direcciones } = req.body

    // Control de seguridad: solo el propio cliente o un administrador pueden editar la info
    if (req.usuario?.rol !== 'Administrador' && req.usuario?.id !== id) {
      res.status(403).json({ mensaje: 'No tiene permisos para modificar esta información' })
      return
    }

    const updateFields: any = {}
    if (nombre !== undefined) updateFields.nombre = nombre
    if (apellidos !== undefined) updateFields.apellidos = apellidos
    if (telefono !== undefined) updateFields.telefono = telefono
    if (direcciones !== undefined) updateFields.direcciones = direcciones

    if (password) {
      const salt = await bcrypt.genSalt(10)
      updateFields.password = await bcrypt.hash(password, salt)
    }

    const clienteActualizado = await Cliente.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-password')

    if (!clienteActualizado) {
      res.status(404).json({ mensaje: 'Cliente no encontrado' })
      return
    }

    res.status(200).json({
      mensaje: 'Cliente actualizado exitosamente',
      cliente: clienteActualizado
    })
  } catch (error: any) {
    res.status(500).json({ mensaje: 'Error al actualizar el cliente', error: error.message })
  }
}

export const eliminarCliente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const clienteEliminado = await Cliente.findByIdAndDelete(id)
    if (!clienteEliminado) {
      res.status(404).json({ mensaje: 'Cliente no encontrado' })
      return
    }
    res.status(200).json({ mensaje: 'Cliente eliminado exitosamente' })
  } catch (error: any) {
    res.status(500).json({ mensaje: 'Error al eliminar el cliente', error: error.message })
  }
}

export const loginGoogleCliente = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body
    if (!token) {
      res.status(400).json({ mensaje: 'El token de Google es requerido' })
      return
    }

    const payload = await verifyGoogleToken(token)
    const { email, nombre, apellidos } = payload

    let cliente = await Cliente.findOne({ email })

    if (!cliente) {
      // Registrar cliente nuevo de forma automática
      const randomPassword = crypto.randomBytes(16).toString('hex')
      const salt = await bcrypt.genSalt(10)
      const hashedPassword = await bcrypt.hash(randomPassword, salt)

      cliente = new Cliente({
        nombre,
        apellidos: apellidos || 'Sin apellidos',
        email,
        password: hashedPassword,
        telefono: 'Sin teléfono',
        estado: true
      })

      await cliente.save()
    }

    if (!cliente.estado) {
      res.status(403).json({ mensaje: 'Esta cuenta ha sido desactivada. Contacta al soporte.' })
      return
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET no está configurado')
    }

    const sessionToken = jwt.sign({ id: cliente._id, rol: 'Cliente' }, process.env.JWT_SECRET, {
      expiresIn: '8h'
    })

    const clienteRespuesta = cliente.toObject()
    delete (clienteRespuesta as any).password

    res.status(200).json({
      mensaje: 'Login con Google exitoso',
      token: sessionToken,
      cliente: clienteRespuesta
    })
  } catch (error: any) {
    res.status(500).json({ mensaje: 'Error en la autenticación con Google', error: error.message })
  }
}
