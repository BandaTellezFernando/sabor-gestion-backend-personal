import { Response } from 'express';
import { CustomRequest } from '../middlewares/auth.middleware';
import {
  CuentaMesaServiceError,
  cuentaMesaService,
} from '../services/cuentaMesa.service';
import { ICuentaMesa } from '../models/CuentaMesa';
import { getIO } from '../socket/socket';
import { mesaService } from '../services/mesa.service';

function serializarCuenta(cuenta: ICuentaMesa): Record<string, unknown> {
  const datosCuenta = cuenta.toObject();
  // El token QR nunca debe incluirse en las respuestas autenticadas de Caja.
  delete datosCuenta.qrToken;
  return datosCuenta;
}

export const listarCuentasPendientes = async (
  _req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    const cuentas = await cuentaMesaService.listarCuentasPendientes();
    res.status(200).json({ cuentas: cuentas.map(serializarCuenta) });
  } catch (error: unknown) {
    console.error('Error al listar cuentas pendientes:', error);
    res.status(500).json({ mensaje: 'Error al consultar las cuentas pendientes.' });
  }
};

export const crearCuentaPorMesa = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    const mesaId = String(req.params.mesaId ?? '');
    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      res.status(401).json({ mensaje: 'Usuario no autenticado.' });
      return;
    }

    const cuenta = await cuentaMesaService.crearCuentaPorMesa(mesaId, usuarioId);
    const cuentaPublica = serializarCuenta(cuenta);

    // La persistencia ya finalizó. Una falla de Socket.IO no revierte la cuenta.
    try {
      const io = getIO();
      const aviso = {
        cuentaId: String(cuenta._id),
        codigoCuenta: cuenta.codigoCuenta,
        mesaId,
      };
      io.to('room:caja').emit('caja:nueva_cuenta', aviso);
      io.to('room:caja').emit('caja:solicitud_pago', aviso);

      const mesa = await mesaService.obtenerMesaPorId(mesaId);
      io.to('room:mesas').emit('mesas:updated', mesa);
    } catch (socketError: unknown) {
      console.warn('La cuenta se creó, pero falló una notificación Socket.IO:', socketError);
    }

    res.status(200).json({
      mensaje: 'Cuenta de mesa disponible correctamente.',
      cuenta: cuentaPublica,
    });
  } catch (error: unknown) {
    if (error instanceof CuentaMesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message });
      return;
    }

    console.error('Error al crear la cuenta de mesa:', error);
    res.status(500).json({ mensaje: 'Error interno al crear la cuenta de mesa.' });
  }
};

export const obtenerCuentaMesaPorId = async (
  req: CustomRequest,
  res: Response,
): Promise<void> => {
  try {
    const cuenta = await cuentaMesaService.obtenerCuentaPorId(String(req.params.id ?? ''));
    res.status(200).json({ cuenta: serializarCuenta(cuenta) });
  } catch (error: unknown) {
    if (error instanceof CuentaMesaServiceError) {
      res.status(error.statusCode).json({ mensaje: error.message });
      return;
    }

    console.error('Error al consultar la cuenta de mesa:', error);
    res.status(500).json({ mensaje: 'Error interno al consultar la cuenta de mesa.' });
  }
};
