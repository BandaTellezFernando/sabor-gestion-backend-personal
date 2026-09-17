// src/services/inventario.service.ts
import mongoose from 'mongoose'
import Pedido from '../models/Pedido'
import Receta from '../models/Receta'
import Ingrediente, { IIngrediente } from '../models/Ingrediente'
import MovimientoInventario from '../models/MovimientoInventario'
import AlertaStock from '../models/AlertaStock'
import { getIO } from '../socket/socket'
import Plato from '../models/Plato'

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcularEstado(stockActual: number, stockMinimo: number): IIngrediente['estado'] {
  if (stockActual <= 0) return 'Agotado'
  if (stockActual <= stockMinimo) return 'Bajo'
  return 'Disponible'
}

function debeExcluirIngrediente(observacion: string, nombreIngrediente: string): boolean {
  if (!observacion) return false
  const regex = new RegExp(`(?:sin|no\\s+poner|quitar|evitar)\\s+${nombreIngrediente.trim()}`, 'i')
  return regex.test(observacion)
}

async function existeAlertaHoy(ingredienteId: mongoose.Types.ObjectId): Promise<boolean> {
  const inicioDia = new Date()
  inicioDia.setHours(0, 0, 0, 0)

  const finDia = new Date()
  finDia.setHours(23, 59, 59, 999)

  const alerta = await AlertaStock.findOne({
    ingrediente: ingredienteId,
    estado: 'Pendiente',
    fecha: { $gte: inicioDia, $lte: finDia }
  })

  return alerta !== null
}

// ─── NUEVO: Escudo Validador Centralizado ────────────────────────────────────

export async function validarDisponibilidadIngredientes(
  items: { platoId: string; cantidad: number; observacion?: string }[]
): Promise<{ success: boolean; errores: string[] }> {
  // Mapa para acumular cuánto necesitamos de cada ingrediente: { ingredienteId -> requerido, nombres de platos }
  const requerimientos = new Map<string, { requerido: number; platos: Set<string> }>()

  for (const item of items) {
    const receta = await Receta.findOne({ plato: item.platoId }).populate(
      'ingredientes.ingrediente'
    )
    const plato = await Plato.findById(item.platoId)
    const nombrePlato = plato ? plato.nombre : 'Plato Desconocido'

    // Si el plato no tiene receta configurada, lo dejamos pasar sin consumir ingredientes base
    if (!receta || !receta.ingredientes || receta.ingredientes.length === 0) continue

    for (const reqIng of receta.ingredientes) {
      const ingredienteDoc = reqIng.ingrediente as any
      if (!ingredienteDoc || !ingredienteDoc.nombre) continue

      // Si el cliente/mesero escribió "sin papa", no contamos esa papa
      if (debeExcluirIngrediente(item.observacion || '', ingredienteDoc.nombre)) continue

      const idIngStr = ingredienteDoc._id.toString()
      const cantidadTotalNecesaria = reqIng.cantidadNecesaria * item.cantidad

      if (!requerimientos.has(idIngStr)) {
        requerimientos.set(idIngStr, { requerido: 0, platos: new Set() })
      }

      const reqActual = requerimientos.get(idIngStr)!
      reqActual.requerido += cantidadTotalNecesaria
      reqActual.platos.add(nombrePlato)
    }
  }

  const errores: string[] = []

  // Cruzar lo requerido vs lo disponible en la Base de Datos
  for (const [idIngrediente, data] of requerimientos.entries()) {
    const ingredienteBd = await Ingrediente.findById(idIngrediente)
    if (!ingredienteBd) continue

    if (ingredienteBd.stockActual < data.requerido) {
      const faltante = data.requerido - ingredienteBd.stockActual
      errores.push(
        `Faltan ${faltante.toFixed(2)} ${ingredienteBd.unidadMedida} de "${ingredienteBd.nombre}" para poder preparar: ${Array.from(data.platos).join(', ')}.`
      )
    }
  }

  return {
    success: errores.length === 0,
    errores
  }
}
// ─── Servicio principal ──────────────────────────────────────────────────────

