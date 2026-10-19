import 'dotenv/config'
import { strict as assert } from 'node:assert'
import mongoose, { Types } from 'mongoose'

import Pago from '../src/models/Pago'
import Mesa from '../src/models/Mesa'
import Usuario from '../src/models/Usuario'
import Pedido from '../src/models/Pedido'

import { PagoRepository } from '../src/repositories/pago.repo'
import {
  PagoService,
  PagoServiceError
} from '../src/services/pago.service'

import {
  obtenerFechaISO_Bolivia,
  obtenerRangoInclusivoBolivia
} from '../src/utils/fechaBolivia'

const PREFIJO_DB = 'qa_pagos_consulta_'
const sufijo = `${Date.now().toString(36)}_${process.pid.toString(36)}`
const basePruebas = `${PREFIJO_DB}${sufijo}`

let conectado = false
let seguroParaEliminar = false
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

async function debeRechazar(
  nombre: string,
  operacion: () => Promise<unknown>,
  statusEsperado: number
): Promise<void> {
  let error: unknown

  try {
    await operacion()
  } catch (capturado) {
    error = capturado
  }

  assert.ok(error, `${nombre}: se esperaba un error`)
  assert.ok(
    error instanceof PagoServiceError,
    `${nombre}: se esperaba PagoServiceError`
  )

  comprobarIgual(
    `${nombre}: código HTTP esperado`,
    error.statusCode,
    statusEsperado
  )
}

function desplazarDia(fecha: string, cantidad: number): string {
  const resultado = new Date(`${fecha}T12:00:00Z`)
  resultado.setUTCDate(resultado.getUTCDate() + cantidad)
  return resultado.toISOString().slice(0, 10)
}

function fechaDentroDelDia(fecha: string, minutos: number): Date {
  const rango = obtenerRangoInclusivoBolivia(fecha, fecha)
  return new Date(rango.desde.getTime() + minutos * 60_000)
}

function crearPago(datos: {
  pedido: Types.ObjectId
  mesa: Types.ObjectId
  mesero: Types.ObjectId
  cajero: Types.ObjectId
  fechaRegistro: Date
  fechaPago: Date | null
  estadoPago: string
  metodoPago: string
  subtotal: number
  propina: number
  numero: number
}): Record<string, any> {
  return {
    _id: new Types.ObjectId(),
    codigoPago: `PAG-QA-CONS-${sufijo}-${datos.numero}`,
    codigoPedido: `PED-QA-CONS-${sufijo}-${datos.numero}`,
    pedido: datos.pedido,
    mesa: datos.mesa,
    mesero: datos.mesero,
    cajero: datos.cajero,
    nombreCliente: 'Cliente QA',
    apellidoCliente: 'Prueba',
    ci: '',
    extensionCI: '',
    nit: '',
    subtotal: datos.subtotal,
    propina: datos.propina,
    totalFinal: Number((datos.subtotal + datos.propina).toFixed(2)),
    metodoPago: datos.metodoPago,
    estadoPago: datos.estadoPago,
    fechaEnvioCaja: datos.fechaRegistro,
    fechaPago: datos.fechaPago,
    createdAt: datos.fechaRegistro,
    updatedAt: datos.fechaRegistro
  }
}

