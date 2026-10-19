import { ClientSession, Types } from 'mongoose'
import QrPagoToken, { IQrPagoToken } from '../models/QrPagoToken'

export class QrPagoTokenRepository {
  async crearOActualizarParaPedido(
    pedidoId: string | Types.ObjectId,
    tokenHash: string,
    expiraEn: Date,
    session?: ClientSession,
    cajeroId?: string | Types.ObjectId | null
  ): Promise<IQrPagoToken | null> {
    return QrPagoToken.findOneAndUpdate(
      { pedido: pedidoId },
      {
        $set: {
          tokenHash,
          expiraEn,
          consumidoEn: null,
          cajeroId: cajeroId ?? null
        },
        $setOnInsert: {
          pedido: pedidoId
        }
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true,
        setDefaultsOnInsert: true,
        session
      }
    ).exec()
  }

  async buscarPorHash(
    tokenHash: string,
    session?: ClientSession
  ): Promise<IQrPagoToken | null> {
    const consulta = QrPagoToken.findOne({ tokenHash })

    if (session) {
      consulta.session(session)
    }

    return consulta.exec()
  }

  async consumirSiValido(
    tokenHash: string,
    session: ClientSession
  ): Promise<IQrPagoToken | null> {
    const ahora = new Date()

    return QrPagoToken.findOneAndUpdate(
      {
        tokenHash,
        expiraEn: { $gt: ahora },
        consumidoEn: null
      },
      {
        $set: {
          consumidoEn: ahora
        }
      },
      {
        returnDocument: 'after',
        runValidators: true,
        session
      }
    ).exec()
  }
}

export const qrPagoTokenRepository = new QrPagoTokenRepository()
