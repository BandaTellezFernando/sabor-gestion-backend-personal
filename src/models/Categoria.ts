//src/models/Categoria.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface ICategoria extends Document {
  nombre: string
}

const CategoriaSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true, unique: true }
  },
  {
    timestamps: true, // Agrega fecha de creación y actualización automáticamente
    versionKey: false
  }
)

export default mongoose.model<ICategoria>('Categoria', CategoriaSchema)
