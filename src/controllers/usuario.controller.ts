//src/controllers/usuario.controller.ts
import { Request, Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import Usuario from '../models/Usuario'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import CierreCaja from '../models/CierreCaja'
import { obtenerFechaBolivia, formatearFechaBolivia } from '../utils/fechaBolivia'
// Listar todos los usuarios (Para tu tabla principal)
export const obtenerUsuarios = async (req: Request, res: Response) => {
  try {
    // Como 'ubicacion' ya está en el modelo, podemos usar Mongoose normalmente
    const usuarios = await Usuario.find().select('-password').lean()

    // MAPEO: Adaptamos 'ubicacion' de MongoDB al campo 'zona' que requiere el Frontend
    const usuariosMapeados = usuarios.map((u: any) => {
      return { ...u, id: u._id, _id: u._id, zona: u.ubicacion || u.zona || '' }
    })
    res.status(200).json(usuariosMapeados)
  } catch (error) {
    console.error('Error al obtener usuarios:', error)
    res.status(500).json({ mensaje: 'Error al obtener los usuarios' })
  }
}

// Crear un nuevo usuario (Desde el modal del administrador)
export const crearUsuario = async (req: Request, res: Response): Promise<any> => {
  try {
    const { nombre, apellido, ci, email, password, rol, zona } = req.body

    const regexNombres = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/
    if (!regexNombres.test(nombre) || nombre.length > 30) {
      return res
        .status(400)
        .json({ mensaje: 'El nombre solo debe contener letras y máximo 30 caracteres.' })
    }
    if (!regexNombres.test(apellido) || apellido.length > 30) {
      return res
        .status(400)
        .json({ mensaje: 'Los apellidos solo deben contener letras y máximo 30 caracteres.' })
    }
    if (!/^\d+$/.test(ci) || ci.length > 8) {
      return res
        .status(400)
        .json({ mensaje: 'El CI solo debe contener números y máximo 8 dígitos.' })
    }

    // 1. Validación dual: Verificamos si el CI o el Email ya existen
    const usuarioExistente = await Usuario.findOne({
      $or: [{ email: email }, { ci: ci }]
    })

    if (usuarioExistente) {
      if (usuarioExistente.ci === ci) {
        return res
          .status(400)
          .json({ mensaje: 'Ya existe un usuario registrado con este Carnet de Identidad' })
      }
      return res.status(400).json({ mensaje: 'El correo electrónico ya está registrado' })
    }

    // 2. Encriptar la contraseña antes de guardarla
    const salt = await bcrypt.genSalt(10)
    const passwordHasheada = await bcrypt.hash(password, salt)

    // 3. Crear la instancia del nuevo usuario
    const nuevoUsuario = new Usuario({
      nombre,
      apellido,
      ci,
      email,
      password: passwordHasheada,
      rol,
      ubicacion: zona // Ahora Mongoose sí lo guardará automáticamente
      // El 'estado: true' se pone automáticamente por el modelo
    })

    // 4. Guardar en MongoDB
    await nuevoUsuario.save()

    // Consultamos la verdad absoluta
    const usuarioCreado: any = await Usuario.findById(nuevoUsuario._id).select('-password').lean()

    // 5. Responder al frontend confirmando la creación (sin enviar el password de vuelta)
    res.status(201).json({
      mensaje: 'Usuario creado exitosamente',
      usuario: {
        ...usuarioCreado,
        id: usuarioCreado._id,
        _id: usuarioCreado._id,
        zona: usuarioCreado?.ubicacion || zona || ''
      }
    })
  } catch (error: any) {
    console.error('ERROR DETALLADO:', error)
    res.status(500).json({
      mensaje: 'Error en el servidor',
      error: error.message // Esto te dirá si es por el CI, el ROL o el EMAIL
    })
  }
}

// --- AÑADE ESTO AL FINAL DE TU ARCHIVO usuario.controller.ts ---

// 3. Actualizar Usuario (Modal Editar)
export const actualizarUsuario = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params
    const { nombre, apellido, ci, email, password, rol, zona, telefono, direcciones } = req.body

    console.log(
      `\n[USUARIO] Actualizar usuario id=${id} campos recibidos: ${Object.keys(req.body).join(', ')}`
    )

    // Buscar al usuario por ID
    let usuario = await Usuario.findById(id)
    if (!usuario) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }

    const regexNombres = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/
    if (nombre && (!regexNombres.test(nombre) || nombre.length > 30)) {
      return res
        .status(400)
        .json({ mensaje: 'El nombre solo debe contener letras y máximo 30 caracteres.' })
    }
    if (apellido && (!regexNombres.test(apellido) || apellido.length > 30)) {
      return res
        .status(400)
        .json({ mensaje: 'Los apellidos solo deben contener letras y máximo 30 caracteres.' })
    }
    if (ci && (!/^\d+$/.test(ci) || ci.length > 8)) {
      return res
        .status(400)
        .json({ mensaje: 'El CI solo debe contener números y máximo 8 dígitos.' })
    }

    // Si el admin mandó un CI o Email diferente, verificar que no choque con otro usuario
    const orConditions: any[] = []
    if (email !== undefined && email !== usuario.email) orConditions.push({ email: email })
    if (ci !== undefined && ci !== usuario.ci) orConditions.push({ ci: ci })

    if (orConditions.length > 0) {
      const usuarioExistente = await Usuario.findOne({
        $or: orConditions,
        _id: { $ne: new mongoose.Types.ObjectId(id as string) }
      })

      if (usuarioExistente) {
        if (ci !== undefined && usuarioExistente.ci === ci)
          return res.status(400).json({ mensaje: 'El CI ya está en uso por otro usuario' })
        return res.status(400).json({ mensaje: 'El correo ya está en uso por otro usuario' })
      }
    }

    // Preparar los datos a actualizar (solo incluir campos definidos)
    const datosActualizados: any = {}
    if (nombre !== undefined) datosActualizados.nombre = nombre
    if (apellido !== undefined) datosActualizados.apellido = apellido
    if (ci !== undefined) datosActualizados.ci = ci
    if (email !== undefined) datosActualizados.email = email
    if (rol !== undefined) datosActualizados.rol = rol
    if (zona !== undefined) datosActualizados.ubicacion = zona
    if (telefono !== undefined) datosActualizados.telefono = telefono
    if (direcciones !== undefined) datosActualizados.direcciones = direcciones

    // TRUCO: Solo actualizamos la contraseña si el frontend nos envió una nueva
    if (password && typeof password === 'string' && password.trim() !== '') {
      console.log(`[USUARIO] Se solicitó cambio de contraseña para usuario id=${id}`)
      const salt = await bcrypt.genSalt(10)
      datosActualizados.password = await bcrypt.hash(password, salt)
    }

    // Regresamos al método limpio y nativo de Mongoose para actualizar
    const usuarioActualizado: any = await Usuario.findByIdAndUpdate(
      id,
      { $set: datosActualizados },
      { returnDocument: 'after' }
    )
      .select('-password')
      .lean()

    if (!usuarioActualizado) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado tras actualizar' })
    }

    res.status(200).json({
      mensaje: 'Usuario actualizado',
      usuario: {
        ...usuarioActualizado,
        id: usuarioActualizado._id,
        _id: usuarioActualizado._id,
        zona: usuarioActualizado?.ubicacion || zona || ''
      }
    })
  } catch (error: any) {
    console.error('Error al actualizar:', error)
    res
      .status(500)
      .json({ mensaje: 'Error al actualizar el usuario', error: error.message || error })
  }
}

