// src/services/inventario.service.ts
import { PlatoRepository, platoRepository } from '../repositories/plato.repo'
import { RecetaRepository, recetaRepository } from '../repositories/receta.repo'

// ─── Interfaces y Types ─────────────────────────────────────────────────────

export interface ResultadoValidacionIngredientes {
  success: boolean
  errores: string[]
  faltantes: Array<{ ingrediente: string; plato: string }>
}

export interface ItemValidacionInventario {
  platoId: string
  cantidad: number
  observacion?: string
}

export interface IngredientePoblado {
  _id?: unknown
  nombre: string
  unidadMedida?: string
  disponible?: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function debeExcluirIngrediente(observacion: string, nombreIngrediente: string): boolean {
  if (!observacion) return false
  const regex = new RegExp(`(?:sin|no\\s+poner|quitar|evitar)\\s+${nombreIngrediente.trim()}`, 'i')
  return regex.test(observacion)
}

function esIngredientePoblado(ing: unknown): ing is IngredientePoblado {
  return (
    typeof ing === 'object' &&
    ing !== null &&
    'nombre' in ing &&
    typeof ing.nombre === 'string'
  )
}

// ─── Servicio de Inventario ─────────────────────────────────────────────────

export class InventarioService {
  private platoRepo: PlatoRepository
  private recetaRepo: RecetaRepository

  constructor(
    platoRepo: PlatoRepository = platoRepository,
    recetaRepo: RecetaRepository = recetaRepository
  ) {
    this.platoRepo = platoRepo
    this.recetaRepo = recetaRepo
  }

  /**
   * Validador Centralizado de Disponibilidad de Ingredientes
   * Verifica la existencia del plato, su receta asociada y la disponibilidad de sus ingredientes.
   */
  async validarDisponibilidadIngredientes(
    items: ItemValidacionInventario[]
  ): Promise<ResultadoValidacionIngredientes> {
    const errores: string[] = []
    const faltantes: Array<{ ingrediente: string; plato: string }> = []

    for (const item of items) {
      const plato = await this.platoRepo.buscarPorId(String(item.platoId))
      const nombrePlato = plato ? plato.nombre : 'Plato Desconocido'

      const receta = await this.recetaRepo.buscarPorPlatoIdConIngredientes(String(item.platoId))

      // 1. REGLA ESTRICTA: El plato debe tener una receta configurada
      if (!receta || !receta.ingredientes || receta.ingredientes.length === 0) {
        errores.push(`El plato "${nombrePlato}" no tiene una receta configurada.`)
        continue
      }

      // 2. REGLA DE DISPONIBILIDAD: Todos los ingredientes requeridos deben estar disponibles
      for (const reqIng of receta.ingredientes) {
        const ingredienteDoc: unknown = reqIng.ingrediente
        if (!esIngredientePoblado(ingredienteDoc) || !ingredienteDoc.nombre) continue

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
}

export const inventarioService = new InventarioService()

/**
 * Función exportada para mantener compatibilidad con consumidores existentes (ej. PedidoService)
 */
export async function validarDisponibilidadIngredientes(
  items: ItemValidacionInventario[]
): Promise<ResultadoValidacionIngredientes> {
  return await inventarioService.validarDisponibilidadIngredientes(items)
}
