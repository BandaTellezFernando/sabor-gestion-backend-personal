import 'dotenv/config'
import mongoose from 'mongoose'

const URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL

const NOMBRE_BD =
  process.env.MONGO_DB_NAME ||
  process.env.DB_NAME ||
  'sabor_gestion'

async function crearBackupMesas(): Promise<void> {
  if (!URI) {
    throw new Error(
      'No se encontró la URI de MongoDB. Revisa la variable de conexión de tu .env.'
    )
  }

  await mongoose.connect(URI, { dbName: NOMBRE_BD })

  const db = mongoose.connection.db

  if (!db) {
    throw new Error('No se pudo obtener la conexión a MongoDB.')
  }

  const origen = db.collection('mesas')
  const cantidadOriginal = await origen.countDocuments()

  if (cantidadOriginal === 0) {
    throw new Error(
      'La colección mesas está vacía. Se cancela la copia por seguridad.'
    )
  }

  const indicesOriginales = await origen.indexes()

  const sufijo = new Date()
    .toISOString()
    .replace(/\D/g, '')
    .slice(0, 14)

  const nombreBackup = `mesas_backup_${sufijo}`

  const existe = await db
    .listCollections({ name: nombreBackup }, { nameOnly: true })
    .hasNext()

  if (existe) {
    throw new Error(
      `La colección de respaldo ${nombreBackup} ya existe.`
    )
  }

  console.log(`Base de datos: ${NOMBRE_BD}`)
  console.log(`Documentos originales: ${cantidadOriginal}`)
  console.log(`Creando respaldo: ${nombreBackup}`)

  const respaldo = await db.createCollection(nombreBackup)

  // Copiar los documentos con sus _id originales.
  const documentos = await origen.find({}).toArray()

  if (documentos.length !== cantidadOriginal) {
    throw new Error(
      'La cantidad de documentos cambió durante la preparación del respaldo.'
    )
  }

  await respaldo.insertMany(documentos)

  // Copiar los índices secundarios existentes.
  // El índice _id_ se crea automáticamente en MongoDB.
  for (const indice of indicesOriginales) {
    if (indice.name === '_id_') {
      continue
    }

    const opciones: Record<string, unknown> = {
      name: indice.name
    }

    if (indice.unique !== undefined) {
      opciones.unique = indice.unique
    }

    if (indice.sparse !== undefined) {
      opciones.sparse = indice.sparse
    }

    if (indice.partialFilterExpression !== undefined) {
      opciones.partialFilterExpression =
        indice.partialFilterExpression
    }

    if (indice.expireAfterSeconds !== undefined) {
      opciones.expireAfterSeconds = indice.expireAfterSeconds
    }

    if (indice.collation !== undefined) {
      opciones.collation = indice.collation
    }

    await respaldo.createIndex(
      indice.key,
      opciones as Parameters<typeof respaldo.createIndex>[1]
    )
  }

  const cantidadRespaldo = await respaldo.countDocuments()

  if (cantidadRespaldo !== cantidadOriginal) {
    throw new Error(
      `La verificación falló: original=${cantidadOriginal}, ` +
      `respaldo=${cantidadRespaldo}. Conserva el respaldo y revisa el resultado.`
    )
  }

  console.log('\n✅ Respaldo verificado correctamente.')
  console.log(`Colección original: mesas`)
  console.log(`Colección de respaldo: ${nombreBackup}`)
  console.log(`Documentos verificados: ${cantidadRespaldo}`)
  console.log('Índices originales:')
  console.dir(indicesOriginales, { depth: null })
  console.log('Índices del respaldo:')
  console.dir(await respaldo.indexes(), { depth: null })
}

crearBackupMesas()
  .catch((error: unknown) => {
    console.error('\n❌ Error al crear el respaldo:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })