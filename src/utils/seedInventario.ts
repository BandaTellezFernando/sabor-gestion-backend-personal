// src/utils/seedInventario.ts
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Plato from '../models/Plato'
import Ingrediente from '../models/Ingrediente'
import Receta from '../models/Receta'

dotenv.config()

const seedInventario = async () => {
  try {
    const mongoURI = process.env.MONGO_URI
    if (!mongoURI) throw new Error('La variable de entorno MONGO_URI no está definida.')

    await mongoose.connect(mongoURI)
    console.log('🟢 Conectado a MongoDB para seed de inventario...\n')

    // ── 1. Limpiar colecciones de inventario previas ─────────────────────────
    await Ingrediente.deleteMany({})
    await Receta.deleteMany({})
    console.log('🧹 Colecciones Ingrediente y Receta limpiadas')

    // ── 2. Crear los 3 ingredientes de prueba ────────────────────────────────
    const [carneDeRes, papa, huevo] = await Ingrediente.insertMany([
      {
        nombre: 'Carne de Res',
        unidadMedida: 'kg',
        stockActual: 10,
        stockMinimo: 2,
        estado: 'Disponible'
      },
      {
        nombre: 'Papa',
        unidadMedida: 'kg',
        stockActual: 20,
        stockMinimo: 5,
        estado: 'Disponible'
      },
      {
        nombre: 'Huevo',
        unidadMedida: 'unidades',
        stockActual: 15,
        stockMinimo: 3,
        estado: 'Disponible'
      }
    ])

    console.log(
      `✅ Ingrediente creado: "${carneDeRes.nombre}" (stock: ${carneDeRes.stockActual} kg)`
    )
    console.log(`✅ Ingrediente creado: "${papa.nombre}" (stock: ${papa.stockActual} kg)`)
    console.log(`✅ Ingrediente creado: "${huevo.nombre}" (stock: ${huevo.stockActual} unidades)`)

    // ── 3. Buscar un plato existente ─────────────────────────────────────────
    // Prioridad: busca "Pique" (plato boliviano típico), si no existe toma el primero disponible
    let plato = await Plato.findOne({ nombre: { $regex: 'Pique', $options: 'i' } })

    if (!plato) {
      plato = await Plato.findOne()
    }

    if (!plato) {
      console.warn(
        '\n⚠️  No se encontró ningún plato en la base de datos. Ejecuta primero el seed principal (npm run seed).'
      )
      await mongoose.disconnect()
      process.exit(0)
    }

    console.log(`\n🍽️  Plato encontrado para asociar receta: "${plato.nombre}" (ID: ${plato._id})`)

    // ── 4. Verificar si ya existe una receta para este plato y eliminarla ────
    await Receta.deleteOne({ plato: plato._id })

    // ── 5. Crear la Receta (escandallo) ──────────────────────────────────────
    const receta = await Receta.create({
      plato: plato._id,
      ingredientes: [
        { ingrediente: carneDeRes._id, cantidadNecesaria: 0.3 },
        { ingrediente: papa._id, cantidadNecesaria: 0.25 },
        { ingrediente: huevo._id, cantidadNecesaria: 2 }
      ]
    })

    console.log(`✅ Receta creada para "${plato.nombre}":`)
    console.log(`   • Carne de Res  → ${receta.ingredientes[0].cantidadNecesaria} kg por porción`)
    console.log(`   • Papa          → ${receta.ingredientes[1].cantidadNecesaria} kg por porción`)
    console.log(
      `   • Huevo         → ${receta.ingredientes[2].cantidadNecesaria} unidades por porción`
    )

    // ── 6. Resumen final ─────────────────────────────────────────────────────
    console.log('\n🌱 🎉 Seed de inventario completado exitosamente\n')
    console.log('📦 ESTADO DEL INVENTARIO SEMBRADO:')
    console.log(`   Ingredientes creados : 3`)
    console.log(`   Recetas creadas      : 1 (para "${plato.nombre}")`)
    console.log('')

    await mongoose.disconnect()
    console.log('🔌 Conexión cerrada limpiamente.')
    process.exit(0)
  } catch (error) {
    console.error('🔴 Error en seed de inventario:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

seedInventario()
