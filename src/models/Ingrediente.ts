// src/models/Ingrediente.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IIngrediente extends Document {
  nombre: string
  unidadMedida: string
  disponible: boolean
  fechaRegistro: Date
}

const IngredienteSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    unidadMedida: {
      type: String,
      required: true,
      trim: true
    },
    disponible: { type: Boolean, default: true },
    fechaRegistro: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

IngredienteSchema.index(
  { nombre: 1 },
  { unique: true, collation: { locale: 'es', strength: 2 } }
)

export default mongoose.model<IIngrediente>('Ingrediente', IngredienteSchema)
