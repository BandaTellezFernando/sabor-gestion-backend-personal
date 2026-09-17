import mongoose, { Schema, Document } from 'mongoose'

// Interfaz para el subdocumento de dirección
export interface IDireccionDelivery {
  etiqueta: string
  lat: number
  lng: number
}

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
  isAvailable?: boolean
  direccionesDelivery: IDireccionDelivery[] // <-- Arreglo embebido
}

// Subesquema para las coordenadas del cliente
const DireccionDeliverySchema = new Schema<IDireccionDelivery>(
  {
    etiqueta: { type: String, default: 'Mi Casa', trim: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  { _id: true }
) // Mantenemos el _id interno para poder identificar o borrar una dirección específica fácilmente

const UsuarioSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    apellido: { type: String, required: true, trim: true },
    ci: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    rol: {
      type: String,
      enum: ['Administrador', 'Mesero', 'Cocinero', 'Cajero', 'Delivery'],
      required: true
    },
    ubicacion: { type: String, required: false },
    estado: { type: Boolean, default: true },
    verificado: { type: Boolean, default: true },
    isAvailable: { type: Boolean, default: false },
    direccionesDelivery: [DireccionDeliverySchema] // <-- Inyección del subesquema
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<IUsuario>('Usuario', UsuarioSchema)
