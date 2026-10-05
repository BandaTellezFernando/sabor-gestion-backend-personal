const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = await db.collection('usuarios').find().toArray();
  console.log(users.map(u => u.rol));
  process.exit(0);
}
run();
