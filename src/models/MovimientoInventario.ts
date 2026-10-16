import mongoose, { Schema, Document } from 'mongoose'
import { UNIDADES_MEDIDA } from '../utils/unidades'

export interface IMovimientoDetallePlato {
  plato: mongoose.Types.ObjectId
  nombrePlato: string
  cantidadPlatos: number
  cantidadNecesariaPorPlato: number
  unidadReceta: string
  cantidadPorPlatoEnStock: number
  unidadStock: string
  consumoTotal: number
  observacion?: string
}

export interface IMovimientoConsumoIngrediente {
  ingrediente: mongoose.Types.ObjectId
  nombreIngrediente: string
  unidadStock: string
  cantidadTotal: number
  detallePlatos: IMovimientoDetallePlato[]
}

export interface IMovimientoInventario extends Document {
  pedido: mongoose.Types.ObjectId
  codigoPedido: string
  fechaHora: Date
  usuario: mongoose.Types.ObjectId
  consumos: IMovimientoConsumoIngrediente[]
}

const DetallePlatoSchema = new Schema<IMovimientoDetallePlato>(
  {
    plato: {
      type: Schema.Types.ObjectId,
      ref: 'Plato',
      required: true,
    },
    nombrePlato: { type: String, required: true, trim: true },
    cantidadPlatos: { type: Number, required: true, min: 1 },
    cantidadNecesariaPorPlato: { type: Number, required: true, min: 0 },
    unidadReceta: {
      type: String,
      required: true,
      enum: [...UNIDADES_MEDIDA],
    },
    cantidadPorPlatoEnStock: { type: Number, required: true, min: 0 },
    unidadStock: {
      type: String,
      required: true,
      enum: [...UNIDADES_MEDIDA],
    },
    consumoTotal: { type: Number, required: true, min: 0 },
    observacion: { type: String, default: '' },
  },
  { _id: false },
)

const ConsumoIngredienteSchema = new Schema<IMovimientoConsumoIngrediente>(
  {
    ingrediente: {
      type: Schema.Types.ObjectId,
      ref: 'Ingrediente',
      required: true,
    },
    nombreIngrediente: { type: String, required: true, trim: true },
    unidadStock: {
      type: String,
      required: true,
      enum: [...UNIDADES_MEDIDA],
    },
    cantidadTotal: { type: Number, required: true, min: 0 },
    detallePlatos: {
      type: [DetallePlatoSchema],
      required: true,
    },
  },
  { _id: false },
)

const MovimientoInventarioSchema = new Schema<IMovimientoInventario>(
  {
    pedido: {
      type: Schema.Types.ObjectId,
      ref: 'Pedido',
      required: true,
      unique: true,
    },
    codigoPedido: { type: String, required: true, trim: true },
    fechaHora: { type: Date, required: true },
    usuario: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
    consumos: {
      type: [ConsumoIngredienteSchema],
      required: true,
      validate: {
        validator: (consumos: IMovimientoConsumoIngrediente[]) =>
          consumos.length > 0,
        message: 'El movimiento debe registrar al menos un consumo.',
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'movimientos_inventario',
  },
)

MovimientoInventarioSchema.index({ fechaHora: -1 })
MovimientoInventarioSchema.index({ codigoPedido: 1 })

export default mongoose.model<IMovimientoInventario>(
  'MovimientoInventario',
  MovimientoInventarioSchema,
)
