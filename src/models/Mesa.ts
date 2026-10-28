// src/models/Mesa.ts
import mongoose, { Schema, Document, Types } from 'mongoose'
import {
  ESTADOS_FUSION_MESA,
  type EstadoFusionMesa
} from '../utils/constants'

/**
 * Información original de una mesa que forma parte de una fusión.
 * Se conserva como referencia y copia histórica de sus datos.
 */
export interface MesaOrigenFusion {
  mesaId: Types.ObjectId
  numero: string
  capacidad: number
  ubicacion: string
  ubicacionId?: Types.ObjectId | null
}

/**
 * Documento principal de una mesa.
 */
export interface IMesa extends Document {
  numero: string
  capacidad: number
  ubicacion: string
  ubicacionId?: Types.ObjectId | null

  // Estado operativo: Libre, Ocupada o Cuenta Solicitada.
  estado: string

  // Estado estructural: Individual, Fusionada, Integrada,
  // Disuelta o Cancelada.
  estadoFusion: EstadoFusionMesa

  // En una mesa original integrada, apunta a la fusión activa.
  fusionadaEn?: Types.ObjectId | null

  // En una mesa fusionada, conserva todas las mesas originales.
  mesasOrigen?: MesaOrigenFusion[]

  // Fechas históricas de finalización de la fusión.
  fusionDisueltaAt?: Date | null
  fusionCanceladaAt?: Date | null

  createdAt: Date
  updatedAt: Date
}

/**
 * Subesquema con los datos originales de cada mesa fusionada.
 * No genera un _id adicional para cada elemento.
 */
const MesaOrigenFusionSchema = new Schema<MesaOrigenFusion>(
  {
    mesaId: {
      type: Schema.Types.ObjectId,
      ref: 'Mesa',
      required: true
    },
    numero: {
      type: String,
      required: true,
      trim: true
    },
    capacidad: {
      type: Number,
      required: true,
      min: 1
    },
    ubicacion: {
      type: String,
      required: true,
      default: 'Salón Principal'
    },
    ubicacionId: {
      type: Schema.Types.ObjectId,
      ref: 'Ubicacion',
      default: null
    }
  },
  {
    _id: false,
    versionKey: false
  }
)

const MesaSchema = new Schema<IMesa>(
  {
    numero: {
      type: String,
      required: true,
      trim: true
    },

    capacidad: {
      type: Number,
      required: true,
      min: 1
    },

    ubicacion: {
      type: String,
      default: 'Salón Principal'
    },

    ubicacionId: {
      type: Schema.Types.ObjectId,
      ref: 'Ubicacion',
      default: null
    },

    estado: {
      type: String,
      enum: ['Libre', 'Ocupada', 'Cuenta Solicitada'],
      default: 'Libre',
      required: true
    },

    estadoFusion: {
      type: String,
      enum: Object.values(ESTADOS_FUSION_MESA),
      default: ESTADOS_FUSION_MESA.INDIVIDUAL,
      required: true
    },

    fusionadaEn: {
      type: Schema.Types.ObjectId,
      ref: 'Mesa',
      default: null
    },

    mesasOrigen: {
      type: [MesaOrigenFusionSchema],
      default: undefined
    },

    fusionDisueltaAt: {
      type: Date,
      default: null
    },

    fusionCanceladaAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

/**
 * El número de mesa debe ser único entre los registros operativos.
 * Las fusiones históricas disueltas o canceladas pueden conservar
 * nombres que se reutilicen en futuras uniones.
 *
 * Requiere actualizar el índice antiguo en la migración de datos.
 */
MesaSchema.index(
  { numero: 1 },
  {
    unique: true,
    partialFilterExpression: {
      estadoFusion: {
        $in: [
          ESTADOS_FUSION_MESA.INDIVIDUAL,
          ESTADOS_FUSION_MESA.FUSIONADA,
          ESTADOS_FUSION_MESA.INTEGRADA
        ]
      }
    }
  }
)

export default mongoose.model<IMesa>('Mesa', MesaSchema)