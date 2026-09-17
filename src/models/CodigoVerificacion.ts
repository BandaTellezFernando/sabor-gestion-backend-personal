// src/models/CodigoVerificacion.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface ICodigoVerificacion extends Document {
  usuarioId: string // ID del usuario que solicitó el código
  codigo: string
  tipo: string // Ej: 'verificacion_email' o 'recuperar_password'
  expira_en: Date
  usado: boolean
}

const CodigoVerificacionSchema = new Schema(
  {
    usuarioId: { type: String, required: true },
    codigo: { type: String, required: true },
    tipo: { type: String, required: true },
    expira_en: { type: Date, required: true },
    usado: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<ICodigoVerificacion>('CodigoVerificacion', CodigoVerificacionSchema)
