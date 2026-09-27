import { connectDB } from '../configs/db'
import Mesa from '../models/Mesa'
import Ubicacion from '../models/Ubicacion'

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function main() {
  await connectDB()

  console.log('Buscando mesas con campo `ubicacion` y sin `ubicacionId`...')
  const mesas = await Mesa.find({
    ubicacion: { $exists: true, $ne: '' },
    $or: [{ ubicacionId: { $exists: false } }, { ubicacionId: null }]
  })

  console.log(`Mesas encontradas: ${mesas.length}`)

  const createdUbicaciones = new Map<string, string>() // normalizedName -> id
  let creadasCount = 0
  let asignadasCount = 0

  for (const mesa of mesas) {
    const raw = (mesa.ubicacion || '').toString().trim()
    if (!raw) continue

    const key = raw.toLowerCase()
    if (createdUbicaciones.has(key)) {
      const existingId = createdUbicaciones.get(key)
      await Mesa.updateOne({ _id: mesa._id }, { $set: { ubicacionId: existingId } })
      asignadasCount++
      continue
    }

    // Buscar ubicación existente (case-insensitive)
    let ubic = await Ubicacion.findOne({
      nombre: { $regex: `^${escapeRegex(raw)}$`, $options: 'i' }
    })
    if (!ubic) {
      try {
        // Asegurar que 'name' también se establece para evitar índices legacy con null
        ubic = new Ubicacion({ nombre: raw, name: raw })
        await ubic.save()
        creadasCount++
      } catch (err) {
        // Posible duplicado por concurrencia; reintentar buscar
        ubic = await Ubicacion.findOne({
          nombre: { $regex: `^${escapeRegex(raw)}$`, $options: 'i' }
        })
        if (!ubic) throw err
      }
    }

    createdUbicaciones.set(key, ubic._id.toString())
    await Mesa.updateOne({ _id: mesa._id }, { $set: { ubicacionId: ubic._id } })
    asignadasCount++
  }

  console.log(`Ubicaciones creadas: ${creadasCount}`)
  console.log(`Asignaciones de ubicacionId realizadas: ${asignadasCount}`)
  console.log('Migración finalizada.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Error en migración:', err)
  process.exit(1)
})
