//src/jobs/signalMonitor.ts
import Pedido from '../models/Pedido'
import { activeDeliveries, getIO } from '../socket/socket'

export const startSignalMonitor = () => {
  // Se ejecuta cada 1 minuto.
  setInterval(async () => {
    const now = Date.now()
    const TIMEOUT_MS = 5 * 60 * 1000

    for (const [orderId, lastPing] of activeDeliveries.entries()) {
      if (now - lastPing > TIMEOUT_MS) {
        const pedido = await Pedido.findByIdAndUpdate(
          orderId,
          { estado: 'Senal_Debil' },
          { new: true }
        )

        try {
          const io = getIO()
          io.to(orderId).emit('delivery:senal_debil', pedido)
          io.emit('delivery:estado_actualizado', pedido)
        } catch (socketError) {
          console.warn('[Monitor] Senal debil registrada, pero fallo el socket')
        }

        console.warn(`[Monitor] Senal perdida para el pedido: ${orderId}`)
        activeDeliveries.delete(orderId)
      }
    }
  }, 60000)
}
