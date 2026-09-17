//src/services/email.service.ts

export async function enviarCorreo(to: string, subject: string, html: string): Promise<void> {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      service_id: 'service_2yoc0sp',
      template_id: 'template_sr8quju',
      user_id: 'oIGr4df0_jZjQxMPf',
      accessToken: 'I9PJZT1PLOp3DirS-4Xn1',
      template_params: {
        to_email: to,
        subject: subject,
        html_content: html
      }
    })
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }
}

export class EmailService {
  async enviarEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await enviarCorreo(to, subject, html)
    } catch (error) {
      console.error('Error enviando correo:', error)
      throw new Error('No se pudo enviar el email')
    }
  }

  generarTemplateVerificacion(codigo: string, nombreCompleto: string): string {
    return `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <h2>Verifica tu acceso al sistema</h2>
        <p>Hola ${nombreCompleto},</p>
        <p>Tu cÃ³digo de seguridad es:</p>
        <h1 style="color: #2563eb; letter-spacing: 5px;">${codigo}</h1>
        <p>Expira en 15 minutos.</p>
      </div>
    `
  }
}