/**
 * Procesa el descuento inteligente de inventario calculando la diferencia
 * para evitar el bug de doble descuento.
 */
export async function procesarDescuentoPedido(pedidoId: string): Promise<void> {
  const pedido = await Pedido.findById(pedidoId).populate('detalles.plato', 'nombre')

  if (!pedido || !pedido.detalles || pedido.detalles.length === 0) {
    return
  }

  // 1. Agrupar la cantidad TOTAL real de ingredientes que necesita TODO el pedido
  const totalRequerido = new Map<string, number>()
  const infoIngredientes = new Map<string, any>()

  for (const detalle of pedido.detalles) {
    const platoId = detalle.plato as unknown as mongoose.Types.ObjectId
    const receta = await Receta.findOne({ plato: platoId }).populate('ingredientes.ingrediente')

    if (!receta) continue

    for (const item of receta.ingredientes) {
      const ingDoc = item.ingrediente as any
      if (
        !ingDoc ||
        !ingDoc.nombre ||
        debeExcluirIngrediente(detalle.observacion || '', ingDoc.nombre)
      ) {
        continue
      }

      const idStr = ingDoc._id.toString()
      const aSumar = item.cantidadNecesaria * detalle.cantidad

      totalRequerido.set(idStr, (totalRequerido.get(idStr) || 0) + aSumar)
      infoIngredientes.set(idStr, ingDoc)
    }
  }

  // 2. Descontar solo la diferencia consultando el historial de movimientos
  for (const [idStr, cantidadTotalNecesaria] of totalRequerido.entries()) {
    const movimientosPrevios = await MovimientoInventario.find({
      ingrediente: idStr,
      descripcion: `Consumo por pedido ${pedido.codigo || pedidoId}`,
      tipoMovimiento: 'Salida'
    })

    const yaDescontado = movimientosPrevios.reduce((acc, mov) => acc + mov.cantidad, 0)
    const cantidadFaltanteADescontar = cantidadTotalNecesaria - yaDescontado

    // Si ya descontamos lo necesario (o más), saltamos este ingrediente
    if (cantidadFaltanteADescontar <= 0) continue

    // 3. Aplicar descuento real a la BD
    const ingrediente = await Ingrediente.findById(idStr)
    if (!ingrediente) continue

    const stockAnterior = ingrediente.stockActual
    const nuevoStock = Math.max(0, stockAnterior - cantidadFaltanteADescontar)
    const nuevoEstado = calcularEstado(nuevoStock, ingrediente.stockMinimo)

    ingrediente.stockActual = nuevoStock
    ingrediente.estado = nuevoEstado
    await ingrediente.save()

    // 4. Registrar la salida para que actúe como memoria en el futuro
    await MovimientoInventario.create({
      ingrediente: ingrediente._id,
      tipoMovimiento: 'Salida',
      cantidad: cantidadFaltanteADescontar,
      descripcion: `Consumo por pedido ${pedido.codigo || pedidoId}`
    })

    // 5. Generar AlertaStock si el stock bajó del mínimo
    if (nuevoStock <= ingrediente.stockMinimo) {
      const yaAlertado = await existeAlertaHoy(ingrediente._id as mongoose.Types.ObjectId)
      if (!yaAlertado) {
        const alertaGenerada = await AlertaStock.create({
          ingrediente: ingrediente._id,
          stockActual: nuevoStock,
          stockMinimo: ingrediente.stockMinimo,
          estado: 'Pendiente'
        })

        try {
          getIO().emit('inventario:alerta', alertaGenerada)
        } catch (socketError) {
          console.warn('[Inventario] Falló la emisión del WebSocket de alerta')
        }
      }
    }
  }

  console.log(
    `[Inventario] ✅ Descuento inteligente completado para pedido ${pedido.codigo || pedidoId}`
  )
}
