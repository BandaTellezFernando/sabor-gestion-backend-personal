// src/services/pedido.service.ts
// ─── Servicio de Lógica de Negocio y Orquestación de Pedidos ──────────────────
import { Types } from 'mongoose'
import {
  PedidoRepository,
  pedidoRepository,
  IPedido
} from '../repositories/pedido.repo'
import { MesaRepository, mesaRepository } from '../repositories/mesa.repo'
import {
  MesaOcupacionRepository,
  mesaOcupacionRepository
} from '../repositories/mesaOcupacion.repo'
import { PlatoRepository, platoRepository } from '../repositories/plato.repo'
import { ESTADOS_MESA, ESTADOS_PEDIDO } from '../utils/constants'
import {
  obtenerFechaBolivia,
  formatearFechaBolivia
} from '../utils/fechaBolivia'
import { validarDisponibilidadIngredientes } from './inventario.service'
import { generarSiguienteCodigoPedido } from './contador.service'

// ─── Clase de Error de Dominio ───────────────────────────────────────────────

export class PedidoServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public extra?: Record<string, any>
  ) {
    super(message)
    this.name = 'PedidoServiceError'
  }
}

// ─── Interfaces de Resultados ────────────────────────────────────────────────

export interface ResultadoActualizarEstado {
  pedidoActualizado: any
  /** true cuando el nuevo estado activa la alerta "¡Listo!" hacia los meseros */
  disparaAlertaListo: boolean
}

export interface ResultadoCrearPedido {
  nuevoPedido: any
  pedidoPoblado: any
  mesaActualizada: any
}

export interface ResultadoCancelarPedido {
  pedido: any
  mesaLiberada: any
  nuevoEstadoMesa: string
  statusSocket: string
}

export interface ResultadoActualizarPedido {
  pedidoActualizado: any
  pedidoDoc: any
  mesaReactivada: any
  reabierto: boolean
  cajeroAsignado?: any
}

export interface ResultadoSolicitarCuenta {
  payload: any
  mesaActualizada: any
  cajeroAsignado?: any
}

// ─── Clase Principal PedidoService ───────────────────────────────────────────

export class PedidoService {
  constructor(
    private pedidoRepo: PedidoRepository = pedidoRepository,
    private mesaRepo: MesaRepository = mesaRepository,
    private platoRepo: PlatoRepository = platoRepository,
    private mesaOcupacionRepo: MesaOcupacionRepository = mesaOcupacionRepository
  ) {}

