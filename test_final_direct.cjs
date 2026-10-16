const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const http = require('http');

const PORT = 3000;

let db = null;
let categoriaId = null;
let categoriaCreadaId = null;
let categoriaNombrePrueba = null;
let ingredientePapasId = null;
let ingredienteNombrePrueba = null;
let platoId = null;
let platoNombrePrueba = null;

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

function getEntityId(data, property = null) {
  if (property && data?.[property]) {
    return data[property]._id || data[property].id;
  }

  return data?._id || data?.id;
}

async function limpiarDatosPrueba() {
  if (!db) return;

  // Priorizar el ID conocido; usar el nombre único si la API no devolvió ID.
  let idPlato = null;

  if (platoId && mongoose.isValidObjectId(platoId)) {
    idPlato = new mongoose.Types.ObjectId(platoId);
  } else if (platoNombrePrueba) {
    const platoEncontrado = await db.collection('platos').findOne({
      nombre: platoNombrePrueba
    });
    idPlato = platoEncontrado?._id || null;
  }

  // El plato puede haber sido eliminado antes por la propia prueba.
  // Por eso se buscan los pedidos usando su ID aunque ya no exista el plato.
  if (idPlato) {
    const pedidosPrueba = await db.collection('pedidos')
      .find({
        $or: [
          { 'detalles.plato': idPlato },
          { 'detalles.plato': idPlato.toString() }
        ]
      })
      .project({ _id: 1 })
      .toArray();

    const pedidoIds = pedidosPrueba.map((pedido) => pedido._id);

    if (pedidoIds.length > 0) {
      await db.collection('movimientos_inventario').deleteMany({
        pedido: { $in: pedidoIds }
      });

      await db.collection('pedidos').deleteMany({
        _id: { $in: pedidoIds }
      });
    }

    await db.collection('recetas').deleteMany({ plato: idPlato });
    await db.collection('platos').deleteOne({ _id: idPlato });
  }

  // Los nombres de respaldo se generan exclusivamente para esta ejecución.
  if (ingredientePapasId && mongoose.isValidObjectId(ingredientePapasId)) {
    await db.collection('ingredientes').deleteOne({
      _id: new mongoose.Types.ObjectId(ingredientePapasId)
    });
  } else if (ingredienteNombrePrueba) {
    await db.collection('ingredientes').deleteOne({
      nombre: ingredienteNombrePrueba
    });
  }

  // Solo se busca/elimina la categoría creada por esta prueba.
  if (categoriaCreadaId && mongoose.isValidObjectId(categoriaCreadaId)) {
    await db.collection('categorias').deleteOne({
      _id: new mongoose.Types.ObjectId(categoriaCreadaId)
    });
  } else if (categoriaNombrePrueba) {
    await db.collection('categorias').deleteOne({
      nombre: categoriaNombrePrueba
    });
  }
}
async function runTests() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    db = mongoose.connection.db;

    const admin = await db
      .collection('usuarios')
      .findOne({ rol: 'Administrador' });

    if (!admin) {
      throw new Error('No se encontró un usuario Administrador para ejecutar las pruebas.');
    }

    const authToken = jwt.sign(
      {
        id: admin._id.toString(),
        rol: admin.rol
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '1h' }
    );

    const authHeaders = {
      Authorization: `Bearer ${authToken}`
    };

    const sufijoCategoria = Date.now()
      .toString()
      .split('')
      .map((digito) => 'abcdefghij'[Number(digito)])
      .join('');

    categoriaNombrePrueba =
      `Categoria Pruebas Concurrencia ${sufijoCategoria}`;

    const categoriaNueva = await request(
      'POST',
      '/categorias',
      { nombre: categoriaNombrePrueba },
      authHeaders
    );

    if (categoriaNueva.status !== 201) {
      throw new Error(
        `No se pudo crear la categoría temporal: ${JSON.stringify(categoriaNueva.data)}`
      );
    }

    categoriaCreadaId = getEntityId(categoriaNueva.data);
    categoriaId = categoriaCreadaId;

    if (!categoriaCreadaId) {
      throw new Error('La categoría temporal no devolvió su identificador.');
    }

    // =========================================================
    // PREPARACIÓN
    // =========================================================

    ingredienteNombrePrueba = `Ing_Conc_${Date.now()}`;

    const ingRes = await request(
      'POST',
      '/inventario/ingredientes',
      {
        nombre: ingredienteNombrePrueba,
        unidadMedida: 'kg',
        stockActual: 1.0
      },
      authHeaders
    );

    if (ingRes.status !== 201) {
      throw new Error(
        `No se pudo crear el ingrediente de prueba. Status: ${ingRes.status}. Respuesta: ${JSON.stringify(ingRes.data)}`
      );
    }

    ingredientePapasId = getEntityId(ingRes.data, 'ingrediente');

    if (!ingredientePapasId) {
      throw new Error(
        `No se pudo obtener el ID del ingrediente creado: ${JSON.stringify(ingRes.data)}`
      );
    }

    platoNombrePrueba = `Plato_Conc_${Date.now()}`;

    const platoRes = await request(
      'POST',
      '/platos',
      {
        nombre: platoNombrePrueba,
        descripcion: 'Prueba de concurrencia',
        precio: 50,
        imagenUrl: 'http://test.com/img.jpg',
        imagenPublicId: `img-concurrencia-${Date.now()}`,
        categoria: categoriaId,
        ingredientes: [
          {
            ingrediente: ingredientePapasId,
            cantidadNecesaria: 0.7,
            unidadMedida: 'kg'
          }
        ]
      },
      authHeaders
    );

    if (platoRes.status !== 201) {
      throw new Error(
        `No se pudo crear el plato de prueba. Status: ${platoRes.status}. Respuesta: ${JSON.stringify(platoRes.data)}`
      );
    }

    platoId = getEntityId(platoRes.data, 'plato');

    if (!platoId) {
      throw new Error(
        `No se pudo obtener el ID del plato creado: ${JSON.stringify(platoRes.data)}`
      );
    }

    console.log('=== INICIANDO PRUEBAS DE CONCURRENCIA E INTEGRIDAD ===');
    console.log(
      '✔ Entorno preparado. Stock inicial: 1.0. Consumo por plato: 0.7.'
    );

    // =========================================================
    // PRUEBA DE CONCURRENCIA
    // =========================================================

    console.log('\n--- INICIANDO CONCURRENCIA ---');

    const req1 = request(
      'POST',
      '/pedidos',
      {
        tipoPedido: 'Local',
        detalles: [
          {
            plato: platoId,
            cantidad: 1
          }
        ]
      },
      authHeaders
    );

    const req2 = request(
      'POST',
      '/pedidos',
      {
        tipoPedido: 'Local',
        detalles: [
          {
            plato: platoId,
            cantidad: 1
          }
        ]
      },
      authHeaders
    );

    const [res1, res2] = await Promise.all([req1, req2]);

    console.log(`Solicitud 1 status: ${res1.status}`);

    if (res1.status !== 201) {
      console.log(
        '  Mensaje 1:',
        res1.data?.mensaje || res1.data
      );
    }

    console.log(`Solicitud 2 status: ${res2.status}`);

    if (res2.status !== 201) {
      console.log(
        '  Mensaje 2:',
        res2.data?.mensaje || res2.data
      );
    }

    const solicitudesExitosas = [res1.status, res2.status].filter(
      (status) => status === 201
    ).length;

    if (solicitudesExitosas === 1) {
      console.log(
        '✔ Concurrencia PASADA: Solo una solicitud tuvo éxito (Stock atómico).'
      );
    } else {
      throw new Error(
        `Concurrencia FALLIDA: se esperaban exactamente 1 éxito y 1 rechazo. Resultados: ${res1.status}, ${res2.status}`
      );
    }

    // =========================================================
    // VERIFICACIÓN DEL STOCK FINAL
    // =========================================================

    const ingredientesRes = await request(
      'GET',
      '/inventario/ingredientes',
      null,
      authHeaders
    );

    if (ingredientesRes.status !== 200) {
      throw new Error(
        `No se pudo consultar el inventario. Status: ${ingredientesRes.status}. Respuesta: ${JSON.stringify(ingredientesRes.data)}`
      );
    }

    const ingredientes = Array.isArray(ingredientesRes.data)
      ? ingredientesRes.data
      : ingredientesRes.data?.ingredientes;

    if (!Array.isArray(ingredientes)) {
      throw new Error(
        `La respuesta del inventario no tiene el formato esperado: ${JSON.stringify(ingredientesRes.data)}`
      );
    }

    const ingredienteFinal = ingredientes.find(
      (ingrediente) =>
        String(ingrediente._id || ingrediente.id) ===
        String(ingredientePapasId)
    );

    if (!ingredienteFinal) {
      throw new Error(
        `No se encontró el ingrediente de prueba ${ingredientePapasId} en el listado de inventario.`
      );
    }

    const stockFinal = Number(ingredienteFinal.stockActual);

    console.log(`Stock final en BD: ${stockFinal}`);

    if (Math.abs(stockFinal - 0.3) < 0.001) {
      console.log(
        '✔ Matemáticas exactas PASADAS: Stock final es 0.3 sin negativos.'
      );
    } else {
      throw new Error(
        `Matemáticas FALLIDAS: se esperaba stock 0.3 y se obtuvo ${stockFinal}.`
      );
    }

    // =========================================================
    // PRUEBA DE INTEGRIDAD
    // =========================================================

    console.log('\n--- INICIANDO INTEGRIDAD ---');

    const delIng = await request(
      'DELETE',
      `/inventario/ingredientes/${ingredientePapasId}`,
      null,
      authHeaders
    );

    console.log('Eliminar ingrediente status:', delIng.status);
    console.log(
      '  Respuesta:',
      delIng.data?.mensaje || delIng.data
    );

    if (delIng.status === 400) {
      console.log(
        '✔ Integridad de ingrediente PASADA: no permite eliminar un ingrediente utilizado por una receta.'
      );
    } else {
      console.log(
        '⚠ La eliminación del ingrediente tuvo un resultado distinto al esperado.'
      );
    }

    const delCat = await request(
      'DELETE',
      `/categorias/${categoriaId}`,
      null,
      authHeaders
    );

    console.log('Eliminar categoría en uso status:', delCat.status);
    console.log(
      '  Respuesta:',
      delCat.data?.mensaje || delCat.data
    );

    if (delCat.status === 400) {
      console.log(
        '✔ Integridad de categoría PASADA: no permite eliminar una categoría que tiene platos asociados.'
      );
    } else {
      console.log(
        '⚠ La eliminación de la categoría tuvo un resultado distinto al esperado.'
      );
    }

    const delPlato = await request(
      'DELETE',
      `/platos/${platoId}`,
      null,
      authHeaders
    );

    console.log('Eliminar plato status:', delPlato.status);
    console.log(
      '  Respuesta:',
      delPlato.data?.mensaje || delPlato.data
    );

    if (delPlato.status !== 200) {
      throw new Error(
        `No se pudo eliminar el plato de prueba. Status: ${delPlato.status}`
      );
    }

    const recCheck = await db.collection('recetas').findOne({
      plato: new mongoose.Types.ObjectId(platoId)
    });

    if (!recCheck) {
      console.log(
        '✔ Integridad de receta PASADA: la receta asociada al plato también fue eliminada.'
      );
    } else {
      throw new Error(
        'La receta del plato eliminado todavía existe en la base de datos.'
      );
    }

    console.log('\n=== LIMPIANDO DATOS DE PRUEBA ===');
    await limpiarDatosPrueba();
    console.log('✔ Limpieza completada.');

    console.log('\n=== TODAS LAS PRUEBAS COMPLETADAS ===');
    await mongoose.disconnect();

  } catch (error) {
    console.error('\n✖ ERROR EN LAS PRUEBAS:', error.message);

    try {
      await limpiarDatosPrueba();
      console.log('Limpieza posterior al error completada.');
    } catch (cleanupError) {
      console.error(
        '⚠ No se pudo completar toda la limpieza:',
        cleanupError.message
      );
    }

    try {
      await mongoose.disconnect();
    } catch {
      // La conexión puede no haberse establecido o ya estar cerrada.
    }

    process.exitCode = 1;
  }
}

runTests();