//src/services/reporteVentas.service.ts
import Pago from '../models/Pago'
import Pedido from '../models/Pedido'
import Plato from '../models/Plato'
import Categoria from '../models/Categoria'
import Usuario from '../models/Usuario'
import { generarReporteVentasPdf } from '../utils/reporteVentasPdf'

export interface PeriodoReporte {
  desde: string
  hasta: string
}

export class ReporteVentasError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'ReporteVentasError'
  }
}

interface AcumuladoMetodo {
  metodo: string
  operaciones: number
  subtotal: number
  propinas: number
  total: number
}

interface AcumuladoDia {
  fecha: string
  operaciones: number
  subtotal: number
  propinas: number
  total: number
}

interface AcumuladoMesero {
  mesero: string
  pedidos: number
  importe: number
}

interface AcumuladoProducto {
  producto: string
  categoria: string
  unidades: number
  importe: number
}

interface AcumuladoCategoria {
  categoria: string
  unidades: number
  importe: number
}

export interface DatosReporteVentas {
  desde: string
  hasta: string
  generado: Date
  resumen: {
    operaciones: number
    subtotal: number
    propinas: number
    total: number
    promedioPago: number
  }
  dias: AcumuladoDia[]
  metodos: AcumuladoMetodo[]
  meseros: AcumuladoMesero[]
  productos: AcumuladoProducto[]
  categorias: AcumuladoCategoria[]
}

function redondearImporte(valor: number): number {
  return Number(valor.toFixed(2))
}

function fechaEsValida(fecha: string): boolean {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (!coincidencia) return false

  const anio = Number(coincidencia[1])
  const mes = Number(coincidencia[2])
  const dia = Number(coincidencia[3])
  const comprobacion = new Date(Date.UTC(anio, mes - 1, dia))

  return (
    comprobacion.getUTCFullYear() === anio &&
    comprobacion.getUTCMonth() === mes - 1 &&
    comprobacion.getUTCDate() === dia
  )
}

function obtenerFechaISOBolivia(fecha: Date): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(fecha)

  const anio = partes.find((parte) => parte.type === 'year')?.value ?? ''
  const mes = partes.find((parte) => parte.type === 'month')?.value ?? ''
  const dia = partes.find((parte) => parte.type === 'day')?.value ?? ''

  return `${anio}-${mes}-${dia}`
}

function sumarDetallePedido(detalles: Array<{
  cantidad?: number
  precioUnitario?: number
  subtotal?: number
}>): number {
  return redondearImporte(detalles.reduce((total, detalle) => {
    const cantidad = Number(detalle.cantidad ?? 0)
    const precio = Number(detalle.precioUnitario ?? 0)
    const subtotalGuardado = Number(detalle.subtotal)
    const subtotal = Number.isFinite(subtotalGuardado)
      ? subtotalGuardado
      : cantidad * precio

    return total + (Number.isFinite(subtotal) ? subtotal : 0)
  }, 0))
}

