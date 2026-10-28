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

const ESTADOS_ACTIVOS = [
  'Individual',
  'Fusionada',
  'Integrada'
]

async function migrarIndiceMesas(): Promise<void> {
  if (!URI) {
    throw new Error(
      'No se encontró la URI de MongoDB. Revisa el nombre de la variable en tu .env.'
    )
  }

  await mongoose.connect(URI, {
    dbName: NOMBRE_BD
  })

  const db = mongoose.connection.db

  if (!db) {
    throw new Error('No se pudo obtener la conexión a MongoDB.')
  }

  const coleccion = db.collection('mesas')

  console.log(`Base de datos: ${NOMBRE_BD}`)
  console.log('Revisando índices existentes...')

  const indices = await coleccion.indexes()

  const indiceNumero = indices.find(
    (indice) => indice.name === 'numero_1'
  )

  // No continuar si hay nombres duplicados entre mesas operativas
  // o registros antiguos que todavía no tienen estadoFusion.
  const duplicados = await coleccion.aggregate([
    {
      $match: {
        $or: [
          { estadoFusion: { $in: ESTADOS_ACTIVOS } },
          { estadoFusion: { $exists: false } },
          { estadoFusion: null }
        ]
      }
    },
    {
      $group: {
        _id: '$numero',
        cantidad: { $sum: 1 },
        ids: { $push: '$_id' }
      }
    },
    {
      $match: {
        cantidad: { $gt: 1 }
      }
    }
  ]).toArray()

  if (duplicados.length > 0) {
    console.error('Se encontraron nombres duplicados:')
    console.dir(duplicados, { depth: null })

    throw new Error(
      'Migración detenida para evitar modificar el índice con datos duplicados.'
    )
  }

  // Las mesas creadas antes de implementar fusiones se consideran
  // individuales. No modificamos sus nombres, capacidades ni ubicaciones.
  const resultadoLegado = await coleccion.updateMany(
    {
      $or: [
        { estadoFusion: { $exists: false } },
        { estadoFusion: null }
      ]
    },
    {
      $set: {
        estadoFusion: 'Individual',
        fusionadaEn: null,
        fusionDisueltaAt: null,
        fusionCanceladaAt: null
      }
    }
  )

  console.log(
    `Registros antiguos normalizados: ${resultadoLegado.modifiedCount}`
  )

  const filtroParcial =
    indiceNumero?.partialFilterExpression as
      | { estadoFusion?: { $in?: unknown[] } }
      | undefined

  const valoresParciales = filtroParcial?.estadoFusion?.$in

  const indiceCorrecto =
    indiceNumero?.unique === true &&
    Array.isArray(valoresParciales) &&
    valoresParciales.length === ESTADOS_ACTIVOS.length &&
    ESTADOS_ACTIVOS.every((estado) =>
      valoresParciales.includes(estado)
    )

  if (indiceCorrecto) {
    console.log('El índice parcial ya está correctamente configurado.')
  } else {
    console.log('Preparando el reemplazo del índice numero_1...')

    if (indiceNumero) {
      await coleccion.dropIndex('numero_1')
      console.log('Índice anterior eliminado.')
    }

    try {
      await coleccion.createIndex(
        { numero: 1 },
        {
          name: 'numero_1',
          unique: true,
          partialFilterExpression: {
            estadoFusion: {
              $in: ESTADOS_ACTIVOS
            }
          }
        }
      )

      console.log('Índice parcial creado correctamente.')
    } catch (error) {
      console.error('No se pudo crear el índice parcial:', error)

      // Intentar restaurar el índice único global anterior
      // si era el que existía antes de comenzar.
      if (
        indiceNumero?.unique === true &&
        !indiceNumero.partialFilterExpression
      ) {
        try {
          await coleccion.createIndex(
            { numero: 1 },
            {
              name: 'numero_1',
              unique: true
            }
          )

          console.warn('Se restauró el índice único anterior.')
        } catch (errorRestauracion) {
          console.error(
            'No se pudo restaurar el índice anterior:',
            errorRestauracion
          )
        }
      }

      throw error
    }
  }

  console.log('\nÍndices finales:')
  console.dir(await coleccion.indexes(), { depth: null })

  const resumenEstados = await coleccion.aggregate([
    {
      $group: {
        _id: '$estadoFusion',
        cantidad: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]).toArray()

  console.log('\nResumen de estados:')
  console.dir(resumenEstados, { depth: null })
}

migrarIndiceMesas()
  .catch((error: unknown) => {
    console.error('\nLa migración falló:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })