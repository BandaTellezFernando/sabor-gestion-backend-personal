import 'dotenv/config'
import { strict as assert } from 'node:assert'
import mongoose, { Types } from 'mongoose'

import Usuario from '../src/models/Usuario'
import Pago from '../src/models/Pago'
import CierreCaja from '../src/models/CierreCaja'
import {
  CierreCajaService,
  CierreCajaServiceError
} from '../src/services/cierreCaja.service'

const PREFIJO_DB = 'qa_cierre_caja_'
const sufijo = `${Date.now().toString(36)}_${process.pid.toString(36)}`
const basePruebas = `${PREFIJO_DB}${sufijo}`
let totalPruebas = 0
let conectado = false
let contadorPagos = 0

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

  assert.ok(error, `${nombre}: se esperaba un rechazo`)
  assert.ok(error instanceof CierreCajaServiceError)
  comprobarIgual(`${nombre}: código esperado`, error.statusCode, statusEsperado)
  totalPruebas += 1
  console.log(`✅ ${nombre}`)
}

function fechaBolivia(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(fecha)
}

function desplazarDia(fecha: string, cantidad: number): string {
  const dia = new Date(`${fecha}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() + cantidad)
  return dia.toISOString().slice(0, 10)
}

let secuenciaCiPrueba = 0

async function crearUsuarioPrueba(
  rol: string,
  etiqueta: string
) {
  secuenciaCiPrueba += 1

  return await Usuario.create({
    nombre: 'QA',
    apellido: `Caja ${etiqueta}`,
    // CI numérica ficticia y única para esta ejecución de pruebas.
    ci: String(Date.now() * 1000 + secuenciaCiPrueba),
    email: `qa-caja-${sufijo}-${etiqueta}@example.invalid`,
    password: 'SOLO_PARA_PRUEBAS',
    rol,
    estado: true,
    verificado: true
  })
}

async function crearPago(
  cajeroId: Types.ObjectId,
  fechaPago: Date,
  metodoPago: string,
  totalFinal: number,
  propina: number
): Promise<void> {
  contadorPagos += 1

  await Pago.create({
    codigoPago: `PAG-QA-${sufijo}-${contadorPagos}`,
    codigoPedido: `PED-QA-${sufijo}-${contadorPagos}`,
    pedido: new Types.ObjectId(),
    mesa: new Types.ObjectId(),
    mesero: new Types.ObjectId(),
    cajero: cajeroId,
    nombreCliente: 'Cliente de prueba',
    subtotal: Number((totalFinal - propina).toFixed(2)),
    propina,
    totalFinal,
    metodoPago,
    estadoPago: 'Pagado',
    fechaEnvioCaja: fechaPago,
    fechaPago
  })
}

async function main(): Promise<void> {
  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI

  if (!mongoURI) {
    throw new Error('No se encontró MONGO_URI ni MONGODB_URI en el entorno.')
  }

  await mongoose.connect(mongoURI, { dbName: basePruebas })
  conectado = true

  try {
    const nombreDB = mongoose.connection.name

    if (
      nombreDB !== basePruebas ||
      !nombreDB.startsWith(PREFIJO_DB)
    ) {
      throw new Error(
        `SEGURIDAD: base inesperada (${nombreDB}); se cancela la prueba.`
      )
    }

    console.log(`✅ Base temporal aislada: ${nombreDB}`)

    await Pago.init()
    await CierreCaja.init()

    const servicio = new CierreCajaService()
    const cajero = await crearUsuarioPrueba('Cajero', 'principal')
    const administrador = await crearUsuarioPrueba('Administrador', 'admin')

    const cajeroId = String(cajero._id)
    const administradorId = String(administrador._id)
    const contextoCajero = { id: cajeroId, rol: 'Cajero' }
    const contextoAdmin = { id: administradorId, rol: 'Administrador' }

    const hoy = fechaBolivia(new Date())
    const periodo = desplazarDia(hoy, -2)
    const diaAnterior = desplazarDia(periodo, -1)
    const diaSiguiente = desplazarDia(periodo, 1)

    const inicioDia = new Date(`${periodo}T00:00:00-04:00`)
    const mediodia = new Date(`${periodo}T12:00:00-04:00`)
    const ultimoInstante = new Date(`${periodo}T23:59:59.999-04:00`)
    const ultimoInstanteAnterior =
      new Date(`${diaAnterior}T23:59:59.999-04:00`)
    const inicioDiaSiguiente =
      new Date(`${diaSiguiente}T00:00:00-04:00`)

    // Tres pagos dentro del período, incluidos ambos límites del día.
    await crearPago(cajero._id, inicioDia, 'Efectivo', 110, 10)
    await crearPago(cajero._id, mediodia, 'Tarjeta', 55, 5)
    await crearPago(cajero._id, ultimoInstante, 'QR', 44.5, 4.5)

    // Estos pagos quedan fuera del período solicitado.
    await crearPago(cajero._id, ultimoInstanteAnterior, 'Efectivo', 999, 99)
    await crearPago(cajero._id, inicioDiaSiguiente, 'QR', 888, 88)

    comprobarIgual(
      'Las fechas inicial y final usan el offset UTC-04 de Bolivia',
      inicioDia.getTime(),
      new Date(`${periodo}T04:00:00.000Z`).getTime()
    )

    const cierre = await servicio.cerrarCaja(
      {
        periodoDesde: periodo,
        periodoHasta: periodo,
        efectivoContado: 105
      },
      contextoCajero
    )

    comprobarIgual('Se registró el cajero correcto', cierre.cajeroId, cajeroId)
    comprobarIgual('El período inicial quedó guardado', cierre.periodoDesde, periodo)
    comprobarIgual('El período final quedó guardado', cierre.periodoHasta, periodo)
    comprobarIgual('El efectivo esperado suma solo pagos del período', cierre.efectivoEsperado, 110)
    comprobarIgual('La tarjeta suma solo pagos del período', cierre.tarjeta, 55)
    comprobarIgual('El QR suma solo pagos del período', cierre.qr, 44.5)
    comprobarIgual('El total recaudado es correcto', cierre.totalRecaudado, 209.5)
    comprobarIgual('Las propinas se suman por separado', cierre.propinas, 19.5)
    comprobarIgual('La cantidad de pagos excluye los límites externos', cierre.pagosProcesados, 3)
    comprobarIgual('Se conserva el efectivo contado', cierre.efectivoContado, 105)
    comprobarIgual('El faltante se calcula como contado menos esperado', cierre.diferenciaEfectivo, -5)

    const cierresCajero = await servicio.listarCierres(
      contextoCajero,
      { desde: periodo, hasta: periodo }
    )
    comprobarIgual('El cajero puede consultar su cierre', cierresCajero.length, 1)

    const cierresAdmin = await servicio.listarCierres(
      contextoAdmin,
      { desde: periodo, hasta: periodo }
    )
    comprobarIgual('El administrador puede consultar el cierre', cierresAdmin.length, 1)

    await debeRechazar(
      'No se permite repetir exactamente el cierre',
      () => servicio.cerrarCaja({
        periodoDesde: periodo,
        periodoHasta: periodo,
        efectivoContado: 110
      }, contextoCajero),
      409
    )

    await debeRechazar(
      'No se permite un período que se superponga con otro cierre',
      () => servicio.cerrarCaja({
        periodoDesde: diaAnterior,
        periodoHasta: periodo,
        efectivoContado: 110
      }, contextoCajero),
      409
    )

    await debeRechazar(
      'Un cajero no puede cerrar la caja de otro',
      () => servicio.cerrarCaja({
        periodoDesde: diaSiguiente,
        periodoHasta: diaSiguiente,
        efectivoContado: 0,
        cajeroId: new Types.ObjectId().toString()
      }, contextoCajero),
      403
    )

    await debeRechazar(
      'No se permite efectivo contado negativo',
      () => servicio.cerrarCaja({
        periodoDesde: diaSiguiente,
        periodoHasta: diaSiguiente,
        efectivoContado: -1
      }, contextoCajero),
      400
    )

    await debeRechazar(
      'No se permite un período con fecha inválida',
      () => servicio.cerrarCaja({
        periodoDesde: '2026-02-30',
        periodoHasta: '2026-02-30',
        efectivoContado: 0
      }, contextoCajero),
      400
    )

    await debeRechazar(
      'Un usuario que no es cajero ni administrador no puede cerrar',
      () => servicio.cerrarCaja({
        periodoDesde: diaSiguiente,
        periodoHasta: diaSiguiente,
        efectivoContado: 0
      }, { id: new Types.ObjectId().toString(), rol: 'Mesero' }),
      403
    )

    comprobarIgual(
      'Los rechazos no generan cierres adicionales',
      await CierreCaja.countDocuments(),
      1
    )


    // Dos cierres simultáneos, con períodos diferentes pero superpuestos.
    const cajeroConcurrente = await crearUsuarioPrueba(
      'Cajero',
      'concurrente'
    )
    const contextoConcurrente = {
      id: String(cajeroConcurrente._id),
      rol: 'Cajero'
    }

    const resultadosConcurrentes = await Promise.allSettled([
      servicio.cerrarCaja(
        {
          periodoDesde: diaAnterior,
          periodoHasta: periodo,
          efectivoContado: 0
        },
        contextoConcurrente
      ),
      servicio.cerrarCaja(
        {
          periodoDesde: periodo,
          periodoHasta: periodo,
          efectivoContado: 0
        },
        contextoConcurrente
      )
    ])

    const exitosConcurrentes = resultadosConcurrentes.filter(
      resultado => resultado.status === 'fulfilled'
    )
    const rechazosConcurrentes = resultadosConcurrentes.filter(
      resultado => resultado.status === 'rejected'
    )

    comprobarIgual(
      'De dos cierres simultáneos superpuestos, exactamente uno tiene éxito',
      exitosConcurrentes.length,
      1
    )
    comprobarIgual(
      'El otro cierre simultáneo se rechaza',
      rechazosConcurrentes.length,
      1
    )

    const errorConcurrente =
      rechazosConcurrentes[0]?.status === 'rejected'
        ? rechazosConcurrentes[0].reason
        : null

    comprobar(
      'El cierre concurrente rechazado devuelve conflicto HTTP 409',
      errorConcurrente instanceof CierreCajaServiceError &&
        errorConcurrente.statusCode === 409
    )

    comprobarIgual(
      'La concurrencia deja un solo cierre para el cajero de prueba',
      await CierreCaja.countDocuments({
        cajeroId: String(cajeroConcurrente._id)
      }),
      1
    )

    console.log(`\n🎉 TODAS LAS COMPROBACIONES PASARON: ${totalPruebas}`)
  } finally {
    const nombreDB = mongoose.connection.name

    if (
      conectado &&
      nombreDB === basePruebas &&
      nombreDB.startsWith(PREFIJO_DB)
    ) {
      await mongoose.connection.dropDatabase()
      console.log(`🧹 Base temporal eliminada: ${nombreDB}`)
    } else {
      console.error(
        `⚠️ No se eliminó ninguna base: el nombre actual (${nombreDB}) no coincide con la base temporal esperada.`
      )
    }

    if (conectado) {
      await mongoose.disconnect()
      conectado = false
    }
  }
}

main().catch((error: unknown) => {
  console.error('\n❌ Falló la prueba de cierre de caja:', error)
  process.exitCode = 1
})
