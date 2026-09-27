// src/models/Contador.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IContador extends Document {
  nombre_secuencia: string
  secuencia: number
}

const ContadorSchema = new Schema<IContador>({
  nombre_secuencia: { type: String, required: true, unique: true },
  secuencia: { type: Number, default: 0 }
})

export default mongoose.model<IContador>('Contador', ContadorSchema)

