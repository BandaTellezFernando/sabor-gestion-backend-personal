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
  propinas: number
  pagosProcesados: number
  /** Período calendario inclusivo de Bolivia (YYYY-MM-DD). */
  periodoDesde?: string
  periodoHasta?: string
  totalRecaudado?: number
  efectivoEsperado?: number
  efectivoContado?: number
  diferenciaEfectivo?: number
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
    propinas: { type: Number, default: 0 },
    pagosProcesados: { type: Number, default: 0 },
    // Nuevos datos financieros; opcionales para compatibilidad histórica.
    periodoDesde: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    periodoHasta: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    totalRecaudado: { type: Number, min: 0 },
    efectivoEsperado: { type: Number, min: 0 },
    efectivoContado: { type: Number, min: 0 },
    diferenciaEfectivo: { type: Number },
    fechaCierreBolivia: {
      type: String,
      default: () => formatearFechaBolivia(obtenerFechaBolivia())
    },
    fechaCierre: { type: Date, default: obtenerFechaBolivia }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

CierreCajaSchema.index({ fechaCierre: -1 })

// Evita cierres duplicados del mismo cajero para el mismo período.
// Los documentos históricos sin período quedan fuera del índice.
CierreCajaSchema.index(
  { cajeroId: 1, periodoDesde: 1, periodoHasta: 1 },
  {
    unique: true,
    partialFilterExpression: {
      periodoDesde: { $type: 'string' },
      periodoHasta: { $type: 'string' }
    }
  }
)

export default mongoose.models.CierreCaja ||
  mongoose.model<ICierreCaja>('CierreCaja', CierreCajaSchema)
