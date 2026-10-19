import 'dotenv/config'
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import mongoose, { Types } from 'mongoose'

import Usuario from '../src/models/Usuario'
import Mesa from '../src/models/Mesa'
import '../src/models/Plato'
import '../src/models/Ubicacion'
import Pedido from '../src/models/Pedido'
import Pago from '../src/models/Pago'
import QrPagoToken from '../src/models/QrPagoToken'

import { PagoRepository, pagoRepository } from '../src/repositories/pago.repo'
import { pedidoRepository } from '../src/repositories/pedido.repo'
import { mesaRepository } from '../src/repositories/mesa.repo'
import { qrPagoTokenRepository } from '../src/repositories/qrPagoToken.repo'
import { PagoService, pagoService, PagoServiceError } from '../src/services/pago.service'

const PREFIJO_DB = 'qa_pago_qr_'
const sufijo = `${Date.now().toString(36)}_${process.pid.toString(36)}`
const basePruebas = `${PREFIJO_DB}${sufijo}`

let conectado = false
let totalPruebas = 0
let contadorDatos = 0

function comprobar(nombre: string, condicion: unknown): void {
  assert.ok(condicion, nombre)
  totalPruebas += 1
  console.log(`✅ ${nombre}`)
}

function comprobarIgual<T>(nombre: string, actual: T, esperado: T): void {
  assert.equal(actual, esperado, nombre)
  totalPruebas += 1
  console.log(`✅ ${nombre}`)
}

async function debeRechazar(
  nombre: string,
  operacion: () => Promise<unknown>,
  statusEsperado?: number
): Promise<void> {
  let error: unknown

  try {
    await operacion()
  } catch (capturado) {
    error = capturado
  }

  assert.ok(error, `${nombre}: se esperaba un rechazo`)

  if (statusEsperado !== undefined) {
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? error.statusCode
        : undefined

    assert.equal(status, statusEsperado, `${nombre}: estado inesperado`)
  }

  totalPruebas += 1
  console.log(`✅ ${nombre}`)
}

function extraerToken(urlConfirmacion: string): string {
  const token = new URL(urlConfirmacion).pathname.split('/').filter(Boolean).at(-1)
  assert.ok(token, 'La URL de confirmación debe contener el token')

  return token
}

async function crearPedidoDePrueba(): Promise<{
  pedidoId: Types.ObjectId
  usuarioId: Types.ObjectId
  mesaId: Types.ObjectId
}> {
  contadorDatos += 1
  const identificador = `${sufijo}-${contadorDatos}`
  const ahora = new Date()

  const usuario = await Usuario.create({
    nombre: 'QA',
    apellido: 'Cajero de prueba',
    // CI ficticia numérica y única dentro de esta ejecución de pruebas.
    ci: String(900000000 + contadorDatos),
    email: `qa-pago-${identificador}@example.invalid`,
    password: 'SOLO_PARA_PRUEBAS',
    rol: 'Mesero',
    estado: true,
    verificado: true
  })

  const mesa = await Mesa.create({
    numero: `QAP-${identificador}`,
    capacidad: 4,
    ubicacion: 'Pruebas financieras',
    estado: 'Ocupada'
  })

  const pedido = await Pedido.create({
    codigo: `QA-PAGO-${identificador}`,
    fechaDiaBolivia: ahora.toISOString().slice(0, 10),
    fechaHoraBolivia: ahora.toISOString(),
    fechaHora: ahora,
    estado: 'ENTREGADO',
    total: 55,
    subtotalCierre: 55,
    montoPropina: 0,
    mesa: mesa._id,
    usuario: usuario._id,
    detalles: []
  })

  return {
    pedidoId: pedido._id as Types.ObjectId,
    usuarioId: usuario._id as Types.ObjectId,
    mesaId: mesa._id as Types.ObjectId
  }
}