// 4. Cambiar Estado (El Switch Activo/Inactivo)
export const cambiarEstadoUsuario = async (req: CustomRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params
    const { estado, reporte } = req.body // Recibimos true o false, y reporte al cerrar caja

    // Si el rol es 'Cajero', asegurarse de que solo cambie su propia caja
    if (req.usuario && req.usuario.rol.toLowerCase() === 'cajero' && req.usuario.id !== id) {
      return res.status(403).json({
        mensaje: 'Acceso denegado. Un cajero solo puede cambiar el estado de su propia caja.'
      })
    }

    // --- NUEVA VALIDACIÓN: Mínimo 1 caja activa ---
    if (estado === false || String(estado) === 'false') {
      const usuarioTarget = await Usuario.findById(id)
      if (usuarioTarget && usuarioTarget.rol.toLowerCase() === 'cajero') {
        const cajerosActivosRestantes = await Usuario.countDocuments({
          rol: { $regex: /^cajero$/i },
          estado: true,
          _id: { $ne: usuarioTarget._id }
        })

        if (cajerosActivosRestantes === 0) {
          return res
            .status(400)
            .json({ mensaje: 'Debe existir al menos una caja activa en el sistema.' })
        }
      }
    }
    // ----------------------------------------------

    const usuarioActualizado = await Usuario.findByIdAndUpdate(
      id,
      { estado: estado },
      { returnDocument: 'after' }
    )
      .select('-password')
      .lean()

    if (!usuarioActualizado) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }

    // 🔥 REGISTRO AUTOMÁTICO DE CIERRE DE CAJA EN MONGODB
    if ((estado === false || String(estado) === 'false') && reporte) {
      const fechaCierre = obtenerFechaBolivia()
      const nuevoCierre = new CierreCaja({
        cajeroId: id,
        cajeroNombre: `${usuarioActualizado.nombre} ${usuarioActualizado.apellido || ''}`.trim(),
        totalDia: reporte.totalDia || 0,
        efectivo: reporte.efectivo || 0,
        tarjeta: reporte.tarjeta || 0,
        qr: reporte.qr || 0,
        descuentos: reporte.descuentos || 0,
        propinas: reporte.propinas || 0,
        pagosProcesados: reporte.pagosProcesados || 0,
        fechaCierreBolivia: formatearFechaBolivia(fechaCierre),
        fechaCierre
      })
      await nuevoCierre.save()
    }

    res.status(200).json({
      mensaje: `Usuario marcado como ${estado ? 'Activo' : 'Inactivo'}`,
      usuario: { ...usuarioActualizado, zona: (usuarioActualizado as any).ubicacion }
    })
  } catch (error) {
    console.error('Error al cambiar estado:', error)
    res.status(500).json({ mensaje: 'Error al cambiar el estado del usuario' })
  }
}

// 5. Eliminar Usuario Físicamente (El ícono de papelera)
export const eliminarUsuario = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params

    const usuarioEliminado = await Usuario.findByIdAndDelete(id)

    if (!usuarioEliminado) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }

    res.status(200).json({ mensaje: 'Usuario eliminado del sistema exitosamente' })
  } catch (error) {
    console.error('Error al eliminar:', error)
    res.status(500).json({ mensaje: 'Error al eliminar el usuario' })
  }
}
