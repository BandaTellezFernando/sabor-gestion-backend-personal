import mongoose, { Schema, Document } from 'mongoose'

export interface IUbicacion extends Document {
  nombre: string
  name?: string
  descripcion?: string
}

const UbicacionSchema = new Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    // Campo legacy 'name' que puede existir en la base de datos (no obligatorio)
    name: { type: String, trim: true },
    descripcion: { type: String, default: '' }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

// Sincronizar 'name' con 'nombre' para compatibilidad con índices legacy
UbicacionSchema.pre('save', function () {
  const doc: any = this
  if ((!doc.name || doc.name === '') && doc.nombre) {
    doc.name = doc.nombre
  }
})

export default mongoose.model<IUbicacion>('Ubicacion', UbicacionSchema)
