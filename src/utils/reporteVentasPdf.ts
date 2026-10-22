import PDFDocument from 'pdfkit'
import type { DatosReporteVentas } from '../services/reporteVentas.service'

type DocumentoPdf = InstanceType<typeof PDFDocument>

const COLOR_PRINCIPAL = '#C84B26'
const COLOR_TEXTO = '#292524'
const COLOR_SECUNDARIO = '#78716C'
const COLOR_FONDO = '#FFF7ED'
const COLOR_LINEA = '#E7E5E4'

function formatoDinero(valor: number): string {
  return `Bs ${Number(valor || 0).toFixed(2)}`
}

function formatoFecha(fecha: string | Date): string {
  const valor = typeof fecha === 'string' ? new Date(`${fecha}T12:00:00-04:00`) : fecha
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(valor)
}

function truncarTexto(valor: string, maximo: number): string {
  const texto = String(valor ?? '')
  if (texto.length <= maximo) return texto
  return `${texto.slice(0, Math.max(1, maximo - 1))}…`
}

function asegurarEspacio(
  documento: DocumentoPdf,
  altoNecesario: number
): void {
  const limite = documento.page.height - documento.page.margins.bottom
  if (documento.y + altoNecesario > limite) documento.addPage()
}

function tituloSeccion(
  documento: DocumentoPdf,
  titulo: string
): void {
  asegurarEspacio(documento, 34)
  documento.moveDown(0.65)
  documento
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(COLOR_PRINCIPAL)
    .text(titulo)
  documento.moveDown(0.35)
  documento
    .moveTo(documento.page.margins.left, documento.y)
    .lineTo(documento.page.width - documento.page.margins.right, documento.y)
    .lineWidth(0.7)
    .strokeColor(COLOR_LINEA)
    .stroke()
  documento.moveDown(0.35)
}

interface ColumnaTabla {
  titulo: string
  proporcion: number
  alinear?: 'left' | 'right' | 'center'
  maxCaracteres?: number
}

function dibujarTabla(
  documento: DocumentoPdf,
  columnas: ColumnaTabla[],
  filas: string[][]
): void {
  const xInicial = documento.page.margins.left
  const anchoTotal = documento.page.width - documento.page.margins.left - documento.page.margins.right
  const alturasFila = 22
  const anchos = columnas.map((columna) => anchoTotal * columna.proporcion)

  const dibujarCabecera = (): number => {
    let x = xInicial
    const y = documento.y
    documento.save()
    documento.rect(xInicial, y, anchoTotal, 24).fill('#F5F5F4')
    columnas.forEach((columna, indice) => {
      documento
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLOR_TEXTO)
        .text(
          truncarTexto(columna.titulo, columna.maxCaracteres ?? 24),
          x + 5,
          y + 7,
          {
            width: anchos[indice] - 10,
            align: columna.alinear ?? 'left',
            lineBreak: false
          }
        )
      x += anchos[indice]
    })
    documento.restore()
    return y + 24
  }

  documento.font('Helvetica').fontSize(8.5)
  let y = documento.y
  y = dibujarCabecera()

  const filasMostrar = filas.length > 0
    ? filas
    : [['Sin datos en el periodo', ...columnas.slice(1).map(() => '—')]]

  for (const fila of filasMostrar) {
    const limite = documento.page.height - documento.page.margins.bottom
    if (y + alturasFila > limite) {
      documento.addPage()
      y = dibujarCabecera()
    }

    if (y + alturasFila > documento.page.height - documento.page.margins.bottom) {
      documento.addPage()
      y = dibujarCabecera()
    }

    if (Math.floor(y / alturasFila) % 2 === 0) {
      documento.save()
      documento.rect(xInicial, y, anchoTotal, alturasFila).fill('#FCFCFB')
      documento.restore()
    }

    let x = xInicial
    columnas.forEach((columna, indice) => {
      const texto = truncarTexto(
        String(fila[indice] ?? ''),
        columna.maxCaracteres ?? Math.max(8, Math.floor(anchos[indice] / 5.5))
      )
      documento
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(COLOR_TEXTO)
        .text(texto, x + 5, y + 6, {
          width: anchos[indice] - 10,
          align: columna.alinear ?? 'left',
          lineBreak: false
        })
      x += anchos[indice]
    })

    documento
      .moveTo(xInicial, y + alturasFila)
      .lineTo(xInicial + anchoTotal, y + alturasFila)
      .lineWidth(0.35)
      .strokeColor(COLOR_LINEA)
      .stroke()

    y += alturasFila
  }

  documento.y = y + 7
}

