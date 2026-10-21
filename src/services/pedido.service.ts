// src/services/pedido.service.ts
// ─── Servicio de Lógica de Negocio y Orquestación de Pedidos ──────────────────
import mongoose, { Types } from 'mongoose'
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
import type { IDetallePedido } from '../models/Pedido'
import { ESTADOS_MESA, ESTADOS_PEDIDO } from '../utils/constants'
import {
  obtenerFechaBolivia,
  formatearFechaBolivia
} from '../utils/fechaBolivia'
import { generarSiguienteCodigoPedido } from './contador.service'
import { inventarioService } from './inventario.service'
import MovimientoInventario from '../models/MovimientoInventario'
import IngredienteModel from '../models/Ingrediente'
interface PedidoReferenciaPayload extends Record<string, unknown> {
  _id?: Types.ObjectId | string
  numero?: string
  estado?: string
  nombre?: string
  apellido?: string
  apellidos?: string
}

interface DetallePedidoPayload extends Record<string, unknown> {
  _id?: unknown
  plato?: unknown
  nombrePlato?: string
  cantidad?: unknown
  precioUnitario?: unknown
  subtotal?: unknown
  observacion?: string
}

type PedidoPayload = Record<string, unknown> & {
  _id?: Types.ObjectId | string
  codigo?: string
  estado?: string
  mesa?: PedidoReferenciaPayload | null
  usuario?: PedidoReferenciaPayload | null
  detalles?: DetallePedidoPayload[]
  cajeroAsignado?: PedidoReferenciaPayload | null
  recogidoPor?: PedidoReferenciaPayload | null
  recogido?: boolean
  fechaHoraBolivia?: string
  fechaRecogidaBolivia?: string
}

type PedidoFiltro = Parameters<PedidoRepository['buscarConFiltros']>[0]
type MesaActualizadaDoc = Awaited<ReturnType<MesaRepository['actualizarEstado']>>
type PedidoActualizadoDoc = NonNullable<Awaited<ReturnType<PedidoRepository['actualizarEstado']>>>

interface DetalleCocinaPayload extends DetallePedidoPayload {
  plato: unknown
  nombrePlato: string
  cantidad: unknown
  observacion: string
}

interface PedidoCocinaPayload extends PedidoPayload {
  estado: string
  detalles: DetalleCocinaPayload[]
  recogido: boolean
}

interface PayloadCaja {
  pedidoId: unknown
  codigo: unknown
  mesaId: unknown
  mesaNombre: string
  meseroNombre: string
  subtotal: number
  subtotalCierre: number
  descuento: number
  montoDescuento: number
  propina: number
  montoPropina: number
  total: number
  clienteNombre: string | undefined
  clienteCI: string | undefined
  clienteNIT: string | undefined
  tiempoEsperaMinutos: number
  items: Array<{
    platoId: unknown
    nombre: string
    cantidad: unknown
    precioUnitario: unknown
    subtotal: unknown
    observacion: string
  }>
}

interface CrearPedidoEntrada {
  mesa?: unknown
  detalles?: unknown
  usuario?: unknown
  montoDescuento?: unknown
  montoPropina?: unknown
  [key: string]: unknown
}

interface PedidoActualizacionEntrada {
  total?: unknown
  detalles?: unknown
  clienteNombre?: unknown
  clienteCI?: unknown
  clienteNIT?: unknown
  cajeroAsignado?: unknown
  montoDescuento?: unknown
  montoPropina?: unknown
  subtotalCierre?: unknown
  estado?: unknown
  [key: string]: unknown
}

type PedidoUpdates = Partial<Pick<IPedido,
  'detalles' | 'subtotalCierre' | 'estado' | 'recogido' | 'clienteNombre' |
  'clienteCI' | 'clienteNIT' | 'montoDescuento' | 'montoPropina' | 'total'
>> & {
  cajeroAsignado?: Types.ObjectId | null
  fechaRecogida?: Date | null
  recogidoPor?: Types.ObjectId | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  const documentLike = value as { toObject?: () => unknown }
  const plain = typeof documentLike.toObject === 'function'
    ? documentLike.toObject()
    : value
  return isRecord(plain) ? plain : {}
}

function toIdString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value
  if (value instanceof Types.ObjectId) return value.toString()
  if (isRecord(value) && value._id !== undefined) return toIdString(value._id)
  return undefined
}

function toText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return undefined
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return isUnknownArray(value) ? value.filter(isRecord).map(toPlainRecord) : []
}

// ─── Clase de Error de Dominio ───────────────────────────────────────────────

export class PedidoServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'PedidoServiceError'
  }
}

// ─── Interfaces de Resultados ────────────────────────────────────────────────

export interface ResultadoActualizarEstado {
  pedidoActualizado: PedidoActualizadoDoc
  /** true cuando el nuevo estado activa la alerta "¡Listo!" hacia los meseros */
  disparaAlertaListo: boolean
}

export interface ResultadoCrearPedido {
  nuevoPedido: PedidoPayload
  pedidoPoblado: IPedido | null
  mesaActualizada: MesaActualizadaDoc
}

export interface ResultadoEnviarPedidoCocina {
  pedido: IPedido
  yaEnviado: boolean
}

export interface ResultadoCancelarPedido {
  pedido: PedidoPayload
  mesaLiberada: MesaActualizadaDoc
  nuevoEstadoMesa: string
  statusSocket: string
}

export interface ResultadoActualizarPedido {
  pedidoActualizado: PedidoPayload
  pedidoDoc: IPedido
  mesaReactivada: MesaActualizadaDoc
  reabierto: boolean
  cajeroAsignado?: Types.ObjectId | string | null
}

export interface ResultadoSolicitarCuenta {
  payload: PayloadCaja
  mesaActualizada: MesaActualizadaDoc
  cajeroAsignado?: Types.ObjectId | string | null
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
  static agregarFechaBoliviaPedido(pedido: unknown): PedidoPayload {
    const pedidoPlano = toPlainRecord(pedido)
    const { _id, codigo, fechaHoraBolivia, fechaHora, ...restoPedido } = pedidoPlano
    const fechaHoraDate = toDate(fechaHora)
    const fechaRecogidaDate = toDate(restoPedido.fechaRecogida)
    const fechaHoraBoliviaFinal =
      toText(fechaHoraBolivia) ||
      (fechaHoraDate ? formatearFechaBolivia(fechaHoraDate) : undefined)
    const fechaRecogidaBolivia =
      toText(restoPedido.fechaRecogidaBolivia) ||
      (fechaRecogidaDate ? formatearFechaBolivia(fechaRecogidaDate) : undefined)

    return {
      _id: (_id instanceof Types.ObjectId || typeof _id === 'string') ? _id : undefined,
      codigo: toText(codigo),
      ...restoPedido,
      fechaHoraBolivia: fechaHoraBoliviaFinal,
      fechaRecogidaBolivia,
      fechaHora
    } as PedidoPayload
  }

