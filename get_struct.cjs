const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const http = require('http');
async function request(method, path, body = null, headers = {}) {
  return new Promise((resolve) => {
    const options = { hostname: 'localhost', port: 3000, path: `/api${path}`, method, headers: { 'Content-Type': 'application/json', ...headers } };
    const req = http.request(options, (res) => {
      let data = ''; res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    if (body) req.write(JSON.stringify(body)); req.end();
  });
}
async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const admin = await db.collection('usuarios').findOne({ rol: 'Administrador' });
  const authToken = jwt.sign({ id: admin._id.toString(), rol: admin.rol }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
  const authHeaders = { Authorization: `Bearer ${authToken}` };
  const categoriaId = '6ac26588f3173071b2506b86';

  const ingRes = await request('POST', '/ingredientes', { nombre: 'Ing_Conc_' + Date.now(), unidadMedida: 'kilos', stockActual: 1.0 }, authHeaders);
  console.log("ING RES:", ingRes.data);
  const ingId = ingRes.data.ingrediente ? ingRes.data.ingrediente._id : (ingRes.data._id || ingRes.data.id);

  const platoRes = await request('POST', '/platos', {
    nombre: 'Plato_Conc_' + Date.now(), descripcion: 'Prueba', precio: 50, imagenUrl: 'x', imagenPublicId: 'x', categoria: categoriaId,
    ingredientes: [{ ingrediente: ingId, cantidadNecesaria: 0.7 }]
  }, authHeaders);
  console.log("PLATO RES:", platoRes.data);
  process.exit(0);
}
run();
