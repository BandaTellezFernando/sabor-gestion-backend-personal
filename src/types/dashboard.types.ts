// src/types/dashboard.types.ts
import { Types } from 'mongoose'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRATOS HTTP FORMALES (DTOs de Salida para el Frontend)
 * Representan exactamente la respuesta del endpoint GET /api/dashboard/resumen
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Indicadores Clave de Rendimiento (KPIs) del día actual
 */
export interface KPIsDashboard {
  ventasHoy: number
  ordenesHoy: number
  clientesEstimados: number
  mesasActivas: number
  ocupacionPorcentaje: number
}

/**
 * Información de los platos más vendidos
 * Nota: El contrato HTTP expone 'imagen' (mapeado desde 'imagenUrl' del modelo Plato)
 */
export interface PlatoPopularDTO {
  nombre: string
  cantidad: number
  imagen: string
}

/**
 * Información de popularidad por categoría de platos
 */
export interface CategoriaPopularDTO {
  nombre: string
  pedidos: number
  porcentaje: number
}

/**
 * Resumen de orden reciente para la tabla del dashboard
 * Nota: 'estado' contiene la etiqueta traducida para visualización en frontend
 */
export interface OrdenRecienteDTO {
  id: string
  mesa: string
  hora: string
  estado: string
  total: number
}

/**
 * Estructura de respuesta completa del endpoint GET /api/dashboard/resumen
 */
export interface ResumenDashboardDTO {
  kpis: KPIsDashboard
  platosMasVendidos: PlatoPopularDTO[]
  categoriasPopulares: CategoriaPopularDTO[]
  ordenesRecientes: OrdenRecienteDTO[]
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TIPOS RAW PARA REPOSITORIO (Resultados intermedios de consultas y agregaciones)
 * Permiten tipar las operaciones de MongoDB antes de su transformación a DTOs
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Resultado crudo de la agregación de ventas y órdenes del día
 */
export interface VentasHoyRaw {
  totalVentas: number
  totalOrdenes: number
}

/**
 * Resultado crudo de la agregación de top platos más vendidos
 */
export interface PlatoPopularRaw {
  _id: Types.ObjectId
  cantidadVendida: number
  datosPlato: {
    nombre: string
    imagenUrl: string
  }
}

/**
 * Resultado crudo de la agregación de categorías populares
 */
export interface CategoriaPopularRaw {
  _id: string
  totalPedidos: number
}

/**
 * Estructura de la mesa poblada en las órdenes recientes
 */
export interface MesaOrdenRecienteRaw {
  _id: Types.ObjectId
  numero: string
}

/**
 * Estructura requerida de la orden reciente poblada desde MongoDB
 */
export interface OrdenRecienteRaw {
  _id: Types.ObjectId
  codigo: string
  mesa?: MesaOrdenRecienteRaw | null
  fechaHora: Date
  estado: string
  total: number
}
