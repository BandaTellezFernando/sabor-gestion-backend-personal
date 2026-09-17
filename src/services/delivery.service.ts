//src/services/delivery.service.ts
import Pedido from '../models/Pedido'
import Usuario from '../models/Usuario'

const ESTADOS_ACTIVOS_DELIVERY = ['Pendiente_de_Aceptacion', 'Repartidor_Esperando', 'En_Transito']

export const MAX_PEDIDOS_REPARTIDOR = 5

export async function contarPedidosActivosRepartidor(repartidorId: string): Promise<number> {
  return Pedido.countDocuments({
    repartidorId,
    estado: { $in: ESTADOS_ACTIVOS_DELIVERY }
  })
}

export async function buscarRepartidorDisponible(): Promise<any | null> {
  const repartidores = await Usuario.find({
    rol: 'repartidor',
    estado: true,
    isAvailable: true
  }).sort({ updatedAt: 1 })

  for (const repartidor of repartidores) {
    const pedidosActivos = await contarPedidosActivosRepartidor(String(repartidor._id))
    if (pedidosActivos < MAX_PEDIDOS_REPARTIDOR) {
      return repartidor
    }
  }

  return null
}

export async function asignarRepartidorDisponible(pedidoId: string): Promise<any | null> {
  const repartidor = await buscarRepartidorDisponible()
  if (!repartidor) return null

  return Pedido.findByIdAndUpdate(
    pedidoId,
    {
      repartidorId: repartidor._id,
      estado: 'Pendiente_de_Aceptacion'
    },
    { returnDocument: 'after' }
  )
    .populate('detalles.plato', 'nombre precio')
    .populate('usuario', 'nombre apellido')
    .populate('repartidorId', 'nombre apellido')
}
