// src/services/pedido.service.ts
// ─── Servicio de Lógica de Negocio y Orquestación de Pedidos ──────────────────
import mongoose, { Types, type Document, type QueryFilter } from 'mongoose'
import {
  PedidoRepository,
  pedidoRepository,
  IPedido,
  PedidoActualizarDatos
} from '../repositories/pedido.repo'
import { MesaPobladaDoc, MesaRepository, mesaRepository } from '../repositories/mesa.repo'
import {
  MesaOcupacionRepository,
  mesaOcupacionRepository
} from '../repositories/mesaOcupacion.repo'
import { PlatoRepository, platoRepository } from '../repositories/plato.repo'
import {
  ESTADOS_CUENTA,
  ESTADOS_MESA,
  ESTADOS_PEDIDO,
  ESTADOS_TANDA_COCINA,
  EstadoTandaCocina
} from '../utils/constants'
import {
  obtenerFechaBolivia,
  formatearFechaBolivia
} from '../utils/fechaBolivia'
import { inventarioService } from './inventario.service'
import MovimientoInventario from '../models/MovimientoInventario'
import IngredienteModel from '../models/Ingrediente'
import { esUnidadMedida } from '../utils/unidades'
import { generarSiguienteCodigoPedido } from './contador.service'
import type { IDetallePedido, ITandaCocina } from '../models/Pedido'

type CocinaId = Types.ObjectId | string

type CocinaReferenciaPlato =
  | CocinaId
  | { _id?: CocinaId; nombre?: string }
  | null

type CocinaDetalleEntrada = Omit<IDetallePedido, 'plato' | 'tandaId'> & {
  _id?: CocinaId
  plato: CocinaReferenciaPlato
  tandaId?: CocinaId | null
}

type CocinaTandaEntrada = Omit<ITandaCocina, '_id'> & {
  _id?: CocinaId
  toObject?: () => CocinaTandaEntrada
}

interface PedidoCocinaRaw {
  _id?: CocinaId
  codigo?: string
  estado?: string
  estadoCuenta?: string
  mesa?: unknown
  usuario?: unknown
  tandas?: CocinaTandaEntrada[]
  detalles?: CocinaDetalleEntrada[]
  recogido?: boolean
  recogidoPor?: unknown
  fechaRecogida?: Date | null
  fechaHoraBolivia?: string
  createdAt?: Date
  updatedAt?: Date
  toObject?: () => PedidoCocinaRaw
}

function obtenerNombrePlatoCocina(
  plato: CocinaReferenciaPlato | undefined
): string | undefined {
  if (
    plato &&
    typeof plato === 'object' &&
    'nombre' in plato &&
    typeof plato.nombre === 'string'
  ) {
    return plato.nombre
  }

  return undefined
}

type PlatoIdEntrada = Types.ObjectId | string

type PlatoReferenciaEntrada =
  | PlatoIdEntrada
  | { _id?: PlatoIdEntrada; nombre?: string }
  | null
  | undefined

interface DetallePedidoEntrada {
  plato?: PlatoReferenciaEntrada
  platoId?: PlatoIdEntrada
  cantidad: number | string
  observacion?: string | null
}

function obtenerIdPlatoEntrada(
  plato: PlatoReferenciaEntrada,
  platoIdAlternativo?: PlatoIdEntrada
): PlatoIdEntrada | undefined {
  if (typeof plato === 'string' || plato instanceof Types.ObjectId) {
    return plato
  }

  if (plato && typeof plato === 'object') {
    return plato._id ?? platoIdAlternativo
  }

  return platoIdAlternativo
}

interface ActualizarPedidoEntrada {
  total?: number | string
  detalles?: DetallePedidoEntrada[]
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  cajeroAsignado?: string | Types.ObjectId
  montoPropina?: number | string
  subtotalCierre?: number | string
  estado?: string
}

type PedidoFormateado = Omit<IPedido, keyof Document> & {
  _id: Types.ObjectId
  fechaRecogidaBolivia?: string
}

type MesaReferenciaEntrada = PlatoIdEntrada | { _id?: PlatoIdEntrada }

interface CrearPedidoEntrada {
  mesa?: MesaReferenciaEntrada | null
  usuario?: PlatoIdEntrada
  detalles: DetallePedidoEntrada[]
  montoPropina?: number | string
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  cajeroAsignado?: PlatoIdEntrada
}

function obtenerIdMesaEntrada(mesa: MesaReferenciaEntrada): string {
  if (typeof mesa === 'string' || mesa instanceof Types.ObjectId) {
    return mesa.toString()
  }

  return mesa._id ? mesa._id.toString() : String(mesa)
}

function obtenerIdReferenciaPedido(valor: unknown): string | undefined {
  if (typeof valor === 'string') {
    return valor
  }

  if (valor instanceof Types.ObjectId) {
    return valor.toString()
  }

  if (valor && typeof valor === 'object' && '_id' in valor) {
    const id = valor._id

    if (typeof id === 'string') {
      return id
    }

    if (id instanceof Types.ObjectId) {
      return id.toString()
    }
  }

  return undefined
}

function obtenerEstadoReferenciaPedido(valor: unknown): string | undefined {
  if (valor && typeof valor === 'object' && 'estado' in valor) {
    return typeof valor.estado === 'string' ? valor.estado : undefined
  }

  return undefined
}

function obtenerTextoQuery(valor: unknown): string | undefined {
  return typeof valor === 'string' ? valor : undefined
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
  pedidoActualizado: IPedido
  /** true cuando el nuevo estado activa la alerta "¡Listo!" hacia los meseros */
  disparaAlertaListo: boolean
}

export interface ResultadoCrearPedido {
  nuevoPedido: PedidoFormateado
  pedidoPoblado: IPedido | null
  mesaActualizada: MesaPobladaDoc | null
}

export interface ResultadoCancelarPedido {
  pedido: PedidoFormateado
  mesaLiberada: MesaPobladaDoc | null
  nuevoEstadoMesa: string
  statusSocket: string
}

export interface ResultadoActualizarPedido {
  pedidoActualizado: PedidoFormateado
  pedidoDoc: IPedido
  mesaReactivada: MesaPobladaDoc | null
  reabierto: boolean
  cajeroAsignado?: string | Types.ObjectId
}

export interface ResultadoSolicitarCuenta {
  payload: ReturnType<typeof PedidoService.formatearPayloadCaja>
  mesaActualizada: MesaPobladaDoc
  cajeroAsignado?: IPedido['cajeroAsignado']
}

// ─── Clase Principal PedidoService ───────────────────────────────────────────

interface CajaRelacionPoblada {
  _id?: Types.ObjectId | string
  numero?: string | number
  nombre?: string
  apellido?: string
  precio?: number
}

type CajaReferencia =
  | Types.ObjectId
  | string
  | CajaRelacionPoblada
  | null
  | undefined

interface DetallePedidoCaja {
  plato?: CajaReferencia
  cantidad: number
  precioUnitario: number
  subtotal: number
  observacion: string
}

interface PedidoCajaEntrada {
  _id: Types.ObjectId | string
  codigo: string
  mesa?: CajaReferencia
  usuario?: CajaReferencia
  detalles?: DetallePedidoCaja[]
  subtotalCierre?: number
  total?: number
  montoPropina?: number
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  updatedAt?: Date
  createdAt?: Date
  fechaHora?: Date
}

interface ItemPayloadCaja {
  platoId: CajaReferencia
  nombre: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  observacion: string
}

interface PedidoPayloadCaja {
  pedidoId: Types.ObjectId | string
  codigo: string
  mesaId: CajaReferencia
  mesaNombre: string | number
  meseroNombre: string
  subtotal: number
  subtotalCierre: number
  propina: number
  montoPropina: number
  total: number
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  tiempoEsperaMinutos: number
  items: ItemPayloadCaja[]
  fechaHoraBolivia?: string
}

