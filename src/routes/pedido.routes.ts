// src/routes/pedido.routes.ts
import { Router } from 'express'
import {
  cancelarPedido,
  crearPedido,
  obtenerPedidos,
  actualizarEstadoPedido,
  actualizarPedido,
  obtenerPedidosPendientesCobro,
  solicitarCuentaPedido
} from '../controllers/pedido.controller'
import { verificarToken } from '../middlewares/auth.middleware'

const router = Router()

// Crear un nuevo pedido (Mesero)
router.post('/', verificarToken, crearPedido)

// Listar todos los pedidos (Cocina / Admin)
router.get('/', verificarToken, obtenerPedidos)

// Obtener pedidos pendientes de cobro para Cajero
router.get('/pendientes-cobro', verificarToken, obtenerPedidosPendientesCobro)

// Solicitar cuenta de un pedido (Mesero -> Cajero)
router.patch('/:id/solicitar-cuenta', verificarToken, solicitarCuentaPedido)

// Actualizar contenido de un pedido existente (Añadir más platos)
router.put('/:id', verificarToken, actualizarPedido)

// Actualizar el estado del pedido: "Por hacer" -> "Cocinando" -> "Listos" (Cocina)
router.patch('/:id/estado', verificarToken, actualizarEstadoPedido)

// Cancelar un pedido y liberar la mesa
router.patch('/:id/cancel', verificarToken, cancelarPedido)

export default router
