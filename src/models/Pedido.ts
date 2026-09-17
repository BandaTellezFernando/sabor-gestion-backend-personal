// src/models/Pedido.ts
import mongoose, { Schema, Document } from 'mongoose'
import { obtenerFechaBolivia } from '../utils/fechaBolivia'

// 1. Interfaz y Esquema para el Detalle
export interface IDetallePedido {
  plato: mongoose.Types.ObjectId
  nombrePlato?: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  observacion: string
}

const DetallePedidoSchema = new Schema<IDetallePedido>(
  {
    plato: { type: Schema.Types.ObjectId, ref: 'Plato', required: true },
    nombrePlato: { type: String, default: 'Plato' },
    cantidad: { type: Number, required: true, min: 1 },
    precioUnitario: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    observacion: { type: String, default: '' }
  },
  { _id: false }
)

// 2. Interfaz y Esquema para el Pedido principal
export interface IPedido extends Document {
  codigo: string
  fechaHoraBolivia?: string
  fechaHora: Date
  estado: string
  total: number
  mesa?: mongoose.Types.ObjectId
  usuario: mongoose.Types.ObjectId
  usuarioModel?: string
  detalles: IDetallePedido[]
  qrUrl?: string
  // Campos para el cierre de caja y comprobante
  metodoPago?: string
  montoDescuento?: number
  montoPropina?: number
  subtotalCierre?: number
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  cajeroAsignado?: mongoose.Types.ObjectId

  // <-- NUEVOS CAMPOS PARA DELIVERY -->
  metodoEntrega?: string
  repartidorId?: mongoose.Types.ObjectId
  coordenadasEntrega?: {
    lat: number
    lng: number
  }
  pagoConfirmado?: boolean
}

const PedidoSchema = new Schema(
  {
    codigo: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    estado: {
      type: String,
      // Se fusionan los estados del restaurante local con los de seguimiento de delivery
      enum: [
        'ABIERTO',
        'EN_PREPARACION',
        'ENTREGADO',
        'CANCELADO',
        'CERRADO', // Originales
        'Pendiente_de_Aceptacion',
        'En_Cocina',
        'Repartidor_Esperando',
        'En_Transito',
        'Senal_Debil' // Delivery
      ],
      default: 'ABIERTO'
    },
    total: { type: Number, required: true, default: 0 },
    mesa: { type: Schema.Types.ObjectId, ref: 'Mesa', required: false },
    usuario: { type: Schema.Types.ObjectId, refPath: 'usuarioModel', required: true },
    usuarioModel: {
      type: String,
      required: true,
      enum: ['Usuario', 'Cliente'],
      default: 'Usuario'
    },
    detalles: [DetallePedidoSchema],
    qrUrl: { type: String, required: false },

    // Información del pago final (Texto plano para simulación)
    metodoPago: {
      type: String,
      enum: ['Efectivo', 'Tarjeta', 'Transferencia', 'QR', 'Otro'],
      required: false
    },
    montoDescuento: { type: Number, default: 0 },
    montoPropina: { type: Number, default: 0 },
    subtotalCierre: { type: Number, default: 0 },
    clienteNombre: { type: String, required: false },
    clienteCI: { type: String, required: false },
    clienteNIT: { type: String, required: false },
    cajeroAsignado: { type: Schema.Types.ObjectId, ref: 'Usuario', required: false },
    fechaHora: { type: Date, default: obtenerFechaBolivia },
    fechaHoraBolivia: { type: String, required: false },

    // <-- NUEVOS CAMPOS PARA DELIVERY -->
    metodoEntrega: {
      type: String,
      enum: ['local', 'delivery'],
      default: 'local'
    },
    repartidorId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: false
    },
    pagoConfirmado: {
      type: Boolean,
      default: false
    },
    coordenadasEntrega: {
      lat: {
        type: Number,
        required: function (this: IPedido) {
          return this.metodoEntrega === 'delivery'
        }
      },
      lng: {
        type: Number,
        required: function (this: IPedido) {
          return this.metodoEntrega === 'delivery'
        }
      }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

PedidoSchema.index({ estado: 1 })
PedidoSchema.index({ createdAt: -1 })
PedidoSchema.index({ mesa: 1 })
PedidoSchema.index({ repartidorId: 1 }) // Índice extra para búsquedas rápidas del repartidor

export default mongoose.model<IPedido>('Pedido', PedidoSchema)
