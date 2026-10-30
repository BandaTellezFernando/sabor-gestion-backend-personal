
//src/controllers/cuentaMesaPago.controller.ts
import { ESTADOS_FUSION_MESA } from '../utils/constants'
import { Request, Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import {
  CuentaMesaPagoServiceError,
  cuentaMesaPagoService
} from '../services/cuentaMesaPago.service'
import type {
  DatosTarjetaSimuladaDTO,
  ProcesarPagoCuentaDTO
} from '../types/pago.types'
import type { ResultadoProcesarPagoCuenta } from '../types/pago.types'
import { getIO } from '../socket/socket'
import { mesaService } from '../services/mesa.service'

function esRegistro(
  valor: unknown
): valor is Record<string, unknown> {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor)
  )
}

function obtenerTexto(
  datos: Record<string, unknown>,
  campo: string,
  obligatorio = false
): string | undefined {
  const valor = datos[campo]

  if (valor === undefined || valor === null) {
    if (obligatorio) {
      throw new CuentaMesaPagoServiceError(
        400,
        `El campo ${campo} es obligatorio.`
      )
    }

    return undefined
  }

  if (typeof valor !== 'string') {
    throw new CuentaMesaPagoServiceError(
      400,
      `El campo ${campo} debe ser texto.`
    )
  }

  if (obligatorio && !valor.trim()) {
    throw new CuentaMesaPagoServiceError(
      400,
      `El campo ${campo} es obligatorio.`
    )
  }

  return valor
}

function obtenerNumero(
  datos: Record<string, unknown>,
  campo: string
): number | undefined {
  const valor = datos[campo]

  if (valor === undefined || valor === null) {
    return undefined
  }

  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new CuentaMesaPagoServiceError(
      400,
      `El campo ${campo} debe ser un número válido.`
    )
  }

  return valor
}

function obtenerDatosTarjeta(
  valor: unknown
): DatosTarjetaSimuladaDTO | undefined {
  if (valor === undefined || valor === null) {
    return undefined
  }

  if (!esRegistro(valor)) {
    throw new CuentaMesaPagoServiceError(
      400,
      'Los datos de la tarjeta no tienen un formato válido.'
    )
  }

  return {
    titular: obtenerTexto(valor, 'titular', true) as string,
    numero: obtenerTexto(valor, 'numero', true) as string,
    vencimiento: obtenerTexto(valor, 'vencimiento', true) as string,
    cvv: obtenerTexto(valor, 'cvv', true) as string
  }
}

function obtenerDTO(
  valor: unknown
): ProcesarPagoCuentaDTO {
  if (!esRegistro(valor)) {
    throw new CuentaMesaPagoServiceError(
      400,
      'El cuerpo de la solicitud no es válido.'
    )
  }

  const metodoPago = valor.metodoPago

  if (
    metodoPago !== 'Efectivo' &&
    metodoPago !== 'Tarjeta' &&
    metodoPago !== 'QR'
  ) {
    throw new CuentaMesaPagoServiceError(
      400,
      'Selecciona un método de pago válido.'
    )
  }

    return {
    metodoPago,
    montoPropina: obtenerNumero(valor, 'montoPropina'),
    montoRecibido: obtenerNumero(valor, 'montoRecibido'),
    clienteNombre: obtenerTexto(valor, 'clienteNombre'),
    clienteCI: obtenerTexto(valor, 'clienteCI'),
    clienteNIT: obtenerTexto(valor, 'clienteNIT'),
    qrToken: obtenerTexto(valor, 'qrToken'),
    tarjeta: obtenerDatosTarjeta(valor.tarjeta)
  }
}

