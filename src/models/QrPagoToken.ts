import { Schema, model, Types, Document } from 'mongoose'

export interface IQrPagoToken extends Document {
  pedido: Types.ObjectId
  cajeroId?: Types.ObjectId | null
  tokenHash: string
  expiraEn: Date
  consumidoEn: Date | null
  createdAt: Date
  updatedAt: Date
}

const QrPagoTokenSchema = new Schema<IQrPagoToken>(
  {
    pedido: {
      type: Schema.Types.ObjectId,
      ref: 'Pedido',
      required: true,
      unique: true
    },
    cajeroId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    expiraEn: {
      type: Date,
      required: true,
      index: true
    },
    consumidoEn: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export default model<IQrPagoToken>('QrPagoToken', QrPagoTokenSchema)
