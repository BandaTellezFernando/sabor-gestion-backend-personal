import mongoose, { Schema, Document } from 'mongoose'

export interface IUsuario extends Document {
  nombre: string
  apellido: string
  ci: string
  email: string
  password: string
  rol: string
  estado: boolean
  verificado: boolean
  ubicacion?: string
}

const UsuarioSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    apellido: { type: String, required: true, trim: true },
    ci: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    rol: {
      type: String,
      enum: ['Administrador', 'Mesero', 'Cocinero', 'Cajero'],
      required: true
    },
    ubicacion: { type: String, required: false },
    estado: { type: Boolean, default: true },
    verificado: { type: Boolean, default: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<IUsuario>('Usuario', UsuarioSchema)
