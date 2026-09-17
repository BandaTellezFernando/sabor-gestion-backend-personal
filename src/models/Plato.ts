import mongoose, { Schema, Document } from 'mongoose'

export interface IPlato extends Document {
  nombre: string
  descripcion: string
  precio: number
  imagenUrl: string
  imagenPublicId: string // ← nuevo: para eliminar de Cloudinary
  disponible: boolean
  categoria: mongoose.Types.ObjectId
  stock: number // ← Nuevo campo para validaciones de checkout
}

const PlatoSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true },
    precio: { type: Number, required: true, min: 0 },
    imagenUrl: { type: String, default: '' },
    imagenPublicId: { type: String, default: '' },
    disponible: { type: Boolean, default: true },
    categoria: { type: Schema.Types.ObjectId, ref: 'Categoria', required: true },
    stock: { type: Number, required: true, default: 0, min: 0 } // ← Restricción min: 0 para evitar stocks negativos
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<IPlato>('Plato', PlatoSchema)