  /**
   * Formatea un pedido poblado para enviar su estructura completa
   * a los websockets o endpoints de la Caja.
   */
  static formatearPayloadCaja(pedido: unknown, mesaOverride?: unknown): PayloadCaja {
    const pedidoPlano = toPlainRecord(pedido)
    const mesaValor = mesaOverride ?? pedidoPlano.mesa
    const mesa = toPlainRecord(mesaValor)
    const detalles = toRecordArray(pedidoPlano.detalles)
    const itemsSubtotal = detalles.length > 0
      ? detalles.reduce(
          (sum, detalle) =>
            sum + toNumber(detalle.precioUnitario) * toNumber(detalle.cantidad, 1),
          0
        )
      : toNumber(pedidoPlano.subtotalCierre || pedidoPlano.total)
    const subtotalBase = toNumber(pedidoPlano.subtotalCierre || itemsSubtotal)
    const montoDesc = toNumber(pedidoPlano.montoDescuento)
    const montoProp = toNumber(pedidoPlano.montoPropina)
    const totalCalc = Number(Math.max(0, subtotalBase - montoDesc + montoProp).toFixed(2))
    const usuario = toPlainRecord(pedidoPlano.usuario)
    const nombreMesero = `${toText(usuario.nombre) || ''} ${toText(usuario.apellido) || toText(usuario.apellidos) || ''}`.trim()
    const fechaEspera = toDate(pedidoPlano.updatedAt ?? pedidoPlano.createdAt ?? pedidoPlano.fechaHora)
    const mesaId = mesa._id ?? (mesaValor instanceof Types.ObjectId || typeof mesaValor === 'string' ? mesaValor : undefined)

    return {
      pedidoId: pedidoPlano._id,
      codigo: pedidoPlano.codigo,
      mesaId,
      mesaNombre: toText(mesa.numero) || 'Mesa sin asignar',
      meseroNombre: nombreMesero || 'Sin mesero',
      subtotal: subtotalBase,
      subtotalCierre: subtotalBase,
      descuento: montoDesc,
      montoDescuento: montoDesc,
      propina: montoProp,
      montoPropina: montoProp,
      total: totalCalc,
      clienteNombre: toText(pedidoPlano.clienteNombre),
      clienteCI: toText(pedidoPlano.clienteCI),
      clienteNIT: toText(pedidoPlano.clienteNIT),
      tiempoEsperaMinutos: fechaEspera
        ? Math.max(0, Math.floor((Date.now() - fechaEspera.getTime()) / 60000))
        : 0,
      items: detalles.map((detalle) => {
        const plato = toPlainRecord(detalle.plato)
        const platoId = plato._id ?? detalle.plato
        return {
          platoId,
          nombre: toText(plato.nombre) || 'Plato no disponible',
          cantidad: detalle.cantidad,
          precioUnitario: detalle.precioUnitario,
          subtotal: detalle.subtotal,
          observacion: toText(detalle.observacion) || ''
        }
      })
    }
  }

  /**
   * Formatea un pedido excluyendo información financiera/de facturación para la vista operativa de cocina
   */
  static formatearPedidoCocina(pedido: unknown): PedidoCocinaPayload {
    const raw = toPlainRecord(pedido)
    const createdAt = toDate(raw.createdAt)
    const fechaHoraBolivia =
      toText(raw.fechaHoraBolivia) ||
      (createdAt ? formatearFechaBolivia(createdAt) : undefined)

    return {
      _id: (raw._id instanceof Types.ObjectId || typeof raw._id === 'string') ? raw._id : undefined,
      codigo: toText(raw.codigo),
      estado: toText(raw.estado) || ESTADOS_PEDIDO.PENDIENTE,
      mesa: raw.mesa as PedidoReferenciaPayload | null | undefined,
      usuario: raw.usuario as PedidoReferenciaPayload | null | undefined,
      detalles: toRecordArray(raw.detalles).map((detalle) => {
        const plato = toPlainRecord(detalle.plato)
        return {
          _id: detalle._id,
          plato: detalle.plato,
          nombrePlato: toText(detalle.nombrePlato) || toText(plato.nombre) || 'Plato',
          cantidad: detalle.cantidad,
          observacion: toText(detalle.observacion) || ''
        }
      }),
      recogido: raw.recogido === true,
      recogidoPor: raw.recogidoPor as PedidoReferenciaPayload | null | undefined,
      fechaRecogida: raw.fechaRecogida,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      fechaHoraBolivia
    }
  }

  /**
   * Procesa cada detalle de pedido obteniendo el precio real y nombre desde PlatoRepository,
   * calculando subtotal = precioReal * cantidad y validando la disponibilidad de recetas e ingredientes.
   */
  private async procesarDetallesPedido(detalles: unknown): Promise<{
    detallesCalculados: IDetallePedido[]
    subtotal: number
  }> {
    if (!isUnknownArray(detalles) || detalles.length === 0) {
      throw new PedidoServiceError(400, 'El pedido debe incluir al menos un plato en detalles')
    }

    const detallesCalculados: IDetallePedido[] = []
    for (const detalleEntrada of detalles) {
      const detalle = toPlainRecord(detalleEntrada)
      const platoEntrada = detalle.plato
      const platoId = toIdString(
        toPlainRecord(platoEntrada)._id || platoEntrada || detalle.platoId
      )
      if (!platoId) {
        throw new PedidoServiceError(400, 'Cada detalle debe especificar un plato')
      }

      const cantidad = toNumber(detalle.cantidad, Number.NaN)
      if (!Number.isInteger(cantidad) || cantidad < 1) {
        throw new PedidoServiceError(
          400,
          'La cantidad de cada plato debe ser un número entero mayor o igual a 1'
        )
      }

      const platoDoc = await this.platoRepo.buscarPorId(platoId)
      if (!platoDoc) {
        throw new PedidoServiceError(404, `Plato no encontrado con ID: ${platoId}`)
      }

      const precioReal = toNumber(platoDoc.precio, Number.NaN)
      if (!Number.isFinite(precioReal) || precioReal < 0) {
        throw new PedidoServiceError(400, `El precio del plato "${platoDoc.nombre}" no es válido`)
      }

      const subtotalDetalle = Number((precioReal * cantidad).toFixed(2))
      detallesCalculados.push({
        plato: platoDoc._id,
        nombrePlato: platoDoc.nombre || 'Plato',
        cantidad,
        precioUnitario: precioReal,
        subtotal: subtotalDetalle,
        observacion: toText(detalle.observacion)?.trim() || ''
      })
    }

    // La validación y el descuento de ingredientes ocurren al enviar a cocina.
    const subtotal = Number(
      detallesCalculados.reduce((sum, detalle) => sum + detalle.subtotal, 0).toFixed(2)
    )
    return { detallesCalculados, subtotal }
  }

