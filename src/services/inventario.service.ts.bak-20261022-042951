// src/services/inventario.service.ts
import { PlatoRepository, platoRepository } from '../repositories/plato.repo'
import { RecetaRepository, recetaRepository } from '../repositories/receta.repo'
import {
  convertirCantidad,
  esUnidadMedida,
  validarCantidadParaUnidad,
} from '../utils/unidades'

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

export interface DetalleConsumoIngrediente {
  platoId: string
  nombrePlato: string
  cantidadPlatos: number
  cantidadNecesariaPorPlato: number
  unidadReceta: string
  cantidadPorPlatoEnStock: number
  unidadStock: string
  consumoTotal: number
  observacion?: string
}

export interface ConsumoIngredientePedido {
  ingredienteId: string
  nombreIngrediente: string
  unidadStock: string
  cantidadTotal: number
  detallePlatos: DetalleConsumoIngrediente[]
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
  async verificarYDescontarStock(
    items: ItemValidacionInventario[],
    session?: any,
  ): Promise<{
    success: boolean
    errores: string[]
    faltantes: any[]
    consumos: ConsumoIngredientePedido[]
  }> {
    const mongoose = require('mongoose')
    const IngredienteModel = mongoose.model('Ingrediente')

    const errores: string[] = []
    const faltantes: any[] = []

    const consumoPorIngrediente = new Map<
      string,
      {
        cantidad: number
        nombreIngrediente: string
        unidadStock: string
        detallePlatos: DetalleConsumoIngrediente[]
      }
    >()

    // 1. Calcular cada consumo y convertirlo a la unidad del stock.
    for (const item of items) {
      if (!Number.isSafeInteger(item.cantidad) || item.cantidad <= 0) {
        errores.push(
          `La cantidad del plato ${item.platoId} debe ser un entero positivo.`,
        )
        continue
      }

      const plato = await this.platoRepo.buscarPorId(String(item.platoId))
      const nombrePlato = plato ? plato.nombre : 'Plato Desconocido'

      const receta = await this.recetaRepo.buscarPorPlatoIdConIngredientes(
        String(item.platoId),
      )

      if (!receta || !receta.ingredientes || receta.ingredientes.length === 0) {
        errores.push(`El plato "${nombrePlato}" no tiene una receta configurada.`)
        faltantes.push({
          plato: nombrePlato,
          mensaje: 'El plato no tiene una receta configurada',
        })
        continue
      }

      for (const reqIng of receta.ingredientes) {
        const ingredienteDoc: any = reqIng.ingrediente

        if (!esIngredientePoblado(ingredienteDoc) || !ingredienteDoc.nombre) {
          errores.push(`No se pudo identificar un ingrediente de "${nombrePlato}".`)
          continue
        }

        if (debeExcluirIngrediente(item.observacion || '', ingredienteDoc.nombre)) {
          continue
        }

        const ingId = String(ingredienteDoc._id || '')
        if (!ingId || ingId === 'undefined') {
          errores.push(`No se pudo identificar el ingrediente "${ingredienteDoc.nombre}".`)
          continue
        }

        const unidadReceta: unknown = reqIng.unidadMedida
        const unidadStock: unknown = ingredienteDoc.unidadMedida
        const cantidadNecesaria = Number(reqIng.cantidadNecesaria)

        let cantidadPorPlatoEnStock: number

        try {
          if (!esUnidadMedida(unidadReceta) || !esUnidadMedida(unidadStock)) {
            throw new Error('La unidad de la receta o del stock falta o no está permitida.')
          }

          if (
            !Number.isFinite(cantidadNecesaria) ||
            cantidadNecesaria <= 0 ||
            !validarCantidadParaUnidad(cantidadNecesaria, unidadReceta)
          ) {
            throw new Error('La cantidad de la receta no es válida para su unidad.')
          }

          cantidadPorPlatoEnStock = convertirCantidad(
            cantidadNecesaria,
            unidadReceta,
            unidadStock,
          )
        } catch (error) {
          const mensaje =
            error instanceof Error ? error.message : 'Unidad incompatible.'

          errores.push(
            `No se puede calcular el consumo de "${ingredienteDoc.nombre}" en "${nombrePlato}": ${mensaje}`,
          )
          continue
        }

        const consumoTotalItem = Number(
          (item.cantidad * cantidadPorPlatoEnStock).toFixed(9),
        )

        if (!Number.isFinite(consumoTotalItem) || consumoTotalItem <= 0) {
          errores.push(
            `El consumo calculado de "${ingredienteDoc.nombre}" no es válido.`,
          )
          continue
        }

        if (!consumoPorIngrediente.has(ingId)) {
          consumoPorIngrediente.set(ingId, {
            cantidad: 0,
            nombreIngrediente: ingredienteDoc.nombre,
            unidadStock: unidadStock as string,
            detallePlatos: [],
          })
        }

        const data = consumoPorIngrediente.get(ingId)!
        data.cantidad = Number((data.cantidad + consumoTotalItem).toFixed(9))
        data.detallePlatos.push({
          platoId: String(item.platoId),
          nombrePlato,
          cantidadPlatos: item.cantidad,
          cantidadNecesariaPorPlato: cantidadNecesaria,
          unidadReceta: unidadReceta as string,
          cantidadPorPlatoEnStock,
          unidadStock: unidadStock as string,
          consumoTotal: consumoTotalItem,
          observacion: item.observacion || '',
        })
      }
    }

    if (errores.length > 0) {
      return { success: false, errores, faltantes, consumos: [] }
    }

    // 2. Verificar el stock dentro de la sesión actual.
    const ingredienteIds = Array.from(consumoPorIngrediente.keys())
    const ingredientesDB = await IngredienteModel.find({
      _id: { $in: ingredienteIds },
    }).session(session)

    const mapIngredientes = new Map<string, any>()
    for (const ing of ingredientesDB) {
      mapIngredientes.set(String(ing._id), ing)
    }

    for (const [ingId, reqData] of consumoPorIngrediente.entries()) {
      const ingrediente = mapIngredientes.get(ingId)

      if (!ingrediente) {
        errores.push(`No se encontró en la base de datos el ingrediente "${reqData.nombreIngrediente}".`)
        continue
      }

      if (ingrediente.unidadMedida !== reqData.unidadStock) {
        errores.push(
          `La unidad de stock de "${ingrediente.nombre}" cambió durante el cálculo. Vuelve a intentarlo.`,
        )
        continue
      }

      if (ingrediente.stockActual < reqData.cantidad) {
        faltantes.push({
          ingrediente: ingrediente.nombre,
          disponible: ingrediente.stockActual,
          requerido: reqData.cantidad,
          faltante: Number((reqData.cantidad - ingrediente.stockActual).toFixed(9)),
          unidad: ingrediente.unidadMedida,
        })
      }
    }

    if (faltantes.length > 0 || errores.length > 0) {
      return { success: false, errores, faltantes, consumos: [] }
    }

    // 3. Descontar atómicamente: si el stock cambió, no permitir un saldo negativo.
    for (const [ingId, reqData] of consumoPorIngrediente.entries()) {
      const updated = await IngredienteModel.findOneAndUpdate(
        { _id: ingId, stockActual: { $gte: reqData.cantidad } },
        [
          {
            $set: {
              stockActual: {
                $round: [
                  { $subtract: ['$stockActual', reqData.cantidad] },
                  9,
                ],
              },
            },
          },
        ],
        { session, returnDocument: 'after', updatePipeline: true },
      )

      if (!updated) {
        throw new Error(
          'Condición de carrera: el stock de un ingrediente cambió y ya no es suficiente.',
        )
      }
    }

    const consumos: ConsumoIngredientePedido[] = Array.from(
      consumoPorIngrediente.entries(),
    ).map(([ingredienteId, data]) => ({
      ingredienteId,
      nombreIngrediente: data.nombreIngrediente,
      unidadStock: data.unidadStock,
      cantidadTotal: data.cantidad,
      detallePlatos: data.detallePlatos,
    }))

    return { success: true, errores: [], faltantes: [], consumos }
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
