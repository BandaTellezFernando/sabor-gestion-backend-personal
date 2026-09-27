//src/models/Reserva.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IReserva extends Document {
  codigo: string
  numeroReserva?: string
  pedidoId?: string
  fechaDiaBolivia?: string
  fechaBolivia?: string
  fecha: Date
  hora: string
  clienteNombre: string
  cantidadPersonas: number
  vip: boolean
  mesa: mongoose.Types.ObjectId // Relación con la Mesa
  usuario: mongoose.Types.ObjectId // Relación con el Usuario que hizo/registró la reserva
  createdAt: Date
  updatedAt: Date
}

const ReservaSchema = new Schema(
  {
    codigo: { type: String, required: true, trim: true },
    fechaDiaBolivia: { type: String, required: true, trim: true },
    numeroReserva: { type: String, required: false },
    pedidoId: { type: String, required: false },
    fechaBolivia: { type: String, required: false },
    fecha: { type: Date, required: true },
    hora: { type: String, required: true },
    clienteNombre: { type: String, required: true, trim: true },
    cantidadPersonas: { type: Number, required: true, min: 1 },
    vip: { type: Boolean, default: false },
    mesa: { type: Schema.Types.ObjectId, ref: 'Mesa', required: true },
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

ReservaSchema.index({ fechaDiaBolivia: 1, codigo: 1 }, { unique: true })
ReservaSchema.index({ fechaDiaBolivia: 1 })
ReservaSchema.index({ fecha: 1 })

export default mongoose.model<IReserva>('Reserva', ReservaSchema)
