// src/controllers/dashboard.controller.ts
import { Request, Response } from 'express'
import { dashboardService, DashboardServiceError } from '../services/dashboard.service'
import { ResumenDashboardDTO } from '../types/dashboard.types'

/**
 * Controlador HTTP para el módulo Dashboard.
 * Recibe la solicitud HTTP, delega la orquestación y lógica a DashboardService y retorna el DTO estructurado.
 */
export const obtenerResumenDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const resumen: ResumenDashboardDTO = await dashboardService.obtenerResumen()
    res.status(200).json(resumen)
  } catch (error) {
    if (error instanceof DashboardServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    const err = error as Error
    res
      .status(500)
      .json({ mensaje: 'Error al generar el resumen del Dashboard', error: err.message })
  }
}
