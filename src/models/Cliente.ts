import mongoose, { Schema, Document } from 'mongoose'

export interface ICliente extends Document {
  nombre: string
  apellidos: string
  email: string
  password: string
  telefono: string
  direccion?: string
  direcciones?: any[]
  estado?: boolean
  resetPasswordToken?: string
  resetPasswordExpires?: Date
}

const ClienteSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    apellidos: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, index: true },
    password: { type: String, required: true },
    telefono: { type: String, required: true, trim: true },
    direccion: { type: String, required: false, trim: true },
    direcciones: { type: [Schema.Types.Mixed], default: [] },
    estado: { type: Boolean, default: true },
    resetPasswordToken: { type: String, required: false },
    resetPasswordExpires: { type: Date, required: false }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<ICliente>('Cliente', ClienteSchema)
