//src/repositories/codigo-verificacion.repo.ts
import CodigoVerificacion, { ICodigoVerificacion } from '../models/CodigoVerificacion'

export class CodigoVerificacionRepository {
  async crear(
    usuarioId: string,
    codigo: string,
    tipo: string,
    expiracion: Date
  ): Promise<ICodigoVerificacion> {
    const nuevoCodigo = new CodigoVerificacion({
      usuarioId,
      codigo,
      tipo,
      expira_en: expiracion
    })

    return await nuevoCodigo.save()
  }

  async buscarPorCodigoYUsuario(
    codigo: string,
    usuarioId: string,
    tipo: string
  ): Promise<ICodigoVerificacion | null> {
    return await CodigoVerificacion.findOne({
      codigo,
      usuarioId,
      tipo,
      usado: false,
      expira_en: { $gt: new Date() } // Solo trae si aún no ha expirado
    })
  }

  async marcarComoUtilizado(id: string): Promise<void> {
    await CodigoVerificacion.findByIdAndUpdate(id, { usado: true })
  }
}
