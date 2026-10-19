import 'dotenv/config'
import { strict as assert } from 'node:assert'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import mongoose, { Types } from 'mongoose'
import jwt from 'jsonwebtoken'

import app from '../src/app'
import Pago from '../src/models/Pago'
import Mesa from '../src/models/Mesa'
import Usuario from '../src/models/Usuario'
import Pedido from '../src/models/Pedido'
import { obtenerFechaISO_Bolivia } from '../src/utils/fechaBolivia'

const PREFIJO_DB = 'qa_pagos_consulta_http_'
const sufijo = `${Date.now().toString(36)}_${process.pid.toString(36)}`
const basePruebas = `${PREFIJO_DB}${sufijo}`
const secretoPruebas = randomBytes(32).toString('hex')

let conectado = false
let seguroParaEliminar = false
let servidor: ReturnType<typeof createServer> | undefined
let totalPruebas = 0

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
  return typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor)
}

async function leerJSON(
  respuesta: Response
): Promise<Record<string, unknown>> {
  const cuerpo: unknown = await respuesta.json()
  assert.ok(esRegistro(cuerpo), 'La respuesta debe ser un objeto JSON')
  return cuerpo
}

function extraerIds(cuerpo: Record<string, unknown>): string[] {
  const datos = cuerpo.datos
  assert.ok(Array.isArray(datos), 'La respuesta debe incluir datos como arreglo')
  return datos.filter(esRegistro).map((pago) => String(pago._id))
}

