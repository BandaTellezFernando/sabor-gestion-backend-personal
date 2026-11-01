import { Types } from 'mongoose'

export type PlainRecord = Record<string, unknown>

export function isPlainRecord(value: unknown): value is PlainRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

/**
 * Obtiene una representación simple tanto de documentos Mongoose como de
 * resultados lean() o registros JavaScript planos.
 */
export function toPlainRecord(value: unknown): PlainRecord {
  if (!isPlainRecord(value)) return {}

  const toObject = value.toObject
  if (typeof toObject === 'function') {
    const plain = (toObject as () => unknown).call(value)
    if (isPlainRecord(plain)) return plain
  }

  const documentData = value._doc
  if (isPlainRecord(documentData)) return documentData

  return value
}

/** Convierte referencias de MongoDB o DTO poblados a su identificador. */
export function toIdString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value instanceof Types.ObjectId) return value.toString()

  if (isPlainRecord(value)) {
    return toIdString(value._id) ?? toIdString(value.id)
  }

  return undefined
}

export function toOptionalDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  return undefined
}

export function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}
