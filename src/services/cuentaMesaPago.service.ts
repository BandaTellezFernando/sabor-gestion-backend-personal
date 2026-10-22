
//src/services/cuentaMesaPago.service.ts
import mongoose, { Types } from 'mongoose'
import { enviarCorreo } from './email.service'
import {
  generarPlantillaFacturaHTML,
  DatosFactura,
  ItemFactura
} from '../utils/facturaTemplate'
import Usuario from '../models/Usuario'
import { generarComprobantePdf } from '../utils/comprobantePdf'
import type { PedidoComprobantePdf } from '../utils/comprobantePdf'
import {
  CuentaMesaRepository,
  cuentaMesaRepository
} from '../repositories/cuentaMesa.repo'

import {
  PedidoRepository,
  pedidoRepository
} from '../repositories/pedido.repo'

import {
  MesaRepository,
  mesaRepository
} from '../repositories/mesa.repo'

import {
  PagoRepository,
  pagoRepository
} from '../repositories/pago.repo'

import { ESTADOS_CUENTA_MESA } from '../models/CuentaMesa'

import {
  DatosTarjetaSimuladaDTO,
  ProcesarPagoCuentaDTO,
  ResultadoProcesarPagoCuenta
} from '../types/pago.types'

import {
  ESTADOS_MESA,
  ESTADOS_PEDIDO,
  METODOS_PAGO,
  MetodoPago
} from '../utils/constants'

import {
  obtenerFechaBolivia,
  formatearFechaBolivia
} from '../utils/fechaBolivia'

export class CuentaMesaPagoServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'CuentaMesaPagoServiceError'
  }
}

interface DatosClienteNormalizados {
  clienteNombre: string
  clienteCI: string
  clienteNIT: string
}

export class CuentaMesaPagoService {
  constructor(
    private cuentaRepo: CuentaMesaRepository = cuentaMesaRepository,
    private pedidoRepo: PedidoRepository = pedidoRepository,
    private mesaRepo: MesaRepository = mesaRepository,
    private pagoRepo: PagoRepository = pagoRepository
  ) {}

  private redondear(valor: number): number {
    return Number(valor.toFixed(2))
  }

  private validarCliente(
    metodoPago: MetodoPago,
    dto: ProcesarPagoCuentaDTO
  ): DatosClienteNormalizados {
    const clienteNombre = (dto.clienteNombre ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .normalize('NFC')

    const clienteCI = (dto.clienteCI ?? '')
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase()

    const clienteNIT = (dto.clienteNIT ?? '')
      .trim()
      .replace(/\s+/g, '')

    if (
      (metodoPago === 'Tarjeta' || metodoPago === 'QR') &&
      (!clienteNombre || !clienteCI)
    ) {
      throw new CuentaMesaPagoServiceError(
        400,
        'Para pagar con tarjeta o QR debes introducir el nombre del cliente y su CI.'
      )
    }

    if (clienteCI && !/^(?:\d{5,10}|\d{10}[A-Z0-9]{2})$/.test(clienteCI)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'La CI debe contener entre 5 y 10 dígitos, o 10 dígitos seguidos de 2 caracteres alfanuméricos.'
      )
    }

    return {
      clienteNombre: clienteNombre || 'Consumidor Final',
      clienteCI,
      clienteNIT
    }
  }

  private validarTarjeta(
    tarjeta: DatosTarjetaSimuladaDTO | undefined
  ): void {
    if (!tarjeta) {
      throw new CuentaMesaPagoServiceError(
        400,
        'Debes introducir los datos de la tarjeta.'
      )
    }

    const titular = tarjeta.titular.trim()
    const numero = tarjeta.numero.replace(/[\s-]/g, '')
    const cvv = tarjeta.cvv.trim()
    const vencimiento = tarjeta.vencimiento.trim()

    if (!titular || !/\d{13,19}/.test(numero) ||
        !/^\d{13,19}$/.test(numero)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El titular y el número de tarjeta son obligatorios. El número debe contener entre 13 y 19 dígitos.'
      )
    }

