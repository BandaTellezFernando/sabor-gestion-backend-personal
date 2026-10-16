import {
  MovimientoInventarioRepository,
  movimientoInventarioRepository,
} from '../repositories/movimientoInventario.repo'

export class MovimientoInventarioServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'MovimientoInventarioServiceError'
  }
}

export interface FiltrosMovimientosInventario {
  pagina?: string
  limite?: string
  codigoPedido?: string
  desde?: string
  hasta?: string
}

function convertirFecha(
  valor: string | undefined,
  esFechaFinal: boolean,
): Date | undefined {
  if (!valor) return undefined

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new MovimientoInventarioServiceError(
      400,
      'Las fechas deben tener el formato YYYY-MM-DD.',
    )
  }

  const [anio, mes, dia] = valor.split('-').map(Number)
  const fechaCalendario = new Date(Date.UTC(anio, mes - 1, dia))

  if (
    fechaCalendario.getUTCFullYear() !== anio ||
    fechaCalendario.getUTCMonth() !== mes - 1 ||
    fechaCalendario.getUTCDate() !== dia
  ) {
    throw new MovimientoInventarioServiceError(400, 'La fecha indicada no es válida.')
  }

  const hora = esFechaFinal ? '23:59:59.999' : '00:00:00.000'
  const fecha = new Date(`${valor}T${hora}-04:00`)

  if (Number.isNaN(fecha.getTime())) {
    throw new MovimientoInventarioServiceError(400, 'La fecha indicada no es válida.')
  }

  return fecha
}

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export class MovimientoInventarioService {
  constructor(
    private repository: MovimientoInventarioRepository =
      movimientoInventarioRepository,
  ) {}

  async obtenerMovimientos(filtros: FiltrosMovimientosInventario = {}) {
    const pagina = filtros.pagina === undefined ? 1 : Number(filtros.pagina)
    const limite = filtros.limite === undefined ? 25 : Number(filtros.limite)

    if (!Number.isSafeInteger(pagina) || pagina < 1) {
      throw new MovimientoInventarioServiceError(
        400,
        'La página debe ser un entero mayor o igual a 1.',
      )
    }

    if (!Number.isSafeInteger(limite) || limite < 1 || limite > 100) {
      throw new MovimientoInventarioServiceError(
        400,
        'El límite debe ser un entero entre 1 y 100.',
      )
    }

    const desde = convertirFecha(filtros.desde, false)
    const hasta = convertirFecha(filtros.hasta, true)

    if (desde && hasta && desde > hasta) {
      throw new MovimientoInventarioServiceError(
        400,
        'La fecha inicial no puede ser posterior a la fecha final.',
      )
    }

    const filtro: Record<string, unknown> = {}

    if (filtros.codigoPedido?.trim()) {
      filtro.codigoPedido = {
        $regex: escaparRegex(filtros.codigoPedido.trim()),
        $options: 'i',
      }
    }

    if (desde || hasta) {
      const rangoFecha: Record<string, Date> = {}
      if (desde) rangoFecha.$gte = desde
      if (hasta) rangoFecha.$lte = hasta
      filtro.fechaHora = rangoFecha
    }

    const resultado = await this.repository.buscarPaginado(
      filtro,
      pagina,
      limite,
    )

    return {
      movimientos: resultado.movimientos,
      paginacion: {
        pagina,
        limite,
        total: resultado.total,
        totalPaginas: Math.ceil(resultado.total / limite),
      },
    }
  }
}

export const movimientoInventarioService =
  new MovimientoInventarioService()
