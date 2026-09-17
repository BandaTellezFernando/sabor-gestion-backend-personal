//src/jobs/assignmentTimeout.ts
import Pedido from '../models/Pedido'
import { asignarRepartidorDisponible } from '../services/delivery.service'
import { getIO } from '../socket/socket'

export const startAssignmentTimeout = () => {
  // Se ejecuta cada 30 segundos evaluando pedidos.
  setInterval(async () => {
    const TIMEOUT_MS = 3 * 60 * 1000
    const limiteTiempo = new Date(Date.now() - TIMEOUT_MS)

    try {
      const pedidosExpirados = await Pedido.find({
        estado: 'Pendiente_de_Aceptacion',
        updatedAt: { $lt: limiteTiempo },
        repartidorId: { $ne: null }
      })

      for (const pedido of pedidosExpirados) {
        pedido.repartidorId = undefined
        await pedido.save()

        const pedidoReasignado = await asignarRepartidorDisponible(String(pedido._id))

        try {
          const io = getIO()
          io.to(String(pedido._id)).emit('delivery:asignacion_expirada', pedido)
          io.emit('delivery:pedido_reasignado', pedidoReasignado || pedido)
        } catch (socketError) {
          console.warn('[Timeout] Reasignacion procesada, pero fallo el socket')
        }

        console.log(`[Timeout] Pedido ${pedido._id} procesado por falta de respuesta.`)
      }
    } catch (error) {
      console.error('[Timeout] Error al procesar desvinculaciones de pedidos:', error)
    }
  }, 30000)
}
