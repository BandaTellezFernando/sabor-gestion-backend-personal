// src/services/pago.service.ts
import mongoose, { Types } from 'mongoose'
import { PagoRepository, pagoRepository } from '../repositories/pago.repo'
import { PedidoRepository, pedidoRepository } from '../repositories/pedido.repo'
import { MesaRepository, mesaRepository } from '../repositories/mesa.repo'
import { METODOS_PAGO } from '../utils/constants'
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
import Usuario from '../models/Usuario'
import type { IPago } from '../models/Pago'
import type { IPedido } from '../models/Pedido'
import { generarComprobantePdf } from '../utils/comprobantePdf'
import type { PedidoComprobantePdf } from '../utils/comprobantePdf'
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
      porcentajePropina = 0,
      montoPropina: bodyMontoPropina,
      cajeroAsignado: bodyCajeroAsignado,
      cajeroId: authCajeroId,
      clienteNombre,
      clienteCI,
      clienteNIT
    } = dto

    // ─── 1. VALIDACIONES PREVIAS (Fuera de la transacción) ──────────────────────
    const pedido = await this.pedidoRepo.buscarPorIdPobladoCaja(pedidoId)

    if (!pedido) {
      throw new PagoServiceError(404, 'Pedido no encontrado')
    }
    if (pedido.cuentaMesa) {
  throw new PagoServiceError(
    409,
    'Esta comanda pertenece a una cuenta agrupada. Debes cobrar la cuenta completa.'
  )
}

    if (pedido.estado === 'CERRADO') {
      throw new PagoServiceError(400, 'Este pedido ya ha sido pagado y cerrado.')
    }

    // Regla flexibilizada: Solo se bloquea si está cancelado. ABIERTO, EN_PREPARACION y ENTREGADO sí pueden cobrarse.
    if (pedido.estado === 'CANCELADO') {
      throw new PagoServiceError(400, 'No se puede cobrar un pedido cancelado.')
    }

        const metodoPagoNormalizado = String(metodoPago ?? '').trim()

    const metodoPagoValido = METODOS_PAGO.find(
      (metodo) =>
        metodo.toLowerCase() === metodoPagoNormalizado.toLowerCase()
    )

    if (!metodoPagoValido) {
  throw new PagoServiceError(
    400,
    `Método de pago inválido. Métodos permitidos: ${METODOS_PAGO.join(', ')}.`
  )
}

