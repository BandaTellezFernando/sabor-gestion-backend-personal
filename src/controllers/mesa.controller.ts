// src/controllers/mesa.controller.ts
import {
  mesaFusionService,
  MesaFusionServiceError
} from '../services/mesaFusion.service'

import type { ResultadoFusionMesa } from '../services/mesaFusion.service'
import { Request, Response } from 'express'
import { CustomRequest } from '../middlewares/auth.middleware'
import { mesaService, MesaServiceError } from '../services/mesa.service'
import {
  mesaOcupacionService,
  MesaOcupacionServiceError
} from '../services/mesaOcupacion.service'
import { getIO } from '../socket/socket'
import { ESTADOS_FUSION_MESA } from '../utils/constants'

export const crearMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const resultado = await mesaService.crearMesa(req.body)

    try {
      getIO().to('room:mesas').emit('mesas:created', resultado)
    } catch (e) {
      console.warn('Socket error', e)
    }

    res.status(201).json(resultado)
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al crear la mesa:', error)
    res.status(500).json({ mensaje: 'Error al crear la mesa' })
  }
}

export const obtenerMesas = async (req: Request, res: Response): Promise<void> => {
  try {
    const location = req.query.location ? String(req.query.location) : undefined
    const mesas = await mesaService.obtenerMesas(location)
    res.status(200).json(mesas)
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al obtener las mesas:', error)
    res.status(500).json({ mensaje: 'Error al obtener las mesas' })
  }
}

export const obtenerMesaPorId = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const mesa = await mesaService.obtenerMesaPorId(id)
    res.status(200).json(mesa)
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al obtener la mesa:', error)
    res.status(500).json({ mensaje: 'Error al obtener la mesa' })
  }
}

export const actualizarMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const mesaActualizada = await mesaService.actualizarMesa(id, req.body)

    try {
      getIO().to('room:mesas').emit('mesas:updated', mesaActualizada)
    } catch (e) {
      console.warn('Error al emitir mesas:updated en actualizarMesa:', e)
    }

    res.status(200).json(mesaActualizada)
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al actualizar la mesa:', error)
    res.status(500).json({ mensaje: 'Error al actualizar la mesa' })
  }
}

export const actualizarEstadoMesa = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const { estado } = req.body
    const usuarioAuthId = req.usuario?.id
    const usuarioRol = req.usuario?.rol
    const mesaActualizada = await mesaService.actualizarEstadoMesa(
      id,
      estado,
      usuarioAuthId,
      usuarioRol
    )

    try {
      getIO().to('room:mesas').emit('mesas:updated', mesaActualizada)
    } catch (e) {
      console.warn('Error al emitir mesas:updated en actualizarEstadoMesa:', e)
    }

    res.status(200).json(mesaActualizada)
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al actualizar estado:', error)
    res.status(500).json({ mensaje: 'Error al actualizar estado' })
  }
}

export const ocuparMesaTemporal = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const usuarioId = req.usuario?.id
    if (!usuarioId) {
      res.status(401).json({ mensaje: 'Usuario no autenticado' })
      return
    }

    const resultado = await mesaOcupacionService.ocuparMesaTemporal(id, usuarioId)
    res.status(201).json(resultado)
  } catch (error: any) {
    if (error instanceof MesaOcupacionServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al ocupar mesa temporalmente:', error)
    res.status(500).json({ mensaje: 'Error al ocupar mesa temporalmente' })
  }
}

export const cancelarOcupacionTemporal = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id)
    const usuarioId = req.usuario?.id
    const usuarioRol = req.usuario?.rol || ''
    if (!usuarioId) {
      res.status(401).json({ mensaje: 'Usuario no autenticado' })
      return
    }

    const resultado = await mesaOcupacionService.cancelarOcupacionTemporal(
      id,
      usuarioId,
      usuarioRol
    )
    res.status(200).json(resultado)
  } catch (error: any) {
    if (error instanceof MesaOcupacionServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al cancelar ocupación temporal:', error)
    res.status(500).json({ mensaje: 'Error al cancelar ocupación temporal' })
  }
}

export const consultarOcupacionTemporal = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id)
    const usuarioId = req.usuario?.id
    const usuarioRol = req.usuario?.rol

    const resultado = await mesaOcupacionService.consultarOcupacionTemporal(
      id,
      usuarioId,
      usuarioRol
    )
    res.status(200).json(resultado)
  } catch (error: any) {
    if (error instanceof MesaOcupacionServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al consultar ocupación temporal:', error)
    res.status(500).json({ mensaje: 'Error al consultar ocupación temporal' })
  }
}

export const eliminarMesa = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id)
    const mesaEliminada = await mesaService.eliminarMesa(id)

    try {
      getIO().to('room:mesas').emit('mesas:deleted', mesaEliminada)
    } catch (e) {
      console.warn('Error al emitir mesas:deleted en eliminarMesa:', e)
    }

    res.status(200).json({ mensaje: 'Mesa eliminada', mesa: mesaEliminada })
  } catch (error: any) {
    if (error instanceof MesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message })
      return
    }
    console.error('Error al eliminar mesa:', error)
    res.status(500).json({ mensaje: 'Error al eliminar mesa' })
  }
}
/**
 * Emite las actualizaciones de mesas después de completar
 * correctamente la transacción de fusión.
 */
