import 'dotenv/config'
import { strict as assert } from 'node:assert'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import mongoose, { Types } from 'mongoose'
import jwt from 'jsonwebtoken'

import app from '../src/app'
import Usuario from '../src/models/Usuario'
import Pago from '../src/models/Pago'
import Pedido from '../src/models/Pedido'
import Plato from '../src/models/Plato'
import Categoria from '../src/models/Categoria'
import { obtenerFechaISO_Bolivia } from '../src/utils/fechaBolivia'

const PREFIJO_DB = 'qa_reportes_http_'
const sufijo = `${Date.now().toString(36)}_${process.pid.toString(36)}`
const basePruebas = `${PREFIJO_DB}${sufijo}`
const secretoPruebas = randomBytes(32).toString('hex')

let conectado = false
let seguroParaEliminar = false
let totalPruebas = 0
let servidor: ReturnType<typeof createServer> | undefined

function comprobarIgual<T>(
  nombre: string,
  actual: T,
  esperado: T
): void {
  assert.equal(actual, esperado, nombre)
  totalPruebas += 1
  console.log(`✅ ${nombre}`)
}

function comprobar(
  nombre: string,
  condicion: unknown
): void {
  assert.ok(condicion, nombre)
  totalPruebas += 1
  console.log(`✅ ${nombre}`)
}

function esRegistro(
  valor: unknown
): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

async function leerJSON(
  respuesta: Response
): Promise<Record<string, unknown>> {
  const cuerpo: unknown = await respuesta.json()
  assert.ok(esRegistro(cuerpo), 'La respuesta HTTP debe ser un objeto JSON')
  return cuerpo
}

