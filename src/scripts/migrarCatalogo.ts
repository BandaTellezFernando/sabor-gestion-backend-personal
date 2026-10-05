import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function run() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI no definido');
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    // 1. Set stockActual = 0 on existing ingredients
    const Ingrediente = mongoose.model('Ingrediente', new mongoose.Schema({}, { strict: false }));
    const resultIng = await Ingrediente.updateMany(
      { stockActual: { $exists: false } },
      { $set: { stockActual: 0 } }
    );
    console.log(`Ingredientes actualizados con stockActual=0: ${resultIng.modifiedCount}`);

    // 2. Delete all existing Plates and Recipes
    const Plato = mongoose.model('Plato', new mongoose.Schema({}, { strict: false }));
    const Receta = mongoose.model('Receta', new mongoose.Schema({}, { strict: false }));
    
    const resultPlatos = await Plato.deleteMany({});
    console.log(`Platos eliminados: ${resultPlatos.deletedCount}`);
    
    const resultRecetas = await Receta.deleteMany({});
    console.log(`Recetas eliminadas: ${resultRecetas.deletedCount}`);

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run();
