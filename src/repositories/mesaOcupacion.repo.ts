// src/repositories/mesaOcupacion.repo.ts
import { Types, ClientSession } from 'mongoose'
import MesaOcupacionTemporal, { IMesaOcupacionTemporal } from '../models/MesaOcupacionTemporal'

export { IMesaOcupacionTemporal } from '../models/MesaOcupacionTemporal'

export interface MesaOcupacionCrearDatos {
  mesaId: Types.ObjectId | string
  usuarioId: Types.ObjectId | string
  creadaEn?: Date
  expiraEn: Date
}

export class MesaOcupacionRepository {
  /**
   * Crea y persiste un nuevo registro de ocupación temporal
   */
  async crear(
    datos: MesaOcupacionCrearDatos,
    session?: ClientSession
  ): Promise<IMesaOcupacionTemporal> {
    const nueva = new MesaOcupacionTemporal({
      mesaId: new Types.ObjectId(datos.mesaId),
      usuarioId: new Types.ObjectId(datos.usuarioId),
      creadaEn: datos.creadaEn || new Date(),
      expiraEn: datos.expiraEn
    })
    return await nueva.save({ session })
  }

  /**
   * Busca la ocupación temporal asociada a una mesa
   */
  async buscarPorMesaId(
    mesaId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<IMesaOcupacionTemporal | null> {
    return await MesaOcupacionTemporal.findOne({
      mesaId: new Types.ObjectId(mesaId)
    }).session(session || null)
  }

  /**
   * Elimina la ocupación temporal de una mesa por su ID de mesa
   */
  async eliminarPorMesaId(
    mesaId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<IMesaOcupacionTemporal | null> {
    return await MesaOcupacionTemporal.findOneAndDelete({
      mesaId: new Types.ObjectId(mesaId)
    }).session(session || null)
  }

  /**
   * Obtiene todas las ocupaciones temporales expiradas
   */
  async buscarExpirados(ahora?: Date): Promise<IMesaOcupacionTemporal[]> {
    const fecha = ahora || new Date()
    return await MesaOcupacionTemporal.find({
      expiraEn: { $lte: fecha }
    })
  }

  /**
   * Elimina una ocupación por su _id
   */
  async eliminarPorId(id: string | Types.ObjectId): Promise<IMesaOcupacionTemporal | null> {
    return await MesaOcupacionTemporal.findByIdAndDelete(id)
  }
}

export const mesaOcupacionRepository = new MesaOcupacionRepository()
