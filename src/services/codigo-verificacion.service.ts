//src/services/codigo-verificacion.service.ts
import { CodigoVerificacionRepository } from '../repositories/codigo-verificacion.repo'
import { EmailService } from './email.service'

export class CodigoVerificacionService {
  private codigoRepo = new CodigoVerificacionRepository()
  private emailService = new EmailService()

  async procesarEnvioDeCodigo(
    email: string,
    nombre: string,
    apellido: string,
    usuarioId: string
  ): Promise<void> {
    // 1. Generar código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString()

    // 2. Calcular expiración (15 mins)
    const expiracion = new Date()
    expiracion.setMinutes(expiracion.getMinutes() + 15)

    // 3. Guardar en BD
    await this.codigoRepo.crear(usuarioId, codigo, 'verificacion_email', expiracion)

    // 4. Enviar Email
    const nombreCompleto = `${nombre} ${apellido}`
    const html = this.emailService.generarTemplateVerificacion(codigo, nombreCompleto)

    await this.emailService.enviarEmail(email, 'Verifica tu cuenta', html)
  }

  async validarCodigoIngresado(codigo: string, usuarioId: string): Promise<boolean> {
    const registro = await this.codigoRepo.buscarPorCodigoYUsuario(
      codigo,
      usuarioId,
      'verificacion_email'
    )

    if (!registro) return false

    await this.codigoRepo.marcarComoUtilizado(registro._id as unknown as string)
    return true
  }
}