async function main(): Promise<void> {
  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI

  if (!mongoURI) {
    throw new Error(
      'No se encontró MONGO_URI ni MONGODB_URI en el entorno.'
    )
  }

  await mongoose.connect(mongoURI, { dbName: basePruebas })
  conectado = true

  try {
    const nombreDB = mongoose.connection.db?.databaseName

    if (
      nombreDB !== basePruebas ||
      !nombreDB?.startsWith(PREFIJO_DB)
    ) {
      throw new Error(
        `SEGURIDAD: base inesperada (${nombreDB}); se cancela la prueba.`
      )
    }

    seguroParaEliminar = true
    console.log(`✅ Base temporal aislada: ${nombreDB}`)

    // Registrar índices, modelos y referencias para populate.
    await Promise.all([
      Pago.init(),
      Mesa.init(),
      Usuario.init(),
      Pedido.init()
    ])

    const repo = new PagoRepository()

    // Las demás dependencias no participan en estos casos de consulta.
    const servicio = new PagoService(
      repo,
      {} as any,
      {} as any,
      {} as any
    )

    const hoy = obtenerFechaISO_Bolivia()
    const ayer = desplazarDia(hoy, -1)
    const manana = desplazarDia(hoy, 1)
    const futuroSinDatos = desplazarDia(hoy, 5)

    const inicioHoy = obtenerRangoInclusivoBolivia(hoy, hoy)
    const inicioAyer = obtenerRangoInclusivoBolivia(ayer, ayer)
    const inicioManana = obtenerRangoInclusivoBolivia(manana, manana)

    const idMesa = new Types.ObjectId()
    const idMesero = new Types.ObjectId()
    const idCajero = new Types.ObjectId()
    const idOtroCajero = new Types.ObjectId()

    const idPedidoEfectivo = new Types.ObjectId()
    const idPedidoTarjeta = new Types.ObjectId()
    const idPedidoPendiente = new Types.ObjectId()
    const idPedidoAnulado = new Types.ObjectId()
    const idPedidoAyer = new Types.ObjectId()
    const idPedidoFuturo = new Types.ObjectId()

    const fechaEfectivo = fechaDentroDelDia(hoy, 60)
    const fechaTarjeta = fechaDentroDelDia(hoy, 120)
    const fechaPendiente = fechaDentroDelDia(hoy, 180)
    const fechaAnulado = fechaDentroDelDia(hoy, 240)
    const fechaAyer = fechaDentroDelDia(ayer, 60)
    const fechaFuturo = inicioManana.desde

    const pagos = [
      crearPago({
        pedido: idPedidoEfectivo,
        mesa: idMesa,
        mesero: idMesero,
        cajero: idCajero,
        fechaRegistro: fechaEfectivo,
        fechaPago: fechaEfectivo,
        estadoPago: 'Pagado',
        metodoPago: 'Efectivo',
        subtotal: 100,
        propina: 10,
        numero: 1
      }),
      crearPago({
        pedido: idPedidoTarjeta,
        mesa: idMesa,
        mesero: idMesero,
        cajero: idOtroCajero,
        fechaRegistro: fechaTarjeta,
        fechaPago: fechaTarjeta,
        estadoPago: 'Pagado',
        metodoPago: 'Tarjeta',
        subtotal: 50,
        propina: 0,
        numero: 2
      }),
      crearPago({
        pedido: idPedidoPendiente,
        mesa: idMesa,
        mesero: idMesero,
        cajero: idCajero,
        fechaRegistro: fechaPendiente,
        fechaPago: null,
        estadoPago: 'Pendiente',
        metodoPago: 'Efectivo',
        subtotal: 25,
        propina: 0,
        numero: 3
      }),
      crearPago({
        pedido: idPedidoAnulado,
        mesa: idMesa,
        mesero: idMesero,
        cajero: idCajero,
        fechaRegistro: fechaAnulado,
        fechaPago: null,
        estadoPago: 'Anulado',
        metodoPago: 'QR',
        subtotal: 200,
        propina: 0,
        numero: 4
      }),
      crearPago({
        pedido: idPedidoAyer,
        mesa: idMesa,
        mesero: idMesero,
        cajero: idCajero,
        fechaRegistro: fechaAyer,
        fechaPago: fechaAyer,
        estadoPago: 'Pagado',
        metodoPago: 'Efectivo',
        subtotal: 80,
        propina: 5,
        numero: 5
      }),
      crearPago({
        pedido: idPedidoFuturo,
        mesa: idMesa,
        mesero: idMesero,
        cajero: idCajero,
        fechaRegistro: fechaFuturo,
        fechaPago: fechaFuturo,
        estadoPago: 'Pagado',
        metodoPago: 'QR',
        subtotal: 600,
        propina: 0,
        numero: 6
      })
    ]

    const db = mongoose.connection.db!
    await db.collection('mesas').insertOne({
      _id: idMesa,
      numero: 'QA-101',
      estado: 'Libre'
    })

    await db.collection('usuarios').insertMany([
      {
        _id: idMesero,
        nombre: 'Mesero',
        apellido: 'QA',
        ci: '990000011',
        email: `qa-mes-${sufijo}@example.invalid`
      },
      {
        _id: idCajero,
        nombre: 'Cajero',
        apellido: 'QA',
        ci: '990000012',
        email: `qa-caj-${sufijo}@example.invalid`
      },
      {
        _id: idOtroCajero,
        nombre: 'Otro Cajero',
        apellido: 'QA',
        ci: '990000013',
        email: `qa-caj2-${sufijo}@example.invalid`
      }
    ])

    await db.collection('pedidos').insertOne({
      _id: idPedidoEfectivo,
      codigo: `PED-QA-DETALLE-${sufijo}`,
      total: 110,
      estado: 'CERRADO'
    })

    await db.collection('pagos').insertMany(pagos)

    const pagoEfectivo = pagos[0]
    const pagoTarjeta = pagos[1]

    // -------------------------------------------------------
    // A. Historial por fechas y valor por defecto de hasta
    // -------------------------------------------------------
    const historial = await servicio.listarPagos({})

    comprobarIgual(
      'Historial por defecto: incluye pagos anteriores y de hoy',
      historial.paginacion.total,
      5
    )
    comprobarIgual(
      'Historial por defecto: registros de la página',
      historial.datos.length,
      5
    )
    comprobarIgual(
      'Historial por defecto: no incluye pagos de mañana',
      historial.datos.some(
        (pago: any) => pago._id.toString() === pagos[5]._id.toString()
      ),
      false
    )
    comprobarIgual(
      'Historial con datos: sinDatos es falso',
      historial.sinDatos,
      false
    )
    comprobarIgual(
      'Historial con datos: advertencia es nula',
      historial.advertencia,
      null
    )

    // El administrador conserva el historial global.
    comprobar(
      'Administrador: el historial incluye pagos de distintos cajeros',
      historial.datos.some(
        (pago) => String(pago._id) === String(pagoTarjeta._id)
      )
    )

    // El listado del cajero se filtra también antes de contar y paginar.
    const historialCajero = await servicio.listarPagos({
      cajeroId: idCajero.toString()
    })
    comprobarIgual(
      'Cajero: total limitado a sus propios pagos',
      historialCajero.paginacion.total,
      4
    )
    comprobar(
      'Cajero: no recibe pagos cobrados por otro cajero',
      !historialCajero.datos.some(
        (pago) => String(pago._id) === String(pagoTarjeta._id)
      )
    )

    const historialOtroCajero = await servicio.listarPagos({
      cajeroId: idOtroCajero.toString()
    })
    comprobarIgual(
      'Segundo cajero: solo ve su pago',
      historialOtroCajero.paginacion.total,
      1
    )
    comprobarIgual(
      'Segundo cajero: el pago devuelto es el suyo',
      String(historialOtroCajero.datos[0]._id),
      String(pagoTarjeta._id)
    )

    // -------------------------------------------------------
    // B. Paginación
    // -------------------------------------------------------
    const pagina1 = await servicio.listarPagos({
      desde: hoy,
      hasta: hoy,
      pagina: '1',
      limite: '2'
    })

    comprobarIgual('Paginación: total de registros de hoy', pagina1.paginacion.total, 4)
    comprobarIgual('Paginación: registros en la primera página', pagina1.datos.length, 2)
    comprobarIgual('Paginación: total de páginas', pagina1.paginacion.totalPaginas, 2)
    comprobarIgual('Paginación: página actual', pagina1.paginacion.pagina, 1)

    const pagina2 = await servicio.listarPagos({
      desde: hoy,
      hasta: hoy,
      pagina: '2',
      limite: '2'
    })

    comprobarIgual('Paginación: registros en la segunda página', pagina2.datos.length, 2)
    comprobarIgual('Paginación: página siguiente', pagina2.paginacion.pagina, 2)

    const idsPagina1 = new Set(
      pagina1.datos.map((pago: any) => pago._id.toString())
    )
    comprobar(
      'Paginación: las páginas no contienen los mismos pagos',
      pagina2.datos.every(
        (pago: any) => !idsPagina1.has(pago._id.toString())
      )
    )

    // -------------------------------------------------------
    // C. Filtros de estado y método de pago
    // -------------------------------------------------------
    const pagados = await servicio.listarPagos({
      desde: hoy,
      hasta: hoy,
      estadoPago: 'Pagado'
    })

    comprobarIgual('Filtro por estado: solo dos pagos confirmados hoy', pagados.paginacion.total, 2)

    const tarjetas = await servicio.listarPagos({
      desde: hoy,
      hasta: hoy,
      estadoPago: 'Pagado',
      metodoPago: 'Tarjeta'
    })

    comprobarIgual('Filtro por método: pago con tarjeta', tarjetas.paginacion.total, 1)
    comprobarIgual(
      'Filtro por método: método devuelto correctamente',
      tarjetas.datos[0].metodoPago,
      'Tarjeta'
    )

    const efectivo = await servicio.listarPagos({
      desde: hoy,
      hasta: hoy,
      estadoPago: 'Pagado',
      metodoPago: 'Efectivo'
    })

    comprobarIgual('Filtro por método: pago en efectivo', efectivo.paginacion.total, 1)

    const pendientes = await servicio.listarPagos({
      desde: hoy,
      hasta: hoy,
      estadoPago: 'Pendiente'
    })

    comprobarIgual('Filtro por estado: pagos pendientes', pendientes.paginacion.total, 1)

    const anulados = await servicio.listarPagos({
      desde: hoy,
      hasta: hoy,
      estadoPago: 'Anulado'
    })

    comprobarIgual('Filtro por estado: pagos anulados', anulados.paginacion.total, 1)

    // -------------------------------------------------------
    // D. Fechas personalizadas y límites
    // -------------------------------------------------------
    const soloAyer = await servicio.listarPagos({
      desde: ayer,
      hasta: ayer
    })

    comprobarIgual('Fechas: total de pagos de ayer', soloAyer.paginacion.total, 1)
    comprobarIgual(
      'Fechas: el registro pertenece al día seleccionado',
      soloAyer.datos[0].codigoPago,
      pagos[4].codigoPago
    )

    const hoyCompleto = await servicio.listarPagos({
      desde: hoy,
      hasta: hoy
    })

    comprobarIgual('Fechas: registros creados hoy', hoyCompleto.paginacion.total, 4)

    // -------------------------------------------------------
    // E. Sin resultados y validaciones
    // -------------------------------------------------------
    const vacio = await servicio.listarPagos({
      desde: futuroSinDatos,
      hasta: futuroSinDatos
    })

    comprobarIgual('Sin datos: sinDatos verdadero', vacio.sinDatos, true)
    comprobarIgual('Sin datos: advertencia informativa', typeof vacio.advertencia, 'string')
    comprobarIgual('Sin datos: lista vacía', vacio.datos.length, 0)
    comprobarIgual('Sin datos: total en cero', vacio.paginacion.total, 0)
    comprobarIgual('Sin datos: total de páginas en cero', vacio.paginacion.totalPaginas, 0)

    await debeRechazar(
      'Validación de fecha mal formada',
      () => servicio.listarPagos({ desde: '18-10-2026', hasta: hoy }),
      400
    )

    await debeRechazar(
      'Validación del intervalo invertido',
      () => servicio.listarPagos({ desde: manana, hasta: hoy }),
      400
    )

    await debeRechazar(
      'Validación de estado inválido',
      () => servicio.listarPagos({ estadoPago: 'COBRADO' }),
      400
    )

    await debeRechazar(
      'Validación de método inválido',
      () => servicio.listarPagos({ metodoPago: 'CRIPTOMONEDA' }),
      400
    )

    await debeRechazar(
      'Validación de página cero',
      () => servicio.listarPagos({ pagina: '0' }),
      400
    )

    await debeRechazar(
      'Validación del límite máximo',
      () => servicio.listarPagos({ limite: '101' }),
      400
    )

    // -------------------------------------------------------
    // F. Detalle individual
    // -------------------------------------------------------
    const detalle = await servicio.obtenerDetallePago(pagoEfectivo._id.toString()) as any

    comprobarIgual(
      'Detalle: código de pago',
      detalle.codigoPago,
      pagoEfectivo.codigoPago
    )
    comprobarIgual('Detalle: subtotal', detalle.subtotal, 100)
    comprobarIgual('Detalle: propina', detalle.propina, 10)
    comprobarIgual('Detalle: total cobrado', detalle.totalFinal, 110)
    comprobarIgual('Detalle: método de pago', detalle.metodoPago, 'Efectivo')
    comprobarIgual('Detalle: estado', detalle.estadoPago, 'Pagado')

    comprobarIgual(
      'Detalle: pedido relacionado',
      detalle.pedido.codigo,
      `PED-QA-DETALLE-${sufijo}`
    )
    comprobarIgual(
      'Detalle: mesa relacionada',
      detalle.mesa.numero,
      'QA-101'
    )
    comprobarIgual(
      'Detalle: cajero relacionado',
      detalle.cajero.nombre,
      'Cajero'
    )

    const detallePropio = await servicio.obtenerDetallePago(
      pagoEfectivo._id.toString(),
      idCajero.toString()
    )
    comprobarIgual(
      'Cajero: puede consultar el detalle de su pago',
      String(detallePropio._id),
      String(pagoEfectivo._id)
    )

    await debeRechazar(
      'Cajero: no puede consultar el detalle de otro cajero',
      () => servicio.obtenerDetallePago(
        pagoTarjeta._id.toString(),
        idCajero.toString()
      ),
      404
    )

    // Sin alcance de cajero, el administrador puede consultar cualquier detalle.
    const detalleOtroAdmin = await servicio.obtenerDetallePago(
      pagoTarjeta._id.toString()
    )
    comprobarIgual(
      'Administrador: puede consultar pagos de otros cajeros',
      String(detalleOtroAdmin._id),
      String(pagoTarjeta._id)
    )

    await debeRechazar(
      'Detalle: ID mal formado',
      () => servicio.obtenerDetallePago('no-es-un-object-id'),
      400
    )

    await debeRechazar(
      'Detalle: ID válido pero inexistente',
      () => servicio.obtenerDetallePago(new Types.ObjectId().toString()),
      404
    )

    console.log(`\n✅ TOTAL: ${totalPruebas} comprobaciones aprobadas.`)
  } finally {
    if (conectado && mongoose.connection.readyState === 1) {
      const nombreReal = mongoose.connection.db?.databaseName

      if (
        seguroParaEliminar &&
        nombreReal === basePruebas &&
        nombreReal.startsWith(PREFIJO_DB)
      ) {
        await mongoose.connection.dropDatabase()
        console.log(`🧹 Base temporal eliminada: ${nombreReal}`)
      } else {
        console.warn(
          '⚠️ No se eliminó la base: la comprobación de seguridad no lo autorizó.'
        )
      }

      await mongoose.disconnect()
    }
  }
}

main().catch((error: unknown) => {
  console.error('\n❌ FALLÓ LA SUITE DE CONSULTA DE PAGOS')
  console.error(error)
  process.exitCode = 1
})
