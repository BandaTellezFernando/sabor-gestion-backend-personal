const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const http = require('node:http')
const path = require('node:path')

require('dotenv').config({
  path: path.resolve(__dirname, '.env'),
})

const PORT = 3000
const PREFIX = `TEST_UNIDADES_${Date.now()}`

const ingredientesIds = []
const platosIds = []
const pedidosIds = []

let db
let categoriaCreadaId = null

function request(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api${endpoint}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              data: data ? JSON.parse(data) : null,
            })
          } catch {
            resolve({ status: res.statusCode, data })
          }
        })
      },
    )

    req.on('error', reject)

    if (body !== null) req.write(JSON.stringify(body))
    req.end()
  })
}

async function comprobar(descripcion, fn) {
  fn()
  console.log(`✅ ${descripcion}`)
}

function casiIgual(obtenido, esperado, tolerancia = 0.000001) {
  assert.ok(
    Math.abs(Number(obtenido) - esperado) <= tolerancia,
    `Esperado ${esperado}; obtenido ${obtenido}`,
  )
}

function obtenerId(data, propiedad) {
  const entidad = propiedad ? data?.[propiedad] : data
  return entidad?._id || entidad?.id || null
}

function oid(id) {
  return new mongoose.Types.ObjectId(String(id))
}

async function crearIngrediente(auth, nombre, unidadMedida, stockActual) {
  const res = await request(
    'POST',
    '/inventario/ingredientes',
    { nombre, unidadMedida, stockActual },
    auth,
  )

  assert.equal(
    res.status,
    201,
    `Crear ingrediente falló: HTTP ${res.status} ${JSON.stringify(res.data)}`,
  )

  const id = obtenerId(res.data, 'ingrediente')
  assert.ok(id, 'La respuesta no contiene el ID del ingrediente')

  ingredientesIds.push(String(id))
  return String(id)
}

async function crearPlato(auth, categoria, nombre, ingrediente, cantidad, unidad) {
  const res = await request(
    'POST',
    '/platos',
    {
      nombre,
      descripcion: 'Prueba temporal de conversión de unidades',
      precio: 50,
      imagenUrl: 'https://example.com/prueba-unidades.jpg',
      imagenPublicId: `${PREFIX}_${nombre}`,
      categoria,
      ingredientes: [
        {
          ingrediente,
          cantidadNecesaria: cantidad,
          unidadMedida: unidad,
        },
      ],
    },
    auth,
  )

  return res
}

async function prepararPlato(auth, categoria, nombre, ingrediente, cantidad, unidad) {
  const res = await crearPlato(
    auth,
    categoria,
    `${PREFIX}_${nombre}`,
    ingrediente,
    cantidad,
    unidad,
  )

  assert.equal(
    res.status,
    201,
    `Crear plato falló: HTTP ${res.status} ${JSON.stringify(res.data)}`,
  )

  const id = obtenerId(res.data)
  assert.ok(id, 'La respuesta no contiene el ID del plato')
  platosIds.push(String(id))
  return String(id)
}

async function crearPedido(auth, adminId, platoId, cantidad) {
  const res = await request(
    'POST',
    '/pedidos',
    {
      tipoPedido: 'Local',
      usuario: String(adminId),
      detalles: [{ plato: platoId, cantidad }],
    },
    auth,
  )

  const id = obtenerId(res.data)
  if (res.status === 201 && id) pedidosIds.push(String(id))

  return res
}

async function stockDe(ingredienteId) {
  const doc = await db.collection('ingredientes').findOne({
    _id: oid(ingredienteId),
  })

  assert.ok(doc, `No se encuentra el ingrediente ${ingredienteId}`)
  return Number(doc.stockActual)
}

