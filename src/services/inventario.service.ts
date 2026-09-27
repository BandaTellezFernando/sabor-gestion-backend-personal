// src/services/inventario.service.ts
import Receta from '../models/Receta'
import Plato from '../models/Plato'

// ─── Helpers ────────────────────────────────────────────────────────────────

function debeExcluirIngrediente(observacion: string, nombreIngrediente: string): boolean {
  if (!observacion) return false
  const regex = new RegExp(`(?:sin|no\\s+poner|quitar|evitar)\\s+${nombreIngrediente.trim()}`, 'i')
  return regex.test(observacion)
}

// ─── Validador Centralizado de Disponibilidad ───────────────────────────────

export interface ResultadoValidacionIngredientes {
  success: boolean
  errores: string[]
  faltantes: Array<{ ingrediente: string; plato: string }>
}

export async function validarDisponibilidadIngredientes(
  items: { platoId: string; cantidad: number; observacion?: string }[]
): Promise<ResultadoValidacionIngredientes> {
  const errores: string[] = []
  const faltantes: Array<{ ingrediente: string; plato: string }> = []

  for (const item of items) {
    const plato = await Plato.findById(item.platoId)
    const nombrePlato = plato ? plato.nombre : 'Plato Desconocido'

    const receta = await Receta.findOne({ plato: item.platoId }).populate(
      'ingredientes.ingrediente'
    )

    // 1. REGLA ESTRICTA: El plato debe tener una receta configurada
    if (!receta || !receta.ingredientes || receta.ingredientes.length === 0) {
      errores.push(`El plato "${nombrePlato}" no tiene una receta configurada.`)
      continue
    }

    // 2. REGLA DE DISPONIBILIDAD: Todos los ingredientes requeridos deben estar disponibles
    for (const reqIng of receta.ingredientes) {
      const ingredienteDoc = reqIng.ingrediente as any
      if (!ingredienteDoc || !ingredienteDoc.nombre) continue

      // Si el cliente especificó "sin X", no exigimos ese ingrediente
      if (debeExcluirIngrediente(item.observacion || '', ingredienteDoc.nombre)) continue

      if (!ingredienteDoc.disponible) {
        errores.push(
          `El ingrediente "${ingredienteDoc.nombre}" no está disponible para preparar: ${nombrePlato}.`
        )
        faltantes.push({
          ingrediente: ingredienteDoc.nombre,
          plato: nombrePlato
        })
      }
    }
  }

  return {
    success: errores.length === 0,
    errores,
    faltantes
  }
}
