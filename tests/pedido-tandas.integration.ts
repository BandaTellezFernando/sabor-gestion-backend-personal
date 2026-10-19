import 'dotenv/config'
import { strict as assert } from 'node:assert'
import mongoose, { Types } from 'mongoose'

import Mesa from '../src/models/Mesa'
import '../src/models/Ubicacion'
import Usuario from '../src/models/Usuario'
import Ingrediente from '../src/models/Ingrediente'
import Categoria from '../src/models/Categoria'
import Plato from '../src/models/Plato'
import Receta from '../src/models/Receta'
import Pedido from '../src/models/Pedido'
import MovimientoInventario from '../src/models/MovimientoInventario'

import { pedidoService } from '../src/services/pedido.service'
import {
  ESTADOS_PEDIDO,
  ESTADOS_TANDA_COCINA
} from '../src/utils/constants'
import { UNIDADES_MEDIDA } from '../src/utils/unidades'

const PREFIJO_DB = 'qa_pt_'
const sufijo = `${Date.now().toString(36)}_${process.pid.toString(36)}`
const basePruebas = `${PREFIJO_DB}_${sufijo}`

let totalPruebas = 0
let conectado = false

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
  statusEsperado?: number
): Promise<void> {
  let error: unknown

  try {
    await operacion()
  } catch (capturado) {
    error = capturado
  }

  assert.ok(error, `${nombre}: la operación debía ser rechazada`)

  if (statusEsperado !== undefined) {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error
        ? error.statusCode
        : undefined

    assert.equal(
      status,
      statusEsperado,
      `${nombre}: código de error inesperado`
    )
  }

  totalPruebas += 1
  console.log(`✅ ${nombre}`)
}

async function obtenerStock(id: Types.ObjectId): Promise<number> {
  const ingrediente = await Ingrediente.findById(id)
  assert.ok(ingrediente, `No existe el ingrediente ${id.toString()}`)
  return ingrediente.stockActual
}

async function obtenerEstadoTanda(
  pedidoId: string,
  tandaId: string
): Promise<string> {
  const pedido = await Pedido.findById(pedidoId)
  assert.ok(pedido, `No existe el pedido ${pedidoId}`)

  const tanda = pedido.tandas?.find(
    (item) => item._id?.toString() === tandaId
  )

  assert.ok(tanda, `No existe la tanda ${tandaId}`)
  return tanda.estado
}

async function obtenerIdPrimeraTanda(
  pedidoId: string
): Promise<string> {
  const pedido = await Pedido.findById(pedidoId)
  assert.ok(pedido, `No existe el pedido ${pedidoId}`)

  const tanda = pedido.tandas?.[0]
  assert.ok(tanda?._id, 'El pedido debería tener una primera tanda')

  return tanda._id.toString()
}

async function crearCuentaPrueba(
  mesaId: Types.ObjectId,
  usuarioId: Types.ObjectId,
  platoId: Types.ObjectId,
  cantidad: number
): Promise<string> {
  const resultado = await pedidoService.crearPedido(
    {
      mesa: mesaId,
      usuario: usuarioId,
      detalles: [
        {
          plato: platoId,
          cantidad,
          observacion: ''
        }
      ]
    },
    usuarioId.toString()
  )

  return resultado.nuevoPedido._id.toString()
}

async function agregarTanda(
  pedidoId: string,
  usuarioId: Types.ObjectId,
  platoId: Types.ObjectId,
  cantidad = 1
): Promise<string> {
  const resultado = await pedidoService.crearTandaPedido(
    pedidoId,
    {
      detalles: [
        {
          plato: platoId,
          cantidad,
          observacion: ''
        }
      ]
    },
    usuarioId.toString(),
    'Mesero'
  )

  return resultado.tanda.id
}

async function enviarTanda(
  pedidoId: string,
  tandaId: string,
  usuarioId: Types.ObjectId
): Promise<unknown> {
  return pedidoService.enviarTandaCocina(
    pedidoId,
    tandaId,
    usuarioId.toString(),
    'Mesero'
  )
}

