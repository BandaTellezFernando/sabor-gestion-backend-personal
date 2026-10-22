import { writeFile, stat } from 'node:fs/promises'
import { generarComprobantePdf } from '../src/utils/comprobantePdf'

async function main(): Promise<void> {
  const datos = {
    codigoCuenta: 'CTA-PRUEBA-001',
    codigoPago: 'PAG-PRUEBA-001',
    metodoPago: 'Efectivo',
    fechaPago: '22/10/2026 00:30:00',
    clienteNombre: 'Cliente de prueba',
    clienteCI: '1234567',
    clienteNIT: '',
    cajeroNombre: 'Cajero de prueba',
    subtotal: 50,
    propina: 5,
    totalPagado: 55,
    pedidos: [
      {
        codigo: 'PED-PRUEBA-001',
        fecha: '22/10/2026 00:25:00',
        meseroNombre: 'Mesero de prueba',
        detalles: [
          {
            nombre: 'Hamburguesa de prueba',
            cantidad: 2,
            precioUnitario: 25,
            subtotal: 50,
            observacion: 'Sin cebolla'
          }
        ]
      }
    ]
  }

  const pdf = await generarComprobantePdf(datos)

  if (!Buffer.isBuffer(pdf)) {
    throw new Error('El generador no devolvió un Buffer.')
  }

  const cabecera = pdf.subarray(0, 5).toString('ascii')

  if (cabecera !== '%PDF-') {
    throw new Error(
      `El archivo generado no parece un PDF válido. Cabecera: ${cabecera}`
    )
  }

  const ruta = '/tmp/comprobante-prueba.pdf'
  await writeFile(ruta, pdf)

  const informacion = await stat(ruta)

  if (informacion.size === 0) {
    throw new Error('El PDF generado está vacío.')
  }

  console.log('PRUEBA CORRECTA')
  console.log(`Archivo: ${ruta}`)
  console.log(`Tamaño: ${informacion.size} bytes`)
  console.log(`Cabecera: ${cabecera}`)
}

main().catch((error: unknown) => {
  console.error('ERROR AL GENERAR EL COMPROBANTE:')

  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(error)
  }

  process.exitCode = 1
})