if (metodoPagoValido === 'QR') {
  throw new PagoServiceError(
    400,
    'Los pagos QR deben procesarse mediante el flujo seguro de cuenta con token.'
  )
}

    // ─── 2. CÁLCULOS FINANCIEROS (Puros, fuera de la transacción) ───────────────
        // Los importes se calcularán dentro de la transacción,
    // usando el pedido más reciente leído desde MongoDB.
    const ped: IPedido = pedido

    let subtotal = 0
    let montoPropina = 0
    let totalFinal = 0

    const cajeroId =
      authCajeroId ||
      bodyCajeroAsignado ||
      pedido.cajeroAsignado ||
      null

    // ─── 3. TRANSACCIÓN ATÓMICA MONGODB (Exclusiva de PagoService) ───────────────
    const session = await mongoose.startSession()
    session.startTransaction()

            let nuevoEstadoMesa = 'Libre'
    let nuevoPago: IPago | null = null
    let mesaLiberada:
      Awaited<ReturnType<MesaRepository['actualizarEstado']>> = null
    let comprobantePdf:
      ResultadoProcesarPago['comprobantePdf'] | null = null

   try {
  // Comprobar nuevamente dentro de la transacción para evitar
  // cobrar individualmente una comanda agrupada simultáneamente.
  const pedidoEnTransaccion = await this.pedidoRepo.buscarPorId(
    pedidoId,
    session
  )

  if (!pedidoEnTransaccion) {
  throw new PagoServiceError(
    404,
    'El pedido ya no existe.'
  )
}

const mesaIdPago = pedidoEnTransaccion.mesa

if (!mesaIdPago) {
  throw new PagoServiceError(
    400,
    'No se puede registrar el pago porque el pedido no tiene una mesa asignada.'
  )
}

  if (pedidoEnTransaccion.cuentaMesa) {
    throw new PagoServiceError(
      409,
      'Esta comanda pertenece a una cuenta agrupada. Debes cobrar la cuenta completa.'
    )
  }

      // 3.1 Validar el estado y calcular los importes
      // usando exclusivamente los detalles persistidos.

      if (pedidoEnTransaccion.estado === 'CERRADO') {
        throw new PagoServiceError(
          409,
          'Este pedido ya ha sido pagado y cerrado.'
        )
      }

      if (pedidoEnTransaccion.estado === 'CANCELADO') {
        throw new PagoServiceError(
          400,
          'No se puede cobrar un pedido cancelado.'
        )
      }

      const detalles = pedidoEnTransaccion.detalles

      if (!Array.isArray(detalles) || detalles.length === 0) {
        throw new PagoServiceError(
          400,
          'No se puede cobrar un pedido sin detalles.'
        )
      }

      const subtotalCalculado = detalles.reduce(
        (acumulado, detalle) => {
          const cantidad = Number(detalle.cantidad)
          const precioUnitario = Number(detalle.precioUnitario)

          if (
            !Number.isFinite(cantidad) ||
            !Number.isInteger(cantidad) ||
            cantidad < 1 ||
            !Number.isFinite(precioUnitario) ||
            precioUnitario < 0
          ) {
            throw new PagoServiceError(
              400,
              'El pedido contiene cantidades o precios no válidos.'
            )
          }

          const importeDetalle = cantidad * precioUnitario

          if (!Number.isFinite(importeDetalle)) {
            throw new PagoServiceError(
              400,
              'El importe de uno de los productos no es válido.'
            )
          }

          return acumulado + Number(importeDetalle.toFixed(2))
        },
        0
      )

      if (
        !Number.isFinite(subtotalCalculado) ||
        subtotalCalculado <= 0
      ) {
        throw new PagoServiceError(
          400,
          'No se pudo determinar un subtotal válido para el pedido.'
        )
      }

      subtotal = Number(subtotalCalculado.toFixed(2))

      const porcentajeSolicitado = Number(
        porcentajePropina ?? 0
      )

      if (
        !Number.isFinite(porcentajeSolicitado) ||
        porcentajeSolicitado < 0 ||
        porcentajeSolicitado > 100
      ) {
        throw new PagoServiceError(
          400,
          'El porcentaje de propina debe estar entre 0 y 100.'
        )
      }

      if (
        bodyMontoPropina !== undefined &&
        bodyMontoPropina !== null
      ) {
        montoPropina = Number(bodyMontoPropina)
      } else if (porcentajeSolicitado > 0) {
        montoPropina =
          subtotal * (porcentajeSolicitado / 100)
      } else {
        montoPropina = Number(
          pedidoEnTransaccion.montoPropina ?? 0
        )
      }

      if (
        !Number.isFinite(montoPropina) ||
        montoPropina < 0
      ) {
        throw new PagoServiceError(
          400,
          'El importe de la propina no es válido.'
        )
      }

      montoPropina = Number(montoPropina.toFixed(2))
      totalFinal = Number(
        (subtotal + montoPropina).toFixed(2)
      )

      if (!Number.isFinite(totalFinal) || totalFinal <= 0) {
        throw new PagoServiceError(
          400,
          'El total del pago no es válido.'
        )
      }

pedidoEnTransaccion.estado = 'CERRADO'
pedidoEnTransaccion.total = totalFinal
pedidoEnTransaccion.metodoPago = metodoPagoValido
pedidoEnTransaccion.montoPropina = montoPropina
pedidoEnTransaccion.subtotalCierre = subtotal

if (clienteNombre !== undefined) {
  pedidoEnTransaccion.clienteNombre = String(clienteNombre).trim()
}

if (clienteCI !== undefined) {
  pedidoEnTransaccion.clienteCI = String(clienteCI).trim()
}

if (clienteNIT !== undefined) {
  pedidoEnTransaccion.clienteNIT = String(clienteNIT).trim()
}

if (cajeroId) {
  pedidoEnTransaccion.set('cajeroAsignado', cajeroId)
}

await this.pedidoRepo.guardar(pedidoEnTransaccion, session)

// Sincronizar los datos utilizados posteriormente por el comprobante.
pedido.estado = pedidoEnTransaccion.estado
pedido.total = pedidoEnTransaccion.total

ped.metodoPago = pedidoEnTransaccion.metodoPago
ped.montoPropina = pedidoEnTransaccion.montoPropina
ped.subtotalCierre = pedidoEnTransaccion.subtotalCierre
ped.clienteNombre = pedidoEnTransaccion.clienteNombre
ped.clienteCI = pedidoEnTransaccion.clienteCI
ped.clienteNIT = pedidoEnTransaccion.clienteNIT

if (cajeroId) {
  ped.cajeroAsignado = pedidoEnTransaccion.cajeroAsignado
}

      const fechaEnvioCaja = obtenerFechaBolivia()
      const fechaPago = obtenerFechaBolivia()

      // 3.2 Crear Pago mediante PagoRepository
      nuevoPago = await this.pagoRepo.crear(
        {
          codigoPago: `PAG-${String(pedidoEnTransaccion._id).slice(-6).toUpperCase()}`,
          codigoPedido: pedidoEnTransaccion.codigo,
          pedido: pedidoEnTransaccion._id,
          mesa: mesaIdPago,
          mesero: pedidoEnTransaccion.usuario,
          cajero: cajeroId,
          nombreCliente: ped.clienteNombre || 'Consumidor Final',
          ci: ped.clienteCI || '',
          nit: ped.clienteNIT || '',
          subtotal: subtotal,
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

            // 3.3 Liberar la mesa solo cuando no queden otros pedidos activos.
      const pedidosActivosRestantes =
        await this.pedidoRepo.buscarPedidosActivosPorMesaParaCuenta(
          mesaIdPago,
          session
        )

      if (pedidosActivosRestantes.length === 0) {
        nuevoEstadoMesa = 'Libre'

        mesaLiberada = await this.mesaRepo.actualizarEstado(
          mesaIdPago.toString(),
          nuevoEstadoMesa,
          session
        )

        if (!mesaLiberada) {
          throw new PagoServiceError(
            409,
            'No se pudo liberar la mesa.'
          )
        }
      } else {
        const mesaActual = await this.mesaRepo.buscarPorId(
          mesaIdPago.toString(),
          session
        )

        if (!mesaActual) {
          throw new PagoServiceError(
            404,
            'Mesa no encontrada.'
          )
        }

        nuevoEstadoMesa = mesaActual.estado
      }

            // Preparar el pedido completo para el comprobante PDF.
            const pedidoPobladoParaPdf =
        await this.pedidoRepo.buscarPorIdPobladoParaComprobante(
          pedidoId,
          session
        )

      if (!pedidoPobladoParaPdf) {
        throw new PagoServiceError(
          409,
          'No se pudo recuperar el pedido actualizado para generar el comprobante.'
        )
      }

      const pedidoParaPdf = pedidoPobladoParaPdf as unknown as {
        codigo: string
        fechaHora: Date
        fechaHoraBolivia?: string
        usuario?:
          | Types.ObjectId
          | {
              nombre?: string
              apellido?: string
              apellidos?: string
            }
          | null
        detalles: Array<{
          nombrePlato?: string
          plato?: Types.ObjectId | { nombre?: string } | null
          cantidad: number
          precioUnitario: number
          subtotal?: number
          observacion?: string
        }>
      }

      const usuarioPedido = pedidoParaPdf.usuario

      const meseroPoblado =
        usuarioPedido &&
        typeof usuarioPedido === 'object' &&
        'nombre' in usuarioPedido
          ? usuarioPedido
          : null

      const meseroNombre = meseroPoblado
        ? [
            meseroPoblado.nombre,
            meseroPoblado.apellido || meseroPoblado.apellidos
          ]
            .filter(
              (parte): parte is string =>
                typeof parte === 'string' && parte.trim() !== ''
            )
            .map((parte) => parte.trim())
            .join(' ') || 'No identificado'
        : 'No identificado'

      const detallesPdf: PedidoComprobantePdf['detalles'] =
        pedidoParaPdf.detalles.map((detalle) => {
          const plato = detalle.plato

          const nombreDesdePlato =
            plato !== null &&
            plato !== undefined &&
            typeof plato === 'object' &&
            'nombre' in plato &&
            typeof plato.nombre === 'string'
              ? plato.nombre.trim()
              : ''

          const nombreGuardado = detalle.nombrePlato?.trim() ?? ''

          const nombre =
            nombreGuardado !== '' &&
            nombreGuardado.toLowerCase() !== 'plato'
              ? nombreGuardado
              : nombreDesdePlato || nombreGuardado || 'Producto'

          const cantidad = Number(detalle.cantidad)
          const precioUnitario = Number(detalle.precioUnitario)

          const subtotalDetalle = Number(
            (
              detalle.subtotal ??
              precioUnitario * cantidad
            ).toFixed(2)
          )

          return {
            nombre,
            cantidad,
            precioUnitario: Number(precioUnitario.toFixed(2)),
            subtotal: subtotalDetalle,
            observacion:
              detalle.observacion?.trim() ||
              'Sin observaciones'
          }
        })

      if (detallesPdf.length === 0) {
        throw new PagoServiceError(
          409,
          'El pedido no contiene productos para generar el comprobante.'
        )
      }

      // Identificar al cajero responsable, cuando esté registrado.
      const cajeroDocumento =
        cajeroId && Types.ObjectId.isValid(String(cajeroId))
          ? await Usuario.findById(cajeroId)
              .select('nombre apellido')
              .session(session)
          : null

      const cajeroNombre = cajeroDocumento
        ? `${cajeroDocumento.nombre} ${cajeroDocumento.apellido || ''}`.trim()
        : 'No identificado'

      // Generar el PDF dentro de la transacción:
      // si falla, el cobro no se confirma.
      const pdfBuffer = await generarComprobantePdf({
        codigoPago: String(nuevoPago.codigoPago),
        metodoPago: metodoPagoValido,
        fechaPago: formatearFechaBolivia(fechaPago),

        clienteNombre: String(
          ped.clienteNombre || 'Consumidor Final'
        ),
        clienteCI: String(ped.clienteCI || ''),
        clienteNIT: String(ped.clienteNIT || ''),

        cajeroNombre,

        subtotal,
        propina: montoPropina,
        totalPagado: totalFinal,

        pedidos: [
          {
            codigo: pedidoParaPdf.codigo,
            fecha:
              pedidoParaPdf.fechaHoraBolivia ||
              formatearFechaBolivia(pedidoParaPdf.fechaHora),
            meseroNombre,
            detalles: detallesPdf
          }
        ]
      })

      comprobantePdf = {
        nombreArchivo: `comprobante-${nuevoPago.codigoPago}.pdf`,
        tipoContenido: 'application/pdf',
        contenidoBase64: pdfBuffer.toString('base64')
      }

      if (!comprobantePdf.contenidoBase64) {
        throw new PagoServiceError(
          500,
          'No se pudo preparar el comprobante PDF.'
        )
      }

      await session.commitTransaction()
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      session.endSession()
    }

    // ─── 4. CONSTRUCCIÓN DEL COMPROBANTE DE PAGO (Contrato Frontend) ─────────────
        const usuarioComprobante = ped.usuario

    const meseroPoblado =
      usuarioComprobante !== null &&
      typeof usuarioComprobante === 'object' &&
      'nombre' in usuarioComprobante
        ? usuarioComprobante
        : null

    const nombreMesero =
      meseroPoblado &&
      typeof meseroPoblado.nombre === 'string'
        ? meseroPoblado.nombre.trim()
        : ''

    const apellidoMesero =
      meseroPoblado &&
      'apellido' in meseroPoblado &&
      typeof meseroPoblado.apellido === 'string'
        ? meseroPoblado.apellido.trim()
        : ''

    const meseroNombre =
      `${nombreMesero} ${apellidoMesero}`.trim() ||
      'Sin mesero'

    const fechaComprobante = obtenerFechaBolivia()

    const comprobante: ComprobantePago = {
      pedidoId: pedido._id,
      meseroNombre,
      subtotal,
      montoPropina,
      propinaAplicada: montoPropina,
      total: totalFinal,
      totalPagado: totalFinal,
      metodoPago: ped.metodoPago,
      cajeroAsignado: ped.cajeroAsignado,
      clienteNombre: ped.clienteNombre || 'Consumidor Final',
      clienteCI: ped.clienteCI || '',
      clienteNIT: ped.clienteNIT || '',
      fechaBolivia: formatearFechaBolivia(fechaComprobante),
      fecha: fechaComprobante
    }

        if (!comprobantePdf) {
      throw new PagoServiceError(
        500,
        'No se pudo generar el comprobante PDF del pago.'
      )
    }

       return {
      pedidoActualizado: pedido,
      nuevoPago,
      mesaLiberada,
      nuevoEstadoMesa,
      statusSocketMesa: 'Disponible',
      comprobante,
      comprobantePdf
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
    email: string
  ): Promise<void> {
    const emailNormalizado = email.trim()

    if (
      emailNormalizado.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)
    ) {
      throw new PagoServiceError(
        400,
        'Debe proporcionar un correo electrónico válido.'
      )
    }

    if (!Types.ObjectId.isValid(pedidoId)) {
      throw new PagoServiceError(
        400,
        'El identificador del pedido no es válido.'
      )
    }

    const pedido =
      await this.pedidoRepo.buscarPorIdPoblado(pedidoId)

    if (!pedido) {
      throw new PagoServiceError(
        404,
        'Pedido no encontrado.'
      )
    }

    if (pedido.estado !== 'CERRADO') {
      throw new PagoServiceError(
        409,
        'No se puede enviar el comprobante: el pedido no está cerrado.'
      )
    }

    const pago =
      await this.pagoRepo.buscarPagoIndividualPagadoPorPedidoId(
        pedidoId
      )

    if (!pago) {
      throw new PagoServiceError(
        409,
        'No existe un pago individual confirmado para este pedido. No se enviará el comprobante.'
      )
    }

    if (
      pago.metodoPago !== 'Efectivo' &&
      pago.metodoPago !== 'Tarjeta'
    ) {
      throw new PagoServiceError(
        409,
        'El método de pago no corresponde a un pago individual válido.'
      )
    }

    const subtotal = Number(pago.subtotal)
    const propina = Number(pago.propina)
    const totalFinal = Number(pago.totalFinal)

    if (
      !Number.isFinite(subtotal) ||
      subtotal < 0 ||
      !Number.isFinite(propina) ||
      propina < 0 ||
      !Number.isFinite(totalFinal) ||
      totalFinal <= 0 ||
      Number((subtotal + propina).toFixed(2)) !==
        Number(totalFinal.toFixed(2))
    ) {
      throw new PagoServiceError(
        409,
        'Los importes del pago registrado no son consistentes.'
      )
    }

    const pedidoCorreo = pedido as unknown as Omit<
      IPedido,
      'mesa' | 'usuario' | 'detalles'
    > & {
      mesa?: Types.ObjectId | {
        _id?: Types.ObjectId
        numero?: string
      } | null
      usuario?: Types.ObjectId | {
        _id?: Types.ObjectId
        nombre?: string
        apellido?: string
      } | null
      detalles: Array<{
        nombrePlato?: string
        cantidad: number
        precioUnitario: number
        subtotal?: number
        plato: Types.ObjectId | {
          nombre?: string
        } | null
      }>
    }

    const mesaReferencia = pedidoCorreo.mesa

    const mesaId =
      mesaReferencia instanceof Types.ObjectId
        ? mesaReferencia.toString()
        : mesaReferencia?._id?.toString()

    const mesaDocumento = mesaId
      ? await this.mesaRepo.buscarPorId(mesaId)
      : null

    const mesaNombre =
      mesaDocumento?.numero ||
      (
        mesaReferencia &&
        !(mesaReferencia instanceof Types.ObjectId)
          ? mesaReferencia.numero
          : undefined
      ) ||
      'Barra'

    const usuarioReferencia = pedidoCorreo.usuario

    const meseroPoblado =
      usuarioReferencia &&
      !(usuarioReferencia instanceof Types.ObjectId)
        ? usuarioReferencia
        : null

    const meseroNombre =
      `${meseroPoblado?.nombre || ''} ${
        meseroPoblado?.apellido || ''
      }`.trim() || 'Mesero'

    const items: ItemFactura[] =
      pedidoCorreo.detalles.map((detalle) => {
        const cantidad = Number(detalle.cantidad)
        const precioUnitario = Number(detalle.precioUnitario)

        if (
          !Number.isInteger(cantidad) ||
          cantidad < 1 ||
          !Number.isFinite(precioUnitario) ||
          precioUnitario < 0
        ) {
          throw new PagoServiceError(
            409,
            'El pedido contiene detalles con cantidades o precios no válidos.'
          )
        }

        const nombrePlatoPoblado =
          detalle.plato &&
          !(detalle.plato instanceof Types.ObjectId)
            ? detalle.plato.nombre
            : undefined

        const nombreGuardado =
          detalle.nombrePlato?.trim() || ''

        const nombre =
          nombreGuardado !== '' &&
          nombreGuardado.toLowerCase() !== 'plato'
            ? nombreGuardado
            : nombrePlatoPoblado?.trim() || 'Plato'

        const subtotalDetalle = Number(
          (cantidad * precioUnitario).toFixed(2)
        )

        return {
          nombre,
          cantidad,
          precioUnitario,
          subtotal: subtotalDetalle
        }
      })

    if (items.length === 0) {
      throw new PagoServiceError(
        409,
        'No se puede enviar un comprobante sin productos.'
      )
    }

    const subtotalDetalles = Number(
      items
        .reduce((suma, item) => suma + item.subtotal, 0)
        .toFixed(2)
    )

    if (
      subtotalDetalles !== Number(subtotal.toFixed(2))
    ) {
      throw new PagoServiceError(
        409,
        'El subtotal de los productos no coincide con el pago registrado.'
      )
    }

    const codigo = pedido.codigo.trim()

    if (!codigo || /[\r\n]/.test(codigo)) {
      throw new PagoServiceError(
        409,
        'El código del pedido no es válido para generar el recibo.'
      )
    }

    const clienteNombre =
      pago.nombreCliente?.trim() ||
      pedidoCorreo.clienteNombre?.trim() ||
      'Consumidor Final'

    const ci = pago.ci?.trim() || pedidoCorreo.clienteCI?.trim() || ''
    const nit = pago.nit?.trim() || pedidoCorreo.clienteNIT?.trim() || ''

    const clienteCI = [
      ci ? `CI: ${ci}` : '',
      nit ? `NIT: ${nit}` : ''
    ].filter(Boolean).join(' / ') || 'S/N'

    const datosFactura: DatosFactura = {
      codigo,
      mesaNombre,
      meseroNombre,
      clienteNombre,
      clienteCI,
      subtotal,
      propina,
      totalFinal,
      metodoPago: pago.metodoPago,
      fecha: formatearFechaBolivia(
        pago.fechaPago ?? pago.createdAt
      ),
      items
    }

    const htmlDelRecibo =
      generarPlantillaFacturaHTML(datosFactura)

    await enviarCorreo(
      emailNormalizado,
      `Comprobante de pago - ${codigo}`,
      htmlDelRecibo
    )
  }
}

export const pagoService = new PagoService()