  /**
   * Helper para adjuntar campos de fecha formateada para Bolivia
   */
  static agregarFechaBoliviaPedido(pedido: any): any {
    if (!pedido) return pedido
    const pedidoPlano = typeof pedido.toObject === 'function' ? pedido.toObject() : pedido
    const { _id, codigo, fechaHoraBolivia, fechaHora, ...restoPedido } = pedidoPlano

    return {
      _id,
      codigo,
      ...restoPedido,
      fechaHoraBolivia:
        fechaHoraBolivia || (fechaHora ? formatearFechaBolivia(fechaHora) : undefined),
      fechaHora
    }
  }

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
      codigo: pedido.codigo,
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
   * Procesa cada detalle de pedido obteniendo el precio real y nombre desde PlatoRepository,
   * calculando subtotal = precioReal * cantidad y validando la disponibilidad de recetas e ingredientes.
   */
  private async procesarDetallesPedido(detalles: any[]): Promise<{
    detallesCalculados: any[]
    subtotal: number
  }> {
    if (!detalles || !Array.isArray(detalles) || detalles.length === 0) {
      throw new PedidoServiceError(400, 'El pedido debe incluir al menos un plato en detalles')
    }

    const detallesCalculados: any[] = []

    for (const d of detalles) {
      const platoId = d.plato?._id || d.plato || d.platoId
      if (!platoId) {
        throw new PedidoServiceError(400, 'Cada detalle debe especificar un plato')
      }

      const cantidad = Number(d.cantidad)
      if (!Number.isInteger(cantidad) || cantidad < 1) {
        throw new PedidoServiceError(
          400,
          'La cantidad de cada plato debe ser un número entero mayor o igual a 1'
        )
      }

      const platoDoc = await this.platoRepo.buscarPorId(String(platoId))
      if (!platoDoc) {
        throw new PedidoServiceError(404, `Plato no encontrado con ID: ${platoId}`)
      }

      const precioReal = Number(platoDoc.precio)
      if (isNaN(precioReal) || precioReal < 0) {
        throw new PedidoServiceError(400, `El precio del plato "${platoDoc.nombre}" no es válido`)
      }

      const subtotalDetalle = Number((precioReal * cantidad).toFixed(2))

      detallesCalculados.push({
        plato: platoDoc._id,
        nombrePlato: platoDoc.nombre || 'Plato',
        cantidad,
        precioUnitario: precioReal,
        subtotal: subtotalDetalle,
        observacion: String(d.observacion || '').trim()
      })
    }

    // 🛡️ ESCUDO: Validar ingredientes antes de permitir registrar los detalles
    const itemsParaValidar = detallesCalculados.map((item) => ({
      platoId: item.plato.toString(),
      cantidad: item.cantidad,
      observacion: item.observacion
    }))

    const validacion = await validarDisponibilidadIngredientes(itemsParaValidar)
    if (!validacion.success) {
      throw new PedidoServiceError(
        400,
        'No se puede registrar el pedido por restricciones de receta o ingredientes',
        {
          errores: validacion.errores,
          faltantes: validacion.faltantes
        }
      )
    }

    const subtotal = Number(
      detallesCalculados.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)
    )

