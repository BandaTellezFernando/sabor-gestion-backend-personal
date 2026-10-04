//src/utils/constants.ts
// ─── Constantes Globales del Sistema ─────────────────────────────────────────

export const ESTADOS_MESA = {
  LIBRE: 'Libre',
  OCUPADA: 'Ocupada',
  CUENTA_SOLICITADA: 'Cuenta Solicitada'
} as const

export const ESTADOS_PEDIDO = {
  ABIERTO: 'ABIERTO',
  EN_PREPARACION: 'EN_PREPARACION',
  ENTREGADO: 'ENTREGADO',
  CANCELADO: 'CANCELADO',
  CERRADO: 'CERRADO'
} as const

export const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'QR'] as const
export type MetodoPago = (typeof METODOS_PAGO)[number]

export const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://quirquinita.onrender.com',
  'https://tis-pied.vercel.app'
] as const
