// src/services/dashboard.service.ts
import {
  DashboardRepository,
  dashboardRepository
} from '../repositories/dashboard.repo'
import {
  ResumenDashboardDTO,
  KPIsDashboard,
  PlatoPopularDTO,
  CategoriaPopularDTO,
  OrdenRecienteDTO,
  VentasHoyRaw,
  PlatoPopularRaw,
  CategoriaPopularRaw,
  OrdenRecienteRaw
} from '../types/dashboard.types'

/**
 * Error de dominio tipado para operaciones del módulo Dashboard
 */
export class DashboardServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'DashboardServiceError'
  }
}

/**
 * Servicio de lógica de negocio, cálculo de KPIs y transformaciones DTO para el Dashboard
 */
export class DashboardService {
  constructor(
    private dashboardRepo: DashboardRepository = dashboardRepository
  ) {}

  /**
   * Traduce los estados crudos de la base de datos a etiquetas de visualización para frontend
   */
  private traducirEstado(estadoBD: string): string {
    switch (estadoBD) {
      case 'ABIERTO':
        return 'Pendiente'
      case 'EN_PREPARACION':
        return 'En preparación'
      case 'ENTREGADO':
        return 'Completada'
      case 'CERRADO':
        return 'Completada'
      case 'CANCELADO':
        return 'Cancelada'
      default:
        return estadoBD
    }
  }

  /**
   * Obtiene el resumen general del Dashboard orquestando las consultas al repositorio,
   * calculando KPIs financieros y operativos, y formateando los DTOs de salida.
   */
  async obtenerResumen(): Promise<ResumenDashboardDTO> {
    // 1. Rango temporal: Hoy (00:00:00 a 23:59:59)
    const inicioHoy = new Date()
    inicioHoy.setHours(0, 0, 0, 0)

    const finHoy = new Date()
    finHoy.setHours(23, 59, 59, 999)

    // 2. Consultas en paralelo a través del DashboardRepository
    const [
      statsHoy,
      mesasActivas,
      platosPopulares,
      categoriasPopulares,
      ordenesRecientes,
      totalMesasBD
    ] = await Promise.all([
      this.dashboardRepo.obtenerVentasYOrdenesDia(inicioHoy, finHoy),
      this.dashboardRepo.contarMesasActivas(),
      this.dashboardRepo.obtenerPlatosMasVendidos(5),
      this.dashboardRepo.obtenerCategoriasPopulares(),
      this.dashboardRepo.obtenerOrdenesRecientes(5),
      this.dashboardRepo.contarTotalMesas()
    ])

    // 3. Procesamiento y cálculo de porcentajes para categorías populares
    const totalVentasCategorias = categoriasPopulares.reduce(
      (acc, cat) => acc + cat.totalPedidos,
      0
    )
    const categoriasFormateadas: CategoriaPopularDTO[] = categoriasPopulares.map((cat) => ({
      nombre: cat._id,
      pedidos: cat.totalPedidos,
      porcentaje:
        totalVentasCategorias > 0
          ? Math.round((cat.totalPedidos / totalVentasCategorias) * 100)
          : 0
    }))

    // 4. Formatear y calcular KPIs
    const resumen: VentasHoyRaw = statsHoy || { totalVentas: 0, totalOrdenes: 0 }
    const totalMesas = totalMesasBD > 0 ? totalMesasBD : 1 // Previene división por cero

    const kpis: KPIsDashboard = {
      ventasHoy: resumen.totalVentas,
      ordenesHoy: resumen.totalOrdenes,
      clientesEstimados: resumen.totalOrdenes * 2,
      mesasActivas: mesasActivas,
      ocupacionPorcentaje: Math.round((mesasActivas / totalMesas) * 100)
    }

    // 5. Formatear Platos más vendidos
    const platosMasVendidos: PlatoPopularDTO[] = platosPopulares.map((p) => ({
      nombre: p.datosPlato?.nombre || '',
      cantidad: p.cantidadVendida,
      imagen: p.datosPlato?.imagenUrl || ''
    }))

    // 6. Formatear Órdenes recientes
    const ordenesFormateadas: OrdenRecienteDTO[] = ordenesRecientes.map((o) => ({
      id: o.codigo,
      mesa: o.mesa?.numero || 'Barra/Llevar',
      hora: o.fechaHora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      estado: this.traducirEstado(o.estado),
      total: o.total
    }))

    return {
      kpis,
      platosMasVendidos,
      categoriasPopulares: categoriasFormateadas,
      ordenesRecientes: ordenesFormateadas
    }
  }
}

export const dashboardService = new DashboardService()