  /**
   * Valida la mesa, calcula importes y guarda un pedido BORRADOR con código PED-XXXX.
   * El stock se valida y descuenta únicamente al enviar explícitamente a cocina.
   */
  async crearPedido(
    datosEntrada: unknown,
    usuarioAuthId?: string
  ): Promise<ResultadoCrearPedido> {
    if (!isRecord(datosEntrada)) {
      throw new PedidoServiceError(400, 'Los datos del pedido no son válidos')
    }
    const datos: CrearPedidoEntrada = datosEntrada

    // 1. Validar existencia de mesa y ocupación temporal.
    const mesaIdString = toIdString(datos.mesa)
    if (mesaIdString) {
      const mesaExiste = await this.mesaRepo.buscarPorId(mesaIdString)
      if (!mesaExiste) throw new PedidoServiceError(404, 'Mesa no encontrada')

      const ocupacion = await this.mesaOcupacionRepo.buscarPorMesaId(mesaIdString)
      if (
        ocupacion &&
        ocupacion.expiraEn > new Date() &&
        usuarioAuthId &&
        ocupacion.usuarioId.toString() !== usuarioAuthId
      ) {
        throw new PedidoServiceError(409, 'La mesa está ocupada temporalmente por otro mesero.')
      }
    }

    // 2. Los detalles y precios se validan, pero no se descuenta inventario.
    const { detallesCalculados, subtotal } = await this.procesarDetallesPedido(datos.detalles)
    const montoDescuento = toNumber(datos.montoDescuento)
    const montoPropina = toNumber(datos.montoPropina)
    if (montoDescuento < 0) {
      throw new PedidoServiceError(400, 'El monto de descuento no puede ser negativo')
    }
    if (montoPropina < 0) {
      throw new PedidoServiceError(400, 'El monto de propina no puede ser negativo')
    }

    const totalCalculado = Number(
      Math.max(0, subtotal - montoDescuento + montoPropina).toFixed(2)
    )
    const { codigo, fechaDiaBolivia } = await generarSiguienteCodigoPedido()
    const fechaHora = obtenerFechaBolivia()
    const usuarioResponsable = usuarioAuthId || toIdString(datos.usuario)
    if (!usuarioResponsable || !Types.ObjectId.isValid(usuarioResponsable)) {
      throw new PedidoServiceError(401, 'Usuario no autenticado')
    }

    // Se persiste como BORRADOR para conservar el código PED-XXXX en la vista previa.
    const nuevoPedidoDoc = await this.pedidoRepo.crear({
      ...datos,
      _id: new Types.ObjectId(),
      codigo,
      fechaDiaBolivia,
      estado: ESTADOS_PEDIDO.BORRADOR,
      detalles: detallesCalculados,
      total: totalCalculado,
      subtotalCierre: subtotal,
      montoDescuento,
      montoPropina,
      mesa: mesaIdString,
      usuario: usuarioResponsable,
      fechaHoraBolivia: formatearFechaBolivia(fechaHora),
      fechaHora
    } as Parameters<PedidoRepository['crear']>[0])

    // La ocupación temporal se convierte en una comanda real; el inventario sigue intacto.
    if (mesaIdString) await this.mesaOcupacionRepo.eliminarPorMesaId(mesaIdString)

    const pedidoPoblado = await this.pedidoRepo.buscarPorIdPoblado(nuevoPedidoDoc._id)
    const mesaActualizada = mesaIdString
      ? await this.mesaRepo.actualizarEstado(mesaIdString, ESTADOS_MESA.OCUPADA)
      : null

    return {
      nuevoPedido: PedidoService.agregarFechaBoliviaPedido(nuevoPedidoDoc),
      pedidoPoblado,
      mesaActualizada
    }
  }

