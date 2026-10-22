// src/utils/facturaTemplate.ts

export interface ItemFactura {
  nombre: string
  cantidad: number
  precioUnitario: number
  subtotal: number
}

export interface DatosFactura {
  codigo: string
  mesaNombre: string
  meseroNombre: string
  clienteNombre: string
  clienteCI: string
   subtotal: number
  propina: number
  totalFinal: number
  metodoPago?: string
  fecha?: string
  items: ItemFactura[]
}


function escaparHtml(valor: string | number): string {
  return String(valor)
    .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Función pura que genera la plantilla HTML con estilos CSS inline para el comprobante
 * de pago (ticket estilo impresora térmica) enviado por correo electrónico.
 */
export function generarPlantillaFacturaHTML(datos: DatosFactura): string {
  const {
    codigo,
    mesaNombre,
    meseroNombre,
    clienteNombre,
    clienteCI,
    subtotal,
    propina,
    totalFinal,
    metodoPago = 'Efectivo',
    fecha = new Date().toLocaleString('es-BO'),
    items
  } = datos

  // 1. Armamos las filas de la tabla de consumo dinámicamente
  let itemsHtml = ''
  const listaItems = items || []

  listaItems.forEach((item) => {
        const nombre = escaparHtml(item.nombre || 'Plato')
    const cantidad = escaparHtml(item.cantidad || 1)
    const pu = Number(item.precioUnitario || 0).toFixed(2)
    const subt = Number(
      item.subtotal || Number(pu) * item.cantidad
    ).toFixed(2)

    itemsHtml += `
        <tr>
          <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;">${cantidad}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;">${nombre}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">${pu}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0; text-align: right;">${subt}</td>
        </tr>
      `
  })

  // 2. Diseño del Ticket estilo "Impresora"
  return `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 420px; margin: auto; padding: 30px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff; color: #374151; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          
          <div style="text-align: center; margin-bottom: 20px;">
                      <h2 style="color: #4B2E2D; margin: 0; font-size: 24px; font-weight: 900;">Mishi-Food</h2>
            <p style="margin: 5px 0 0 0; color: #6B7280; font-size: 14px;">Comprobante de Pago</p>
            <p style="margin: 5px 0 0 0; font-weight: bold; color: #D96C4A;">Pedido: ${escaparHtml(codigo)}</p>
          </div>

          <div style="font-size: 13px; line-height: 1.6; margin-bottom: 20px;">
                     <p style="margin: 0;"><strong>Mesa:</strong> ${escaparHtml(mesaNombre)}</p>
          <p style="margin: 0;"><strong>Mesero:</strong> ${escaparHtml(meseroNombre)}</p>
          <p style="margin: 0;"><strong>Cliente:</strong> ${escaparHtml(clienteNombre)}</p>
          <p style="margin: 0;"><strong>CI/NIT:</strong> ${escaparHtml(clienteCI)}</p>
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
            ${propina > 0 ? `<p style="margin: 3px 0; color: #D96C4A;">Propina: <span style="display: inline-block; width: 80px;">+ Bs. ${propina.toFixed(2)}</span></p>` : ''}
            <h3 style="margin: 10px 0 0 0; color: #111827; font-size: 18px;">TOTAL FINAL: <span style="display: inline-block; width: 100px;">Bs. ${totalFinal.toFixed(2)}</span></h3>
          </div>

          <div style="font-size: 12px; color: #6B7280; text-align: center;">
                      <p style="margin: 2px 0;"><strong>Método de Pago:</strong> ${escaparHtml(metodoPago)}</p>
          <p style="margin: 2px 0;"><strong>Fecha:</strong> ${escaparHtml(fecha)}</p>
            <br/>
            <p style="margin: 0; font-weight: bold; color: #4B2E2D; font-size: 14px;">¡Gracias por su preferencia!</p>
          </div>

        </div>
      `
}
