import 'dotenv/config'
import { strict as assert } from 'node:assert'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import mongoose, { Types } from 'mongoose'
import jwt from 'jsonwebtoken'

import app from '../src/app'
import Usuario from '../src/models/Usuario'

const PREFIJO_DB = 'qa_usuarios_seguridad_http_'
const sufijo = `${Date.now().toString(36)}${process.pid.toString(36)}`
const nombreDB = `${PREFIJO_DB}${sufijo}`
const secretoPruebas = randomBytes(32).toString('hex')

type Rol = 'Administrador' | 'Mesero' | 'Cocinero' | 'Cajero'
type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RespuestaHTTP {
  status: number
  cuerpo: unknown
}

interface CasoRuta {
  nombre: string
  metodo: Metodo
  ruta: string
  permitidos: Rol[]
  cuerpo?: Record<string, unknown>
}

let servidor: ReturnType<typeof createServer> | undefined
let conectado = false
let seguroParaEliminar = false
let totalCorrectas = 0
const fallos: string[] = []
let serie = 0

function comprobar(condicion: unknown, mensaje: string): void {
  assert.ok(condicion, mensaje)
}

function objeto(valor: unknown): Record<string, unknown> {
  comprobar(
    typeof valor === 'object' && valor !== null && !Array.isArray(valor),
    'La respuesta debe ser un objeto JSON'
  )
  return valor as Record<string, unknown>
}

function crearToken(id: Types.ObjectId, rol: Rol): string {
  return jwt.sign(
    { id: id.toString(), rol },
    secretoPruebas,
    { expiresIn: '10m' }
  )
}

const ids: Record<Rol, Types.ObjectId> = {
  Administrador: new Types.ObjectId(),
  Mesero: new Types.ObjectId(),
  Cocinero: new Types.ObjectId(),
  Cajero: new Types.ObjectId()
}

const tokens = {
  Administrador: crearToken(ids.Administrador, 'Administrador'),
  Mesero: crearToken(ids.Mesero, 'Mesero'),
  Cocinero: crearToken(ids.Cocinero, 'Cocinero'),
  Cajero: crearToken(ids.Cajero, 'Cajero')
}

function datosUsuario(
  cambios: Record<string, unknown> = {}
): Record<string, unknown> {
  serie += 1

  return {
    nombre: 'Maria',
    apellido: 'Quispe',
    ci: String(51000000 + serie),
    email: `qa.${sufijo}.${serie}@example.invalid`,
    password: 'Segura123!',
    rol: 'Mesero',
    ...cambios
  }
}

async function peticion(
  metodo: Metodo,
  ruta: string,
  token?: string,
  cuerpo?: unknown
): Promise<RespuestaHTTP> {
  if (!servidor) throw new Error('Servidor de pruebas no iniciado')

  const address = servidor.address() as AddressInfo
  const headers: Record<string, string> = {}

  if (token) headers.Authorization = `Bearer ${token}`
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json'

  const respuesta = await fetch(
    `http://127.0.0.1:${address.port}${ruta}`,
    {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    }
  )

  const texto = await respuesta.text()
  let respuestaCuerpo: unknown = null

  try {
    respuestaCuerpo = texto ? JSON.parse(texto) : null
  } catch {
    respuestaCuerpo = texto
  }

  return { status: respuesta.status, cuerpo: respuestaCuerpo }
}

async function prueba(
  nombre: string,
  ejecutar: () => Promise<void>
): Promise<void> {
  try {
    await ejecutar()
    totalCorrectas += 1
    console.log(`✅ ${nombre}`)
  } catch (error: unknown) {
    const detalle =
      error instanceof Error ? error.message : String(error)

    fallos.push(`${nombre}: ${detalle}`)
    console.error(`❌ ${nombre}: ${detalle}`)
  }
}

function esperarEstado(
  respuesta: RespuestaHTTP,
  esperado: number,
  contexto: string
): void {
  assert.equal(
    respuesta.status,
    esperado,
    `${contexto}; HTTP recibido=${respuesta.status}; respuesta=${JSON.stringify(respuesta.cuerpo)}`
  )
}