    return { detallesCalculados, subtotal }
  }

  /**
   * Valida existencia de mesa, calcula importes mediante PlatoRepository,
   * valida ingredientes, genera correlativo diario PED-XXXX,
   * crea el pedido en BD y actualiza el estado de la mesa a 'Ocupada'.
   */
  async crearPedido(datos: any, usuarioAuthId?: string): Promise<ResultadoCrearPedido> {
    // 1. Validar existencia de mesa si fue enviada (404 si no existe)
    let mesaIdString: string | undefined = undefined
    if (datos.mesa) {
      const mesaId = (datos.mesa._id || datos.mesa).toString()
      mesaIdString = mesaId
      const mesaExiste = await this.mesaRepo.buscarPorId(mesaId)
      if (!mesaExiste) {
        throw new PedidoServiceError(404, 'Mesa no encontrada')
      }

      // Validar si la mesa tiene ocupación temporal activa perteneciente a otro usuario
      const ocupacion = await this.mesaOcupacionRepo.buscarPorMesaId(mesaId)
      if (ocupacion && ocupacion.expiraEn > new Date()) {
        if (usuarioAuthId && ocupacion.usuarioId.toString() !== usuarioAuthId.toString()) {
          throw new PedidoServiceError(
            409,
            'La mesa está ocupada temporalmente por otro mesero.'
          )
        }
      }
    }

    // 2. Procesar detalles con precios reales de Plato, calcular subtotales y validar recetas/ingredientes
    const { detallesCalculados, subtotal } = await this.procesarDetallesPedido(datos.detalles)

    // 3. Validar montos de descuento y propina (no negativos)
    const montoDescuento = Number(datos.montoDescuento || 0)
    const montoPropina = Number(datos.montoPropina || 0)

    if (montoDescuento < 0) {
      throw new PedidoServiceError(400, 'El monto de descuento no puede ser negativo')
    }
    if (montoPropina < 0) {
      throw new PedidoServiceError(400, 'El monto de propina no puede ser negativo')
    }

    // 4. Calcular total final en backend (ignorando cualquier total manipulado por el frontend)
    const totalCalculado = Number(
      Math.max(0, subtotal - montoDescuento + montoPropina).toFixed(2)
    )

    // 5. Generar código diario secuencial y fechas Bolivia
    const pedidoId = new Types.ObjectId()
    const { codigo, fechaDiaBolivia } = await generarSiguienteCodigoPedido()
    const fechaHora = obtenerFechaBolivia()
    const usuarioResponsable = usuarioAuthId || datos.usuario

    const nuevoPedidoDoc = await this.pedidoRepo.crear({
      ...datos,
      _id: pedidoId,
      codigo,
      fechaDiaBolivia,
      detalles: detallesCalculados,
      total: totalCalculado,
      subtotalCierre: subtotal,
      montoDescuento,
      montoPropina,
      mesa: mesaIdString || undefined,
      usuario: usuarioResponsable,
      fechaHoraBolivia: formatearFechaBolivia(fechaHora),
      fechaHora
    })

    // 6. Eliminar la ocupación temporal si existía para esta mesa (convertida a comanda real)
    if (mesaIdString) {
      await this.mesaOcupacionRepo.eliminarPorMesaId(mesaIdString)
    }

    // 7. Poblar datos para vista de cocina
    const pedidoPoblado = await this.pedidoRepo.buscarPorIdPoblado(nuevoPedidoDoc._id)

    // 8. AUTOMATIZACIÓN: Cambiar estado de la mesa a 'Ocupada'
    let mesaActualizada: any = null
    if (mesaIdString) {
      mesaActualizada = await this.mesaRepo.actualizarEstado(
        mesaIdString,
        ESTADOS_MESA.OCUPADA
      )
    }

    return {
      nuevoPedido: PedidoService.agregarFechaBoliviaPedido(nuevoPedidoDoc),
      pedidoPoblado,
      mesaActualizada
    }
  }

  /**
   * Obtiene pedidos aplicando filtros de búsqueda o reportes de cierre según los query params
   */
  async obtenerPedidos(query: Record<string, any>): Promise<any[]> {
    const { hoy, fecha, mesa, activo, cajero, mesero, reportesCierre } = query

    // Reportes de Cierre de las últimas 48 horas
    if (reportesCierre === 'true') {
      const limite = obtenerFechaBolivia()
      limite.setHours(limite.getHours() - 48)
      const cierres = await this.pedidoRepo.buscarReportesCierre(limite)
      return cierres.map((cierre: any) => {
        const cierrePlano = typeof cierre.toObject === 'function' ? cierre.toObject() : cierre
        const { fechaCierreBolivia, fechaCierre, __v, ...restoCierre } = cierrePlano

        return {
          ...restoCierre,
          fechaCierreBolivia:
            fechaCierreBolivia || (fechaCierre ? formatearFechaBolivia(fechaCierre) : undefined),
          fechaCierre
        }
      })
    }

    const filtro: any = {}

    if (hoy === 'true') {
      const inicioHoy = new Date()
      inicioHoy.setHours(0, 0, 0, 0)
      filtro.$or = [{ createdAt: { $gte: inicioHoy } }, { updatedAt: { $gte: inicioHoy } }]
    } else if (fecha) {
      const inicio = new Date(`${fecha}T00:00:00`)
      const fin = new Date(`${fecha}T23:59:59.999`)
      filtro.createdAt = { $gte: inicio, $lte: fin }
    }

    if (mesa) {
      filtro.mesa = mesa
    }

    if (activo === 'true') {
      filtro.estado = {
        $in: [
          ESTADOS_PEDIDO.ABIERTO,
          ESTADOS_PEDIDO.EN_PREPARACION,
          ESTADOS_PEDIDO.ENTREGADO
        ]
      }
    }

    if (cajero) {
      const cajeroFiltro = {
        $or: [
          { cajeroAsignado: cajero },
          { cajeroAsignado: null },
          { cajeroAsignado: { $exists: false } }
        ]
      }
      if (filtro.$or) {
        filtro.$and = [{ $or: filtro.$or }, cajeroFiltro]
        delete filtro.$or
      } else {
        filtro.$or = cajeroFiltro.$or
      }
    }

    if (mesero) {
      filtro.usuario = mesero
    }

    const pedidos = await this.pedidoRepo.buscarConFiltros(filtro)
    return pedidos.map((pedido) => PedidoService.agregarFechaBoliviaPedido(pedido))
  }

  /**
   * Cancela un pedido y libera la mesa
   */
  async cancelarPedido(id: string): Promise<ResultadoCancelarPedido> {
    const pedido = await this.pedidoRepo.buscarPorId(id)

    if (!pedido) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    if (
      pedido.estado !== ESTADOS_PEDIDO.ABIERTO &&
      pedido.estado !== ESTADOS_PEDIDO.EN_PREPARACION
    ) {
      throw new PedidoServiceError(
        400,
        `No se puede cancelar un pedido en estado "${pedido.estado}". Solo se pueden cancelar pedidos en estado "${ESTADOS_PEDIDO.ABIERTO}" o "${ESTADOS_PEDIDO.EN_PREPARACION}".`
      )
    }

    pedido.estado = ESTADOS_PEDIDO.CANCELADO
    await this.pedidoRepo.guardar(pedido)

    let mesaLiberada: any = null
    const nuevoEstado = 'Libre'

    // Si el pedido tenía una mesa asignada, liberarla
    if (pedido.mesa) {
      mesaLiberada = await this.mesaRepo.actualizarEstado(
        pedido.mesa.toString(),
        nuevoEstado
      )
    }

    return {
      pedido: PedidoService.agregarFechaBoliviaPedido(pedido),
      mesaLiberada,
      nuevoEstadoMesa: nuevoEstado,
      statusSocket: 'Disponible'
    }
  }

  /**
   * Lógica de negocio para actualizar el estado de un pedido (Cocina)
   */
  async actualizarEstadoService(
    pedidoId: string,
    nuevoEstado: string
  ): Promise<ResultadoActualizarEstado> {
    const estadosValidos = Object.values(ESTADOS_PEDIDO) as string[]
    if (!estadosValidos.includes(nuevoEstado)) {
      throw new PedidoServiceError(
        400,
        `Estado no válido: "${nuevoEstado}". Estados permitidos: ${estadosValidos.join(', ')}`
      )
    }

    // 1. Obtener estado ANTERIOR del pedido
    const pedidoAnterior = await this.pedidoRepo.buscarPorId(pedidoId)
    if (!pedidoAnterior) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    // Validar máquina de estados para cocina:
    // ABIERTO -> ABIERTO (idempotente), EN_PREPARACION
    // EN_PREPARACION -> EN_PREPARACION (idempotente), ENTREGADO
    // ENTREGADO -> ENTREGADO (idempotente)
    // CANCELADO -> (terminal, no permite transiciones)
    // CERRADO -> (terminal, no permite transiciones)
    const transicionesPermitidas: Record<string, string[]> = {
      [ESTADOS_PEDIDO.ABIERTO]: [ESTADOS_PEDIDO.ABIERTO, ESTADOS_PEDIDO.EN_PREPARACION],
      [ESTADOS_PEDIDO.EN_PREPARACION]: [ESTADOS_PEDIDO.EN_PREPARACION, ESTADOS_PEDIDO.ENTREGADO],
      [ESTADOS_PEDIDO.ENTREGADO]: [ESTADOS_PEDIDO.ENTREGADO],
      [ESTADOS_PEDIDO.CANCELADO]: [],
      [ESTADOS_PEDIDO.CERRADO]: []
    }

    const permitidos = transicionesPermitidas[pedidoAnterior.estado] || []
    if (!permitidos.includes(nuevoEstado)) {
      throw new PedidoServiceError(
        400,
        `No se permite la transición de estado desde "${pedidoAnterior.estado}" hacia "${nuevoEstado}".`
      )
    }

    const yaEstabaListo =
      pedidoAnterior.estado === ESTADOS_PEDIDO.ENTREGADO || pedidoAnterior.estado === 'Listos'

    // 2. Actualizar estado en BD mediante el repositorio
    const pedidoActualizado = await this.pedidoRepo.actualizarEstado(pedidoId, nuevoEstado)

    if (!pedidoActualizado) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    // 3. Determinar si el nuevo estado activa la alerta "¡Listo!"
    const esNuevoEstadoListo =
      nuevoEstado === ESTADOS_PEDIDO.ENTREGADO || nuevoEstado === 'Listos'
    const disparaAlertaListo = esNuevoEstadoListo && !yaEstabaListo

    return { pedidoActualizado, disparaAlertaListo }
  }

  /**
   * Compatibilidad estática para llamadas heredadas
   */
  static async actualizarEstadoService(
    pedidoId: string,
    nuevoEstado: string
  ): Promise<ResultadoActualizarEstado> {
    return await pedidoService.actualizarEstadoService(pedidoId, nuevoEstado)
  }

  /**
   * Actualiza el contenido de un pedido existente (platos, totales, descuentos, propinas).
   * Reabre a 'ABIERTO' si estaba en 'ENTREGADO' y se agregan detalles.
   */
  async actualizarPedido(id: string, body: any): Promise<ResultadoActualizarPedido> {
    const {
      total,
      detalles,
      clienteNombre,
      clienteCI,
      clienteNIT,
      cajeroAsignado,
      montoDescuento,
      montoPropina,
      subtotalCierre,
      estado
    } = body

    const pedidoAnterior = await this.pedidoRepo.buscarPorId(id)
    if (!pedidoAnterior) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    // 🛡️ Regla de inmutabilidad: Pedidos CERRADO o CANCELADO no admiten modificaciones
    if (
      pedidoAnterior.estado === ESTADOS_PEDIDO.CERRADO ||
      pedidoAnterior.estado === ESTADOS_PEDIDO.CANCELADO
    ) {
      throw new PedidoServiceError(
        400,
        `No se puede modificar un pedido en estado "${pedidoAnterior.estado}".`
      )
    }

    // 🛡️ Regla de autoridad de estado: El cliente NO puede forzar el estado por PUT
    if (estado !== undefined) {
      throw new PedidoServiceError(
        400,
        'No se permite modificar el estado del pedido directamente mediante este endpoint.'
      )
    }

    if (montoDescuento !== undefined && Number(montoDescuento) < 0) {
      throw new PedidoServiceError(400, 'El monto de descuento no puede ser negativo')
    }
    if (montoPropina !== undefined && Number(montoPropina) < 0) {
      throw new PedidoServiceError(400, 'El monto de propina no puede ser negativo')
    }
    if (total !== undefined && Number(total) < 0) {
      throw new PedidoServiceError(400, 'El total no puede ser negativo')
    }
    if (subtotalCierre !== undefined && Number(subtotalCierre) < 0) {
      throw new PedidoServiceError(400, 'El subtotal no puede ser negativo')
    }

    // Allowlist explícita para evitar Mass Assignment
    const updates: Partial<IPedido> & Record<string, any> = {}

    if (detalles !== undefined) {
      const { detallesCalculados, subtotal } = await this.procesarDetallesPedido(detalles)
      updates.detalles = detallesCalculados
      updates.subtotalCierre = subtotal
    }

    // Solo reabrir el pedido a ABIERTO si se están agregando nuevos platos (detalles)
    if (
      pedidoAnterior.estado === ESTADOS_PEDIDO.ENTREGADO &&
      detalles !== undefined
    ) {
      updates.estado = ESTADOS_PEDIDO.ABIERTO
    }

    if (clienteNombre !== undefined) updates.clienteNombre = String(clienteNombre).trim()
    if (clienteCI !== undefined) updates.clienteCI = String(clienteCI).trim()
    if (clienteNIT !== undefined) updates.clienteNIT = String(clienteNIT).trim()
    if (cajeroAsignado !== undefined) updates.cajeroAsignado = cajeroAsignado
    if (montoDescuento !== undefined) updates.montoDescuento = Number(montoDescuento)
    if (montoPropina !== undefined) updates.montoPropina = Number(montoPropina)

    // Autoridad Financiera: subtotal y total siempre calculados por backend
    const finalSub =
      updates.subtotalCierre !== undefined
        ? updates.subtotalCierre
        : Number(pedidoAnterior?.subtotalCierre || pedidoAnterior?.total || 0)

    const finalDesc =
      updates.montoDescuento !== undefined
        ? updates.montoDescuento
        : Number(pedidoAnterior?.montoDescuento || 0)

    const finalProp =
      updates.montoPropina !== undefined
        ? updates.montoPropina
        : Number(pedidoAnterior?.montoPropina || 0)

    if (
      updates.detalles !== undefined ||
      updates.montoDescuento !== undefined ||
      updates.montoPropina !== undefined
    ) {
      updates.total = Number(Math.max(0, finalSub - finalDesc + finalProp).toFixed(2))
      if (
        !updates.subtotalCierre &&
        (!pedidoAnterior?.subtotalCierre || pedidoAnterior.subtotalCierre === 0)
      ) {
        updates.subtotalCierre = finalSub
      }
    }

    const pedidoActualizado = await this.pedidoRepo.actualizar(id, updates)
    if (!pedidoActualizado) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    let mesaReactivada: any = null
    if (pedidoActualizado.mesa && updates.estado === ESTADOS_PEDIDO.ABIERTO) {
      const mesaId =
        typeof pedidoActualizado.mesa === 'object'
          ? (pedidoActualizado.mesa as any)._id
          : pedidoActualizado.mesa

      mesaReactivada = await this.mesaRepo.actualizarEstado(
        mesaId.toString(),
        ESTADOS_MESA.OCUPADA
      )
    }

    return {
      pedidoActualizado: PedidoService.agregarFechaBoliviaPedido(pedidoActualizado),
      pedidoDoc: pedidoActualizado,
      mesaReactivada,
      reabierto: updates.estado === ESTADOS_PEDIDO.ABIERTO,
      cajeroAsignado
    }
  }

  /**
   * Obtiene pedidos de mesas con cuenta solicitada formateados para caja
   */
  async obtenerPedidosPendientesCobro(cajero?: string): Promise<any[]> {
    const todasLasMesas = await this.mesaRepo.buscarTodos()
    const mesasConCuentaSolicitada = todasLasMesas.filter(
      (mesa) => mesa.estado === ESTADOS_MESA.CUENTA_SOLICITADA
    )

    const mesaIds = mesasConCuentaSolicitada.map((mesa) => mesa._id)
    const pedidos = await this.pedidoRepo.buscarPendientesCobro(mesaIds, cajero)

    return pedidos.map((pedido: any) => ({
      ...PedidoService.formatearPayloadCaja(pedido),
      fechaHoraBolivia: pedido.fechaHora ? formatearFechaBolivia(pedido.fechaHora) : undefined
    }))
  }

  /**
   * Solicita cuenta de un pedido y cambia el estado de la mesa a 'Cuenta Solicitada'
   */
  async solicitarCuentaPedido(id: string): Promise<ResultadoSolicitarCuenta> {
    const pedido = await this.pedidoRepo.buscarPorId(id)

    if (!pedido) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    if (!pedido.mesa) {
      throw new PedidoServiceError(
        400,
        'No se puede solicitar cuenta porque el pedido no tiene una mesa asignada.'
      )
    }

    if (
      pedido.estado === ESTADOS_PEDIDO.CANCELADO ||
      pedido.estado === ESTADOS_PEDIDO.CERRADO
    ) {
      throw new PedidoServiceError(
        400,
        'No se puede solicitar cuenta de un pedido que ya está cerrado o cancelado.'
      )
    }

    const mesaActualizada = await this.mesaRepo.actualizarEstado(
      pedido.mesa.toString(),
      ESTADOS_MESA.CUENTA_SOLICITADA
    )

    if (!mesaActualizada) {
      throw new PedidoServiceError(404, 'Mesa no encontrada')
    }

    const pedidoPoblado = await this.pedidoRepo.buscarPorIdPobladoCaja(id)
    const payload = PedidoService.formatearPayloadCaja(pedidoPoblado, mesaActualizada)

    return {
      payload,
      mesaActualizada,
      cajeroAsignado: pedidoPoblado?.cajeroAsignado
    }
  }
}

export const pedidoService = new PedidoService()