class PagoRepositoryQueFallaAlCrear extends PagoRepository {
  override async crear(
    ..._args: Parameters<PagoRepository['crear']>
  ): ReturnType<PagoRepository['crear']> {
    throw new Error('Fallo intencional de la prueba al crear el pago')
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI

  if (!uri) {
    throw new Error('Falta MONGO_URI en el entorno.')
  }

  const urlAnterior = process.env.QR_CONFIRMATION_BASE_URL
  process.env.QR_CONFIRMATION_BASE_URL = 'http://localhost:3000'

  try {
    await mongoose.connect(uri, {
      dbName: basePruebas,
      serverSelectionTimeoutMS: 15000
    })
    conectado = true

    comprobarIgual(
      'La conexión utiliza una base financiera aislada',
      mongoose.connection.db?.databaseName,
      basePruebas
    )

    const hello = await mongoose.connection.db!.admin().command({ hello: 1 })
    comprobar(
      'MongoDB admite transacciones mediante replica set o mongos',
      Boolean(hello.setName || hello.msg === 'isdbgrid')
    )

    // Se inicializan los índices antes de probar las restricciones únicas.
    await Promise.all([
      Usuario.init(),
      Mesa.init(),
      Pedido.init(),
      Pago.init(),
      QrPagoToken.init()
    ])

    const indexes = await Pago.collection.indexes()
    comprobar(
      'MongoDB tiene un índice único por pedido en la colección de pagos',
      indexes.some(
        (index) =>
          index.unique === true &&
          Object.keys(index.key).length === 1 &&
          index.key.pedido === 1
      )
    )

    // 1. Generación y consulta no consumen el token.
    const pedido1 = await crearPedidoDePrueba()
    const cajeroPrueba = await Usuario.create({
      nombre: 'QA',
      apellido: 'Cajero QR',
      ci: String(910000000 + contadorDatos),
      email: `qa-pago-cajero-${sufijo}@example.invalid`,
      password: 'SOLO_PARA_PRUEBAS',
      rol: 'Cajero',
      estado: true,
      verificado: true
    })
    const qr1 = await pagoService.generarPagoQR(
      pedido1.pedidoId.toString(),
      cajeroPrueba._id.toString()
    )
    const token1 = extraerToken(qr1.urlConfirmacion)

    comprobar(
      'El QR genera un token aleatorio de 256 bits',
      /^[A-Za-z0-9_-]{43}$/.test(token1)
    )
    comprobarIgual('El total del QR coincide con el pedido', qr1.total, 55)

    const data1 = qr1.urlConfirmacion
    comprobarIgual(
      'El QR apunta a la página de confirmación móvil',
      new URL(data1).pathname,
      `/confirmar-pago-qr/${token1}`
    )

    const registro1 = await QrPagoToken.findOne({ pedido: pedido1.pedidoId }).select('+tokenHash')
    assert.ok(registro1)
    comprobarIgual(
      'El token QR queda asociado al cajero que lo generó',
      String(registro1.cajeroId),
      String(cajeroPrueba._id)
    )

    comprobar(
      'La base de datos conserva únicamente el hash del token',
      registro1.tokenHash === createHash('sha256').update(token1).digest('hex')
    )
    comprobar(
      'El token vence aproximadamente a los diez minutos',
      registro1.expiraEn.getTime() > Date.now() + 9 * 60 * 1000 &&
      registro1.expiraEn.getTime() <= Date.now() + 10 * 60 * 1000
    )

    const estadoInicial = await pagoService.consultarEstadoPagoQR(token1)
    comprobarIgual('Consultar el QR no lo consume', estadoInicial.estado, 'DISPONIBLE')
    comprobarIgual(
      'Consultar el QR no crea un pago',
      await Pago.countDocuments({ pedido: pedido1.pedidoId }),
      0
    )

    // 1.5. Validación de datos del cliente antes de consumir el QR.
    await debeRechazar(
      'El pago QR exige apellidos',
      () => pagoService.confirmarPagoQR(token1, {
        clienteNombre: 'Ana',
        clienteApellido: '',
        clienteCI: '12345678'
      }),
      400
    )

    await debeRechazar(
      'El pago QR exige CI o NIT',
      () => pagoService.confirmarPagoQR(token1, {
        clienteNombre: 'Ana',
        clienteApellido: 'Pérez'
      }),
      400
    )

    await debeRechazar(
      'La CI rechaza menos de cinco dígitos',
      () => pagoService.confirmarPagoQR(token1, {
        clienteNombre: 'Ana',
        clienteApellido: 'Pérez',
        clienteCI: '1234'
      }),
      400
    )

    await debeRechazar(
      'La CI rechaza más de doce dígitos',
      () => pagoService.confirmarPagoQR(token1, {
        clienteNombre: 'Ana',
        clienteApellido: 'Pérez',
        clienteCI: '1234567890123'
      }),
      400
    )

    await debeRechazar(
      'El NIT rechaza letras',
      () => pagoService.confirmarPagoQR(token1, {
        clienteNombre: 'Ana',
        clienteApellido: 'Pérez',
        clienteNIT: 'ABC12345'
      }),
      400
    )

    await debeRechazar(
      'La extensión CI requiere una CI registrada',
      () => pagoService.confirmarPagoQR(token1, {
        clienteNombre: 'Ana',
        clienteApellido: 'Pérez',
        clienteExtensionCI: 'CB',
        clienteNIT: '12345678'
      }),
      400
    )

    await debeRechazar(
      'Los nombres rechazan un solo carácter',
      () => pagoService.confirmarPagoQR(token1, {
        clienteNombre: 'A',
        clienteApellido: 'Pérez',
        clienteCI: '12345678'
      }),
      400
    )

    comprobarIgual(
      'Los rechazos mantienen el QR disponible',
      (await pagoService.consultarEstadoPagoQR(token1)).estado,
      'DISPONIBLE'
    )
    comprobarIgual(
      'Los rechazos no consumen el token QR',
      (await QrPagoToken.findOne({ pedido: pedido1.pedidoId }))?.consumidoEn ?? null,
      null
    )
    comprobarIgual(
      'Los rechazos no cierran el pedido QR',
      (await Pedido.findById(pedido1.pedidoId))?.estado,
      'ENTREGADO'
    )
    comprobarIgual(
      'Los rechazos no crean pagos',
      await Pago.countDocuments({ pedido: pedido1.pedidoId }),
      0
    )

    // 1.6. Validación y registro del pago con tarjeta.
    const pedidoTarjeta = await crearPedidoDePrueba()

    await debeRechazar(
      'El pago con tarjeta exige nombres y apellidos',
      () => pagoService.procesarPagoFinal({
        pedidoId: pedidoTarjeta.pedidoId.toString(),
        metodoPago: 'Tarjeta',
        clienteNombre: 'Ana',
        clienteApellido: '',
        clienteCI: '12345678'
      }),
      400
    )

    comprobarIgual(
      'El rechazo de tarjeta mantiene abierto el pedido',
      (await Pedido.findById(pedidoTarjeta.pedidoId))?.estado,
      'ENTREGADO'
    )
    comprobarIgual(
      'El rechazo de tarjeta no crea un pago',
      await Pago.countDocuments({ pedido: pedidoTarjeta.pedidoId }),
      0
    )

    const resultadoTarjeta = await pagoService.procesarPagoFinal({
      pedidoId: pedidoTarjeta.pedidoId.toString(),
      metodoPago: 'Tarjeta',
      clienteNombre: 'Ana',
      clienteApellido: 'Pérez',
      clienteCI: '12345678',
      clienteExtensionCI: 'CB'
    })

    comprobarIgual(
      'La tarjeta válida registra el pago',
      resultadoTarjeta.nuevoPago.estadoPago,
      'Pagado'
    )
    comprobarIgual(
      'El apellido se guarda en el pago',
      resultadoTarjeta.nuevoPago.apellidoCliente,
      'Pérez'
    )
    comprobarIgual(
      'La extensión CI se guarda en el pago',
      resultadoTarjeta.nuevoPago.extensionCI,
      'CB'
    )

    // 2. Confirmación exitosa y reutilización.
    const resultado1 = await pagoService.confirmarPagoQR(token1, {
      clienteNombre: 'Ana',
      clienteApellido: 'Pérez',
      clienteCI: '12345678',
      clienteExtensionCI: 'CB'
    })
    comprobarIgual('La primera confirmación registra el pago QR', resultado1.nuevoPago.estadoPago, 'Pagado')
    comprobarIgual(
      'El pago confirmado queda asociado al cajero del QR',
      String(resultado1.nuevoPago.cajero),
      String(cajeroPrueba._id)
    )
    comprobarIgual('El pedido queda cerrado', (await Pedido.findById(pedido1.pedidoId))?.estado, 'CERRADO')
    comprobarIgual(
      'Se registra exactamente un pago',
      await Pago.countDocuments({ pedido: pedido1.pedidoId }),
      1
    )

    const estadoConsumido = await pagoService.consultarEstadoPagoQR(token1)
    comprobarIgual('El QR confirmado aparece como utilizado', estadoConsumido.estado, 'UTILIZADO')

    await debeRechazar(
      'No se puede volver a confirmar un QR consumido',
      () => pagoService.confirmarPagoQR(token1),
      409
    )

    comprobarIgual(
      'Reintentar la confirmación no duplica el pago',
      await Pago.countDocuments({ pedido: pedido1.pedidoId }),
      1
    )

    // 3. La renovación invalida el token anterior.
    const pedido2 = await crearPedidoDePrueba()
    const qrAnterior = await pagoService.generarPagoQR(pedido2.pedidoId.toString())
    const tokenAnterior = extraerToken(qrAnterior.urlConfirmacion)
    const qrNuevo = await pagoService.generarPagoQR(pedido2.pedidoId.toString())
    const tokenNuevo = extraerToken(qrNuevo.urlConfirmacion)

    comprobar('Cada generación produce un token distinto', tokenAnterior !== tokenNuevo)

    await debeRechazar(
      'El token reemplazado deja de ser válido',
      () => pagoService.consultarEstadoPagoQR(tokenAnterior),
      404
    )

    comprobarIgual(
      'El token nuevo queda disponible',
      (await pagoService.consultarEstadoPagoQR(tokenNuevo)).estado,
      'DISPONIBLE'
    )

    // 4. Un QR expirado no permite confirmar el pago.
    const pedido3 = await crearPedidoDePrueba()
    const qr3 = await pagoService.generarPagoQR(pedido3.pedidoId.toString())
    const token3 = extraerToken(qr3.urlConfirmacion)

    await QrPagoToken.updateOne(
      { pedido: pedido3.pedidoId },
      { $set: { expiraEn: new Date(Date.now() - 1000) } }
    )

    comprobarIgual(
      'Un QR vencido se identifica como expirado',
      (await pagoService.consultarEstadoPagoQR(token3)).estado,
      'EXPIRADO'
    )

    await debeRechazar(
      'Un QR vencido no se puede confirmar',
      () => pagoService.confirmarPagoQR(token3),
      410
    )

    comprobarIgual(
      'Un QR vencido no crea un pago',
      await Pago.countDocuments({ pedido: pedido3.pedidoId }),
      0
    )

    // 5. Un fallo al persistir el pago revierte también el consumo del token.
    const pedido4 = await crearPedidoDePrueba()
    const servicioConFallo = new PagoService(
      new PagoRepositoryQueFallaAlCrear(),
      pedidoRepository,
      mesaRepository,
      qrPagoTokenRepository
    )

    const qr4 = await servicioConFallo.generarPagoQR(pedido4.pedidoId.toString())
    const token4 = extraerToken(qr4.urlConfirmacion)

    let falloEsperado: unknown
    try {
      await servicioConFallo.confirmarPagoQR(token4, {
        clienteNombre: 'Ana',
        clienteApellido: 'Pérez',
        clienteCI: '12345678',
        clienteExtensionCI: 'CB'
      })
    } catch (error) {
      falloEsperado = error
    }

    comprobar('El fallo intencional de creación de pago se propaga', falloEsperado instanceof Error)
    comprobarIgual(
      'El token sigue sin consumirse después del fallo transaccional',
      (await QrPagoToken.findOne({ pedido: pedido4.pedidoId }))?.consumidoEn ?? null,
      null
    )
    comprobarIgual(
      'El pedido no queda cerrado después del fallo',
      (await Pedido.findById(pedido4.pedidoId))?.estado,
      'ENTREGADO'
    )
    comprobarIgual(
      'El fallo no deja un pago persistido',
      await Pago.countDocuments({ pedido: pedido4.pedidoId }),
      0
    )

    // 6. Dos confirmaciones concurrentes no deben crear dos pagos.
    const pedido5 = await crearPedidoDePrueba()
    const qr5 = await pagoService.generarPagoQR(pedido5.pedidoId.toString())
    const token5 = extraerToken(qr5.urlConfirmacion)

    const concurrentes = await Promise.allSettled([
      pagoService.confirmarPagoQR(token5, {
        clienteNombre: 'Ana',
        clienteApellido: 'Pérez',
        clienteCI: '12345678',
        clienteExtensionCI: 'CB'
      }),
      pagoService.confirmarPagoQR(token5, {
        clienteNombre: 'Ana',
        clienteApellido: 'Pérez',
        clienteCI: '12345678',
        clienteExtensionCI: 'CB'
      })
    ])

    comprobarIgual(
      'De dos confirmaciones simultáneas, exactamente una tiene éxito',
      concurrentes.filter((resultado) => resultado.status === 'fulfilled').length,
      1
    )
    comprobarIgual(
      'Las confirmaciones simultáneas dejan un único pago',
      await Pago.countDocuments({ pedido: pedido5.pedidoId }),
      1
    )
    comprobarIgual(
      'El QR concurrente queda consumido',
      (await QrPagoToken.findOne({ pedido: pedido5.pedidoId }))?.consumidoEn !== null,
      true
    )

    // 7. El índice único rechaza un segundo Pago directo para el mismo pedido.
    const pagoOriginal = await Pago.findOne({ pedido: pedido1.pedidoId }).lean()
    assert.ok(pagoOriginal)

    let errorDuplicado: unknown
    try {
      await Pago.create({
        codigoPago: `PAG-DUP-${sufijo}`,
        codigoPedido: pagoOriginal.codigoPedido,
        pedido: pedido1.pedidoId,
        mesa: pedido1.mesaId,
        mesero: pedido1.usuarioId,
        nombreCliente: 'QA',
        ci: '',
        nit: '',
        subtotal: 55,
        propina: 0,
        totalFinal: 55,
        metodoPago: 'QR',
        estadoPago: 'Pagado',
        fechaEnvioCaja: new Date(),
        fechaPago: new Date()
      })
    } catch (error) {
      errorDuplicado = error
    }

    comprobar(
      'El índice único impide insertar un segundo pago para el mismo pedido',
      typeof errorDuplicado === 'object' &&
      errorDuplicado !== null &&
      'code' in errorDuplicado &&
      errorDuplicado.code === 11000 &&
      'keyPattern' in errorDuplicado &&
      typeof errorDuplicado.keyPattern === 'object' &&
      errorDuplicado.keyPattern !== null &&
      'pedido' in errorDuplicado.keyPattern &&
      errorDuplicado.keyPattern.pedido === 1
    )
    comprobarIgual(
      'La cantidad de pagos del primer pedido permanece en uno',
      await Pago.countDocuments({ pedido: pedido1.pedidoId }),
      1
    )

    // 8. El total mostrado por el QR debe coincidir con el cobro con propina.
    const pedidoConPropina = await crearPedidoDePrueba()
    const documentoConPropina = await Pedido.findById(
      pedidoConPropina.pedidoId
    )

    assert.ok(documentoConPropina, 'Debe existir el pedido de prueba con propina')

    documentoConPropina.subtotalCierre = 55
    documentoConPropina.montoPropina = 7.5
    documentoConPropina.total = 62.5
    await documentoConPropina.save()

    const qrConPropina = await pagoService.generarPagoQR(
      pedidoConPropina.pedidoId.toString()
    )
    const tokenConPropina = extraerToken(qrConPropina.urlConfirmacion)

    comprobarIgual(
      'El QR expone el total de 62.50 Bs con propina',
      qrConPropina.total,
      62.5
    )

    const estadoQRConPropina =
      await pagoService.consultarEstadoPagoQR(tokenConPropina)

    comprobarIgual(
      'La consulta móvil muestra el total correcto antes de confirmar',
      estadoQRConPropina.total,
      62.5
    )

    const resultadoConPropina = await pagoService.confirmarPagoQR(
      tokenConPropina,
      {
        clienteNombre: 'Ana',
        clienteApellido: 'Pérez',
        clienteCI: '12345678',
        clienteExtensionCI: 'CB'
      }
    )

    comprobarIgual(
      'El subtotal registrado en el pago es 55 Bs',
      resultadoConPropina.nuevoPago.subtotal,
      55
    )
    comprobarIgual(
      'El pago conserva la propina de 7.50 Bs',
      resultadoConPropina.nuevoPago.propina,
      7.5
    )
    comprobarIgual(
      'El total del pago coincide con el total expuesto por el QR',
      resultadoConPropina.nuevoPago.totalFinal,
      qrConPropina.total
    )
    comprobarIgual(
      'El comprobante muestra el mismo total que el QR',
      resultadoConPropina.comprobante.total,
      qrConPropina.total
    )

    const pedidoPersistidoConPropina = await Pedido.findById(
      pedidoConPropina.pedidoId
    )

    comprobarIgual(
      'El pedido persistido conserva el total cobrado de 62.50 Bs',
      pedidoPersistidoConPropina?.total,
      62.5
    )
    comprobarIgual(
      'El pedido persistido conserva la propina de 7.50 Bs',
      pedidoPersistidoConPropina?.montoPropina,
      7.5
    )

    console.log('')
    console.log(`🎉 TODAS LAS COMPROBACIONES PASARON: ${totalPruebas}`)
  } finally {
    if (conectado && mongoose.connection.readyState === 1) {
      const nombreReal = mongoose.connection.db?.databaseName

      if (nombreReal === basePruebas && basePruebas.startsWith(PREFIJO_DB)) {
        try {
          await mongoose.connection.dropDatabase()
          console.log(`🧹 Base temporal eliminada: ${basePruebas}`)
        } catch (error) {
          console.error('⚠️ No se pudo eliminar la base temporal.', error)
          process.exitCode = 1
        }
      } else {
        console.error('⚠️ Protección activada: no se eliminó una base inesperada.')
        process.exitCode = 1
      }

      await mongoose.disconnect()
    }

    if (urlAnterior === undefined) {
      delete process.env.QR_CONFIRMATION_BASE_URL
    } else {
      process.env.QR_CONFIRMATION_BASE_URL = urlAnterior
    }
  }
}

main().catch((error: unknown) => {
  console.error('')
  console.error('❌ FALLÓ LA BATERÍA DE PAGOS Y QR')
  console.error(error)
  process.exitCode = 1
})
