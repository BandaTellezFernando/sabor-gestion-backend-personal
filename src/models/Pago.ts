//src/models/Pago.ts
import mongoose, { Schema, Document } from 'mongoose'
import {
  obtenerFechaBolivia,
  formatearFechaBolivia
} from '../utils/fechaBolivia'
import { METODOS_PAGO } from '../utils/constants'

export interface IPago extends Document {
  codigoPago: string
  codigoPedido: string

  // Compatibilidad con pagos individuales existentes.
  pedido: mongoose.Types.ObjectId

  // Relaciones adicionales para pagos agrupados.
  cuentaMesa?: mongoose.Types.ObjectId
  pedidos?: mongoose.Types.ObjectId[]

  mesa: mongoose.Types.ObjectId
  mesero: mongoose.Types.ObjectId
  cajero?: mongoose.Types.ObjectId

  nombreCliente?: string
  ci?: string
  nit?: string

  subtotal: number
  propina: number
  totalFinal: number

  metodoPago?: string
  estadoPago: string

  fechaEnvioCajaBolivia?: string
  fechaEnvioCaja: Date
  fechaPagoBolivia?: string
  fechaPago?: Date
  observaciones?: string

  createdAt: Date
  updatedAt: Date
}

const PagoSchema = new Schema<IPago>(
  {
    // Identificación del pago.
    codigoPago: {
      type: String,
      required: true,
      unique: true
    },

    codigoPedido: {
      type: String,
      required: true
    },

    // Se conserva para no romper el flujo individual actual.
    // En una cuenta agrupada, la relación canónica será cuentaMesa
    // y pedidos contendrá todas las comandas cobradas.
    pedido: {
      type: Schema.Types.ObjectId,
      ref: 'Pedido',
      required: true
    },

    cuentaMesa: {
      type: Schema.Types.ObjectId,
      ref: 'CuentaMesa',
      required: false
    },

    pedidos: {
      type: [{
        type: Schema.Types.ObjectId,
        ref: 'Pedido'
      }],
      default: undefined
    },

    mesa: {
      type: Schema.Types.ObjectId,
      ref: 'Mesa',
      required: true
    },

    mesero: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true
    },

    cajero: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null
    },

    // Datos del cliente.
    nombreCliente: {
      type: String,
      default: 'Consumidor Final',
      trim: true
    },

    ci: {
      type: String,
      default: '',
      trim: true
    },

    nit: {
      type: String,
      default: '',
      trim: true
    },

    // Importes monetarios.
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },


    propina: {
      type: Number,
      default: 0,
      min: 0
    },

    totalFinal: {
      type: Number,
      required: true,
      min: 0
    },

    // Método de pago.
    metodoPago: {
      type: String,
      enum: METODOS_PAGO,
      default: null
    },

    // Estado del pago.
    estadoPago: {
      type: String,
      enum: ['Pendiente', 'Procesado', 'Pagado', 'Anulado'],
      default: 'Pendiente'
    },

    // Fechas.
    fechaEnvioCajaBolivia: {
      type: String,
      default: () => formatearFechaBolivia(obtenerFechaBolivia())
    },

    fechaEnvioCaja: {
      type: Date,
      default: obtenerFechaBolivia
    },

    fechaPagoBolivia: {
      type: String,
      required: false
    },

    fechaPago: {
      type: Date,
      default: null
    },

    observaciones: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

// Un mismo identificador de cuenta solo puede asociarse
// a un registro de pago.
PagoSchema.index(
  { cuentaMesa: 1 },
  {
    unique: true,
    partialFilterExpression: {
      cuentaMesa: { $exists: true }
    }
  }
)

PagoSchema.index({ pedidos: 1 })

export default mongoose.model<IPago>('Pago', PagoSchema)