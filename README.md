<div align="center">

# SABOR & GESTIÓN

### Backend API RESTful & WebSockets para Gestión Integral Gastronómica

Motor transaccional de alta concurrencia, sincronización de salón en tiempo real y gobierno financiero centralizado para establecimientos gastronómicos.

<br />

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.2.1-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.IO-4.8.3-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![pnpm](https://img.shields.io/badge/pnpm-12.4.2-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io/)

<br />

[![REST API](https://img.shields.io/badge/Arquitectura-REST%20Modular-0052CC?style=flat-square)](#)
[![WebSockets](https://img.shields.io/badge/Tiempo%20Real-Event--Driven-010101?style=flat-square)](#)
[![Security](https://img.shields.io/badge/Seguridad-RBAC%20Estricto-critical?style=flat-square)](#)
[![Auth](https://img.shields.io/badge/Auth-JWT%20%2B%20bcryptjs-F7DF1E?style=flat-square&labelColor=000&color=black)](#)
[![Academic](https://img.shields.io/badge/Base%20Académica-Capítulo%2010-purple?style=flat-square)](#)

<br />

<p align="center">
  <a href="#tabla-de-contenidos"><b>Documentación</b></a> •
  <a href="#1-arquitectura-del-backend"><b>Arquitectura</b></a> •
  <a href="#2-stack-tecnológico"><b>Stack</b></a> •
  <a href="#4-módulos-funcionales-del-backend"><b>Módulos</b></a> •
  <a href="#5-catálogo-de-endpoints-api-reference"><b>Catálogo API</b></a> •
  <a href="#8-instalación-y-puesta-en-marcha"><b>Instalación</b></a> •
  <a href="#10-medidas-de-seguridad-y-reglas-críticas"><b>Seguridad</b></a>
</p>

</div>

---

<details open>
<summary><b>Tabla de Contenidos</b></summary>

- [1. Arquitectura del Backend](#1-arquitectura-del-backend)
  - [1.1. Diagrama Arquitectónico por Capas](#11-diagrama-arquitectónico-por-capas)
  - [1.2. Principio de Separación de Responsabilidades](#12-principio-de-separación-de-responsabilidades)
- [2. Stack Tecnológico](#2-stack-tecnológico)
  - [2.1. Tecnologías Principales](#21-tecnologías-principales)
  - [2.2. Dependencias y Ecosistema de Producción](#22-dependencias-y-ecosistema-de-producción)
- [3. Base de Datos y Modelo de Dominio](#3-base-de-datos-y-modelo-de-dominio)
  - [3.1. Conexión Persistente a MongoDB Atlas](#31-conexión-persistente-a-mongodb-atlas)
  - [3.2. Colecciones del Sistema](#32-colecciones-del-sistema)
  - [3.3. Especificación Detallada de los 11 Modelos Mongoose](#33-especificación-detallada-de-los-11-modelos-mongoose)
- [4. Módulos Funcionales del Backend](#4-módulos-funcionales-del-backend)
  - [M01 — Autenticación y control de acceso](#m01--autenticación-y-control-de-acceso)
  - [M02 — Administración de empleados](#m02--administración-de-empleados)
  - [M03 — Gestión de categorías y menú](#m03--gestión-de-categorías-y-menú)
  - [M04 — Disponibilidad culinaria e ingredientes](#m04--disponibilidad-culinaria-e-ingredientes)
  - [M05 — Ubicaciones y mesas](#m05--ubicaciones-y-mesas)
  - [M06 — Gestión de pedidos](#m06--gestión-de-pedidos)
  - [M07 — Preparación y seguimiento de pedidos](#m07--preparación-y-seguimiento-de-pedidos)
  - [M08 — Gestión de pagos y cierre de cuentas](#m08--gestión-de-pagos-y-cierre-de-cuentas)
  - [M09 — Comprobantes y pagos QR](#m09--comprobantes-y-pagos-qr)
  - [M10 — Cierre de caja y dashboard](#m10--cierre-de-caja-y-dashboard)
- [5. Catálogo de Endpoints (API Reference)](#5-catálogo-de-endpoints-api-reference)
  - [5.1. Health Check](#51-health-check)
  - [5.2. Autenticación y Usuarios](#52-autenticación-y-usuarios)
  - [5.3. Categorías, Menú y Subida de Archivos](#53-categorías-menú-y-subida-de-archivos)
  - [5.4. Inventario Culinario y Recetas](#54-inventario-culinario-y-recetas)
  - [5.5. Ubicaciones y Mesas](#55-ubicaciones-y-mesas)
  - [5.6. Comandas y Pedidos](#56-comandas-y-pedidos)
  - [5.7. Pagos y Cobro](#57-pagos-y-cobro)
  - [5.8. Dashboard Gerencial](#58-dashboard-gerencial)
- [6. Ciclo de Vida y Flujo Operativo](#6-ciclo-de-vida-y-flujo-operativo)
  - [6.1. Diagrama de Secuencia Operativo](#61-diagrama-de-secuencia-operativo)
  - [6.2. Máquina de Estados Canónicos del Dominio](#62-máquina-de-estados-canónicos-del-dominio)
- [7. WebSockets en Tiempo Real (Socket.IO)](#7-websockets-en-tiempo-real-socketio)
  - [7.1. Topología de Salas y Handshake JWT](#71-topología-de-salas-y-handshake-jwt)
  - [7.2. Catálogo de Eventos Reales](#72-catálogo-de-eventos-reales)
- [8. Instalación y Puesta en Marcha](#8-instalación-y-puesta-en-marcha)
- [9. Variables de Entorno](#9-variables-de-entorno)
- [10. Medidas de Seguridad y Reglas Críticas](#10-medidas-de-seguridad-y-reglas-críticas)
- [11. Servicios Externos Integrados](#11-servicios-externos-integrados)
- [12. Calidad de Código y Pruebas](#12-calidad-de-código-y-pruebas)
- [13. Despliegue y Operación](#13-despliegue-y-operación)
- [14. Diagnóstico de Problemas (Troubleshooting)](#14-diagnóstico-de-problemas-troubleshooting)
- [15. Referencias y Documentación Relacionada](#15-referencias-y-documentación-relacionada)

</details>

---

## 1. Arquitectura del Backend

El sistema implementa una **Arquitectura en Cuatro Capas Concéntricas** desacoplada mediante inyección de dependencias y tipado estricto en TypeScript. Esta estructura garantiza el aislamiento total de la lógica de negocio frente a los protocolos de transporte (HTTP / WebSockets) y a la capa de persistencia (MongoDB).

### 1.1. Diagrama Arquitectónico por Capas

```mermaid
flowchart TB
    Consumer["Cliente HTTP / Consumidor API"]
    SocketConsumer["Terminal WebSocket (Mesero / Cocina / Caja)"]

    subgraph RED ["1. Capa de Red y Protocolo"]
        Router["Enrutadores Express (src/routes)"]
        WSServer["Servidor Socket.IO (src/socket)"]
    end

    subgraph SEGURIDAD ["2. Capa de Middlewares y Seguridad"]
        AuthMW["verificarToken (JWT HMAC-SHA256)"]
        RoleMW["permitirRoles / soloAdmins (RBAC)"]
        UploadMW["Multer (MemoryStorage 5MB)"]
    end

    subgraph CONTROLADORES ["3. Capa de Controladores (src/controllers)"]
        UserController["usuario.controller"]
        OrderController["pedido.controller"]
        PaymentController["pago.controller"]
        MenuController["plato / categoria.controller"]
        InventoryController["inventario.controller"]
        TableController["mesa / ubicacion.controller"]
        DashboardController["dashboard.controller"]
    end

    subgraph SERVICIOS ["4. Capa de Servicios de Dominio (src/services)"]
        UserService["usuario.service"]
        OrderService["pedido.service (Máquina de Estados)"]
        PaymentService["pago.service (Transacción Atómica)"]
        InventoryService["inventario.service (Validación Culinaria)"]
        TableService["mesa.service / ubicacion.service"]
        DashboardService["dashboard.service (Pipelines Agregación)"]
        EmailService["email.service (EmailJS REST)"]
    end

    subgraph REPOSITORIOS ["5. Capa de Persistencia y Repositorios (src/repositories)"]
        Repos["Clases Repository (Query Builders, runValidators: true)"]
    end

    subgraph MODELOS ["6. Capa de Modelos Mongoose (src/models)"]
        Models["11 Esquemas Documentales Fuertemente Tipados"]
        MongoDB[("MongoDB Atlas")]
    end

    Consumer --> Router
    SocketConsumer <--> WSServer
    Router --> AuthMW
    AuthMW --> RoleMW
    RoleMW --> UploadMW
    UploadMW --> CONTROLADORES
    CONTROLADORES --> SERVICIOS
    SERVICIOS -. Notificaciones y Eventos .-> WSServer
    SERVICIOS --> REPOSITORIOS
    REPOSITORIOS --> MODELOS
    MODELOS --> MongoDB

    classDef redStyle fill:#f0f7ff,stroke:#0969da,stroke-width:1.5px,color:#0969da;
    classDef secStyle fill:#fff8c5,stroke:#9a6700,stroke-width:1.5px,color:#9a6700;
    classDef ctrlStyle fill:#f6f8fa,stroke:#57606a,stroke-width:1.5px,color:#24292f;
    classDef srvStyle fill:#fbefff,stroke:#8250df,stroke-width:1.5px,color:#8250df;
    classDef dbStyle fill:#dafbe1,stroke:#1a7f37,stroke-width:1.5px,color:#1a7f37;

    class Router,WSServer redStyle;
    class AuthMW,RoleMW,UploadMW secStyle;
    class UserController,OrderController,PaymentController,MenuController,InventoryController,TableController,DashboardController ctrlStyle;
    class UserService,OrderService,PaymentService,InventoryService,TableService,DashboardService,EmailService srvStyle;
    class Repos,Models,MongoDB dbStyle;
```

### 1.2. Principio de Separación de Responsabilidades

| Capa | Ubicación | Responsabilidad Técnica |
| :--- | :--- | :--- |
| **Rutas y Middlewares** | `src/routes/`, `src/middlewares/` | Exposición de endpoints REST, intercepción de peticiones, validación de token JWT y autorización RBAC. |
| **Controladores** | `src/controllers/` | Desempaquetado de `req.params` / `req.body`, sanitización sintáctica y estandarización de respuestas HTTP. |
| **Servicios** | `src/services/` | Autoridad sobre reglas de negocio, transiciones de estado, cálculo financiero autoritativo y emisión de sockets. |
| **Repositorios** | `src/repositories/` | Abstracción de acceso a datos, encapsulación de consultas Mongoose y aseguramiento de `runValidators: true`. |
| **Modelos** | `src/models/` | Definición de esquemas documentales, índices compuestos, enums y relaciones foráneas. |

---

## 2. Stack Tecnológico

### 2.1. Tecnologías Principales

<div align="center">

<a href="https://skillicons.dev">
  <img src="https://skillicons.dev/icons?i=ts,nodejs,express,mongodb,pnpm" alt="Tecnologías Nucleares del Backend" />
</a>

</div>

### 2.2. Dependencias y Ecosistema de Producción

Todas las herramientas y librerías declaradas corresponden rigurosamente a las dependencias reales extraídas de `package.json`:

| Componente | Versión | Rol en el Sistema | Tipo |
| :--- | :---: | :--- | :--- |
| **Node.js** | `>=20.x` | Entorno de ejecución asíncrono sobre el motor V8 | Runtime |
| **TypeScript** | `^5.0.0` | Tipado estático, interfaces de contrato y compilación | Lenguaje |
| **Express** | `^5.2.1` | Framework HTTP para enrutamiento y middlewares | Framework Web |
| **MongoDB Atlas** | `>=6.0` | Clúster de base de datos NoSQL documental | Persistencia |
| **Mongoose** | `^9.3.1` | ODM para modelado, validaciones e índices | ODM |
| **Socket.IO** | `^4.8.3` | Comunicación bidireccional cliente-servidor en tiempo real | WebSockets |
| **jsonwebtoken** | `^9.0.3` | Generación y verificación de tokens de sesión stateless | Criptografía / Auth |
| **bcryptjs** | `^3.0.3` | Hashing seguro de credenciales con 10 rondas de salt | Criptografía |
| **Cloudinary** | `^2.9.0` | CDN y almacenamiento en la nube para fotos de platos | Servicio Externo |
| **Multer** | `^2.1.1` | Procesamiento de peticiones `multipart/form-data` en buffer | Manejo Archivos |
| **Cors** | `^2.8.6` | Control de orígenes cruzados para terminales autorizadas | Seguridad HTTP |
| **Morgan** | `^1.10.1` | Logger de peticiones y tiempos de respuesta en consola | Observabilidad |
| **Dotenv** | `^17.3.1` | Inyección segura de variables de entorno de ejecución | Configuración |
| **pnpm** | `12.4.2` | Gestor de paquetes rápido con almacenamiento por enlaces duros | Package Manager |
| **tsx** | `^4.21.0` | Ejecutor de TypeScript moderno para desarrollo rápido | Tooling Dev |
| **nodemon** | `^3.1.14` | Monitoreo y recarga automática del servidor en desarrollo | Tooling Dev |
| **ts-node** | `^10.9.2` | Motor de ejecución TypeScript para scripts de seed | Tooling Dev |
| **ESLint** | `^8.0.0` | Linter para cumplimiento de directrices de estilo | Calidad de Código |
| **Prettier** | `^3.0.0` | Formateador consistente de sintaxis de código | Calidad de Código |

---

## 3. Base de Datos y Modelo de Dominio

### 3.1. Conexión Persistente a MongoDB Atlas

El backend se conecta a MongoDB Atlas mediante Mongoose en [`src/configs/db.ts`](file:///home/fercho/Software/sabor-gestion-backend-personal/src/configs/db.ts).

```typescript
import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

export const connectDB = async () => {
  try {
    const dbUri = process.env.MONGO_URI
    if (!dbUri) {
      throw new Error('La variable de entorno MONGO_URI no está definida.')
    }

    const conn = await mongoose.connect(dbUri)
    console.log(`Base de Datos MongoDB Conectada: ${conn.connection.name}`)
  } catch (error) {
    console.error(`Error conectando a MongoDB: ${error}`)
    process.exit(1)
  }
}
```

### 3.2. Colecciones del Sistema

El clúster almacena 11 colecciones estrictamente modeladas en `src/models/`:

1. `usuarios`: Empleados del restaurante, credenciales encriptadas con bcrypt, roles y estado booleano.
2. `categorias`: Familias o grupos del menú gastronómico (Entradas, Segundos, Bebidas, etc.).
3. `platos`: Catálogo de productos, precios oficiales, foto en Cloudinary y disponibilidad booleana.
4. `ingredientes`: Insumos de cocina con unidad de medida y disponibilidad booleana.
5. `recetas`: Relación que vincula cada plato con su lista de ingredientes requeridos.
6. `ubicaciones`: Zonas físicas del establecimiento (Salón Principal, Terraza, Barra, VIP).
7. `mesas`: Mesas por ubicación con número único por sector y estado operativo (`Libre`, `Ocupada`, `Cuenta Solicitada`).
8. `pedidos`: Comandas activas e históricas con correlativo `PED-XXXX`, detalles congelados, estados y totales.
9. `pagos`: Transacciones financieras registradas con método (`Efectivo`, `QR`, `Tarjeta`), descuento, propina y estado.
10. `cierrecajas`: Arqueos financieros de turnos de cajeros con desglose de métodos de cobro.
11. `contadores`: Secuencias atómicas para emisión correlativa de identificadores de comandas (`PED-XXXX`).

### 3.3. Especificación Detallada de los 11 Modelos Mongoose (`src/models/`)

| Modelo | Archivo Fuente | Colección | Campos Principales y Tipos | Enums / Restricciones / Relaciones |
| :--- | :--- | :--- | :--- | :--- |
| **`Usuario`** | `Usuario.ts` | `usuarios` | `nombre`, `apellido`, `ci`, `username`, `password`, `rol`, `email`, `estado` (boolean) | `rol`: `'Administrador'`, `'Mesero'`, `'Cocinero'`, `'Cajero'`. Hash con bcryptjs. Índice único en `username`. |
| **`Categoria`** | `Categoria.ts` | `categorias` | `nombre`, `descripcion` | Índice único en `nombre`. Agrupador del menú gastronómico. |
| **`Plato`** | `Plato.ts` | `platos` | `nombre`, `precio`, `categoria` (ObjectId), `imagenUrl`, `imagenPublicId`, `disponible` (boolean) | `precio >= 0`. `ref: 'Categoria'`. Disponibilidad por booleano. |
| **`Ingrediente`** | `Ingrediente.ts` | `ingredientes` | `nombre`, `unidadMedida`, `disponible` (boolean) | `unidadMedida`: `'gr'`, `'kg'`, `'ml'`, `'lt'`, `'unidad'`, `'porcion'`. Índice único en `nombre`. |
| **`Receta`** | `Receta.ts` | `recetas` | `platoId` (ObjectId), `ingredientes` (Array: `{ ingredienteId, cantidadRequerida, opcional }`) | `ref: 'Plato'` (único), `ref: 'Ingrediente'`. Base del motor de validación de disponibilidad culinaria. |
| **`Ubicacion`** | `Ubicacion.ts` | `ubicaciones` | `nombre`, `name` (legacy sync), `descripcion` | Índice único en `nombre`. Zonas del restaurante (Salón Principal, Terraza, etc.). |
| **`Mesa`** | `Mesa.ts` | `mesas` | `numero`, `capacidad`, `ubicacion` (string), `ubicacionId` (ObjectId), `estado` | `estado`: `'Libre'`, `'Ocupada'`, `'Cuenta Solicitada'`. `ref: 'Ubicacion'`. |
| **`Pedido`** | `Pedido.ts` | `pedidos` | `codigo` (`PED-XXXX`), `fechaDiaBolivia`, `fechaHora`, `estado`, `total`, `mesa` (ObjectId), `usuario` (ObjectId), `detalles`, `subtotalCierre`, `montoDescuento`, `montoPropina`, `metodoPago`, `cajeroAsignado` | `estado`: `'ABIERTO'`, `'EN_PREPARACION'`, `'ENTREGADO'`, `'CANCELADO'`, `'CERRADO'`. `detalles`: Array con `plato`, `cantidad`, `precioUnitario`, `subtotal`, `observacion`. Índice `{ fechaDiaBolivia, codigo }`. |
| **`Pago`** | `Pago.ts` | `pagos` | `codigoPago` (`PAG-XXXXXX`), `codigoPedido`, `pedido` (ObjectId), `mesa` (ObjectId), `mesero` (ObjectId), `cajero` (ObjectId), `subtotal`, `descuento`, `propina`, `totalFinal`, `metodoPago`, `estadoPago` | `metodoPago`: `'Efectivo'`, `'QR'`, `'Tarjeta'`. `estadoPago`: `'Pendiente'`, `'Procesado'`, `'Pagado'`, `'Anulado'`. Transacción atómica Mongoose. |
| **`CierreCaja`** | `CierreCaja.ts` | `cierrecajas` | `cajeroId`, `cajeroNombre`, `totalDia`, `efectivo`, `tarjeta`, `qr`, `descuentos`, `propinas`, `pagosProcesados`, `fechaCierre`, `fechaCierreBolivia` | Arqueo financiero de turnos de cajeros. Índice en `fechaCierre`. |
| **`Contador`** | `Contador.ts` | `contadores` | `nombre_secuencia` (string), `secuencia` (number) | Generador atómico de correlativos diarios para comandas (`PED-XXXX`). |

---

## 4. Módulos Funcionales del Backend

---

### M01 — Autenticación y control de acceso

**Responsabilidad**
Validación de identidad de los empleados y emisión de credenciales de sesión stateless firmadas criptográficamente.

**Tecnologías / Componentes**
[![JWT](https://img.shields.io/badge/JWT-Tokens%20HS256-black?style=flat-square&logo=jsonwebtokens)](https://jwt.io/)
[![bcryptjs](https://img.shields.io/badge/bcryptjs-10%20Salt%20Rounds-0052cc?style=flat-square)](https://github.com/dcodeIO/bcrypt.js)

**Endpoints Principales**
```http
POST /api/usuarios/login
```

**Flujo de Capas**
`Routes` → `Controller` → `Service` → `Repository` → `Model (Usuario)`

**Reglas Críticas**
- Contraseñas almacenadas exclusivamente como hashes irreversibles.
- Tokens con vigencia de 8 horas continuas.
- Verificación de usuario habilitado (`estado === true`).

---

### M02 — Administración de empleados

**Responsabilidad**
Gestión integral del personal del restaurante, control de roles y arqueo automático de cierre de turnos de caja.

**Tecnologías / Componentes**
[![RBAC](https://img.shields.io/badge/RBAC-Control%20Roles-purple?style=flat-square)](#)
[![Mongoose](https://img.shields.io/badge/Mongoose-Esquema%20Usuario-47A248?style=flat-square&logo=mongodb&logoColor=white)](#)

**Endpoints Principales**
```http
GET    /api/usuarios
POST   /api/usuarios
PUT    /api/usuarios/:id
PATCH  /api/usuarios/:id/estado
DELETE /api/usuarios/:id
```

**Flujo de Capas**
`Routes` → `Middleware (verificarToken, soloAdmins)` → `Controller` → `Service` → `Repository` → `Model (Usuario, CierreCaja)`

**Reglas Críticas**
- Regla de negocio que prohíbe eliminar o suspender al último cajero activo del sistema.
- Registro automático en `CierreCaja` si se envía reporte financiero al desactivar un cajero.

---

### M03 — Gestión de categorías y menú

**Responsabilidad**
Estructuración del catálogo gastronómico, control de precios oficiales y subida de imágenes de platos.

**Tecnologías / Componentes**
[![Cloudinary](https://img.shields.io/badge/Cloudinary-CDN%20Imágenes-3448C5?style=flat-square&logo=cloudinary&logoColor=white)](https://cloudinary.com/)
[![Multer](https://img.shields.io/badge/Multer-Memory%20Storage-orange?style=flat-square)](#)

**Endpoints Principales**
```http
GET    /api/categorias
POST   /api/categorias
PUT    /api/categorias/:id
DELETE /api/categorias/:id
GET    /api/platos
GET    /api/platos/:id
POST   /api/platos
PUT    /api/platos/:id
DELETE /api/platos/:id
POST   /api/upload
```

**Flujo de Capas**
`Routes` → `Middleware (Multer / verificarToken)` → `Controller` → `Service` → `Repository` → `Model (Categoria, Plato)`

**Reglas Críticas**
- Carga de imágenes en memoria temporal antes de la transmisión por streaming a Cloudinary.
- Control de disponibilidad mediante el campo booleano `disponible` en `Plato` (no existe enum "Agotado").

---

### M04 — Disponibilidad culinaria e ingredientes

**Responsabilidad**
Validación preventiva de viabilidad técnica de comandas en función del estado de los insumos y recetas asociadas.

**Tecnologías / Componentes**
[![Engine](https://img.shields.io/badge/Engine-Validación%20Culinaria-teal?style=flat-square)](#)
[![Mongoose](https://img.shields.io/badge/Mongoose-Receta%20%2B%20Ingrediente-47A248?style=flat-square&logo=mongodb&logoColor=white)](#)

**Endpoints Principales**
```http
GET    /api/inventario/estado
GET    /api/inventario/ingredientes
POST   /api/inventario/ingredientes
PUT    /api/inventario/ingredientes/:id
DELETE /api/inventario/ingredientes/:id
GET    /api/inventario/recetas
POST   /api/inventario/recetas
DELETE /api/inventario/recetas/:id
```

**Flujo de Capas**
`Routes` → `Middleware (verificarToken, soloAdmins)` → `Controller` → `Service (validarDisponibilidadIngredientes)` → `Repository` → `Model (Ingrediente, Receta)`

**Reglas Críticas**
- Exclusión semántica automática: si una observación solicita *"sin cebolla"*, el motor culinario omite la validación de ese insumo.
- Modelo de disponibilidad cualitativo/booleano (sin kardex numérico).

---

### M05 — Ubicaciones y mesas

**Responsabilidad**
Administración del plano físico del establecimiento y control de ocupación de mesas en tiempo real.

**Tecnologías / Componentes**
[![Socket.io](https://img.shields.io/badge/Socket.IO-Eventos%20Salón-010101?style=flat-square&logo=socket.io&logoColor=white)](#)
[![Validation](https://img.shields.io/badge/Validator-runValidators%3A%20true-blue?style=flat-square)](#)

**Endpoints Principales**
```http
GET    /api/ubicaciones
POST   /api/ubicaciones
PUT    /api/ubicaciones/:id
DELETE /api/ubicaciones/:id
GET    /api/mesas
GET    /api/mesas/:id
POST   /api/mesas
PUT    /api/mesas/:id
PATCH  /api/mesas/:id/estado
DELETE /api/mesas/:id
```

**Flujo de Capas**
`Routes` → `Middleware (verificarToken, permitirRoles)` → `Controller` → `Service` → `Repository` → `Model (Ubicacion, Mesa)`

**Reglas Críticas**
- Estados válidos en base de datos: `Libre`, `Ocupada`, `Cuenta Solicitada`.
- Validación estricta con `runValidators: true` que rechaza estados inválidos con HTTP 400.
- Emisión inmediata de eventos `mesas:updated` a través de WebSockets.

---

### M06 — Gestión de pedidos

**Responsabilidad**
Registro de órdenes, fijación de precios unitarios oficiales, control de observaciones y seguimiento de comensales.

**Tecnologías / Componentes**
[![Atomic](https://img.shields.io/badge/Atomic-PED--XXXX%20Secuencial-darkblue?style=flat-square)](#)
[![Socket.io](https://img.shields.io/badge/Socket.IO-cocina%3Anuevo__pedido-010101?style=flat-square&logo=socket.io&logoColor=white)](#)

**Endpoints Principales**
```http
POST   /api/pedidos
GET    /api/pedidos
GET    /api/pedidos/pendientes-cobro
PUT    /api/pedidos/:id
PATCH  /api/pedidos/:id/solicitar-cuenta
PATCH  /api/pedidos/:id/cancel
```

**Flujo de Capas**
`Routes` → `Middleware (verificarToken, permitirRoles)` → `Controller` → `Service` → `Repository` → `Model (Pedido, Contador, Mesa)`

**Reglas Críticas**
- **Creación:** Generación correlativa atómica `PED-XXXX`, precios congelados de `Plato` y mesa transiciona a `Ocupada`.
- **Modificación:** `PUT /api/pedidos/:id` recalcula importes en backend. Si el pedido estaba en `ENTREGADO`, se reabre automáticamente a `ABIERTO` y la mesa vuelve a `Ocupada`.
- **Cancelación:** Solo permitida en `ABIERTO` o `EN_PREPARACION`, liberando la mesa a `Libre`.
- **Solicitud de Cuenta:** Pasa la mesa a `Cuenta Solicitada` y emite `caja:solicitud_pago`.

---

### M07 — Preparación y seguimiento de pedidos

**Responsabilidad**
Orquestación de órdenes en los fogones y despacho de avisos operacionales en tiempo real hacia los meseros.

**Tecnologías / Componentes**
[![State Machine](https://img.shields.io/badge/State%20Machine-Cocina%20Estricta-orange?style=flat-square)](#)
[![Alert](https://img.shields.io/badge/WebSocket-mesas%3Aalerta__listo-critical?style=flat-square)](#)

**Endpoints Principales**
```http
PATCH /api/pedidos/:id/estado
```

**Flujo de Capas**
`Routes` → `Middleware (verificarToken, permitirRoles('Cocinero', 'Administrador'))` → `Controller` → `Service` → `Repository` → `Model (Pedido)`

**Reglas Críticas**
- Máquina de estados estricta en cocina: `ABIERTO` $ightarrow$ `EN_PREPARACION` $ightarrow$ `ENTREGADO`.
- Al transicionar a `ENTREGADO`, se emite la alerta sonora hacia `room:meseros` (`mesas:alerta_listo`).
- El estado `CERRADO` no pertenece a cocina; se asigna en Caja al procesar el pago.

---

### M08 — Gestión de pagos y cierre de cuentas

**Responsabilidad**
Liquidación monetaria autoritativa, aplicación de descuentos/propinas, registro del pago y liberación de mesa.

**Tecnologías / Componentes**
[![Transactions](https://img.shields.io/badge/MongoDB-Transacción%20Atómica-47A248?style=flat-square&logo=mongodb&logoColor=white)](#)
[![Authority](https://img.shields.io/badge/Finance-Autoridad%20Server--side-blue?style=flat-square)](#)

**Endpoints Principales**
```http
GET  /api/pedidos/pendientes-cobro
POST /api/pagos/:pedidoId/procesar
```

**Flujo de Capas**
`Routes` → `Middleware (verificarToken, permitirRoles('Cajero', 'Administrador'))` → `Controller` → `Service` → `Repository` → `Model (Pedido, Pago, Mesa)`

**Reglas Críticas**
- El backend recalcula el subtotal oficial del pedido a partir de sus detalles e ignora cualquier `subtotalCierre` inyectado en el body.
- Fórmula financiera estricta: `total = subtotal - descuento + propina`.
- Transacción atómica Mongoose: asienta el `Pago` en estado `Pagado`, transiciona el `Pedido` a `CERRADO` y libera la `Mesa` a `Libre`.

---

### M09 — Comprobantes y pagos QR

**Responsabilidad**
Generación de códigos QR, confirmación simulada pedagógica y despacho de recibos por correo electrónico.

**Tecnologías / Componentes**
[![QRServer](https://img.shields.io/badge/QRServer-API%20Pública-black?style=flat-square)](#)
[![EmailJS](https://img.shields.io/badge/EmailJS-REST%20API-ea580c?style=flat-square)](https://www.emailjs.com/)

**Endpoints Principales**
```http
POST /api/pagos/generar-qr/:pedidoId
POST /api/pagos/notificar-qr/:pedidoId
POST /api/pagos/:pedidoId/enviar-recibo
```

**Flujo de Capas**
`Routes` → `Controller` → `Service` → `External Services (QRServer, EmailJS)`

**Reglas Críticas**
- `POST /api/pagos/notificar-qr/:pedidoId` es un webhook público de simulación/notificación pedagógica que alerta a caja vía WebSockets pero **NO** constituye por sí solo el procesamiento financiero definitivo.
- El despacho de recibos compila una plantilla HTML y la remite mediante EmailJS REST API.

---

### M10 — Cierre de caja y dashboard

**Responsabilidad**
Arqueo de turnos de empleados y analítica agregada de indicadores de rendimiento en tiempo real.

**Tecnologías / Componentes**
[![Aggregation](https://img.shields.io/badge/Aggregation-Pipelines%20MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)](#)
[![Dashboard](https://img.shields.io/badge/Analytics-8%20KPIs%20Gerenciales-purple?style=flat-square)](#)

**Endpoints Principales**
```http
GET /api/dashboard/resumen
```

**Flujo de Capas**
`Routes` → `Middleware (verificarToken, soloAdmins)` → `Controller` → `Service` → `Repository` → `Model (CierreCaja, Pago, Pedido, Mesa, Usuario)`

**Reglas Críticas**
- Cálculo analítico de los 8 KPIs gerenciales: Ventas Totales, Pedidos Totales, Ticket Promedio, Métodos de Pago, Platos Populares, Horas Pico, Ocupación de Mesas y Rendimiento por Empleado.

---

## 5. Catálogo de Endpoints (API Reference)

Catálogo completo y verificado de las **47 rutas HTTP reales** montadas en el backend:

### 5.1. Health Check

| Método | Endpoint | Acceso / Roles | Descripción |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/health` | Público | Verificación del estado de salud y disponibilidad del servidor |

```json
{
  "status": "success",
  "message": "API de Sabor & Gestión funcionando correctamente 🚀"
}
```

### 5.2. Autenticación y Usuarios

| Método | Endpoint | Acceso / Roles | Descripción |
| :---: | :--- | :--- | :--- |
| `POST` | `/api/usuarios/login` | Público | Autenticación de personal y emisión de token JWT (8h) |
| `GET` | `/api/usuarios` | Autenticado | Lista completa de empleados registrados (activos e inactivos) |
| `POST` | `/api/usuarios` | `Administrador` | Registro de nuevos colaboradores con credenciales y rol |
| `PUT` | `/api/usuarios/:id` | `Administrador` | Actualización de información de usuario o reasignación de rol |
| `PATCH` | `/api/usuarios/:id/estado` | `Administrador`, `Cajero` | Desactivación/activación de usuario con balance en `CierreCaja` |
| `DELETE` | `/api/usuarios/:id` | `Administrador` | Baja física de empleado con verificación de último cajero |

### 5.3. Categorías, Menú y Subida de Archivos

| Método | Endpoint | Acceso / Roles | Descripción |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/categorias` | Público | Consulta del listado de categorías del menú |
| `POST` | `/api/categorias` | `Administrador` | Creación de una nueva categoría en la carta |
| `PUT` | `/api/categorias/:id` | `Administrador` | Modificación del nombre o descripción de la categoría |
| `DELETE` | `/api/categorias/:id` | `Administrador` | Eliminación de una categoría |
| `GET` | `/api/platos` | Público | Catálogo general de platos con precios y disponibilidad |
| `GET` | `/api/platos/:id` | Autenticado | Detalle técnico e ingredientes asociados a un plato |
| `POST` | `/api/platos` | `Administrador` | Creación de nuevo plato con precio oficial y foto previa |
| `PUT` | `/api/platos/:id` | `Administrador` | Actualización de plato o conmutación del booleano `disponible` |
| `DELETE` | `/api/platos/:id` | `Administrador` | Eliminación de un plato del menú |
| `POST` | `/api/upload` | `Administrador` | Subida multipart de imagen (`imagen`) hacia Cloudinary |

### 5.4. Inventario Culinario y Recetas

| Método | Endpoint | Acceso / Roles | Descripción |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/inventario/estado` | Autenticado | Resumen general de disponibilidad de ingredientes |
| `GET` | `/api/inventario/ingredientes` | Autenticado | Lista de insumos de cocina con unidad de medida |
| `POST` | `/api/inventario/ingredientes` | `Administrador` | Registro de nuevo ingrediente |
| `PUT` | `/api/inventario/ingredientes/:id` | `Administrador` | Actualización de insumo o cambio de disponibilidad |
| `DELETE` | `/api/inventario/ingredientes/:id` | `Administrador` | Eliminación de ingrediente |
| `GET` | `/api/inventario/recetas` | Autenticado | Lista de recetas que vinculan platos con sus insumos |
| `POST` | `/api/inventario/recetas` | `Administrador` | Definición o actualización de escandallo de preparación |
| `DELETE` | `/api/inventario/recetas/:id` | `Administrador` | Eliminación de receta |

### 5.5. Ubicaciones y Mesas

| Método | Endpoint | Acceso / Roles | Descripción |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/ubicaciones` | Autenticado | Listado de áreas físicas del restaurante |
| `POST` | `/api/ubicaciones` | `Administrador` | Alta de nueva zona (ej. Terraza, VIP) |
| `PUT` | `/api/ubicaciones/:id` | `Administrador` | Actualización de nombre de zona |
| `DELETE` | `/api/ubicaciones/:id` | `Administrador` | Eliminación de zona física |
| `GET` | `/api/mesas` | Autenticado | Lista de mesas con capacidad y estado operativo |
| `GET` | `/api/mesas/:id` | Autenticado | Consulta de mesa específica por identificador |
| `POST` | `/api/mesas` | `Administrador` | Creación de mesa asociada a una ubicación |
| `PUT` | `/api/mesas/:id` | `Administrador` | Modificación de capacidad o ubicación de mesa |
| `PATCH` | `/api/mesas/:id/estado` | `Mesero`, `Administrador` | Transición estricta de estado (`Libre`, `Ocupada`, `Cuenta Solicitada`) |
| `DELETE` | `/api/mesas/:id` | `Administrador` | Eliminación de mesa |

### 5.6. Comandas y Pedidos

| Método | Endpoint | Acceso / Roles | Descripción |
| :---: | :--- | :--- | :--- |
| `POST` | `/api/pedidos` | `Mesero`, `Administrador` | Apertura de comanda `PED-XXXX`, valida insumos y congela precios |
| `GET` | `/api/pedidos` | Autenticado | Búsqueda de pedidos con filtros por fecha, mesa o estado |
| `GET` | `/api/pedidos/pendientes-cobro` | `Cajero`, `Administrador` | Consulta de comandas en mesas con cuenta solicitada |
| `PUT` | `/api/pedidos/:id` | `Mesero`, `Administrador` | Adición de platos a comanda activa con recálculo autoritativo |
| `PATCH` | `/api/pedidos/:id/estado` | `Cocinero`, `Administrador` | Avance de estado en fogones (`EN_PREPARACION`, `ENTREGADO`) |
| `PATCH` | `/api/pedidos/:id/solicitar-cuenta` | `Mesero`, `Administrador` | Pasa mesa a `Cuenta Solicitada` y emite `caja:solicitud_pago` |
| `PATCH` | `/api/pedidos/:id/cancel` | `Mesero`, `Administrador` | Cancelación de comanda no procesada y liberación de mesa |

### 5.7. Pagos y Cobro

| Método | Endpoint | Acceso / Roles | Descripción |
| :---: | :--- | :--- | :--- |
| `POST` | `/api/pagos/generar-qr/:pedidoId` | Autenticado | Generación de URL con código QR vía QRServer API |
| `POST` | `/api/pagos/:pedidoId/procesar` | `Cajero`, `Administrador` | Transacción atómica de pago, comanda a `CERRADO` y mesa a `Libre` |
| `POST` | `/api/pagos/notificar-qr/:pedidoId` | Público (Simulación) | Webhook pedagógico que emite aviso de confirmación a caja |
| `POST` | `/api/pagos/:pedidoId/enviar-recibo` | `Cajero`, `Administrador` | Compilación de plantilla HTML y despacho vía EmailJS REST |

### 5.8. Dashboard Gerencial

| Método | Endpoint | Acceso / Roles | Descripción |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/dashboard/resumen` | `Administrador` | Agregación de 8 KPIs gerenciales consolidados en tiempo real |

---

## 6. Ciclo de Vida y Flujo Operativo

### 6.1. Diagrama de Secuencia Operativo

```mermaid
sequenceDiagram
    autonumber
    actor M as Mesero
    actor C as Cocina
    actor J as Cajero
    participant API as Backend REST
    participant WS as Socket.IO
    participant DB as MongoDB Atlas

    M->>API: POST /api/pedidos (crear comanda)
    API->>DB: Valida recetas, congela precios, guarda PED-XXXX
    DB-->>API: Pedido ABIERTO + Mesa Ocupada
    API->>WS: Emite 'cocina:nuevo_pedido'
    WS-->>C: Notificación visual en tablero

    C->>API: PATCH /api/pedidos/:id/estado (EN_PREPARACION)
    API->>WS: Emite 'cocina:actualizar_tablero'

    C->>API: PATCH /api/pedidos/:id/estado (ENTREGADO)
    API->>WS: Emite 'mesas:alerta_listo' (room:meseros)
    WS-->>M: Alerta sonora en salón ("¡Listo!")

    M->>API: PATCH /api/pedidos/:id/solicitar-cuenta
    API->>DB: Mesa pasa a 'Cuenta Solicitada'
    API->>WS: Emite 'caja:solicitud_pago' (room:caja)
    WS-->>J: Alerta de mesa lista para cobro

    opt Pago con Código QR
        J->>API: POST /api/pagos/generar-qr/:pedidoId
        API-->>J: Retorna QRServer URL
        Note over J,API: Cliente escanea y notifica vía webhook simulado
        API->>WS: Emite 'caja:pago_confirmado' (Simulación)
    end

    J->>API: POST /api/pagos/:pedidoId/procesar
    Note over API,DB: Transacción Atómica MongoDB
    API->>DB: Recalcula subtotal, aplica descuento, suma propina
    API->>DB: Pedido -> CERRADO, Mesa -> Libre, Pago -> Pagado
    API->>WS: Emite 'mesas:updated' (Mesa Libre)
    API-->>J: Comprobante de pago generado

    opt Envío de Recibo Digital
        J->>API: POST /api/pagos/:id/enviar-recibo
        API->>DB: Obtiene datos fiscales
        API-->>J: Recibo HTML enviado vía EmailJS
    end
```

### 6.2. Máquina de Estados Canónicos del Dominio

#### Estados de Mesa (`src/models/Mesa.ts`)

| Estado | Badge | Descripción | Transición Habitual |
| :--- | :---: | :--- | :--- |
| **`Libre`** | [![Libre](https://img.shields.io/badge/Mesa-Libre-2ea44f?style=flat-square)](#) | Mesa desocupada lista para recibir clientes | Pasa a `Ocupada` al crear comanda |
| **`Ocupada`** | [![Ocupada](https://img.shields.io/badge/Mesa-Ocupada-d73a49?style=flat-square)](#) | Comensales consumiendo activamente | Pasa a `Cuenta Solicitada` al pedir la cuenta |
| **`Cuenta Solicitada`** | [![Cuenta Solicitada](https://img.shields.io/badge/Mesa-Cuenta%20Solicitada-dbab09?style=flat-square)](#) | Comanda en proceso de pago en caja | Pasa a `Libre` al procesar el pago |

*Nota:* Los identificadores históricos de clientes como `"Disponible"` y `"Esperando pago"` son normalizados por el servicio hacia `Libre` y `Cuenta Solicitada` respectivamente.

#### Estados de Pedido (`src/models/Pedido.ts`)

| Estado | Badge | Descripción | Transición Permitida |
| :--- | :---: | :--- | :--- |
| **`ABIERTO`** | [![ABIERTO](https://img.shields.io/badge/Pedido-ABIERTO-0366d6?style=flat-square)](#) | Comanda registrada en espera de preparación | Pasa a `EN_PREPARACION` o `CANCELADO` |
| **`EN_PREPARACION`** | [![EN_PREPARACION](https://img.shields.io/badge/Pedido-EN__PREPARACION-f66a0a?style=flat-square)](#) | Chef elaborando los platos en cocina | Pasa a `ENTREGADO` |
| **`ENTREGADO`** | [![ENTREGADO](https://img.shields.io/badge/Pedido-ENTREGADO-28a745?style=flat-square)](#) | Platos servidos en la mesa | Pasa a `CERRADO` (o reabre a `ABIERTO` si se añaden platos) |
| **`CANCELADO`** | [![CANCELADO](https://img.shields.io/badge/Pedido-CANCELADO-cb2431?style=flat-square)](#) | Pedido anulado y mesa liberada | Estado final inmutable |
| **`CERRADO`** | [![CERRADO](https://img.shields.io/badge/Pedido-CERRADO-6f42c1?style=flat-square)](#) | Cuenta cobrada y liquidada formalmente | Estado final inmutable |

#### Estados de Pago (`src/models/Pago.ts`)

| Estado | Badge | Descripción |
| :--- | :---: | :--- |
| **`Pendiente`** | [![Pendiente](https://img.shields.io/badge/Pago-Pendiente-ffd33d?style=flat-square&labelColor=000&color=black)](#) | Registro de cuenta emitido antes de cobrar |
| **`Procesado`** | [![Procesado](https://img.shields.io/badge/Pago-Procesado-2188ff?style=flat-square)](#) | Transacción en verificación operativa |
| **`Pagado`** | [![Pagado](https://img.shields.io/badge/Pago-Pagado-28a745?style=flat-square)](#) | Pago formalmente liquidado y asentado |
| **`Anulado`** | [![Anulado](https://img.shields.io/badge/Pago-Anulado-d73a49?style=flat-square)](#) | Cobro revocado o cancelado |

---

## 7. WebSockets en Tiempo Real (Socket.IO)

El servidor Socket.IO se encuentra inicializado sobre el servidor HTTP nativo en [`src/socket/socket.ts`](file:///home/fercho/Software/sabor-gestion-backend-personal/src/socket/socket.ts).

### 7.1. Topología de Salas y Handshake JWT

El cliente debe proporcionar su token JWT en el handshake inicial:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

```text
Socket.IO Server (Handshake JWT)
 ├── room:meseros        (Alertas de platos listos para recoger: 'mesas:alerta_listo')
 ├── room:caja           (Alertas de cobro de cuentas: 'caja:solicitud_pago')
 ├── user:{cajeroId}     (Notificaciones dirigidas al cajero específico asignado)
 └── Global Broadcast    (Actualizaciones de mesas y comandas: 'mesas:updated', 'cocina:nuevo_pedido')
```

### 7.2. Catálogo de Eventos Reales

| Evento | Dirección | Origen en Backend | Sala Destino | Payload Principal |
| :--- | :---: | :--- | :--- | :--- |
| `mesas:updated` | Server $ightarrow$ Client | `PATCH /mesas/:id/estado`, `POST /pedidos` | Global | `{ mesaId, estado, numero, capacidad }` |
| `cocina:nuevo_pedido` | Server $ightarrow$ Client | `POST /api/pedidos` | Global (Cocina) | Datos de la orden `PED-XXXX` y platos solicitados |
| `cocina:actualizar_tablero` | Server $ightarrow$ Client | `PATCH /pedidos/:id/estado`, `PUT /pedidos/:id`, `POST /pagos/:id/procesar` | Global (Cocina) | Comanda actualizada |
| `mesas:alerta_listo` | Server $ightarrow$ Client | `PATCH /pedidos/:id/estado` (`ENTREGADO`) | `room:meseros` | `{ pedidoId, mesaId, mesaNombre }` (Activa timbre sonoro) |
| `caja:solicitud_pago` | Server $ightarrow$ Client | `PATCH /pedidos/:id/solicitar-cuenta` | `room:caja` | Payload con subtotal, propina y platos consumidos |
| `mesas:pago_completado` | Server $ightarrow$ Client | `POST /api/pagos/:pedidoId/procesar` | Global | `{ mesaId, mesaNombre, pedidoId, mensaje }` |
| `caja:pago_confirmado` | Server $ightarrow$ Client | `POST /api/pagos/notificar-qr/:pedidoId` | `room:caja` | Confirmación simulada de escaneo de QR en terminal móvil |

---

## 8. Instalación y Puesta en Marcha

### 01 — Clonar el Repositorio
```bash
git clone https://github.com/BandaTellezFernando/sabor-gestion-backend-personal.git
cd sabor-gestion-backend-personal
```

### 02 — Instalar Dependencias con pnpm
```bash
pnpm install
```

### 03 — Configurar Variables de Entorno
Cree un archivo `.env` en la raíz del proyecto siguiendo la plantilla detallada en la Sección 9:
```bash
touch .env
```

### 04 — Iniciar el Servidor en Desarrollo
```bash
pnpm run dev
```

### 05 — Scripts Adicionales de Utilidad y Calidad
```bash
# Compilar código TypeScript a JavaScript en dist/
pnpm run build

# Ejecutar el servidor compilado en producción
pnpm start

# Ejecutar el linter para comprobar estándares de sintaxis
pnpm run lint

# Formatear el código fuente con Prettier
pnpm run format

# Ejecutar seed base (Categorías, Platos, Mesas y Usuarios iniciales)
pnpm run seed

# Ejecutar seed culinario (Ingredientes y Recetas)
pnpm run seed:inventario
```

---

## 9. Variables de Entorno

El backend utiliza `dotenv` para inyectar la configuración del sistema. Debe crear un archivo llamado `.env` en la raíz del proyecto.

> [!CAUTION]
> **REGLA DE SEGURIDAD:** Nunca confirme ni suba archivos `.env` a repositorios públicos o de control de versiones. Utilice únicamente valores de prueba o secretos administrados en plataformas seguras.

### Tabla Exhaustiva de las 11 Variables Reales

| Dominio | Variable | Requerida | Formato / Valor de Ejemplo | Descripción |
| :--- | :--- | :---: | :--- | :--- |
| **Servidor** | `PORT` | No (Def: 3000) | `3000` | Puerto TCP del servidor HTTP y WebSockets |
| **Entorno** | `NODE_ENV` | Sí | `development` | Protege contra la ejecución accidental de scripts seed en producción |
| **Base de Datos** | `MONGO_URI` | **SÍ** | `mongodb+srv://<usr>:<pwd>@cluster.mongodb.net/sabor?retryWrites=true` | Cadena de conexión para MongoDB Atlas o instancia local |
| **Seguridad** | `JWT_SECRET` | **SÍ** | `clave_secreta_jwt_produccion_2026` | Clave simétrica utilizada para firmar tokens JWT (HTTP y Sockets) |
| **Multimedia** | `CLOUDINARY_CLOUD_NAME` | Sí | `mi_cloud_name` | Nombre de la nube de Cloudinary |
| **Multimedia** | `CLOUDINARY_API_KEY` | Sí | `123456789012345` | Llave pública de la API de Cloudinary |
| **Multimedia** | `CLOUDINARY_API_SECRET` | Sí | `abcdefghijklmnopqrstuvwxyz123` | Llave secreta privada de la API de Cloudinary |
| **Correo** | `EMAILJS_SERVICE_ID` | Sí | `service_xxxxxxx` | Service ID de EmailJS para despacho de recibos |
| **Correo** | `EMAILJS_TEMPLATE_ID` | Sí | `template_xxxxxxx` | Template ID configurado para la plantilla HTML |
| **Correo** | `EMAILJS_USER_ID` | Sí | `user_xxxxxxxxxxxxxxxx` | Clave pública de la cuenta de EmailJS |
| **Correo** | `EMAILJS_ACCESS_TOKEN` | Sí | `token_xxxxxxxxxxxxxxxx` | Clave privada / Access Token para llamadas REST |

### Plantilla de Configuración (`.env` de prueba)

```env
# Configuración del Servidor y Entorno
PORT=3000
NODE_ENV=development

# Persistencia MongoDB Atlas
MONGO_URI=mongodb+srv://admin_dev:passwordSeguro123@cluster-sabor.mongodb.net/sabor_gestion_db?retryWrites=true&w=majority

# Criptografía y Sesiones Stateless (JWT)
JWT_SECRET=tu_clave_secreta_jwt_super_segura_2026

# Almacenamiento Multimedia (Cloudinary)
CLOUDINARY_CLOUD_NAME=sabor-cloud
CLOUDINARY_API_KEY=987654321012345
CLOUDINARY_API_SECRET=AbCdEfGhIjKlMnOpQrStUvWxYz012

# Servicio de Correo Electrónico (EmailJS REST API)
EMAILJS_SERVICE_ID=service_sabor_receipts
EMAILJS_TEMPLATE_ID=template_factura_sabor
EMAILJS_USER_ID=user_public_key_emailjs
EMAILJS_ACCESS_TOKEN=priv_access_token_emailjs
```

---

## 10. Medidas de Seguridad y Reglas Críticas

[![JWT](https://img.shields.io/badge/Security-JWT%20Stateless-blue?style=flat-square)](#)
[![RBAC](https://img.shields.io/badge/Security-RBAC%20Estricto-purple?style=flat-square)](#)
[![bcryptjs](https://img.shields.io/badge/Security-bcrypt%20Hashing-green?style=flat-square)](#)
[![Mass Assignment](https://img.shields.io/badge/Security-Mass%20Assignment%20Guard-red?style=flat-square)](#)
[![Server-side](https://img.shields.io/badge/Security-Server--side%20Authority-orange?style=flat-square)](#)

1. **Tokens Criptográficos Stateless (JWT):** Firmados con algoritmo HMAC-SHA256, vigencia de 8 horas e inspección en cada petición HTTP o conexión WebSocket.
2. **Hashing de Contraseñas:** Algoritmo bcryptjs con 10 rondas de salt; las contraseñas en texto plano nunca se registran ni persisten.
3. **Control de Acceso Basado en Roles (RBAC):** Middleware `permitirRoles` que rechaza peticiones con HTTP 403 Forbidden antes de alcanzar la capa de servicio.
4. **Validación de Esquema en Base de Datos:** Todas las operaciones de repositorio utilizan `runValidators: true` en `findByIdAndUpdate`, impidiendo estados fuera de los enums establecidos.
5. **Autoridad Monetaria Absoluta:** Los subtotales y totales son calculados internamente consultando los precios del catálogo; los valores monetarios enviados en el body del cliente son descartados.
6. **Protección contra Mass Assignment:** Los endpoints de actualización (`PUT /api/pedidos/:id`) filtran estrictamente los campos modificables y descartan campos de control financiero e importes no autorizados (`total`, `subtotal`, `subtotalCierre`, `estado`).
7. **Protección de Último Cajero:** Regla transaccional en el servicio de usuarios que prohíbe dejar el sistema sin cajeros habilitados para operar.
8. **Protección de Entornos en Seeds:** Los scripts destructivos (`seed.ts`, `seedInventario.ts`) abortan de inmediato si `NODE_ENV === 'production'`.
9. **CORS Restringido:** Configurado en `src/app.ts` y `src/socket/socket.ts` limitando orígenes a terminales autorizadas (`localhost:5173`, `localhost:5174`, `https://quirquinita.onrender.com`, `https://tis-pied.vercel.app`).

---

## 11. Servicios Externos Integrados

| Servicio | Logo / Identificador | Tipo de Integración | Finalidad Técnica en el Sistema |
| :--- | :---: | :--- | :--- |
| **MongoDB Atlas** | [![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/) | Driver Nativo / Mongoose ODM | Almacenamiento transaccional documental de las 11 colecciones |
| **Cloudinary** | [![Cloudinary](https://img.shields.io/badge/Cloudinary-Media%20CDN-3448C5?style=flat-square&logo=cloudinary&logoColor=white)](https://cloudinary.com/) | SDK Oficial v2 / Buffer Stream | Almacenamiento y optimización de fotografías de los platos |
| **EmailJS** | [![EmailJS](https://img.shields.io/badge/EmailJS-REST%20API-ea580c?style=flat-square)](https://www.emailjs.com/) | HTTP REST (`fetch` nativo) | Despacho asíncrono de facturas y recibos en formato HTML |
| **QRServer** | [![QRServer](https://img.shields.io/badge/QRServer-REST%20API-000000?style=flat-square)](#) | URL Generator vía HTTPS | Generación de imágenes QR dinámicas con monto y comanda |

---

## 12. Calidad de Código y Pruebas

Actualmente el repositorio **no incluye un framework de pruebas automatizado (como Jest o Vitest) configurado en `package.json`**. La verificación y validación del sistema se ha llevado a cabo mediante los siguientes mecanismos:

1. **Pruebas de Integración con Clientes HTTP:** Colecciones en Postman y scripts `curl` ejecutados contra el entorno local validando códigos de estado HTTP y contratos JSON.
2. **Auditorías de Seguridad Estricta (Fase 17):** Ejecución de scripts de prueba aislados en entornos de evaluación para verificar los 5 incidentes críticos corregidos:
   - *BUG-01:* Validación de máquina de estados finita en cocina (`ABIERTO` -> `EN_PREPARACION` -> `ENTREGADO`).
   - *BUG-02:* Protección contra *mass assignment* en `PUT /api/pedidos/:id` (blindaje de campos financieros).
   - *BUG-03:* Autoridad absoluta del backend sobre subtotales (descarte de `subtotalCierre` inyectado por clientes).
   - *BUG-04:* Aislamiento de webhook de simulación QR (`notificar-qr` emite alertas pero no liquida dinero en BD).
   - *BUG-05:* Validación estricta con `runValidators: true` y restricción de roles en `PATCH /api/mesas/:id/estado`.
3. **Validación del Contrato OpenAPI:** Validación sintáctica y semántica del archivo [`docs/openapi.yaml`](file:///home/fercho/Software/sabor-gestion-backend-personal/docs/openapi.yaml) contrastado con las rutas reales.

---

## 13. Despliegue y Operación

### Despliegue en Vercel (Configuración nativa del repositorio)
El repositorio incluye un archivo [`vercel.json`](file:///home/fercho/Software/sabor-gestion-backend-personal/vercel.json) configurado para construir y servir el backend mediante funciones Serverless:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/server.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/server.ts"
    }
  ]
}
```

> [!NOTE]
> En entornos Serverless sin soporte para conexiones persistentes de Socket.IO, se recomienda desplegar la instancia de tiempo real sobre un servicio con estado (PaaS como Render o VPS Linux).

---

## 14. Diagnóstico de Problemas (Troubleshooting)

### Error: Fallo de Conexión a MongoDB (`ECONNREFUSED`)
- **Causa:** La variable `MONGO_URI` no está definida o la IP de la máquina de ejecución no está permitida en la lista blanca de acceso (Network Access) de MongoDB Atlas.
- **Solución:** Agregue la IP pública actual en el panel de Network Access de MongoDB Atlas (o `0.0.0.0/0` para pruebas en desarrollo).

### Error: Acceso Denegado (`401 Unauthorized` o `403 Forbidden`)
- **Causa:** El token JWT ha expirado (más de 8 horas), está mal formateado o el usuario autenticado carece del rol necesario para la operación según la matriz RBAC.
- **Solución:** Reautenticarse mediante `POST /api/usuarios/login` e incluir el encabezado `Authorization: Bearer <token>`.

### Error: CORS Policy en Clientes Web
- **Causa:** La solicitud proviene de un origen web no registrado en el arreglo `origin` de [`src/app.ts`](file:///home/fercho/Software/sabor-gestion-backend-personal/src/app.ts).
- **Solución:** Agregar el dominio o puerto del cliente en la lista blanca de CORS y reiniciar el servidor.

---

## 15. Referencias y Documentación Relacionada

- **Especificación OpenAPI 3.0.3:** [`docs/openapi.yaml`](file:///home/fercho/Software/sabor-gestion-backend-personal/docs/openapi.yaml) (Contrato estricto y tipado de endpoints).
- **Informe de Módulos del Backend (PDF):** [`docs/Informe_Modulos_Backend_Sabor_Gestion.pdf`](file:///home/fercho/Software/sabor-gestion-backend-personal/docs/Informe_Modulos_Backend_Sabor_Gestion.pdf) (Documento formal académico de arquitectura).
- **Bitácora de Incidentes y Hardening:** [`docs/informe_incidentes_y_correcciones_backend.md`](file:///home/fercho/Software/sabor-gestion-backend-personal/docs/informe_incidentes_y_correcciones_backend.md) (Auditoría técnica de resolución de los incidentes BUG-01 a BUG-05).
- **Informe Funcional:** [`docs/informe_funcional_backend.md`](file:///home/fercho/Software/sabor-gestion-backend-personal/docs/informe_funcional_backend.md).

---

<div align="center">

### Sabor & Gestión

**Sistema Integral de Gestión Gastronómica — Backend API RESTful & WebSockets**

Documento técnico y base documental para el apartado universitario *10. Implementación del Prototipo*

Fernando Banda Téllez • Octubre 2026

</div>
