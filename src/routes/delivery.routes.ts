import { Router } from 'express'
import {
  updateDeliveryStatus,
  getDeliveryQueue,
  updateOrderState,
  acceptOrder,
  rejectOrder
} from '../controllers/delivery.controller'

import { verificarToken } from '../middlewares/auth.middleware'
import { permitirRoles } from '../middlewares/rol.middleware'

const router = Router()

router.use(verificarToken)
router.use(permitirRoles('repartidor'))

router.put('/status', updateDeliveryStatus)
router.get('/queue', getDeliveryQueue)
router.put('/orders/:id/accept', acceptOrder)
router.put('/orders/:id/reject', rejectOrder)
router.put('/orders/:id/state', updateOrderState)

export default router
