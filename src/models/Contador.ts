//src/models/Contador.ts
import mongoose, { Schema } from 'mongoose'

const ContadorSchema = new Schema({
  nombre_secuencia: { type: String, required: true, unique: true },
  secuencia: { type: Number, default: 0 }
})

// Nota: No usamos interfaz aquí para no pelear con 'Document' de Mongoose
export default mongoose.model('Contador', ContadorSchema)