    if (!/^\d{3,4}$/.test(cvv)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El CVV de la tarjeta debe contener 3 o 4 dígitos.'
      )
    }

    const coincidencia = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(vencimiento)

    if (!coincidencia) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El vencimiento debe tener el formato MM/AA.'
      )
    }

    const mes = Number(coincidencia[1])
    const anio = 2000 + Number(coincidencia[2])
    const ultimoDiaMes = new Date(anio, mes, 0, 23, 59, 59, 999)

    if (ultimoDiaMes.getTime() < Date.now()) {
      throw new CuentaMesaPagoServiceError(
        400,
        'La tarjeta está vencida.'
      )
    }

    // Simulación: los datos de tarjeta solo se validan en memoria.
    // No guardar número, CVV, titular ni vencimiento en MongoDB.
  }

  private validarTokenQR(token: string): void {
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El token QR no es válido.'
      )
    }
  }

    /**
   * Construye el enlace público que abrirá el cliente al escanear
   * el QR. No requiere autenticación del cliente.
   */
  async obtenerDatosQR(cuentaId: string): Promise<{
    codigoCuenta: string
    urlPago: string
    total: number
  }> {
    if (!Types.ObjectId.isValid(cuentaId)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El ID de cuenta no es válido.'
      )
    }

    const cuenta = await this.cuentaRepo.buscarPorId(cuentaId)

    if (!cuenta) {
      throw new CuentaMesaPagoServiceError(
        404,
        'Cuenta no encontrada.'
      )
    }

    if (cuenta.estado !== ESTADOS_CUENTA_MESA.PENDIENTE_PAGO) {
      throw new CuentaMesaPagoServiceError(
        409,
        'Solo se puede generar el QR de una cuenta pendiente de pago.'
      )
    }

    const frontendBaseUrl = process.env.FRONTEND_URL?.trim()

    if (!frontendBaseUrl) {
      throw new CuentaMesaPagoServiceError(
        500,
        'La variable FRONTEND_URL no está configurada.'
      )
    }

    let urlPago: string

    try {
      const frontendUrl = new URL(frontendBaseUrl)

      if (
        frontendUrl.protocol !== 'http:' &&
        frontendUrl.protocol !== 'https:'
      ) {
        throw new Error('Protocolo no permitido.')
      }

      urlPago = new URL(
        `/pagar/${cuenta.qrToken}`,
        frontendUrl.origin
      ).toString()
    } catch {
      throw new CuentaMesaPagoServiceError(
        500,
        'La variable FRONTEND_URL no contiene una URL válida.'
      )
    }

    return {
      codigoCuenta: cuenta.codigoCuenta,
      urlPago,
      total: Number(cuenta.total)
    }
  }
   /**
   * Devuelve la información pública necesaria para mostrar
   * el resumen de una cuenta desde su enlace QR.
   * No expone la mesa ni el token en esta respuesta.
   */
  async consultarEstadoQR(token: string): Promise<{
    codigoCuenta: string
    estado: string
    yaPagada: boolean
    subtotal: number
    propina: number
    propinaAnadida: boolean
    total: number
    metodoPago?: string
    fechaPago?: Date | null
    pedidos: Array<{
      codigo: string
      fecha: string
      estado: string
      subtotal: number
      detalles: Array<{
        nombre: string
        cantidad: number
        precioUnitario: number
        subtotal: number
        observacion: string
      }>
    }>
  }> {
    this.validarTokenQR(token)

    const cuenta = await this.cuentaRepo.buscarPorTokenQR(token)

    if (!cuenta) {
      throw new CuentaMesaPagoServiceError(
        404,
        'El QR no existe o no es válido.'
      )
    }

    if (cuenta.pedidos.length === 0) {
      throw new CuentaMesaPagoServiceError(
        409,
        'La cuenta no contiene pedidos para mostrar.'
      )
    }

    const pedidos = await Promise.all(
      cuenta.pedidos.map(async (pedidoId) => {
        const pedido = await this.pedidoRepo.buscarPorIdPoblado(
          pedidoId
        )

        if (!pedido) {
          throw new CuentaMesaPagoServiceError(
            409,
            'Uno de los pedidos de la cuenta ya no existe.'
          )
        }

        if (
          pedido.cuentaMesa?.toString() !==
          cuenta._id.toString()
        ) {
          throw new CuentaMesaPagoServiceError(
            409,
            'Uno de los pedidos ya no pertenece a esta cuenta.'
          )
        }

        if (
          !Array.isArray(pedido.detalles) ||
          pedido.detalles.length === 0
        ) {
          throw new CuentaMesaPagoServiceError(
            409,
            `El pedido ${pedido.codigo} no contiene productos para mostrar.`
          )
        }

        const detalles = pedido.detalles.map((detalle) => {
          /*
           * En esta consulta, detalles.plato está poblado.
           * El cast describe esa relación sin utilizar any.
           */
          const detalleQR = detalle as unknown as {
            nombrePlato?: string
            plato?: Types.ObjectId | { nombre?: string } | null
            cantidad: number
            precioUnitario: number
            subtotal?: number
            observacion?: string
          }

          const plato = detalleQR.plato

          const nombreDesdePlato =
            plato !== null &&
            plato !== undefined &&
            typeof plato === 'object' &&
            'nombre' in plato &&
            typeof plato.nombre === 'string'
              ? plato.nombre.trim()
              : ''

          const nombreGuardado =
            detalleQR.nombrePlato?.trim() ?? ''

          const nombre =
            nombreGuardado !== '' &&
            nombreGuardado.toLowerCase() !== 'plato'
              ? nombreGuardado
              : nombreDesdePlato || nombreGuardado || 'Producto'

          const cantidad = Number(detalleQR.cantidad)
          const precioUnitario = Number(
            detalleQR.precioUnitario
          )

          const subtotalDetalle = this.redondear(
            Number(
              detalleQR.subtotal ??
              precioUnitario * cantidad
            )
          )

          if (
            !Number.isInteger(cantidad) ||
            cantidad <= 0 ||
            !Number.isFinite(precioUnitario) ||
            precioUnitario < 0 ||
            !Number.isFinite(subtotalDetalle) ||
            subtotalDetalle < 0
          ) {
            throw new CuentaMesaPagoServiceError(
              409,
              `El pedido ${pedido.codigo} contiene un detalle con importes inválidos.`
            )
          }

          return {
            nombre,
            cantidad,
            precioUnitario: this.redondear(precioUnitario),
            subtotal: subtotalDetalle,
            observacion:
              detalleQR.observacion?.trim() ||
              'Sin observaciones'
          }
        })

        const subtotalPedido = this.redondear(
          detalles.reduce(
            (acumulado, detalle) =>
              acumulado + detalle.subtotal,
            0
          )
        )

        return {
          codigo: pedido.codigo,
          fecha:
            pedido.fechaHoraBolivia ||
            formatearFechaBolivia(pedido.fechaHora),
          estado: pedido.estado,
          subtotal: subtotalPedido,
          detalles
        }
      })
    )

    const subtotal = Number(cuenta.subtotal)
    const propina = Number(cuenta.montoPropina ?? 0)
    const total = Number(cuenta.total)

    if (
      !Number.isFinite(subtotal) ||
      subtotal < 0 ||
      !Number.isFinite(propina) ||
      propina < 0 ||
      !Number.isFinite(total) ||
      total <= 0 ||
      this.redondear(subtotal + propina) !==
        this.redondear(total)
    ) {
      throw new CuentaMesaPagoServiceError(
        409,
        'Los importes guardados en la cuenta no son coherentes. No se puede mostrar un total de pago fiable.'
      )
    }

    return {
      codigoCuenta: cuenta.codigoCuenta,
      estado: cuenta.estado,
      yaPagada:
        cuenta.estado === ESTADOS_CUENTA_MESA.PAGADA,
      subtotal: this.redondear(subtotal),
      propina: this.redondear(propina),
      propinaAnadida: propina > 0,
      total: this.redondear(total),
      metodoPago: cuenta.metodoPago,
      fechaPago: cuenta.fechaPago ?? null,
      pedidos
    }
  }

  /**
   * Entrada para confirmar una simulación de pago QR desde
   * la pantalla pública del cliente.
   */
  async procesarPagoQR(
    token: string,
    datosCliente: Pick<
      ProcesarPagoCuentaDTO,
      'clienteNombre' | 'clienteCI' | 'clienteNIT'
    >
  ): Promise<ResultadoProcesarPagoCuenta> {
    this.validarTokenQR(token)

    const cuenta = await this.cuentaRepo.buscarPorTokenQR(token)

    if (!cuenta) {
      throw new CuentaMesaPagoServiceError(
        404,
        'El QR no existe o no es válido.'
      )
    }

    if (cuenta.estado === ESTADOS_CUENTA_MESA.PAGADA) {
      throw new CuentaMesaPagoServiceError(
        409,
        'Esta cuenta ya fue pagada. No se registrará otro cobro.'
      )
    }

    return this.procesarPagoCuenta(
      cuenta._id.toString(),
      {
        metodoPago: 'QR',
        clienteNombre: datosCliente.clienteNombre,
        clienteCI: datosCliente.clienteCI,
        clienteNIT: datosCliente.clienteNIT,
        qrToken: token
      }
    )
  }

  /**
   * Procesa un único pago para todas las comandas de una CuentaMesa.
   * El alta del pago, el cierre de pedidos, la actualización de la
   * cuenta y la liberación de la mesa comparten una transacción.
   */
  async procesarPagoCuenta(
    cuentaId: string,
    dto: ProcesarPagoCuentaDTO
  ): Promise<ResultadoProcesarPagoCuenta> {
    if (!Types.ObjectId.isValid(cuentaId)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El ID de cuenta no es válido.'
      )
    }

    const metodoPago: MetodoPago = dto.metodoPago

    if (!METODOS_PAGO.includes(metodoPago)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El método de pago no es válido.'
      )
    }

    const cliente = this.validarCliente(metodoPago, dto)

    if (metodoPago === 'Tarjeta') {
      this.validarTarjeta(dto.tarjeta)
    }

    if (metodoPago === 'QR') {
      if (!dto.qrToken) {
        throw new CuentaMesaPagoServiceError(
          400,
          'El pago QR requiere un token válido.'
        )
      }

      this.validarTokenQR(dto.qrToken)
    }

    const cajeroId = dto.cajeroId
      ? new Types.ObjectId(dto.cajeroId)
      : null

    if (dto.cajeroId && !Types.ObjectId.isValid(dto.cajeroId)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El ID del cajero no es válido.'
      )
    }

    const session = await mongoose.startSession()
    let resultado: ResultadoProcesarPagoCuenta | null = null

    try {
      await session.withTransaction(async () => {
        const cuenta = await this.cuentaRepo.buscarPorId(
          cuentaId,
          session
        )

        if (!cuenta) {
          throw new CuentaMesaPagoServiceError(
            404,
            'Cuenta no encontrada.'
          )
        }

        if (cuenta.estado === ESTADOS_CUENTA_MESA.PAGADA) {
          throw new CuentaMesaPagoServiceError(
            409,
            'Esta cuenta ya fue pagada.'
          )
        }

        if (cuenta.estado !== ESTADOS_CUENTA_MESA.PENDIENTE_PAGO) {
          throw new CuentaMesaPagoServiceError(
            409,
            'La cuenta no está disponible para el cobro.'
          )
        }

        if (metodoPago === 'QR' && dto.qrToken !== cuenta.qrToken) {
          throw new CuentaMesaPagoServiceError(
            403,
            'El QR no corresponde a esta cuenta.'
          )
        }

        const pagoExistente = await this.pagoRepo.buscarPorCuentaMesa(
          cuenta._id,
          session
        )

        if (pagoExistente) {
          throw new CuentaMesaPagoServiceError(
            409,
            'La cuenta ya tiene un pago registrado.'
          )
        }

        const mesa = await this.mesaRepo.buscarPorId(
          cuenta.mesa.toString(),
          session
        )

        if (!mesa || mesa.estado !== ESTADOS_MESA.CUENTA_SOLICITADA) {
          throw new CuentaMesaPagoServiceError(
            409,
            'La mesa ya no está en estado Cuenta Solicitada.'
          )
        }

        if (cuenta.pedidos.length === 0) {
          throw new CuentaMesaPagoServiceError(
            409,
            'La cuenta no contiene comandas.'
          )
        }

        const idsCuenta = cuenta.pedidos.map((id) => id.toString())

        if (new Set(idsCuenta).size !== idsCuenta.length) {
          throw new CuentaMesaPagoServiceError(
            409,
            'La cuenta contiene comandas duplicadas.'
          )
        }

        const pedidos = []

        for (const pedidoId of cuenta.pedidos) {
          const pedido = await this.pedidoRepo.buscarPorId(
            pedidoId,
            session
          )

          if (!pedido) {
            throw new CuentaMesaPagoServiceError(
              409,
              'Una comanda de la cuenta ya no existe.'
            )
          }

          if (pedido.cuentaMesa?.toString() !== cuenta._id.toString()) {
            throw new CuentaMesaPagoServiceError(
              409,
              `La comanda ${pedido.codigo} no está vinculada a esta cuenta.`
            )
          }

          if (pedido.mesa?.toString() !== cuenta.mesa.toString()) {
            throw new CuentaMesaPagoServiceError(
              409,
              `La comanda ${pedido.codigo} pertenece a otra mesa.`
            )
          }

          if (
  (
    pedido.estado !== ESTADOS_PEDIDO.LISTO &&
    pedido.estado !== ESTADOS_PEDIDO.ENTREGADO
  ) ||
  pedido.recogido !== true
) {
  throw new CuentaMesaPagoServiceError(
    409,
    `La comanda ${pedido.codigo} no está lista y recogida.`
  )
}

          pedidos.push(pedido)
        }

        const pedidosActivos =
          await this.pedidoRepo.buscarPedidosActivosPorMesaParaCuenta(
            cuenta.mesa,
            session
          )

        const idsActivos = new Set(
          pedidosActivos.map((pedido) => pedido._id.toString())
        )

        if (
          idsActivos.size !== idsCuenta.length ||
          idsCuenta.some((id) => !idsActivos.has(id))
        ) {
          throw new CuentaMesaPagoServiceError(
            409,
            'Las comandas de la mesa cambiaron. Actualiza la cuenta antes de cobrar.'
          )
        }

                const subtotal = this.redondear(cuenta.subtotal)
        const propina = this.redondear(
          dto.montoPropina ?? cuenta.montoPropina
        )

        if (
          !Number.isFinite(subtotal) ||
          subtotal <= 0 ||
          !Number.isFinite(propina) ||
          propina < 0
        ) {
          throw new CuentaMesaPagoServiceError(
            400,
            'Los importes de la cuenta no son válidos.'
          )
        }

        const totalPagado = this.redondear(
          subtotal + propina
        )

        if (totalPagado <= 0) {
          throw new CuentaMesaPagoServiceError(
            400,
            'El total de la cuenta debe ser mayor que cero.'
          )
        }

        let montoRecibido: number | undefined
        let cambio: number | undefined

        if (metodoPago === 'Efectivo') {
          montoRecibido = Number(dto.montoRecibido)

          if (
            !Number.isFinite(montoRecibido) ||
            montoRecibido < totalPagado
          ) {
            throw new CuentaMesaPagoServiceError(
              400,
              'El monto recibido debe ser igual o mayor que el total.'
            )
          }

          montoRecibido = this.redondear(montoRecibido)
          cambio = this.redondear(montoRecibido - totalPagado)
        }

        const primerPedido = pedidos[0]

        if (!primerPedido.usuario) {
          throw new CuentaMesaPagoServiceError(
            409,
            'No se encontró el mesero responsable de la cuenta.'
          )
        }

        const fechaPago = obtenerFechaBolivia()
        const codigoPago =
          `PAG-${cuenta.codigoCuenta.replace(/^CTA-/, '')}`

        const nuevoPago = await this.pagoRepo.crear(
          {
            codigoPago,
            codigoPedido: primerPedido.codigo,
            pedido: primerPedido._id,
            cuentaMesa: cuenta._id,
            pedidos: pedidos.map((pedido) => pedido._id),
            mesa: cuenta.mesa,
            mesero: primerPedido.usuario,
            cajero: cajeroId,
            nombreCliente: cliente.clienteNombre,
            ci: cliente.clienteCI,
            nit: cliente.clienteNIT,
            subtotal,
            propina,
            totalFinal: totalPagado,
            metodoPago,
            estadoPago: 'Pagado',
            fechaEnvioCajaBolivia: formatearFechaBolivia(fechaPago),
            fechaEnvioCaja: fechaPago,
            fechaPagoBolivia: formatearFechaBolivia(fechaPago),
            fechaPago
          },
          session
        )

        const cantidadCerrada =
          await this.pedidoRepo.cerrarPedidosDeCuentaMesa(
            cuenta._id,
            session
          )

        if (cantidadCerrada !== pedidos.length) {
          throw new CuentaMesaPagoServiceError(
            409,
            'No se pudieron cerrar todas las comandas. El pago fue revertido.'
          )
        }

        const cuentaPagada = await this.cuentaRepo.actualizarSiPendiente(
          cuenta._id,
          {
            estado: ESTADOS_CUENTA_MESA.PAGADA,
            montoPropina: propina,
            total: totalPagado,
            clienteNombre: cliente.clienteNombre,
            clienteCI: cliente.clienteCI,
            clienteNIT: cliente.clienteNIT,
            metodoPago,
            cajero: cajeroId,
            pago: nuevoPago._id,
            fechaPago
          },
          session
        )

        if (!cuentaPagada) {
          throw new CuentaMesaPagoServiceError(
            409,
            'La cuenta cambió de estado durante el pago.'
          )
        }

        const mesaLiberada = await this.mesaRepo.actualizarEstado(
          cuenta.mesa.toString(),
          ESTADOS_MESA.LIBRE,
          session
        )

        if (!mesaLiberada) {
          throw new CuentaMesaPagoServiceError(
            409,
            'No se pudo liberar la mesa. El pago fue revertido.'
          )
        }
                // Preparar el detalle de todos los pedidos del comprobante.
        // Esta consulta utiliza la misma sesión de la transacción.
        const pedidosComprobante: PedidoComprobantePdf[] = []

        for (const pedidoCobrado of pedidos) {
          const pedidoDetallado =
            await this.pedidoRepo.buscarPorIdPobladoParaComprobante(
              pedidoCobrado._id,
              session
            )

          if (!pedidoDetallado) {
            throw new CuentaMesaPagoServiceError(
              409,
              'No se pudo recuperar un pedido para generar el comprobante.'
            )
          }

          const pedidoPdf = pedidoDetallado as unknown as {
            codigo: string
            fechaHora: Date
            fechaHoraBolivia?: string
            usuario?: unknown
            detalles: Array<{
              nombrePlato?: string
              plato?: Types.ObjectId | { nombre?: string } | null
              cantidad: number
              precioUnitario: number
              subtotal?: number
              observacion?: string
            }>
          }

          const usuario = pedidoPdf.usuario as
            | {
                nombre?: unknown
                apellido?: unknown
                apellidos?: unknown
              }
            | null
            | undefined

          const meseroNombre = usuario
            ? [
                typeof usuario.nombre === 'string'
                  ? usuario.nombre.trim()
                  : '',
                typeof usuario.apellido === 'string'
                  ? usuario.apellido.trim()
                  : typeof usuario.apellidos === 'string'
                    ? usuario.apellidos.trim()
                    : ''
              ]
                .filter(Boolean)
                .join(' ') || 'No identificado'
            : 'No identificado'

          const detalles = pedidoPdf.detalles.map((detalle) => {
            const plato = detalle.plato

            const nombreDesdePlato =
              plato !== null &&
              plato !== undefined &&
              typeof plato === 'object' &&
              'nombre' in plato &&
              typeof plato.nombre === 'string'
                ? plato.nombre.trim()
                : ''

            const nombreGuardado =
              detalle.nombrePlato?.trim() ?? ''

            const nombre =
              nombreGuardado !== '' &&
              nombreGuardado.toLowerCase() !== 'plato'
                ? nombreGuardado
                : nombreDesdePlato || nombreGuardado || 'Producto'

            const cantidad = Number(detalle.cantidad)
            const precioUnitario = Number(detalle.precioUnitario)

            const subtotalDetalle = this.redondear(
              Number(
                detalle.subtotal ??
                  precioUnitario * cantidad
              )
            )

            return {
              nombre,
              cantidad,
              precioUnitario: this.redondear(precioUnitario),
              subtotal: subtotalDetalle,
              observacion:
                detalle.observacion?.trim() ||
                'Sin observaciones'
            }
          })

          pedidosComprobante.push({
            codigo: pedidoPdf.codigo,
            fecha:
              pedidoPdf.fechaHoraBolivia ||
              formatearFechaBolivia(pedidoPdf.fechaHora),
            meseroNombre,
            detalles
          })
        }

        // Buscar el nombre del cajero cuando el pago procede de Caja.
        const cajeroDocumento = cajeroId
          ? await Usuario.findById(cajeroId)
              .select('nombre apellido')
              .session(session)
          : null

        const cajeroNombre = cajeroDocumento
          ? [
              cajeroDocumento.nombre,
              cajeroDocumento.apellido
            ]
              .filter(Boolean)
              .join(' ')
              .trim() || 'No identificado'
          : metodoPago === 'QR'
            ? 'Pago QR público (sin sesión de cajero)'
            : 'No identificado'

        // Generar el PDF antes de finalizar la transacción.
        const pdfBuffer = await generarComprobantePdf({
          codigoCuenta: cuenta.codigoCuenta,
          codigoPago: nuevoPago.codigoPago,
          metodoPago,
          fechaPago: formatearFechaBolivia(fechaPago),

          clienteNombre: cliente.clienteNombre,
          clienteCI: cliente.clienteCI,
          clienteNIT: cliente.clienteNIT,

          cajeroNombre,

          subtotal,
          propina,
          totalPagado,

          montoRecibido,
          cambio,

          pedidos: pedidosComprobante
        })

        const comprobantePdf = {
          nombreArchivo: `comprobante-${nuevoPago.codigoPago}.pdf`,
          tipoContenido: 'application/pdf' as const,
          contenidoBase64: pdfBuffer.toString('base64')
        }

        resultado = {
          cuentaId: cuenta._id.toString(),
          codigoCuenta: cuenta.codigoCuenta,
          pagoId: nuevoPago._id.toString(),
          codigoPago: nuevoPago.codigoPago,
          mesaId: cuenta.mesa.toString(),
          pedidosIds: pedidos.map((pedido) => pedido._id.toString()),
          subtotal,
          propina,
          totalPagado,
          metodoPago,
          estadoPago: 'Pagado',
          fechaPago,
          montoRecibido,
          cambio,
          comprobantePdf
        }
      })

      if (!resultado) {
        throw new CuentaMesaPagoServiceError(
          500,
          'No se obtuvo el resultado del pago.'
        )
      }

      return resultado
    } catch (error: unknown) {
      if (error instanceof CuentaMesaPagoServiceError) {
        throw error
      }

      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new CuentaMesaPagoServiceError(
          409,
          'Ya existe un pago registrado para esta cuenta.'
        )
      }

      throw error
    } finally {
      await session.endSession()
    }
  }
  /**
   * Envía el recibo HTML consolidado de una cuenta ya pagada.
   * Reutiliza EmailJS y la plantilla que se emplea en pagos individuales.
   */
  async enviarReciboCorreoCuenta(
    cuentaId: string,
    email: string
  ): Promise<void> {
    const emailNormalizado = email.trim()

    if (
      emailNormalizado.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)
    ) {
      throw new CuentaMesaPagoServiceError(
        400,
        'Debe proporcionar un correo electrónico válido.'
      )
    }

    if (!Types.ObjectId.isValid(cuentaId)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El identificador de la cuenta no es válido.'
      )
    }

    const cuenta = await this.cuentaRepo.buscarPorIdPoblado(cuentaId)

    if (!cuenta) {
      throw new CuentaMesaPagoServiceError(404, 'Cuenta no encontrada.')
    }

    if (cuenta.estado !== ESTADOS_CUENTA_MESA.PAGADA) {
      throw new CuentaMesaPagoServiceError(
        409,
        'No se puede enviar el recibo: la cuenta todavía no está pagada.'
      )
    }

    const pagoDocumento = await this.pagoRepo.buscarPorCuentaMesa(cuentaId)

    if (!pagoDocumento || pagoDocumento.estadoPago !== 'Pagado') {
      throw new CuentaMesaPagoServiceError(
        409,
        'No existe un pago confirmado para esta cuenta. No se enviará el recibo.'
      )
    }

    interface ReferenciaPoblada {
      _id?: Types.ObjectId | string
      nombre?: string
      apellido?: string
      numero?: string
    }

    interface PagoCorreoAgrupado {
      codigoPago: string
      estadoPago: string
      subtotal: number
      propina: number
      totalFinal: number
      metodoPago: string
      fechaPago?: Date | null
      createdAt?: Date
      nombreCliente?: string
      ci?: string
      nit?: string
      mesa?: Types.ObjectId | ReferenciaPoblada | null
      mesero?: Types.ObjectId | ReferenciaPoblada | null
    }

    interface DetallePedidoCorreo {
      nombrePlato?: string
      cantidad: number
      precioUnitario: number
      subtotal?: number
      plato?: Types.ObjectId | ReferenciaPoblada | null
    }

    interface PedidoCorreoAgrupado {
      codigo?: string
      detalles?: DetallePedidoCorreo[]
    }

    const pago = pagoDocumento as unknown as PagoCorreoAgrupado
    const items: ItemFactura[] = []

    for (const referencia of cuenta.pedidos as unknown[]) {
      let pedidoId = ''

      if (referencia instanceof Types.ObjectId) {
        pedidoId = referencia.toString()
      } else if (typeof referencia === 'string') {
        pedidoId = referencia
      } else if (typeof referencia === 'object' && referencia !== null && '_id' in referencia) {
        const idReferencia = (referencia as { _id?: unknown })._id
        if (idReferencia instanceof Types.ObjectId) {
          pedidoId = idReferencia.toString()
        } else if (typeof idReferencia === 'string') {
          pedidoId = idReferencia
        }
      }

      if (!pedidoId || !Types.ObjectId.isValid(pedidoId)) {
        throw new CuentaMesaPagoServiceError(
          409,
          'No se pudo identificar una comanda de la cuenta para generar el recibo.'
        )
      }

      const pedidoDocumento = await this.pedidoRepo.buscarPorIdPoblado(pedidoId)

      if (!pedidoDocumento) {
        throw new CuentaMesaPagoServiceError(
          409,
          'Una comanda de la cuenta ya no existe. No se puede generar el recibo completo.'
        )
      }

      const pedido = pedidoDocumento as unknown as PedidoCorreoAgrupado
      for (const detalle of pedido.detalles ?? []) {
        const cantidad = Number(detalle.cantidad)
        const precioUnitario = Number(detalle.precioUnitario)

        if (
          !Number.isInteger(cantidad) || cantidad < 1 ||
          !Number.isFinite(precioUnitario) || precioUnitario < 0
        ) {
          throw new CuentaMesaPagoServiceError(
            409,
            'Una comanda contiene cantidades o precios no válidos.'
          )
        }

        const subtotalDetalle = Number(
          Number(detalle.subtotal ?? cantidad * precioUnitario).toFixed(2)
        )
        const plato = detalle.plato
        const platoPoblado = plato && !(plato instanceof Types.ObjectId)
          ? plato
          : null
        const nombre = detalle.nombrePlato?.trim() || platoPoblado?.nombre?.trim() || 'Producto'

        items.push({
          nombre,
          cantidad,
          precioUnitario: Number(precioUnitario.toFixed(2)),
          subtotal: subtotalDetalle
        })
      }
    }

    if (items.length === 0) {
      throw new CuentaMesaPagoServiceError(
        409,
        'No se puede enviar un recibo sin productos.'
      )
    }

    const subtotal = Number(pago.subtotal)
    const propina = Number(pago.propina)
    const totalFinal = Number(pago.totalFinal)
    const subtotalDetalles = Number(
      items.reduce((suma, item) => suma + item.subtotal, 0).toFixed(2)
    )

    if (
      !Number.isFinite(subtotal) || subtotal < 0 ||
      !Number.isFinite(propina) || propina < 0 ||
      !Number.isFinite(totalFinal) || totalFinal <= 0 ||
      Number((subtotal + propina).toFixed(2)) !== Number(totalFinal.toFixed(2)) ||
      subtotalDetalles !== Number(subtotal.toFixed(2))
    ) {
      throw new CuentaMesaPagoServiceError(
        409,
        'Los importes del pago o los productos de la cuenta no son consistentes.'
      )
    }

    const mesaRef = pago.mesa
    const mesaPoblada = mesaRef && !(mesaRef instanceof Types.ObjectId)
      ? mesaRef
      : null
    const cuentaPoblada = cuenta as unknown as { mesa?: Types.ObjectId | ReferenciaPoblada | null }
    const mesaCuenta = cuentaPoblada.mesa
    const mesaCuentaPoblada = mesaCuenta && !(mesaCuenta instanceof Types.ObjectId)
      ? mesaCuenta
      : null
    const mesaNombre = mesaPoblada?.numero || mesaCuentaPoblada?.numero || 'Mesa'

    const meseroRef = pago.mesero
    const meseroPoblado = meseroRef && !(meseroRef instanceof Types.ObjectId)
      ? meseroRef
      : null
    const meseroNombre = `${meseroPoblado?.nombre || ''} ${meseroPoblado?.apellido || ''}`.trim() || 'Mesero'

    const clienteNombre = pago.nombreCliente?.trim() || cuenta.clienteNombre?.trim() || 'Consumidor Final'
    const ci = pago.ci?.trim() || cuenta.clienteCI?.trim() || ''
    const nit = pago.nit?.trim() || cuenta.clienteNIT?.trim() || ''
    const clienteCI = [ci ? `CI: ${ci}` : '', nit ? `NIT: ${nit}` : '']
      .filter(Boolean)
      .join(' / ') || 'S/N'

    const datosFactura: DatosFactura = {
      codigo: cuenta.codigoCuenta,
      mesaNombre,
      meseroNombre,
      clienteNombre,
      clienteCI,
      subtotal,
      propina,
      totalFinal,
      metodoPago: pago.metodoPago,
      fecha: formatearFechaBolivia(pago.fechaPago ?? pago.createdAt ?? new Date()),
      items
    }

    const htmlDelRecibo = generarPlantillaFacturaHTML(datosFactura)
    await enviarCorreo(
      emailNormalizado,
      `Comprobante de pago - ${cuenta.codigoCuenta}`,
      htmlDelRecibo
    )
  }

  /** Envía un recibo de cuenta pagada desde la página pública autenticada por token QR. */
  async enviarReciboCorreoQR(token: string, email: string): Promise<void> {
    const tokenNormalizado = token.trim()
    this.validarTokenQR(tokenNormalizado)

    const cuenta = await this.cuentaRepo.buscarPorTokenQR(tokenNormalizado)
    if (!cuenta) {
      throw new CuentaMesaPagoServiceError(404, 'El QR no existe o no es válido.')
    }

    if (cuenta.estado !== ESTADOS_CUENTA_MESA.PAGADA) {
      throw new CuentaMesaPagoServiceError(
        409,
        'Solo se puede enviar el recibo cuando el pago de la cuenta está confirmado.'
      )
    }

    await this.enviarReciboCorreoCuenta(cuenta._id.toString(), email)
  }

}

export const cuentaMesaPagoService = new CuentaMesaPagoService()
