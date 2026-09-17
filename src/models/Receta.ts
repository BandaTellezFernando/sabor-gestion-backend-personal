// src/models/Receta.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IRecetaIngrediente {
  ingrediente: mongoose.Types.ObjectId
  cantidadNecesaria: number
}

export interface IReceta extends Document {
  plato: mongoose.Types.ObjectId
  ingredientes: IRecetaIngrediente[]
}

const RecetaIngredienteSchema = new Schema(
  {
    ingrediente: {
      type: Schema.Types.ObjectId,
      ref: 'Ingrediente',
      required: true
    },
    cantidadNecesaria: { type: Number, required: true, min: 0 }
  },
  { _id: false }
)

const RecetaSchema = new Schema(
  {
    plato: {
      type: Schema.Types.ObjectId,
      ref: 'Plato',
      required: true,
      unique: true
    },
    ingredientes: {
      type: [RecetaIngredienteSchema],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default mongoose.model<IReceta>('Receta', RecetaSchema)
