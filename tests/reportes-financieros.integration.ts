import 'dotenv/config'
import { strict as assert } from 'node:assert'
import mongoose, { Types } from 'mongoose'

import Usuario from '../src/models/Usuario'
import Pago from '../src/models/Pago'
import Pedido from '../src/models/Pedido'
import Plato from '../src/models/Plato'
import Categoria from '../src/models/Categoria'

import { ReportesRepository } from '../src/repositories/reportes.repo'
import {
  ReportesService,
  ReportesServiceError
} from '../src/services/reportes.service'

import {
  obtenerFechaISO_Bolivia,
  obtenerRangoInclusivoBolivia
} from '../src/utils/fechaBolivia'

import { ESTADOS_TANDA_COCINA } from '../src/utils/constants'

type DocumentoPrueba = Record<string, unknown>

const PREFIJO_DB = 'qa_reportes_financieros_'
const sufijo = `${Date.now().toString(36)}_${process.pid.toString(36)}`
const basePruebas = `${PREFIJO_DB}${sufijo}`

let conectado = false
let seguroParaEliminar = false
let totalPruebas = 0

function comprobar(nombre: string, condicion: unknown): void {
  assert.ok(condicion, nombre)
  totalPruebas += 1
  console.log(`✅ ${nombre}`)
}

function comprobarIgual<T>(
  nombre: string,
  actual: T,
  esperado: T
): void {
  assert.equal(actual, esperado, nombre)
  totalPruebas += 1
  console.log(`✅ ${nombre}`)
}

function desplazarDia(fecha: string, cantidad: number): string {
  const resultado = new Date(`${fecha}T12:00:00Z`)
  resultado.setUTCDate(resultado.getUTCDate() + cantidad)
  return resultado.toISOString().slice(0, 10)
}

async function insertarColeccion(
  nombre: string,
  documentos: DocumentoPrueba[]
): Promise<void> {
  if (documentos.length === 0) return

  const db = mongoose.connection.db
  assert.ok(db, 'La conexión de prueba debe estar activa')

  await db.collection<DocumentoPrueba>(nombre).insertMany(documentos)
}

function crearDetalle(
  platoId: Types.ObjectId,
  cantidad: number,
  precioUnitario: number,
  tandaId?: Types.ObjectId
): DocumentoPrueba {
  return {
    plato: platoId,
    cantidad,
    precioUnitario,
    subtotal: Number((cantidad * precioUnitario).toFixed(2)),
    ...(tandaId ? { tandaId } : {})
  }
}

function crearPedido(
  pedidoId: Types.ObjectId,
  codigo: string,
  mesaId: Types.ObjectId,
  meseroId: Types.ObjectId,
  detalles: DocumentoPrueba[],
  tandas: DocumentoPrueba[],
  subtotal: number,
  propina: number,
  total: number,
  estado = 'CERRADO'
): DocumentoPrueba {
  const ahora = new Date()

  return {
    _id: pedidoId,
    codigo,
    fechaDiaBolivia: obtenerFechaISO_Bolivia(),
    fechaHora: ahora,
    estado,
    estadoCuenta: estado === 'CERRADO' ? 'CERRADA' : 'ABIERTA',
    mesa: mesaId,
    usuario: meseroId,
    cajeroAsignado: null,
    detalles,
    tandas,
    subtotalCierre: subtotal,
    montoPropina: propina,
    total,
    createdAt: ahora,
    updatedAt: ahora
  }
}