function crearToken(rol: string): string {
  return jwt.sign(
    { id: new Types.ObjectId().toString(), rol },
    secretoPruebas,
    { expiresIn: '5m' }
  )
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!uri) {
    throw new Error('Configura MONGO_URI o MONGODB_URI para la prueba.')
  }

  const secretoAnterior = process.env.JWT_SECRET
  process.env.JWT_SECRET = secretoPruebas

  try {
    await mongoose.connect(uri, {
      dbName: basePruebas,
      serverSelectionTimeoutMS: 15000
    })
    conectado = true

    const nombreReal = mongoose.connection.db?.databaseName
    if (
      nombreReal !== basePruebas ||
      !nombreReal.startsWith(PREFIJO_DB)
    ) {
      throw new Error(
        `Protección de seguridad: base inesperada (${nombreReal}).`
      )
    }

    seguroParaEliminar = true
    console.log(`✅ Base HTTP aislada: ${nombreReal}`)

    await Promise.all([
      Usuario.init(),
      Pago.init(),
      Pedido.init(),
      Plato.init(),
      Categoria.init()
    ])

    servidor = createServer(app)

    await new Promise<void>((resolve, reject) => {
      servidor?.once('error', reject)
      servidor?.listen(0, '127.0.0.1', () => resolve())
    })

    const direccion = servidor.address()
    if (!direccion || typeof direccion === 'string') {
      throw new Error('No se pudo obtener el puerto de prueba.')
    }

    const baseURL = `http://127.0.0.1:${(direccion as AddressInfo).port}`
    const hoy = obtenerFechaISO_Bolivia()
    const tokenAdmin = crearToken('Administrador')
    const tokenCajero = crearToken('Cajero')
    const tokenMesero = crearToken('Mesero')
    const rutas = [
      '/ventas',
      '/metodos-pago',
      '/cajeros',
      '/productos'
    ]

    // A. Todas las rutas deben rechazar peticiones sin token.
    for (const rutaReporte of rutas) {
      const respuesta = await fetch(
        `${baseURL}/api/reportes${rutaReporte}?desde=${hoy}&hasta=${hoy}`
      )
      comprobarIgual(
        `${rutaReporte}: sin token se responde 401`,
        respuesta.status,
        401
      )
      await respuesta.body?.cancel()
    }

    // B. Los roles Cajero y Mesero no pueden consultar reportes globales.
    for (const [nombreRol, token] of [
      ['Cajero', tokenCajero],
      ['Mesero', tokenMesero]
    ] as const) {
      const respuesta = await fetch(`${baseURL}/api/reportes/ventas`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      comprobarIgual(
        `${nombreRol}: acceso al reporte global denegado`,
        respuesta.status,
        403
      )
      await respuesta.body?.cancel()
    }

    // C. El Administrador accede a los cuatro endpoints.
    for (const rutaReporte of rutas) {
      const respuesta = await fetch(
        `${baseURL}/api/reportes${rutaReporte}?desde=${hoy}&hasta=${hoy}`,
        { headers: { Authorization: `Bearer ${tokenAdmin}` } }
      )
      comprobarIgual(
        `${rutaReporte}: Administrador recibe HTTP 200`,
        respuesta.status,
        200
      )

      const cuerpo = await leerJSON(respuesta)
      comprobarIgual(
        `${rutaReporte}: sin datos se marca sinDatos`,
        cuerpo.sinDatos,
        true
      )
      comprobar(
        `${rutaReporte}: incluye una advertencia informativa`,
        typeof cuerpo.advertencia === 'string' &&
          cuerpo.advertencia.length > 0
      )

      const periodo = cuerpo.periodo
      comprobar(
        `${rutaReporte}: incluye los límites del período`,
        esRegistro(periodo) &&
          periodo.desde === hoy &&
          periodo.hasta === hoy
      )

      const datos = cuerpo.datos
      comprobar(
        `${rutaReporte}: incluye el campo datos`,
        esRegistro(datos) || Array.isArray(datos)
      )

      if (rutaReporte === '/ventas') {
        comprobarIgual(
          'Ventas vacías: total cobrado en cero',
          esRegistro(datos) ? datos.totalCobrado : undefined,
          0
        )
        comprobarIgual(
          'Ventas vacías: cero operaciones',
          esRegistro(datos) ? datos.cantidadOperaciones : undefined,
          0
        )
        comprobar(
          'Ventas vacías: evolución diaria como arreglo',
          esRegistro(datos) && Array.isArray(datos.evolucionDiaria)
        )
      }

      if (
        rutaReporte === '/metodos-pago' ||
        rutaReporte === '/cajeros'
      ) {
        comprobar(
          `${rutaReporte}: datos es un arreglo vacío`,
          Array.isArray(datos) && datos.length === 0
        )
      }

      if (rutaReporte === '/productos') {
        comprobar(
          'Productos vacíos: productos y categorías son arreglos',
          esRegistro(datos) &&
            Array.isArray(datos.productos) &&
            Array.isArray(datos.categorias)
        )
      }
    }

    // D. Fechas inválidas y rangos invertidos se rechazan.
    for (const [descripcion, query] of [
      ['fecha mal formada', 'desde=no-es-fecha'],
      ['rango invertido', `desde=${hoy}&hasta=2020-01-01`]
    ] as const) {
      const respuesta = await fetch(
        `${baseURL}/api/reportes/ventas?${query}`,
        { headers: { Authorization: `Bearer ${tokenAdmin}` } }
      )
      comprobarIgual(
        `Administrador: ${descripcion} se rechaza con HTTP 400`,
        respuesta.status,
        400
      )
      await respuesta.body?.cancel()
    }

    // E. Parámetro repetido no debe aceptarse como fecha única.
    const respuestaDuplicada = await fetch(
      `${baseURL}/api/reportes/ventas?desde=${hoy}&desde=${hoy}`,
      { headers: { Authorization: `Bearer ${tokenAdmin}` } }
    )
    comprobarIgual(
      'Fecha repetida se rechaza con HTTP 400',
      respuestaDuplicada.status,
      400
    )
    await respuestaDuplicada.body?.cancel()

    console.log('')
    console.log(`🎉 TODAS LAS COMPROBACIONES PASARON: ${totalPruebas}`)
  } finally {
    if (servidor?.listening) {
      servidor.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        servidor?.close((error) => error ? reject(error) : resolve())
      })
    }

    if (conectado && mongoose.connection.readyState === 1) {
      const nombreReal = mongoose.connection.db?.databaseName

      if (
        seguroParaEliminar &&
        nombreReal === basePruebas &&
        nombreReal.startsWith(PREFIJO_DB)
      ) {
        try {
          await mongoose.connection.dropDatabase()
          console.log(`🧹 Base temporal eliminada: ${basePruebas}`)
        } catch (error: unknown) {
          console.error('⚠️ No se pudo eliminar la base temporal.', error)
          process.exitCode = 1
        }
      } else {
        console.error(
          '⚠️ Protección activada: no se eliminó una base inesperada.'
        )
        process.exitCode = 1
      }

      await mongoose.disconnect()
    }

    if (secretoAnterior === undefined) {
      delete process.env.JWT_SECRET
    } else {
      process.env.JWT_SECRET = secretoAnterior
    }
  }
}

main().catch((error: unknown) => {
  console.error('')
  console.error('❌ FALLÓ LA BATERÍA HTTP DE REPORTES')
  console.error(error)
  process.exitCode = 1
})
