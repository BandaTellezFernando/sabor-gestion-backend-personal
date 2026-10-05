const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const cats = await db.collection('categorias').find().toArray();
  console.log(cats);
  process.exit(0);
}
run();
