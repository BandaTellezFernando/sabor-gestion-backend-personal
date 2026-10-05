const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

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

function getEntityId(data, property = null) {
  if (property && data?.[property]) {
    return data[property]._id || data[property].id;
  }

  return data?._id || data?.id;
}

async function runTests() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const db = mongoose.connection.db;

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

    const categoriaId = '6ac26588f3173071b2506b86';

    // =========================================================
    // PREPARACIÓN
    // =========================================================

    const ingredienteNombre = `Ing_Conc_${Date.now()}`;

    const ingRes = await request(
      'POST',
      '/inventario/ingredientes',
      {
        nombre: ingredienteNombre,
        unidadMedida: 'kilos',
        stockActual: 1.0
      },
      authHeaders
    );

    if (ingRes.status !== 201) {
      throw new Error(
        `No se pudo crear el ingrediente de prueba. Status: ${ingRes.status}. Respuesta: ${JSON.stringify(ingRes.data)}`
      );
    }

    const ingredientePapasId = getEntityId(ingRes.data, 'ingrediente');

    if (!ingredientePapasId) {
      throw new Error(
        `No se pudo obtener el ID del ingrediente creado: ${JSON.stringify(ingRes.data)}`
      );
    }

    const platoNombre = `Plato_Conc_${Date.now()}`;

    const platoRes = await request(
      'POST',
      '/platos',
      {
        nombre: platoNombre,
        descripcion: 'Prueba de concurrencia',
        precio: 50,
        imagenUrl: 'http://test.com/img.jpg',
        imagenPublicId: 'img1',
        categoria: categoriaId,
        ingredientes: [
          {
            ingrediente: ingredientePapasId,
            cantidadNecesaria: 0.7
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

    const platoId = getEntityId(platoRes.data, 'plato');

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

    console.log('\n=== TODAS LAS PRUEBAS COMPLETADAS ===');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n✖ ERROR EN LAS PRUEBAS:', error.message);

    try {
      await mongoose.disconnect();
    } catch {
      // Ignorar error de desconexión durante fallo de pruebas.
    }

    process.exit(1);
  }
}

runTests();