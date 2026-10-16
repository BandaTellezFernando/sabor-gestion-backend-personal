// src/models/Receta.ts
import mongoose, { Schema, Document } from 'mongoose'
import { UNIDADES_MEDIDA, UnidadMedida } from '../utils/unidades'

export interface IRecetaIngrediente {
  ingrediente: mongoose.Types.ObjectId
  cantidadNecesaria: number
  unidadMedida: UnidadMedida
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
    cantidadNecesaria: {
      type: Number,
      required: true,
      min: [0.000001, 'La cantidad necesaria debe ser mayor a 0'],
    },
    unidadMedida: {
      type: String,
      required: true,
      enum: {
        values: [...UNIDADES_MEDIDA],
        message: 'La unidad de medida no está permitida.',
      },
    }
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
