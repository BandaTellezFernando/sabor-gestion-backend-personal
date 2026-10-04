// src/models/Pedido.ts
import mongoose, { Schema, Document } from 'mongoose'
import { obtenerFechaBolivia } from '../utils/fechaBolivia'
import { METODOS_PAGO } from '../utils/constants'

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
    precioUnitario: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    observacion: { type: String, default: '' }
  },
  { _id: false }
)

// 2. Interfaz y Esquema para el Pedido principal
export interface IPedido extends Document {
  codigo: string
  fechaDiaBolivia?: string
  fechaHoraBolivia?: string
  fechaHora: Date
  estado: string
  total: number
  mesa?: mongoose.Types.ObjectId
  usuario: mongoose.Types.ObjectId
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
  // Operativa de recojo por mesero (pedido listo)
  recogido?: boolean
  fechaRecogida?: Date
  recogidoPor?: mongoose.Types.ObjectId
}

const PedidoSchema = new Schema(
  {
    codigo: {
      type: String,
      required: true,
      trim: true
    },
    fechaDiaBolivia: {
      type: String,
      required: true,
      trim: true
    },
    estado: {
      type: String,
      enum: ['ABIERTO', 'EN_PREPARACION', 'ENTREGADO', 'CANCELADO', 'CERRADO'],
      default: 'ABIERTO'
    },
    total: { type: Number, required: true, default: 0, min: 0 },
    mesa: { type: Schema.Types.ObjectId, ref: 'Mesa', required: false },
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    detalles: [DetallePedidoSchema],
    qrUrl: { type: String, required: false },

    // Información del pago final (Texto plano para simulación)
    metodoPago: {
      type: String,
      enum: METODOS_PAGO,
      required: false
    },
    montoDescuento: { type: Number, default: 0, min: 0 },
    montoPropina: { type: Number, default: 0, min: 0 },
    subtotalCierre: { type: Number, default: 0, min: 0 },
    clienteNombre: { type: String, required: false },
    clienteCI: { type: String, required: false },
    clienteNIT: { type: String, required: false },
    cajeroAsignado: { type: Schema.Types.ObjectId, ref: 'Usuario', required: false },
    fechaHora: { type: Date, default: obtenerFechaBolivia },
    fechaHoraBolivia: { type: String, required: false },

    // Operativa de recojo por mesero
    recogido: { type: Boolean, default: false },
    fechaRecogida: { type: Date, required: false },
    recogidoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: false }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

PedidoSchema.index({ fechaDiaBolivia: 1, codigo: 1 }, { unique: true })
PedidoSchema.index({ fechaDiaBolivia: 1 })
PedidoSchema.index({ estado: 1 })
PedidoSchema.index({ estado: 1, recogido: 1 })
PedidoSchema.index({ recogido: 1 })
PedidoSchema.index({ createdAt: -1 })
PedidoSchema.index({ mesa: 1 })

export default mongoose.model<IPedido>('Pedido', PedidoSchema)
