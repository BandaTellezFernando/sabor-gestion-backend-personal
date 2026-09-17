// src/controllers/pago.controller.ts
import { Request, Response } from 'express'
import mongoose from 'mongoose'
import Pedido from '../models/Pedido'
import Mesa from '../models/Mesa'
import { getIO } from '../socket/socket'
import nodemailer from 'nodemailer'
import Reserva from '../models/Reserva'
import Pago from '../models/Pago'
import { obtenerFechaBolivia, formatearFechaBolivia } from '../utils/fechaBolivia'
import { enviarCorreo } from '../services/email.service'
import { CustomRequest } from '../middlewares/auth.middleware'
// 1. Generador de QR (Se mantiene para cuando eligen método QR estático)
export const generarPagoQR = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pedidoId } = req.params
    const pedido = await Pedido.findById(pedidoId)

    if (!pedido) {
      res.status(404).json({ mensaje: 'Pedido no encontrado' })
      return
    }

    const datosPago = `SABOR_GESTION_ID_${pedido._id}_TOTAL_${pedido.total}`
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${datosPago}`

    pedido.qrUrl = qrUrl
    await pedido.save()

    res.json({ qrUrl, total: pedido.total })
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al generar QR' })
  }
}

// 2. Procesamiento de Pago Final (Conectado a tu Modal)
export const procesarPagoFinal = async (req: CustomRequest, res: Response): Promise<void> => {
  const { pedidoId } = req.params
  const {
    metodoPago,
    porcentajeDescuento = 0,
    porcentajePropina = 0,
    montoDescuento: bodyMontoDescuento,
    montoPropina: bodyMontoPropina,
    subtotalCierre: bodySubtotalCierre,
    cajeroAsignado: bodyCajeroAsignado
  } = req.body

  // --- Validaciones previas (sin sesión, para responder rápido al cliente) ---
  // Hacemos populate del usuario (Mesero) para saber quién tomó la orden
  const pedido = await Pedido.findById(pedidoId).populate('usuario', 'nombre apellido')

  if (!pedido) {
    res.status(404).json({ mensaje: 'Pedido no encontrado' })
    return
  }

  if (pedido.estado === 'CERRADO') {
    res.status(400).json({ mensaje: 'Este pedido ya ha sido pagado y cerrado.' })
    return
  }

  // RESTRICCIÓN FLEXIBILIZADA: Evitamos que el cajero se quede bloqueado si el chef olvidó marcar "Listo"
  // Solo evitamos cobrar pedidos que ya estén Cancelados.
  if (pedido.estado === 'CANCELADO') {
    res.status(400).json({ mensaje: 'No se puede cobrar un pedido cancelado.' })
    return
  }

  const metodoPagoNormalizado = String(metodoPago || '').trim()
  const metodosValidos = ['Efectivo', 'Tarjeta', 'QR']
  const metodoPagoValido =
    metodosValidos.find((m) => m.toLowerCase() === metodoPagoNormalizado.toLowerCase()) ||
    'Efectivo'

  // --- Cálculos (sin BD, seguros fuera de la transacción) ---
  const ped: any = pedido
  const subtotal = Number(bodySubtotalCierre || ped.subtotalCierre || pedido.total || 0)

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
  const cajeroId = (req as any).usuario?.id || bodyCajeroAsignado || ped.cajeroAsignado || null

  // --- TRANSACCIÓN MONGODB: todas las escrituras son atómicas ---
  const session = await mongoose.startSession()
  session.startTransaction()

  let nuevoEstado = 'Libre'

  try {
    pedido.estado = 'CERRADO'
    pedido.total = totalFinal
    ped.metodoPago = metodoPagoValido
    ped.montoDescuento = montoDescuento
    ped.montoPropina = montoPropina
    ped.subtotalCierre = subtotal
    ped.pagoConfirmado = true
    if (cajeroId) {
      ped.cajeroAsignado = cajeroId
    }

    await pedido.save({ session })

    const fechaEnvioCaja = obtenerFechaBolivia()
    const fechaPago = obtenerFechaBolivia()

    // 1. SINCRONIZACIÓN OFICIAL EN LA COLECCIÓN "PAGOS"
    const [nuevoPago] = await Pago.create(
      [
        {
          codigoPago: `PAG-${String(pedido._id).slice(-6).toUpperCase()}`,
          pedido: pedido._id,
          mesa: pedido.mesa,
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
        }
      ],
      { session }
    )

    if (pedido.mesa) {
      const inicioHoy = new Date()
      inicioHoy.setHours(0, 0, 0, 0)
      const reservasPendientes = await Reserva.countDocuments({
        mesa: pedido.mesa,
        fecha: { $gte: inicioHoy }
      }).session(session)
      nuevoEstado = reservasPendientes > 0 ? 'Reservada' : 'Libre'
      await Mesa.findByIdAndUpdate(pedido.mesa, { estado: nuevoEstado }, { session })
    }

    await session.commitTransaction()
  } catch (error) {
    await session.abortTransaction()
    const err = error as Error
    console.error('Error en la transacción de pago:', err)
    res.status(500).json({ mensaje: 'Error al procesar el pago', error: err.message })
    return
  } finally {
    session.endSession()
  }
  // --- FIN TRANSACCIÓN ---

  // Eventos WebSocket (fuera de la transacción — no son operaciones de BD críticas)
  try {
    const io = getIO()
    io.emit('cocina:actualizar_tablero', pedido)

    if (pedido.mesa) {
      const mesaLiberada = await Mesa.findById(pedido.mesa)
      io.emit('mesas:updated', {
        id: pedido.mesa.toString(),
        status: nuevoEstado === 'Libre' ? 'Disponible' : 'Reservada',
        name: mesaLiberada?.numero || 'Mesa'
      })
      io.emit('mesas:pago_completado', {
        mesaId: pedido.mesa.toString(),
        mesaNombre: mesaLiberada?.numero || 'Mesa',
        pedidoId: pedido._id.toString(),
        mensaje: 'Pago procesado exitosamente'
      })
    }
  } catch (socketError) {
    console.warn('Pago guardado, pero falló la emisión del WebSocket:', socketError)
  }

  // Extraemos el nombre real del mesero
  const meseroNombre = pedido.usuario
    ? `${(ped.usuario as any).nombre || ''} ${(ped.usuario as any).apellido || ''}`.trim()
    : 'Sin mesero'

  const fechaComprobante = obtenerFechaBolivia()

  res.status(200).json({
    mensaje: 'Pago procesado exitosamente',
    comprobante: {
      pedidoId: pedido._id,
      meseroNombre: meseroNombre,
      subtotal: subtotal,
      montoDescuento: montoDescuento,
      montoPropina: montoPropina,
      descuentoAplicado: montoDescuento,
      propinaAplicada: montoPropina,
      total: totalFinal,
      totalPagado: totalFinal,
      metodoPago: ped.metodoPago,
      cajeroAsignado: ped.cajeroAsignado,
      fechaBolivia: formatearFechaBolivia(fechaComprobante),
      fecha: fechaComprobante
    }
  })
}

// 3. NUEVO: Simulador de Pago desde Celular (QR Dinámico)
export const simularPagoQR = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pedidoId } = req.params

    const pedido = await Pedido.findById(pedidoId)
      .populate('mesa', 'numero')
      .populate('usuario', 'nombre apellido')
      .populate('detalles.plato', 'nombre precio')

    if (pedido) {
      pedido.pagoConfirmado = true
      await pedido.save()
    }

    // Emitimos los WebSockets correspondientes
    try {
      const io = getIO()

      // 1. Avisar a la caja
      io.emit('caja:pago_confirmado', {
        pedidoId,
        mensaje: 'Transferencia QR recibida',
        fecha: obtenerFechaBolivia()
      })

      // 2. Avisar al cliente en tiempo real
      io.emit(`pedido:pago_recibido:${pedidoId}`, {
        pedidoId,
        mensaje: 'Pago QR recibido correctamente',
        pedido
      })

      // 3. Avisar al delivery (nuevo pedido disponible) si es entrega por delivery
      if (pedido && pedido.metodoEntrega === 'delivery') {
        io.emit('delivery:pago_confirmado', { pedidoId })
        io.emit('delivery:nuevo_pedido', pedido)
      }
    } catch (socketError) {
      console.warn('Falló la emisión del WebSocket de simulación:', socketError)
    }

    res.status(200).json({
      exito: true,
      mensaje: 'Simulación de pago exitosa. Notificando a la caja...'
    })
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al simular el pago' })
  }
}
// 4. NUEVO: Enviar recibo detallado por correo electrónico
export const enviarReciboCorreo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pedidoId } = req.params
    // AHORA RECIBIMOS LOS DATOS DESDE EL FRONTEND
    const { email, clienteNombre, clienteCI } = req.body

    if (!email) {
      res.status(400).json({ mensaje: 'Debe proporcionar un correo electrónico' })
      return
    }

    const pedido = await Pedido.findById(pedidoId)
      .populate('usuario', 'nombre apellido')
      .populate('mesa')
      .populate('detalles.plato', 'nombre precio')

    if (!pedido) {
      res.status(404).json({ mensaje: 'Pedido no encontrado' })
      return
    }

    const ped: any = pedido
    const codigo = ped.codigo || `PED-${String(ped._id).slice(-4).toUpperCase()}`
    const subtotal = ped.subtotalCierre || ped.total || 0
    const descuento = ped.montoDescuento || 0
    const propina = ped.montoPropina || 0
    const totalFinal = subtotal - descuento + propina

    const mesaNombre = ped.mesa?.numero || 'Barra'
    const meseroNombre = ped.usuario
      ? `${ped.usuario.nombre} ${ped.usuario.apellido || ''}`.trim()
      : 'Mesero'
    const fecha = new Date().toLocaleString('es-BO')

    // USAMOS LOS DATOS QUE NOS MANDÓ LA PANTALLA (o valores por defecto si fallan)
    const finalClienteNombre = clienteNombre || ped.clienteNombre || 'Consumidor Final'
    const finalClienteCI = clienteCI || ped.clienteCI || ped.clienteNIT || 'S/N'

    // 1. Armamos las filas de la tabla de consumo dinámicamente
    let itemsHtml = ''
    const detalles = ped.detalles || ped.items || []

    detalles.forEach((item: any) => {
      const nombre = item.nombre || item.plato?.nombre || 'Plato'
      const cantidad = item.cantidad || 1
      const pu = (item.precioUnitario || item.plato?.precio || 0).toFixed(2)
      const subt = (item.subtotal || parseFloat(pu) * cantidad).toFixed(2)

      itemsHtml += `
        <tr>
          <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;">${cantidad}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;">${nombre}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">${pu}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">${subt}</td>
        </tr>
      `
    })

    // Cargo VIP
    if (ped.mesa?.tipo === 'vip' || ped.mesa?.type === 'vip') {
      itemsHtml += `
        <tr style="background-color: #fffbeb;">
          <td style="padding: 6px 0; border-bottom: 1px solid #fce7f3; color: #b45309;">1</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #fce7f3; color: #b45309; font-weight: bold;">Cargo Mesa VIP</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #fce7f3; text-align: right; color: #b45309;">100.00</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #fce7f3; text-align: right; color: #b45309;">100.00</td>
        </tr>
      `
    }

    // 2. Diseño del Ticket estilo "Impresora"
    const htmlDelRecibo = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 420px; margin: auto; padding: 30px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff; color: #374151; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #4B2E2D; margin: 0; font-size: 24px; font-weight: 900;">SABOR & GESTIÓN</h2>
            <p style="margin: 5px 0 0 0; color: #6B7280; font-size: 14px;">Comprobante de Pago</p>
            <p style="margin: 5px 0 0 0; font-weight: bold; color: #D96C4A;">Pedido: ${codigo}</p>
          </div>

          <div style="font-size: 13px; line-height: 1.6; margin-bottom: 20px;">
            <p style="margin: 0;"><strong>Mesa:</strong> ${mesaNombre}</p>
            <p style="margin: 0;"><strong>Mesero:</strong> ${meseroNombre}</p>
            <p style="margin: 0;"><strong>Cliente:</strong> ${finalClienteNombre}</p>
            <p style="margin: 0;"><strong>CI/NIT:</strong> ${finalClienteCI}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
            <thead>
              <tr style="border-bottom: 2px solid #e5e7eb;">
                <th style="text-align: left; padding-bottom: 8px; color: #9CA3AF; font-size: 11px; text-transform: uppercase;">Cant</th>
                <th style="text-align: left; padding-bottom: 8px; color: #9CA3AF; font-size: 11px; text-transform: uppercase;">Descripción</th>
                <th style="text-align: right; padding-bottom: 8px; color: #9CA3AF; font-size: 11px; text-transform: uppercase;">P.U</th>
                <th style="text-align: right; padding-bottom: 8px; color: #9CA3AF; font-size: 11px; text-transform: uppercase;">Subt</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="text-align: right; font-size: 13px; border-bottom: 2px solid #e5e7eb; padding-bottom: 15px; margin-bottom: 15px;">
            <p style="margin: 3px 0;">Subtotal: <span style="display: inline-block; width: 80px;">Bs. ${subtotal.toFixed(2)}</span></p>
            ${descuento > 0 ? `<p style="margin: 3px 0; color: #059669;">Descuento: <span style="display: inline-block; width: 80px;">- Bs. ${descuento.toFixed(2)}</span></p>` : ''}
            ${propina > 0 ? `<p style="margin: 3px 0; color: #D96C4A;">Propina: <span style="display: inline-block; width: 80px;">+ Bs. ${propina.toFixed(2)}</span></p>` : ''}
            <h3 style="margin: 10px 0 0 0; color: #111827; font-size: 18px;">TOTAL FINAL: <span style="display: inline-block; width: 100px;">Bs. ${totalFinal.toFixed(2)}</span></h3>
          </div>

          <div style="font-size: 12px; color: #6B7280; text-align: center;">
            <p style="margin: 2px 0;"><strong>Método de Pago:</strong> ${ped.metodoPago || 'Efectivo'}</p>
            <p style="margin: 2px 0;"><strong>Fecha:</strong> ${fecha}</p>
            <br/>
            <p style="margin: 0; font-weight: bold; color: #4B2E2D; font-size: 14px;">¡Gracias por su preferencia!</p>
          </div>

        </div>
      `

    await enviarCorreo(email, 'Comprobante de Pago - ' + codigo, htmlDelRecibo)

    res.status(200).json({ mensaje: 'Recibo enviado por correo exitosamente' })
  } catch (error) {
    console.error('Error al enviar recibo:', error)
    res.status(500).json({ mensaje: 'Error al enviar el correo' })
  }
}
