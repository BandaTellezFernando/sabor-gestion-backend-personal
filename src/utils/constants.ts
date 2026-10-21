//src/utils/constants.ts
// ─── Constantes Globales del Sistema ─────────────────────────────────────────

export const ESTADOS_MESA = {
  LIBRE: 'Libre',
  OCUPADA: 'Ocupada',
  CUENTA_SOLICITADA: 'Cuenta Solicitada'
} as const

export const ESTADOS_PEDIDO = {
  BORRADOR: 'BORRADOR',
  PENDIENTE: 'PENDIENTE',
  ABIERTO: 'ABIERTO',
  EN_PREPARACION: 'EN_PREPARACION',
  LISTO: 'LISTO',
  ENTREGADO: 'ENTREGADO',
  CANCELADO: 'CANCELADO',
  CERRADO: 'CERRADO'
} as const

export const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'QR'] as const
export type MetodoPago = (typeof METODOS_PAGO)[number]

const DEVELOPMENT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
]

const CONFIGURED_ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean)

export const ALLOWED_ORIGINS: string[] = Array.from(
  new Set([
    ...(process.env.NODE_ENV === 'production'
      ? []
      : DEVELOPMENT_ALLOWED_ORIGINS),
    ...CONFIGURED_ALLOWED_ORIGINS,
  ])
)
