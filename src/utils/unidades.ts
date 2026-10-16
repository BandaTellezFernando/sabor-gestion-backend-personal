export const UNIDADES_MEDIDA = [
  'kg',
  'g',
  'mg',
  'L',
  'ml',
  'unidad',
] as const

export type UnidadMedida = (typeof UNIDADES_MEDIDA)[number]
export type FamiliaUnidad = 'masa' | 'volumen' | 'conteo'

const FAMILIAS: Record<UnidadMedida, FamiliaUnidad> = {
  kg: 'masa',
  g: 'masa',
  mg: 'masa',
  L: 'volumen',
  ml: 'volumen',
  unidad: 'conteo',
}

const FACTORES_A_BASE: Record<UnidadMedida, number> = {
  kg: 1_000_000,
  g: 1_000,
  mg: 1,
  L: 1_000,
  ml: 1,
  unidad: 1,
}

export function esUnidadMedida(
  unidad: unknown,
): unidad is UnidadMedida {
  return (
    typeof unidad === 'string' &&
    UNIDADES_MEDIDA.some((permitida) => permitida === unidad)
  )
}

export function obtenerFamiliaUnidad(
  unidad: string,
): FamiliaUnidad | null {
  return esUnidadMedida(unidad) ? FAMILIAS[unidad] : null
}

export function validarCantidadParaUnidad(
  cantidad: number,
  unidad: string,
): boolean {
  if (
    !esUnidadMedida(unidad) ||
    !Number.isFinite(cantidad) ||
    cantidad < 0
  ) {
    return false
  }

  if (FAMILIAS[unidad] === 'conteo' && !Number.isInteger(cantidad)) {
    return false
  }

  return true
}

export function convertirCantidad(
  cantidad: number,
  unidadOrigen: string,
  unidadDestino: string,
): number {
  if (!esUnidadMedida(unidadOrigen) || !esUnidadMedida(unidadDestino)) {
    throw new Error('La unidad de medida no está permitida.')
  }

  if (FAMILIAS[unidadOrigen] !== FAMILIAS[unidadDestino]) {
    throw new Error(
      `No se puede convertir ${unidadOrigen} a ${unidadDestino}: las unidades pertenecen a familias diferentes.`,
    )
  }

  if (!validarCantidadParaUnidad(cantidad, unidadOrigen)) {
    throw new Error(
      `La cantidad ${cantidad} no es válida para la unidad ${unidadOrigen}.`,
    )
  }

  const cantidadBase = cantidad * FACTORES_A_BASE[unidadOrigen]
  const resultado = cantidadBase / FACTORES_A_BASE[unidadDestino]

  if (!Number.isFinite(resultado)) {
    throw new Error('El resultado de la conversión no es válido.')
  }

  return Number(resultado.toFixed(9))
}
