// src/services/pedido.service.ts
// ─── Servicio de Lógica de Negocio de Pedidos ──────────────────────────────
import Pedido from '../models/Pedido'
import { ESTADOS_PEDIDO } from '../utils/constants'
import { procesarDescuentoPedido } from './inventario.service'

// ─── Tipos de retorno ────────────────────────────────────────────────────────

export interface ResultadoActualizarEstado {
  pedidoActualizado: any
  /** true cuando el nuevo estado activa la alerta "¡Listo!" hacia los meseros */
  disparaAlertaListo: boolean
}

// ─── Clase principal ─────────────────────────────────────────────────────────

export class PedidoService {
  /**
   * Formatea un pedido poblado para enviar su estructura completa
   * a los websockets o endpoints de la Caja.
   */
  static formatearPayloadCaja(pedido: any, mesaOverride?: any) {
    const mesa = mesaOverride || pedido.mesa
    const itemsSubtotal =
      pedido.detalles && pedido.detalles.length > 0
        ? pedido.detalles.reduce(
            (sum: number, d: any) => sum + Number(d.precioUnitario || 0) * Number(d.cantidad || 1),
            0
          )
        : pedido.subtotalCierre || pedido.total || 0

    const subtotalBase = Number(pedido.subtotalCierre || itemsSubtotal || 0)
    const montoDesc = Number(pedido.montoDescuento || 0)
    const montoProp = Number(pedido.montoPropina || 0)
    const totalCalc = Number(Math.max(0, subtotalBase - montoDesc + montoProp).toFixed(2))

    return {
      pedidoId: pedido._id,
      codigo: pedido.codigo || `PED-${String(pedido._id).slice(-4).toUpperCase()}`,
      mesaId: mesa?._id || mesa,
      mesaNombre: mesa?.numero || 'Mesa sin asignar',
      meseroNombre: pedido.usuario
        ? `${pedido.usuario.nombre || ''} ${pedido.usuario.apellido || ''}`.trim()
        : 'Sin mesero',
      subtotal: subtotalBase,
      subtotalCierre: subtotalBase,
      descuento: montoDesc,
      montoDescuento: montoDesc,
      propina: montoProp,
      montoPropina: montoProp,
      total: totalCalc,
      clienteNombre: pedido.clienteNombre,
      clienteCI: pedido.clienteCI,
      clienteNIT: pedido.clienteNIT,
      tiempoEsperaMinutos:
        pedido.updatedAt || pedido.createdAt || pedido.fechaHora
          ? Math.floor(
              (Date.now() -
                new Date(pedido.updatedAt || pedido.createdAt || pedido.fechaHora).getTime()) /
                60000
            )
          : 0,
      items:
        pedido.detalles?.map((detalle: any) => ({
          platoId: detalle.plato?._id || detalle.plato,
          nombre: detalle.plato?.nombre || 'Plato no disponible',
          cantidad: detalle.cantidad,
          precioUnitario: detalle.precioUnitario,
          subtotal: detalle.subtotal,
          observacion: detalle.observacion
        })) || []
    }
  }

  /**
   * Lógica de negocio pura para actualizar el estado de un pedido.
   */
  static async actualizarEstadoService(
    pedidoId: string,
    nuevoEstado: string
  ): Promise<ResultadoActualizarEstado> {
    // 1. Obtener el estado ANTERIOR del pedido para evitar el bug del bucle de inventario
    const pedidoAnterior = await Pedido.findById(pedidoId)
    if (!pedidoAnterior) {
      throw new Error('PEDIDO_NO_ENCONTRADO')
    }

    const yaEstabaListo =
      pedidoAnterior.estado === ESTADOS_PEDIDO.ENTREGADO || pedidoAnterior.estado === 'Listos'

    // 2. Actualizar estado en BD con populate completo
    const pedidoActualizado = await Pedido.findByIdAndUpdate(
      pedidoId,
      { estado: nuevoEstado },
      { returnDocument: 'after' }
    )
      .populate('mesa', 'numero')
      .populate('detalles.plato', 'nombre precio')
      .populate('usuario', 'nombre apellido')

    if (!pedidoActualizado) {
      throw new Error('PEDIDO_NO_ENCONTRADO')
    }

    // 3. Determinar si el nuevo estado activa la alerta "¡Listo!"
    const esNuevoEstadoListo = nuevoEstado === ESTADOS_PEDIDO.ENTREGADO || nuevoEstado === 'Listos'

    // 🔴 EL CANDADO PROTECTOR: Solo descuenta si es nuevo el estado "Listo"
    const disparaAlertaListo = esNuevoEstadoListo && !yaEstabaListo

    // 4. Descontar inventario si el pedido pasa a "listo" por primera vez o se le agregaron cosas
    if (disparaAlertaListo) {
      try {
        await procesarDescuentoPedido(pedidoActualizado._id.toString())
      } catch (inventarioError) {
        console.error(
          `[Inventario] Error al procesar descuento para pedido ${pedidoActualizado._id}:`,
          inventarioError
        )
      }
    }

    return { pedidoActualizado, disparaAlertaListo }
  }
}
