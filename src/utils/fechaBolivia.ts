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

/**
 * Convierte un período de fechas calendario de Bolivia en instantes Date.
 * "hasta" es inclusiva; hastaExclusivo corresponde a la medianoche del día siguiente.
 * Se usa el huso horario de Bolivia (UTC-04:00), no la zona del servidor.
 */
export const obtenerRangoInclusivoBolivia = (
  desdeTexto: string,
  hastaTexto: string
): { desde: Date; hastaExclusivo: Date } => {
  const crearInicioDia = (valor: string, campo: string): Date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      throw new Error(`${campo} debe tener el formato YYYY-MM-DD.`)
    }

    const comprobacion = new Date(`${valor}T00:00:00Z`)
    if (
      Number.isNaN(comprobacion.getTime()) ||
      comprobacion.toISOString().slice(0, 10) !== valor
    ) {
      throw new Error(`${campo} no es una fecha válida.`)
    }

    return new Date(`${valor}T00:00:00-04:00`)
  }

  const desde = crearInicioDia(desdeTexto, 'La fecha inicial')
  const inicioHasta = crearInicioDia(hastaTexto, 'La fecha final')

  if (inicioHasta.getTime() < desde.getTime()) {
    throw new Error('La fecha final no puede ser anterior a la fecha inicial.')
  }

  const hastaExclusivo = new Date(inicioHasta)
  hastaExclusivo.setUTCDate(hastaExclusivo.getUTCDate() + 1)

  return { desde, hastaExclusivo }
}