async function obtenerCategoria(auth) {
  const res = await request('GET', '/categorias', null, auth)
  assert.equal(res.status, 200, 'No se pudieron consultar las categorías')

  const lista = Array.isArray(res.data)
    ? res.data
    : res.data?.categorias

  assert.ok(Array.isArray(lista), 'Formato de categorías inesperado')

  if (lista.length > 0) {
    return String(obtenerId(lista[0]))
  }

  const nueva = await request(
    'POST',
    '/categorias',
    { nombre: 'Categoria Pruebas Unidades' },
    auth,
  )

  assert.equal(
    nueva.status,
    201,
    `No se pudo crear la categoría temporal: ${JSON.stringify(nueva.data)}`,
  )

  categoriaCreadaId = String(obtenerId(nueva.data))
  assert.ok(categoriaCreadaId, 'No se obtuvo el ID de la categoría temporal')

  return categoriaCreadaId
}

async function limpiarDatosDePrueba() {
  if (!db) return

  console.log('\n=== LIMPIEZA DE REGISTROS DE PRUEBA ===')

  // Buscar los platos creados con este prefijo, por si una respuesta HTTP
  // no llegó a registrar su ID en el script.
  const platos = await db
    .collection('platos')
    .find(
      { nombre: { $regex: `^${PREFIX}` } },
      { projection: { _id: 1 } },
    )
    .toArray()

  const todosPlatos = [
    ...new Set([
      ...platosIds,
      ...platos.map((p) => String(p._id)),
    ]),
  ]

  const platosObjectIds = todosPlatos.map(oid)

  // Localizar pedidos que contengan los platos de esta prueba.
  const pedidosPorPlato = platosObjectIds.length
    ? await db
        .collection('pedidos')
        .find(
          { 'detalles.plato': { $in: platosObjectIds } },
          { projection: { _id: 1 } },
        )
        .toArray()
    : []

  const todosPedidos = [
    ...new Set([
      ...pedidosIds,
      ...pedidosPorPlato.map((p) => String(p._id)),
    ]),
  ]

  const pedidosObjectIds = todosPedidos.map(oid)

  if (pedidosObjectIds.length) {
    await db.collection('movimientos_inventario').deleteMany({
      pedido: { $in: pedidosObjectIds },
    })
    await db.collection('pedidos').deleteMany({
      _id: { $in: pedidosObjectIds },
    })
  }

  if (platosObjectIds.length) {
    await db.collection('recetas').deleteMany({
      plato: { $in: platosObjectIds },
    })
    await db.collection('platos').deleteMany({
      _id: { $in: platosObjectIds },
    })
  }

  const ingredientesPorNombre = await db
    .collection('ingredientes')
    .find(
      { nombre: { $regex: `^${PREFIX}` } },
      { projection: { _id: 1 } },
    )
    .toArray()

  const todosIngredientes = [
    ...new Set([
      ...ingredientesIds,
      ...ingredientesPorNombre.map((i) => String(i._id)),
    ]),
  ]

  if (todosIngredientes.length) {
    await db.collection('ingredientes').deleteMany({
      _id: { $in: todosIngredientes.map(oid) },
    })
  }

  if (categoriaCreadaId) {
    await db.collection('categorias').deleteOne({
      _id: oid(categoriaCreadaId),
    })
  }

  console.log('✅ Se limpiaron únicamente los registros de esta prueba.')
  console.log('✅ La colección usuarios no se modificó.')
}

