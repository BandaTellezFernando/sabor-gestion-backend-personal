// src/services/pago.service.ts
import mongoose, { Types } from 'mongoose'
import { PagoRepository, pagoRepository } from '../repositories/pago.repo'
import { PedidoRepository, pedidoRepository } from '../repositories/pedido.repo'
import { MesaRepository, mesaRepository } from '../repositories/mesa.repo'
import { enviarCorreo } from './email.service'
import {
  generarPlantillaFacturaHTML,
  DatosFactura,
  ItemFactura
} from '../utils/facturaTemplate'
import {
  obtenerFechaBolivia,
  formatearFechaBolivia
} from '../utils/fechaBolivia'
import {
  ProcesarPagoDTO,
  ComprobantePago,
  ResultadoProcesarPago
} from '../types/pago.types'

/**
 * Error de dominio tipado para operaciones del módulo Pagos
 */
export class PagoServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public extra?: Record<string, any>
  ) {
    super(message)
    this.name = 'PagoServiceError'
  }
}

/**
 * Servicio de lógica de negocio y orquestación transaccional del módulo Pagos
 */
export class PagoService {
  constructor(
    private pagoRepo: PagoRepository = pagoRepository,
    private pedidoRepo: PedidoRepository = pedidoRepository,
    private mesaRepo: MesaRepository = mesaRepository
  ) {}

