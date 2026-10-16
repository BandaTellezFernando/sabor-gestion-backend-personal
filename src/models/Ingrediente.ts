// src/models/Ingrediente.ts
import mongoose, { Schema, Document } from 'mongoose'
import { UNIDADES_MEDIDA, UnidadMedida } from '../utils/unidades'

export interface IIngrediente extends Document {
  nombre: string
  unidadMedida: UnidadMedida
  disponible: boolean
  stockActual: number
  fechaRegistro: Date
}

const IngredienteSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    unidadMedida: {
      type: String,
      required: true,
      trim: true,
      enum: {
        values: [...UNIDADES_MEDIDA],
        message: 'La unidad de medida no está permitida.',
      },
    },
    disponible: { type: Boolean, default: true },
    stockActual: { type: Number, required: true, default: 0, min: 0 },
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