function dibujarResumen(
  documento: DocumentoPdf,
  datos: DatosReporteVentas
): void {
  const x = documento.page.margins.left
  const ancho = documento.page.width - documento.page.margins.left - documento.page.margins.right
  const espacio = 10
  const anchoTarjeta = (ancho - espacio) / 2
  const altoTarjeta = 44
  const tarjetas = [
    { etiqueta: 'TOTAL COBRADO', valor: formatoDinero(datos.resumen.total) },
    { etiqueta: 'PAGOS CONFIRMADOS', valor: String(datos.resumen.operaciones) },
    { etiqueta: 'VENTAS SIN PROPINA', valor: formatoDinero(datos.resumen.subtotal) },
    { etiqueta: 'PROPINAS', valor: formatoDinero(datos.resumen.propinas) }
  ]

  asegurarEspacio(documento, altoTarjeta * 2 + 14)
  const yInicial = documento.y + 3

  tarjetas.forEach((tarjeta, indice) => {
    const fila = Math.floor(indice / 2)
    const columna = indice % 2
    const tarjetaX = x + columna * (anchoTarjeta + espacio)
    const tarjetaY = yInicial + fila * (altoTarjeta + 8)

    documento.save()
    documento.roundedRect(tarjetaX, tarjetaY, anchoTarjeta, altoTarjeta, 7)
      .fill(COLOR_FONDO)
    documento
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(COLOR_SECUNDARIO)
      .text(tarjeta.etiqueta, tarjetaX + 10, tarjetaY + 7, {
        width: anchoTarjeta - 20,
        lineBreak: false
      })
    documento
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(COLOR_TEXTO)
      .text(tarjeta.valor, tarjetaX + 10, tarjetaY + 21, {
        width: anchoTarjeta - 20,
        lineBreak: false
      })
    documento.restore()
  })

  documento.y = yInicial + altoTarjeta * 2 + 8 + 4
  documento
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(COLOR_SECUNDARIO)
    .text(`Promedio por pago: ${formatoDinero(datos.resumen.promedioPago)}`)
}

