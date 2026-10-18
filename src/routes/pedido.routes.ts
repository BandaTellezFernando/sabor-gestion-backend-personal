// src/routes/pedido.routes.ts
import { Router } from 'express'
import {
  cancelarPedido,
  cancelarTandaPedido,
  crearPedido,
  crearTandaPedido,
  enviarTandaCocina,
  actualizarEstadoTandaCocina,
  obtenerPedidos,
  obtenerPedidoPorId,
  actualizarEstadoPedido,
  actualizarPedido,
  obtenerPedidosPendientesCobro,
  solicitarCuentaPedido,
  marcarPedidoRecogido,
  marcarTandaEntregada,
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

// Agregar una tanda en borrador a una cuenta abierta.
router.post(
  '/:id/tandas',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  crearTandaPedido
)

// Enviar una tanda en borrador a cocina (Mesero, Administrador).
router.post(
  '/:id/tandas/:tandaId/enviar',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  enviarTandaCocina
)

// Avanzar una tanda en cocina (Cocinero, Administrador).
router.patch(
  '/:id/tandas/:tandaId/estado',
  verificarToken,
  permitirRoles('Cocinero', 'Administrador'),
  actualizarEstadoTandaCocina
)

// Recoger una tanda que ya está lista (Mesero, Administrador).
router.patch(
  '/:id/tandas/:tandaId/recoger',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  marcarTandaEntregada
)

// Cancelar una tanda solo antes de que comience la preparación.
router.patch(
  '/:id/tandas/:tandaId/cancelar',
  verificarToken,
  permitirRoles('Mesero', 'Administrador'),
  cancelarTandaPedido
)

// Obtener un pedido específico por ID (Administrador, Mesero, Cocinero, Cajero según RBAC)
router.get(
  '/:id',
  verificarToken,
  permitirRoles('Administrador', 'Mesero', 'Cocinero', 'Cajero'),
  obtenerPedidoPorId
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