async function emitirEventosPago(
  resultado: ResultadoProcesarPagoCuenta
): Promise<void> {
  try {
    const io = getIO()

    const resultadoEvento: Omit<
  ResultadoProcesarPagoCuenta,
  'comprobantePdf'
> = {
  cuentaId: resultado.cuentaId,
  codigoCuenta: resultado.codigoCuenta,
  pagoId: resultado.pagoId,
  codigoPago: resultado.codigoPago,
  mesaId: resultado.mesaId,
  pedidosIds: resultado.pedidosIds,
  subtotal: resultado.subtotal,
  propina: resultado.propina,
  totalPagado: resultado.totalPagado,
  montoRecibido: resultado.montoRecibido,
  cambio: resultado.cambio,
  metodoPago: resultado.metodoPago,
  estadoPago: resultado.estadoPago,
  fechaPago: resultado.fechaPago
}

io.to('room:caja').emit('cuenta:pago_completado', resultadoEvento)

    io.to('room:caja').emit('caja:pago_confirmado', {
      cuentaId: resultado.cuentaId,
      codigoCuenta: resultado.codigoCuenta,
      pedidoId: resultado.pedidosIds[0],
      pedidosIds: resultado.pedidosIds,
      mesaId: resultado.mesaId,
      metodoPago: resultado.metodoPago,
      totalPagado: resultado.totalPagado,
      mensaje: 'Pago de cuenta confirmado',
      fecha: resultado.fechaPago
    })

    io.to('room:mesas').emit('mesas:pago_completado', {
      cuentaId: resultado.cuentaId,
      codigoCuenta: resultado.codigoCuenta,
      mesaId: resultado.mesaId,
      pedidosIds: resultado.pedidosIds,
      mensaje: 'Cuenta pagada correctamente'
    })

       try {
      const mesa = await mesaService.obtenerMesaPorId(
        resultado.mesaId
      )

      const esFusionHistorica =
        mesa.estadoFusion === ESTADOS_FUSION_MESA.DISUELTA ||
        mesa.estadoFusion === ESTADOS_FUSION_MESA.CANCELADA

      if (!esFusionHistorica) {
        // Pago de una mesa individual: se conserva el comportamiento actual.
        io.to('room:mesas').emit('mesas:updated', mesa)
        return
      }

      // La fusión deja de ser operativa, pero el documento
      // permanece en MongoDB como registro histórico.
      io.to('room:mesas').emit('mesas:deleted', {
        id: mesa.id,
        _id: mesa._id,
        mesaId: mesa.id,
        mesa
      })

      // Las mesas originales estaban ocultas durante la fusión.
      // Emitimos "created" para que los clientes las vuelvan a incorporar
      // a su listado operativo.
      const mesasRestauradas = []

      for (const origen of mesa.mesasOrigen) {
        try {
          const original = await mesaService.obtenerMesaPorId(
            origen.mesaId
          )

          io.to('room:mesas').emit('mesas:created', original)
          io.to('room:mesas').emit('mesas:updated', original)

          mesasRestauradas.push(original)
        } catch (error: unknown) {
          console.warn(
            `El pago terminó, pero no se pudo notificar la restauración de la mesa ${origen.numero}:`,
            error
          )
        }
      }

      io.to('room:mesas').emit('mesas:fusion_actualizada', {
        accion: 'disuelta',
        mesa,
        mesas: mesasRestauradas
      })
    } catch (error: unknown) {
      console.warn(
        'El pago se completó, pero falló la notificación de las mesas:',
        error
      )
    }

  } catch (error: unknown) {
    console.warn(
      'El pago se completó, pero falló una notificación Socket.IO:',
      error
    )
  }
}

/**
 * Procesa un pago de Caja mediante efectivo o tarjeta.
 */
export const procesarPagoCuenta = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const usuarioId = req.usuario?.id

    if (!usuarioId) {
      res.status(401).json({
        mensaje: 'Usuario no autenticado.'
      })
      return
    }

    const cuentaId = String(req.params.cuentaId ?? '')
    const datos = obtenerDTO(req.body)

    if (datos.metodoPago === 'QR') {
      res.status(400).json({
        mensaje: 'Los pagos QR deben confirmarse desde el flujo del cliente.'
      })
      return
    }

    const resultado = await cuentaMesaPagoService.procesarPagoCuenta(
      cuentaId,
      {
        ...datos,
        cajeroId: usuarioId
      }
    )

    await emitirEventosPago(resultado)

        const { comprobantePdf, ...pago } = resultado

    res.status(200).json({
      mensaje: 'Pago procesado correctamente.',
      pago,
      comprobantePdf
    })
  } catch (error: unknown) {
    if (error instanceof CuentaMesaPagoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message
      })
      return
    }

    console.error('Error al procesar el pago de la cuenta:', error)

    res.status(500).json({
      mensaje: 'Error interno al procesar el pago.'
    })
  }
}


/**
 * Configura la propina de una cuenta desde Caja antes de generar el QR.
 * Solo Cajeros y Administradores pueden acceder mediante la ruta protegida.
 */
export const configurarPropinaQRCuenta = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    if (!esRegistro(req.body)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El cuerpo de la solicitud no es válido.'
      )
    }

    const montoPropina = obtenerNumero(
      req.body,
      'montoPropina'
    )

    if (montoPropina === undefined) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El campo montoPropina es obligatorio.'
      )
    }

    const resultado =
      await cuentaMesaPagoService.configurarPropinaQR(
        String(req.params.cuentaId ?? ''),
        montoPropina
      )

    res.status(200).json({
      mensaje: 'Propina configurada correctamente. Ya puedes generar el QR.',
      ...resultado
    })
  } catch (error: unknown) {
    if (error instanceof CuentaMesaPagoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message
      })
      return
    }

    console.error(
      'Error al configurar la propina del QR:',
      error
    )

    res.status(500).json({
      mensaje: 'Error interno al configurar la propina del QR.'
    })
  }
}

/**
 * Obtiene los datos necesarios para que Caja genere el QR.
 * Solo pueden solicitarlos Cajeros y Administradores mediante
 * las rutas protegidas.
 */
export const generarQRCuentaMesa = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const datosQR = await cuentaMesaPagoService.obtenerDatosQR(
      String(req.params.cuentaId ?? '')
    )

    res.status(200).json(datosQR)
  } catch (error: unknown) {
    if (error instanceof CuentaMesaPagoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message
      })
      return
    }

    console.error('Error al generar el QR de la cuenta:', error)

    res.status(500).json({
      mensaje: 'Error interno al generar el QR.'
    })
  }
}