export async function generarReporteVentasPdf(
  datos: DatosReporteVentas
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const documento = new PDFDocument({
      size: 'A4',
      margin: 42,
      bufferPages: true,
      info: {
        Title: 'Reporte general de ventas - Mishi-Food',
        Author: 'Mishi-Food',
        Subject: 'Ventas, propinas, métodos de pago, meseros y productos'
      }
    })

    const fragmentos: Buffer[] = []
    documento.on('data', (fragmento: Buffer) => fragmentos.push(Buffer.from(fragmento)))
    documento.on('error', reject)
    documento.on('end', () => resolve(Buffer.concat(fragmentos)))

    try {
      const ancho = documento.page.width - documento.page.margins.left - documento.page.margins.right

      documento.save()
      documento.rect(0, 0, documento.page.width, 112).fill(COLOR_FONDO)
      documento.restore()

      documento
        .font('Helvetica-Bold')
        .fontSize(23)
        .fillColor(COLOR_PRINCIPAL)
        .text('Mishi-Food', documento.page.margins.left, 35, {
          width: ancho,
          align: 'center'
        })
      documento
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(COLOR_TEXTO)
        .text('REPORTE GENERAL DE VENTAS', documento.page.margins.left, 66, {
          width: ancho,
          align: 'center'
        })
      documento
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(COLOR_SECUNDARIO)
        .text(`Periodo: ${formatoFecha(datos.desde)} al ${formatoFecha(datos.hasta)}`, {
          width: ancho,
          align: 'center'
        })

      documento.y = 127
      documento
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLOR_SECUNDARIO)
        .text(`Generado: ${formatoFecha(datos.generado)} ${new Intl.DateTimeFormat('es-BO', {
          timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false
        }).format(datos.generado)}`)

      tituloSeccion(documento, '1. Resumen de ventas y propinas')
      dibujarResumen(documento, datos)

      tituloSeccion(documento, 'Evolución diaria')
      dibujarTabla(documento, [
        { titulo: 'Fecha', proporcion: 0.19 },
        { titulo: 'Pagos', proporcion: 0.12, alinear: 'right' },
        { titulo: 'Subtotal', proporcion: 0.22, alinear: 'right' },
        { titulo: 'Propinas', proporcion: 0.19, alinear: 'right' },
        { titulo: 'Total cobrado', proporcion: 0.28, alinear: 'right' }
      ], datos.dias.map((dia) => [
        formatoFecha(dia.fecha),
        String(dia.operaciones),
        formatoDinero(dia.subtotal),
        formatoDinero(dia.propinas),
        formatoDinero(dia.total)
      ]))

      tituloSeccion(documento, '2. Ventas por método de pago')
      dibujarTabla(documento, [
        { titulo: 'Método', proporcion: 0.25 },
        { titulo: 'Operaciones', proporcion: 0.15, alinear: 'right' },
        { titulo: 'Subtotal', proporcion: 0.2, alinear: 'right' },
        { titulo: 'Propinas', proporcion: 0.18, alinear: 'right' },
        { titulo: 'Total', proporcion: 0.22, alinear: 'right' }
      ], datos.metodos.map((metodo) => [
        metodo.metodo,
        String(metodo.operaciones),
        formatoDinero(metodo.subtotal),
        formatoDinero(metodo.propinas),
        formatoDinero(metodo.total)
      ]))

      tituloSeccion(documento, '3. Rendimiento por mesero')
      documento
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLOR_SECUNDARIO)
        .text('Se consideran pedidos vinculados a pagos confirmados; se usa el mesero que recogió el pedido y, si no está registrado, el mesero responsable del pedido.')
      documento.moveDown(0.4)
      dibujarTabla(documento, [
        { titulo: 'Mesero', proporcion: 0.48 },
        { titulo: 'Pedidos cobrados', proporcion: 0.2, alinear: 'right' },
        { titulo: 'Importe de pedidos', proporcion: 0.32, alinear: 'right' }
      ], datos.meseros.map((mesero) => [
        mesero.mesero,
        String(mesero.pedidos),
        formatoDinero(mesero.importe)
      ]))

      tituloSeccion(documento, '4. Productos y categorías')
      documento
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(COLOR_TEXTO)
        .text('Productos más vendidos')
      documento.moveDown(0.25)
      dibujarTabla(documento, [
        { titulo: 'Producto', proporcion: 0.38 },
        { titulo: 'Categoría', proporcion: 0.25 },
        { titulo: 'Unidades', proporcion: 0.15, alinear: 'right' },
        { titulo: 'Importe', proporcion: 0.22, alinear: 'right' }
      ], datos.productos.map((producto) => [
        producto.producto,
        producto.categoria,
        String(producto.unidades),
        formatoDinero(producto.importe)
      ]))

      asegurarEspacio(documento, 34)
      documento
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(COLOR_TEXTO)
        .text('Resumen por categoría')
      documento.moveDown(0.25)
      dibujarTabla(documento, [
        { titulo: 'Categoría', proporcion: 0.48 },
        { titulo: 'Unidades', proporcion: 0.2, alinear: 'right' },
        { titulo: 'Importe', proporcion: 0.32, alinear: 'right' }
      ], datos.categorias.map((categoria) => [
        categoria.categoria,
        String(categoria.unidades),
        formatoDinero(categoria.importe)
      ]))

      documento
        .moveDown(0.5)
        .font('Helvetica-Oblique')
        .fontSize(7.5)
        .fillColor(COLOR_SECUNDARIO)
        .text('Criterio: se incluyen únicamente pagos con estado “Pagado” y fecha de pago dentro del periodo. Los pedidos, productos y categorías se obtienen de los registros relacionados con dichos pagos.', {
          width: ancho,
          align: 'left'
        })

      documento.end()
    } catch (error) {
      reject(error)
    }
  })
}
