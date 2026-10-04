// src/models/Mesa.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IMesa extends Document {
  numero: string
  capacidad: number
  ubicacion: string
  ubicacionId?: mongoose.Types.ObjectId // Agregado para tipado
  estado: string
  createdAt: Date // Agregado por el timestamps: true
  updatedAt: Date // Agregado por el timestamps: true
}

const MesaSchema = new Schema(
  {
    numero: { type: String, required: true, unique: true },
    capacidad: { type: Number, required: true, min: 1 },
    ubicacion: { type: String, default: 'Salón Principal' },
    ubicacionId: { type: Schema.Types.ObjectId, ref: 'Ubicacion', default: null },
    estado: {
      type: String,
      enum: ['Libre', 'Ocupada', 'Cuenta Solicitada'],
      default: 'Libre'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<IMesa>('Mesa', MesaSchema)
