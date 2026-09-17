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
