// src/types/pago.types.ts
import { Types } from 'mongoose'
import type { IPago } from '../models/Pago'
import type { IDetallePedido, IPedido } from '../models/Pedido'


export interface MesaPagoResumen {
  _id: Types.ObjectId
  numero?: string
  estado?: string
  ubicacion?: string
}

export interface UsuarioPagoResumen {
  _id: Types.ObjectId
  nombre?: string
  apellido?: string
  apellidos?: string
}

export interface PedidoPagoResumen {
  _id: Types.ObjectId
  codigo?: string
  total?: number
  estado?: string
}

export type PagoConRelaciones = Omit<
  IPago,
  'mesa' | 'mesero' | 'cajero' | 'pedido'
> & {
  mesa: Types.ObjectId | MesaPagoResumen | null
  mesero: Types.ObjectId | UsuarioPagoResumen
  cajero?: Types.ObjectId | UsuarioPagoResumen | null
  pedido: Types.ObjectId | PedidoPagoResumen
}

export interface PlatoPagoResumen {
  _id: Types.ObjectId
  nombre?: string
  precio?: number
}

export type DetallePedidoPago = Omit<IDetallePedido, 'plato'> & {
  nombre?: string
  plato: Types.ObjectId | PlatoPagoResumen | null
}

export type PedidoPagoConRelaciones = Omit<
  IPedido,
  'mesa' | 'usuario' | 'recogidoPor' | 'detalles'
> & {
  mesa?: Types.ObjectId | MesaPagoResumen | null
  usuario: Types.ObjectId | UsuarioPagoResumen
  recogidoPor?: Types.ObjectId | UsuarioPagoResumen | null
  detalles: DetallePedidoPago[]
  items?: DetallePedidoPago[]
}

export type PedidoActualizadoPago = PedidoPagoConRelaciones

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
  clienteApellido?: string
  clienteCI?: string
  clienteCIComplemento?: string
  clienteExtensionCI?: string
  clienteNIT?: string
}

/**
 * Datos requeridos para la creación de un nuevo documento en la colección 'pagos'
 * Derivados de Pago.create en pago.controller.ts y del modelo Pago.ts
 */
export interface PagoCrearDatos {
  codigoPago: string
  codigoPedido: string
  pedido: Types.ObjectId | string
  mesa: Types.ObjectId | string
  mesero: Types.ObjectId | string
  cajero?: Types.ObjectId | string | null
  nombreCliente?: string
  apellidoCliente?: string
  ci?: string
  extensionCI?: string
  complementoCI?: string
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
  clienteApellido?: string
  clienteCI?: string
  clienteCIComplemento?: string
  clienteExtensionCI?: string
  clienteNIT?: string
  fechaBolivia: string
  fecha: Date
}

/**
 * Resultado completo retornado por el caso de uso procesarPagoFinal
 * Incluye los datos persistidos y los valores necesarios para emitir WebSockets
 */
export interface ResultadoProcesarPago {
  pedidoActualizado: PedidoActualizadoPago
  nuevoPago: IPago
  mesaLiberada?: MesaPagoResumen | null
  nuevoEstadoMesa: string
  statusSocketMesa: string
  comprobante: ComprobantePago
}

/**
 * DTO para la solicitud de envío de recibo detallado por correo electrónico
 */
export interface EnviarReciboCorreoDTO {
  pedidoId: string
  email: string
  clienteNombre?: string
  clienteApellido?: string
  clienteCI?: string
  clienteCIComplemento?: string
  clienteExtensionCI?: string
  clienteNIT?: string
}
