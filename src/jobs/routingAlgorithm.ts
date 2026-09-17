//src/jobs/routingAlgorithm.ts
interface Coordenada {
  lat: number
  lng: number
}

// Fórmula de Haversine para ruteo secuencial
export const calcularDistancia = (coord1: Coordenada, coord2: Coordenada): number => {
  const R = 6371e3 // Radio de la tierra en metros
  const rad = Math.PI / 180
  const lat1 = coord1.lat * rad
  const lat2 = coord2.lat * rad
  const deltaLat = (coord2.lat - coord1.lat) * rad
  const deltaLng = (coord2.lng - coord1.lng) * rad

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Retorna distancia en metros
}

// Ordena un arreglo de destinos basándose en la ubicación actual del repartidor
export const ruteoSecuencial = (
  ubicacionActual: Coordenada,
  destinos: Coordenada[]
): Coordenada[] => {
  return destinos.sort((a, b) => {
    return calcularDistancia(ubicacionActual, a) - calcularDistancia(ubicacionActual, b)
  })
}
