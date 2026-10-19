import 'dotenv/config'
import { strict as assert } from 'node:assert'
import mongoose, { Types } from 'mongoose'

import Mesa from '../src/models/Mesa'
import Pago from '../src/models/Pago'
import Pedido from '../src/models/Pedido'
import Plato from '../src/models/Plato'
import Categoria from '../src/models/Categoria'

import { DashboardRepository } from '../src/repositories/dashboard.repo'
import { DashboardService } from '../src/services/dashboard.service'
import {
  obtenerFechaISO_Bolivia,
  obtenerRangoInclusivoBolivia
} from '../src/utils/fechaBolivia'
import {
  ESTADOS_MESA,
  ESTADOS_TANDA_COCINA
} from '../src/utils/constants'

const PREFIJO_DB = 'qa_dashboard_'
const sufijo = `${Date.now().toString(36)}_${process.pid.toString(36)}`
const basePruebas = `${PREFIJO_DB}${sufijo}`

let totalPruebas = 0
let conectado = false
let seguroParaEliminar = false

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

function fechaCalendarioBolivia(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(fecha)
}

function desplazarDia(fecha: string, cantidad: number): string {
  const resultado = new Date(`${fecha}T12:00:00Z`)
  resultado.setUTCDate(resultado.getUTCDate() + cantidad)
  return resultado.toISOString().slice(0, 10)
}

async function insertarColeccion(
  nombre: string,
  documentos: Record<string, any>[]
): Promise<void> {
  if (documentos.length === 0) return

  const db = mongoose.connection.db
  assert.ok(db, 'La conexión a MongoDB debe estar activa')

  await db.collection(nombre).insertMany(documentos)
}

function crearDetalle(
  plato: Types.ObjectId,
  cantidad: number,
  precioUnitario: number,
  tandaId?: Types.ObjectId
): Record<string, any> {
  return {
    plato,
    cantidad,
    precioUnitario,
    subtotal: Number((cantidad * precioUnitario).toFixed(2)),
    observacion: '',
    ...(tandaId ? { tandaId } : {})
  }
}

function crearPedido(
  id: Types.ObjectId,
  codigo: string,
  fechaCreacion: Date,
  mesaId: Types.ObjectId,
  usuarioId: Types.ObjectId,
  detalles: Record<string, any>[],
  tandas: Record<string, any>[] = [],
  total?: number
): Record<string, any> {
  const subtotalDetalles = detalles.reduce(
    (suma, detalle) => suma + detalle.subtotal,
    0
  )

  return {
    _id: id,
    codigo,
    fechaDiaBolivia: fechaCalendarioBolivia(fechaCreacion),
    fechaHora: fechaCreacion,
    estado: 'CERRADO',
    estadoCuenta: 'CERRADA',
    tandas,
    total: total ?? Number(subtotalDetalles.toFixed(2)),
    mesa: mesaId,
    usuario: usuarioId,
    detalles,
    createdAt: fechaCreacion,
    updatedAt: fechaCreacion
  }
}

function crearPago(
  idPedido: Types.ObjectId,
  mesaId: Types.ObjectId,
  meseroId: Types.ObjectId,
  cajeroId: Types.ObjectId,
  fechaPago: Date,
  estadoPago: string,
  totalFinal: number,
  propina: number,
  numero: number,
  metodoPago = 'Efectivo'
): Record<string, any> {
  return {
    _id: new Types.ObjectId(),
    codigoPago: `PAG-QA-DASH-${sufijo}-${numero}`,
    codigoPedido: `PED-QA-DASH-${sufijo}-${numero}`,
    pedido: idPedido,
    mesa: mesaId,
    mesero: meseroId,
    cajero: cajeroId,
    nombreCliente: 'Cliente de prueba',
    apellidoCliente: '',
    subtotal: Number((totalFinal - propina).toFixed(2)),
    propina,
    totalFinal,
    metodoPago,
    estadoPago,
    fechaEnvioCaja: fechaPago,
    fechaPago,
    createdAt: fechaPago,
    updatedAt: fechaPago
  }
}

