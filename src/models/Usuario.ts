import mongoose, { Schema, Document } from 'mongoose'

export interface IUsuario extends Document {
  nombre: string
  apellido: string
  ci: string
  ciComplemento?: string | null
  email: string
  password: string
  rol: string
  estado: boolean
  verificado: boolean
}

const UsuarioSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 30 },
    apellido: { type: String, required: true, trim: true, maxlength: 30 },
    ci: { type: String, required: true, trim: true, maxlength: 20, match: /^\d+$/ },
    ciComplemento: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      maxlength: 2,
      match: /^\d[A-Z]$/
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/i
    },
    password: { type: String, required: true },
    rol: {
      type: String,
      enum: ['Administrador', 'Mesero', 'Cocinero', 'Cajero'],
      required: true
    },
    estado: { type: Boolean, default: true },
    verificado: { type: Boolean, default: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

UsuarioSchema.index(
  { ci: 1, ciComplemento: 1 },
  { unique: true, name: 'ci_ciComplemento_unique' }
)

export default mongoose.model<IUsuario>('Usuario', UsuarioSchema)
