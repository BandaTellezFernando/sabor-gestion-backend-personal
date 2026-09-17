// src/models/Pago.ts
import mongoose, { Schema, Document } from 'mongoose'
import { obtenerFechaBolivia, formatearFechaBolivia } from '../utils/fechaBolivia'

export interface IPago extends Document {
  codigoPago: string
  codigoPedido: string
  pedido: mongoose.Types.ObjectId
  mesa: mongoose.Types.ObjectId
  mesero: mongoose.Types.ObjectId
  cajero?: mongoose.Types.ObjectId // Opcional porque se asigna cuando se procesa
  nombreCliente?: string
  ci?: string
  nit?: string
  subtotal: number
  descuento: number
  propina: number
  totalFinal: number
  metodoPago?: string // Opcional al crear, obligatorio al pagar
  estadoPago: string
  fechaEnvioCajaBolivia?: string
  fechaEnvioCaja: Date
  fechaPagoBolivia?: string
  fechaPago?: Date
  observaciones?: string
  createdAt: Date
  updatedAt: Date
}

const PagoSchema = new Schema(
  {
    // 🔑 Identificación
    codigoPago: { type: String, required: true, unique: true },

    // 🔗 Relaciones
    // Nota: Asegúrate de que los nombres en "ref" coincidan con tus otros modelos exportados
    codigoPedido: { type: String, required: true },
    pedido: { type: Schema.Types.ObjectId, ref: 'Pedido', required: true },
    mesa: { type: Schema.Types.ObjectId, ref: 'Mesa', required: true },
    mesero: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true }, // Asumo que el mesero viene de la tabla usuarios
    cajero: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },

    // 👤 Datos cliente
    nombreCliente: { type: String, default: 'Consumidor Final' },
    ci: { type: String, default: '' },
    nit: { type: String, default: '' },

    // 💰 Datos financieros
    subtotal: { type: Number, required: true, min: 0 },
    descuento: { type: Number, default: 0, min: 0 },
    propina: { type: Number, default: 0, min: 0 },
    totalFinal: { type: Number, required: true, min: 0 },

    // 💳 Método de pago
    metodoPago: {
      type: String,
      enum: ['Efectivo', 'QR', 'Tarjeta'],
      default: null // Inicia nulo porque el cliente decide cómo pagar después de pedir la cuenta
    },

    // 🚦 Estado del pago
    estadoPago: {
      type: String,
      enum: ['Pendiente', 'Procesado', 'Pagado', 'Anulado'],
      default: 'Pendiente'
    },

    // 🕒 Fechas
    fechaEnvioCajaBolivia: {
      type: String,
      default: () => formatearFechaBolivia(obtenerFechaBolivia())
    },
    fechaEnvioCaja: { type: Date, default: obtenerFechaBolivia },
    fechaPagoBolivia: { type: String, required: false },
    fechaPago: { type: Date, default: null },
    // 📌 Información adicional
    observaciones: { type: String, default: '' }
  },
  {
    timestamps: true, // Esto crea automáticamente createdAt y updatedAt
    versionKey: false
  }
)

export default mongoose.model<IPago>('Pago', PagoSchema)
