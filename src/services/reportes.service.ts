import {
  ReportesRepository,
  reportesRepository
} from '../repositories/reportes.repo'
import type {
  RangoReportePagos,
  EvolucionDiariaReporte,
  TotalMetodoPagoReporte,
  TotalCajeroReporte,
  ProductoReporte,
  CategoriaReporte
} from '../repositories/reportes.repo'
import {
  obtenerFechaISO_Bolivia,
  obtenerRangoInclusivoBolivia
} from '../utils/fechaBolivia'

export interface ParametrosReportePeriodo {
  desde?: string
  hasta?: string
}

export interface PeriodoReporteDTO {
  desde: string | null
  hasta: string
}

export interface RespuestaReporteDTO<T> {
  periodo: PeriodoReporteDTO
  sinDatos: boolean
  advertencia: string | null
  datos: T
}

export interface DatosReporteVentas {
  totalCobrado: number
  cantidadOperaciones: number
  operacionesConPropina: number
  operacionesSinPropina: number
  evolucionDiaria: EvolucionDiariaReporte[]
}

export interface DatosReporteProductos {
  productos: ProductoReporte[]
  categorias: CategoriaReporte[]
}

export class ReportesServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'ReportesServiceError'
  }
}

export class ReportesService {
  constructor(
    private reportesRepo: ReportesRepository = reportesRepository
  ) {}

  private resolverPeriodo(params: ParametrosReportePeriodo): {
    rango: RangoReportePagos
    periodo: PeriodoReporteDTO
  } {
    const desde = params.desde?.trim() || undefined
    const hasta = params.hasta?.trim() || obtenerFechaISO_Bolivia()

    try {
      const rangoHasta = obtenerRangoInclusivoBolivia(hasta, hasta)
      let rango: RangoReportePagos = {
        hastaExclusivo: rangoHasta.hastaExclusivo
      }

      if (desde) {
        const rangoCompleto = obtenerRangoInclusivoBolivia(desde, hasta)
        rango = {
          desde: rangoCompleto.desde,
          hastaExclusivo: rangoCompleto.hastaExclusivo
        }
      }

      return {
        rango,
        periodo: {
          desde: desde ?? null,
          hasta
        }
      }
    } catch (error: unknown) {
      throw new ReportesServiceError(
        400,
        error instanceof Error
          ? error.message
          : 'El período de fechas no es válido.'
      )
    }
  }

  private construirRespuesta<T>(
    periodo: PeriodoReporteDTO,
    datos: T,
    sinDatos: boolean
  ): RespuestaReporteDTO<T> {
    return {
      periodo,
      sinDatos,
      advertencia: sinDatos
        ? 'No se encontraron pagos cobrados para el período seleccionado.'
        : null,
      datos
    }
  }

  async obtenerReporteVentas(
    params: ParametrosReportePeriodo
  ): Promise<RespuestaReporteDTO<DatosReporteVentas>> {
    const { rango, periodo } = this.resolverPeriodo(params)

    const [resumen, evolucionDiaria] = await Promise.all([
      this.reportesRepo.obtenerResumenVentas(rango),
      this.reportesRepo.obtenerEvolucionDiaria(rango)
    ])

    return this.construirRespuesta(
      periodo,
      {
        ...resumen,
        evolucionDiaria
      },
      resumen.cantidadOperaciones === 0
    )
  }

  async obtenerReporteMetodosPago(
    params: ParametrosReportePeriodo
  ): Promise<RespuestaReporteDTO<TotalMetodoPagoReporte[]>> {
    const { rango, periodo } = this.resolverPeriodo(params)
    const datos = await this.reportesRepo.obtenerTotalesPorMetodoPago(rango)

    return this.construirRespuesta(periodo, datos, datos.length === 0)
  }

  async obtenerReporteCajeros(
    params: ParametrosReportePeriodo
  ): Promise<RespuestaReporteDTO<TotalCajeroReporte[]>> {
    const { rango, periodo } = this.resolverPeriodo(params)
    const datos = await this.reportesRepo.obtenerTotalesPorCajero(rango)

    return this.construirRespuesta(periodo, datos, datos.length === 0)
  }

  async obtenerReporteProductos(
    params: ParametrosReportePeriodo
  ): Promise<RespuestaReporteDTO<DatosReporteProductos>> {
    const { rango, periodo } = this.resolverPeriodo(params)
    const datos = await this.reportesRepo.obtenerProductosYCategorias(rango)
    const sinDatos =
      datos.productos.length === 0 && datos.categorias.length === 0

    return this.construirRespuesta(periodo, datos, sinDatos)
  }
}

export const reportesService = new ReportesService()