function emitirActualizacionFusion(
  resultado: ResultadoFusionMesa
): void {
  try {
    const io = getIO()

    const mesaPrincipal = mesaService.mapMesa(resultado.mesa)

    const mesas = resultado.mesasActualizadas
      .map((documento) => mesaService.mapMesa(documento))
      .filter((mesa) => mesa !== null)

    const emitirEliminacion = (
      mesa: NonNullable<typeof mesaPrincipal>
    ): void => {
      io.to('room:mesas').emit('mesas:deleted', {
        id: mesa.id,
        _id: mesa._id,
        mesa
      })
    }

    const esFusionHistorica =
      mesaPrincipal !== null &&
      mesaPrincipal !== undefined &&
      (
        mesaPrincipal.estadoFusion === ESTADOS_FUSION_MESA.DISUELTA ||
        mesaPrincipal.estadoFusion === ESTADOS_FUSION_MESA.CANCELADA
      )

    // La fusión principal se crea, actualiza o retira
    // según su estado estructural final.
    if (mesaPrincipal) {
      if (esFusionHistorica) {
        emitirEliminacion(mesaPrincipal)
      } else if (
        mesaPrincipal.estadoFusion === ESTADOS_FUSION_MESA.FUSIONADA
      ) {
        if (resultado.accion === 'ampliada') {
          io.to('room:mesas').emit('mesas:updated', mesaPrincipal)
        } else {
          io.to('room:mesas').emit('mesas:created', mesaPrincipal)
        }
      } else {
        io.to('room:mesas').emit('mesas:updated', mesaPrincipal)
      }
    }

    // Las mesas integradas desaparecen de la vista operativa.
    // Las originales restauradas deben volver a incorporarse.
    for (const mesa of mesas) {
      if (mesa.id === mesaPrincipal?.id) continue

      if (mesa.estadoFusion === ESTADOS_FUSION_MESA.INTEGRADA) {
        emitirEliminacion(mesa)
      } else if (
        mesa.estadoFusion === ESTADOS_FUSION_MESA.INDIVIDUAL
      ) {
        io.to('room:mesas').emit('mesas:created', mesa)
      } else if (
        mesa.estadoFusion === ESTADOS_FUSION_MESA.DISUELTA ||
        mesa.estadoFusion === ESTADOS_FUSION_MESA.CANCELADA
      ) {
        emitirEliminacion(mesa)
      } else {
        io.to('room:mesas').emit('mesas:updated', mesa)
      }
    }

    io.to('room:mesas').emit('mesas:fusion_actualizada', {
      accion: resultado.accion,
      mesa: mesaPrincipal,
      mesas
    })
  } catch (error) {
    // Una falla en Socket.IO no deshace una operación confirmada.
    console.warn(
      'La operación de fusión finalizó, pero falló la notificación:',
      error
    )
  }
}

/**
 * Une mesas individuales libres o amplía una fusión existente.
 */
export const unirMesas = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const resultado = await mesaFusionService.unirMesas(req.body)

    emitirActualizacionFusion(resultado)

    res.status(201).json({
      mensaje:
        resultado.accion === 'ampliada'
          ? 'La fusión de mesas se amplió correctamente.'
          : 'Las mesas se fusionaron correctamente.',
      accion: resultado.accion,
      mesa: mesaService.mapMesa(resultado.mesa),
      mesas: resultado.mesasActualizadas
        .map((documento) => mesaService.mapMesa(documento))
        .filter((mesa) => mesa !== null)
    })
  } catch (error: unknown) {
    if (error instanceof MesaFusionServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message
      })
      return
    }

    console.error('Error al unir mesas:', error)
    res.status(500).json({
      mensaje: 'Error interno al unir las mesas.'
    })
  }
}

/**
 * Cancela una fusión que nunca tuvo pedidos asociados.
 */
export const cancelarFusionMesa = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const resultado = await mesaFusionService.cancelarFusion(
      String(req.params.id)
    )

    emitirActualizacionFusion(resultado)

    res.status(200).json({
      mensaje: 'La fusión se canceló correctamente.',
      accion: resultado.accion,
      mesa: mesaService.mapMesa(resultado.mesa),
      mesas: resultado.mesasActualizadas
        .map((documento) => mesaService.mapMesa(documento))
        .filter((mesa) => mesa !== null)
    })
  } catch (error: unknown) {
    if (error instanceof MesaFusionServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message
      })
      return
    }

    console.error('Error al cancelar la fusión:', error)
    res.status(500).json({
      mensaje: 'Error interno al cancelar la fusión.'
    })
  }
}

/**
 * Separa una fusión que tuvo pedidos y ya no tiene actividad pendiente.
 */
export const separarFusionMesa = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const resultado = await mesaFusionService.separarFusion(
      String(req.params.id)
    )

    emitirActualizacionFusion(resultado)

    res.status(200).json({
      mensaje: 'Las mesas originales se restauraron correctamente.',
      accion: resultado.accion,
      mesa: mesaService.mapMesa(resultado.mesa),
      mesas: resultado.mesasActualizadas
        .map((documento) => mesaService.mapMesa(documento))
        .filter((mesa) => mesa !== null)
    })
  } catch (error: unknown) {
    if (error instanceof MesaFusionServiceError) {
      res.status(error.statusCode).json({
        mensaje: error.message
      })
      return
    }

    console.error('Error al separar la fusión:', error)
    res.status(500).json({
      mensaje: 'Error interno al separar las mesas.'
    })
  }
}