function crearToken(id: Types.ObjectId, rol: string): string {
  return jwt.sign(
    { id: id.toString(), rol },
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

    const nombreDB = mongoose.connection.db?.databaseName
    if (
      nombreDB !== basePruebas ||
      !nombreDB?.startsWith(PREFIJO_DB)
    ) {
      throw new Error(
        `Protección de seguridad: base inesperada (${nombreDB}).`
      )
    }

    seguroParaEliminar = true
    console.log(`✅ Base HTTP aislada: ${nombreDB}`)

    await Promise.all([
      Pago.init(),
      Mesa.init(),
      Usuario.init(),
      Pedido.init()
    ])

    const idAdmin = new Types.ObjectId()
    const idCajeroA = new Types.ObjectId()
    const idCajeroB = new Types.ObjectId()
    const idMesero = new Types.ObjectId()
    const idMesa = new Types.ObjectId()

    const idPedidoA = new Types.ObjectId()
    const idPedidoB = new Types.ObjectId()
    const idPagoA = new Types.ObjectId()
    const idPagoB = new Types.ObjectId()

    const ahora = new Date()
    const fechaHoy = obtenerFechaISO_Bolivia()

    const db = mongoose.connection.db!

    await db.collection('usuarios').insertMany([
      {
        _id: idAdmin,
        nombre: 'Administrador',
        apellido: 'QA',
        ci: '990000001',
        email: `qa-admin-${sufijo}@example.invalid`,
        password: 'qa-only',
        rol: 'Administrador',
        estado: true,
        verificado: true
      },
      {
        _id: idCajeroA,
        nombre: 'Cajero A',
        apellido: 'QA',
        ci: '990000002',
        email: `qa-caj-a-${sufijo}@example.invalid`,
        password: 'qa-only',
        rol: 'Cajero',
        estado: true,
        verificado: true
      },
      {
        _id: idCajeroB,
        nombre: 'Cajero B',
        apellido: 'QA',
        ci: '990000003',
        email: `qa-caj-b-${sufijo}@example.invalid`,
        password: 'qa-only',
        rol: 'Cajero',
        estado: true,
        verificado: true
      },
      {
        _id: idMesero,
        nombre: 'Mesero',
        apellido: 'QA',
        ci: '990000004',
        email: `qa-mes-${sufijo}@example.invalid`,
        password: 'qa-only',
        rol: 'Mesero',
        estado: true,
        verificado: true
      }
    ])

    await db.collection('mesas').insertOne({
      _id: idMesa,
      numero: `QA-${sufijo}`,
      ubicacion: 'Pruebas',
      estado: 'Libre',
      capacidad: 2
    })

    await db.collection('pedidos').insertMany([
      {
        _id: idPedidoA,
        codigo: `PED-QA-A-${sufijo}`,
        total: 100,
        estado: 'CERRADO'
      },
      {
        _id: idPedidoB,
        codigo: `PED-QA-B-${sufijo}`,
        total: 200,
        estado: 'CERRADO'
      }
    ])

    await db.collection('pagos').insertMany([
      {
        _id: idPagoA,
        codigoPago: `PAG-QA-A-${sufijo}`,
        codigoPedido: `PED-QA-A-${sufijo}`,
        pedido: idPedidoA,
        mesa: idMesa,
        mesero: idMesero,
        cajero: idCajeroA,
        nombreCliente: 'Cliente A',
        apellidoCliente: 'QA',
        ci: '',
        subtotal: 100,
        propina: 0,
        totalFinal: 100,
        metodoPago: 'Efectivo',
        estadoPago: 'Pagado',
        fechaEnvioCaja: ahora,
        fechaPago: ahora,
        createdAt: ahora,
        updatedAt: ahora
      },
      {
        _id: idPagoB,
        codigoPago: `PAG-QA-B-${sufijo}`,
        codigoPedido: `PED-QA-B-${sufijo}`,
        pedido: idPedidoB,
        mesa: idMesa,
        mesero: idMesero,
        cajero: idCajeroB,
        nombreCliente: 'Cliente B',
        apellidoCliente: 'QA',
        ci: '',
        subtotal: 200,
        propina: 0,
        totalFinal: 200,
        metodoPago: 'Tarjeta',
        estadoPago: 'Pagado',
        fechaEnvioCaja: ahora,
        fechaPago: ahora,
        createdAt: ahora,
        updatedAt: ahora
      }
    ])

    servidor = createServer(app)
    await new Promise<void>((resolve, reject) => {
      servidor?.once('error', reject)
      servidor?.listen(0, '127.0.0.1', resolve)
    })

    const direccion = servidor.address()
    if (!direccion || typeof direccion === 'string') {
      throw new Error('No se pudo obtener el puerto del servidor de prueba.')
    }

    const baseURL =
      `http://127.0.0.1:${(direccion as AddressInfo).port}`

    const tokenAdmin = crearToken(idAdmin, 'Administrador')
    const tokenCajeroA = crearToken(idCajeroA, 'Cajero')
    const tokenMesero = crearToken(idMesero, 'Mesero')
    const tokenOtro = crearToken(new Types.ObjectId(), 'Cajero')

    const queryFecha = `?desde=${fechaHoy}&hasta=${fechaHoy}`
    const headers = (token: string) => ({
      Authorization: `Bearer ${token}`
    })

    // A. La autenticación y los roles se verifican en HTTP.
    for (const [nombre, ruta] of [
      ['listado', '/api/pagos'],
      ['detalle', `/api/pagos/${idPagoA}`]
    ] as const) {
      const respuesta = await fetch(`${baseURL}${ruta}`)
      comprobarIgual(`${nombre}: sin token devuelve 401`, respuesta.status, 401)
      await respuesta.body?.cancel()
    }

    for (const [nombre, token] of [
      ['Mesero', tokenMesero]
    ] as const) {
      const respuesta = await fetch(
        `${baseURL}/api/pagos${queryFecha}`,
        { headers: headers(token) }
      )
      comprobarIgual(`${nombre}: listado denegado con 403`, respuesta.status, 403)
      await respuesta.body?.cancel()
    }

    // Un token de cajero sin pagos asociados puede consultar su propio
    // historial, pero no debe recibir pagos de otros cajeros.
    const respuestaCajeroSinPagos = await fetch(
      `${baseURL}/api/pagos${queryFecha}`,
      { headers: headers(tokenOtro) }
    )
    comprobarIgual(
      'Cajero sin pagos: listado devuelve 200',
      respuestaCajeroSinPagos.status,
      200
    )
    const cuerpoCajeroSinPagos = await leerJSON(respuestaCajeroSinPagos)
    comprobarIgual(
      'Cajero sin pagos: no recibe pagos ajenos',
      extraerIds(cuerpoCajeroSinPagos).length,
      0
    )

    // B. Administrador: historial global.
    const respuestaAdmin = await fetch(
      `${baseURL}/api/pagos${queryFecha}`,
      { headers: headers(tokenAdmin) }
    )
    comprobarIgual('Administrador: listado global devuelve 200', respuestaAdmin.status, 200)
    const cuerpoAdmin = await leerJSON(respuestaAdmin)
    const idsAdmin = extraerIds(cuerpoAdmin)

    comprobarIgual('Administrador: ve los dos pagos', idsAdmin.length, 2)
    comprobar(
      'Administrador: ve pagos de ambos cajeros',
      idsAdmin.includes(idPagoA.toString()) &&
        idsAdmin.includes(idPagoB.toString())
    )

    // C. Cajero A: solo su pago, incluso si intenta manipular cajeroId.
    for (const [nombre, query] of [
      ['consulta normal', queryFecha],
      ['parámetro cajeroId falsificado', `${queryFecha}&cajeroId=${idCajeroB}`]
    ] as const) {
      const respuesta = await fetch(
        `${baseURL}/api/pagos${query}`,
        { headers: headers(tokenCajeroA) }
      )
      comprobarIgual(`Cajero: ${nombre} devuelve 200`, respuesta.status, 200)
      const cuerpo = await leerJSON(respuesta)
      const ids = extraerIds(cuerpo)

      comprobarIgual(`Cajero: ${nombre} devuelve un pago`, ids.length, 1)
      comprobarIgual(
        `Cajero: ${nombre} solo devuelve su pago`,
        ids[0],
        idPagoA.toString()
      )
    }

    // D. Detalle: propietario, tercero y administrador.
    const detallePropio = await fetch(
      `${baseURL}/api/pagos/${idPagoA}`,
      { headers: headers(tokenCajeroA) }
    )
    comprobarIgual('Cajero: detalle propio devuelve 200', detallePropio.status, 200)
    const cuerpoPropio = await leerJSON(detallePropio)
    comprobar(
      'Cajero: detalle propio devuelve su pago',
      esRegistro(cuerpoPropio.datos) &&
        String(cuerpoPropio.datos._id) === idPagoA.toString()
    )

    const detalleAjeno = await fetch(
      `${baseURL}/api/pagos/${idPagoB}`,
      { headers: headers(tokenCajeroA) }
    )
    comprobarIgual('Cajero: detalle ajeno devuelve 404', detalleAjeno.status, 404)
    await detalleAjeno.body?.cancel()

    const detalleAdmin = await fetch(
      `${baseURL}/api/pagos/${idPagoB}`,
      { headers: headers(tokenAdmin) }
    )
    comprobarIgual('Administrador: detalle de otro cajero devuelve 200', detalleAdmin.status, 200)
    const cuerpoAdminDetalle = await leerJSON(detalleAdmin)
    comprobar(
      'Administrador: recibe el pago solicitado',
      esRegistro(cuerpoAdminDetalle.datos) &&
        String(cuerpoAdminDetalle.datos._id) === idPagoB.toString()
    )

    console.log(`\n🎉 TODAS LAS COMPROBACIONES PASARON: ${totalPruebas}`)
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
        await mongoose.connection.dropDatabase()
        console.log(`🧹 Base temporal eliminada: ${nombreReal}`)
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
  console.error('❌ Falló la prueba HTTP de permisos de pagos:', error)
  process.exitCode = 1
})
