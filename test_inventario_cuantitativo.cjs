const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({
  path: require('path').resolve(__dirname, '.env')
});

const http = require('http');

const PORT = 3000;

async function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: `/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        } catch {
          resolve({
            status: res.statusCode,
            data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

function getId(data, property = null) {
  if (property && data?.[property]) {
    return data[property]._id || data[property].id;
  }

  return data?._id || data?.id;
}

function getIngredienteData(data) {
  return data?.ingrediente || data;
}

function approxEqual(a, b, tolerance = 0.000001) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function obtenerIngrediente(authHeaders, ingredienteId) {
  const response = await request(
    'GET',
    '/inventario/ingredientes',
    null,
    authHeaders
  );

  assert(
    response.status === 200,
    `No se pudo consultar el inventario. Status ${response.status}`
  );

  const ingredientes = Array.isArray(response.data)
    ? response.data
    : response.data?.ingredientes;

  assert(
    Array.isArray(ingredientes),
    'La respuesta de inventario no tiene el formato esperado.'
  );

  const ingrediente = ingredientes.find(
    (item) =>
      String(item._id || item.id) === String(ingredienteId)
  );

  assert(
    ingrediente,
    `No se encontró el ingrediente ${ingredienteId} en el inventario.`
  );

  return ingrediente;
}

async function obtenerStock(authHeaders, ingredienteId) {
  const ingrediente = await obtenerIngrediente(
    authHeaders,
    ingredienteId
  );

  return Number(ingrediente.stockActual);
}

async function crearIngrediente(
  authHeaders,
  nombre,
  stockInicial
) {
  const response = await request(
    'POST',
    '/inventario/ingredientes',
    {
      nombre,
      unidadMedida: 'kg',
      stockActual: stockInicial
    },
    authHeaders
  );

  assert(
    response.status === 201,
    `No se pudo crear ingrediente "${nombre}". Status ${response.status}: ${JSON.stringify(response.data)}`
  );

  const id = getId(response.data, 'ingrediente');

  assert(
    id,
    `La respuesta no contiene el ID del ingrediente "${nombre}".`
  );

  return id;
}

async function crearPlato(
  authHeaders,
  categoriaId,
  nombre,
  ingredienteId,
  cantidadNecesaria
) {
  const response = await request(
    'POST',
    '/platos',
    {
      nombre,
      descripcion: 'Prueba de inventario cuantitativo',
      precio: 50,
      imagenUrl: 'http://test.com/img.jpg',
      imagenPublicId: `img-test-${Date.now()}`,
      categoria: categoriaId,
      ingredientes: [
        {
          ingrediente: ingredienteId,
          cantidadNecesaria
        }
      ]
    },
    authHeaders
  );

  assert(
    response.status === 201,
    `No se pudo crear el plato "${nombre}". Status ${response.status}: ${JSON.stringify(response.data)}`
  );

  const id = getId(response.data, 'plato');

  assert(
    id,
    `La respuesta no contiene el ID del plato "${nombre}".`
  );

  return id;
}

async function eliminarPlato(authHeaders, platoId) {
  if (!platoId) {
    return;
  }

  const response = await request(
    'DELETE',
    `/platos/${platoId}`,
    null,
    authHeaders
  );

  if (response.status !== 200) {
    console.warn(
      `⚠ No se pudo eliminar el plato ${platoId}. Status ${response.status}: ${JSON.stringify(response.data)}`
    );
  }
}

async function eliminarIngrediente(authHeaders, ingredienteId) {
  if (!ingredienteId) {
    return;
  }

  const response = await request(
    'DELETE',
    `/inventario/ingredientes/${ingredienteId}`,
    null,
    authHeaders
  );

  if (response.status !== 200) {
    console.warn(
      `⚠ No se pudo eliminar el ingrediente ${ingredienteId}. Status ${response.status}: ${JSON.stringify(response.data)}`
    );
  }
}

async function runTests() {
  let ingredienteA = null;
  let ingredienteB = null;
  let ingredienteCompartido = null;

  let platoA = null;
  let platoInsuficiente = null;
  let platoB = null;
  let platoC = null;

  let authHeaders = null;

  try {
    await mongoose.connect(process.env.MONGO_URI);

    const db = mongoose.connection.db;

    const admin = await db
      .collection('usuarios')
      .findOne({ rol: 'Administrador' });

    assert(
      admin,
      'No se encontró un usuario Administrador.'
    );

    const authToken = jwt.sign(
      {
        id: admin._id.toString(),
        rol: admin.rol
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '1h' }
    );

    authHeaders = {
      Authorization: `Bearer ${authToken}`
    };

    const categoriasResponse = await request(
      'GET',
      '/categorias',
      null,
      authHeaders
    );

    assert(
      categoriasResponse.status === 200,
      `No se pudieron obtener categorías. Status ${categoriasResponse.status}`
    );

    assert(
      Array.isArray(categoriasResponse.data) &&
        categoriasResponse.data.length > 0,
      'No existe ninguna categoría disponible para las pruebas.'
    );

    const categoriaId =
      categoriasResponse.data[0]._id ||
      categoriasResponse.data[0].id;

    console.log('=== INVENTARIO CUANTITATIVO ===');

    // =========================================================
    // PREPARACIÓN DE INGREDIENTE PRINCIPAL
    // =========================================================

    ingredienteA = await crearIngrediente(
      authHeaders,
      `Ing_Suficiente_${Date.now()}`,
      10
    );

    console.log('\n--- PRUEBA EXTRA: UNIDAD DE MEDIDA FIJA ---');

    // =========================================================
    // PRUEBA EXTRA 1: CAMBIAR STOCK
    // =========================================================

    const cambiarStock15 = await request(
      'PUT',
      `/inventario/ingredientes/${ingredienteA}`,
      {
        stockActual: 15
      },
      authHeaders
    );

    assert(
      cambiarStock15.status === 200,
      `Cambiar stock a 15 debería devolver 200. Obtenido: ${cambiarStock15.status}`
    );

    const ingredienteActualizado15 = getIngredienteData(
      cambiarStock15.data
    );

    assert(
      Number(ingredienteActualizado15.stockActual) === 15,
      `El stock debería ser 15. Obtenido: ${ingredienteActualizado15.stockActual}`
    );

    assert(
      ingredienteActualizado15.unidadMedida === 'kg',
      `La unidad debería seguir siendo kg. Obtenido: ${ingredienteActualizado15.unidadMedida}`
    );

    console.log('✔ Stock cambiado de 10 → 15 kg.');

    // =========================================================
    // PRUEBA EXTRA 2: VOLVER A CAMBIAR STOCK
    // =========================================================

    const cambiarStock75 = await request(
      'PUT',
      `/inventario/ingredientes/${ingredienteA}`,
      {
        stockActual: 7.5
      },
      authHeaders
    );

    assert(
      cambiarStock75.status === 200,
      `Cambiar stock a 7.5 debería devolver 200. Obtenido: ${cambiarStock75.status}`
    );

    const ingredienteActualizado75 = getIngredienteData(
      cambiarStock75.data
    );

    assert(
      approxEqual(ingredienteActualizado75.stockActual, 7.5),
      `El stock debería ser 7.5. Obtenido: ${ingredienteActualizado75.stockActual}`
    );

    assert(
      ingredienteActualizado75.unidadMedida === 'kg',
      `La unidad debería seguir siendo kg. Obtenido: ${ingredienteActualizado75.unidadMedida}`
    );

    console.log('✔ Stock cambiado de 15 → 7.5 kg.');

    // =========================================================
    // PRUEBA EXTRA 3: INTENTAR CAMBIAR UNIDAD
    // =========================================================

    const cambiarUnidad = await request(
      'PUT',
      `/inventario/ingredientes/${ingredienteA}`,
      {
        unidadMedida: 'litros'
      },
      authHeaders
    );

    assert(
      cambiarUnidad.status === 400,
      `Cambiar unidad debería devolver 400. Obtenido: ${cambiarUnidad.status}`
    );

    console.log(
      '✔ Cambio de unidad rechazado correctamente:',
      cambiarUnidad.data?.mensaje || cambiarUnidad.data
    );

    // =========================================================
    // PRUEBA EXTRA 4: VERIFICAR QUE NO CAMBIÓ NADA
    // =========================================================

    const ingredienteFinalUnidad = await obtenerIngrediente(
      authHeaders,
      ingredienteA
    );

    assert(
      ingredienteFinalUnidad.unidadMedida === 'kg',
      `La unidad debería permanecer kg. Obtenido: ${ingredienteFinalUnidad.unidadMedida}`
    );

    assert(
      approxEqual(ingredienteFinalUnidad.stockActual, 7.5),
      `El stock debería permanecer en 7.5. Obtenido: ${ingredienteFinalUnidad.stockActual}`
    );

    console.log('✔ La unidad permanece fija en kg.');
    console.log('✔ El stock permanece en 7.5 kg.');

    // =========================================================
    // PRUEBA 1: STOCK SUFICIENTE
    // =========================================================

    console.log('\n--- PRUEBA 1: STOCK SUFICIENTE ---');

    // Restauramos stock para la prueba.
    const restaurarStock = await request(
      'PUT',
      `/inventario/ingredientes/${ingredienteA}`,
      {
        stockActual: 10
      },
      authHeaders
    );

    assert(
      restaurarStock.status === 200,
      `No se pudo restaurar el stock a 10. Status ${restaurarStock.status}`
    );

    platoA = await crearPlato(
      authHeaders,
      categoriaId,
      `Plato_Suficiente_${Date.now()}`,
      ingredienteA,
      0.5
    );

    const pedidoSuficiente = await request(
      'POST',
      '/pedidos',
      {
        tipoPedido: 'Local',
        detalles: [
          {
            plato: platoA,
            cantidad: 2
          }
        ]
      },
      authHeaders
    );

    assert(
      pedidoSuficiente.status === 201,
      `Se esperaba 201 y se obtuvo ${pedidoSuficiente.status}: ${JSON.stringify(pedidoSuficiente.data)}`
    );

    const stockDespuesSuficiente =
      await obtenerStock(authHeaders, ingredienteA);

    assert(
      approxEqual(stockDespuesSuficiente, 9),
      `Stock incorrecto en prueba 1. Esperado 9, obtenido ${stockDespuesSuficiente}`
    );

    console.log('✔ Pedido creado correctamente.');
    console.log('✔ Consumo esperado: 0.5 × 2 = 1.0 kg.');
    console.log(`✔ Stock final: ${stockDespuesSuficiente} kg.`);

    // =========================================================
    // PRUEBA 2: STOCK INSUFICIENTE
    // =========================================================

    console.log('\n--- PRUEBA 2: STOCK INSUFICIENTE ---');

    ingredienteB = await crearIngrediente(
      authHeaders,
      `Ing_Insuficiente_${Date.now()}`,
      0.5
    );

    platoInsuficiente = await crearPlato(
      authHeaders,
      categoriaId,
      `Plato_Insuficiente_${Date.now()}`,
      ingredienteB,
      0.7
    );

    const pedidosAntes = await db
      .collection('pedidos')
      .countDocuments({
        'detalles.plato': new mongoose.Types.ObjectId(
          platoInsuficiente
        )
      });

    const pedidoInsuficiente = await request(
      'POST',
      '/pedidos',
      {
        tipoPedido: 'Local',
        detalles: [
          {
            plato: platoInsuficiente,
            cantidad: 1
          }
        ]
      },
      authHeaders
    );

    assert(
      pedidoInsuficiente.status === 400,
      `Se esperaba 400 por stock insuficiente y se obtuvo ${pedidoInsuficiente.status}: ${JSON.stringify(pedidoInsuficiente.data)}`
    );

    const stockDespuesInsuficiente =
      await obtenerStock(authHeaders, ingredienteB);

    assert(
      approxEqual(stockDespuesInsuficiente, 0.5),
      `El stock cambió aunque el pedido fue rechazado. Esperado 0.5, obtenido ${stockDespuesInsuficiente}`
    );

    const pedidosDespues = await db
      .collection('pedidos')
      .countDocuments({
        'detalles.plato': new mongoose.Types.ObjectId(
          platoInsuficiente
        )
      });

    assert(
      pedidosDespues === pedidosAntes,
      `Se creó un pedido aunque el stock era insuficiente. Antes: ${pedidosAntes}, después: ${pedidosDespues}`
    );

    assert(
      Array.isArray(pedidoInsuficiente.data?.faltantes) &&
        pedidoInsuficiente.data.faltantes.length > 0,
      'La respuesta 400 no devolvió la lista de ingredientes faltantes.'
    );

    const faltante =
      pedidoInsuficiente.data.faltantes[0];

    assert(
      approxEqual(faltante.disponible, 0.5),
      `Disponible incorrecto en faltantes: ${faltante.disponible}`
    );

    assert(
      approxEqual(faltante.requerido, 0.7),
      `Requerido incorrecto en faltantes: ${faltante.requerido}`
    );

    assert(
      approxEqual(faltante.faltante, 0.2),
      `Faltante incorrecto: ${faltante.faltante}`
    );

    assert(
      faltante.unidad === 'kg',
      `Unidad incorrecta en faltantes: ${faltante.unidad}`
    );

    console.log('✔ Pedido rechazado con HTTP 400.');
    console.log('✔ Stock permaneció en 0.5 kg.');
    console.log('✔ No se creó ningún Pedido.');
    console.log(
      `✔ Faltante reportado: disponible=${faltante.disponible}, requerido=${faltante.requerido}, faltante=${faltante.faltante}, unidad=${faltante.unidad}`
    );

    // =========================================================
    // PRUEBA 3: VARIAS UNIDADES DEL MISMO PLATO
    // =========================================================

    console.log(
      '\n--- PRUEBA 3: VARIAS UNIDADES DEL MISMO PLATO ---'
    );

    const stockInicialMismaReceta = 2;

    const actualizarStockDos = await request(
      'PUT',
      `/inventario/ingredientes/${ingredienteB}`,
      {
        stockActual: stockInicialMismaReceta
      },
      authHeaders
    );

    assert(
      actualizarStockDos.status === 200,
      `No se pudo colocar el stock en 2 kg. Status ${actualizarStockDos.status}`
    );

    const pedidoVariasUnidades = await request(
      'POST',
      '/pedidos',
      {
        tipoPedido: 'Local',
        detalles: [
          {
            plato: platoInsuficiente,
            cantidad: 2
          }
        ]
      },
      authHeaders
    );

    assert(
      pedidoVariasUnidades.status === 201,
      `Se esperaba 201 para 2 unidades y se obtuvo ${pedidoVariasUnidades.status}: ${JSON.stringify(pedidoVariasUnidades.data)}`
    );

    const stockDespuesVariasUnidades =
      await obtenerStock(authHeaders, ingredienteB);

    assert(
      approxEqual(stockDespuesVariasUnidades, 0.6),
      `Stock incorrecto en prueba 3. Esperado 0.6, obtenido ${stockDespuesVariasUnidades}`
    );

    console.log('✔ Pedido de 2 unidades creado.');
    console.log('✔ Consumo esperado: 0.7 × 2 = 1.4 kg.');
    console.log(
      `✔ Stock final: ${stockDespuesVariasUnidades} kg.`
    );

    // =========================================================
    // PRUEBA 4: INGREDIENTE COMPARTIDO
    // =========================================================

    console.log(
      '\n--- PRUEBA 4: INGREDIENTE COMPARTIDO ENTRE DOS PLATOS ---'
    );

    ingredienteCompartido = await crearIngrediente(
      authHeaders,
      `Ing_Compartido_${Date.now()}`,
      2
    );

    platoB = await crearPlato(
      authHeaders,
      categoriaId,
      `Plato_Compartido_A_${Date.now()}`,
      ingredienteCompartido,
      0.7
    );

    platoC = await crearPlato(
      authHeaders,
      categoriaId,
      `Plato_Compartido_B_${Date.now()}`,
      ingredienteCompartido,
      0.5
    );

    const pedidoCompartido = await request(
      'POST',
      '/pedidos',
      {
        tipoPedido: 'Local',
        detalles: [
          {
            plato: platoB,
            cantidad: 1
          },
          {
            plato: platoC,
            cantidad: 1
          }
        ]
      },
      authHeaders
    );

    assert(
      pedidoCompartido.status === 201,
      `Se esperaba 201 en ingredientes compartidos y se obtuvo ${pedidoCompartido.status}: ${JSON.stringify(pedidoCompartido.data)}`
    );

    const stockCompartidoFinal =
      await obtenerStock(
        authHeaders,
        ingredienteCompartido
      );

    assert(
      approxEqual(stockCompartidoFinal, 0.8),
      `Stock incorrecto en ingredientes compartidos. Esperado 0.8, obtenido ${stockCompartidoFinal}`
    );

    console.log('✔ Pedido con dos platos creado.');
    console.log('✔ Plato A consume: 0.7 kg.');
    console.log('✔ Plato B consume: 0.5 kg.');
    console.log('✔ Consumo agrupado esperado: 1.2 kg.');
    console.log(
      `✔ Stock final: ${stockCompartidoFinal} kg.`
    );

    // =========================================================
    // RESULTADO
    // =========================================================

    console.log('\n=== TODAS LAS PRUEBAS CUANTITATIVAS PASARON ===');

  } catch (error) {
    console.error('\n✖ PRUEBA FALLIDA:', error.message);
    process.exitCode = 1;

  } finally {
    // =========================================================
    // LIMPIEZA
    // =========================================================

    if (authHeaders) {
      console.log('\n--- LIMPIEZA ---');

      await eliminarPlato(authHeaders, platoA);
      await eliminarPlato(authHeaders, platoInsuficiente);
      await eliminarPlato(authHeaders, platoB);
      await eliminarPlato(authHeaders, platoC);

      await eliminarIngrediente(authHeaders, ingredienteA);
      await eliminarIngrediente(authHeaders, ingredienteB);
      await eliminarIngrediente(
        authHeaders,
        ingredienteCompartido
      );

      console.log('✔ Limpieza de datos de prueba finalizada.');
    }

    try {
      await mongoose.disconnect();
    } catch {
      // Ignorar error de desconexión.
    }
  }
}

runTests();