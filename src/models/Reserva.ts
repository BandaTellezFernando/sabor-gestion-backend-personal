//src/models/Reserva.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IReserva extends Document {
  codigo: string
  pedidoId: string
  fechaBolivia?: string
  fecha: Date
  hora: string
  clienteNombre: string
  cantidadPersonas: number
  vip: boolean
  mesa: mongoose.Types.ObjectId // Relación con la Mesa
  usuario: mongoose.Types.ObjectId // Relación con el Usuario que hizo/registró la reserva
  usuarioModel?: string
  createdAt: Date
  updatedAt: Date
}

const ReservaSchema = new Schema(
  {
    codigo: { type: String, unique: true, required: true },
    pedidoId: { type: String, required: false },
    fechaBolivia: { type: String, required: false },
    fecha: { type: Date, required: true },
    hora: { type: String, required: true },
    clienteNombre: { type: String, required: true, trim: true },
    cantidadPersonas: { type: Number, required: true, min: 1 },
    vip: { type: Boolean, default: false },
    mesa: { type: Schema.Types.ObjectId, ref: 'Mesa', required: true },
    usuario: { type: Schema.Types.ObjectId, refPath: 'usuarioModel', required: true },
    usuarioModel: {
      type: String,
      required: true,
      enum: ['Usuario', 'Cliente'],
      default: 'Usuario'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

ReservaSchema.index({ fecha: 1 })

export default mongoose.model<IReserva>('Reserva', ReservaSchema)