const obtenerReferenciaPobladaCaja = (
  referencia: CajaReferencia
): CajaRelacionPoblada | undefined => {
  if (
    referencia !== null &&
    referencia !== undefined &&
    typeof referencia === 'object' &&
    !(referencia instanceof Types.ObjectId)
  ) {
    return referencia
  }

  return undefined
}

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
  static agregarFechaBoliviaPedido(pedido: IPedido): PedidoFormateado {
    if (!pedido) return pedido
    const pedidoPlano = typeof pedido.toObject === 'function' ? pedido.toObject() : pedido
    const { _id, codigo, fechaHoraBolivia, fechaHora, ...restoPedido } = pedidoPlano

    return {
      _id,
      codigo,
      ...restoPedido,
      fechaHoraBolivia:
        fechaHoraBolivia || (fechaHora ? formatearFechaBolivia(fechaHora) : undefined),
      fechaRecogidaBolivia:
        restoPedido.fechaRecogidaBolivia ||
        (restoPedido.fechaRecogida ? formatearFechaBolivia(restoPedido.fechaRecogida) : undefined),
      fechaHora
    }
  }

  /**
   * Formatea un pedido poblado para enviar su estructura completa
   * a los websockets o endpoints de la Caja.
   */
  static formatearPayloadCaja(
    pedido: PedidoCajaEntrada,
    mesaOverride?: CajaReferencia
  ): PedidoPayloadCaja {
    const mesa = mesaOverride || pedido.mesa
    const mesaPoblada = obtenerReferenciaPobladaCaja(mesa)

    const itemsSubtotal =
      pedido.detalles && pedido.detalles.length > 0
        ? pedido.detalles.reduce(
            (sum, detalle) =>
              sum +
              Number(detalle.precioUnitario || 0) *
                Number(detalle.cantidad || 1),
            0
          )
        : pedido.subtotalCierre || pedido.total || 0

    const subtotalBase = Number(pedido.subtotalCierre || itemsSubtotal || 0)
    const montoProp = Number(pedido.montoPropina || 0)
    const totalCalc = Number((subtotalBase + montoProp).toFixed(2))

    const usuarioPoblado = obtenerReferenciaPobladaCaja(pedido.usuario)
    const fechaBase = pedido.updatedAt || pedido.createdAt || pedido.fechaHora

    return {
      pedidoId: pedido._id,
      codigo: pedido.codigo,
      mesaId: mesaPoblada?._id || mesa,
      mesaNombre: mesaPoblada?.numero || 'Mesa sin asignar',
      meseroNombre: pedido.usuario
        ? `${usuarioPoblado?.nombre || ''} ${usuarioPoblado?.apellido || ''}`.trim()
        : 'Sin mesero',
      subtotal: subtotalBase,
      subtotalCierre: subtotalBase,
      propina: montoProp,
      montoPropina: montoProp,
      total: totalCalc,
      clienteNombre: pedido.clienteNombre,
      clienteCI: pedido.clienteCI,
      clienteNIT: pedido.clienteNIT,
      tiempoEsperaMinutos: fechaBase
        ? Math.floor((Date.now() - fechaBase.getTime()) / 60000)
        : 0,
      items:
        pedido.detalles?.map((detalle) => {
          const platoPoblado = obtenerReferenciaPobladaCaja(detalle.plato)
          return {
            platoId: platoPoblado?._id || detalle.plato,
            nombre: platoPoblado?.nombre || 'Plato no disponible',
            cantidad: detalle.cantidad,
            precioUnitario: detalle.precioUnitario,
            subtotal: detalle.subtotal,
            observacion: detalle.observacion
          }
        }) || []
    }
  }

  /**
   * Formatea los pedidos para cocina.
   * En pedidos nuevos muestra exclusivamente tandas enviadas que aún requieren servicio.
   * Los pedidos históricos sin tandas mantienen el formato anterior.
   */
  static formatearPedidoCocina(
    pedido: unknown
  ): Record<string, unknown> | null {
    const entrada = pedido as PedidoCocinaRaw | null | undefined
    const raw: PedidoCocinaRaw =
      entrada && typeof entrada.toObject === 'function'
        ? entrada.toObject()
        : entrada || {}

    const fechaHoraBolivia =
      raw.fechaHoraBolivia ||
      (raw.createdAt ? formatearFechaBolivia(raw.createdAt) : undefined)

    if (Array.isArray(raw.tandas)) {
      const tandasEntrada = raw.tandas as CocinaTandaEntrada[]
      const estadosVisibles: EstadoTandaCocina[] = [
        ESTADOS_TANDA_COCINA.PENDIENTE,
        ESTADOS_TANDA_COCINA.EN_PREPARACION,
        ESTADOS_TANDA_COCINA.LISTA
      ]

      const tandas = tandasEntrada
        .map((tanda) =>
          typeof tanda?.toObject === 'function' ? tanda.toObject() : tanda
        )
        .filter((tanda) => estadosVisibles.includes(tanda.estado))
        .map((tanda) => {
          const tandaId = tanda._id?.toString()

          const detalles = (raw.detalles || [])
            .filter(
              (detalle) =>
                detalle.tandaId &&
                detalle.tandaId.toString() === tandaId
            )
            .map((detalle) => ({
              plato: detalle.plato,
              nombrePlato:
                detalle.nombrePlato ||
                obtenerNombrePlatoCocina(detalle.plato) ||
                'Plato',
              cantidad: detalle.cantidad,
              observacion: detalle.observacion
            }))

          return {
            ...tanda,
            detalles
          }
        })
        .filter((tanda) => tanda.detalles.length > 0)

      if (tandas.length === 0) {
        return null
      }

      return {
        _id: raw._id,
        pedidoId: raw._id,
        codigo: raw.codigo,
        estadoCuenta: raw.estadoCuenta || ESTADOS_CUENTA.ABIERTA,
        mesa: raw.mesa,
        usuario: raw.usuario,
        tandas,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        fechaHoraBolivia
      }
    }

    // Compatibilidad con pedidos históricos que todavía no tienen tandas.
    const pedidoActivo =
      raw.estado === ESTADOS_PEDIDO.ABIERTO ||
      raw.estado === ESTADOS_PEDIDO.EN_PREPARACION ||
      (raw.estado === ESTADOS_PEDIDO.ENTREGADO && raw.recogido !== true)

    if (!pedidoActivo) {
      return null
    }

    return {
      _id: raw._id,
      codigo: raw.codigo,
      estado: raw.estado,
      mesa: raw.mesa,
      usuario: raw.usuario,
      detalles: (raw.detalles || []).map((detalle) => ({
        _id: detalle._id,
        plato: detalle.plato,
        nombrePlato:
          detalle.nombrePlato ||
          obtenerNombrePlatoCocina(detalle.plato) ||
          'Plato',
        cantidad: detalle.cantidad,
        observacion: detalle.observacion
      })),
      recogido: raw.recogido || false,
      recogidoPor: raw.recogidoPor,
      fechaRecogida: raw.fechaRecogida,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      fechaHoraBolivia
    }
  }

  /**
   * Obtiene los nombres y precios reales de los platos y calcula sus subtotales.
   * La disponibilidad del inventario se validará cuando la tanda se envíe a cocina.
   */
  private async procesarDetallesPedido(detalles: DetallePedidoEntrada[]): Promise<{
    detallesCalculados: IDetallePedido[]
    subtotal: number
  }> {
    if (!detalles || !Array.isArray(detalles) || detalles.length === 0) {
      throw new PedidoServiceError(400, 'El pedido debe incluir al menos un plato en detalles')
    }

    const detallesCalculados: IDetallePedido[] = []

    for (const d of detalles) {
      const platoId = obtenerIdPlatoEntrada(d.plato, d.platoId)
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

    // ESCUDO: validation moved to explicitly where stock deduction happens
    const subtotal = Number(
      detallesCalculados.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)
    )

    return { detallesCalculados, subtotal }
  }

  /**
   * Valida la mesa, calcula importes con precios obtenidos del backend,
   * genera el correlativo diario y crea la cuenta con su primera tanda
   * en borrador. El inventario se procesa al enviar la tanda a cocina.
   */
  async crearPedido(datos: CrearPedidoEntrada, usuarioAuthId?: string): Promise<ResultadoCrearPedido> {
    // 1. Validar existencia de mesa si fue enviada (404 si no existe)
    let mesaIdString: string | undefined = undefined
    if (datos.mesa) {
      const mesaId = obtenerIdMesaEntrada(datos.mesa)
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

    // 3. Validar propina. Los descuentos monetarios ya no se aplican.
    const montoPropina = Number(datos.montoPropina || 0)

    if (!Number.isFinite(montoPropina) || montoPropina < 0) {
      throw new PedidoServiceError(
        400,
        'El monto de propina debe ser un número válido y no negativo'
      )
    }

    // 4. El total se calcula exclusivamente con subtotal más propina.
    const totalCalculado = Number((subtotal + montoPropina).toFixed(2))

    // 5. Generar código diario secuencial y fechas Bolivia.
    const pedidoId = new Types.ObjectId()
    const tandaId = new Types.ObjectId()
    const { codigo, fechaDiaBolivia } = await generarSiguienteCodigoPedido()
    const fechaHora = obtenerFechaBolivia()
    const usuarioResponsable = usuarioAuthId || datos.usuario

    if (
      !usuarioResponsable ||
      !Types.ObjectId.isValid(usuarioResponsable.toString())
    ) {
      throw new PedidoServiceError(
        401,
        'Se necesita un usuario válido para registrar la cuenta.'
      )
    }

    const usuarioResponsableId = new Types.ObjectId(
      usuarioResponsable.toString()
    )

    // Cada detalle queda asociado a su tanda inicial en borrador.
    const detallesConTanda = detallesCalculados.map((detalle) => ({
      ...detalle,
      tandaId
    }))

    let nuevoPedidoDoc: IPedido | null = null
    let mesaActualizada: MesaPobladaDoc | null = null

    const session = await mongoose.startSession()

    try {
      nuevoPedidoDoc = await session.withTransaction<IPedido>(async () => {
        let ocupacion = null

        if (mesaIdString) {
          const mesa = await this.mesaRepo.buscarPorId(
            mesaIdString,
            session
          )

          if (!mesa) {
            throw new PedidoServiceError(404, 'Mesa no encontrada')
          }

          // Una mesa no puede recibir una segunda cuenta activa.
          const pedidoActivo =
            await this.pedidoRepo.buscarPedidoActivoPorMesa(
              mesaIdString,
              session
            )

          if (pedidoActivo) {
            throw new PedidoServiceError(
              409,
              'La mesa ya tiene un pedido activo. Añade los productos a esa cuenta.'
            )
          }

          ocupacion = await this.mesaOcupacionRepo.buscarPorMesaId(
            mesaIdString,
            session
          )

          const ahora = new Date()
          const ocupacionVigente =
            ocupacion !== null && ocupacion.expiraEn > ahora

          if (
            ocupacionVigente &&
            ocupacion!.usuarioId.toString() !==
              usuarioResponsableId.toString()
          ) {
            throw new PedidoServiceError(
              409,
              'La mesa está ocupada temporalmente por otro mesero.'
            )
          }

          if (mesa.estado === ESTADOS_MESA.LIBRE) {
            // Una reserva vigente con mesa libre indica datos inconsistentes.
            if (ocupacionVigente) {
              throw new PedidoServiceError(
                409,
                'La reserva temporal y el estado de la mesa no coinciden. Actualiza la mesa antes de continuar.'
              )
            }

            // La actualización condicional impide que dos solicitudes
            // ocupen simultáneamente una mesa libre.
            mesaActualizada = await this.mesaRepo.ocuparMesaSiLibre(
              mesaIdString,
              session
            )

            if (!mesaActualizada) {
              throw new PedidoServiceError(
                409,
                'La mesa acaba de ser ocupada por otra operación.'
              )
            }
          } else if (mesa.estado === ESTADOS_MESA.OCUPADA) {
            // Una mesa ocupada solo puede convertirse en pedido si conserva
            // la reserva temporal propia o una reserva que ya expiró.
            if (!ocupacion) {
              throw new PedidoServiceError(
                409,
                'La mesa figura ocupada y no tiene una reserva temporal disponible para convertir en pedido.'
              )
            }

            mesaActualizada = mesa
          } else {
            throw new PedidoServiceError(
              409,
              'La mesa no está disponible para registrar un pedido.'
            )
          }
        }

        // Crear el pedido dentro de la misma transacción que la mesa.
        // La creación NO descuenta inventario.
        const pedidoCreado = await this.pedidoRepo.crear(
          {
            ...datos,
            _id: pedidoId,
            codigo,
            fechaDiaBolivia,
            estado: ESTADOS_PEDIDO.ABIERTO,
            estadoCuenta: ESTADOS_CUENTA.ABIERTA,
            tandas: [
              {
                _id: tandaId,
                numeroTanda: 1,
                estado: ESTADOS_TANDA_COCINA.BORRADOR,
                creadaPor: usuarioResponsableId,
                fechaCreacion: fechaHora
              }
            ],
            detalles: detallesConTanda,
            total: totalCalculado,
            subtotalCierre: subtotal,
            montoPropina,
            mesa: mesaIdString || undefined,
            usuario: usuarioResponsableId,
            fechaHoraBolivia: formatearFechaBolivia(fechaHora),
            fechaHora
          },
          session
        )

        // Si la mesa procedía de una reserva temporal, eliminarla en la
        // misma transacción. Si algo falla, se revierte también el pedido.
        if (mesaIdString && ocupacion) {
          const ocupacionEliminada =
            await this.mesaOcupacionRepo.eliminarPorMesaId(
              mesaIdString,
              session
            )

          if (!ocupacionEliminada) {
            throw new PedidoServiceError(
              409,
              'La reserva temporal cambió durante la operación. Vuelve a consultar la mesa.'
            )
          }
        }

        return pedidoCreado
      })
    } catch (error) {
      if (error instanceof PedidoServiceError) {
        throw error
      }

      const mensajeError =
        error instanceof Error ? error.message : String(error || '')

      if (
        /Transaction numbers are only allowed/i.test(mensajeError) ||
        /replica set/i.test(mensajeError) ||
        /mongos/i.test(mensajeError)
      ) {
        throw new PedidoServiceError(
          500,
          'MongoDB debe soportar transacciones para crear el pedido y ocupar la mesa de forma atómica.'
        )
      }

      console.error(
        'Error transaccional al registrar la cuenta:',
        error
      )

      throw new PedidoServiceError(
        500,
        'No se pudo registrar la cuenta y ocupar la mesa. La operación no se confirmó.'
      )
    } finally {
      await session.endSession()
    }

    if (!nuevoPedidoDoc) {
      throw new PedidoServiceError(
        500,
        'La transacción terminó sin devolver el pedido creado.'
      )
    }

    // Consultar el pedido ya confirmado y devolver la mesa actualizada.
    const pedidoPoblado = await this.pedidoRepo.buscarPorIdPoblado(
      nuevoPedidoDoc._id
    )

    return {
      nuevoPedido: PedidoService.agregarFechaBoliviaPedido(nuevoPedidoDoc),
      pedidoPoblado,
      mesaActualizada
    }
  }

  /**
   * Obtiene un pedido específico por su ID respetando RBAC y scoping de titularidad
   */
  async obtenerPedidoPorId(
    id: string,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<PedidoFormateado | Record<string, unknown>> {
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
      const meseroId = obtenerIdReferenciaPedido(pedido.usuario)

      if (usuarioAuthId && meseroId !== usuarioAuthId.toString()) {
        throw new PedidoServiceError(
          403,
          'Acceso denegado: no puedes consultar pedidos asignados a otro mesero.'
        )
      }
    } else if (esCocinero) {
      const enFlujoCocina =
        pedido.estado === ESTADOS_PEDIDO.ABIERTO ||
        pedido.estado === ESTADOS_PEDIDO.EN_PREPARACION ||
        (pedido.estado === ESTADOS_PEDIDO.ENTREGADO && !pedido.recogido)

      if (!enFlujoCocina) {
        throw new PedidoServiceError(
          403,
          'Acceso denegado: el pedido no se encuentra en el flujo culinario activo.'
        )
      }

      const pedidoCocina = PedidoService.formatearPedidoCocina(pedido)
      if (!pedidoCocina) {
        throw new PedidoServiceError(
          403,
          'Acceso denegado: el pedido no tiene tandas activas para cocina.'
        )
      }
      return pedidoCocina
    } else if (esCajero) {
      // Alcance Cajero: Pedidos con cuenta solicitada, asignados a este cajero, o en proceso de cobro
      const mesaEstado = obtenerEstadoReferenciaPedido(pedido.mesa)
      const cajeroAsignadoId = obtenerIdReferenciaPedido(
        pedido.cajeroAsignado
      )

      const tieneCuentaSolicitada = mesaEstado === 'Cuenta Solicitada'
      const esCajeroAsignado = Boolean(
        usuarioAuthId && cajeroAsignadoId === usuarioAuthId.toString()
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
  ): Promise<(PedidoFormateado | Record<string, unknown>)[]> {
    const hoy = obtenerTextoQuery(query.hoy)
    const fecha = obtenerTextoQuery(query.fecha)
    const mesa = obtenerTextoQuery(query.mesa)
    const activo = obtenerTextoQuery(query.activo)
    const cajero = obtenerTextoQuery(query.cajero)
    const mesero = obtenerTextoQuery(query.mesero)
    if (obtenerTextoQuery(query.reportesCierre) === 'true') {
      throw new PedidoServiceError(
        410,
        'El contrato de cierres de 48 horas fue retirado. Usa GET /api/cierres-caja?desde=YYYY-MM-DD&hasta=YYYY-MM-DD.'
      )
    }
    const recogido = obtenerTextoQuery(query.recogido)
    const incluirRecogidos = obtenerTextoQuery(query.incluirRecogidos)

    const esMesero = usuarioRol === 'Mesero'
    const esCocinero = usuarioRol === 'Cocinero'

    const filtro: QueryFilter<IPedido> = {}
    const andClauses: QueryFilter<IPedido>[] = []

    // Reglas de alcance por Rol:
    if (esMesero) {
      // Mesero: solo puede consultar sus propios pedidos
      if (
        mesero &&
        usuarioAuthId &&
        mesero.toString() !== usuarioAuthId.toString()
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
              $in: [ESTADOS_PEDIDO.ABIERTO, ESTADOS_PEDIDO.EN_PREPARACION]
            }
          },
          {
            estado: ESTADOS_PEDIDO.ENTREGADO,
            recogido: { $ne: true }
          }
        ]
      })
    } else if (mesero) {
      // Admin u otros: si envía filtro por mesero
      filtro.usuario = mesero
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
    } else if (fecha) {
      const inicio = new Date(`${fecha}T00:00:00`)
      const fin = new Date(`${fecha}T23:59:59.999`)

      filtro.createdAt = { $gte: inicio, $lte: fin }
    }

    if (mesa) {
      filtro.mesa = mesa
    }

    if (!esCocinero) {
      if (activo === 'true') {
        if (recogido === 'true') {
          filtro.estado = {
            $in: [
              ESTADOS_PEDIDO.ABIERTO,
              ESTADOS_PEDIDO.EN_PREPARACION,
              ESTADOS_PEDIDO.ENTREGADO
            ]
          }

          filtro.recogido = true
        } else if (incluirRecogidos === 'true') {
          filtro.estado = {
            $in: [
              ESTADOS_PEDIDO.ABIERTO,
              ESTADOS_PEDIDO.EN_PREPARACION,
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
                    ESTADOS_PEDIDO.ABIERTO,
                    ESTADOS_PEDIDO.EN_PREPARACION
                  ]
                }
              },
              {
                estado: ESTADOS_PEDIDO.ENTREGADO,
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
      return pedidos
        .map((pedido) => PedidoService.formatearPedidoCocina(pedido))
        .filter(
          (pedido): pedido is Record<string, unknown> => pedido !== null
        )
    }

    return pedidos.map((pedido) =>
      PedidoService.agregarFechaBoliviaPedido(pedido)
    )
  }

  /**
   * Obtiene exclusivamente los pedidos operativos para el tablero de cocina (Cocinero, Admin)
   */
  async obtenerPedidosCocina(): Promise<Record<string, unknown>[]> {
    const filtro = {
      $or: [
        {
          estado: {
            $in: [ESTADOS_PEDIDO.ABIERTO, ESTADOS_PEDIDO.EN_PREPARACION]
          }
        },
        {
          estado: ESTADOS_PEDIDO.ENTREGADO,
          recogido: { $ne: true }
        }
      ]
    }

    const pedidos = await this.pedidoRepo.buscarConFiltros(filtro)

    return pedidos
      .map((pedido) => PedidoService.formatearPedidoCocina(pedido))
      .filter(
        (pedido): pedido is Record<string, unknown> => pedido !== null
      )
  }

  /**
   * Crea una tanda nueva en borrador dentro de una cuenta abierta.
   * No envía la tanda a cocina ni descuenta inventario.
   */
  async crearTandaPedido(
    id: string,
    datos: { detalles?: DetallePedidoEntrada[] },
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<{
    pedido: PedidoFormateado
    tanda: {
      id: string
      numeroTanda: number
      estado: string
      fechaCreacion: Date
    }
  }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new PedidoServiceError(400, 'ID de pedido inválido')
    }

    if (!usuarioAuthId) {
      throw new PedidoServiceError(401, 'Usuario no autenticado')
    }

    const pedido = await this.pedidoRepo.buscarPorId(id)

    if (!pedido) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    const esAdmin =
      usuarioRol === 'Administrador' || usuarioRol === 'superadmin'
    const esResponsable =
      pedido.usuario.toString() === usuarioAuthId

    if (!esResponsable && !esAdmin) {
      throw new PedidoServiceError(
        403,
        'Solo el mesero responsable o un Administrador pueden agregar tandas.'
      )
    }

    if (
      pedido.estadoCuenta !== ESTADOS_CUENTA.ABIERTA ||
      !Array.isArray(pedido.tandas) ||
      pedido.tandas.length === 0
    ) {
      throw new PedidoServiceError(
        409,
        'La cuenta no está preparada para recibir nuevas tandas.'
      )
    }

    if (
      pedido.estado === ESTADOS_PEDIDO.CERRADO ||
      pedido.estado === ESTADOS_PEDIDO.CANCELADO
    ) {
      throw new PedidoServiceError(
        409,
        'No se pueden agregar tandas a una cuenta cerrada o cancelada.'
      )
    }

    if (pedido.mesa) {
      const mesa = await this.mesaRepo.buscarPorId(pedido.mesa.toString())

      if (mesa?.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
        throw new PedidoServiceError(
          409,
          'No se pueden agregar productos después de solicitar la cuenta.'
        )
      }
    }

    if (!(pedido.updatedAt instanceof Date)) {
      throw new PedidoServiceError(
        409,
        'No se pudo comprobar la versión de la cuenta. Vuelve a consultar el pedido.'
      )
    }

    const { detallesCalculados, subtotal } =
      await this.procesarDetallesPedido(datos.detalles ?? [])

    const numeroTanda =
      Math.max(0, ...pedido.tandas.map((tanda) => tanda.numeroTanda)) + 1

    const tandaId = new Types.ObjectId()
    const fechaCreacion = obtenerFechaBolivia()

    const nuevaTanda: ITandaCocina = {
      _id: tandaId,
      numeroTanda,
      estado: ESTADOS_TANDA_COCINA.BORRADOR,
      creadaPor: new Types.ObjectId(usuarioAuthId),
      fechaCreacion
    }

    const detallesTanda: IDetallePedido[] = detallesCalculados.map(
      (detalle: IDetallePedido) => ({
        ...detalle,
        tandaId
      })
    )

    const subtotalAnterior = Number(
      (pedido.detalles ?? [])
        .reduce((suma, detalle) => suma + Number(detalle.subtotal || 0), 0)
        .toFixed(2)
    )
    const subtotalActualizado = Number(
      (subtotalAnterior + subtotal).toFixed(2)
    )
    const propina = Number(pedido.montoPropina || 0)

    if (!Number.isFinite(propina) || propina < 0) {
      throw new PedidoServiceError(
        400,
        'El monto de propina debe ser un número válido y no negativo'
      )
    }

    const totalActualizado = Number(
      (subtotalActualizado + propina).toFixed(2)
    )

    const pedidoActualizado = await this.pedidoRepo.agregarTandaBorrador(
      id,
      pedido.updatedAt,
      nuevaTanda,
      detallesTanda,
      subtotalActualizado,
      totalActualizado
    )

    if (!pedidoActualizado) {
      throw new PedidoServiceError(
        409,
        'La cuenta cambió o dejó de estar abierta. Vuelve a consultar el pedido antes de agregar la tanda.'
      )
    }

    const pedidoPoblado = await this.pedidoRepo.buscarPorIdPoblado(id)

    return {
      pedido: PedidoService.agregarFechaBoliviaPedido(
        pedidoPoblado ?? pedidoActualizado
      ),
      tanda: {
        id: tandaId.toString(),
        numeroTanda,
        estado: ESTADOS_TANDA_COCINA.BORRADOR,
        fechaCreacion
      }
    }
  }

  /**
   * Envía una tanda en borrador a cocina.
   * Descuento, movimiento y transición de estado se confirman juntos.
   */
  async enviarTandaCocina(
    pedidoId: string,
    tandaId: string,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<{ pedido: PedidoFormateado; tanda: ITandaCocina }> {
    if (
      !Types.ObjectId.isValid(pedidoId) ||
      !Types.ObjectId.isValid(tandaId)
    ) {
      throw new PedidoServiceError(400, 'ID de pedido o tanda inválido')
    }

    if (!usuarioAuthId || !Types.ObjectId.isValid(usuarioAuthId)) {
      throw new PedidoServiceError(401, 'Usuario no autenticado')
    }

    const session = await mongoose.startSession()
    let pedidoActualizado: IPedido | null = null

    try {
      pedidoActualizado = await session.withTransaction<IPedido>(async () => {
        const pedido = await this.pedidoRepo.buscarPorId(pedidoId, session)

        if (!pedido) {
          throw new PedidoServiceError(404, 'Pedido no encontrado')
        }

        const esAdmin =
          usuarioRol === 'Administrador' || usuarioRol === 'superadmin'
        const esResponsable =
          pedido.usuario.toString() === usuarioAuthId

        if (!esResponsable && !esAdmin) {
          throw new PedidoServiceError(
            403,
            'Solo el mesero responsable o un Administrador pueden enviar esta tanda.'
          )
        }

        if (
          pedido.estadoCuenta !== ESTADOS_CUENTA.ABIERTA ||
          !Array.isArray(pedido.tandas)
        ) {
          throw new PedidoServiceError(
            409,
            'La cuenta no está abierta para enviar tandas.'
          )
        }

        if (
          pedido.estado === ESTADOS_PEDIDO.CERRADO ||
          pedido.estado === ESTADOS_PEDIDO.CANCELADO
        ) {
          throw new PedidoServiceError(
            409,
            'No se puede enviar una tanda de una cuenta cerrada o cancelada.'
          )
        }

        if (pedido.mesa) {
          const mesa = await this.mesaRepo.buscarPorId(
            pedido.mesa.toString()
          )

          if (mesa?.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
            throw new PedidoServiceError(
              409,
              'No se puede enviar una tanda después de solicitar la cuenta.'
            )
          }
        }

        const tanda = pedido.tandas.find(
          (item) => item._id?.toString() === tandaId
        )

        if (!tanda) {
          throw new PedidoServiceError(
            404,
            'La tanda no pertenece a esta cuenta o no existe.'
          )
        }

        if (tanda.estado !== ESTADOS_TANDA_COCINA.BORRADOR) {
          throw new PedidoServiceError(
            409,
            'Solo se pueden enviar tandas que estén en borrador.'
          )
        }

        const detallesTanda = pedido.detalles.filter(
          (detalle) => detalle.tandaId?.toString() === tandaId
        )

        if (detallesTanda.length === 0) {
          throw new PedidoServiceError(
            400,
            'La tanda no tiene productos asociados.'
          )
        }

        const itemsParaValidar = detallesTanda.map((detalle) => ({
          platoId: detalle.plato.toString(),
          cantidad: detalle.cantidad,
          observacion: detalle.observacion
        }))

        const validacion =
          await inventarioService.verificarYDescontarStock(
            itemsParaValidar,
            session
          )

        if (!validacion.success) {
          throw new PedidoServiceError(
            400,
            'No se puede enviar la tanda por restricciones de receta o inventario.',
            {
              errores: validacion.errores,
              faltantes: validacion.faltantes
            }
          )
        }

        const fechaEnvio = obtenerFechaBolivia()

        const actualizado = await this.pedidoRepo.marcarTandaEnviada(
          pedidoId,
          new Types.ObjectId(tandaId),
          new Types.ObjectId(usuarioAuthId),
          fechaEnvio,
          session
        )

        if (!actualizado) {
          throw new PedidoServiceError(
            409,
            'La tanda o la cuenta cambiaron mientras se procesaba el envío. Vuelve a consultar el pedido.'
          )
        }

        // Registrar el consumo dentro de la misma transacción.
        // Los registros con todos los ingredientes excluidos no generan
        // un movimiento vacío, siguiendo el comportamiento previo.
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

          await MovimientoInventario.create(
            [
              {
                pedido: pedido._id,
                tandaId: new Types.ObjectId(tandaId),
                numeroTanda: tanda.numeroTanda,
                codigoPedido: pedido.codigo,
                fechaHora: fechaEnvio,
                usuario: new Types.ObjectId(usuarioAuthId),
                consumos: consumosMovimiento
              }
            ],
            { session }
          )
        }

        return actualizado
      })
    } catch (error) {
      if (error instanceof PedidoServiceError) {
        throw error
      }

      console.error('Error transaccional al enviar tanda a cocina:', error)
      throw new PedidoServiceError(
        500,
        'No se pudo enviar la tanda a cocina. La operación no se confirmó.'
      )
    } finally {
      await session.endSession()
    }

    if (!pedidoActualizado) {
      throw new PedidoServiceError(
        500,
        'No se obtuvo el pedido actualizado después de la transacción.'
      )
    }

    const tandaActualizada = pedidoActualizado.tandas?.find(
      (item) => item._id?.toString() === tandaId
    )

    if (!tandaActualizada) {
      throw new PedidoServiceError(
        500,
        'No se encontró la tanda actualizada después del envío.'
      )
    }

    return {
      pedido: PedidoService.agregarFechaBoliviaPedido(pedidoActualizado),
      tanda: tandaActualizada
    }
  }

  /**
   * Actualiza el estado operativo de una tanda sin cambiar el estado
   * global de la cuenta.
   */
  async actualizarEstadoTandaCocina(
    pedidoId: string,
    tandaId: string,
    nuevoEstado: string,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<{
    pedido: IPedido
    tanda: ITandaCocina
    disparaAlertaListo: boolean
  }> {
    if (!Types.ObjectId.isValid(pedidoId) || !Types.ObjectId.isValid(tandaId)) {
      throw new PedidoServiceError(400, 'ID de pedido o tanda inválido')
    }

    if (!usuarioAuthId || !Types.ObjectId.isValid(usuarioAuthId)) {
      throw new PedidoServiceError(401, 'Usuario no autenticado')
    }

    if (!['Cocinero', 'Administrador', 'superadmin'].includes(usuarioRol || '')) {
      throw new PedidoServiceError(403, 'No tienes permiso para modificar el estado de cocina.')
    }

    if (
      nuevoEstado !== ESTADOS_TANDA_COCINA.EN_PREPARACION &&
      nuevoEstado !== ESTADOS_TANDA_COCINA.LISTA
    ) {
      throw new PedidoServiceError(
        400,
        'Los estados permitidos para cocina son EN_PREPARACION y LISTA.'
      )
    }

    const pedido = await this.pedidoRepo.buscarPorId(pedidoId)

    if (!pedido) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    if (
      pedido.estadoCuenta !== ESTADOS_CUENTA.ABIERTA ||
      !Array.isArray(pedido.tandas) ||
      pedido.estado === ESTADOS_PEDIDO.CERRADO ||
      pedido.estado === ESTADOS_PEDIDO.CANCELADO
    ) {
      throw new PedidoServiceError(
        409,
        'La cuenta no está abierta para continuar la preparación.'
      )
    }

    if (pedido.mesa) {
      const mesa = await this.mesaRepo.buscarPorId(pedido.mesa.toString())
      if (mesa?.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
        throw new PedidoServiceError(
          409,
          'No se puede avanzar la tanda después de solicitar la cuenta.'
        )
      }
    }

    const tanda = pedido.tandas.find(
      (item) => item._id?.toString() === tandaId
    )

    if (!tanda) {
      throw new PedidoServiceError(404, 'La tanda no existe en esta cuenta.')
    }

    const transiciones: Partial<Record<EstadoTandaCocina, EstadoTandaCocina[]>> = {
      [ESTADOS_TANDA_COCINA.PENDIENTE]: [
        ESTADOS_TANDA_COCINA.EN_PREPARACION
      ],
      [ESTADOS_TANDA_COCINA.EN_PREPARACION]: [
        ESTADOS_TANDA_COCINA.LISTA
      ]
    }

    if (!transiciones[tanda.estado]?.includes(nuevoEstado as EstadoTandaCocina)) {
      throw new PedidoServiceError(
        409,
        `No se permite avanzar una tanda desde "${tanda.estado}" hacia "${nuevoEstado}".`
      )
    }

    const pedidoActualizado = await this.pedidoRepo.transicionarTandaEstado(
      pedidoId,
      new Types.ObjectId(tandaId),
      tanda.estado,
      nuevoEstado as EstadoTandaCocina,
      new Types.ObjectId(usuarioAuthId),
      obtenerFechaBolivia()
    )

    if (!pedidoActualizado) {
      throw new PedidoServiceError(
        409,
        'La tanda cambió mientras se actualizaba. Vuelve a consultar la cocina.'
      )
    }

    const tandaActualizada = pedidoActualizado.tandas?.find(
      (item) => item._id?.toString() === tandaId
    )

    if (!tandaActualizada) {
      throw new PedidoServiceError(
        500,
        'No se encontró la tanda después de actualizar su estado.'
      )
    }

    return {
      pedido: pedidoActualizado,
      tanda: tandaActualizada,
      disparaAlertaListo: nuevoEstado === ESTADOS_TANDA_COCINA.LISTA
    }
  }

  /**
   * Cancela un pedido y libera la mesa
   */
  /**
   * Cancela una tanda individual.
   * BORRADOR: no afecta al inventario.
   * PENDIENTE: restituye el consumo registrado si existe movimiento.
   * EN_PREPARACION, LISTA y ENTREGADA son estados no cancelables.
   */
  async cancelarTandaPedido(
    pedidoId: string,
    tandaId: string,
    usuarioAuthId?: string,
    usuarioRol?: string,
    motivoEntrada?: string
  ): Promise<{
    pedido: PedidoFormateado
    tanda: ITandaCocina
    mesaLiberada: MesaPobladaDoc | null
    cuentaCancelada: boolean
  }> {
    if (!Types.ObjectId.isValid(pedidoId) || !Types.ObjectId.isValid(tandaId)) {
      throw new PedidoServiceError(400, 'ID de pedido o tanda inválido')
    }

    if (!usuarioAuthId || !Types.ObjectId.isValid(usuarioAuthId)) {
      throw new PedidoServiceError(401, 'Usuario no autenticado')
    }

    const motivo = String(motivoEntrada || '').trim()
    if (motivo.length > 300) {
      throw new PedidoServiceError(
        400,
        'El motivo de cancelación no puede superar los 300 caracteres.'
      )
    }

    const session = await mongoose.startSession()

    try {
      const resultado = await session.withTransaction<{
        pedido: IPedido
        tanda: ITandaCocina
        mesaLiberada: MesaPobladaDoc | null
        cuentaCancelada: boolean
      }>(async () => {
        const pedido = await this.pedidoRepo.buscarPorId(pedidoId, session)

        if (!pedido) {
          throw new PedidoServiceError(404, 'Pedido no encontrado')
        }

        const esResponsable = pedido.usuario?.toString() === usuarioAuthId
        const esAdmin = ['Administrador', 'superadmin'].includes(usuarioRol || '')

        if (!esResponsable && !esAdmin) {
          throw new PedidoServiceError(
            403,
            'Solo el mesero responsable o un Administrador pueden cancelar esta tanda.'
          )
        }

        if (
          pedido.estadoCuenta !== ESTADOS_CUENTA.ABIERTA ||
          !Array.isArray(pedido.tandas) ||
          pedido.estado === ESTADOS_PEDIDO.CERRADO ||
          pedido.estado === ESTADOS_PEDIDO.CANCELADO
        ) {
          throw new PedidoServiceError(
            409,
            'La cuenta no está abierta para cancelar tandas.'
          )
        }

        if (pedido.mesa) {
          const mesa = await this.mesaRepo.buscarPorId(
            pedido.mesa.toString(),
            session
          )

          if (mesa?.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
            throw new PedidoServiceError(
              409,
              'No se puede cancelar una tanda después de solicitar la cuenta.'
            )
          }
        }

        const tanda = pedido.tandas.find(
          (item) => item._id?.toString() === tandaId
        )

        if (!tanda) {
          throw new PedidoServiceError(
            404,
            'La tanda no existe en esta cuenta.'
          )
        }

        if (
          tanda.estado !== ESTADOS_TANDA_COCINA.BORRADOR &&
          tanda.estado !== ESTADOS_TANDA_COCINA.PENDIENTE
        ) {
          throw new PedidoServiceError(
            409,
            `No se puede cancelar una tanda en estado "${tanda.estado}". La preparación ya comenzó o la tanda fue finalizada.`
          )
        }

        const fechaCancelacion = obtenerFechaBolivia()
        const usuarioId = new Types.ObjectId(usuarioAuthId)
        const tandaObjectId = new Types.ObjectId(tandaId)

        // Si se envió la tanda, restituir el consumo exacto registrado
        // al enviarla. No recalculamos las recetas actuales.
        if (tanda.estado === ESTADOS_TANDA_COCINA.PENDIENTE) {
          const movimiento = await MovimientoInventario.findOne({
            tandaId: tandaObjectId
          }).session(session)

          if (movimiento) {
            if (movimiento.stockRestituido === true) {
              throw new PedidoServiceError(
                409,
                'El inventario de esta tanda ya fue restituido.'
              )
            }

            for (const consumo of movimiento.consumos) {
              const cantidad = Number(consumo.cantidadTotal)

              if (!Number.isFinite(cantidad) || cantidad < 0) {
                throw new PedidoServiceError(
                  500,
                  `El movimiento de inventario de "${consumo.nombreIngrediente}" tiene una cantidad inválida.`
                )
              }

              if (cantidad === 0) continue

              const unidadStock = consumo.unidadStock

              if (!esUnidadMedida(unidadStock)) {
                throw new PedidoServiceError(
                  500,
                  `El movimiento de inventario de "${consumo.nombreIngrediente}" tiene una unidad de stock inválida.`
                )
              }

              const resultadoActualizacion =
                await IngredienteModel.updateOne(
                  {
                    _id: consumo.ingrediente,
                    unidadMedida: unidadStock
                  },
                  { $inc: { stockActual: cantidad } },
                  {
                    session,
                    runValidators: true
                  }
                )

              if (resultadoActualizacion.matchedCount === 0) {
                throw new PedidoServiceError(
                  409,
                  `No se pudo restituir el inventario de "${consumo.nombreIngrediente}": el ingrediente ya no existe o cambió su unidad de stock.`
                )
              }
            }

            const movimientoRestituido =
              await MovimientoInventario.findOneAndUpdate(
                {
                  _id: movimiento._id,
                  stockRestituido: { $ne: true }
                },
                {
                  $set: {
                    stockRestituido: true,
                    fechaRestitucion: fechaCancelacion,
                    restituidoPor: usuarioId
                  }
                },
                {
                  session,
                  returnDocument: 'after',
                  runValidators: true
                }
              )

            if (!movimientoRestituido) {
              throw new PedidoServiceError(
                409,
                'El movimiento fue actualizado simultáneamente. No se confirmó la cancelación.'
              )
            }
          }
          // Si no hay movimiento, el envío no registró consumo de ingredientes.
        }

        // La cuenta completa solo se cancela automáticamente si todas sus
        // tandas quedarían canceladas y no existen detalles huérfanos.
        const todasLasTandasCanceladas = pedido.tandas.every(
          (item) =>
            item._id?.toString() === tandaId ||
            item.estado === ESTADOS_TANDA_COCINA.CANCELADA
        )
        const hayDetallesSinTanda = (pedido.detalles || []).some(
          (detalle) => !detalle.tandaId
        )
        const cuentaCancelada =
          todasLasTandasCanceladas && !hayDetallesSinTanda

        const idsTandasRestantes = new Set(
          pedido.tandas
            .filter(
              (item) =>
                item._id?.toString() !== tandaId &&
                item.estado !== ESTADOS_TANDA_COCINA.CANCELADA
            )
            .map((item) => item._id?.toString())
            .filter((id): id is string => Boolean(id))
        )

        const subtotalCierre = cuentaCancelada
          ? 0
          : Number(
              (pedido.detalles || [])
                .filter(
                  (detalle) =>
                    !detalle.tandaId ||
                    idsTandasRestantes.has(detalle.tandaId.toString())
                )
                .reduce(
                  (suma, detalle) => suma + Number(detalle.subtotal || 0),
                  0
                )
                .toFixed(2)
            )

        const propina = Number(pedido.montoPropina || 0)
        const total = cuentaCancelada || subtotalCierre <= 0
          ? 0
          : Number((subtotalCierre + propina).toFixed(2))

        const pedidoActualizado = await this.pedidoRepo.cancelarTanda(
          pedidoId,
          tandaObjectId,
          tanda.estado,
          usuarioId,
          fechaCancelacion,
          motivo,
          subtotalCierre,
          total,
          cuentaCancelada,
          session
        )

        if (!pedidoActualizado) {
          throw new PedidoServiceError(
            409,
            'La tanda cambió mientras se procesaba la cancelación. No se confirmó la operación.'
          )
        }

        const tandaActualizada = pedidoActualizado.tandas?.find(
          (item) => item._id?.toString() === tandaId
        )

        if (!tandaActualizada) {
          throw new PedidoServiceError(
            500,
            'No se encontró la tanda cancelada después de actualizar la cuenta.'
          )
        }

        let mesaLiberada: MesaPobladaDoc | null = null

        if (cuentaCancelada && pedido.mesa) {
          mesaLiberada = await this.mesaRepo.actualizarEstado(
            pedido.mesa.toString(),
            ESTADOS_MESA.LIBRE,
            session
          )

          if (!mesaLiberada) {
            throw new PedidoServiceError(
              409,
              'No se pudo liberar la mesa. La cancelación no se confirmó.'
            )
          }
        }

        return {
          pedido: pedidoActualizado,
          tanda: tandaActualizada,
          mesaLiberada,
          cuentaCancelada
        }
      })

      if (!resultado) {
        throw new PedidoServiceError(
          500,
          'No se obtuvo el resultado de la cancelación.'
        )
      }

      return {
        ...resultado,
        pedido: PedidoService.agregarFechaBoliviaPedido(resultado.pedido)
      }
    } catch (error) {
      if (error instanceof PedidoServiceError) {
        throw error
      }

      console.error('Error transaccional al cancelar la tanda:', error)
      throw new PedidoServiceError(
        500,
        'No se pudo cancelar la tanda ni confirmar la restitución del inventario.'
      )
    } finally {
      await session.endSession()
    }
  }

  async cancelarPedido(
    id: string,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<ResultadoCancelarPedido> {
    const pedido = await this.pedidoRepo.buscarPorId(id)

    if (!pedido) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    // Regla de titularidad: Mesero responsable o Administrador
    const meseroResponsableId = pedido.usuario
      ? pedido.usuario.toString()
      : ''

    const esResponsable =
      !usuarioAuthId || meseroResponsableId === usuarioAuthId

    const esAdmin =
      usuarioRol === 'Administrador' || usuarioRol === 'superadmin'

    if (!esResponsable && !esAdmin) {
      throw new PedidoServiceError(
        403,
        'Acceso denegado: solo el mesero responsable del pedido o un Administrador pueden cancelar este pedido.'
      )
    }

    // Las cuentas nuevas deben cancelarse tanda por tanda.
    if (Array.isArray(pedido.tandas) && pedido.tandas.length > 0) {
      throw new PedidoServiceError(
        409,
        'Esta cuenta utiliza tandas. No se puede cancelar mediante la operación antigua.'
      )
    }

    // Impedir cancelar y liberar una mesa después de solicitar la cuenta.
    if (pedido.mesa) {
      const mesaPedido = await this.mesaRepo.buscarPorId(
        pedido.mesa.toString()
      )

      if (mesaPedido?.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
        throw new PedidoServiceError(
          400,
          'No se puede cancelar un pedido cuya mesa ya tiene la cuenta solicitada.'
        )
      }
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

    let mesaLiberada: MesaPobladaDoc | null = null
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

    if (Array.isArray(pedidoAnterior.tandas) && pedidoAnterior.tandas.length > 0) {
      throw new PedidoServiceError(
        409,
        'Esta cuenta utiliza tandas. Los estados de cocina deben actualizarse por tanda.'
      )
    }

    // Validar máquina de estados para cocina:
    // ABIERTO -> ABIERTO (idempotente), EN_PREPARACION
    // EN_PREPARACION -> EN_PREPARACION (idempotente), ENTREGADO
    // ENTREGADO -> ENTREGADO (idempotente)
    // CANCELADO -> (terminal, no permite transiciones)
    // CERRADO -> (terminal, no permite transiciones)
    const transicionesPermitidas: Record<string, string[]> = {
      [ESTADOS_PEDIDO.ABIERTO]: [
        ESTADOS_PEDIDO.ABIERTO,
        ESTADOS_PEDIDO.EN_PREPARACION
      ],
      [ESTADOS_PEDIDO.EN_PREPARACION]: [
        ESTADOS_PEDIDO.EN_PREPARACION,
        ESTADOS_PEDIDO.ENTREGADO
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

    const yaEstabaListo =
      pedidoAnterior.estado === ESTADOS_PEDIDO.ENTREGADO ||
      pedidoAnterior.estado === 'Listos'

    // 2. Actualizar estado en BD mediante el repositorio
    const pedidoActualizado = await this.pedidoRepo.actualizarEstado(
      pedidoId,
      nuevoEstado
    )

    if (!pedidoActualizado) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    // 3. Determinar si el nuevo estado activa la alerta "¡Listo!"
    const esNuevoEstadoListo =
      nuevoEstado === ESTADOS_PEDIDO.ENTREGADO || nuevoEstado === 'Listos'

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
   * Actualiza el contenido de un pedido existente (platos, totales y propinas).
   * Reabre a 'ABIERTO' si estaba en 'ENTREGADO' y se agregan detalles.
   */
  async actualizarPedido(
    id: string,
    body: ActualizarPedidoEntrada,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<ResultadoActualizarPedido> {
    const {
      total,
      detalles,
      clienteNombre,
      clienteCI,
      clienteNIT,
      cajeroAsignado,
      montoPropina,
      subtotalCierre,
      estado
    } = body

    const pedidoAnterior = await this.pedidoRepo.buscarPorId(id)

    if (!pedidoAnterior) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    // Las cuentas con tandas no pueden reemplazar todos sus detalles.
    // Las nuevas adiciones deben pasar por crearTandaPedido.
    if (
      detalles !== undefined &&
      Array.isArray(pedidoAnterior.tandas) &&
      pedidoAnterior.tandas.length > 0
    ) {
      throw new PedidoServiceError(
        409,
        'No se pueden reemplazar los detalles de una cuenta con tandas. Crea una nueva tanda para agregar productos.'
      )
    }

    // Regla de titularidad: Mesero responsable o Administrador
    const meseroResponsableId = pedidoAnterior.usuario
      ? pedidoAnterior.usuario.toString()
      : ''

    const esResponsable =
      !usuarioAuthId || meseroResponsableId === usuarioAuthId

    const esAdmin =
      usuarioRol === 'Administrador' || usuarioRol === 'superadmin'

    if (!esResponsable && !esAdmin) {
      throw new PedidoServiceError(
        403,
        'Acceso denegado: solo el mesero responsable del pedido o un Administrador pueden modificar este pedido.'
      )
    }

    // Bloquear cualquier modificación si ya se solicitó la cuenta de la mesa.
    if (pedidoAnterior.mesa) {
      const mesaPedido = await this.mesaRepo.buscarPorId(
        pedidoAnterior.mesa.toString()
      )

      if (mesaPedido?.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
        throw new PedidoServiceError(
          400,
          'No se puede modificar un pedido cuya mesa ya tiene la cuenta solicitada.'
        )
      }
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

    if (
      montoPropina !== undefined &&
      Number(montoPropina) < 0
    ) {
      throw new PedidoServiceError(
        400,
        'El monto de propina no puede ser negativo'
      )
    }

    if (total !== undefined && Number(total) < 0) {
      throw new PedidoServiceError(
        400,
        'El total no puede ser negativo'
      )
    }

    if (
      subtotalCierre !== undefined &&
      Number(subtotalCierre) < 0
    ) {
      throw new PedidoServiceError(
        400,
        'El subtotal no puede ser negativo'
      )
    }

    // Allowlist explícita para evitar Mass Assignment
    const updates: PedidoActualizarDatos = {}

    if (detalles !== undefined) {
      const { detallesCalculados, subtotal } =
        await this.procesarDetallesPedido(detalles)

      updates.detalles = detallesCalculados
      updates.subtotalCierre = subtotal
    }

    // Solo reabrir el pedido a ABIERTO si se están agregando nuevos platos (detalles)
    if (
      pedidoAnterior.estado === ESTADOS_PEDIDO.ENTREGADO &&
      detalles !== undefined
    ) {
      // Los nuevos platos aún deben prepararse y recogerse.
      updates.estado = ESTADOS_PEDIDO.ABIERTO
      updates.recogido = false
      Object.assign(updates, {
        fechaRecogida: null,
        recogidoPor: null
      })
    }

    if (clienteNombre !== undefined) {
      updates.clienteNombre = String(clienteNombre).trim()
    }

    if (clienteCI !== undefined) {
      updates.clienteCI = String(clienteCI).trim()
    }

    if (clienteNIT !== undefined) {
      updates.clienteNIT = String(clienteNIT).trim()
    }

    if (cajeroAsignado !== undefined) {
      updates.cajeroAsignado = cajeroAsignado
    }

    if (montoPropina !== undefined) {
      updates.montoPropina = Number(montoPropina)
    }

    // Autoridad Financiera: subtotal y total siempre calculados por backend
    const finalSub =
      updates.subtotalCierre !== undefined
        ? updates.subtotalCierre
        : Number(
            pedidoAnterior?.subtotalCierre ||
              pedidoAnterior?.total ||
              0
          )

    const finalProp =
      updates.montoPropina !== undefined
        ? updates.montoPropina
        : Number(pedidoAnterior?.montoPropina || 0)

    if (
      updates.detalles !== undefined ||
      updates.montoPropina !== undefined
    ) {
      updates.total = Number((finalSub + finalProp).toFixed(2))

      if (
        !updates.subtotalCierre &&
        (!pedidoAnterior?.subtotalCierre ||
          pedidoAnterior.subtotalCierre === 0)
      ) {
        updates.subtotalCierre = finalSub
      }
    }

    const pedidoActualizado = await this.pedidoRepo.actualizar(
      id,
      updates
    )

    if (!pedidoActualizado) {
      throw new PedidoServiceError(
        404,
        'Pedido no encontrado'
      )
    }

    let mesaReactivada: MesaPobladaDoc | null = null

    if (
      pedidoActualizado.mesa &&
      updates.estado === ESTADOS_PEDIDO.ABIERTO
    ) {
      const mesaId = obtenerIdReferenciaPedido(pedidoActualizado.mesa)

      if (!mesaId) {
        throw new PedidoServiceError(
          500,
          'No se pudo identificar la mesa del pedido para reactivarla.'
        )
      }

      mesaReactivada = await this.mesaRepo.actualizarEstado(
        mesaId,
        ESTADOS_MESA.OCUPADA
      )
    }

    return {
      pedidoActualizado:
        PedidoService.agregarFechaBoliviaPedido(
          pedidoActualizado
        ),
      pedidoDoc: pedidoActualizado,
      mesaReactivada,
      reabierto:
        updates.estado === ESTADOS_PEDIDO.ABIERTO,
      cajeroAsignado
    }
  }

  /**
   * Obtiene pedidos de mesas con cuenta solicitada formateados para caja
   */
  async obtenerPedidosPendientesCobro(
    cajero?: string
  ): Promise<PedidoPayloadCaja[]> {
    const todasLasMesas =
      await this.mesaRepo.buscarTodos()

    const mesasConCuentaSolicitada =
      todasLasMesas.filter(
        (mesa) =>
          mesa.estado === ESTADOS_MESA.CUENTA_SOLICITADA
      )

    const mesaIds =
      mesasConCuentaSolicitada.map(
        (mesa) => mesa._id
      )

    const pedidos =
      await this.pedidoRepo.buscarPendientesCobro(
        mesaIds,
        cajero
      )

    return pedidos.map((pedido) => ({
      ...PedidoService.formatearPayloadCaja(
        pedido
      ),
      fechaHoraBolivia: pedido.fechaHora
        ? formatearFechaBolivia(
            pedido.fechaHora
          )
        : undefined
    }))
  }

  /**
   * Solicita una cuenta con tandas.
   * La cuenta y la mesa se actualizan en una única transacción.
   */
  private async solicitarCuentaConTandas(
    id: string,
    usuarioAuthId?: string,
    usuarioRol?: string
  ): Promise<ResultadoSolicitarCuenta> {
    if (!Types.ObjectId.isValid(id)) {
      throw new PedidoServiceError(400, 'ID de pedido inválido')
    }

    if (!usuarioAuthId || !Types.ObjectId.isValid(usuarioAuthId)) {
      throw new PedidoServiceError(401, 'Usuario no autenticado')
    }

    const session = await mongoose.startSession()
    let mesaActualizada: MesaPobladaDoc | null = null

    try {
      await session.withTransaction(async () => {
        const pedido = await this.pedidoRepo.buscarPorId(id, session)

        if (!pedido) {
          throw new PedidoServiceError(404, 'Pedido no encontrado')
        }

        const esResponsable = pedido.usuario?.toString() === usuarioAuthId
        const esAdmin = ['Administrador', 'superadmin'].includes(usuarioRol || '')

        if (!esResponsable && !esAdmin) {
          throw new PedidoServiceError(
            403,
            'Solo el mesero responsable del pedido o un Administrador pueden solicitar la cuenta.'
          )
        }

        if (!pedido.mesa) {
          throw new PedidoServiceError(
            400,
            'No se puede solicitar cuenta porque el pedido no tiene una mesa asignada.'
          )
        }

        if (
          pedido.estadoCuenta !== ESTADOS_CUENTA.ABIERTA ||
          pedido.estado === ESTADOS_PEDIDO.CERRADO ||
          pedido.estado === ESTADOS_PEDIDO.CANCELADO
        ) {
          throw new PedidoServiceError(
            409,
            'La cuenta ya no está abierta o fue cerrada o cancelada.'
          )
        }

        if (!Array.isArray(pedido.tandas) || pedido.tandas.length === 0) {
          throw new PedidoServiceError(
            409,
            'La cuenta no contiene tandas válidas para solicitar el cobro.'
          )
        }

        const tandasPendientes = pedido.tandas.filter(
          (tanda) =>
            tanda.estado !== ESTADOS_TANDA_COCINA.ENTREGADA &&
            tanda.estado !== ESTADOS_TANDA_COCINA.CANCELADA
        )

        if (tandasPendientes.length > 0) {
          const detalle = tandasPendientes
            .map((tanda) => `#${tanda.numeroTanda}: ${tanda.estado}`)
            .join(', ')

          throw new PedidoServiceError(
            409,
            `No se puede solicitar la cuenta mientras haya tandas pendientes: ${detalle}.`
          )
        }

        const pedidoActualizado =
          await this.pedidoRepo.marcarCuentaSolicitadaPorTandas(id, session)

        if (!pedidoActualizado) {
          throw new PedidoServiceError(
            409,
            'La cuenta cambió durante la operación. Actualiza el pedido e inténtalo nuevamente.'
          )
        }

        const mesa = await this.mesaRepo.marcarCuentaSolicitadaSiOcupada(
          pedido.mesa.toString(),
          session
        )

        if (!mesa) {
          throw new PedidoServiceError(
            409,
            'La mesa ya no está ocupada o cambió de estado. No se solicitó la cuenta.'
          )
        }

        mesaActualizada = mesa
      })

      const pedidoPoblado = await this.pedidoRepo.buscarPorIdPobladoCaja(id)

      if (!pedidoPoblado || !mesaActualizada) {
        throw new PedidoServiceError(
          500,
          'No se pudo preparar la respuesta de la solicitud de cuenta.'
        )
      }

      const payload = PedidoService.formatearPayloadCaja(
        pedidoPoblado,
        mesaActualizada
      )

      return {
        payload,
        mesaActualizada,
        cajeroAsignado: pedidoPoblado.cajeroAsignado
      }
    } finally {
      await session.endSession()
    }
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

    // Las cuentas nuevas usan el flujo por tandas.
    // Los pedidos históricos conservan su lógica anterior.
    if (Array.isArray(pedido.tandas) && pedido.tandas.length > 0) {
      return await this.solicitarCuentaConTandas(
        id,
        usuarioAuthId,
        usuarioRol
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
      pedido.estado !== ESTADOS_PEDIDO.ENTREGADO ||
      pedido.recogido !== true
    ) {
      throw new PedidoServiceError(
        400,
        'Solo se puede solicitar la cuenta cuando el pedido está entregado y recogido.'
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

    if (!pedidoPoblado) {
      throw new PedidoServiceError(
        404,
        'No se encontró el pedido para preparar el payload de caja.'
      )
    }

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
   * Registra la recogida física de una tanda individual por el mesero.
   * No modifica el estado global del pedido ni el de otras tandas.
   */
  async marcarTandaEntregada(
    pedidoId: string,
    tandaId: string,
    usuarioAuthId: string,
    usuarioRol: string
  ): Promise<{
    mensaje: string
    pedido: PedidoFormateado
    tanda: ITandaCocina
    fechaRecogida: Date
  }> {
    if (!Types.ObjectId.isValid(pedidoId) || !Types.ObjectId.isValid(tandaId)) {
      throw new PedidoServiceError(400, 'ID de pedido o tanda inválido')
    }

    if (!Types.ObjectId.isValid(usuarioAuthId)) {
      throw new PedidoServiceError(401, 'Usuario no autenticado')
    }

    const pedido = await this.pedidoRepo.buscarPorId(pedidoId)

    if (!pedido) {
      throw new PedidoServiceError(404, 'Pedido no encontrado')
    }

    const esResponsable = pedido.usuario?.toString() === usuarioAuthId
    const esAdmin = ['Administrador', 'superadmin'].includes(usuarioRol)

    if (!esResponsable && !esAdmin) {
      throw new PedidoServiceError(
        403,
        'Solo el mesero responsable o un Administrador pueden recoger esta tanda.'
      )
    }

    if (
      pedido.estadoCuenta !== ESTADOS_CUENTA.ABIERTA ||
      !Array.isArray(pedido.tandas) ||
      pedido.estado === ESTADOS_PEDIDO.CERRADO ||
      pedido.estado === ESTADOS_PEDIDO.CANCELADO
    ) {
      throw new PedidoServiceError(
        409,
        'La cuenta no está abierta para registrar la entrega de una tanda.'
      )
    }

    if (pedido.mesa) {
      const mesa = await this.mesaRepo.buscarPorId(pedido.mesa.toString())

      if (mesa?.estado === ESTADOS_MESA.CUENTA_SOLICITADA) {
        throw new PedidoServiceError(
          409,
          'No se puede recoger una tanda después de solicitar la cuenta.'
        )
      }
    }

    const tanda = pedido.tandas.find(
      (item) => item._id?.toString() === tandaId
    )

    if (!tanda) {
      throw new PedidoServiceError(404, 'La tanda no existe en esta cuenta.')
    }

    if (tanda.estado !== ESTADOS_TANDA_COCINA.LISTA) {
      throw new PedidoServiceError(
        409,
        `Solo se pueden recoger tandas en estado LISTA. Estado actual: "${tanda.estado}".`
      )
    }

    const fechaRecogida = obtenerFechaBolivia()

    const pedidoActualizado = await this.pedidoRepo.transicionarTandaEstado(
      pedidoId,
      new Types.ObjectId(tandaId),
      ESTADOS_TANDA_COCINA.LISTA,
      ESTADOS_TANDA_COCINA.ENTREGADA,
      new Types.ObjectId(usuarioAuthId),
      fechaRecogida
    )

    if (!pedidoActualizado) {
      throw new PedidoServiceError(
        409,
        'La tanda cambió mientras se registraba la entrega. Vuelve a consultar el pedido.'
      )
    }

    const tandaActualizada = pedidoActualizado.tandas?.find(
      (item) => item._id?.toString() === tandaId
    )

    if (!tandaActualizada) {
      throw new PedidoServiceError(
        500,
        'No se encontró la tanda después de registrar la entrega.'
      )
    }

    return {
      mensaje: 'Tanda marcada como entregada.',
      pedido: PedidoService.agregarFechaBoliviaPedido(pedidoActualizado),
      tanda: tandaActualizada,
      fechaRecogida
    }
  }

  /**
   * Marca un pedido antiguo, sin tandas, como recogido físicamente por el mesero.
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
    pedido: PedidoFormateado
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

    // Las cuentas modernas deben registrar la recogida tanda por tanda.
    if (Array.isArray(pedido.tandas) && pedido.tandas.length > 0) {
      throw new PedidoServiceError(
        409,
        'Esta cuenta utiliza tandas. Recoge cada tanda mediante su operación específica.'
      )
    }

    // 1. Regla de estado: solo pedidos antiguos en estado ENTREGADO pueden ser recogidos.
    if (
      pedido.estado !==
      ESTADOS_PEDIDO.ENTREGADO
    ) {
      throw new PedidoServiceError(
        400,
        `No se puede marcar como recogido un pedido en estado "${pedido.estado}". Solo se pueden recoger pedidos en estado "${ESTADOS_PEDIDO.ENTREGADO}".`
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

    const esAdmin =
      usuarioRol === 'Administrador' ||
      usuarioRol === 'superadmin'

    if (!esResponsable && !esAdmin) {
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