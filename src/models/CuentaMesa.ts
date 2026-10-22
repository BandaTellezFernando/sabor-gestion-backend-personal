//src/models/CuentaMesa.ts
import mongoose, { Schema, Document } from 'mongoose'
import { randomBytes } from 'node:crypto'
import { METODOS_PAGO } from '../utils/constants'
import { obtenerFechaBolivia } from '../utils/fechaBolivia'

export const ESTADOS_CUENTA_MESA = {
  PENDIENTE_PAGO: 'PENDIENTE_PAGO',
  PAGADA: 'PAGADA',
  ANULADA: 'ANULADA'
} as const

export type EstadoCuentaMesa =
  (typeof ESTADOS_CUENTA_MESA)[keyof typeof ESTADOS_CUENTA_MESA]

export interface ICuentaMesa extends Document {
  codigoCuenta: string
  mesa: mongoose.Types.ObjectId
  pedidos: mongoose.Types.ObjectId[]
  estado: EstadoCuentaMesa

   subtotal: number
  montoPropina: number
  total: number

  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string

  metodoPago?: string
  cajero?: mongoose.Types.ObjectId
  creadoPor: mongoose.Types.ObjectId
  pago?: mongoose.Types.ObjectId

  qrToken: string
  fechaSolicitud: Date
  fechaPago?: Date | null

  createdAt: Date
  updatedAt: Date
}

const CuentaMesaSchema = new Schema<ICuentaMesa>(
  {
    codigoCuenta: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },

    mesa: {
      type: Schema.Types.ObjectId,
      ref: 'Mesa',
      required: true
    },

    pedidos: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Pedido'
      }
    ],

    estado: {
      type: String,
      enum: Object.values(ESTADOS_CUENTA_MESA),
      default: ESTADOS_CUENTA_MESA.PENDIENTE_PAGO,
      required: true
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0
    },


    montoPropina: {
      type: Number,
      default: 0,
      min: 0
    },

    total: {
      type: Number,
      required: true,
      min: 0
    },

    clienteNombre: {
      type: String,
      trim: true
    },

    clienteCI: {
      type: String,
      trim: true
    },

    clienteNIT: {
      type: String,
      trim: true
    },

    metodoPago: {
      type: String,
      enum: METODOS_PAGO
    },

    cajero: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario'
    },

    creadoPor: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true
    },

    pago: {
      type: Schema.Types.ObjectId,
      ref: 'Pago'
    },

    qrToken: {
      type: String,
      required: true,
      unique: true,
      default: () => randomBytes(32).toString('hex')
    },

    fechaSolicitud: {
      type: Date,
      required: true,
      default: obtenerFechaBolivia
    },

    fechaPago: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

// Una mesa no puede tener dos cuentas pendientes de pago.
CuentaMesaSchema.index(
  { mesa: 1 },
  {
    unique: true,
    partialFilterExpression: {
      estado: ESTADOS_CUENTA_MESA.PENDIENTE_PAGO
    }
  }
)

CuentaMesaSchema.index({ pedidos: 1 })
CuentaMesaSchema.index({ createdAt: -1 })

export default mongoose.model<ICuentaMesa>(
  'CuentaMesa',
  CuentaMesaSchema
)