async function main(): Promise<void> {
  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI

  if (!mongoURI) {
    throw new Error(
      'No se encontró MONGO_URI ni MONGODB_URI. Configura la conexión de pruebas.'
    )
  }

  await mongoose.connect(mongoURI, { dbName: basePruebas })
  conectado = true

  try {
    const nombreReal = mongoose.connection.db?.databaseName

    if (
      nombreReal !== basePruebas ||
      !nombreReal?.startsWith(PREFIJO_DB)
    ) {
      throw new Error(
        `SEGURIDAD: base inesperada (${nombreReal}); se cancela la prueba.`
      )
    }

    seguroParaEliminar = true
    console.log(`✅ Base temporal aislada: ${nombreReal}`)

    // Crear índices antes de insertar datos controlados.
    await Promise.all([
      Pago.init(),
      Pedido.init(),
      Mesa.init(),
      Plato.init(),
      Categoria.init()
    ])

    const repo = new DashboardRepository()
    const servicio = new DashboardService(repo)

    const fechaHoy = obtenerFechaISO_Bolivia()
    const rangoHoy = obtenerRangoInclusivoBolivia(fechaHoy, fechaHoy)
    const inicioHoy = rangoHoy.desde
    const finHoy = rangoHoy.hastaExclusivo

    // -------------------------------------------------------
    // BLOQUE A: respuesta cuando todavía no hay datos
    // -------------------------------------------------------
    const vacio = await servicio.obtenerResumen() as any

    comprobarIgual(
      'Sin datos: ventas de hoy en cero',
      vacio.kpis.ventasHoy,
      0
    )
    comprobarIgual(
      'Sin datos: órdenes de hoy en cero',
      vacio.kpis.ordenesHoy,
      0
    )
    comprobarIgual(
      'Sin datos: afluencia estimada en cero',
      vacio.kpis.clientesEstimados,
      0
    )
    comprobarIgual(
      'Sin datos: mesas activas en cero',
      vacio.kpis.mesasActivas,
      0
    )
    comprobarIgual(
      'Sin datos: ocupación en cero',
      vacio.kpis.ocupacionPorcentaje,
      0
    )
    comprobarIgual(
      'Sin datos: lista de platos vacía',
      vacio.platosMasVendidos.length,
      0
    )
    comprobarIgual(
      'Sin datos: lista de categorías vacía',
      vacio.categoriasPopulares.length,
      0
    )
    comprobarIgual(
      'Sin datos: lista de órdenes recientes vacía',
      vacio.ordenesRecientes.length,
      0
    )

    // -------------------------------------------------------
    // BLOQUE B: datos de prueba aislados
    // -------------------------------------------------------
    const ids = {
      categoriaComida: new Types.ObjectId(),
      categoriaBebidas: new Types.ObjectId(),
      categoriaPostres: new Types.ObjectId(),

      platoHamburguesa: new Types.ObjectId(),
      platoLimonada: new Types.ObjectId(),
      platoPostre: new Types.ObjectId(),

      mesaOcupada: new Types.ObjectId(),
      mesaCuentaSolicitada: new Types.ObjectId(),
      mesaLibre: new Types.ObjectId(),
      mesaEstadoInvalido: new Types.ObjectId(),

      mesero: new Types.ObjectId(),
      cajero: new Types.ObjectId(),

      pedidoInicio: new Types.ObjectId(),
      pedidoMedio: new Types.ObjectId(),
      pedidoFinal: new Types.ObjectId(),
      pedidoAyer: new Types.ObjectId(),
      pedidoLimite: new Types.ObjectId(),
      pedidoPendiente: new Types.ObjectId(),
      pedidoAnulado: new Types.ObjectId(),

      tandaActiva: new Types.ObjectId(),
      tandaCancelada: new Types.ObjectId()
    }

    const horaMedia = new Date(
      inicioHoy.getTime() +
      Math.floor((finHoy.getTime() - inicioHoy.getTime()) / 2)
    )

    const horaFinalIncluida = new Date(finHoy.getTime() - 1)
    const horaAyer = new Date(inicioHoy.getTime() - 1)

    const fechaCreacionLimite = new Date(finHoy.getTime() + 1000)
    const fechaCreacionPendiente = new Date(horaMedia.getTime() + 3000)
    const fechaCreacionAnulado = new Date(horaMedia.getTime() + 4000)

    await insertarColeccion('categorias', [
      { _id: ids.categoriaComida, nombre: 'Comidas QA' },
      { _id: ids.categoriaBebidas, nombre: 'Bebidas QA' },
      { _id: ids.categoriaPostres, nombre: 'Postres QA' }
    ])

    await insertarColeccion('platos', [
      {
        _id: ids.platoHamburguesa,
        nombre: 'Hamburguesa QA',
        precio: 40,
        imagenUrl: '',
        categoria: ids.categoriaComida
      },
      {
        _id: ids.platoLimonada,
        nombre: 'Limonada QA',
        precio: 20,
        imagenUrl: '',
        categoria: ids.categoriaBebidas
      },
      {
        _id: ids.platoPostre,
        nombre: 'Postre cancelado QA',
        precio: 5,
        imagenUrl: '',
        categoria: ids.categoriaPostres
      }
    ])

    await insertarColeccion('mesas', [
      {
        _id: ids.mesaOcupada,
        numero: 101,
        estado: ESTADOS_MESA.OCUPADA
      },
      {
        _id: ids.mesaCuentaSolicitada,
        numero: 102,
        estado: ESTADOS_MESA.CUENTA_SOLICITADA
      },
      {
        _id: ids.mesaLibre,
        numero: 103,
        estado: ESTADOS_MESA.LIBRE
      },
      {
        _id: ids.mesaEstadoInvalido,
        numero: 104,
        estado: 'ESTADO_INVALIDO_QA'
      }
    ])

    const pedidoMedioTandas = [
      {
        _id: ids.tandaActiva,
        numeroTanda: 1,
        estado: ESTADOS_TANDA_COCINA.ENTREGADA,
        creadaPor: ids.mesero,
        fechaCreacion: horaMedia
      },
      {
        _id: ids.tandaCancelada,
        numeroTanda: 2,
        estado: ESTADOS_TANDA_COCINA.CANCELADA,
        creadaPor: ids.mesero,
        fechaCreacion: horaMedia
      }
    ]

    const pedidos = [
      crearPedido(
        ids.pedidoInicio,
        `QA-INICIO-${sufijo}`,
        inicioHoy,
        ids.mesaOcupada,
        ids.mesero,
        [
          crearDetalle(ids.platoHamburguesa, 1, 10)
        ],
        [],
        10
      ),
      crearPedido(
        ids.pedidoMedio,
        `QA-MEDIO-${sufijo}`,
        horaMedia,
        ids.mesaOcupada,
        ids.mesero,
        [
          crearDetalle(ids.platoHamburguesa, 2, 40, ids.tandaActiva),
          crearDetalle(ids.platoLimonada, 1, 20, ids.tandaActiva),
          crearDetalle(ids.platoPostre, 9, 5, ids.tandaCancelada)
        ],
        pedidoMedioTandas,
        100
      ),
      crearPedido(
        ids.pedidoFinal,
        `QA-FINAL-${sufijo}`,
        horaFinalIncluida,
        ids.mesaOcupada,
        ids.mesero,
        [
          crearDetalle(ids.platoLimonada, 2, 32.5)
        ],
        [],
        70
      ),
      crearPedido(
        ids.pedidoAyer,
        `QA-AYER-${sufijo}`,
        horaAyer,
        ids.mesaOcupada,
        ids.mesero,
        [
          crearDetalle(ids.platoHamburguesa, 30, 10)
        ],
        [],
        500
      ),
      crearPedido(
        ids.pedidoLimite,
        `QA-LIMITE-${sufijo}`,
        fechaCreacionLimite,
        ids.mesaOcupada,
        ids.mesero,
        [
          crearDetalle(ids.platoHamburguesa, 20, 10)
        ],
        [],
        600
      ),
      crearPedido(
        ids.pedidoPendiente,
        `QA-PENDIENTE-${sufijo}`,
        fechaCreacionPendiente,
        ids.mesaOcupada,
        ids.mesero,
        [
          crearDetalle(ids.platoHamburguesa, 10, 10)
        ],
        [],
        1000
      ),
      crearPedido(
        ids.pedidoAnulado,
        `QA-ANULADO-${sufijo}`,
        fechaCreacionAnulado,
        ids.mesaOcupada,
        ids.mesero,
        [
          crearDetalle(ids.platoLimonada, 12, 10)
        ],
        [],
        2000
      )
    ]

    await insertarColeccion('pedidos', pedidos)

    const pagos = [
      // Inicio exacto del período: se incluye.
      crearPago(
        ids.pedidoInicio, ids.mesaOcupada, ids.mesero, ids.cajero,
        inicioHoy, 'Pagado', 10, 0, 1, 'Efectivo'
      ),

      // Pago con propina: se incluye el total completo de 115.
      crearPago(
        ids.pedidoMedio, ids.mesaOcupada, ids.mesero, ids.cajero,
        horaMedia, 'Pagado', 115, 15, 2, 'Tarjeta'
      ),

      // Último milisegundo del período: se incluye.
      crearPago(
        ids.pedidoFinal, ids.mesaOcupada, ids.mesero, ids.cajero,
        horaFinalIncluida, 'Pagado', 70, 5, 3, 'QR'
      ),

      // Ayer: no se incluye en las estadísticas de hoy.
      crearPago(
        ids.pedidoAyer, ids.mesaOcupada, ids.mesero, ids.cajero,
        horaAyer, 'Pagado', 500, 0, 4
      ),

      // Medianoche siguiente exacta: no se incluye en hoy.
      crearPago(
        ids.pedidoLimite, ids.mesaOcupada, ids.mesero, ids.cajero,
        finHoy, 'Pagado', 600, 0, 5
      ),

      // Los estados no confirmados no deben aumentar las estadísticas.
      crearPago(
        ids.pedidoPendiente, ids.mesaOcupada, ids.mesero, ids.cajero,
        horaMedia, 'Pendiente', 1000, 0, 6
      ),
      crearPago(
        ids.pedidoAnulado, ids.mesaOcupada, ids.mesero, ids.cajero,
        horaMedia, 'Anulado', 2000, 0, 7, 'QR'
      )
    ]

    await insertarColeccion('pagos', pagos)

    // -------------------------------------------------------
    // BLOQUE C: filtro del día y límites temporales
    // -------------------------------------------------------
    const ventasHoy = await repo.obtenerVentasYOrdenesDia(
      inicioHoy,
      finHoy
    )

    comprobarIgual(
      'Ventas de hoy incluyen los importes con propina',
      ventasHoy.totalVentas,
      195
    )
    comprobarIgual(
      'Órdenes de hoy: solo tres pagos confirmados',
      ventasHoy.totalOrdenes,
      3
    )

    // Validar que el índice único del modelo impida dos pagos
    // para el mismo pedido.
    let codigoErrorDuplicado: number | undefined

    try {
      const pagoDuplicado = crearPago(
        ids.pedidoInicio,
        ids.mesaOcupada,
        ids.mesero,
        ids.cajero,
        inicioHoy,
        'Pagado',
        10,
        0,
        99
      )

      const db = mongoose.connection.db!
      await db.collection('pagos').insertOne(pagoDuplicado)
    } catch (error) {
      codigoErrorDuplicado =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? Number(error.code)
          : undefined
    }

    comprobarIgual(
      'MongoDB impide un segundo pago para el mismo pedido',
      codigoErrorDuplicado,
      11000
    )

    // -------------------------------------------------------
    // BLOQUE D: platos y categorías del período
    // -------------------------------------------------------
    const platosHoy = await repo.obtenerPlatosMasVendidos(
      inicioHoy,
      finHoy,
      5
    )

    const cantidadesPorPlato = new Map<string, number>(
      platosHoy.map((plato: any) => [
        plato.datosPlato.nombre,
        plato.cantidadVendida
      ])
    )

    comprobarIgual(
      'Hamburguesas vendidas hoy',
      cantidadesPorPlato.get('Hamburguesa QA'),
      3
    )
    comprobarIgual(
      'Limonadas vendidas hoy',
      cantidadesPorPlato.get('Limonada QA'),
      3
    )
    comprobar(
      'Los productos de la tanda cancelada quedan excluidos',
      !cantidadesPorPlato.has('Postre cancelado QA')
    )
    comprobarIgual(
      'El ranking no incluye el pedido pagado exactamente mañana',
      cantidadesPorPlato.get('Hamburguesa QA'),
      3
    )

    const categoriasHoy = await repo.obtenerCategoriasPopulares(
      inicioHoy,
      finHoy
    )

    const cantidadesPorCategoria = new Map<string, number>(
      categoriasHoy.map((categoria: any) => [
        categoria._id,
        categoria.totalPedidos
      ])
    )

    comprobarIgual(
      'Categoría de comidas: unidades válidas',
      cantidadesPorCategoria.get('Comidas QA'),
      3
    )
    comprobarIgual(
      'Categoría de bebidas: unidades válidas',
      cantidadesPorCategoria.get('Bebidas QA'),
      3
    )
    comprobar(
      'La categoría del producto cancelado no aparece',
      !cantidadesPorCategoria.has('Postres QA')
    )

    // -------------------------------------------------------
    // BLOQUE E: mesas activas
    // -------------------------------------------------------
    comprobarIgual(
      'Mesas activas excluyen libres y estados inválidos',
      await repo.contarMesasActivas(),
      2
    )

    // -------------------------------------------------------
    // BLOQUE F: dashboard completo
    // -------------------------------------------------------
    const resumen = await servicio.obtenerResumen() as any

    comprobarIgual('Dashboard: importe cobrado esperado', resumen.kpis.ventasHoy, 195)
    comprobarIgual('Dashboard: órdenes esperadas', resumen.kpis.ordenesHoy, 3)
    comprobarIgual('Dashboard: afluencia estimada', resumen.kpis.clientesEstimados, 6)
    comprobarIgual('Dashboard: mesas activas', resumen.kpis.mesasActivas, 2)
    comprobarIgual('Dashboard: ocupación porcentual', resumen.kpis.ocupacionPorcentaje, 50)

    const platosResumen = new Map<string, number>(
      resumen.platosMasVendidos.map((plato: any) => [
        plato.nombre,
        plato.cantidad
      ])
    )

    comprobarIgual(
      'Dashboard: ranking de hamburguesas',
      platosResumen.get('Hamburguesa QA'),
      3
    )
    comprobarIgual(
      'Dashboard: ranking de limonadas',
      platosResumen.get('Limonada QA'),
      3
    )

    const categoriasResumen = new Map<string, any>(
      resumen.categoriasPopulares.map((categoria: any) => [
        categoria.nombre,
        categoria
      ])
    )

    comprobarIgual(
      'Dashboard: porcentaje de comidas',
      categoriasResumen.get('Comidas QA')?.porcentaje,
      50
    )
    comprobarIgual(
      'Dashboard: porcentaje de bebidas',
      categoriasResumen.get('Bebidas QA')?.porcentaje,
      50
    )

    comprobarIgual(
      'Dashboard: máximo de cinco órdenes recientes',
      resumen.ordenesRecientes.length,
      5
    )
    comprobarIgual(
      'Dashboard: orden más reciente por fecha de creación',
      resumen.ordenesRecientes[0]?.id,
      `QA-LIMITE-${sufijo}`
    )

    // -------------------------------------------------------
    // BLOQUE G: período personalizado de ayer
    // -------------------------------------------------------
    const fechaAyer = desplazarDia(fechaHoy, -1)
    const rangoAyer = obtenerRangoInclusivoBolivia(fechaAyer, fechaAyer)

    const ventasAyer = await repo.obtenerVentasYOrdenesDia(
      rangoAyer.desde,
      rangoAyer.hastaExclusivo
    )

    comprobarIgual('Período de ayer: importe cobrado', ventasAyer.totalVentas, 500)
    comprobarIgual('Período de ayer: número de órdenes', ventasAyer.totalOrdenes, 1)

    const platosAyer = await repo.obtenerPlatosMasVendidos(
      rangoAyer.desde,
      rangoAyer.hastaExclusivo,
      5
    )

    comprobarIgual(
      'Período de ayer: hamburguesas',
      platosAyer.find((plato: any) => plato.datosPlato.nombre === 'Hamburguesa QA')
        ?.cantidadVendida,
      30
    )

    const categoriasAyer = await repo.obtenerCategoriasPopulares(
      rangoAyer.desde,
      rangoAyer.hastaExclusivo
    )

    comprobarIgual(
      'Período de ayer: unidades por categoría',
      categoriasAyer.find((categoria: any) => categoria._id === 'Comidas QA')
        ?.totalPedidos,
      30
    )


    // -------------------------------------------------------
    // BLOQUE H: validar el límite exacto de medianoche
    // -------------------------------------------------------
    const fechaManana = desplazarDia(fechaHoy, 1)
    const rangoManana = obtenerRangoInclusivoBolivia(
      fechaManana,
      fechaManana
    )

    const ventasManana = await repo.obtenerVentasYOrdenesDia(
      rangoManana.desde,
      rangoManana.hastaExclusivo
    )

    // El pago de 600 Bs está registrado exactamente en la
    // medianoche siguiente: debe pertenecer al día siguiente.
    comprobarIgual(
      'Medianoche siguiente: importe cobrado',
      ventasManana.totalVentas,
      600
    )
    comprobarIgual(
      'Medianoche siguiente: número de órdenes',
      ventasManana.totalOrdenes,
      1
    )

    const platosManana = await repo.obtenerPlatosMasVendidos(
      rangoManana.desde,
      rangoManana.hastaExclusivo,
      5
    )

    comprobarIgual(
      'Medianoche siguiente: hamburguesas vendidas',
      platosManana.find(
        (plato: any) => plato.datosPlato.nombre === 'Hamburguesa QA'
      )?.cantidadVendida,
      20
    )

    const categoriasManana = await repo.obtenerCategoriasPopulares(
      rangoManana.desde,
      rangoManana.hastaExclusivo
    )

    comprobarIgual(
      'Medianoche siguiente: unidades de comidas',
      categoriasManana.find(
        (categoria: any) => categoria._id === 'Comidas QA'
      )?.totalPedidos,
      20
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
          '⚠️ Se conserva la base: la comprobación de seguridad no autorizó eliminarla.'
        )
      }

      await mongoose.disconnect()
    }
  }
}

main().catch((error: unknown) => {
  console.error('\n❌ FALLÓ LA SUITE DEL DASHBOARD')
  console.error(error)
  process.exitCode = 1
})