async function crearUsuarioDirecto(): Promise<{
  id: string
  email: string
  ci: string
}> {
  const datos = datosUsuario()
  const usuario = await Usuario.create({
    ...datos,
    estado: true,
    verificado: true
  })

  return {
    id: String(usuario._id),
    email: String(datos.email),
    ci: String(datos.ci)
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI

  if (!uri) {
    throw new Error('Configura MONGO_URI o MONGODB_URI para estas pruebas.')
  }

  const jwtAnterior = process.env.JWT_SECRET
  process.env.JWT_SECRET = secretoPruebas

  try {
    await mongoose.connect(uri, {
      dbName: nombreDB,
      serverSelectionTimeoutMS: 15000
    })
    conectado = true

    const baseReal = mongoose.connection.db?.databaseName
    if (baseReal !== nombreDB || !baseReal?.startsWith(PREFIJO_DB)) {
      throw new Error(`Protección: base de datos inesperada (${baseReal}).`)
    }

    seguroParaEliminar = true
    await Usuario.init()

    const db = mongoose.connection.db!
    const roles: Rol[] = [
      'Administrador',
      'Mesero',
      'Cocinero',
      'Cajero'
    ]

    await db.collection('usuarios').insertMany(
      roles.map((rol, indice) => ({
        _id: ids[rol],
        nombre: rol,
        apellido: 'Pruebas',
        ci: String(52000000 + indice),
        email: `${rol.toLowerCase()}.${sufijo}@example.invalid`,
        password: 'hash-de-prueba-no-utilizable',
        rol,
        estado: true,
        verificado: true
      }))
    )

    servidor = createServer(app)
    await new Promise<void>((resolve, reject) => {
      servidor!.once('error', reject)
      servidor!.listen(0, '127.0.0.1', resolve)
    })

    console.log(`✅ Base aislada: ${nombreDB}`)

    // Autenticación y acceso administrativo.
    await prueba('Usuarios: petición sin token devuelve 401', async () => {
      esperarEstado(
        await peticion('GET', '/api/usuarios'),
        401,
        'Sin token'
      )
    })

    await prueba('Usuarios: token inválido devuelve 401', async () => {
      esperarEstado(
        await peticion('GET', '/api/usuarios', 'token-invalido'),
        401,
        'Token inválido'
      )
    })

    await prueba('Administrador puede listar usuarios sin exponer contraseñas', async () => {
      const r = await peticion(
        'GET',
        '/api/usuarios',
        tokens.Administrador
      )

      esperarEstado(r, 200, 'Administrador lista usuarios')
      comprobar(Array.isArray(r.cuerpo), 'Debe devolver una lista')

      const usuarios = r.cuerpo as Array<Record<string, unknown>>
      comprobar(
        usuarios.every((u) => !('password' in u)),
        'No deben exponerse contraseñas'
      )
    })

    // Matriz de permisos: cada rol intenta entrar donde no le corresponde.
    const idDesconocido = new Types.ObjectId().toString()
    const idTandaDesconocida = new Types.ObjectId().toString()

    const rutas: CasoRuta[] = [
      {
        nombre: 'listar usuarios',
        metodo: 'GET',
        ruta: '/api/usuarios',
        permitidos: ['Administrador']
      },
      {
        nombre: 'crear usuarios',
        metodo: 'POST',
        ruta: '/api/usuarios',
        permitidos: ['Administrador'],
        cuerpo: datosUsuario()
      },
      {
        nombre: 'editar usuarios',
        metodo: 'PUT',
        ruta: `/api/usuarios/${ids.Administrador}`,
        permitidos: ['Administrador'],
        cuerpo: {}
      },
      {
        nombre: 'cambiar estado de usuarios',
        metodo: 'PATCH',
        ruta: `/api/usuarios/${ids.Cajero}/estado`,
        permitidos: ['Administrador'],
        cuerpo: { estado: true }
      },
      {
        nombre: 'eliminar usuarios',
        metodo: 'DELETE',
        ruta: `/api/usuarios/${idDesconocido}`,
        permitidos: ['Administrador']
      },
      {
        nombre: 'consultar dashboard',
        metodo: 'GET',
        ruta: '/api/dashboard/resumen',
        permitidos: ['Administrador']
      },
      {
        nombre: 'consultar reportes',
        metodo: 'GET',
        ruta: '/api/reportes/ventas',
        permitidos: ['Administrador']
      },
      {
        nombre: 'crear mesas',
        metodo: 'POST',
        ruta: '/api/mesas',
        permitidos: ['Administrador'],
        cuerpo: { numero: '190', capacidad: 4 }
      },
      {
        nombre: 'editar mesa',
        metodo: 'PUT',
        ruta: `/api/mesas/${idDesconocido}`,
        permitidos: ['Administrador'],
        cuerpo: {}
      },
      {
        nombre: 'crear platos',
        metodo: 'POST',
        ruta: '/api/platos',
        permitidos: ['Administrador'],
        cuerpo: {}
      },
      {
        nombre: 'crear ingredientes',
        metodo: 'POST',
        ruta: '/api/inventario/ingredientes',
        permitidos: ['Administrador'],
        cuerpo: {}
      },
      {
        nombre: 'crear recetas',
        metodo: 'POST',
        ruta: '/api/inventario/recetas',
        permitidos: ['Administrador'],
        cuerpo: {}
      },
      {
        nombre: 'crear categorías',
        metodo: 'POST',
        ruta: '/api/categorias',
        permitidos: ['Administrador'],
        cuerpo: {}
      },
      {
        nombre: 'crear ubicaciones',
        metodo: 'POST',
        ruta: '/api/ubicaciones',
        permitidos: ['Administrador'],
        cuerpo: {}
      },
      {
        nombre: 'subir imágenes de platos',
        metodo: 'POST',
        ruta: '/api/upload',
        permitidos: ['Administrador']
      },
      {
        nombre: 'consultar mesas',
        metodo: 'GET',
        ruta: '/api/mesas',
        permitidos: ['Administrador', 'Mesero']
      },
      {
        nombre: 'ver pedidos generales',
        metodo: 'GET',
        ruta: '/api/pedidos',
        permitidos: ['Administrador', 'Mesero', 'Cocinero']
      },
      {
        nombre: 'ver pedidos de cocina',
        metodo: 'GET',
        ruta: '/api/pedidos/cocina',
        permitidos: ['Administrador', 'Cocinero']
      },
      {
        nombre: 'ver pedidos pendientes de cobro',
        metodo: 'GET',
        ruta: '/api/pedidos/pendientes-cobro',
        permitidos: ['Administrador', 'Cajero']
      },
      {
        nombre: 'consultar inventario',
        metodo: 'GET',
        ruta: '/api/inventario/estado',
        permitidos: ['Administrador', 'Cocinero']
      },
      {
        nombre: 'consultar recetas',
        metodo: 'GET',
        ruta: '/api/inventario/recetas',
        permitidos: ['Administrador', 'Cocinero']
      },
      {
        nombre: 'consultar ubicaciones',
        metodo: 'GET',
        ruta: '/api/ubicaciones',
        permitidos: ['Administrador', 'Mesero']
      },
      {
        nombre: 'crear pedido',
        metodo: 'POST',
        ruta: '/api/pedidos',
        permitidos: ['Administrador', 'Mesero'],
        cuerpo: {}
      },
      {
        nombre: 'crear tanda',
        metodo: 'POST',
        ruta: `/api/pedidos/${idDesconocido}/tandas`,
        permitidos: ['Administrador', 'Mesero'],
        cuerpo: {}
      },
      {
        nombre: 'enviar tanda a cocina',
        metodo: 'POST',
        ruta: `/api/pedidos/${idDesconocido}/tandas/${idTandaDesconocida}/enviar`,
        permitidos: ['Administrador', 'Mesero'],
        cuerpo: {}
      },
      {
        nombre: 'avanzar estado de tanda en cocina',
        metodo: 'PATCH',
        ruta: `/api/pedidos/${idDesconocido}/tandas/${idTandaDesconocida}/estado`,
        permitidos: ['Administrador', 'Cocinero'],
        cuerpo: { estado: 'LISTA' }
      },
      {
        nombre: 'recoger tanda lista',
        metodo: 'PATCH',
        ruta: `/api/pedidos/${idDesconocido}/tandas/${idTandaDesconocida}/recoger`,
        permitidos: ['Administrador', 'Mesero'],
        cuerpo: {}
      },
      {
        nombre: 'cancelar tanda',
        metodo: 'PATCH',
        ruta: `/api/pedidos/${idDesconocido}/tandas/${idTandaDesconocida}/cancelar`,
        permitidos: ['Administrador', 'Mesero'],
        cuerpo: {}
      },
      {
        nombre: 'actualizar estado de pedido en cocina',
        metodo: 'PATCH',
        ruta: `/api/pedidos/${idDesconocido}/estado`,
        permitidos: ['Administrador', 'Cocinero'],
        cuerpo: { estado: 'Listos' }
      },
      {
        nombre: 'consultar pagos',
        metodo: 'GET',
        ruta: '/api/pagos',
        permitidos: ['Administrador', 'Cajero']
      },
      {
        nombre: 'generar QR de cobro',
        metodo: 'POST',
        ruta: `/api/pagos/generar-qr/${idDesconocido}`,
        permitidos: ['Administrador', 'Cajero'],
        cuerpo: {}
      },
      {
        nombre: 'procesar pago',
        metodo: 'POST',
        ruta: `/api/pagos/${idDesconocido}/procesar`,
        permitidos: ['Administrador', 'Cajero'],
        cuerpo: {}
      },
      {
        nombre: 'cerrar caja',
        metodo: 'POST',
        ruta: '/api/cierres-caja',
        permitidos: ['Administrador', 'Cajero'],
        cuerpo: {}
      }
    ]

    for (const caso of rutas) {
      for (const rol of roles) {
        if (caso.permitidos.includes(rol)) continue

        await prueba(
          `RBAC: ${rol} no puede ${caso.nombre}`,
          async () => {
            const r = await peticion(
              caso.metodo,
              caso.ruta,
              tokens[rol],
              caso.cuerpo
            )
            esperarEstado(r, 403, `${rol}: ${caso.nombre}`)
          }
        )
      }
    }

    // Crear al menos una cuenta válida por API.
    let usuarioCreadoId = ''

    await prueba('Alta válida de usuario devuelve 201 y no expone password', async () => {
      const r = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datosUsuario()
      )

      esperarEstado(r, 201, 'Alta válida')
      const cuerpo = objeto(r.cuerpo)
      const usuario = objeto(cuerpo.usuario)
      comprobar(typeof usuario.id === 'string', 'Debe devolver el ID')
      comprobar(!('password' in usuario), 'No debe exponer password')
      usuarioCreadoId = String(usuario.id)
    })

    // Campos obligatorios: null y cadenas vacías.
    for (const campo of [
      'nombre',
      'apellido',
      'ci',
      'email',
      'password',
      'rol'
    ]) {
      await prueba(`Alta: ${campo}=null se rechaza`, async () => {
        const datos = datosUsuario({ [campo]: null })
        const r = await peticion(
          'POST',
          '/api/usuarios',
          tokens.Administrador,
          datos
        )
        esperarEstado(r, 400, `${campo}=null`)
      })

      await prueba(`Alta: ${campo} vacío se rechaza`, async () => {
        const datos = datosUsuario({ [campo]: '' })
        const r = await peticion(
          'POST',
          '/api/usuarios',
          tokens.Administrador,
          datos
        )
        esperarEstado(r, 400, `${campo} vacío`)
      })
    }

    // CI para cuentas: solo dígitos, de 5 a 8 caracteres según la política acordada.

    await prueba('CI numérica corta sin complemento se acepta', async () => {
      const r = await peticion('POST', '/api/usuarios', tokens.Administrador, datosUsuario({ ci: '1234' }))
      esperarEstado(r, 201, 'CI numérica sin mínimo arbitrario')
    })

    await prueba('CI con complemento 1A se acepta', async () => {
      const r = await peticion('POST', '/api/usuarios', tokens.Administrador, datosUsuario({ ci: '4333012', ciComplemento: '1A' }))
      esperarEstado(r, 201, 'CI con complemento')
    })

    await prueba('Mismo CI con complemento diferente se acepta', async () => {
      const r = await peticion('POST', '/api/usuarios', tokens.Administrador, datosUsuario({ ci: '4333012', ciComplemento: '2B' }))
      esperarEstado(r, 201, 'CI con complemento diferente')
    })

    await prueba('Combinación CI + complemento duplicada se rechaza', async () => {
      const r = await peticion('POST', '/api/usuarios', tokens.Administrador, datosUsuario({ ci: '4333012', ciComplemento: '1A' }))
      esperarEstado(r, 400, 'CI y complemento duplicados')
    })

    await prueba('Complemento en minúsculas se normaliza y no duplica identidad', async () => {
      const r = await peticion('POST', '/api/usuarios', tokens.Administrador, datosUsuario({ ci: '4333012', ciComplemento: '1a' }))
      esperarEstado(r, 400, 'Complemento normalizado a mayúsculas')
    })

    await prueba('Complemento mal formado se rechaza', async () => {
      const r = await peticion('POST', '/api/usuarios', tokens.Administrador, datosUsuario({ ci: '4333013', ciComplemento: 'AA' }))
      esperarEstado(r, 400, 'Complemento inválido')
    })

    for (const ci of ['12A456', '12-3456', '123456789012345678901']) {
      await prueba(`Alta: CI inválida ${ci} se rechaza`, async () => {
        const r = await peticion(
          'POST',
          '/api/usuarios',
          tokens.Administrador,
          datosUsuario({ ci })
        )
        esperarEstado(r, 400, `CI=${ci}`)
      })
    }

    // El correo debe tener formato razonable y una longitud máxima de 254 caracteres.
    for (const email of [
      'sin-arroba',
      'persona@',
      '@example.com',
      'persona@dominio',
      'persona@@example.com',
      'persona con espacios@example.com',
      'persona..doble@example.com'
    ]) {
      await prueba(`Alta: email inválido ${email} se rechaza`, async () => {
        const r = await peticion(
          'POST',
          '/api/usuarios',
          tokens.Administrador,
          datosUsuario({ email })
        )
        esperarEstado(r, 400, `Email=${email}`)
      })
    }

    await prueba('Alta: email de 255 caracteres se rechaza', async () => {
      const email = `${'a'.repeat(243)}@example.com`
      comprobar(email.length === 255, 'El caso debe tener 255 caracteres')

      const r = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datosUsuario({ email })
      )
      esperarEstado(r, 400, 'Email de 255 caracteres')
    })

    await prueba('Alta: nombre de 31 caracteres se rechaza', async () => {
      const r = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datosUsuario({ nombre: 'A'.repeat(31) })
      )
      esperarEstado(r, 400, 'Nombre demasiado largo')
    })

    await prueba('Alta: apellido de 31 caracteres se rechaza', async () => {
      const r = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datosUsuario({ apellido: 'B'.repeat(31) })
      )
      esperarEstado(r, 400, 'Apellido demasiado largo')
    })

    await prueba('Alta: nombre con símbolos se rechaza', async () => {
      const r = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datosUsuario({ nombre: 'Maria123!' })
      )
      esperarEstado(r, 400, 'Nombre con símbolos')
    })

    await prueba('Alta: contraseña de 7 caracteres se rechaza', async () => {
      const r = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datosUsuario({ password: 'Abc123!' })
      )
      esperarEstado(r, 400, 'Contraseña corta')
    })

    await prueba('Alta: contraseña superior a 72 bytes se rechaza', async () => {
      const r = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datosUsuario({ password: 'A'.repeat(73) })
      )
      esperarEstado(r, 400, 'Contraseña demasiado larga')
    })

    // Duplicados exactos y por correo normalizado.
    await prueba('Alta: email duplicado con distinta capitalización se rechaza', async () => {
      const datos = datosUsuario()
      const primera = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datos
      )
      esperarEstado(primera, 201, 'Primera cuenta de prueba')

      const segunda = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datosUsuario({
          email: String(datos.email).toUpperCase()
        })
      )
      esperarEstado(segunda, 400, 'Email duplicado por capitalización')
    })

    await prueba('Alta: CI duplicada se rechaza', async () => {
      const datos = datosUsuario()
      const primera = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datos
      )
      esperarEstado(primera, 201, 'Primera cuenta para CI duplicada')

      const segunda = await peticion(
        'POST',
        '/api/usuarios',
        tokens.Administrador,
        datosUsuario({ ci: datos.ci })
      )
      esperarEstado(segunda, 400, 'CI duplicada')
    })

    // Valores inválidos en actualizaciones; se crea un objetivo nuevo por caso
    // para que un fallo no altere el dato base de otra comprobación.
    const cambiosInvalidos: Array<{
      nombre: string
      cambios: Record<string, unknown>
    }> = [
      { nombre: 'nombre nulo', cambios: { nombre: null } },
      { nombre: 'apellido nulo', cambios: { apellido: null } },
      { nombre: 'CI nulo', cambios: { ci: null } },
      { nombre: 'CI demasiado larga', cambios: { ci: '123456789012345678901' } },
      { nombre: 'CI con letras', cambios: { ci: '123AB' } },
      { nombre: 'email nulo', cambios: { email: null } },
      { nombre: 'email mal formado', cambios: { email: 'correo-invalido' } },
      { nombre: 'email demasiado largo', cambios: { email: `${'x'.repeat(243)}@example.com` } },
      { nombre: 'contraseña nula', cambios: { password: null } },
      { nombre: 'contraseña vacía', cambios: { password: '' } },
      { nombre: 'contraseña corta', cambios: { password: '1234567' } },
      { nombre: 'contraseña demasiado larga', cambios: { password: 'Z'.repeat(73) } },
      { nombre: 'rol inválido', cambios: { rol: 'SuperAdministrador' } },
      { nombre: 'nombre demasiado largo', cambios: { nombre: 'M'.repeat(31) } }
    ]

    for (const caso of cambiosInvalidos) {
      await prueba(`Actualización: ${caso.nombre} se rechaza`, async () => {
        const objetivo = await crearUsuarioDirecto()
        const r = await peticion(
          'PUT',
          `/api/usuarios/${objetivo.id}`,
          tokens.Administrador,
          caso.cambios
        )
        esperarEstado(r, 400, caso.nombre)
      })
    }

    if (!usuarioCreadoId) {
      throw new Error('No se pudo obtener ID para las comprobaciones posteriores.')
    }

    await prueba('Usuario no administrador no puede actualizarse a sí mismo', async () => {
      const r = await peticion(
        'PUT',
        `/api/usuarios/${ids.Mesero}`,
        tokens.Mesero,
        { nombre: 'Maria' }
      )
      esperarEstado(r, 403, 'Mesero modifica su propia cuenta')
    })

    await prueba('Usuario no administrador no puede cambiar su propio estado', async () => {
      const r = await peticion(
        'PATCH',
        `/api/usuarios/${ids.Cajero}/estado`,
        tokens.Cajero,
        { estado: true }
      )
      esperarEstado(r, 403, 'Cajero modifica su estado')
    })
  } finally {
    if (servidor) {
      await new Promise<void>((resolve) => servidor!.close(() => resolve()))
    }

    if (conectado && seguroParaEliminar) {
      const db = mongoose.connection.db
      if (
        db?.databaseName === nombreDB &&
        db.databaseName.startsWith(PREFIJO_DB)
      ) {
        await db.dropDatabase()
        console.log(`🧹 Base temporal eliminada: ${nombreDB}`)
      }
    }

    await mongoose.disconnect()

    if (process.env.JWT_SECRET === secretoPruebas) {
      if (jwtAnterior === undefined) delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = jwtAnterior
    }
  }

  console.log(`\n✅ Correctas: ${totalCorrectas}`)
  console.log(`❌ Fallidas: ${fallos.length}`)

  if (fallos.length > 0) {
    console.error('\nFallos detectados:')
    for (const fallo of fallos) console.error(`- ${fallo}`)
    throw new Error(`${fallos.length} comprobaciones fallaron.`)
  }

  console.log('🎉 Todas las comprobaciones de seguridad de usuarios pasaron.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
