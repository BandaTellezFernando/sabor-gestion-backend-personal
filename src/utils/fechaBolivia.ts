//src/utils/fechaBolivia.ts
export const obtenerFechaBolivia = (): Date => {
  const ahora = new Date()

  return new Date(
    ahora.toLocaleString('en-US', {
      timeZone: 'America/La_Paz'
    })
  )
}

export const formatearFechaBolivia = (fecha: Date | string): string => {
  return new Date(fecha).toLocaleString('es-BO', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

export const obtenerFechaISO_Bolivia = (fecha: Date | string = new Date()): string => {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

/**
 * Formatea una fecha en hora de Bolivia (America/La_Paz)
 * en formato ISO amigable: YYYY-MM-DD HH:mm:ss
 */
export const formatearFechaHoraBolivia = (fecha?: Date | string | null): string => {
  if (!fecha) return ''
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d)
}

