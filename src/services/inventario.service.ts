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

  /**
   * Agrupa los consumos de todos los platos, verifica el stock numéricamente
   * y lo descuenta de la base de datos atómicamente.
   */
  async verificarYDescontarStock(items: ItemValidacionInventario[], session?: any): Promise<{ success: boolean; errores: string[]; faltantes: any[] }> {
    const mongoose = require('mongoose')
    const IngredienteModel = mongoose.model('Ingrediente')
    
    const errores: string[] = []
    const faltantes: any[] = []
    
    // 1. Agrupar consumos
    const consumoPorIngrediente = new Map<string, { cantidad: number; nombrePlatos: Set<string> }>()
    
    for (const item of items) {
      const plato = await this.platoRepo.buscarPorId(String(item.platoId))
      const nombrePlato = plato ? plato.nombre : 'Plato Desconocido'
      
      const receta = await this.recetaRepo.buscarPorPlatoIdConIngredientes(String(item.platoId))
      if (!receta || !receta.ingredientes || receta.ingredientes.length === 0) {
        errores.push(`El plato no tiene una receta configurada`)
        faltantes.push({ plato: nombrePlato, mensaje: 'El plato no tiene una receta configurada' })
        continue
      }
      
      for (const reqIng of receta.ingredientes) {
        const ingredienteDoc: any = reqIng.ingrediente
        if (!esIngredientePoblado(ingredienteDoc) || !ingredienteDoc.nombre) continue
        
        if (debeExcluirIngrediente(item.observacion || '', ingredienteDoc.nombre)) continue
        
        const ingId = String((ingredienteDoc as any)._id)
        const consumoTotalItem = item.cantidad * reqIng.cantidadNecesaria
        
        if (!consumoPorIngrediente.has(ingId)) {
          consumoPorIngrediente.set(ingId, { cantidad: 0, nombrePlatos: new Set() })
        }
        const data = consumoPorIngrediente.get(ingId)!
        data.cantidad += consumoTotalItem
        data.nombrePlatos.add(nombrePlato)
      }
    }
    
    if (errores.length > 0) {
      return { success: false, errores, faltantes: faltantes.map(f => ({ plato: f.plato, mensaje: f.mensaje })) }
    }
    
    // 2. Verificar stock
    const ingredienteIds = Array.from(consumoPorIngrediente.keys())
    const ingredientesDB = await IngredienteModel.find({ _id: { $in: ingredienteIds } }).session(session)
    
    const mapIngredientes = new Map<string, any>()
    for (const ing of ingredientesDB) {
      mapIngredientes.set(String(ing._id), ing)
    }
    
    for (const [ingId, reqData] of consumoPorIngrediente.entries()) {
      const ingrediente = mapIngredientes.get(ingId)
      if (!ingrediente) {
        errores.push(`Ingrediente no encontrado en BD.`)
        continue
      }
      
      if (ingrediente.stockActual < reqData.cantidad) {
        faltantes.push({
          ingrediente: ingrediente.nombre,
          disponible: ingrediente.stockActual,
          requerido: reqData.cantidad,
          faltante: Number((reqData.cantidad - ingrediente.stockActual).toFixed(3)),
          unidad: ingrediente.unidadMedida
        })
      }
    }
    
    if (faltantes.length > 0 || errores.length > 0) {
      return { success: false, errores, faltantes }
    }
    
    // 3. Descontar stock
    for (const [ingId, reqData] of consumoPorIngrediente.entries()) {
      const updated = await IngredienteModel.findOneAndUpdate(
        { _id: ingId, stockActual: { $gte: reqData.cantidad } },
        { $inc: { stockActual: -reqData.cantidad } },
        { session, returnDocument: 'after' }
      )
      if (!updated) {
        // Concurrency error
        throw new Error(`Condición de carrera: El stock de un ingrediente cambió y ya no es suficiente.`)
      }
    }
    
    return { success: true, errores: [], faltantes: [] }
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
