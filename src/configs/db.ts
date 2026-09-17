import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

export const connectDB = async () => {
  try {
    const dbUri = process.env.MONGO_URI
    if (!dbUri) {
      throw new Error('La variable de entorno MONGO_URI no está definida.')
    }

    const conn = await mongoose.connect(dbUri)
    console.log(`🟢 Base de Datos MongoDB Conectada: ${conn.connection.name}`)
  } catch (error) {
    console.error(`🔴 Error conectando a MongoDB: ${error}`)
    process.exit(1) // Detiene el servidor si no hay base de datos
  }
}