async function cambiarEstadoTanda(
  pedidoId: string,
  tandaId: string,
  estado: string,
  cocineroId: Types.ObjectId
): Promise<unknown> {
  return pedidoService.actualizarEstadoTandaCocina(
    pedidoId,
    tandaId,
    estado,
    cocineroId.toString(),
    'Cocinero'
  )
}

async function entregarTanda(
  pedidoId: string,
  tandaId: string,
  meseroId: Types.ObjectId
): Promise<unknown> {
  return pedidoService.marcarTandaEntregada(
    pedidoId,
    tandaId,
    meseroId.toString(),
    'Mesero'
  )
}

async function cancelarTanda(
  pedidoId: string,
  tandaId: string,
  usuarioId: Types.ObjectId
): Promise<unknown> {
  return pedidoService.cancelarTandaPedido(
    pedidoId,
    tandaId,
    usuarioId.toString(),
    'Mesero',
    'Cancelación de prueba de integración'
  )
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI

  if (!uri) {
    throw new Error('Falta MONGO_URI en el entorno.')
  }

  const unidadPrueba = UNIDADES_MEDIDA[0]
  assert.ok(unidadPrueba, 'No hay unidades de medida configuradas.')

  try {
    // dbName fuerza la conexión a una base nueva, sin cambiar MONGO_URI.
    await mongoose.connect(uri, {
      dbName: basePruebas,
      serverSelectionTimeoutMS: 15000
    })
    conectado = true

    comprobarIgual(
      'La conexión usa una base de pruebas aislada',
      mongoose.connection.db?.databaseName,
      basePruebas
    )

    // Asegura la creación de índices, incluido el índice único por tanda.
    await Promise.all([
      Mesa.init(),
      Usuario.init(),
      Ingrediente.init(),
      Categoria.init(),
      Plato.init(),
      Receta.init(),
      Pedido.init(),
      MovimientoInventario.init()
    ])

    const mesero = await Usuario.create({
      nombre: 'QA',
      apellido: 'Mesero',
      ci: '990000021',
      email: `qa-${sufijo}-mesero@example.invalid`,
      password: 'CONTRASENA_SOLO_PARA_PRUEBAS',
      rol: 'Mesero',
      estado: true,
      verificado: true
    })

    const otroMesero = await Usuario.create({
      nombre: 'QA',
      apellido: 'No autorizado',
      ci: '990000022',
      email: `qa-${sufijo}-otro@example.invalid`,
      password: 'CONTRASENA_SOLO_PARA_PRUEBAS',
      rol: 'Mesero',
      estado: true,
      verificado: true
    })

    const cocinero = await Usuario.create({
      nombre: 'QA',
      apellido: 'Cocinero',
      ci: '990000023',
      email: `qa-${sufijo}-cocinero@example.invalid`,
      password: 'CONTRASENA_SOLO_PARA_PRUEBAS',
      rol: 'Cocinero',
      estado: true,
      verificado: true
    })

    // Se crea un cajero para que el escenario de solicitud de cuenta
    // tenga disponibles usuarios de todos los roles operativos.
    await Usuario.create({
      nombre: 'QA',
      apellido: 'Cajero',
      ci: '990000024',
      email: `qa-${sufijo}-cajero@example.invalid`,
      password: 'CONTRASENA_SOLO_PARA_PRUEBAS',
      rol: 'Cajero',
      estado: true,
      verificado: true
    })

    const categoria = await Categoria.create({
      nombre: `QA categoría ${sufijo}`
    })

    const mesa = await Mesa.create({
      numero: `QA-${sufijo}`,
      capacidad: 4,
      ubicacion: 'Pruebas de integración',
      estado: 'Libre'
    })

    const mesaSinReceta = await Mesa.create({
      numero: `QA-NR-${sufijo}`,
      capacidad: 4,
      ubicacion: 'Pruebas de integración',
      estado: 'Libre'
    })

    const ingredienteA = await Ingrediente.create({
      nombre: `QA ingrediente A ${sufijo}`,
      unidadMedida: unidadPrueba,
      disponible: true,
      stockActual: 100
    })

    const ingredienteB = await Ingrediente.create({
      nombre: `QA ingrediente B ${sufijo}`,
      unidadMedida: unidadPrueba,
      disponible: true,
      stockActual: 100
    })

    const plato = await Plato.create({
      nombre: `QA plato con receta ${sufijo}`,
      descripcion: 'Plato exclusivo para pruebas automáticas.',
      precio: 10,
      disponible: true,
      categoria: categoria._id
    })

    await Receta.create({
      plato: plato._id,
      ingredientes: [
        {
          ingrediente: ingredienteA._id,
          cantidadNecesaria: 1,
          unidadMedida: unidadPrueba
        },
        {
          ingrediente: ingredienteB._id,
          cantidadNecesaria: 1,
          unidadMedida: unidadPrueba
        }
      ]
    })

    const platoSinReceta = await Plato.create({
      nombre: `QA plato sin receta ${sufijo}`,
      descripcion: 'Plato para verificar un error de configuración.',
      precio: 12,
      disponible: true,
      categoria: categoria._id
    })

    const stockInicialA = await obtenerStock(ingredienteA._id)
    const stockInicialB = await obtenerStock(ingredienteB._id)
    const ownerId = mesero._id
    const cookId = cocinero._id
    const dishId = plato._id

    // ---------------------------------------------------------------
    // 1. Cuenta con varias tandas: creación no descuenta inventario.
    // ---------------------------------------------------------------
    const pedidoId = await crearCuentaPrueba(
      mesa._id,
      ownerId,
      dishId,
      2
    )
    const tanda1 = await obtenerIdPrimeraTanda(pedidoId)
    const tanda2 = await agregarTanda(pedidoId, ownerId, dishId)
    const tanda3 = await agregarTanda(pedidoId, ownerId, dishId)
    const tanda4 = await agregarTanda(pedidoId, ownerId, dishId)

    comprobarIgual(
      'Crear varias tandas no descuenta el ingrediente A',
      await obtenerStock(ingredienteA._id),
      stockInicialA
    )
    comprobarIgual(
      'Crear varias tandas no descuenta el ingrediente B',
      await obtenerStock(ingredienteB._id),
      stockInicialB
    )

    for (const tandaId of [tanda1, tanda2, tanda3, tanda4]) {
      comprobarIgual(
        `La tanda ${tandaId} comienza en BORRADOR`,
        await obtenerEstadoTanda(pedidoId, tandaId),
        ESTADOS_TANDA_COCINA.BORRADOR
      )
    }

    comprobarIgual(
      'La cuenta no se solicita mientras existen tandas en BORRADOR',
      await pedidoService
        .solicitarCuentaPedido(
          pedidoId,
          ownerId.toString(),
          'Mesero'
        )
        .then(() => 'PERMITIDA')
        .catch(() => 'RECHAZADA'),
      'RECHAZADA'
    )

    await debeRechazar(
      'Un mesero distinto no puede añadir tandas a la cuenta ajena',
      () =>
        pedidoService.crearTandaPedido(
          pedidoId,
          {
            detalles: [{
              plato: dishId,
              cantidad: 1,
              observacion: ''
            }]
          },
          otroMesero._id.toString(),
          'Mesero'
        )
    )

    comprobarIgual(
      'El intento no autorizado no agrega una quinta tanda',
      (await Pedido.findById(pedidoId))?.tandas?.length,
      4
    )

    await debeRechazar(
      'Enviar con IDs inválidos se rechaza con HTTP 400',
      () => enviarTanda('id-invalido', 'id-invalido', ownerId),
      400
    )

    await debeRechazar(
      'Enviar sin usuario autenticado se rechaza con HTTP 401',
      () =>
        pedidoService.enviarTandaCocina(
          pedidoId,
          tanda2,
          undefined,
          'Mesero'
        ),
      401
    )

    // Los endpoints heredados no deben alterar una cuenta con tandas.
    await debeRechazar(
      'El cambio de estado global heredado no puede saltarse las tandas',
      () =>
        pedidoService.actualizarEstadoService(
          pedidoId,
          ESTADOS_PEDIDO.ENTREGADO
        )
    )

    await debeRechazar(
      'La recogida heredada no puede reemplazar la recogida por tanda',
      () =>
        pedidoService.marcarPedidoRecogido(
          pedidoId,
          ownerId.toString(),
          'Mesero'
        )
    )

    const cancelacionAntigua = (
      pedidoService as unknown as {
        cancelarPedido?: (
          id: string,
          usuarioAuthId?: string,
          usuarioRol?: string
        ) => Promise<unknown>
      }
    ).cancelarPedido

    comprobar(
      'Existe el método heredado de cancelación para verificar su guardia',
      typeof cancelacionAntigua === 'function'
    )

    if (cancelacionAntigua) {
      await debeRechazar(
        'La cancelación heredada no puede cancelar la cuenta con tandas',
        () =>
          cancelacionAntigua.call(
            pedidoService,
            pedidoId,
            ownerId.toString(),
            'Mesero'
          )
      )
    }

    // ---------------------------------------------------------------
    // 2. Falta de ingredientes: no se permiten descuentos parciales.
    // ---------------------------------------------------------------
    await Ingrediente.updateOne(
      { _id: ingredienteB._id },
      { $set: { stockActual: 0 } }
    )

    await debeRechazar(
      'Enviar una tanda falla por falta de un ingrediente',
      () => enviarTanda(pedidoId, tanda1, ownerId)
    )

    comprobarIgual(
      'No se descuenta parcialmente el ingrediente A si falta el B',
      await obtenerStock(ingredienteA._id),
      stockInicialA
    )

    comprobarIgual(
      'El ingrediente insuficiente conserva su saldo',
      await obtenerStock(ingredienteB._id),
      0
    )

    comprobarIgual(
      'La tanda conserva BORRADOR después del fallo de inventario',
      await obtenerEstadoTanda(pedidoId, tanda1),
      ESTADOS_TANDA_COCINA.BORRADOR
    )

    comprobarIgual(
      'El fallo no crea movimientos para la tanda',
      await MovimientoInventario.countDocuments({
        tandaId: new Types.ObjectId(tanda1)
      }),
      0
    )

    await Ingrediente.updateOne(
      { _id: ingredienteB._id },
      { $set: { stockActual: stockInicialB } }
    )

    // ---------------------------------------------------------------
    // 3. Un plato sin receta tampoco puede enviarse a cocina.
    // ---------------------------------------------------------------
    const pedidoSinRecetaId = await crearCuentaPrueba(
      mesaSinReceta._id,
      ownerId,
      platoSinReceta._id,
      1
    )
    const tandaSinRecetaId = await obtenerIdPrimeraTanda(pedidoSinRecetaId)

    await debeRechazar(
      'Un plato sin receta configurada no puede enviarse a cocina',
      () =>
        enviarTanda(
          pedidoSinRecetaId,
          tandaSinRecetaId,
          ownerId
        )
    )

    comprobarIgual(
      'El plato sin receta no genera movimientos de inventario',
      await MovimientoInventario.countDocuments({
        tandaId: new Types.ObjectId(tandaSinRecetaId)
      }),
      0
    )

    comprobarIgual(
      'El fallo por receta inexistente conserva la tanda en BORRADOR',
      await obtenerEstadoTanda(pedidoSinRecetaId, tandaSinRecetaId),
      ESTADOS_TANDA_COCINA.BORRADOR
    )

    await cancelarTanda(
      pedidoSinRecetaId,
      tandaSinRecetaId,
      ownerId
    )

    comprobarIgual(
      'Cancelar la única tanda de prueba libera su mesa',
      (await Mesa.findById(mesaSinReceta._id))?.estado,
      'Libre'
    )

    // ---------------------------------------------------------------
    // 4. Envío, descuento exacto y prevención de doble descuento.
    // ---------------------------------------------------------------
    await enviarTanda(pedidoId, tanda1, ownerId)

    const stockDespuesT1A = await obtenerStock(ingredienteA._id)
    const stockDespuesT1B = await obtenerStock(ingredienteB._id)

    comprobarIgual(
      'El envío descuenta exactamente dos unidades del ingrediente A',
      stockInicialA - stockDespuesT1A,
      2
    )
    comprobarIgual(
      'El envío descuenta exactamente dos unidades del ingrediente B',
      stockInicialB - stockDespuesT1B,
      2
    )
    comprobarIgual(
      'El envío cambia la tanda a PENDIENTE',
      await obtenerEstadoTanda(pedidoId, tanda1),
      ESTADOS_TANDA_COCINA.PENDIENTE
    )
    comprobarIgual(
      'El envío crea exactamente un movimiento para la tanda',
      await MovimientoInventario.countDocuments({
        tandaId: new Types.ObjectId(tanda1)
      }),
      1
    )

    await debeRechazar(
      'Una tanda enviada no puede enviarse nuevamente',
      () => enviarTanda(pedidoId, tanda1, ownerId)
    )

    comprobarIgual(
      'Un segundo envío no descuenta stock adicional',
      await obtenerStock(ingredienteA._id),
      stockDespuesT1A
    )
    comprobarIgual(
      'Un segundo envío no duplica el movimiento',
      await MovimientoInventario.countDocuments({
        tandaId: new Types.ObjectId(tanda1)
      }),
      1
    )

    await debeRechazar(
      'No se puede saltar de PENDIENTE directamente a ENTREGADA',
      () =>
        cambiarEstadoTanda(
          pedidoId,
          tanda1,
          ESTADOS_TANDA_COCINA.ENTREGADA,
          cookId
        )
    )

    comprobarIgual(
      'Una transición inválida deja la tanda en PENDIENTE',
      await obtenerEstadoTanda(pedidoId, tanda1),
      ESTADOS_TANDA_COCINA.PENDIENTE
    )

    // ---------------------------------------------------------------
    // 5. Cancelación en estados permitidos y no permitidos.
    // ---------------------------------------------------------------
    await cambiarEstadoTanda(
      pedidoId,
      tanda1,
      ESTADOS_TANDA_COCINA.EN_PREPARACION,
      cookId
    )

    await debeRechazar(
      'No se puede cancelar una tanda EN_PREPARACION',
      () => cancelarTanda(pedidoId, tanda1, ownerId)
    )

    comprobarIgual(
      'Rechazar la cancelación durante preparación no altera el stock',
      await obtenerStock(ingredienteA._id),
      stockDespuesT1A
    )

    await cambiarEstadoTanda(
      pedidoId,
      tanda1,
      ESTADOS_TANDA_COCINA.LISTA,
      cookId
    )

    await debeRechazar(
      'No se puede cancelar una tanda LISTA',
      () => cancelarTanda(pedidoId, tanda1, ownerId)
    )

    await entregarTanda(pedidoId, tanda1, ownerId)

    await debeRechazar(
      'No se puede cancelar una tanda ENTREGADA',
      () => cancelarTanda(pedidoId, tanda1, ownerId)
    )

    await debeRechazar(
      'Una tanda entregada no puede volver a LISTA',
      () =>
        cambiarEstadoTanda(
          pedidoId,
          tanda1,
          ESTADOS_TANDA_COCINA.LISTA,
          cookId
        )
    )

    comprobarIgual(
      'La primera tanda termina en ENTREGADA',
      await obtenerEstadoTanda(pedidoId, tanda1),
      ESTADOS_TANDA_COCINA.ENTREGADA
    )

    await debeRechazar(
      'Una tanda entregada no puede entregarse dos veces',
      () => entregarTanda(pedidoId, tanda1, ownerId)
    )

    // Cancelar en BORRADOR: no debe crear ni restituir movimientos.
    const stockAntesT2 = await obtenerStock(ingredienteA._id)

    await cancelarTanda(pedidoId, tanda2, ownerId)

    comprobarIgual(
      'Se permite cancelar una tanda en BORRADOR',
      await obtenerEstadoTanda(pedidoId, tanda2),
      ESTADOS_TANDA_COCINA.CANCELADA
    )
    comprobarIgual(
      'Cancelar en BORRADOR no modifica el inventario',
      await obtenerStock(ingredienteA._id),
      stockAntesT2
    )
    comprobarIgual(
      'Cancelar en BORRADOR no crea movimiento',
      await MovimientoInventario.countDocuments({
        tandaId: new Types.ObjectId(tanda2)
      }),
      0
    )

    await debeRechazar(
      'No se puede volver a cancelar una tanda cancelada',
      () => cancelarTanda(pedidoId, tanda2, ownerId)
    )

    await debeRechazar(
      'Una tanda cancelada no se puede enviar después',
      () => enviarTanda(pedidoId, tanda2, ownerId)
    )

    // Cancelar en PENDIENTE: debe restituir la cantidad exacta.
    const stockAntesT3A = await obtenerStock(ingredienteA._id)
    const stockAntesT3B = await obtenerStock(ingredienteB._id)

    await enviarTanda(pedidoId, tanda3, ownerId)

    comprobarIgual(
      'Enviar la tercera tanda descuenta una unidad',
      stockAntesT3A - (await obtenerStock(ingredienteA._id)),
      1
    )

    await cancelarTanda(pedidoId, tanda3, ownerId)

    comprobarIgual(
      'Se permite cancelar una tanda PENDIENTE',
      await obtenerEstadoTanda(pedidoId, tanda3),
      ESTADOS_TANDA_COCINA.CANCELADA
    )
    comprobarIgual(
      'Cancelar PENDIENTE restituye el ingrediente A',
      await obtenerStock(ingredienteA._id),
      stockAntesT3A
    )
    comprobarIgual(
      'Cancelar PENDIENTE restituye el ingrediente B',
      await obtenerStock(ingredienteB._id),
      stockAntesT3B
    )

    const movimientoT3 = await MovimientoInventario.findOne({
      tandaId: new Types.ObjectId(tanda3)
    })

    comprobar(
      'La restitución queda registrada en el movimiento',
      movimientoT3?.stockRestituido === true
    )

    await debeRechazar(
      'No se puede restituir dos veces una tanda cancelada',
      () => cancelarTanda(pedidoId, tanda3, ownerId)
    )

    comprobarIgual(
      'Repetir cancelación no vuelve a sumar stock',
      await obtenerStock(ingredienteA._id),
      stockAntesT3A
    )

    // ---------------------------------------------------------------
    // 6. Concurrencia: dos envíos simultáneos de la misma tanda.
    // ---------------------------------------------------------------
    const antesConcurrenteA = await obtenerStock(ingredienteA._id)
    const antesConcurrenteB = await obtenerStock(ingredienteB._id)

    const envios = await Promise.allSettled([
      enviarTanda(pedidoId, tanda4, ownerId),
      enviarTanda(pedidoId, tanda4, ownerId)
    ])

    comprobarIgual(
      'De dos envíos concurrentes, exactamente uno tiene éxito',
      envios.filter((resultado) => resultado.status === 'fulfilled').length,
      1
    )

    comprobarIgual(
      'El envío concurrente descuenta una sola vez el ingrediente A',
      antesConcurrenteA - (await obtenerStock(ingredienteA._id)),
      1
    )

    comprobarIgual(
      'El envío concurrente descuenta una sola vez el ingrediente B',
      antesConcurrenteB - (await obtenerStock(ingredienteB._id)),
      1
    )

    comprobarIgual(
      'El envío concurrente deja un único movimiento',
      await MovimientoInventario.countDocuments({
        tandaId: new Types.ObjectId(tanda4)
      }),
      1
    )

    comprobarIgual(
      'La tanda concurrente queda en PENDIENTE',
      await obtenerEstadoTanda(pedidoId, tanda4),
      ESTADOS_TANDA_COCINA.PENDIENTE
    )

    // La cuenta debe seguir bloqueada mientras quede esta tanda pendiente.
    await debeRechazar(
      'La cuenta se rechaza mientras queda una tanda PENDIENTE',
      () =>
        pedidoService.solicitarCuentaPedido(
          pedidoId,
          ownerId.toString(),
          'Mesero'
        )
    )

    await cambiarEstadoTanda(
      pedidoId,
      tanda4,
      ESTADOS_TANDA_COCINA.EN_PREPARACION,
      cookId
    )
    await cambiarEstadoTanda(
      pedidoId,
      tanda4,
      ESTADOS_TANDA_COCINA.LISTA,
      cookId
    )
    await entregarTanda(pedidoId, tanda4, ownerId)

    comprobarIgual(
      'La cuarta tanda completa el ciclo hasta ENTREGADA',
      await obtenerEstadoTanda(pedidoId, tanda4),
      ESTADOS_TANDA_COCINA.ENTREGADA
    )

    // ---------------------------------------------------------------
    // 7. Solicitud de cuenta solo con tandas terminales.
    // ---------------------------------------------------------------
    await pedidoService.solicitarCuentaPedido(
      pedidoId,
      ownerId.toString(),
      'Mesero'
    )

    comprobarIgual(
      'La solicitud de cuenta cambia el estado de la mesa',
      (await Mesa.findById(mesa._id))?.estado,
      'Cuenta Solicitada'
    )

    const pedidoConCuenta = await Pedido.findById(pedidoId)
    comprobar(
      'El pedido queda marcado con la cuenta solicitada',
      String(pedidoConCuenta?.estadoCuenta ?? '')
        .toUpperCase()
        .includes('SOLICITADA')
    )

    await debeRechazar(
      'No se permite crear una tanda después de solicitar la cuenta',
      () =>
        pedidoService.crearTandaPedido(
          pedidoId,
          {
            detalles: [{
              plato: dishId,
              cantidad: 1,
              observacion: ''
            }]
          },
          ownerId.toString(),
          'Mesero'
        )
    )

    comprobarIgual(
      'No se ha agregado una tanda después de solicitar la cuenta',
      (await Pedido.findById(pedidoId))?.tandas?.length,
      4
    )

    // T1 y T4 se consumieron; T3 se restituyó y T2 nunca descontó.
    comprobarIgual(
      'El stock final del ingrediente A coincide con el consumo neto',
      await obtenerStock(ingredienteA._id),
      stockInicialA - 3
    )

    comprobarIgual(
      'El stock final del ingrediente B coincide con el consumo neto',
      await obtenerStock(ingredienteB._id),
      stockInicialB - 3
    )

    comprobarIgual(
      'La cuenta tiene tres movimientos: T1, T3 y T4',
      await MovimientoInventario.countDocuments({
        pedido: new Types.ObjectId(pedidoId)
      }),
      3
    )

    comprobarIgual(
      'El movimiento de T1 no está restituido',
      (await MovimientoInventario.findOne({
        tandaId: new Types.ObjectId(tanda1)
      }))?.stockRestituido,
      false
    )

    comprobarIgual(
      'El movimiento de T4 no está restituido',
      (await MovimientoInventario.findOne({
        tandaId: new Types.ObjectId(tanda4)
      }))?.stockRestituido,
      false
    )

    console.log('')
    console.log(`🎉 TODAS LAS COMPROBACIONES PASARON: ${totalPruebas}`)
    console.log('No se ejecutaron operaciones de pago.')
  } finally {
    if (conectado && mongoose.connection.readyState === 1) {
      const nombreReal = mongoose.connection.db?.databaseName

      if (nombreReal === basePruebas && basePruebas.startsWith(PREFIJO_DB)) {
        try {
          await mongoose.connection.dropDatabase()
          console.log(`🧹 Base temporal eliminada: ${basePruebas}`)
        } catch (error) {
          console.error(
            `⚠️ No se pudo eliminar la base temporal ${basePruebas}.`,
            error
          )
          process.exitCode = 1
        }
      } else {
        console.error(
          '⚠️ Protección activada: no se eliminó ninguna base inesperada.'
        )
        process.exitCode = 1
      }

      await mongoose.disconnect()
    }
  }
}

main().catch((error: unknown) => {
  console.error('')
  console.error('❌ FALLÓ LA BATERÍA DE INTEGRACIÓN')
  console.error(error)
  process.exitCode = 1
})
