// src/models/Pedido.ts
import mongoose, { Schema, Document } from 'mongoose'
import { obtenerFechaBolivia } from '../utils/fechaBolivia'
import {
  ESTADOS_CUENTA,
  ESTADOS_TANDA_COCINA,
  EstadoCuenta,
  EstadoTandaCocina,
  METODOS_PAGO
} from '../utils/constants'

// 1. Interfaz y Esquema para el Detalle
export interface IDetallePedido {
  plato: mongoose.Types.ObjectId
  nombrePlato?: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  tandaId?: mongoose.Types.ObjectId
  observacion: string
}

const DetallePedidoSchema = new Schema<IDetallePedido>(
  {
    plato: { type: Schema.Types.ObjectId, ref: 'Plato', required: true },
    nombrePlato: { type: String, default: 'Plato' },
    cantidad: { type: Number, required: true, min: 1 },
    precioUnitario: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    tandaId: { type: Schema.Types.ObjectId, required: false },
    observacion: { type: String, default: '' }
  },
  { _id: false }
)

// Ciclo de vida independiente de cada tanda enviada a cocina.
export interface ITandaCocina {
  _id?: mongoose.Types.ObjectId
  numeroTanda: number
  estado: EstadoTandaCocina
  creadaPor: mongoose.Types.ObjectId
  fechaCreacion: Date
  enviadaPor?: mongoose.Types.ObjectId
  fechaEnvio?: Date
  iniciadaPor?: mongoose.Types.ObjectId
  fechaInicio?: Date
  listaPor?: mongoose.Types.ObjectId
  fechaLista?: Date
  recogidaPor?: mongoose.Types.ObjectId
  fechaRecogida?: Date
  canceladaPor?: mongoose.Types.ObjectId
  fechaCancelacion?: Date
  motivoCancelacion?: string
}

const TandaCocinaSchema = new Schema<ITandaCocina>(
  {
    numeroTanda: { type: Number, required: true, min: 1 },
    estado: {
      type: String,
      enum: Object.values(ESTADOS_TANDA_COCINA),
      required: true,
      default: ESTADOS_TANDA_COCINA.BORRADOR
    },
    creadaPor: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true
    },
    fechaCreacion: {
      type: Date,
      required: true,
      default: obtenerFechaBolivia
    },
    enviadaPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    fechaEnvio: { type: Date },
    iniciadaPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    fechaInicio: { type: Date },
    listaPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    fechaLista: { type: Date },
    recogidaPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    fechaRecogida: { type: Date },
    canceladaPor: { type: Schema.Types.ObjectId, ref: 'Usuario' },
    fechaCancelacion: { type: Date },
    motivoCancelacion: { type: String, trim: true }
  },
  { _id: true }
)

// 2. Interfaz y Esquema para el Pedido principal
export interface IPedido extends Document {
  codigo: string
  fechaDiaBolivia?: string
  fechaHoraBolivia?: string
  fechaHora: Date
  createdAt?: Date
  updatedAt?: Date
  estado: string
  estadoCuenta?: EstadoCuenta
  tandas?: ITandaCocina[]
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
    // Campo nuevo y opcional para compatibilidad con pedidos históricos.
    estadoCuenta: {
      type: String,
      enum: Object.values(ESTADOS_CUENTA),
      required: false
    },
    tandas: {
      type: [TandaCocinaSchema],
      default: undefined
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
