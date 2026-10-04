// src/routes/pedido.routes.ts
import { Router } from 'express'
import {
  cancelarPedido,
  crearPedido,
  obtenerPedidos,
  actualizarEstadoPedido,
  actualizarPedido,
  obtenerPedidosPendientesCobro,
  solicitarCuentaPedido,
  marcarPedidoRecogido,
  obtenerPedidosCocina
} from '../controllers/pedido.controller'
import { verificarToken } from '../middlewares/auth.middleware'
import { permitirRoles } from '../middlewares/rol.middleware'

const router = Router()

// Crear un nuevo pedido (Mesero, Administrador)
router.post('/', verificarToken, permitirRoles('Mesero', 'Administrador'), crearPedido)

// Listar pedidos según rol (Administrador: supervisión; Mesero: propios; Cocinero: comanda operativa)
router.get(
  '/',
  verificarToken,
  permitirRoles('Administrador', 'Mesero', 'Cocinero'),
  obtenerPedidos
)

// Obtener pedidos operativos para Cocina (Cocinero, Administrador)
router.get(
  '/cocina',
  verificarToken,
  permitirRoles('Cocinero', 'Administrador'),
  obtenerPedidosCocina
)

// Obtener pedidos pendientes de cobro para Cajero (Cajero, Administrador)
router.get(
  '/pendientes-cobro',
  verificarToken,
  permitirRoles('Cajero', 'Administrador'),
  obtenerPedidosPendientesCobro
)

// Solicitar cuenta de un pedido (Mesero, Administrador)
router.patch(
  '/:id/solicitar-cuenta',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  solicitarCuentaPedido
)

// Marcar pedido como recogido por el mesero (Mesero, Administrador)
router.patch(
  '/:id/recoger',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  marcarPedidoRecogido
)

// Actualizar contenido de un pedido existente (Mesero, Administrador)
router.put('/:id', verificarToken, permitirRoles('Mesero', 'Administrador'), actualizarPedido)

// Actualizar el estado del pedido: "Por hacer" -> "Cocinando" -> "Listos" (Cocinero, Administrador)
router.patch(
  '/:id/estado',
  verificarToken,
  permitirRoles('Cocinero', 'Administrador'),
  actualizarEstadoPedido
)

// Cancelar un pedido y liberar la mesa (Mesero, Administrador)
router.patch(
  '/:id/cancel',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  cancelarPedido
)

export default router
