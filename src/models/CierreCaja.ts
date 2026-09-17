//src/models/CierreCaja.ts
import mongoose, { Schema, Document } from 'mongoose'
import { obtenerFechaBolivia, formatearFechaBolivia } from '../utils/fechaBolivia'

export interface ICierreCaja extends Document {
  cajeroId: string
  cajeroNombre: string
  totalDia: number
  efectivo: number
  tarjeta: number
  qr: number
  descuentos: number
  propinas: number
  pagosProcesados: number
  fechaCierreBolivia?: string
  fechaCierre: Date
}

const CierreCajaSchema: Schema = new Schema(
  {
    cajeroId: { type: String, required: true },
    cajeroNombre: { type: String, required: true },
    totalDia: { type: Number, default: 0 },
    efectivo: { type: Number, default: 0 },
    tarjeta: { type: Number, default: 0 },
    qr: { type: Number, default: 0 },
    descuentos: { type: Number, default: 0 },
    propinas: { type: Number, default: 0 },
    pagosProcesados: { type: Number, default: 0 },
    fechaCierreBolivia: {
      type: String,
      default: () => formatearFechaBolivia(obtenerFechaBolivia())
    },
    fechaCierre: { type: Date, default: obtenerFechaBolivia }
  },
  {
    timestamps: true
  }
)

CierreCajaSchema.index({ fechaCierre: -1 })

export default mongoose.models.CierreCaja ||
  mongoose.model<ICierreCaja>('CierreCaja', CierreCajaSchema)
