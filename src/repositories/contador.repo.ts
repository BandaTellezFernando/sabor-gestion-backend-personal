// src/repositories/contador.repo.ts
import { ClientSession } from 'mongoose'
import Contador, { IContador } from '../models/Contador'

export { IContador } from '../models/Contador'

export class ContadorRepository {
  /**
   * Inicializa de forma atómica e idempotente la secuencia de un contador si no existe.
   * Utiliza $setOnInsert con upsert para evitar errores de clave duplicada E11000.
   */
  async inicializarSecuenciaSiNoExiste(
    nombreSecuencia: string,
    secuenciaInicial: number,
    session?: ClientSession
  ): Promise<void> {
    await Contador.updateOne(
      { nombre_secuencia: nombreSecuencia },
      { $setOnInsert: { nombre_secuencia: nombreSecuencia, secuencia: secuenciaInicial } },
      { upsert: true, session }
    )
  }

  /**
   * Incrementa en 1 de forma atómica la secuencia del contador y retorna el documento actualizado.
   */
  async incrementarSecuencia(
    nombreSecuencia: string,
    session?: ClientSession
  ): Promise<IContador | null> {
    return await Contador.findOneAndUpdate(
      { nombre_secuencia: nombreSecuencia },
      { $inc: { secuencia: 1 } },
      { returnDocument: 'after', session }
    )
  }
}

export const contadorRepository = new ContadorRepository()
