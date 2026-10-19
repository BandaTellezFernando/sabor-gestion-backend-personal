import mongoose, { Schema, Document } from 'mongoose'

interface ICierreCajaLock extends Document {
  cajeroId: string
  revision: number
}

const CierreCajaLockSchema = new Schema<ICierreCajaLock>(
  {
    cajeroId: { type: String, required: true },
    revision: { type: Number, required: true, default: 0 }
  },
  {
    timestamps: false,
    versionKey: false
  }
)

CierreCajaLockSchema.index({ cajeroId: 1 }, { unique: true })

export default mongoose.models.CierreCajaLock ||
  mongoose.model<ICierreCajaLock>('CierreCajaLock', CierreCajaLockSchema)
