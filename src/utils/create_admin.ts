import mongoose from 'mongoose'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import Usuario from '../models/Usuario'

dotenv.config()

async function main() {
  const MONGO = process.env.MONGO_URI || process.env.DB_URI
  if (!MONGO) {
    console.error('Falta MONGO_URI/DB_URI en las variables de entorno')
    process.exit(1)
  }

  await mongoose.connect(MONGO)
  console.log('Conectado a DB')

  const email = 'us@gmail.com'
  const password = 'us1234'

  const passwordHash = await bcrypt.hash(password, 10)

  const existing = await Usuario.findOne({ email })
  if (existing) {
    existing.nombre = existing.nombre || 'Admin'
    existing.apellido = existing.apellido || 'Usuario'
    existing.password = passwordHash
    existing.rol = 'Administrador'
    existing.estado = true
    existing.verificado = true
    await existing.save()
    console.log('Usuario actualizado:', email)
  } else {
    await Usuario.create({
      nombre: 'Admin',
      apellido: 'Usuario',
      ci: '00000000',
      email,
      password: passwordHash,
      rol: 'Administrador',
      estado: true,
      verificado: true
    })
    console.log('Usuario creado:', email)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
