// src/models/AlertaStock.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IAlertaStock extends Document {
  ingrediente: mongoose.Types.ObjectId
  stockActual: number
  stockMinimo: number
  fecha: Date
  estado: string
}

const AlertaStockSchema = new Schema(
  {
    ingrediente: {
      type: Schema.Types.ObjectId,
      ref: 'Ingrediente',
      required: true
    },
    stockActual: { type: Number },
    stockMinimo: { type: Number },
    fecha: { type: Date, default: Date.now },
    estado: { type: String, default: 'Pendiente' }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<IAlertaStock>('AlertaStock', AlertaStockSchema)
