//src/utils/comprobantePdf.ts
import PDFDocument from 'pdfkit'

export interface DetalleComprobantePdf {
  nombre: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  observacion: string
}

export interface PedidoComprobantePdf {
  codigo: string
  fecha: string
  meseroNombre: string
  detalles: DetalleComprobantePdf[]
}

export interface DatosComprobantePdf {
  codigoCuenta?: string
  codigoPago: string
  metodoPago: string
  fechaPago: string

  clienteNombre: string
  clienteCI: string
  clienteNIT: string

  cajeroNombre: string

  subtotal: number
  propina: number
  totalPagado: number

  montoRecibido?: number
  cambio?: number

  pedidos: PedidoComprobantePdf[]
}

function formatearImporte(importe: number): string {
  return `Bs ${importe.toFixed(2)}`
}

function validarImporte(
  nombre: string,
  importe: number
): void {
  if (!Number.isFinite(importe) || importe < 0) {
    throw new Error(
      `No se puede generar el comprobante: el importe ${nombre} no es válido.`
    )
  }
}

export async function generarComprobantePdf(
  datos: DatosComprobantePdf
): Promise<Buffer> {
  if (!datos.codigoPago.trim()) {
    throw new Error(
      'No se puede generar el comprobante sin un código de pago.'
    )
  }

  if (datos.pedidos.length === 0) {
    throw new Error(
      'No se puede generar el comprobante sin pedidos.'
    )
  }

  validarImporte('subtotal', datos.subtotal)
  validarImporte('propina', datos.propina)
  validarImporte('total pagado', datos.totalPagado)

  if (
    Number((datos.subtotal + datos.propina).toFixed(2)) !==
    Number(datos.totalPagado.toFixed(2))
  ) {
    throw new Error(
      'El subtotal, la propina y el total del comprobante no coinciden.'
    )
  }

    if (
    datos.metodoPago === 'Efectivo' &&
    (
      datos.montoRecibido !== undefined ||
      datos.cambio !== undefined
    )
  ) {
    if (
      datos.montoRecibido === undefined ||
      datos.cambio === undefined
    ) {
      throw new Error(
        'El importe recibido y el cambio deben proporcionarse juntos.'
      )
    }

    validarImporte('monto recibido', datos.montoRecibido)
    validarImporte('cambio', datos.cambio)

    if (datos.montoRecibido < datos.totalPagado) {
      throw new Error(
        'El importe recibido no puede ser menor que el total pagado.'
      )
    }

    if (
      Number(
        (datos.montoRecibido - datos.totalPagado).toFixed(2)
      ) !== Number(datos.cambio.toFixed(2))
    ) {
      throw new Error(
        'El cambio no coincide con los importes del comprobante.'
      )
    }
  }

  return await new Promise<Buffer>((resolve, reject) => {
    const documento = new PDFDocument({
      size: 'A4',
      margin: 42,
      info: {
        Title: `Comprobante de pago ${datos.codigoPago}`,
        Author: 'Mishi-Food',
        Subject: 'Comprobante detallado de pago'
      }
    })

    const fragmentos: Buffer[] = []

    documento.on('data', (fragmento: Buffer) => {
      fragmentos.push(Buffer.from(fragmento))
    })

    documento.on('error', (error: Error) => {
      reject(error)
    })

    documento.on('end', () => {
      resolve(Buffer.concat(fragmentos))
    })

    try {
      const dinero = formatearImporte

      const escribirCampo = (
        etiqueta: string,
        valor: string
      ): void => {
        documento
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#374151')
          .text(`${etiqueta}: `, {
            continued: true
          })

        documento
          .font('Helvetica')
          .text(valor.trim() || 'N/A')

        documento.moveDown(0.2)
      }

      const escribirSeparador = (): void => {
        const xInicial = documento.page.margins.left
        const xFinal =
          documento.page.width - documento.page.margins.right
        const y = documento.y + 4

        documento
          .moveTo(xInicial, y)
          .lineTo(xFinal, y)
          .lineWidth(0.7)
          .strokeColor('#D1D5DB')
          .stroke()

        documento.moveDown(0.7)
      }

            // Encabezado del comprobante Mishi-Food.
      const logoSize = 56
      const logoX = (documento.page.width - logoSize) / 2
      const logoY = documento.y

      // Fondo naranja con degradado, igual que el frontend.
      const fondoLogo = documento
        .linearGradient(
          logoX,
          logoY,
          logoX + logoSize,
          logoY + logoSize
        )
        .stop(0, '#D97706')
        .stop(1, '#C2410C')

      documento
        .roundedRect(logoX, logoY, logoSize, logoSize, 15)
        .fill(fondoLogo)

      // Icono Cat de Lucide, ampliado para ocupar casi
      // todo el cuadrado naranja.
      documento.save()

      documento.translate(logoX - 0.8, logoY + 0.4)
      documento.scale(2.35)

      documento
        .path(
          'M12 5c.67 0 1.35.09 2 .26 ' +
          '1.78-2 5.03-2.84 6.42-2.26 ' +
          '1.4.58-.42 7-.42 7 ' +
          '.57 1.07 1 2.24 1 3.44 ' +
          'C21 17.9 16.97 21 12 21 ' +
          's-9-3-9-7.56c0-1.25.5-2.4 1-3.44 ' +
          '0 0-1.89-6.42-.5-7s4.72.23 6.5 2.23 ' +
          'A9 9 0 0 1 12 5 ' +
          'm-4 9v.5m8-.5v.5 ' +
          'M11.25 16.25h1.5L12 17l-.75-.75z'
        )
        .lineWidth(2.2)
        .lineCap('round')
        .lineJoin('round')
        .stroke('#FFFFFF')

      documento.restore()

      // Dejar espacio debajo del logo.
      documento.y = logoY + logoSize + 8

      // Nombre del restaurante.
      documento
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor('#4B2E2D')
        .text('Mishi-Food', {
          align: 'center'
        })

      documento
        .moveDown(0.3)
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#111827')
        .text('COMPROBANTE DE PAGO', {
          align: 'center'
        })

      documento
        .moveDown(0.3)
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#6B7280')
        .text('Documento detallado de la operación', {
          align: 'center'
        })

      documento.moveDown(1)
      escribirSeparador()

      // Identificación de la operación.
      escribirCampo('Código de pago', datos.codigoPago)

      if (datos.codigoCuenta) {
        escribirCampo('Código de cuenta', datos.codigoCuenta)
      }

      escribirCampo('Fecha y hora', datos.fechaPago)
      escribirCampo('Estado', 'PAGADO')
      escribirCampo('Método de pago', datos.metodoPago)
      escribirCampo('Cajero responsable', datos.cajeroNombre)

      documento.moveDown(0.4)
      escribirSeparador()

      // Datos del cliente.
      documento
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#4B2E2D')
        .text('DATOS DEL CLIENTE')

      documento.moveDown(0.4)

      escribirCampo(
        'Nombre completo',
        datos.clienteNombre || 'Consumidor Final'
      )

      escribirCampo('CI', datos.clienteCI || 'N/A')
      escribirCampo('NIT', datos.clienteNIT || 'N/A')

      documento.moveDown(0.4)
      escribirSeparador()

      // Detalle completo de cada pedido.
      documento
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#4B2E2D')
        .text('DETALLE DE PEDIDOS')

      documento.moveDown(0.5)

      for (const pedido of datos.pedidos) {
        documento
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#111827')
          .text(`Pedido: ${pedido.codigo}`)

        documento
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#4B5563')
          .text(`Fecha: ${pedido.fecha}`)

        documento.text(
          `Mesero responsable: ${pedido.meseroNombre || 'N/A'}`
        )

        documento.moveDown(0.4)

        if (pedido.detalles.length === 0) {
          throw new Error(
            `El pedido ${pedido.codigo} no contiene productos para el comprobante.`
          )
        }

        for (const detalle of pedido.detalles) {
          validarImporte(
            `precio unitario de ${detalle.nombre}`,
            detalle.precioUnitario
          )

          validarImporte(
            `subtotal de ${detalle.nombre}`,
            detalle.subtotal
          )

          if (
            !Number.isInteger(detalle.cantidad) ||
            detalle.cantidad <= 0
          ) {
            throw new Error(
              `La cantidad del producto ${detalle.nombre} no es válida.`
            )
          }

          documento
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#111827')
            .text(
              `${detalle.cantidad} × ${detalle.nombre || 'Producto'}`
            )

          documento
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#374151')
            .text(
              `Precio unitario: ${dinero(detalle.precioUnitario)}`
            )

          documento.text(
            `Subtotal: ${dinero(detalle.subtotal)}`
          )

          documento.text(
            `Observación: ${detalle.observacion?.trim() || 'Sin observaciones'}`
          )

          documento.moveDown(0.5)
        }

        const subtotalPedido = Number(
          pedido.detalles
            .reduce(
              (acumulado, detalle) =>
                acumulado + detalle.subtotal,
              0
            )
            .toFixed(2)
        )

        documento
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#374151')
          .text(
            `Subtotal del pedido: ${dinero(subtotalPedido)}`,
            {
              align: 'right'
            }
          )

        documento.moveDown(0.6)
        escribirSeparador()
      }

      // Resumen financiero.
      documento
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#4B2E2D')
        .text('RESUMEN DEL PAGO')

      documento.moveDown(0.5)

      escribirCampo('Subtotal', dinero(datos.subtotal))

      escribirCampo(
        'Propina',
        datos.propina > 0
          ? dinero(datos.propina)
          : 'No añadida'
      )

            if (
        datos.metodoPago === 'Efectivo' &&
        datos.montoRecibido !== undefined &&
        datos.cambio !== undefined
      ) {
        escribirCampo(
          'Importe recibido',
          dinero(datos.montoRecibido)
        )

        escribirCampo(
          'Cambio',
          dinero(datos.cambio)
        )
      }

      escribirSeparador()

      documento
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#111827')
        .text(
          `TOTAL PAGADO: ${dinero(datos.totalPagado)}`,
          {
            align: 'right'
          }
        )

      documento.moveDown(1)

      if (
        datos.metodoPago === 'QR' ||
        datos.metodoPago === 'Tarjeta'
      ) {
        documento
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#6B7280')
          .text(
            'Esta operación fue simulada en el sistema y no representa una confirmación bancaria real.',
            {
              align: 'center'
            }
          )

        documento.moveDown(0.6)
      }

      documento
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#4B2E2D')
        .text('¡Gracias por su preferencia!', {
          align: 'center'
        })

      documento.end()
    } catch (error: unknown) {
      reject(error)
    }
  })
}