async function ejecutarPruebas() {
  if (!process.env.MONGO_URI) {
    throw new Error('No se encontró MONGO_URI en el archivo .env')
  }

  await mongoose.connect(process.env.MONGO_URI)
  db = mongoose.connection.db

  // Comprobar que el backend local responde antes de crear registros.
  const health = await request('GET', '/health')
  assert.equal(
    health.status,
    200,
    'El backend local no responde en http://127.0.0.1:3000/api/health. Ejecuta pnpm run dev en otra terminal.',
  )

  const admin = await db.collection('usuarios').findOne({
    rol: 'Administrador',
  })

  assert.ok(admin, 'No se encontró un usuario Administrador para las pruebas')

  const token = jwt.sign(
    { id: String(admin._id), rol: admin.rol },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '1h' },
  )

  const auth = { Authorization: `Bearer ${token}` }

  const categoriaId = await obtenerCategoria(auth)

  console.log('\n=== PRUEBAS DE INTEGRACIÓN: UNIDADES E INVENTARIO ===\n')

  // 1. Catálogo cerrado y cantidades contables.
  const unidadInvalida = await request(
    'POST',
    '/inventario/ingredientes',
    {
      nombre: `${PREFIX}_UNIDAD_INVALIDA`,
      unidadMedida: 'kilos',
      stockActual: 1,
    },
    auth,
  )

  await comprobar('La API rechaza una unidad fuera del catálogo', () => {
    assert.equal(unidadInvalida.status, 400)
  })

  const fraccionConteo = await request(
    'POST',
    '/inventario/ingredientes',
    {
      nombre: `${PREFIX}_CONTEO_FRACCIONARIO`,
      unidadMedida: 'unidad',
      stockActual: 1.5,
    },
    auth,
  )

  await comprobar('La API rechaza stock fraccionario en unidad', () => {
    assert.equal(fraccionConteo.status, 400)
  })

  // 2. Masa: 2 platos * 180 g = 0.36 kg.
  const carneId = await crearIngrediente(
    auth,
    `${PREFIX}_CARNE`,
    'kg',
    5,
  )

  const platoCarneId = await prepararPlato(
    auth,
    categoriaId,
    'PLATO_CARNE',
    carneId,
    180,
    'g',
  )

  const pedidoCarne = await crearPedido(auth, admin._id, platoCarneId, 2)

  await comprobar('Pedido de carne creado correctamente', () => {
    assert.equal(
      pedidoCarne.status,
      201,
      `HTTP ${pedidoCarne.status}: ${JSON.stringify(pedidoCarne.data)}`,
    )
  })

  await comprobar('Dos platos descuentan 0.36 kg: quedan 4.64 kg', () => {
    return stockDe(carneId).then((stock) => casiIgual(stock, 4.64))
  })

  // 3. Volumen: 2 platos * 30 ml = 0.06 L.
  const aceiteId = await crearIngrediente(
    auth,
    `${PREFIX}_ACEITE`,
    'L',
    5,
  )

  const platoAceiteId = await prepararPlato(
    auth,
    categoriaId,
    'PLATO_ACEITE',
    aceiteId,
    30,
    'ml',
  )

  const pedidoAceite = await crearPedido(auth, admin._id, platoAceiteId, 2)

  await comprobar('Pedido de aceite creado correctamente', () => {
    assert.equal(
      pedidoAceite.status,
      201,
      `HTTP ${pedidoAceite.status}: ${JSON.stringify(pedidoAceite.data)}`,
    )
  })

  await comprobar('Dos platos descuentan 0.06 L: quedan 4.94 L', () => {
    return stockDe(aceiteId).then((stock) => casiIgual(stock, 4.94))
  })

  // 4. Unidad incompatible: kg de stock y L de receta.
  const platoIncompatible = await crearPlato(
    auth,
    categoriaId,
    `${PREFIX}_PLATO_INCOMPATIBLE`,
    carneId,
    1,
    'L',
  )

  await comprobar('Se rechaza una receta con kg de stock y L de preparación', () => {
    assert.equal(
      platoIncompatible.status,
      400,
      `Se esperaba HTTP 400; respuesta: ${JSON.stringify(platoIncompatible.data)}`,
    )
  })

  // 5. Stock insuficiente: debe quedar intacto y no generar movimiento.
  const pocoId = await crearIngrediente(
    auth,
    `${PREFIX}_STOCK_INSUFICIENTE`,
    'kg',
    0.1,
  )

  const platoPocoId = await prepararPlato(
    auth,
    categoriaId,
    'PLATO_STOCK_INSUFICIENTE',
    pocoId,
    180,
    'g',
  )

  const pedidoInsuficiente = await crearPedido(
    auth,
    admin._id,
    platoPocoId,
    1,
  )

  await comprobar('El pedido que supera el stock disponible se rechaza', () => {
    assert.equal(
      pedidoInsuficiente.status,
      400,
      `Se esperaba HTTP 400; respuesta: ${JSON.stringify(pedidoInsuficiente.data)}`,
    )
  })

  await comprobar('El stock insuficiente permanece en 0.1 kg', () => {
    return stockDe(pocoId).then((stock) => casiIgual(stock, 0.1))
  })

  // 6. Concurrencia: dos pedidos de 0.5 kg compiten por 0.7 kg.
  const concurrenciaId = await crearIngrediente(
    auth,
    `${PREFIX}_CONCURRENCIA`,
    'kg',
    0.7,
  )

  const platoConcurrenciaId = await prepararPlato(
    auth,
    categoriaId,
    'PLATO_CONCURRENCIA',
    concurrenciaId,
    0.5,
    'kg',
  )

  const [concurrente1, concurrente2] = await Promise.all([
    crearPedido(auth, admin._id, platoConcurrenciaId, 1),
    crearPedido(auth, admin._id, platoConcurrenciaId, 1),
  ])

  await comprobar('Solo uno de los pedidos concurrentes consigue reservar stock', () => {
    const estados = [concurrente1.status, concurrente2.status].sort()
    assert.deepEqual(
      estados,
      [201, 400],
      `Resultados inesperados de concurrencia: ${JSON.stringify(estados)}; respuestas: ${JSON.stringify([concurrente1.data, concurrente2.data])}`,
    )
  })

  await comprobar('La concurrencia no deja stock negativo: quedan 0.2 kg', () => {
    return stockDe(concurrenciaId).then((stock) => casiIgual(stock, 0.2))
  })

  // 7. Verificar que el movimiento conserve la receta y el consumo real.
  const pedidoCarneDoc = await db.collection('pedidos').findOne({
    'detalles.plato': oid(platoCarneId),
  })

  assert.ok(pedidoCarneDoc, 'No se encontró el pedido de prueba de carne')

  const movimientoCarne = await db.collection('movimientos_inventario').findOne({
    pedido: pedidoCarneDoc._id,
    'consumos.ingrediente': oid(carneId),
  })

  await comprobar('El pedido de carne tiene un movimiento de inventario', () => {
    assert.ok(movimientoCarne)
  })

  await comprobar('El historial registra 0.36 kg y conserva los 180 g originales', () => {
    const consumo = movimientoCarne.consumos.find(
      (item) => String(item.ingrediente) === carneId,
    )

    assert.ok(consumo, 'No está el ingrediente de carne en el movimiento')
    assert.equal(consumo.unidadStock, 'kg')
    casiIgual(consumo.cantidadTotal, 0.36)
    assert.ok(consumo.detallePlatos.length > 0)
    assert.equal(consumo.detallePlatos[0].unidadReceta, 'g')
    casiIgual(consumo.detallePlatos[0].cantidadNecesariaPorPlato, 180)
    casiIgual(consumo.detallePlatos[0].consumoTotal, 0.36)
  })

  await comprobar('El endpoint protegido devuelve el historial', () => {
    return request('GET', '/inventario/movimientos?limite=100', null, auth)
      .then((res) => {
        assert.equal(res.status, 200, JSON.stringify(res.data))
        assert.ok(Array.isArray(res.data?.movimientos))
        assert.ok(
          res.data.movimientos.some(
            (movimiento) =>
              String(movimiento._id) === String(movimientoCarne._id),
          ),
          'El endpoint no devolvió el movimiento esperado',
        )
      })
  })

  console.log('\n✅ TODAS LAS PRUEBAS DE INTEGRACIÓN PASARON.\n')
}

async function main() {
  let fallo = null

  try {
    await ejecutarPruebas()
  } catch (error) {
    fallo = error
    console.error('\n❌ PRUEBA DE INTEGRACIÓN FALLIDA:')
    console.error(error)
  } finally {
    try {
      await limpiarDatosDePrueba()
    } catch (error) {
      console.error('❌ Falló la limpieza de registros temporales:', error)
      fallo = fallo || error
    }

    try {
      await mongoose.disconnect()
    } catch (error) {
      console.error('Error al cerrar MongoDB:', error)
    }
  }

  if (fallo) process.exitCode = 1
}

main()
