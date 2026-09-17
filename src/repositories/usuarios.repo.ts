//src/repositories/usuarios.repo.ts
import Usuario, { IUsuario } from '../models/Usuario'

export const buscarPorEmail = async (email: string): Promise<IUsuario | null> => {
  return await Usuario.findOne({ email })
}

export const obtenerUsuarioPorId = async (id: string): Promise<IUsuario | null> => {
  return await Usuario.findById(id)
}

export const crearUsuario = async (datos: Partial<IUsuario>): Promise<IUsuario> => {
  const nuevoUsuario = new Usuario(datos)
  return await nuevoUsuario.save()
}

export const marcarUsuarioComoVerificado = async (id: string): Promise<void> => {
  await Usuario.findByIdAndUpdate(id, { verificado: true })
}
