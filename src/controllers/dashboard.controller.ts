// src/controllers/dashboard.controller.ts
import { Request, Response } from 'express'
import Pedido from '../models/Pedido'
import Mesa from '../models/Mesa'

export const obtenerResumenDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Rango de tiempo: Hoy (00:00:00 a 23:59:59)
    const inicioHoy = new Date()
    inicioHoy.setHours(0, 0, 0, 0)

    const finHoy = new Date()
    finHoy.setHours(23, 59, 59, 999)

    // 2. Consultas en paralelo para optimizar rendimiento
    const [
      statsHoy,
      mesasActivas,
      platosPopulares,
      categoriasPopulares,
      ordenesRecientes,
      totalMesasBD
    ] = await Promise.all([
      // A. Ventas y cantidad de órdenes de hoy
      Pedido.aggregate([
        {
          $match: {
            createdAt: { $gte: inicioHoy, $lte: finHoy },
            estado: 'CERRADO'
          }
        },
        {
          $group: {
            _id: null,
            totalVentas: { $sum: '$total' },
            totalOrdenes: { $count: {} }
          }
        }
      ]),

      // B. Conteo de mesas activas (No libres)
      Mesa.countDocuments({ estado: { $ne: 'Libre' } }),

      // C. Top 5 Platos más vendidos
      Pedido.aggregate([
        { $match: { estado: 'CERRADO' } },
        { $unwind: '$detalles' },
        {
          $group: {
            _id: '$detalles.plato',
            cantidadVendida: { $sum: '$detalles.cantidad' }
          }
        },
        { $sort: { cantidadVendida: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'platos',
            localField: '_id',
            foreignField: '_id',
            as: 'datosPlato'
          }
        },
        { $unwind: '$datosPlato' }
      ]),

      // D. Categorías más populares (con doble $lookup)
      Pedido.aggregate([
        { $match: { estado: 'CERRADO' } },
        { $unwind: '$detalles' },
        {
          $lookup: {
            from: 'platos',
            localField: 'detalles.plato',
            foreignField: '_id',
            as: 'plato'
          }
        },
        { $unwind: '$plato' },
        {
          $lookup: {
            from: 'categorias',
            localField: 'plato.categoria',
            foreignField: '_id',
            as: 'categoria'
          }
        },
        { $unwind: '$categoria' },
        {
          $group: {
            _id: '$categoria.nombre',
            totalPedidos: { $sum: '$detalles.cantidad' }
          }
        },
        { $sort: { totalPedidos: -1 } }
      ]),

      // E. Órdenes recientes para la tabla inferior
      Pedido.find().sort({ createdAt: -1 }).limit(5).populate('mesa', 'numero'),

      // F. Total de mesas reales registradas
      Mesa.countDocuments()
    ])

    const traducirEstado = (estadoBD: string) => {
      switch (estadoBD) {
        case 'ABIERTO':
          return 'Pendiente'
        case 'EN_PREPARACION':
          return 'En preparación'
        case 'ENTREGADO':
          return 'Completada'
        case 'CERRADO':
          return 'Completada' // O 'Pagado', según decidas
        case 'CANCELADO':
          return 'Cancelada'
        default:
          return estadoBD
      }
    }

    // 3. Procesamiento de porcentajes para categorías
    const totalVentasCategorias = categoriasPopulares.reduce(
      (acc, cat) => acc + cat.totalPedidos,
      0
    )
    const categoriasFormateadas = categoriasPopulares.map((cat) => ({
      nombre: cat._id,
      pedidos: cat.totalPedidos,
      porcentaje:
        totalVentasCategorias > 0 ? Math.round((cat.totalPedidos / totalVentasCategorias) * 100) : 0
    }))

    // 4. Formatear KPIs
    const resumen = statsHoy[0] || { totalVentas: 0, totalOrdenes: 0 }
    const totalMesas = totalMesasBD > 0 ? totalMesasBD : 1 // Dinámico y previene división por cero

    res.status(200).json({
      kpis: {
        ventasHoy: resumen.totalVentas,
        ordenesHoy: resumen.totalOrdenes,
        clientesEstimados: resumen.totalOrdenes * 2, // Estimación simple o basarse en guestCount
        mesasActivas: mesasActivas,
        ocupacionPorcentaje: Math.round((mesasActivas / totalMesas) * 100)
      },
      platosMasVendidos: platosPopulares.map((p) => ({
        nombre: p.datosPlato.nombre,
        cantidad: p.cantidadVendida,
        imagen: p.datosPlato.imagenUrl
      })),
      categoriasPopulares: categoriasFormateadas,
      ordenesRecientes: ordenesRecientes.map((o: any) => ({
        id: o.codigo || `PED-${String(o._id).slice(-4).toUpperCase()}`,
        mesa: (o.mesa as any)?.numero || 'Barra/Llevar',
        hora: o.fechaHora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), // Usamos tu campo fechaHora
        estado: traducirEstado(o.estado), // Usamos el traductor
        total: o.total
      }))
    })
  } catch (error) {
    const err = error as Error
    res
      .status(500)
      .json({ mensaje: 'Error al generar el resumen del Dashboard', error: err.message })
  }
}