export async function generarReporteVentasBuffer(
  periodo: PeriodoReporte
): Promise<{ nombreArchivo: string; contenido: Buffer }> {
  const { desde, hasta } = periodo

  if (!fechaEsValida(desde) || !fechaEsValida(hasta)) {
    throw new ReporteVentasError(
      400,
      'Selecciona fechas válidas con el formato AAAA-MM-DD.'
    )
  }

  if (desde > hasta) {
    throw new ReporteVentasError(
      400,
      'La fecha inicial no puede ser posterior a la fecha final.'
    )
  }

  const fechaInicioUTC = new Date(`${desde}T00:00:00.000-04:00`)
  const fechaFinUTCExclusiva = new Date(`${hasta}T00:00:00.000-04:00`)
  fechaFinUTCExclusiva.setUTCDate(fechaFinUTCExclusiva.getUTCDate() + 1)

  const duracionDias = Math.floor(
    (fechaFinUTCExclusiva.getTime() - fechaInicioUTC.getTime()) /
      (24 * 60 * 60 * 1000)
  )

  if (duracionDias > 366) {
    throw new ReporteVentasError(
      400,
      'El periodo no puede superar 366 días. Selecciona un rango más corto.'
    )
  }

  // Única fuente financiera: pagos efectivamente confirmados y su fecha real de pago.
  const pagos = await Pago.find({
    estadoPago: 'Pagado',
    fechaPago: {
      $gte: fechaInicioUTC,
      $lt: fechaFinUTCExclusiva
    }
  })
    .select('codigoPago pedido pedidos subtotal propina totalFinal metodoPago fechaPago estadoPago')
    .sort({ fechaPago: 1, _id: 1 })
    .lean()
    .exec()

  const operaciones = pagos.length
  const subtotalTotal = redondearImporte(
    pagos.reduce((total, pago) => total + Number(pago.subtotal ?? 0), 0)
  )
  const propinasTotal = redondearImporte(
    pagos.reduce((total, pago) => total + Number(pago.propina ?? 0), 0)
  )
  const totalCobrado = redondearImporte(
    pagos.reduce((total, pago) => total + Number(pago.totalFinal ?? 0), 0)
  )

  const metodosPorNombre = new Map<string, AcumuladoMetodo>()
  const diasPorFecha = new Map<string, AcumuladoDia>()

  for (const pago of pagos) {
    const metodo = String(pago.metodoPago || 'Sin método registrado')
    const metodoActual = metodosPorNombre.get(metodo) ?? {
      metodo,
      operaciones: 0,
      subtotal: 0,
      propinas: 0,
      total: 0
    }

    metodoActual.operaciones += 1
    metodoActual.subtotal += Number(pago.subtotal ?? 0)
    metodoActual.propinas += Number(pago.propina ?? 0)
    metodoActual.total += Number(pago.totalFinal ?? 0)
    metodosPorNombre.set(metodo, metodoActual)

    if (pago.fechaPago) {
      const fecha = obtenerFechaISOBolivia(new Date(pago.fechaPago))
      const diaActual = diasPorFecha.get(fecha) ?? {
        fecha,
        operaciones: 0,
        subtotal: 0,
        propinas: 0,
        total: 0
      }

      diaActual.operaciones += 1
      diaActual.subtotal += Number(pago.subtotal ?? 0)
      diaActual.propinas += Number(pago.propina ?? 0)
      diaActual.total += Number(pago.totalFinal ?? 0)
      diasPorFecha.set(fecha, diaActual)
    }
  }

  const dias: AcumuladoDia[] = []
  const cursorDia = new Date(`${desde}T00:00:00.000Z`)
  const limiteDia = new Date(`${hasta}T00:00:00.000Z`)

  while (cursorDia <= limiteDia) {
    const clave = cursorDia.toISOString().slice(0, 10)
    const registro = diasPorFecha.get(clave)
    dias.push({
      fecha: clave,
      operaciones: registro?.operaciones ?? 0,
      subtotal: redondearImporte(registro?.subtotal ?? 0),
      propinas: redondearImporte(registro?.propinas ?? 0),
      total: redondearImporte(registro?.total ?? 0)
    })
    cursorDia.setUTCDate(cursorDia.getUTCDate() + 1)
  }

  const idsPedido = new Set<string>()
  for (const pago of pagos) {
    const idsRelacionados = Array.isArray(pago.pedidos) && pago.pedidos.length > 0
      ? pago.pedidos
      : [pago.pedido]

    for (const id of idsRelacionados) {
      if (id) idsPedido.add(String(id))
    }
  }

  const pedidos = idsPedido.size > 0
    ? await Pedido.find({ _id: { $in: Array.from(idsPedido) } })
      .select('codigo usuario recogidoPor detalles total')
      .lean()
      .exec()
    : []

  const idsResponsables = new Set<string>()
  const idsPlatos = new Set<string>()

  for (const pedido of pedidos) {
    if (pedido.recogidoPor) idsResponsables.add(String(pedido.recogidoPor))
    if (pedido.usuario) idsResponsables.add(String(pedido.usuario))

    for (const detalle of pedido.detalles ?? []) {
      if (detalle.plato) idsPlatos.add(String(detalle.plato))
    }
  }

  const usuarios = idsResponsables.size > 0
    ? await Usuario.find({ _id: { $in: Array.from(idsResponsables) } })
      .select('nombre apellido rol')
      .lean()
      .exec()
    : []
  const usuarioPorId = new Map<string, (typeof usuarios)[number]>()
  for (const usuario of usuarios) {
    usuarioPorId.set(String(usuario._id), usuario)
  }

  const platosCatalogo = idsPlatos.size > 0
    ? await Plato.find({ _id: { $in: Array.from(idsPlatos) } })
      .select('nombre categoria')
      .lean()
      .exec()
    : []
  const platoPorId = new Map<string, (typeof platosCatalogo)[number]>()
  for (const plato of platosCatalogo) {
    platoPorId.set(String(plato._id), plato)
  }

  const idsCategorias = new Set<string>()
  for (const plato of platosCatalogo) {
    if (plato.categoria) idsCategorias.add(String(plato.categoria))
  }

  const categoriasCatalogo = idsCategorias.size > 0
    ? await Categoria.find({ _id: { $in: Array.from(idsCategorias) } })
      .select('nombre')
      .lean()
      .exec()
    : []
  const categoriaPorId = new Map<string, string>()
  for (const categoria of categoriasCatalogo) {
    categoriaPorId.set(String(categoria._id), categoria.nombre)
  }

  const meserosPorClave = new Map<string, AcumuladoMesero>()
  const productosPorClave = new Map<string, AcumuladoProducto>()
  const categoriasPorNombre = new Map<string, AcumuladoCategoria>()

  for (const pedido of pedidos) {
    const importePedido = sumarDetallePedido(pedido.detalles ?? [])
    const meseroQueRecogio = pedido.recogidoPor
      ? usuarioPorId.get(String(pedido.recogidoPor))
      : undefined
    const meseroResponsable = pedido.usuario
      ? usuarioPorId.get(String(pedido.usuario))
      : undefined
    // Prioriza al usuario que recogió el pedido; si no existe, usa al responsable.
const usuario = meseroQueRecogio ?? meseroResponsable
    const claveMesero = usuario ? String(usuario._id) : 'sin-mesero'
    const nombreMesero = usuario
      ? `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim() || 'Mesero sin nombre'
      : 'Sin mesero asignado'

    const acumuladoMesero = meserosPorClave.get(claveMesero) ?? {
      mesero: nombreMesero,
      pedidos: 0,
      importe: 0
    }
    acumuladoMesero.pedidos += 1
    acumuladoMesero.importe += importePedido
    meserosPorClave.set(claveMesero, acumuladoMesero)

    for (const detalle of pedido.detalles ?? []) {
      const cantidad = Number(detalle.cantidad ?? 0)
      const importeDetalleGuardado = Number(detalle.subtotal)
      const importeDetalle = redondearImporte(
        Number.isFinite(importeDetalleGuardado)
          ? importeDetalleGuardado
          : cantidad * Number(detalle.precioUnitario ?? 0)
      )
      const platoId = detalle.plato ? String(detalle.plato) : ''
      const platoCatalogo = platoId ? platoPorId.get(platoId) : undefined
      const nombreGuardado = String(detalle.nombrePlato ?? '').trim()
      const nombreProducto = (
        nombreGuardado && nombreGuardado.toLowerCase() !== 'plato'
          ? nombreGuardado
          : String(platoCatalogo?.nombre || nombreGuardado || 'Producto no disponible')
      ).trim()
      const categoriaId = platoCatalogo?.categoria
        ? String(platoCatalogo.categoria)
        : ''
      const nombreCategoria = categoriaId
        ? categoriaPorId.get(categoriaId) || 'Sin categoría'
        : 'Sin categoría'
      const claveProducto = platoId || `nombre:${nombreProducto.toLocaleLowerCase('es-BO')}`

      const acumuladoProducto = productosPorClave.get(claveProducto) ?? {
        producto: nombreProducto,
        categoria: nombreCategoria,
        unidades: 0,
        importe: 0
      }
      acumuladoProducto.unidades += cantidad
      acumuladoProducto.importe += importeDetalle
      productosPorClave.set(claveProducto, acumuladoProducto)

      const acumuladoCategoria = categoriasPorNombre.get(nombreCategoria) ?? {
        categoria: nombreCategoria,
        unidades: 0,
        importe: 0
      }
      acumuladoCategoria.unidades += cantidad
      acumuladoCategoria.importe += importeDetalle
      categoriasPorNombre.set(nombreCategoria, acumuladoCategoria)
    }
  }

  const normalizarMetodos = Array.from(metodosPorNombre.values())
    .map((registro) => ({
      ...registro,
      subtotal: redondearImporte(registro.subtotal),
      propinas: redondearImporte(registro.propinas),
      total: redondearImporte(registro.total)
    }))
    .sort((a, b) => b.total - a.total)

  const normalizarMeseros = Array.from(meserosPorClave.values())
    .map((registro) => ({ ...registro, importe: redondearImporte(registro.importe) }))
    .sort((a, b) => b.importe - a.importe)

  const normalizarProductos = Array.from(productosPorClave.values())
    .map((registro) => ({ ...registro, importe: redondearImporte(registro.importe) }))
    .sort((a, b) => b.importe - a.importe)

  const normalizarCategorias = Array.from(categoriasPorNombre.values())
    .map((registro) => ({ ...registro, importe: redondearImporte(registro.importe) }))
    .sort((a, b) => b.importe - a.importe)

  const datos: DatosReporteVentas = {
    desde,
    hasta,
    generado: new Date(),
    resumen: {
      operaciones,
      subtotal: subtotalTotal,
      propinas: propinasTotal,
      total: totalCobrado,
      promedioPago: operaciones > 0
        ? redondearImporte(totalCobrado / operaciones)
        : 0
    },
    dias,
    metodos: normalizarMetodos,
    meseros: normalizarMeseros,
    productos: normalizarProductos,
    categorias: normalizarCategorias
  }

  const contenido = await generarReporteVentasPdf(datos)
  return {
    nombreArchivo: `reporte-ventas-mishi-food-${desde}-${hasta}.pdf`,
    contenido
  }
}