  /**
   * Genera el código QR estático con el identificador del pedido y su monto total,
   * guardando la URL generada en el pedido.
   */
  async generarPagoQR(pedidoId: string): Promise<{ qrUrl: string; total: number }> {
    const pedido = await this.pedidoRepo.buscarPorId(pedidoId)

    if (!pedido) {
      throw new PagoServiceError(404, 'Pedido no encontrado')
    }

    const datosPago = `SABOR_GESTION_ID_${pedido._id}_TOTAL_${pedido.total}`
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${datosPago}`

    pedido.qrUrl = qrUrl
    await this.pedidoRepo.guardar(pedido)

    return {
      qrUrl,
      total: pedido.total
    }
  }

  /**
   * Caso de uso principal: Procesa el pago final de un pedido, ejecuta la transacción atómica
   * en MongoDB (Pedido CERRADO + creación de Pago + actualización de Mesa) y calcula el comprobante.
   */
  async procesarPagoFinal(dto: ProcesarPagoDTO): Promise<ResultadoProcesarPago> {
    const {
      pedidoId,
      metodoPago,
      porcentajeDescuento = 0,
      porcentajePropina = 0,
      montoDescuento: bodyMontoDescuento,
      montoPropina: bodyMontoPropina,
      cajeroAsignado: bodyCajeroAsignado,
      cajeroId: authCajeroId
    } = dto

    // ─── 1. VALIDACIONES PREVIAS (Fuera de la transacción) ──────────────────────
    const pedido = await this.pedidoRepo.buscarPorIdPobladoCaja(pedidoId)

    if (!pedido) {
      throw new PagoServiceError(404, 'Pedido no encontrado')
    }

    if (pedido.estado === 'CERRADO') {
      throw new PagoServiceError(400, 'Este pedido ya ha sido pagado y cerrado.')
    }

    // Regla flexibilizada: Solo se bloquea si está cancelado. ABIERTO, EN_PREPARACION y ENTREGADO sí pueden cobrarse.
    if (pedido.estado === 'CANCELADO') {
      throw new PagoServiceError(400, 'No se puede cobrar un pedido cancelado.')
    }

    const metodoPagoNormalizado = String(metodoPago || '').trim()
    const metodosValidos = ['Efectivo', 'Tarjeta', 'QR']
    const metodoPagoValido =
      metodosValidos.find((m) => m.toLowerCase() === metodoPagoNormalizado.toLowerCase()) ||
      'Efectivo'

    // ─── 2. CÁLCULOS FINANCIEROS (Puros, fuera de la transacción) ───────────────
    const ped: any = pedido

    // Autoridad financiera: El subtotal proviene exclusivamente de datos confiables del Pedido.
    // El subtotalCierre provisto en el body por el cliente es completamente ignorado.
    let subtotal = Number(ped.subtotalCierre || 0)

    if (subtotal <= 0 && Array.isArray(ped.detalles) && ped.detalles.length > 0) {
      subtotal = ped.detalles.reduce(
        (acc: number, item: any) =>
          acc + Number(item.subtotal || Number(item.precioUnitario || 0) * Number(item.cantidad || 1)),
        0
      )
    }

    if (subtotal <= 0) {
      throw new PagoServiceError(
        400,
        'No se pudo determinar un subtotal válido para el pedido a partir de sus detalles o registro de cierre.'
      )
    }

    const montoDescuento =
      bodyMontoDescuento !== undefined && bodyMontoDescuento !== null
        ? Number(bodyMontoDescuento)
        : porcentajeDescuento > 0
          ? subtotal * (porcentajeDescuento / 100)
          : Number(ped.montoDescuento || 0)

    const montoPropina =
      bodyMontoPropina !== undefined && bodyMontoPropina !== null
        ? Number(bodyMontoPropina)
        : porcentajePropina > 0
          ? subtotal * (porcentajePropina / 100)
          : Number(ped.montoPropina || 0)

    const totalFinal = Math.max(0, subtotal - montoDescuento + montoPropina)
    const cajeroId = authCajeroId || bodyCajeroAsignado || ped.cajeroAsignado || null

    // ─── 3. TRANSACCIÓN ATÓMICA MONGODB (Exclusiva de PagoService) ───────────────
    const session = await mongoose.startSession()
    session.startTransaction()

    let nuevoEstadoMesa = 'Libre'
    let nuevoPago: any = null
    let mesaLiberada: any = null

    try {
      // 3.1 Actualizar Pedido
      pedido.estado = 'CERRADO'
      pedido.total = totalFinal
      ped.metodoPago = metodoPagoValido
      ped.montoDescuento = montoDescuento
      ped.montoPropina = montoPropina
      ped.subtotalCierre = subtotal
      if (cajeroId) {
        ped.cajeroAsignado = cajeroId
      }

      await this.pedidoRepo.guardar(pedido, session)

      const fechaEnvioCaja = obtenerFechaBolivia()
      const fechaPago = obtenerFechaBolivia()

      // 3.2 Crear Pago mediante PagoRepository
      nuevoPago = await this.pagoRepo.crear(
        {
          codigoPago: `PAG-${String(pedido._id).slice(-6).toUpperCase()}`,
          codigoPedido: pedido.codigo,
          pedido: pedido._id,
          mesa: (pedido.mesa as any)?._id || pedido.mesa,
          mesero: (pedido.usuario as any)?._id || pedido.usuario,
          cajero: cajeroId,
          nombreCliente: ped.clienteNombre || 'Consumidor Final',
          ci: ped.clienteCI || '',
          nit: ped.clienteNIT || '',
          subtotal: subtotal,
          descuento: montoDescuento,
          propina: montoPropina,
          totalFinal: totalFinal,
          metodoPago: metodoPagoValido,
          estadoPago: 'Pagado',
          fechaEnvioCajaBolivia: formatearFechaBolivia(fechaEnvioCaja),
          fechaEnvioCaja,
          fechaPagoBolivia: formatearFechaBolivia(fechaPago),
          fechaPago
        },
        session
      )

      // 3.3 Liberar Mesa
      if (pedido.mesa) {
        const mesaId = ((pedido.mesa as any)._id || pedido.mesa).toString()
        nuevoEstadoMesa = 'Libre'
        mesaLiberada = await this.mesaRepo.actualizarEstado(mesaId, nuevoEstadoMesa, session)
      }

      await session.commitTransaction()
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      session.endSession()
    }

    // ─── 4. CONSTRUCCIÓN DEL COMPROBANTE DE PAGO (Contrato Frontend) ─────────────
    const meseroNombre = pedido.usuario
      ? `${(ped.usuario as any).nombre || ''} ${(ped.usuario as any).apellido || ''}`.trim()
      : 'Sin mesero'

    const fechaComprobante = obtenerFechaBolivia()

    const comprobante: ComprobantePago = {
      pedidoId: pedido._id,
      meseroNombre,
      subtotal,
      montoDescuento,
      montoPropina,
      descuentoAplicado: montoDescuento,
      propinaAplicada: montoPropina,
      total: totalFinal,
      totalPagado: totalFinal,
      metodoPago: ped.metodoPago,
      cajeroAsignado: ped.cajeroAsignado,
      fechaBolivia: formatearFechaBolivia(fechaComprobante),
      fecha: fechaComprobante
    }

    return {
      pedidoActualizado: pedido,
      nuevoPago,
      mesaLiberada,
      nuevoEstadoMesa,
      statusSocketMesa: 'Disponible',
      comprobante
    }
  }

  /**
   * Obtiene los datos poblados del pedido requeridos para emitir los WebSockets
   * en la simulación de pago QR móvil.
   */
  async obtenerPedidoParaSimulacion(pedidoId: string): Promise<any> {
    const pedido = await this.pedidoRepo.buscarPorIdPoblado(pedidoId)

    if (!pedido) {
      throw new PagoServiceError(404, 'Pedido no encontrado')
    }

    return pedido
  }

  /**
   * Construye el comprobante en formato HTML utilizando la plantilla pura
   * y envía el correo electrónico a través de EmailService.
   */
  async enviarReciboCorreo(
    pedidoId: string,
    email: string,
    clienteNombre?: string,
    clienteCI?: string
  ): Promise<void> {
    if (!email) {
      throw new PagoServiceError(400, 'Debe proporcionar un correo electrónico')
    }

    const pedido = await this.pedidoRepo.buscarPorIdPoblado(pedidoId)

    if (!pedido) {
      throw new PagoServiceError(404, 'Pedido no encontrado')
    }

    const ped: any = pedido
    const mesaId = (ped.mesa as any)?._id || ped.mesa
    const mesaDoc = mesaId ? await this.mesaRepo.buscarPorId(mesaId.toString()) : null

    const codigo = ped.codigo
    const subtotal = Number(ped.subtotalCierre || ped.total || 0)
    const descuento = Number(ped.montoDescuento || 0)
    const propina = Number(ped.montoPropina || 0)
    const totalFinal = subtotal - descuento + propina

    const mesaNombre = mesaDoc?.numero || (ped.mesa as any)?.numero || 'Barra'
    const meseroNombre = ped.usuario
      ? `${(ped.usuario as any).nombre || ''} ${(ped.usuario as any).apellido || ''}`.trim()
      : 'Mesero'
    const fecha = new Date().toLocaleString('es-BO')

    const finalClienteNombre = clienteNombre || ped.clienteNombre || 'Consumidor Final'
    const finalClienteCI = clienteCI || ped.clienteCI || ped.clienteNIT || 'S/N'

    const esMesaVIP =
      mesaDoc?.tipo === 'vip' ||
      (ped.mesa as any)?.tipo === 'vip' ||
      (ped.mesa as any)?.type === 'vip'

    const items: ItemFactura[] = (ped.detalles || ped.items || []).map((item: any) => {
      const nombre = item.nombre || item.plato?.nombre || 'Plato'
      const cantidad = item.cantidad || 1
      const pu = Number(item.precioUnitario || item.plato?.precio || 0)
      const subt = Number(item.subtotal || pu * cantidad)
      return {
        nombre,
        cantidad,
        precioUnitario: pu,
        subtotal: subt
      }
    })

    const datosFactura: DatosFactura = {
      codigo,
      mesaNombre,
      meseroNombre,
      clienteNombre: finalClienteNombre,
      clienteCI: finalClienteCI,
      subtotal,
      descuento,
      propina,
      totalFinal,
      metodoPago: ped.metodoPago || 'Efectivo',
      fecha,
      items,
      esMesaVIP
    }

    const htmlDelRecibo = generarPlantillaFacturaHTML(datosFactura)
    await enviarCorreo(email, 'Comprobante de Pago - ' + codigo, htmlDelRecibo)
  }
}

export const pagoService = new PagoService()
