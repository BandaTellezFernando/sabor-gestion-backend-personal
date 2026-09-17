// src/models/MovimientoInventario.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IMovimientoInventario extends Document {
  ingrediente: mongoose.Types.ObjectId
  tipoMovimiento: 'Entrada' | 'Salida' | 'Ajuste'
  cantidad: number
  fecha: Date
  descripcion?: string
}

const MovimientoInventarioSchema = new Schema(
  {
    ingrediente: {
      type: Schema.Types.ObjectId,
      ref: 'Ingrediente',
      required: true
    },
    tipoMovimiento: {
      type: String,
      required: true,
      enum: ['Entrada', 'Salida', 'Ajuste']
    },
    cantidad: { type: Number, required: true },
    fecha: { type: Date, default: Date.now },
    descripcion: { type: String, trim: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<IMovimientoInventario>(
  'MovimientoInventario',
  MovimientoInventarioSchema
)
