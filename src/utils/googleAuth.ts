import { OAuth2Client } from 'google-auth-library'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export interface GoogleUserPayload {
  email: string
  nombre: string
  apellidos: string
  picture?: string
}

export async function verifyGoogleToken(token: string): Promise<GoogleUserPayload> {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID no está configurado en las variables de entorno')
  }

  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID
  })

  const payload = ticket.getPayload()
  if (!payload) {
    throw new Error('Token de Google inválido o vacío')
  }

  const email = payload.email
  if (!email) {
    throw new Error('El token de Google no contiene un correo electrónico válido')
  }

  const nombre = payload.given_name || payload.name || 'Usuario'
  const apellidos = payload.family_name || ''

  return {
    email: email.trim().toLowerCase(),
    nombre: nombre.trim(),
    apellidos: apellidos.trim(),
    picture: payload.picture
  }
}