  /**
   * Envía un pedido BORRADOR a cocina: valida recetas/stock, descuenta una sola vez,
   * registra el movimiento y cambia a PENDIENTE dentro de una transacción.
   */
  async enviarPedidoCocina(
    id: string,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<ResultadoEnviarPedidoCocina> {
    if (!Types.ObjectId.isValid(id)) {
      throw new PedidoServiceError(400, 'ID de pedido inválido')
    }
    if (!usuarioAuthId || !Types.ObjectId.isValid(usuarioAuthId)) {
      throw new PedidoServiceError(401, 'Usuario no autenticado')
    }

    const pedido = await this.pedidoRepo.buscarPorId(id)
    if (!pedido) throw new PedidoServiceError(404, 'Pedido no encontrado')

    const esAdmin = usuarioRol === 'Administrador' || usuarioRol === 'superadmin'
    const esResponsable = pedido.usuario.toString() === usuarioAuthId
    if (!esResponsable && !esAdmin) {
      throw new PedidoServiceError(
        403,
        'Solo el mesero responsable o un Administrador pueden enviar este pedido a cocina.'
      )
    }

    const estadosYaEnviados: string[] = [
      ESTADOS_PEDIDO.PENDIENTE,
      ESTADOS_PEDIDO.EN_PREPARACION,
      ESTADOS_PEDIDO.LISTO,
      ESTADOS_PEDIDO.ENTREGADO
    ]
    if (estadosYaEnviados.includes(pedido.estado)) {
      const pedidoExistente = await this.pedidoRepo.buscarPorIdPoblado(id)
      if (!pedidoExistente) throw new PedidoServiceError(404, 'Pedido no encontrado')
      return { pedido: pedidoExistente, yaEnviado: true }
    }
    if (pedido.estado !== ESTADOS_PEDIDO.BORRADOR) {
      throw new PedidoServiceError(
        409,
        `No se puede enviar a cocina un pedido en estado "${pedido.estado}".`
      )
    }

    if (pedido.mesa) {
      const mesa = await this.mesaRepo.buscarPorId(pedido.mesa.toString())
      if (!mesa) throw new PedidoServiceError(404, 'Mesa no encontrada')
      if (mesa.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
        throw new PedidoServiceError(
          409,
          'No se puede enviar un pedido cuando la mesa ya solicitó su cuenta.'
        )
      }
    }
    if (!pedido.detalles.length) {
      throw new PedidoServiceError(400, 'No se puede enviar un pedido sin productos.')
    }

    const itemsParaValidar = pedido.detalles.map((detalle) => ({
      platoId: detalle.plato.toString(),
      cantidad: detalle.cantidad,
      observacion: detalle.observacion || ''
    }))

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const validacion = await inventarioService.verificarYDescontarStock(
          itemsParaValidar,
          session
        )
        if (!validacion.success) {
          throw new PedidoServiceError(
            400,
            'No se puede enviar el pedido por restricciones de receta o ingredientes insuficientes.',
            { errores: validacion.errores, faltantes: validacion.faltantes }
          )
        }

        const pedidoActualizado = await this.pedidoRepo.marcarPendienteSiBorrador(id, session)
        if (!pedidoActualizado) {
          throw new PedidoServiceError(
            409,
            'El pedido cambió mientras se procesaba el envío. Consulta su estado antes de reintentar.'
          )
        }

        if (validacion.consumos.length > 0) {
          const consumosMovimiento = validacion.consumos.map((consumo) => ({
            ingrediente: new Types.ObjectId(consumo.ingredienteId),
            nombreIngrediente: consumo.nombreIngrediente,
            unidadStock: consumo.unidadStock,
            cantidadTotal: consumo.cantidadTotal,
            detallePlatos: consumo.detallePlatos.map((detalle) => ({
              plato: new Types.ObjectId(detalle.platoId),
              nombrePlato: detalle.nombrePlato,
              cantidadPlatos: detalle.cantidadPlatos,
              cantidadNecesariaPorPlato: detalle.cantidadNecesariaPorPlato,
              unidadReceta: detalle.unidadReceta,
              cantidadPorPlatoEnStock: detalle.cantidadPorPlatoEnStock,
              unidadStock: detalle.unidadStock,
              consumoTotal: detalle.consumoTotal,
              observacion: detalle.observacion || ''
            }))
          }))

          await MovimientoInventario.create([{
            pedido: pedido._id,
            codigoPedido: pedido.codigo,
            fechaHora: obtenerFechaBolivia(),
            usuario: new Types.ObjectId(usuarioAuthId),
            consumos: consumosMovimiento
          }], { session })
        }
      })
    } catch (error) {
      if (error instanceof PedidoServiceError) throw error
      const mensajeError = error instanceof Error ? error.message : String(error)
      if (
        /Transaction numbers are only allowed/i.test(mensajeError) ||
        /replica set/i.test(mensajeError) ||
        /mongos/i.test(mensajeError)
      ) {
        throw new PedidoServiceError(
          500,
          'MongoDB requiere soporte para transacciones para garantizar el descuento atómico del inventario.'
        )
      }
      console.error('Error transaccional al enviar el pedido a cocina:', error)
      throw new PedidoServiceError(
        500,
        'No se pudo enviar el pedido a cocina. No se confirmó el descuento de inventario.'
      )
    } finally {
      await session.endSession()
    }

    const pedidoEnviado = await this.pedidoRepo.buscarPorIdPoblado(id)
    if (!pedidoEnviado) {
      throw new PedidoServiceError(
        404,
        'El pedido fue procesado, pero no se pudo recuperar su información.'
      )
    }
    return { pedido: pedidoEnviado, yaEnviado: false }
  }

  /**
   * Obtiene un pedido por ID aplicando los permisos de acceso de cada rol.
   */
  async obtenerPedidoPorId(
    id: string,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<PedidoPayload> {
    if (!Types.ObjectId.isValid(id)) {
      throw new PedidoServiceError(400, 'ID de pedido inválido')
    }

    const pedido = await this.pedidoRepo.buscarPorIdCompleto(id)
    if (!pedido) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    const esAdmin = usuarioRol === 'Administrador' || usuarioRol === 'superadmin'
    const esMesero = usuarioRol === 'Mesero'
    const esCocinero = usuarioRol === 'Cocinero'
    const esCajero = usuarioRol === 'Cajero'

    if (esMesero) {
      const meseroId = toIdString(pedido.usuario)
      if (usuarioAuthId && meseroId !== usuarioAuthId) {
        throw new PedidoServiceError(
          403,
          'Acceso denegado: no puedes consultar pedidos asignados a otro mesero.'
        )
      }
    } else if (esCocinero) {
      const enFlujoCocina =
        pedido.estado === ESTADOS_PEDIDO.PENDIENTE ||
        pedido.estado === ESTADOS_PEDIDO.EN_PREPARACION ||
        (pedido.estado === ESTADOS_PEDIDO.LISTO && !pedido.recogido) ||
        // Compatibilidad con pedidos históricos.
        pedido.estado === ESTADOS_PEDIDO.ABIERTO ||
        (pedido.estado === ESTADOS_PEDIDO.ENTREGADO && !pedido.recogido)

      if (!enFlujoCocina) {
        throw new PedidoServiceError(
          403,
          'Acceso denegado: el pedido no se encuentra en el flujo culinario activo.'
        )
      }

      return PedidoService.formatearPedidoCocina(pedido)
    } else if (esCajero) {
      const mesaEstado = toText(toPlainRecord(pedido.mesa).estado)
      const cajeroAsignadoId = toIdString(pedido.cajeroAsignado)
      const tieneCuentaSolicitada = mesaEstado === ESTADOS_MESA.CUENTA_SOLICITADA
      const esCajeroAsignado = Boolean(
        usuarioAuthId && cajeroAsignadoId === usuarioAuthId
      )
      const esCobroPendiente =
        pedido.estado !== ESTADOS_PEDIDO.CANCELADO &&
        (tieneCuentaSolicitada ||
          esCajeroAsignado ||
          pedido.estado === ESTADOS_PEDIDO.ENTREGADO)

      if (!esCobroPendiente && !esCajeroAsignado) {
        throw new PedidoServiceError(
          403,
          'Acceso denegado: el pedido no está en proceso de cobro ni asignado a este cajero.'
        )
      }
    } else if (!esAdmin) {
      throw new PedidoServiceError(403, 'Acceso denegado: rol no autorizado.')
    }

    return PedidoService.agregarFechaBoliviaPedido(pedido)
  }

  /**
   * Obtiene pedidos aplicando filtros de búsqueda o reportes de cierre según los query params
   * y el rol/titularidad del usuario autenticado
   */
  async obtenerPedidos(
    query: Record<string, unknown>,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<PedidoPayload[]> {
    const {
      hoy,
      fecha,
      mesa,
      activo,
      cajero,
      mesero,
      reportesCierre,
      recogido,
      incluirRecogidos
    } = query
    const esAdmin =
      usuarioRol === 'Administrador' || usuarioRol === 'superadmin'
    const esMesero = usuarioRol === 'Mesero'
    const esCocinero = usuarioRol === 'Cocinero'
    // Reportes de Cierre de las últimas 48 horas (Solo Administradores)
    if (reportesCierre === 'true') {
      if (usuarioRol && !esAdmin) {
        throw new PedidoServiceError(
          403,
          'Acceso denegado: solo Administradores pueden consultar reportes de cierre.'
        )
      }
      const limite = obtenerFechaBolivia()
      limite.setHours(limite.getHours() - 48)
      const cierres = await this.pedidoRepo.buscarReportesCierre(limite)
      return cierres.map((cierre: unknown) => {
        const cierrePlano = toPlainRecord(cierre)
        const { fechaCierreBolivia, fechaCierre, ...restoCierre } = cierrePlano
        delete restoCierre.__v
        const fechaCierreDate = toDate(fechaCierre)
        return {
          ...restoCierre,
          fechaCierreBolivia:
            toText(fechaCierreBolivia) ||
            (fechaCierreDate ? formatearFechaBolivia(fechaCierreDate) : undefined),
          fechaCierre
        } as PedidoPayload
      })
    }
    const filtro: PedidoFiltro = {}
    const andClauses: Record<string, unknown>[] = []
    // Reglas de alcance por Rol:
    if (esMesero) {
      // Mesero: solo puede consultar sus propios pedidos
      if (
        toIdString(mesero) &&
        usuarioAuthId &&
        toIdString(mesero) !== usuarioAuthId
      ) {
        throw new PedidoServiceError(
          403,
          'Acceso denegado: no puedes consultar pedidos asignados a otro mesero.'
        )
      }
      if (usuarioAuthId) {
        filtro.usuario = usuarioAuthId
      }
    } else if (esCocinero) {
      // Cocinero: siempre restringido al flujo culinario activo (sin pedidos cerrados o cancelados)
      andClauses.push({
        $or: [
          {
            estado: {
              $in: [
                ESTADOS_PEDIDO.ABIERTO,
                ESTADOS_PEDIDO.PENDIENTE,
                ESTADOS_PEDIDO.EN_PREPARACION
              ]
            }
          },
          {
            estado: { $in: [ESTADOS_PEDIDO.LISTO, ESTADOS_PEDIDO.ENTREGADO] },
            recogido: { $ne: true }
          }
        ]
      })
    } else if (toIdString(mesero)) {
      // Admin u otros: si envía filtro por mesero
      filtro.usuario = toIdString(mesero)
    }
    if (hoy === 'true') {
      const inicioHoy = new Date()
      inicioHoy.setHours(0, 0, 0, 0)
      andClauses.push({
        $or: [
          { createdAt: { $gte: inicioHoy } },
          { updatedAt: { $gte: inicioHoy } }
        ]
      })
    } else if (typeof fecha === 'string' && fecha.trim()) {
      const inicio = new Date(`${fecha}T00:00:00`)
      const fin = new Date(`${fecha}T23:59:59.999`)
      if (!Number.isNaN(inicio.getTime()) && !Number.isNaN(fin.getTime())) {
        filtro.createdAt = { $gte: inicio, $lte: fin }
      }
    }
    if (toIdString(mesa)) {
      filtro.mesa = toIdString(mesa)
    }
    if (!esCocinero) {
      if (activo === 'true') {
        if (recogido === 'true') {
          filtro.estado = {
            $in: [
              ESTADOS_PEDIDO.BORRADOR,
              ESTADOS_PEDIDO.PENDIENTE,
              ESTADOS_PEDIDO.ABIERTO,
              ESTADOS_PEDIDO.EN_PREPARACION,
              ESTADOS_PEDIDO.LISTO,
              ESTADOS_PEDIDO.ENTREGADO
            ]
          }
          filtro.recogido = true
        } else if (incluirRecogidos === 'true') {
          filtro.estado = {
            $in: [
              ESTADOS_PEDIDO.BORRADOR,
              ESTADOS_PEDIDO.PENDIENTE,
              ESTADOS_PEDIDO.ABIERTO,
              ESTADOS_PEDIDO.EN_PREPARACION,
              ESTADOS_PEDIDO.LISTO,
              ESTADOS_PEDIDO.ENTREGADO
            ]
          }
        } else {
          // Vista de pedidos activos no recogidos
          andClauses.push({
            $or: [
              {
                estado: {
                  $in: [
                    ESTADOS_PEDIDO.BORRADOR,
                    ESTADOS_PEDIDO.PENDIENTE,
                    ESTADOS_PEDIDO.ABIERTO,
                    ESTADOS_PEDIDO.EN_PREPARACION
                  ]
                }
              },
              {
                estado: { $in: [ESTADOS_PEDIDO.LISTO, ESTADOS_PEDIDO.ENTREGADO] },
                recogido: { $ne: true }
              }
            ]
          })
        }
      } else {
        if (recogido === 'true') {
          filtro.recogido = true
        } else if (recogido === 'false') {
          filtro.recogido = { $ne: true }
        }
      }
    }
    if (cajero) {
      andClauses.push({
        $or: [
          { cajeroAsignado: cajero },
          { cajeroAsignado: null },
          { cajeroAsignado: { $exists: false } }
        ]
      })
    }
    if (andClauses.length > 0) {
      filtro.$and = andClauses
    }
    const pedidos = await this.pedidoRepo.buscarConFiltros(filtro)
    if (esCocinero) {
      return pedidos.map((pedido) =>
        PedidoService.formatearPedidoCocina(pedido)
      )
    }
    return pedidos.map((pedido) =>
      PedidoService.agregarFechaBoliviaPedido(pedido)
    )
  }
  /**
   * Obtiene exclusivamente los pedidos operativos para el tablero de cocina (Cocinero, Admin)
   */
  async obtenerPedidosCocina(): Promise<PedidoCocinaPayload[]> {
    const filtro = {
      $or: [
        {
          estado: {
            $in: [ESTADOS_PEDIDO.ABIERTO, ESTADOS_PEDIDO.PENDIENTE, ESTADOS_PEDIDO.EN_PREPARACION]
          }
        },
        {
          estado: { $in: [ESTADOS_PEDIDO.LISTO, ESTADOS_PEDIDO.ENTREGADO] },
          recogido: { $ne: true }
        }
      ]
    }
    const pedidos = await this.pedidoRepo.buscarConFiltros(filtro)
    return pedidos.map((pedido) =>
      PedidoService.formatearPedidoCocina(pedido)
    )
  }
    /**
   * Cancela un pedido de forma atómica y restituye el inventario
   * cuando existe un movimiento todavía no revertido.
   */
  async cancelarPedido(
    id: string,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<ResultadoCancelarPedido> {
    if (!Types.ObjectId.isValid(id)) {
      throw new PedidoServiceError(400, 'ID de pedido inválido')
    }

    const pedidoInicial = await this.pedidoRepo.buscarPorId(id)

    if (!pedidoInicial) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    const esAdmin =
      usuarioRol === 'Administrador' || usuarioRol === 'superadmin'

    const esResponsable =
      !usuarioAuthId ||
      pedidoInicial.usuario.toString() === usuarioAuthId

    if (!esResponsable && !esAdmin) {
      throw new PedidoServiceError(
        403,
        'Solo el mesero responsable o un Administrador pueden cancelar este pedido.'
      )
    }

    const session = await mongoose.startSession()

    try {
      const resultado = await session.withTransaction(async () => {
        const pedidoActual = await this.pedidoRepo.buscarPorId(id, session)

        if (!pedidoActual) {
          throw new PedidoServiceError(404, 'Pedido no encontrado')
        }

        const responsableActual =
          !usuarioAuthId ||
          pedidoActual.usuario.toString() === usuarioAuthId

        if (!responsableActual && !esAdmin) {
          throw new PedidoServiceError(
            403,
            'Solo el mesero responsable o un Administrador pueden cancelar este pedido.'
          )
        }

        const estadosCancelables: string[] = [
          ESTADOS_PEDIDO.BORRADOR,
          ESTADOS_PEDIDO.PENDIENTE,
          ESTADOS_PEDIDO.ABIERTO
        ]

        if (!estadosCancelables.includes(pedidoActual.estado)) {
          throw new PedidoServiceError(
            409,
            `No se puede cancelar el pedido en estado "${pedidoActual.estado}". Solo se permiten BORRADOR, PENDIENTE o ABIERTO.`
          )
        }

        const mesaId = pedidoActual.mesa?.toString()

        if (mesaId) {
          const mesaPedido = await this.mesaRepo.buscarPorId(
            mesaId,
            session
          )

          if (!mesaPedido) {
            throw new PedidoServiceError(404, 'Mesa no encontrada')
          }

          if (mesaPedido.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
            throw new PedidoServiceError(
              409,
              'No se puede cancelar un pedido cuya mesa ya tiene la cuenta solicitada.'
            )
          }
        }

        const movimiento = await MovimientoInventario.findOne({
          pedido: pedidoActual._id
        }).session(session)

        if (
          pedidoActual.estado === ESTADOS_PEDIDO.PENDIENTE &&
          (!movimiento || movimiento.revertido === true)
        ) {
          throw new PedidoServiceError(
            409,
            'No se puede cancelar el pedido de forma segura: su movimiento de inventario no existe o ya fue revertido.'
          )
        }

        if (movimiento && movimiento.revertido !== true) {
          const usuarioReversion =
            usuarioAuthId && Types.ObjectId.isValid(usuarioAuthId)
              ? new Types.ObjectId(usuarioAuthId)
              : null

          const movimientoActualizado =
            await MovimientoInventario.findOneAndUpdate(
              {
                _id: movimiento._id,
                revertido: { $ne: true }
              },
              {
                $set: {
                  revertido: true,
                  fechaReversion: new Date(),
                  usuarioReversion
                }
              },
              {
                returnDocument: 'after',
                session,
                runValidators: true
              }
            )

          if (!movimientoActualizado) {
            throw new PedidoServiceError(
              409,
              'El movimiento de inventario ya fue revertido o cambió. No se aplicó la cancelación.'
            )
          }

          for (const consumo of movimiento.consumos) {
            const cantidad = consumo.cantidadTotal

            if (!Number.isFinite(cantidad) || cantidad < 0) {
              throw new PedidoServiceError(
                409,
                `La cantidad registrada para "${consumo.nombreIngrediente}" no es válida.`
              )
            }

            if (cantidad === 0) continue

            const actualizacionIngrediente =
              await IngredienteModel.updateOne(
                { _id: consumo.ingrediente },
                { $inc: { stockActual: cantidad } },
                { session, runValidators: true }
              )

            if (actualizacionIngrediente.matchedCount !== 1) {
              throw new PedidoServiceError(
                409,
                `No se pudo restituir el ingrediente "${consumo.nombreIngrediente}" porque no existe.`
              )
            }
          }
        }

        const pedidoCancelado =
          await this.pedidoRepo.marcarCanceladoSiCancelable(
            id,
            session
          )

        if (!pedidoCancelado) {
          throw new PedidoServiceError(
            409,
            'El estado del pedido cambió durante la cancelación. Consulta su estado antes de reintentar.'
          )
        }

        let mesaLiberada: MesaActualizadaDoc = null
        let nuevoEstadoMesa = 'Libre'
        let statusSocket = 'Disponible'

        if (mesaId) {
          const pedidosRestantes =
            await this.pedidoRepo.contarPedidosActivosPorMesa(
              mesaId,
              session
            )

          if (pedidosRestantes > 0) {
            nuevoEstadoMesa = ESTADOS_MESA.OCUPADA
            statusSocket = 'Ocupada'
          }

          mesaLiberada = await this.mesaRepo.actualizarEstado(
            mesaId,
            nuevoEstadoMesa,
            session
          )
        }

        return {
          pedidoCancelado,
          mesaLiberada,
          nuevoEstadoMesa,
          statusSocket
        }
      })

      if (!resultado) {
        throw new PedidoServiceError(
          500,
          'No se pudo confirmar la transacción de cancelación.'
        )
      }

      return {
        pedido: PedidoService.agregarFechaBoliviaPedido(
          resultado.pedidoCancelado
        ),
        mesaLiberada: resultado.mesaLiberada,
        nuevoEstadoMesa: resultado.nuevoEstadoMesa,
        statusSocket: resultado.statusSocket
      }
    } catch (error) {
      if (error instanceof PedidoServiceError) {
        throw error
      }

      const mensajeError =
        error instanceof Error ? error.message : String(error)

      if (
        /Transaction numbers are only allowed/i.test(mensajeError) ||
        /replica set/i.test(mensajeError) ||
        /mongos/i.test(mensajeError)
      ) {
        throw new PedidoServiceError(
          500,
          'MongoDB requiere soporte para transacciones para garantizar una cancelación segura.'
        )
      }

      console.error('Error transaccional al cancelar el pedido:', error)

      throw new PedidoServiceError(
        500,
        'No se pudo cancelar el pedido ni confirmar la restitución del inventario.'
      )
    } finally {
      await session.endSession()
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
        `Estado no válido: "${nuevoEstado}". Estados permitidos: ${estadosValidos.join(
          ', '
        )}`
      )
    }
    // 1. Obtener estado ANTERIOR del pedido
    const pedidoAnterior = await this.pedidoRepo.buscarPorId(pedidoId)
    if (!pedidoAnterior) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }
    // Máquina de estados de cocina. BORRADOR no puede avanzar desde este endpoint.
    // El envío explícito cambia BORRADOR -> PENDIENTE; cocina avanza a preparación y listo.
    const transicionesPermitidas: Record<string, string[]> = {
      [ESTADOS_PEDIDO.BORRADOR]: [],
      [ESTADOS_PEDIDO.PENDIENTE]: [
        ESTADOS_PEDIDO.PENDIENTE,
        ESTADOS_PEDIDO.EN_PREPARACION
      ],
      [ESTADOS_PEDIDO.EN_PREPARACION]: [
        ESTADOS_PEDIDO.EN_PREPARACION,
        ESTADOS_PEDIDO.LISTO
      ],
      [ESTADOS_PEDIDO.LISTO]: [ESTADOS_PEDIDO.LISTO],
      // Compatibilidad temporal para pedidos históricos.
      [ESTADOS_PEDIDO.ABIERTO]: [
        ESTADOS_PEDIDO.ABIERTO,
        ESTADOS_PEDIDO.EN_PREPARACION
      ],
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

    const yaEstabaListo = pedidoAnterior.estado === ESTADOS_PEDIDO.LISTO

    const pedidoActualizado = await this.pedidoRepo.actualizarEstado(
      pedidoId,
      nuevoEstado
    )
    if (!pedidoActualizado) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }
    // 3. Determinar si el nuevo estado activa la alerta "¡Listo!"
    const esNuevoEstadoListo = nuevoEstado === ESTADOS_PEDIDO.LISTO
    const disparaAlertaListo =
      esNuevoEstadoListo && !yaEstabaListo
    return { pedidoActualizado, disparaAlertaListo }
  }
  /**
   * Compatibilidad estática para llamadas heredadas
   */
  static async actualizarEstadoService(
    pedidoId: string,
    nuevoEstado: string
  ): Promise<ResultadoActualizarEstado> {
    return await pedidoService.actualizarEstadoService(
      pedidoId,
      nuevoEstado
    )
  }
  /**
   * Actualiza los datos permitidos del pedido.
   * Los platos solo se editan en BORRADOR para mantener cocina e inventario sincronizados.
   */
  async actualizarPedido(
    id: string,
    bodyEntrada: unknown,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<ResultadoActualizarPedido> {
    if (!isRecord(bodyEntrada)) {
      throw new PedidoServiceError(400, 'Los datos de actualización no son válidos')
    }
    const body: PedidoActualizacionEntrada = bodyEntrada
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
    if (!pedidoAnterior) throw new PedidoServiceError(404, 'Pedido no encontrado')

    const meseroResponsableId = pedidoAnterior.usuario ? pedidoAnterior.usuario.toString() : ''
    const esResponsable = !usuarioAuthId || meseroResponsableId === usuarioAuthId
    const esAdmin = usuarioRol === 'Administrador' || usuarioRol === 'superadmin'
    if (!esResponsable && !esAdmin) {
      throw new PedidoServiceError(
        403,
        'Acceso denegado: solo el mesero responsable del pedido o un Administrador pueden modificar este pedido.'
      )
    }

    if (pedidoAnterior.mesa) {
      const mesaPedido = await this.mesaRepo.buscarPorId(pedidoAnterior.mesa.toString())
      if (mesaPedido?.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
        throw new PedidoServiceError(
          400,
          'No se puede modificar un pedido cuya mesa ya tiene la cuenta solicitada.'
        )
      }
    }

    if (
      pedidoAnterior.estado === ESTADOS_PEDIDO.CERRADO ||
      pedidoAnterior.estado === ESTADOS_PEDIDO.CANCELADO
    ) {
      throw new PedidoServiceError(400, `No se puede modificar un pedido en estado "${pedidoAnterior.estado}".`)
    }
    if (estado !== undefined) {
      throw new PedidoServiceError(
        400,
        'No se permite modificar el estado del pedido directamente mediante este endpoint.'
      )
    }

    if (montoDescuento !== undefined && toNumber(montoDescuento, Number.NaN) < 0) {
      throw new PedidoServiceError(400, 'El monto de descuento no puede ser negativo')
    }
    if (montoPropina !== undefined && toNumber(montoPropina, Number.NaN) < 0) {
      throw new PedidoServiceError(400, 'El monto de propina no puede ser negativo')
    }
    if (total !== undefined && toNumber(total, Number.NaN) < 0) {
      throw new PedidoServiceError(400, 'El total no puede ser negativo')
    }
    if (subtotalCierre !== undefined && toNumber(subtotalCierre, Number.NaN) < 0) {
      throw new PedidoServiceError(400, 'El subtotal no puede ser negativo')
    }

    const updates: PedidoUpdates = {}
    if (detalles !== undefined) {
      const detallesEntrada = isUnknownArray(detalles) ? detalles : []
      const detallesSinCambios =
        detallesEntrada.length === pedidoAnterior.detalles.length &&
        detallesEntrada.every((detalleEntrada, indice) => {
          const detalle = toPlainRecord(detalleEntrada)
          const platoEntrada = detalle.plato
          const platoId = toIdString(
            toPlainRecord(platoEntrada)._id || platoEntrada || detalle.platoId
          )
          const detalleActual = pedidoAnterior.detalles[indice]
          return Boolean(
            detalleActual &&
            platoId === detalleActual.plato.toString() &&
            toNumber(detalle.cantidad, Number.NaN) === detalleActual.cantidad &&
            (toText(detalle.observacion)?.trim() || '') ===
              (detalleActual.observacion || '').trim()
          )
        })

      if (pedidoAnterior.estado !== ESTADOS_PEDIDO.BORRADOR) {
        if (!detallesSinCambios) {
          throw new PedidoServiceError(
            409,
            'Los platos solo se pueden modificar mientras el pedido está en BORRADOR. Para agregar más platos, crea otro pedido para la misma visita.'
          )
        }
      } else {
        const { detallesCalculados, subtotal } = await this.procesarDetallesPedido(detalles)
        updates.detalles = detallesCalculados
        updates.subtotalCierre = subtotal
      }
    }

    if (clienteNombre !== undefined) updates.clienteNombre = String(clienteNombre).trim()
    if (clienteCI !== undefined) updates.clienteCI = String(clienteCI).trim()
    if (clienteNIT !== undefined) updates.clienteNIT = String(clienteNIT).trim()

    let cajeroAsignadoActualizado: Types.ObjectId | string | null | undefined
    if (cajeroAsignado !== undefined) {
      if (cajeroAsignado === null || cajeroAsignado === '') {
        updates.cajeroAsignado = null
        cajeroAsignadoActualizado = null
      } else {
        const cajeroId = toIdString(cajeroAsignado)
        if (!cajeroId || !Types.ObjectId.isValid(cajeroId)) {
          throw new PedidoServiceError(400, 'El cajero asignado no es válido')
        }
        updates.cajeroAsignado = new Types.ObjectId(cajeroId)
        cajeroAsignadoActualizado = updates.cajeroAsignado
      }
    }

    if (montoDescuento !== undefined) updates.montoDescuento = toNumber(montoDescuento)
    if (montoPropina !== undefined) updates.montoPropina = toNumber(montoPropina)

    // Subtotal y total siempre se recalculan en backend a partir de los valores permitidos.
    const finalSub = updates.subtotalCierre !== undefined
      ? updates.subtotalCierre
      : toNumber(pedidoAnterior.subtotalCierre || pedidoAnterior.total)
    const finalDesc = updates.montoDescuento !== undefined
      ? updates.montoDescuento
      : toNumber(pedidoAnterior.montoDescuento)
    const finalProp = updates.montoPropina !== undefined
      ? updates.montoPropina
      : toNumber(pedidoAnterior.montoPropina)

    if (
      updates.detalles !== undefined ||
      updates.montoDescuento !== undefined ||
      updates.montoPropina !== undefined
    ) {
      updates.total = Number(Math.max(0, finalSub - finalDesc + finalProp).toFixed(2))
      if (!updates.subtotalCierre && (!pedidoAnterior.subtotalCierre || pedidoAnterior.subtotalCierre === 0)) {
        updates.subtotalCierre = finalSub
      }
    }

    const pedidoActualizado = await this.pedidoRepo.actualizar(
      id,
      updates as Parameters<PedidoRepository['actualizar']>[1]
    )
    if (!pedidoActualizado) throw new PedidoServiceError(404, 'Pedido no encontrado')

    return {
      pedidoActualizado: PedidoService.agregarFechaBoliviaPedido(pedidoActualizado),
      pedidoDoc: pedidoActualizado,
      mesaReactivada: null,
      reabierto: false,
      cajeroAsignado: cajeroAsignadoActualizado
    }
  }

  /**
   * Obtiene pedidos de mesas con cuenta solicitada y los formatea para Caja.
   */
  async obtenerPedidosPendientesCobro(
    cajero?: string
  ): Promise<Array<PayloadCaja & { fechaHoraBolivia?: string }>> {
    const todasLasMesas = await this.mesaRepo.buscarTodos()
    const mesasConCuentaSolicitada = todasLasMesas.filter(
      (mesa) => mesa.estado === ESTADOS_MESA.CUENTA_SOLICITADA
    )
    const mesaIds = mesasConCuentaSolicitada.map((mesa) => mesa._id)
    const pedidos = await this.pedidoRepo.buscarPendientesCobro(mesaIds, cajero)

    return pedidos.map((pedido) => ({
      ...PedidoService.formatearPayloadCaja(pedido),
      fechaHoraBolivia: pedido.fechaHora
        ? formatearFechaBolivia(pedido.fechaHora)
        : undefined
    }))
  }

  /**
   * Solicita cuenta de un pedido y cambia el estado de la mesa a 'Cuenta Solicitada'
   */
  async solicitarCuentaPedido(
    id: string,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<ResultadoSolicitarCuenta> {
    const pedido =
      await this.pedidoRepo.buscarPorId(id)
    if (!pedido) {
      throw new PedidoServiceError(
        404,
        'Pedido no encontrado'
      )
    }
    // Regla de titularidad: Mesero responsable o Administrador
    const meseroResponsableId =
      pedido.usuario
        ? pedido.usuario.toString()
        : ''
    const esResponsable =
      !usuarioAuthId ||
      meseroResponsableId === usuarioAuthId
    const esAdmin =
      usuarioRol === 'Administrador' ||
      usuarioRol === 'superadmin'
    if (!esResponsable && !esAdmin) {
      throw new PedidoServiceError(
        403,
        'Acceso denegado: solo el mesero responsable del pedido o un Administrador pueden solicitar la cuenta.'
      )
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
    if (
      pedido.estado !== ESTADOS_PEDIDO.LISTO ||
      pedido.recogido !== true
    ) {
      throw new PedidoServiceError(
        400,
        'Solo se puede solicitar la cuenta cuando el pedido está listo y recogido por el mesero.'
      )
    }
    const mesaActualizada =
      await this.mesaRepo.actualizarEstado(
        pedido.mesa.toString(),
        ESTADOS_MESA.CUENTA_SOLICITADA
      )
    if (!mesaActualizada) {
      throw new PedidoServiceError(
        404,
        'Mesa no encontrada'
      )
    }
    const pedidoPoblado =
      await this.pedidoRepo.buscarPorIdPobladoCaja(
        id
      )
    const payload =
      PedidoService.formatearPayloadCaja(
        pedidoPoblado,
        mesaActualizada
      )
    return {
      payload,
      mesaActualizada,
      cajeroAsignado:
        pedidoPoblado?.cajeroAsignado
    }
  }
  /**
   * Marca un pedido en estado LISTO como recogido físicamente por el mesero
   */
  async marcarPedidoRecogido(
    id: string,
    usuarioAuthId: string,
    usuarioRol: string
  ): Promise<{
    mensaje: string
    recogido: boolean
    recogidoPor: string
    fechaRecogida: Date
    fechaRecogidaBolivia?: string
    pedido: PedidoPayload
  }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new PedidoServiceError(
        400,
        'ID de pedido inválido'
      )
    }
    const pedido =
      await this.pedidoRepo.buscarPorId(id)
    if (!pedido) {
      throw new PedidoServiceError(
        404,
        'Pedido no encontrado'
      )
    }
    // 1. Regla de estado: solo pedidos en estado LISTO pueden ser recogidos.
    if (
      pedido.estado !==
      ESTADOS_PEDIDO.LISTO
    ) {
      throw new PedidoServiceError(
        400,
        `No se puede marcar como recogido un pedido en estado "${pedido.estado}". Solo se pueden recoger pedidos en estado "${ESTADOS_PEDIDO.LISTO}".`
      )
    }
    // 2. Regla de idempotencia/conflicto: no puede recogerse nuevamente
    if (pedido.recogido === true) {
      throw new PedidoServiceError(
        409,
        'El pedido ya fue marcado como recogido previamente.'
      )
    }
    // 3. Regla de autorización: Mesero responsable o Administrador
    const meseroResponsableId =
      pedido.usuario
        ? pedido.usuario.toString()
        : ''
    const esResponsable =
      meseroResponsableId === usuarioAuthId
    const esAdmin = usuarioRol === 'Administrador' || usuarioRol === 'superadmin'
    if ((!esResponsable || usuarioRol !== 'Mesero') && !esAdmin) {
      throw new PedidoServiceError(
        403,
        'Solo el mesero responsable del pedido o un Administrador pueden marcarlo como recogido.'
      )
    }
    // 4. Persistir recogida sin alterar la máquina de estados del pedido
    const fechaRecogida = new Date()
    const pedidoActualizado =
      await this.pedidoRepo.marcarComoRecogido(
        id,
        usuarioAuthId,
        fechaRecogida
      )
    if (!pedidoActualizado) {
      throw new PedidoServiceError(
        404,
        'Error al actualizar el pedido'
      )
    }
    const pedidoConFechaBolivia =
      PedidoService.agregarFechaBoliviaPedido(
        pedidoActualizado
      )
    return {
      mensaje:
        'Pedido marcado como recogido exitosamente',
      recogido: true,
      recogidoPor: usuarioAuthId,
      fechaRecogida,
      fechaRecogidaBolivia:
        pedidoConFechaBolivia.fechaRecogidaBolivia,
      pedido: pedidoConFechaBolivia
    }
  }
}
export const pedidoService =
  new PedidoService()