/**
 * Consulta pública del estado del QR.
 * No expone CI, datos del cliente ni el token.
 */
export const consultarEstadoQRCuenta = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!esRegistro(req.body)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El cuerpo de la solicitud no es válido.'
      )
    }

    const token = obtenerTexto(req.body, 'token', true) as string

    const estado = await cuentaMesaPagoService.consultarEstadoQR(
      token
    )

        res.status(200).json({
      ...estado,
      mensaje: estado.yaPagada
        ? 'Esta cuenta ya fue pagada.'
        : 'La cuenta está pendiente de pago.'
    })
  } catch (error: unknown) {
    if (error instanceof CuentaMesaPagoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message
      })
      return
    }

    console.error('Error al consultar el estado QR:', error)

    res.status(500).json({
      mensaje: 'Error interno al consultar el QR.'
    })
  }
}

/**
 * Confirma la simulación de pago desde la pantalla pública
 * a la que llega el cliente al escanear el QR.
 */
export const confirmarPagoQRCuenta = async (
  req: Request,
  res: Response
): Promise<void> => {
  let token = ''

  try {
    if (!esRegistro(req.body)) {
      throw new CuentaMesaPagoServiceError(
        400,
        'El cuerpo de la solicitud no es válido.'
      )
    }

    token = obtenerTexto(req.body, 'token', true) as string

    const clienteNombre = obtenerTexto(
      req.body,
      'clienteNombre'
    )
    const clienteCI = obtenerTexto(req.body, 'clienteCI')
    const clienteNIT = obtenerTexto(req.body, 'clienteNIT')

    const resultado = await cuentaMesaPagoService.procesarPagoQR(
      token,
      {
        clienteNombre,
        clienteCI,
        clienteNIT
      }
    )

    await emitirEventosPago(resultado)

        const { comprobantePdf, ...pago } = resultado

    res.status(200).json({
      exito: true,
      yaPagada: true,
      mensaje: 'Pago confirmado correctamente.',
      pago,
      comprobantePdf
    })
  } catch (error: unknown) {
    // Si otra solicitud acaba de completar el pago, no se cobra otra vez:
    // consultamos el estado y mostramos la confirmación existente.
    if (
      error instanceof CuentaMesaPagoServiceError &&
      error.statusCode === 409 &&
      token
    ) {
      try {
        const estado = await cuentaMesaPagoService.consultarEstadoQR(
          token
        )

        if (estado.yaPagada) {
          res.status(200).json({
            exito: true,
            yaPagada: true,
            codigoCuenta: estado.codigoCuenta,
            total: estado.total,
            metodoPago: estado.metodoPago,
            fechaPago: estado.fechaPago,
            mensaje: 'Esta cuenta ya fue pagada.'
          })
          return
        }
      } catch {
        // Se conserva el error original de la operación.
      }
    }

    if (error instanceof CuentaMesaPagoServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message
      })
      return
    }

    console.error('Error al confirmar el pago QR:', error)

    res.status(500).json({
      mensaje: 'Error interno al confirmar el pago QR.'
    })
  }
}


/** Envía por correo el recibo consolidado de una cuenta pagada. */
export const enviarReciboCorreoCuenta = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const cuentaId = String(req.params.cuentaId ?? '')
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim()
      : ''

    if (!email) {
      res.status(400).json({
        mensaje: 'Debe proporcionar un correo electrónico.'
      })
      return
    }

    await cuentaMesaPagoService.enviarReciboCorreoCuenta(cuentaId, email)

    res.status(200).json({
      mensaje: 'Recibo de la cuenta enviado por correo exitosamente.'
    })
  } catch (error: unknown) {
    if (error instanceof CuentaMesaPagoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }

    console.error('Error al enviar recibo de cuenta por correo:', error)
    res.status(500).json({
      mensaje: 'No se pudo enviar el recibo por correo. Comprueba la configuración de EmailJS.'
    })
  }
}


/** Envía por correo el recibo ya pagado desde la página pública del QR. */
export const enviarReciboCorreoQRCuenta = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!esRegistro(req.body)) {
      throw new CuentaMesaPagoServiceError(400, 'El cuerpo de la solicitud no es válido.')
    }

    const token = obtenerTexto(req.body, 'token', true) as string
    const email = obtenerTexto(req.body, 'email', true) as string
    await cuentaMesaPagoService.enviarReciboCorreoQR(token, email)

    res.status(200).json({
      mensaje: 'Recibo de la cuenta enviado por correo exitosamente.'
    })
  } catch (error: unknown) {
    if (error instanceof CuentaMesaPagoServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }

    console.error('Error al enviar recibo QR por correo:', error)
    res.status(500).json({
      mensaje: 'No se pudo enviar el recibo por correo. Comprueba la configuración de EmailJS.'
    })
  }
}
