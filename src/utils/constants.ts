//src/utils/constants.ts
// ─── Constantes Globales del Sistema ─────────────────────────────────────────

export const ESTADOS_MESA = {
  LIBRE: 'Libre',
  OCUPADA: 'Ocupada',
  RESERVADA: 'Reservada',
  CUENTA_SOLICITADA: 'Cuenta Solicitada'
} as const

export const ESTADOS_PEDIDO = {
  ABIERTO: 'ABIERTO',
  EN_PREPARACION: 'EN_PREPARACION',
  ENTREGADO: 'ENTREGADO',
  CANCELADO: 'CANCELADO',
  CERRADO: 'CERRADO'
} as const
