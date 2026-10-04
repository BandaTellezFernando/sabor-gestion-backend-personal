// src/models/MesaOcupacionTemporal.ts
import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IMesaOcupacionTemporal extends Document {
  _id: Types.ObjectId
  mesaId: Types.ObjectId
  usuarioId: Types.ObjectId
  creadaEn: Date
  expiraEn: Date
}

const MesaOcupacionTemporalSchema: Schema = new Schema(
  {
    mesaId: {
      type: Schema.Types.ObjectId,
      ref: 'Mesa',
      required: true,
      unique: true
    },
    usuarioId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true
    },
    creadaEn: {
      type: Date,
      default: Date.now
    },
    expiraEn: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
)

// Índice para consultas eficientes de registros expirados
MesaOcupacionTemporalSchema.index({ expiraEn: 1 })

export default mongoose.model<IMesaOcupacionTemporal>(
  'MesaOcupacionTemporal',
  MesaOcupacionTemporalSchema
)