function crearPago(
  numero: number,
  pedidoId: Types.ObjectId,
  mesaId: Types.ObjectId,
  meseroId: Types.ObjectId,
  cajeroId: Types.ObjectId,
  fechaPago: Date,
  estadoPago: string,
  metodoPago: string,
  subtotal: number,
  propina: number
): DocumentoPrueba {
  return {
    _id: new Types.ObjectId(),
    codigoPago: `PAG-QA-RPT-${sufijo}-${numero}`,
    codigoPedido: `PED-QA-RPT-${sufijo}-${numero}`,
    pedido: pedidoId,
    mesa: mesaId,
    mesero: meseroId,
    cajero: cajeroId,
    nombreCliente: 'Cliente QA',
    apellidoCliente: '',
    ci: '',
    nit: '',
    subtotal,
    propina,
    totalFinal: Number((subtotal + propina).toFixed(2)),
    metodoPago,
    estadoPago,
    fechaEnvioCaja: fechaPago,
    fechaPago,
    createdAt: fechaPago,
    updatedAt: fechaPago
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI

  if (!uri) {
    throw new Error('Configura MONGO_URI o MONGODB_URI para la prueba.')
  }

  await mongoose.connect(uri, {
    dbName: basePruebas,
    serverSelectionTimeoutMS: 15000
  })
  conectado = true

  try {
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
    console.log(`✅ Base temporal aislada: ${nombreReal}`)

    await Promise.all([
      Pago.init(),
      Pedido.init(),
      Usuario.init(),
      Plato.init(),
      Categoria.init()
    ])

    const hoy = obtenerFechaISO_Bolivia()
    const ayer = desplazarDia(hoy, -1)
    const manana = desplazarDia(hoy, 1)

    const rangoHoy = obtenerRangoInclusivoBolivia(hoy, hoy)
    const rangoAyer = obtenerRangoInclusivoBolivia(ayer, ayer)

    const fecha1 = new Date(rangoHoy.desde.getTime() + 60 * 60 * 1000)
    const fecha2 = new Date(rangoHoy.desde.getTime() + 2 * 60 * 60 * 1000)
    const fecha3 = new Date(rangoHoy.desde.getTime() + 3 * 60 * 60 * 1000)
    const fechaPendiente = new Date(
      rangoHoy.desde.getTime() + 4 * 60 * 60 * 1000
    )
    const fechaAyer = new Date(
      rangoAyer.desde.getTime() + 12 * 60 * 60 * 1000
    )

    const mesaId = new Types.ObjectId()
    const meseroId = new Types.ObjectId()
    const cajeroAId = new Types.ObjectId()
    const cajeroBId = new Types.ObjectId()

    const categoriaComidaId = new Types.ObjectId()
    const categoriaBebidaId = new Types.ObjectId()
    const comidaId = new Types.ObjectId()
    const bebidaId = new Types.ObjectId()

    const pedido1Id = new Types.ObjectId()
    const pedido2Id = new Types.ObjectId()
    const pedido3Id = new Types.ObjectId()
    const pedidoPendienteId = new Types.ObjectId()
    const pedidoAyerId = new Types.ObjectId()

    const tandaCanceladaId = new Types.ObjectId()

    const nombreComida = `Comida QA ${sufijo}`
    const nombreBebida = `Bebida QA ${sufijo}`
    const nombreCategoriaComida = `Alimentos QA ${sufijo}`
    const nombreCategoriaBebida = `Bebidas QA ${sufijo}`

    await insertarColeccion(Usuario.collection.name, [
      {
        _id: meseroId,
        nombre: 'Mesero',
        apellido: 'QA',
        ci: `CI-MES-${sufijo}`,
        email: `mesero-${sufijo}@example.invalid`,
        password: 'SOLO_PARA_PRUEBAS',
        rol: 'Mesero',
        estado: true,
        verificado: true
      },
      {
        _id: cajeroAId,
        nombre: 'Cajera',
        apellido: 'Alfa',
        ci: `CI-CAJ-A-${sufijo}`,
        email: `cajera-a-${sufijo}@example.invalid`,
        password: 'SOLO_PARA_PRUEBAS',
        rol: 'Cajero',
        estado: true,
        verificado: true
      },
      {
        _id: cajeroBId,
        nombre: 'Cajero',
        apellido: 'Beta',
        ci: `CI-CAJ-B-${sufijo}`,
        email: `cajero-b-${sufijo}@example.invalid`,
        password: 'SOLO_PARA_PRUEBAS',
        rol: 'Cajero',
        estado: true,
        verificado: true
      }
    ])

    await insertarColeccion(Categoria.collection.name, [
      { _id: categoriaComidaId, nombre: nombreCategoriaComida },
      { _id: categoriaBebidaId, nombre: nombreCategoriaBebida }
    ])

    await insertarColeccion(Plato.collection.name, [
      {
        _id: comidaId,
        nombre: nombreComida,
        categoria: categoriaComidaId,
        precio: 10
      },
      {
        _id: bebidaId,
        nombre: nombreBebida,
        categoria: categoriaBebidaId,
        precio: 20
      }
    ])

    const pedidos: DocumentoPrueba[] = [
      crearPedido(
        pedido1Id,
        `PED-QA-RPT-${sufijo}-1`,
        mesaId,
        meseroId,
        [
          crearDetalle(comidaId, 2, 10),
          crearDetalle(bebidaId, 1, 35),
          crearDetalle(bebidaId, 9, 11, tandaCanceladaId)
        ],
        [
          {
            _id: tandaCanceladaId,
            estado: ESTADOS_TANDA_COCINA.CANCELADA
          }
        ],
        55,
        7.5,
        62.5
      ),
      crearPedido(
        pedido2Id,
        `PED-QA-RPT-${sufijo}-2`,
        mesaId,
        meseroId,
        [
          crearDetalle(comidaId, 1, 10),
          crearDetalle(bebidaId, 1, 20)
        ],
        [],
        30,
        3,
        33
      ),
      crearPedido(
        pedido3Id,
        `PED-QA-RPT-${sufijo}-3`,
        mesaId,
        meseroId,
        [crearDetalle(comidaId, 2, 22)],
        [],
        44,
        0,
        44
      ),
      crearPedido(
        pedidoPendienteId,
        `PED-QA-RPT-${sufijo}-4`,
        mesaId,
        meseroId,
        [],
        [],
        1000,
        0,
        1000
      ),
      crearPedido(
        pedidoAyerId,
        `PED-QA-RPT-${sufijo}-5`,
        mesaId,
        meseroId,
        [crearDetalle(comidaId, 1, 20)],
        [],
        20,
        0,
        20
      )
    ]

    await insertarColeccion(Pedido.collection.name, pedidos)

    await insertarColeccion(Pago.collection.name, [
      crearPago(
        1, pedido1Id, mesaId, meseroId, cajeroAId,
        fecha1, 'Pagado', 'Efectivo', 55, 7.5
      ),
      crearPago(
        2, pedido2Id, mesaId, meseroId, cajeroBId,
        fecha2, 'Pagado', 'Tarjeta', 30, 3
      ),
      crearPago(
        3, pedido3Id, mesaId, meseroId, cajeroAId,
        fecha3, 'Pagado', 'Efectivo', 44, 0
      ),
      crearPago(
        4, pedidoPendienteId, mesaId, meseroId, cajeroBId,
        fechaPendiente, 'Pendiente', 'QR', 1000, 0
      ),
      crearPago(
        5, pedidoAyerId, mesaId, meseroId, cajeroBId,
        fechaAyer, 'Pagado', 'Efectivo', 20, 0
      )
    ])

    const servicio = new ReportesService(new ReportesRepository())

    // A. Ventas del día: solo pagos cobrados y dentro del período.
    const ventas = await servicio.obtenerReporteVentas({
      desde: hoy,
      hasta: hoy
    })

    comprobarIgual('Ventas de hoy: total con propinas', ventas.datos.totalCobrado, 139.5)
    comprobarIgual('Ventas de hoy: tres operaciones pagadas', ventas.datos.cantidadOperaciones, 3)
    comprobarIgual('Ventas de hoy: dos operaciones con propina', ventas.datos.operacionesConPropina, 2)
    comprobarIgual('Ventas de hoy: una operación sin propina', ventas.datos.operacionesSinPropina, 1)
    comprobarIgual('Ventas de hoy: no se marca como reporte vacío', ventas.sinDatos, false)
    comprobarIgual('Ventas de hoy: una fecha en evolución diaria', ventas.datos.evolucionDiaria.length, 1)
    comprobarIgual('Evolución diaria: fecha de Bolivia correcta', ventas.datos.evolucionDiaria[0]?.fecha, hoy)
    comprobarIgual('Evolución diaria: importe del día', ventas.datos.evolucionDiaria[0]?.totalCobrado, 139.5)

    // B. Si se omite hasta, debe usarse la fecha de hoy en Bolivia.
    const hastaPredeterminado = await servicio.obtenerReporteVentas({
      desde: hoy
    })
    comprobarIgual('La fecha hasta predeterminada incluye el día de hoy', hastaPredeterminado.datos.totalCobrado, 139.5)

    // C. Sin desde, el informe incluye el historial anterior hasta hoy.
    const historialHastaHoy = await servicio.obtenerReporteVentas({})
    comprobarIgual('Sin desde, se incluyen los pagos anteriores hasta hoy', historialHastaHoy.datos.totalCobrado, 159.5)
    comprobarIgual('El pago pendiente queda excluido del historial financiero', historialHastaHoy.datos.cantidadOperaciones, 4)

    // D. Totales agrupados por método de pago.
    const metodos = await servicio.obtenerReporteMetodosPago({
      desde: hoy,
      hasta: hoy
    })
    const efectivo = metodos.datos.find((item) => item.metodoPago === 'Efectivo')
    const tarjeta = metodos.datos.find((item) => item.metodoPago === 'Tarjeta')

    assert.ok(efectivo, 'Debe existir el grupo de efectivo')
    assert.ok(tarjeta, 'Debe existir el grupo de tarjeta')

    comprobarIgual('Efectivo: total de ambas operaciones', efectivo.totalCobrado, 106.5)
    comprobarIgual('Efectivo: cantidad de operaciones', efectivo.cantidadOperaciones, 2)
    comprobarIgual('Efectivo: una operación con propina', efectivo.operacionesConPropina, 1)
    comprobarIgual('Tarjeta: total cobrado', tarjeta.totalCobrado, 33)
    comprobarIgual('Tarjeta: cantidad de operaciones', tarjeta.cantidadOperaciones, 1)

    // E. Desglose automático por cajero, sin filtro individual.
    const cajeros = await servicio.obtenerReporteCajeros({
      desde: hoy,
      hasta: hoy
    })
    const cajeroA = cajeros.datos.find(
      (item) => item.cajeroId === cajeroAId.toString()
    )
    const cajeroB = cajeros.datos.find(
      (item) => item.cajeroId === cajeroBId.toString()
    )

    assert.ok(cajeroA, 'Debe existir el grupo del cajero Alfa')
    assert.ok(cajeroB, 'Debe existir el grupo del cajero Beta')

    comprobarIgual('Cajero Alfa: total cobrado', cajeroA.totalCobrado, 106.5)
    comprobarIgual('Cajero Alfa: dos operaciones', cajeroA.cantidadOperaciones, 2)
    comprobarIgual('Cajero Alfa: nombre consolidado', cajeroA.nombreCajero, 'Cajera Alfa')
    comprobarIgual('Cajero Beta: total cobrado hoy', cajeroB.totalCobrado, 33)
    comprobarIgual('Cajero Beta: una operación de hoy', cajeroB.cantidadOperaciones, 1)

    // F. Productos y categorías: el ítem de tanda cancelada no debe sumar.
    const productos = await servicio.obtenerReporteProductos({
      desde: hoy,
      hasta: hoy
    })

    const comida = productos.datos.productos.find(
      (item) => item.nombre === nombreComida
    )
    const bebida = productos.datos.productos.find(
      (item) => item.nombre === nombreBebida
    )

    assert.ok(comida, 'Debe existir el producto de comida')
    assert.ok(bebida, 'Debe existir el producto de bebida')

    comprobarIgual('Comida: cinco unidades vendidas', comida.unidadesVendidas, 5)
    comprobarIgual('Comida: importe histórico de detalles', comida.importeVendido, 74)
    comprobarIgual('Bebida: dos unidades válidas', bebida.unidadesVendidas, 2)
    comprobarIgual('Bebida: importe sin tanda cancelada', bebida.importeVendido, 55)

    const categorias = new Map(
      productos.datos.categorias.map((item) => [item.nombre, item])
    )
    const alimentos = categorias.get(nombreCategoriaComida)
    const bebidas = categorias.get(nombreCategoriaBebida)

    assert.ok(alimentos, 'Debe existir la categoría de alimentos')
    assert.ok(bebidas, 'Debe existir la categoría de bebidas')

    comprobarIgual('Categoría alimentos: unidades', alimentos.unidadesVendidas, 5)
    comprobarIgual('Categoría alimentos: importe', alimentos.importeVendido, 74)
    comprobarIgual('Categoría bebidas: unidades sin canceladas', bebidas.unidadesVendidas, 2)
    comprobarIgual('Categoría bebidas: importe sin canceladas', bebidas.importeVendido, 55)

    // G. Período vacío, validación de fechas y respuesta informativa.
    const ventasVacias = await servicio.obtenerReporteVentas({
      desde: manana,
      hasta: manana
    })
    comprobarIgual('Período vacío: total en cero', ventasVacias.datos.totalCobrado, 0)
    comprobarIgual('Período vacío: marca sinDatos', ventasVacias.sinDatos, true)
    comprobar('Período vacío: incluye advertencia informativa', ventasVacias.advertencia !== null)

    const metodosVacios = await servicio.obtenerReporteMetodosPago({
      desde: manana,
      hasta: manana
    })
    comprobarIgual('Período vacío: métodos sin registros', metodosVacios.datos.length, 0)
    comprobarIgual('Período vacío: métodos marca sinDatos', metodosVacios.sinDatos, true)

    const cajerosVacios = await servicio.obtenerReporteCajeros({
      desde: manana,
      hasta: manana
    })
    comprobarIgual('Período vacío: cajeros sin registros', cajerosVacios.datos.length, 0)

    const productosVacios = await servicio.obtenerReporteProductos({
      desde: manana,
      hasta: manana
    })
    comprobarIgual('Período vacío: productos sin registros', productosVacios.datos.productos.length, 0)
    comprobarIgual('Período vacío: categorías sin registros', productosVacios.datos.categorias.length, 0)
    comprobarIgual('Período vacío: productos marca sinDatos', productosVacios.sinDatos, true)

    await assert.rejects(
      () => servicio.obtenerReporteVentas({
        desde: manana,
        hasta: hoy
      }),
      (error: unknown) =>
        error instanceof ReportesServiceError &&
        error.statusCode === 400
    )
    comprobar('El rango con desde posterior a hasta se rechaza con HTTP 400', true)

    console.log('')
    console.log(`🎉 TODAS LAS COMPROBACIONES PASARON: ${totalPruebas}`)
  } finally {
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
  }
}

main().catch((error: unknown) => {
  console.error('')
  console.error('❌ FALLÓ LA BATERÍA DE REPORTES FINANCIEROS')
  console.error(error)
  process.exitCode = 1
})
