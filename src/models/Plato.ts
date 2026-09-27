import mongoose, { Schema, Document } from 'mongoose'

export interface IPlato extends Document {
  nombre: string
  descripcion: string
  precio: number
  imagenUrl: string
  imagenPublicId: string // ← nuevo: para eliminar de Cloudinary
  disponible: boolean
  categoria: mongoose.Types.ObjectId
}

const PlatoSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true },
    precio: { type: Number, required: true, min: 0 },
    imagenUrl: { type: String, default: '' },
    imagenPublicId: { type: String, default: '' },
    disponible: { type: Boolean, default: true },
    categoria: { type: Schema.Types.ObjectId, ref: 'Categoria', required: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<IPlato>('Plato', PlatoSchema)
