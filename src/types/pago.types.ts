// src/types/pago.types.ts
import { Types } from 'mongoose'
import { DatosFactura, ItemFactura } from '../utils/facturaTemplate'

export { DatosFactura, ItemFactura }

/**
 * Parámetros de entrada para el procesamiento del pago final
 * Derivados de req.body y req.usuario en pago.controller.ts
 */
export interface ProcesarPagoDTO {
  pedidoId: string
  metodoPago?: string
  porcentajePropina?: number
  montoPropina?: number
  /**
   * @deprecated Ignorado por el backend. Por autoridad financiera, el subtotal
   * oficial se deriva exclusivamente de los detalles del pedido persistido.
   */
  subtotalCierre?: number
  cajeroAsignado?: string | Types.ObjectId | null
  cajeroId?: string | Types.ObjectId | null
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
}

/**
 * Datos de tarjeta usados únicamente para la simulación.
 * El número y el CVV no se deben persistir en MongoDB.
 */
export interface DatosTarjetaSimuladaDTO {
  titular: string
  numero: string
  vencimiento: string
  cvv: string
}

/**
 * Datos para procesar el pago completo de una CuentaMesa.
 */
export interface ProcesarPagoCuentaDTO {
  metodoPago: 'Efectivo' | 'Tarjeta' | 'QR'

  montoPropina?: number
    montoRecibido?: number

  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string

  cajeroId?: string

  // Credencial necesaria para simular un pago QR.
  qrToken?: string

  // Obligatorio cuando el método es Tarjeta.
  tarjeta?: DatosTarjetaSimuladaDTO
}

/**
 * Resultado del procesamiento de una cuenta agrupada.
 */
export interface ResultadoProcesarPagoCuenta {
  cuentaId: string
  codigoCuenta: string

  pagoId: string
  codigoPago: string

  mesaId: string
  pedidosIds: string[]

  subtotal: number
  propina: number
  totalPagado: number
  montoRecibido?: number
  cambio?: number

  metodoPago: 'Efectivo' | 'Tarjeta' | 'QR'
  estadoPago: 'Pagado'
  fechaPago: Date

  comprobantePdf: {
    nombreArchivo: string
    tipoContenido: 'application/pdf'
    contenidoBase64: string
  }
}

/**
 * Datos requeridos para la creación de un nuevo documento en la colección 'pagos'
 * Derivados de Pago.create en pago.controller.ts y del modelo Pago.ts
 */
export interface PagoCrearDatos {
  codigoPago: string
  codigoPedido: string
  pedido: Types.ObjectId | string
    cuentaMesa?: Types.ObjectId | string
  pedidos?: Array<Types.ObjectId | string>
  mesa: Types.ObjectId | string
  mesero: Types.ObjectId | string
  cajero?: Types.ObjectId | string | null
  nombreCliente?: string
  ci?: string
  nit?: string
  subtotal: number
  propina: number
  totalFinal: number
  metodoPago?: string
  estadoPago: string
  fechaEnvioCajaBolivia?: string
  fechaEnvioCaja: Date
  fechaPagoBolivia?: string
  fechaPago?: Date
  observaciones?: string
}

/**
 * Estructura exacta del comprobante generado tras el pago
 * Consumido por el modal de cobro y cierre de caja en el frontend
 */
export interface ComprobantePago {
  pedidoId: Types.ObjectId | string
  meseroNombre: string
    subtotal: number
  montoPropina: number
  propinaAplicada: number
  total: number
  totalPagado: number
  metodoPago: string
  cajeroAsignado?: Types.ObjectId | string | null
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  fechaBolivia: string
  fecha: Date
}

/**
 * Resultado completo retornado por el caso de uso procesarPagoFinal
 * Incluye los datos persistidos y los valores necesarios para emitir WebSockets
 */
export interface ResultadoProcesarPago {
  pedidoActualizado: any
  nuevoPago: any
  mesaLiberada?: any
  nuevoEstadoMesa: string
  statusSocketMesa: string
  comprobante: ComprobantePago

  comprobantePdf: {
    nombreArchivo: string
    tipoContenido: 'application/pdf'
    contenidoBase64: string
  }
}

/**
 * DTO para la solicitud de envío de recibo detallado por correo electrónico
 */
export interface EnviarReciboCorreoDTO {
  pedidoId: string
  email: string
  clienteNombre?: string
  clienteCI?: string
}
