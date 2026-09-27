import { connectDB } from '../configs/db'
import Ubicacion from '../models/Ubicacion'

async function main() {
  await connectDB()

  console.log('Buscando ubicaciones con campo `name` ausente o vacío...')
  const condicion: any = {
    $or: [{ name: { $exists: false } }, { name: null }, { name: '' }]
  }

  const items = await Ubicacion.find(condicion)
  console.log(`Ubicaciones encontradas: ${items.length}`)

  let updated = 0

  for (const u of items) {
    const origen = (u.nombre || '').toString().trim()
    let nuevoName = origen || `ubicacion_${u._id.toString()}`

    try {
      // Intentar establecer name = nombre
      await Ubicacion.updateOne({ _id: u._id }, { $set: { name: nuevoName } })
      updated++
    } catch (err: any) {
      // Si hay conflicto por índice (e.g., key duplicate), intentar un valor alternativo
      console.error(`Error actualizando ${u._id}:`, err.message || err)
      if (err && err.code === 11000) {
        const altName = `${nuevoName}_${u._id.toString().slice(-6)}`
        try {
          await Ubicacion.updateOne({ _id: u._id }, { $set: { name: altName } })
          updated++
        } catch (err2: any) {
          console.error(`Fallo actualizando con altName ${altName}:`, err2.message || err2)
        }
      }
    }
  }

  console.log(`Ubicaciones actualizadas: ${updated}`)
  console.log('Proceso finalizado.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Error en fixUbicacionNames:', err)
  process.exit(1)
})
