// src/services/pago.service.ts
import mongoose from 'mongoose'
import { createHash, randomBytes } from 'node:crypto'
import { PagoRepository, pagoRepository } from '../repositories/pago.repo'
import { PedidoRepository, pedidoRepository } from '../repositories/pedido.repo'
import { MesaRepository, mesaRepository } from '../repositories/mesa.repo'
import {
  QrPagoTokenRepository,
  qrPagoTokenRepository
} from '../repositories/qrPagoToken.repo'
import {
  ESTADOS_CUENTA,
  ESTADOS_TANDA_COCINA,
  METODOS_PAGO
} from '../utils/constants'
import { enviarCorreo } from './email.service'
import {
  generarPlantillaReciboHTML,
  DatosRecibo,
  ItemRecibo
} from '../utils/reciboTemplate'
import {
  obtenerFechaBolivia,
  formatearFechaBolivia,
  obtenerFechaISO_Bolivia,
  obtenerRangoInclusivoBolivia
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
    private mesaRepo: MesaRepository = mesaRepository,
    private qrTokenRepo: QrPagoTokenRepository = qrPagoTokenRepository
  ) {}

  /**
   * Consulta el historial de pagos, con filtros opcionales y paginación.
   * Por defecto, el límite superior es el día actual de Bolivia.
   * El período del historial se aplica sobre createdAt para incluir
   * documentos de cualquier estado, incluso si no tienen fechaPago.
   */
  async listarPagos(params: {
    desde?: string
    hasta?: string
    estadoPago?: string
    metodoPago?: string
    pagina?: string
    limite?: string
  }): Promise<{
    sinDatos: boolean
    advertencia: string | null
    datos: any[]
    paginacion: {
      pagina: number
      limite: number
      total: number
      totalPaginas: number
    }
  }> {
    const parseEnteroPositivo = (
      valor: string | undefined,
      predeterminado: number,
      nombre: string
    ): number => {
      if (valor === undefined || valor.trim() === '') {
        return predeterminado
      }

      const numero = Number(valor)
      if (!Number.isInteger(numero) || numero < 1) {
        throw new PagoServiceError(
          400,
          `${nombre} debe ser un número entero mayor que cero.`
        )
      }
      return numero
    }

    const pagina = parseEnteroPositivo(params.pagina, 1, 'La página')
    const limite = parseEnteroPositivo(params.limite, 20, 'El límite')

    if (limite > 100) {
      throw new PagoServiceError(
        400,
        'El límite por página no puede superar 100.'
      )
    }

    const hasta = params.hasta?.trim() || obtenerFechaISO_Bolivia()
    const desde = params.desde?.trim() || undefined

    let rangoHasta: { desde: Date; hastaExclusivo: Date }
    let rangoCompleto: { desde: Date; hastaExclusivo: Date } | undefined

    try {
      rangoHasta = obtenerRangoInclusivoBolivia(hasta, hasta)
      if (desde) {
        rangoCompleto = obtenerRangoInclusivoBolivia(desde, hasta)
      }
    } catch (error) {
      throw new PagoServiceError(
        400,
        error instanceof Error
          ? error.message
          : 'El intervalo de fechas no es válido.'
      )
    }

    const filtros: Record<string, any> = {
      createdAt: {
        $lt: rangoHasta.hastaExclusivo
      }
    }

    if (desde && rangoCompleto) {
      filtros.createdAt.$gte = rangoCompleto.desde
    }

    const estadosPermitidos = [
      'Pendiente',
      'Procesado',
      'Pagado',
      'Anulado'
    ]

    const estadoPago = params.estadoPago?.trim()
    if (estadoPago) {
      if (!estadosPermitidos.includes(estadoPago)) {
        throw new PagoServiceError(400, 'El estado de pago no es válido.')
      }
      filtros.estadoPago = estadoPago
    }

    const metodoPago = params.metodoPago?.trim()
    if (metodoPago) {
      if (!(METODOS_PAGO as readonly string[]).includes(metodoPago)) {
        throw new PagoServiceError(400, 'El método de pago no es válido.')
      }
      filtros.metodoPago = metodoPago
    }

    const { datos, total } = await this.pagoRepo.listarPaginado(
      filtros,
      pagina,
      limite
    )

    return {
      sinDatos: total === 0,
      advertencia:
        total === 0
          ? 'No se encontraron pagos para los filtros seleccionados.'
          : null,
      datos,
      paginacion: {
        pagina,
        limite,
        total,
        totalPaginas: Math.ceil(total / limite)
      }
    }
  }

  /**
   * Recupera un pago por su ID con datos relacionados.
   */
  async obtenerDetallePago(id: string): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new PagoServiceError(400, 'El identificador del pago no es válido.')
    }

    const pago = await this.pagoRepo.buscarPorId(id)
    if (!pago) {
      throw new PagoServiceError(404, 'No se encontró el pago solicitado.')
    }

    return pago
  }

  /**
   * Genera el código QR estático con el identificador del pedido y su monto total,
   * guardando la URL generada en el pedido.
   */
  /**
   * Las cuentas con tandas deben haberse solicitado y no tener tandas
   * pendientes de preparación o entrega para entrar al flujo de cobro.
   * Los pedidos históricos sin tandas mantienen el comportamiento anterior.
   */
  private validarCuentaModernaListaParaCobro(pedido: any): void {
    if (!Array.isArray(pedido?.tandas) || pedido.tandas.length === 0) {
      return
    }

    if (pedido.estadoCuenta !== ESTADOS_CUENTA.CUENTA_SOLICITADA) {
      throw new PagoServiceError(
        409,
        'El mesero debe solicitar la cuenta antes de iniciar el cobro.'
      )
    }

    const tandasPendientes = pedido.tandas.filter(
      (tanda: any) =>
        tanda.estado !== ESTADOS_TANDA_COCINA.ENTREGADA &&
        tanda.estado !== ESTADOS_TANDA_COCINA.CANCELADA
    )

    if (tandasPendientes.length > 0) {
      throw new PagoServiceError(
        409,
        'No se puede cobrar porque todavía hay tandas sin entregar o cancelar.'
      )
    }
  }

  private validarDatosClientePago(
    metodoPago: string,
    datos: Pick<
      ProcesarPagoDTO,
      'clienteNombre' | 'clienteApellido' | 'clienteCI' | 'clienteExtensionCI' | 'clienteNIT'
    >
  ): {
    clienteNombre: string
    clienteApellido: string
    clienteCI: string
    clienteExtensionCI: string
    clienteNIT: string
  } {
    const normalizarTexto = (valor: unknown, campo: string): string => {
      if (valor === undefined || valor === null) return ''
      if (typeof valor !== 'string') {
        throw new PagoServiceError(400, `${campo} debe ser texto.`)
      }
      return valor.trim().replace(/\s+/g, ' ').normalize('NFC')
    }

    const clienteNombre = normalizarTexto(datos.clienteNombre, 'Los nombres')
    const clienteApellido = normalizarTexto(datos.clienteApellido, 'Los apellidos')
    const clienteCI = normalizarTexto(datos.clienteCI, 'La CI')
    const clienteExtensionCI = normalizarTexto(
      datos.clienteExtensionCI,
      'La extensión de CI'
    ).toUpperCase()
    const clienteNIT = normalizarTexto(datos.clienteNIT, 'El NIT')

    const requiereDatos = ['tarjeta', 'qr'].includes(metodoPago.toLowerCase())
    const validarNombre = (valor: string, campo: string): void => {
      if (!valor && !requiereDatos) return

      const longitud = Array.from(valor).length
      const patron = /^[\p{L}\p{M}]+(?:[ '-][\p{L}\p{M}]+)*$/u

      if (longitud < 2 || longitud > 80 || !patron.test(valor)) {
        throw new PagoServiceError(
          400,
          `${campo} debe tener entre 2 y 80 caracteres y solo admitir letras, espacios, guiones o apóstrofos.`
        )
      }
    }

    validarNombre(clienteNombre, 'Los nombres')
    validarNombre(clienteApellido, 'Los apellidos')

    const patronDocumento = /^\d{5,12}$/

    if (clienteCI && !patronDocumento.test(clienteCI)) {
      throw new PagoServiceError(
        400,
        'La CI debe contener entre 5 y 12 dígitos numéricos.'
      )
    }

    if (clienteNIT && !patronDocumento.test(clienteNIT)) {
      throw new PagoServiceError(
        400,
        'El NIT debe contener entre 5 y 12 dígitos numéricos.'
      )
    }

    if (clienteExtensionCI && !clienteCI) {
      throw new PagoServiceError(
        400,
        'La extensión solo puede proporcionarse cuando se registra una CI.'
      )
    }

    if (clienteExtensionCI && !/^[A-Z]{2,4}$/.test(clienteExtensionCI)) {
      throw new PagoServiceError(
        400,
        'La extensión de CI debe ser un código de 2 a 4 letras.'
      )
    }

    if (requiereDatos) {
      if (!clienteNombre || !clienteApellido) {
        throw new PagoServiceError(
          400,
          'Para pagar con tarjeta o QR debe registrar nombres y apellidos.'
        )
      }

      if (!clienteCI && !clienteNIT) {
        throw new PagoServiceError(
          400,
          'Para pagar con tarjeta o QR debe registrar CI o NIT.'
        )
      }
    }

    return {
      clienteNombre,
      clienteApellido,
      clienteCI,
      clienteExtensionCI,
      clienteNIT
    }
  }

  async generarPagoQR(
    pedidoId: string,
    cajeroId?: string
  ): Promise<{ urlConfirmacion: string; total: number }> {
    const pedido = await this.pedidoRepo.buscarPorId(pedidoId)

    if (!pedido) {
      throw new PagoServiceError(404, 'Pedido no encontrado')
    }

    if (pedido.estado === 'CERRADO' || pedido.estado === 'CANCELADO') {
      throw new PagoServiceError(
        409,
        'No se puede generar un QR para un pedido cerrado o cancelado.'
      )
    }

    this.validarCuentaModernaListaParaCobro(pedido)

    const pagoExistente = await this.pagoRepo.buscarPorPedidoId(pedido._id)

    if (pagoExistente) {
      throw new PagoServiceError(
        409,
        'Ya existe un registro de pago para este pedido.'
      )
    }

    const total = Number(pedido.total)

    if (!Number.isFinite(total) || total <= 0) {
      throw new PagoServiceError(400, 'El pedido no tiene un total válido para cobrar.')
    }

    const baseUrl = process.env.QR_CONFIRMATION_BASE_URL
      ?.trim()
      .replace(/\/+$/, '')

    if (!baseUrl) {
      throw new PagoServiceError(
        500,
        'Falta configurar QR_CONFIRMATION_BASE_URL en el backend.'
      )
    }

    let urlBaseValidada: URL

    try {
      urlBaseValidada = new URL(baseUrl)
    } catch {
      throw new PagoServiceError(
        500,
        'QR_CONFIRMATION_BASE_URL debe ser una URL válida.'
      )
    }

    if (
      urlBaseValidada.protocol !== 'http:' &&
      urlBaseValidada.protocol !== 'https:'
    ) {
      throw new PagoServiceError(
        500,
        'QR_CONFIRMATION_BASE_URL debe utilizar HTTP o HTTPS.'
      )
    }

    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const expiraEn = new Date(Date.now() + 10 * 60 * 1000)

    const urlConfirmacion = new URL(
      `/confirmar-pago-qr/${token}`,
      urlBaseValidada
    ).toString()



    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const tokenCreado = await this.qrTokenRepo.crearOActualizarParaPedido(
        pedido._id,
        tokenHash,
        expiraEn,
        session,
        cajeroId || pedido.cajeroAsignado || null
      )

      if (!tokenCreado) {
        throw new PagoServiceError(500, 'No se pudo registrar el token del QR.')
      }


      await session.commitTransaction()
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      session.endSession()
    }

    return {
      urlConfirmacion,
      total
    }
  }

  private obtenerHashTokenQR(token: string): string {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new PagoServiceError(400, 'El token del QR no tiene un formato válido.')
    }

    return createHash('sha256').update(token).digest('hex')
  }

  /**
   * Consulta el estado del QR sin consumir el token.
   * La lectura del QR no equivale a confirmar un pago.
   */
  async consultarEstadoPagoQR(token: string): Promise<{
    estado: 'DISPONIBLE' | 'UTILIZADO' | 'EXPIRADO' | 'NO_DISPONIBLE'
    codigoPedido?: string
    total?: number
    expiraEn?: Date
  }> {
    const tokenHash = this.obtenerHashTokenQR(token)
    const registro = await this.qrTokenRepo.buscarPorHash(tokenHash)

    if (!registro) {
      throw new PagoServiceError(404, 'El QR no es válido o fue reemplazado.')
    }

    if (registro.consumidoEn) {
      return { estado: 'UTILIZADO' }
    }

    if (registro.expiraEn.getTime() <= Date.now()) {
      return { estado: 'EXPIRADO' }
    }

    const pedido = await this.pedidoRepo.buscarPorId(String(registro.pedido))

    if (
      !pedido ||
      pedido.estado === 'CERRADO' ||
      pedido.estado === 'CANCELADO'
    ) {
      return { estado: 'NO_DISPONIBLE' }
    }

    const pagoExistente = await this.pagoRepo.buscarPorPedidoId(pedido._id)

    if (pagoExistente) {
      return { estado: 'NO_DISPONIBLE' }
    }

    return {
      estado: 'DISPONIBLE',
      codigoPedido: pedido.codigo,
      total: Number(pedido.total),
      expiraEn: registro.expiraEn
    }
  }

  /**
   * Confirma un pago QR simulado.
   * El token se consume dentro de la transacción que registra el pago.
   */
  async confirmarPagoQR(
    token: string,
    datosCliente: Pick<
      ProcesarPagoDTO,
      'clienteNombre' | 'clienteApellido' | 'clienteCI' | 'clienteExtensionCI' | 'clienteNIT'
    > = {}
  ): Promise<ResultadoProcesarPago> {
    const tokenHash = this.obtenerHashTokenQR(token)
    const registro = await this.qrTokenRepo.buscarPorHash(tokenHash)

    if (!registro) {
      throw new PagoServiceError(404, 'El QR no es válido o fue reemplazado.')
    }

    if (registro.consumidoEn) {
      throw new PagoServiceError(409, 'Este QR ya fue utilizado.')
    }

    if (registro.expiraEn.getTime() <= Date.now()) {
      throw new PagoServiceError(410, 'Este QR ha expirado.')
    }

    return this.procesarPagoFinal(
      {
        ...datosCliente,
        pedidoId: String(registro.pedido),
        metodoPago: 'QR',
        cajeroId: registro.cajeroId
          ? String(registro.cajeroId)
          : undefined
      },
      { qrTokenHash: tokenHash }
    )
  }

  /**
   * Caso de uso principal: Procesa el pago final de un pedido, ejecuta la transacción atómica
   * en MongoDB (Pedido CERRADO + creación de Pago + actualización de Mesa) y calcula el comprobante.
   */
  async procesarPagoFinal(
    dto: ProcesarPagoDTO,
    opciones: { qrTokenHash?: string } = {}
  ): Promise<ResultadoProcesarPago> {
    const {
      pedidoId,
      metodoPago,
      porcentajePropina = 0,
      montoPropina: bodyMontoPropina,
      cajeroAsignado: bodyCajeroAsignado,
      cajeroId: authCajeroId,
      clienteNombre,
      clienteApellido,
      clienteCI,
      clienteExtensionCI,
      clienteNIT
    } = dto

    // ─── 1. VALIDACIONES PREVIAS (Fuera de la transacción) ──────────────────────
    const pedido = await this.pedidoRepo.buscarPorIdPobladoCaja(pedidoId)

    if (!pedido) {
      throw new PagoServiceError(404, 'Pedido no encontrado')
    }

    this.validarCuentaModernaListaParaCobro(pedido)

    if (pedido.estado === 'CERRADO') {
      throw new PagoServiceError(400, 'Este pedido ya ha sido pagado y cerrado.')
    }

    // Regla flexibilizada: Solo se bloquea si está cancelado. ABIERTO, EN_PREPARACION y ENTREGADO sí pueden cobrarse.
    if (pedido.estado === 'CANCELADO') {
      throw new PagoServiceError(400, 'No se puede cobrar un pedido cancelado.')
    }

    const metodoPagoNormalizado = String(metodoPago ?? '').trim()
    const metodoPagoValido = METODOS_PAGO.find(
      (metodo) => metodo.toLowerCase() === metodoPagoNormalizado.toLowerCase()
    )

    if (!metodoPagoValido) {
      throw new PagoServiceError(
        400,
        'Debe seleccionar un método de pago válido.'
      )
    }

    if (metodoPagoValido === 'QR' && !opciones.qrTokenHash) {
      throw new PagoServiceError(
        409,
        'Los pagos QR deben confirmarse mediante su QR móvil válido.'
      )
    }

    if (opciones.qrTokenHash && metodoPagoValido !== 'QR') {
      throw new PagoServiceError(400, 'El token proporcionado no corresponde a este método de pago.')
    }

    // Se valida antes de iniciar la transacción para no consumir un QR
    // cuando los datos del cliente son inválidos.
    const datosCliente = this.validarDatosClientePago(metodoPagoValido, {
      clienteNombre,
      clienteApellido,
      clienteCI,
      clienteExtensionCI,
      clienteNIT
    })

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

    const porcentajePropinaValido = Number(porcentajePropina)

    if (
      !Number.isFinite(porcentajePropinaValido) ||
      porcentajePropinaValido < 0
    ) {
      throw new PagoServiceError(
        400,
        'El porcentaje de propina debe ser un número válido y no negativo.'
      )
    }

    const propinaCalculada =
      bodyMontoPropina !== undefined && bodyMontoPropina !== null
        ? Number(bodyMontoPropina)
        : porcentajePropinaValido > 0
          ? subtotal * (porcentajePropinaValido / 100)
          : Number(ped.montoPropina || 0)

    if (!Number.isFinite(propinaCalculada) || propinaCalculada < 0) {
      throw new PagoServiceError(
        400,
        'El monto de propina debe ser un número válido y no negativo.'
      )
    }

    const montoPropina = Number(propinaCalculada.toFixed(2))
    const totalFinal = Number((subtotal + montoPropina).toFixed(2))
    const cajeroId = authCajeroId || bodyCajeroAsignado || ped.cajeroAsignado || null

    // ─── 3. TRANSACCIÓN ATÓMICA MONGODB (Exclusiva de PagoService) ───────────────
    const session = await mongoose.startSession()
    session.startTransaction()

    let nuevoEstadoMesa = 'Libre'
    let nuevoPago: any = null
    let mesaLiberada: any = null

    try {
      // El token se consume dentro de esta misma transacción.
      // Si falla el registro del pago, el consumo también se revierte.
      if (opciones.qrTokenHash) {
        const tokenConsumido = await this.qrTokenRepo.consumirSiValido(
          opciones.qrTokenHash,
          session
        )

        if (!tokenConsumido) {
          throw new PagoServiceError(
            409,
            'El QR expiró, ya fue utilizado o fue reemplazado.'
          )
        }

        if (String(tokenConsumido.pedido) !== String(pedido._id)) {
          throw new PagoServiceError(
            409,
            'El QR no corresponde al pedido que se intenta cobrar.'
          )
        }
      }

      // 3.1 Actualizar Pedido
      pedido.estado = 'CERRADO'

      if (Array.isArray(ped.tandas) && ped.tandas.length > 0) {
        pedido.estadoCuenta = ESTADOS_CUENTA.CERRADA
      }

      pedido.total = totalFinal
      ped.metodoPago = metodoPagoValido
      ped.montoPropina = montoPropina
      ped.subtotalCierre = subtotal
      if (datosCliente.clienteNombre) ped.clienteNombre = datosCliente.clienteNombre
      if (datosCliente.clienteApellido) ped.clienteApellido = datosCliente.clienteApellido
      if (datosCliente.clienteCI) ped.clienteCI = datosCliente.clienteCI
      if (datosCliente.clienteExtensionCI) {
        ped.clienteExtensionCI = datosCliente.clienteExtensionCI
      }
      if (datosCliente.clienteNIT) ped.clienteNIT = datosCliente.clienteNIT
      if (cajeroId) {
        ped.cajeroAsignado = cajeroId
      }

      await this.pedidoRepo.guardar(pedido, session)

      // Los objetos Date guardan instantes reales; la zona horaria
      // de Bolivia se aplica al formatear la fecha para mostrarla.
      const fechaEnvioCaja = new Date()
      const fechaPago = new Date()

      // 3.2 Crear Pago mediante PagoRepository
      nuevoPago = await this.pagoRepo.crear(
        {
          codigoPago: `PAG-${String(pedido._id).toUpperCase()}`,
          codigoPedido: pedido.codigo,
          pedido: pedido._id,
          mesa: (pedido.mesa as any)?._id || pedido.mesa,
          mesero: (pedido.usuario as any)?._id || pedido.usuario,
          cajero: cajeroId,
          nombreCliente: ped.clienteNombre || 'Consumidor Final',
          apellidoCliente: ped.clienteApellido || '',
          ci: ped.clienteCI || '',
          extensionCI: ped.clienteExtensionCI || '',
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
      montoPropina,
      propinaAplicada: montoPropina,
      total: totalFinal,
      totalPagado: totalFinal,
      metodoPago: ped.metodoPago,
      cajeroAsignado: ped.cajeroAsignado,
      clienteNombre: ped.clienteNombre || 'Consumidor Final',
      clienteApellido: ped.clienteApellido || '',
      clienteCI: ped.clienteCI || '',
      clienteExtensionCI: ped.clienteExtensionCI || '',
      clienteNIT: ped.clienteNIT || '',
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
    const propina = Number(ped.montoPropina || 0)
    const totalFinal = Number((subtotal + propina).toFixed(2))

    const mesaNombre = mesaDoc?.numero || (ped.mesa as any)?.numero || 'Barra'
    const meseroNombre = ped.usuario
      ? `${(ped.usuario as any).nombre || ''} ${(ped.usuario as any).apellido || ''}`.trim()
      : 'Mesero'
    const fecha = new Date().toLocaleString('es-BO')

    const finalClienteNombre = clienteNombre || ped.clienteNombre || 'Consumidor Final'
    const finalClienteApellido = ped.clienteApellido || ''
    const finalClienteCI = clienteCI || ped.clienteCI || ''
    const finalClienteExtensionCI = ped.clienteExtensionCI || ''
    const finalClienteNIT = ped.clienteNIT || 'S/N'

    const items: ItemRecibo[] = (ped.detalles || ped.items || []).map((item: any) => {
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

    const datosRecibo: DatosRecibo = {
      codigo,
      mesaNombre,
      meseroNombre,
      clienteNombre: finalClienteNombre,
      clienteApellido: finalClienteApellido,
      clienteCI: finalClienteCI,
      clienteExtensionCI: finalClienteExtensionCI,
      clienteNIT: finalClienteNIT,
      subtotal,
      propina,
      totalFinal,
      metodoPago: ped.metodoPago || 'Efectivo',
      fecha,
      items
    }

    const htmlDelRecibo = generarPlantillaReciboHTML(datosRecibo)
    await enviarCorreo(email, 'Comprobante de Pago - ' + codigo, htmlDelRecibo)
  }
}

export const pagoService = new PagoService()
