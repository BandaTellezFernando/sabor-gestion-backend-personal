import mongoose from 'mongoose'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import Usuario from '../models/Usuario'
import Categoria from '../models/Categoria'
import Plato from '../models/Plato'
import Mesa from '../models/Mesa'

dotenv.config()

const seed = async () => {
  try {
    const mongoURI = process.env.MONGO_URI
    if (!mongoURI) throw new Error('La variable de entorno MONGO_URI no está definida.')

    await mongoose.connect(mongoURI)
    console.log('🟢 Conectado a la Base de Datos para seeding...')

    // Limpiar colecciones
    await Usuario.deleteMany({})
    await Categoria.deleteMany({})
    await Plato.deleteMany({})
    await Mesa.deleteMany({})
    console.log('🧹 Colecciones limpias')

    // ── Crear Categorías ────────────────────────────────────
    const categoriasData = [
      { nombre: 'Entradas' },
      { nombre: 'Sopas' },
      { nombre: 'Segundos' },
      { nombre: 'Postres' },
      { nombre: 'Bebidas' }
    ]
    const categorias = await Categoria.insertMany(categoriasData)
    console.log('✅ 5 categorías creadas')

    // ── Crear Usuario Administrador ────────────────────────
    const passwordHash = await bcrypt.hash('admin123', 10)
    const admin = await Usuario.create({
      nombre: 'Admin',
      apellido: 'Sabor',
      ci: '123456789',
      email: 'admin@sabor.com',
      password: passwordHash,
      rol: 'Administrador',
      estado: true,
      verificado: true
    })
    console.log('✅ Usuario Admin creado: admin@sabor.com / admin123')

    // ── Crear Usuario Mesero ────────────────────────────────
    const meseroPass = await bcrypt.hash('mesero123', 10)
    await Usuario.create({
      nombre: 'Juan',
      apellido: 'Mesero',
      ci: '987654321',
      email: 'mesero@sabor.com',
      password: meseroPass,
      rol: 'Mesero',
      estado: true,
      verificado: true
    })
    console.log('✅ Usuario Mesero creado: mesero@sabor.com / mesero123')

    // ── Crear Platos de Ejemplo ────────────────────────────
    const segundosId = categorias[2]._id
    const platosData = [
      {
        nombre: 'Lomo a lo Pobre',
        descripcion: 'Carne de res jugosa con papas y huevo',
        precio: 85,
        categoria: segundosId,
        imagenUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
        disponible: true
      },
      {
        nombre: 'Milanesa Napolitana',
        descripcion: 'Milanesa cubierta con queso y salsa de tomate',
        precio: 75,
        categoria: segundosId,
        imagenUrl: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=500',
        disponible: true
      }
    ]
    await Plato.insertMany(platosData)
    console.log('✅ 2 platos de ejemplo creados')

    // ── Crear Mesas ─────────────────────────────────────────
    const mesasData = []
    for (let i = 1; i <= 8; i++) {
      mesasData.push({
        numero: i,
        capacidad: Math.ceil(i / 2) * 2,
        estado: 'Libre'
      })
    }
    await Mesa.insertMany(mesasData)
    console.log('✅ 8 mesas creadas')

    console.log('\n🌱 🎉 Seeding completado exitosamente\n')
    console.log('📋 CREDENCIALES DE PRUEBA:')
    console.log('   Admin: admin@sabor.com / admin123')
    console.log('   Mesero: mesero@sabor.com / mesero123')
    console.log('')

    process.exit(0)
  } catch (error) {
    console.error('🔴 Error en seeding:', error)
    process.exit(1)
  }
}

seed() // Ejecuta el proceso
