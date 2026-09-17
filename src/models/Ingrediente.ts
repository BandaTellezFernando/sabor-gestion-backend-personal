// src/models/Ingrediente.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IIngrediente extends Document {
  nombre: string
  unidadMedida: string // <-- AHORA ACEPTA CUALQUIER TEXTO
  stockActual: number
  stockMinimo: number
  estado: 'Disponible' | 'Bajo' | 'Agotado'
  fechaRegistro: Date
}

const IngredienteSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    unidadMedida: {
      type: String,
      required: true,
      trim: true // <-- LE QUITAMOS EL ENUM Y LE PUSIMOS TRIM PARA LIMPIAR ESPACIOS
    },
    stockActual: { type: Number, default: 0, min: 0 },
    stockMinimo: { type: Number, default: 0, min: 0 },
    estado: {
      type: String,
      enum: ['Disponible', 'Bajo', 'Agotado'],
      default: 'Disponible'
    },
    fechaRegistro: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<IIngrediente>('Ingrediente', IngredienteSchema)
