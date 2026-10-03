# Sabor & Gestión — Backend API RESTful & WebSockets

> **Motor de Procesamiento Transaccional y Lógica de Negocio para el Sistema Integral de Gestión Gastronómica**  
> Documento técnico de especificación, arquitectura, configuración, despliegue y referencia operativa. Base documental para la sección académica *"10. Implementación del Prototipo"*.

---

## 1. Presentación del Proyecto

### 1.1. Propósito del Sistema
**Sabor & Gestión (Backend)** es el núcleo lógico, transaccional y de comunicación en tiempo real diseñado para automatizar y gobernar la operativa integral de un establecimiento gastronómico (atención en salón/mesas). El sistema centraliza la administración del personal, la catalogación de platos, el control culinario por ingredientes, la infraestructura de mesas, la orquestación del ciclo de vida de comandas, el seguimiento en cocina, la liquidación de cuentas y la analítica gerencial en tiempo real.

### 1.2. Problema que Resuelve
En la operación tradicional de un restaurante, la descoordinación entre meseros, cocineros y cajeros provoca demoras, pedidos extraviados, venta de platos con ingredientes agotados, inconsistencias en el cálculo de cuentas y falta de visibilidad gerencial sobre las ventas del día. Este backend resuelve dicha problemática implementando:
1. **Autoridad centralizada:** Reglas de negocio e importes financieros calculados exclusivamente en el servidor.
2. **Sincronización en tiempo real:** Comunicación bidireccional mediante WebSockets que alerta instantáneamente a cocina (nuevas comandas), a meseros (platos listos con señal sonora) y a caja (cuentas solicitadas y pagos).
3. **Control culinario preventivo:** Validación de disponibilidad de insumos antes de ingresar una comanda.
4. **Integridad transaccional:** Transiciones de estado estrictas y protección atómica en el cierre y cobro de cuentas.

### 1.3. Tipo de Sistema y Alcance
Es un **backend desacoplado** estructurado como una **API RESTful modular** complementada con un servidor de **WebSockets (Socket.IO)**. El sistema está orientado exclusivamente a la **gestión interna del restaurante (B2B)**.

- **Usuarios del Sistema:** Personal del restaurante debidamente autenticado con uno de los 4 roles del sistema:
  - `Administrador`
  - `Mesero`
  - `Cajero`
  - `Cocinero`
- **Delimitación estricta de alcance (Exclusiones deliberadas):**
  - **NO incluye portal ni login de comensales/clientes:** El sistema es para uso exclusivo de empleados.
  - **NO incluye Google OAuth:** La autenticación se realiza mediante credenciales internas (JWT y bcryptjs).
  - **NO incluye módulo de Delivery:** La operativa actual cubre atención presencial en salón.
  - **NO incluye módulo de Reservas:** Las reservas anticipadas fueron retiradas del modelo de dominio (commit `a1edce2`) para enfocar el prototipo en rotación de mesas en vivo.
  - **NO integra pasarelas bancarias reales:** El flujo de cobro QR constituye una simulación académica funcional estructurada mediante webhooks y eventos en tiempo real.

---

## 2. Características Principales del Backend

- **Autenticación Stateless & RBAC:** Emisión de JSON Web Tokens (JWT) con 8 horas de vigencia y control de acceso basado en roles mediante middlewares especializados (`verificarToken`, `permitirRoles`, `soloAdmins`).
- **Administración de Personal:** Registro, edición, baja física (Hard Delete) y desactivación lógica (Soft Delete) de empleados, con regla de negocio de protección para evitar dejar al sistema sin cajeros activos.
- **Arqueo Automático al Desactivar Cajero:** Registro automático de documentos en `CierreCaja` al suspender o cerrar el turno de un cajero si se envía reporte financiero.
- **Catálogo Gastronómico & Cloudinary:** Organización jerárquica de categorías y platos con precio oficial congelado, disponibilidad booleana y subida de fotografías en buffer de memoria hacia Cloudinary.
- **Motor de Disponibilidad Culinaria e Ingredientes:** Validación lógica de viabilidad de preparación según insumos requeridos en recetas, con capacidad de exclusión semántica por observaciones de comanda (ej. *"sin cebolla"*).
- **Gestión de Salón y Mesas:** Administración de áreas físicas (ubicaciones) y mesas con restricción de unicidad de numeración por sector y sincronización de estados en vivo.
- **Ciclo de Vida de Comandas (PED-XXXX):** Generación correlativa atómica, fijación de precios unitarios oficiales desde la base de datos, adición de platos a órdenes activas y reapertura automática a cocina si el pedido ya había sido entregado.
- **Máquina de Estados de Cocina:** Transiciones finitas y estrictas (`ABIERTO` -> `EN_PREPARACION` -> `ENTREGADO`) con alertas sonoras en tiempo real a meseros (`mesas:alerta_listo`), reservando el estado `CERRADO` para la liquidación final en caja.
- **Liquidación Financiera Autoritativa:** Cálculo exclusivo en backend de subtotal, descuentos porcentuales o fijos y propinas voluntarias, ignorando cualquier subtotal suministrado desde el cliente (protección contra manipulación de precios).
- **Comprobantes Digitales & Simulación QR:** Generación de códigos QR mediante API externa, simulación de confirmación vía webhook público (`POST /api/pagos/notificar-qr/:pedidoId`) y despacho automatizado de facturas/recibos HTML vía EmailJS.
- **Dashboard Gerencial con 8 KPIs:** Pipelines de agregación en MongoDB Atlas que calculan ventas totales, pedidos completados, ticket promedio, métodos de pago, platos populares, franjas horarias, ocupación de mesas y productividad del personal.

---

## 3. Tecnologías Utilizadas

Todas las herramientas y librerías declaradas corresponden rigurosamente a las dependencias reales extraídas de `package.json`:

| Tecnología / Paquete | Versión | Uso en el Proyecto | Tipo |
| :--- | :---: | :--- | :--- |
| **Node.js** | `>=20.x` | Entorno de ejecución de JavaScript en el servidor | Motor de Ejecución |
| **TypeScript** | `^5.0.0` | Tipado estático estricto, interfaces DTO y compilación a JavaScript | Lenguaje |
| **Express** | `^5.2.1` | Framework HTTP para enrutamiento, middlewares y controladores | Framework Web |
| **MongoDB Atlas / MongoDB** | `>=6.0` | Base de datos NoSQL documental para persistencia transaccional | Base de Datos |
| **Mongoose** | `^9.3.1` | Object Data Modeling (ODM), esquemas, índices y validadores | ODM |
| **Socket.IO** | `^4.8.3` | Servidor de comunicación bidireccional en tiempo real (WebSockets) | Comunicación |
| **jsonwebtoken** | `^9.0.3` | Generación y verificación criptográfica de tokens JWT (HS256) | Seguridad / Auth |
| **bcryptjs** | `^3.0.3` | Hashing unidireccional de contraseñas con salt rounds de 10 | Seguridad / Criptografía |
| **Cloudinary** | `^2.9.0` | Almacenamiento, compresión y CDN en la nube para fotos de platos | Servicio Externo |
| **Multer** | `^2.1.1` | Procesamiento de solicitudes multipart/form-data en buffer de memoria | Procesamiento Archivos |
| **Cors** | `^2.8.6` | Configuración de Cross-Origin Resource Sharing para clientes autorizados | Middleware HTTP |
| **Morgan** | `^1.10.1` | Registro y logging de peticiones HTTP en consola durante desarrollo | Utilidad / Logging |
| **Dotenv** | `^17.3.1` | Carga de variables de entorno desde el archivo `.env` | Configuración |
| **pnpm** | `12.4.2` | Gestor de paquetes rápido, determinista y eficiente en espacio de disco | Gestor de Paquetes |
| **tsx** | `^4.21.0` | Ejecutor de TypeScript moderno y rápido para entorno de desarrollo | Herramienta Dev |
| **nodemon** | `^3.1.14` | Monitor de cambios de código fuente para reinicio automático del servidor | Herramienta Dev |
| **ts-node** | `^10.9.2` | Ejecución directa de scripts TypeScript (ej. seeds de base de datos) | Herramienta Dev |
| **ESLint** | `^8.0.0` | Análisis estático de código fuente y cumplimiento de estándares de sintaxis | Calidad de Código |
| **Prettier** | `^3.0.0` | Formateador consistente de código fuente | Calidad de Código |

---

## 4. Prerrequisitos

Antes de instalar y poner en marcha el backend, asegúrese de contar con las siguientes herramientas en su sistema operativo:

1. **Node.js:** Versión `20.x` LTS o superior recomendada.
2. **pnpm:** Gestor oficial del repositorio (`v12.x` o compatible `>=8.x`).
3. **MongoDB:** Clúster activo en **MongoDB Atlas** (recomendado) o una instancia local de MongoDB `>=6.0`.
4. **Git:** Para clonar el repositorio y gestionar versiones.

### Comprobación de versiones en terminal:
```bash
node -v      # Debe retornar v20.x.x o superior
pnpm -v      # Debe retornar 12.x.x (o versión de pnpm activa)
git --version # Debe retornar git version 2.x.x
```

Si no cuenta con `pnpm`, puede instalarlo globalmente vía npm o Corepack:
```bash
npm install -g pnpm
# o mediante corepack:
corepack enable && corepack prepare pnpm@latest --activate
```

---

## 5. Instalación del Proyecto

Siga estos pasos desde su terminal para inicializar el proyecto desde cero:

### Paso 1: Clonar el repositorio
```bash
git clone https://github.com/BandaTellezFernando/sabor-gestion-backend-personal.git
```

### Paso 2: Acceder al directorio de trabajo
```bash
cd sabor-gestion-backend-personal
```

### Paso 3: Instalar dependencias con pnpm
```bash
pnpm install
```

### Paso 4: Verificar la instalación
Compruebe que la carpeta `node_modules` fue generada y que el compilador de TypeScript reconoce las dependencias:
```bash
pnpm run lint
```

---

## 6. Configuración del Entorno (`.env`)

El backend utiliza `dotenv` para inyectar la configuración del sistema. Debe crear un archivo llamado `.env` en la raíz del proyecto.

> [!CAUTION]
> **REGLA DE SEGURIDAD:** Nunca confirme ni suba archivos `.env` a repositorios públicos o de control de versiones. Utilice únicamente valores de prueba o secretos administrados en plataformas seguras.

### Tabla Exhaustiva de Variables de Entorno

A continuación se detallan **todas** las variables que el código fuente inspecciona a través de `process.env`:

| Variable | Descripción | Obligatoria | Ejemplo / Formato (Placeholders) |
| :--- | :--- | :---: | :--- |
| `PORT` | Puerto de escucha TCP del servidor HTTP y WebSockets | No (Default: 3000) | `3000` o `5000` |
| `NODE_ENV` | Entorno de ejecución (`development` / `production`). Protege contra ejecución accidental de seeds | Sí | `development` |
| `MONGO_URI` | Cadena de conexión para MongoDB Atlas o instancia local | **SÍ** | `mongodb+srv://<user>:<password>@cluster0.xxx.mongodb.net/sabor_gestion?retryWrites=true&w=majority` |
| `JWT_SECRET` | Clave secreta simétrica utilizada para firmar y verificar tokens JWT (HTTP y Sockets) | **SÍ** | `tu_clave_secreta_jwt_super_segura_2026` |
| `CLOUDINARY_CLOUD_NAME` | Identificador de nube de Cloudinary para almacenamiento multimedia | Sí (para fotos) | `mi_cloud_name` |
| `CLOUDINARY_API_KEY` | Llave pública de la API de Cloudinary | Sí (para fotos) | `123456789012345` |
| `CLOUDINARY_API_SECRET` | Llave secreta privada de la API de Cloudinary | Sí (para fotos) | `abcdefghijklmnopqrstuvwxyz123` |
| `EMAILJS_SERVICE_ID` | Service ID configurado en EmailJS para despacho de correos | Sí (para emails) | `service_xxxxxxx` |
| `EMAILJS_TEMPLATE_ID` | Template ID configurado en EmailJS para la factura HTML | Sí (para emails) | `template_xxxxxxx` |
| `EMAILJS_USER_ID` | Public Key / User ID de la cuenta de EmailJS | Sí (para emails) | `user_xxxxxxxxxxxxxxxx` |
| `EMAILJS_ACCESS_TOKEN` | Private Key / Access Token de EmailJS (requerido por API REST) | Sí (para emails) | `token_xxxxxxxxxxxxxxxx` |

### Ejemplo de plantilla para `.env`:
```env
# Configuración del Servidor
PORT=3000
NODE_ENV=development

# Persistencia MongoDB Atlas
MONGO_URI=mongodb+srv://admin_dev:passwordSeguro123@cluster-sabor.mongodb.net/sabor_gestion_db?retryWrites=true&w=majority

# Seguridad Criptográfica JWT
JWT_SECRET=super_secret_jwt_key_sabor_gestion_telematica_2026

# Almacenamiento de Imágenes (Cloudinary)
CLOUDINARY_CLOUD_NAME=sabor-cloud
CLOUDINARY_API_KEY=987654321012345
CLOUDINARY_API_SECRET=AbCdEfGhIjKlMnOpQrStUvWxYz012

# Servicio de Correo Electrónico (EmailJS REST API)
EMAILJS_SERVICE_ID=service_sabor_receipts
EMAILJS_TEMPLATE_ID=template_factura_sabor
EMAILJS_USER_ID=user_public_key_emailjs
EMAILJS_ACCESS_TOKEN=priv_access_token_emailjs
```

### Impacto de variables faltantes:
- **Sin `MONGO_URI`:** La aplicación aborta el inicio inmediatamente (`process.exit(1)`).
- **Sin `JWT_SECRET`:** El login de usuarios y la conexión a WebSockets son rechazados por seguridad (*"FATAL ERROR: JWT_SECRET no configurado"*).
- **Sin credenciales de Cloudinary:** La subida de imágenes en `POST /api/upload` retorna error HTTP 500.
- **Sin credenciales de EmailJS:** El endpoint `POST /api/pagos/:pedidoId/enviar-recibo` rechaza el envío con un error de configuración.

---

## 7. Configuración de Base de Datos (MongoDB Atlas)

El sistema utiliza **MongoDB Atlas** gestionado a través de **Mongoose ODM**. La configuración de conexión reside en [`src/configs/db.ts`](file:///home/fercho/Software/sabor-gestion-backend-personal/src/configs/db.ts).

### 7.1. Inicialización y Conexión Segura
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
    console.log(`🟢 Base de Datos MongoDB Conectada: ${conn.connection.name}`)
  } catch (error) {
    console.error(`🔴 Error conectando a MongoDB: ${error}`)
    process.exit(1) // Detiene el servidor si no hay base de datos
  }
}
```

### 7.2. Colecciones Reales del Sistema
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

### 7.3. Especificación Detallada de los 11 Modelos Mongoose (`src/models/`)

| Modelo | Archivo Fuente | Colección | Campos Principales y Tipos | Enums / Restricciones / Relaciones |
| :--- | :--- | :--- | :--- | :--- |
| **`Usuario`** | `Usuario.ts` | `usuarios` | `nombre`, `apellido`, `ci`, `username`, `password`, `rol`, `email`, `estado` (boolean) | `rol`: `'Administrador'`, `'Mesero'`, `'Cocinero'`, `'Cajero'`. Hash con bcryptjs. Índice único en `username`. |
| **`Categoria`** | `Categoria.ts` | `categorias` | `nombre`, `descripcion` | Índice único en `nombre`. Agrupador del menú gastronómico. |
| **`Plato`** | `Plato.ts` | `platos` | `nombre`, `precio`, `categoria` (ObjectId), `imagenUrl`, `imagenPublicId`, `disponible` (boolean) | `precio >= 0`. `ref: 'Categoria'`. Disponibilidad por booleano. |
| **`Ingrediente`** | `Ingrediente.ts` | `ingredientes` | `nombre`, `unidadMedida`, `disponible` (boolean) | `unidadMedida`: `'gr'`, `'kg'`, `'ml'`, `'lt'`, `'unidad'`, `'porcion'`. Índice único en `nombre`. |
| **`Receta`** | `Receta.ts` | `recetas` | `platoId` (ObjectId), `ingredientes` (Array: `{ ingredienteId, cantidadRequerida, opcional }`) | `ref: 'Plato'` (único), `ref: 'Ingrediente'`. Base del motor de validación de disponibilidad culinaria. |
| **`Ubicacion`** | `Ubicacion.ts` | `ubicaciones` | `nombre`, `name` (legacy sync), `descripcion` | Índice único en `nombre`. Zonas del restaurante (Salón Principal, Terraza, etc.). |
| **`Mesa`** | `Mesa.ts` | `mesas` | `numero`, `capacidad`, `ubicacion` (string), `ubicacionId` (ObjectId), `estado`, `tipo` | `estado`: `'Libre'`, `'Ocupada'`, `'Cuenta Solicitada'`. `tipo`: `'normal'`, `'vip'`. `ref: 'Ubicacion'`. |
| **`Pedido`** | `Pedido.ts` | `pedidos` | `codigo` (`PED-XXXX`), `fechaDiaBolivia`, `fechaHora`, `estado`, `total`, `mesa` (ObjectId), `usuario` (ObjectId), `detalles`, `subtotalCierre`, `montoDescuento`, `montoPropina`, `metodoPago`, `cajeroAsignado` | `estado`: `'ABIERTO'`, `'EN_PREPARACION'`, `'ENTREGADO'`, `'CANCELADO'`, `'CERRADO'`. `detalles`: Array con `plato`, `cantidad`, `precioUnitario`, `subtotal`, `observacion`. Índice `{ fechaDiaBolivia, codigo }`. |
| **`Pago`** | `Pago.ts` | `pagos` | `codigoPago` (`PAG-XXXXXX`), `codigoPedido`, `pedido` (ObjectId), `mesa` (ObjectId), `mesero` (ObjectId), `cajero` (ObjectId), `subtotal`, `descuento`, `propina`, `totalFinal`, `metodoPago`, `estadoPago` | `metodoPago`: `'Efectivo'`, `'QR'`, `'Tarjeta'`. `estadoPago`: `'Pendiente'`, `'Procesado'`, `'Pagado'`, `'Anulado'`. Transacción atómica Mongoose. |
| **`CierreCaja`** | `CierreCaja.ts` | `cierrecajas` | `cajeroId`, `cajeroNombre`, `totalDia`, `efectivo`, `tarjeta`, `qr`, `descuentos`, `propinas`, `pagosProcesados`, `fechaCierre`, `fechaCierreBolivia` | Arqueo financiero de turnos de cajeros. Índice en `fechaCierre`. |
| **`Contador`** | `Contador.ts` | `contadores` | `nombre_secuencia` (string), `secuencia` (number) | Generador atómico de correlativos diarios para comandas (`PED-XXXX`). |

---

## 8. Estructura del Proyecto

El código fuente implementa una arquitectura modular limpia y desacoplada bajo `src/`:

```text
sabor-gestion-backend-personal/
├── docs/                                    # Documentación técnica, OpenAPI y reportes
│   ├── openapi.yaml                         # Especificación OpenAPI 3.0.3 del backend
│   ├── informe_funcional_backend.md         # Informe funcional del sistema
│   ├── informe_incidentes_y_correcciones_backend.md # Bitácora de incidentes BUG-01 a BUG-05
│   └── Informe_Modulos_Backend_Sabor_Gestion.pdf   # Documento académico formal
├── scripts/                                 # Scripts de mantenimiento y migración
│   ├── fixUbicacionNames.ts
│   └── migrateUbicaciones.ts
├── src/                                     # Código fuente en TypeScript
│   ├── configs/                             # Clientes y conexiones a infraestructura
│   │   ├── cloudinary.ts                    # Configuración del SDK Cloudinary y Multer
│   │   └── db.ts                            # Conexión a MongoDB Atlas con Mongoose
│   ├── controllers/                         # Capa de controladores HTTP (Request/Response)
│   │   ├── categoria.controller.ts
│   │   ├── dashboard.controller.ts
│   │   ├── ingrediente.controller.ts
│   │   ├── inventario.controller.ts
│   │   ├── mesa.controller.ts
│   │   ├── pago.controller.ts
│   │   ├── pedido.controller.ts
│   │   ├── plato.controller.ts
│   │   ├── receta.controller.ts
│   │   ├── ubicacion.controller.ts
│   │   ├── upload.controller.ts
│   │   └── usuario.controller.ts
│   ├── middlewares/                         # Filtros transversales y de seguridad
│   │   ├── auth.middleware.ts               # Validación de token JWT (verificarToken)
│   │   └── rol.middleware.ts                # Control de acceso por roles (permitirRoles, soloAdmins)
│   ├── models/                              # Esquemas Mongoose y modelos de datos
│   │   ├── Categoria.ts
│   │   ├── CierreCaja.ts
│   │   ├── Contador.ts
│   │   ├── Ingrediente.ts
│   │   ├── Mesa.ts
│   │   ├── Pago.ts
│   │   ├── Pedido.ts
│   │   ├── Plato.ts
│   │   ├── Receta.ts
│   │   ├── Ubicacion.ts
│   │   └── Usuario.ts
│   ├── repositories/                        # Capa de persistencia (Acceso a base de datos)
│   │   ├── categoria.repo.ts
│   │   ├── contador.repo.ts
│   │   ├── dashboard.repo.ts
│   │   ├── ingrediente.repo.ts
│   │   ├── mesa.repo.ts
│   │   ├── pago.repo.ts
│   │   ├── pedido.repo.ts
│   │   ├── plato.repo.ts
│   │   ├── receta.repo.ts
│   │   ├── ubicacion.repo.ts
│   │   └── usuarios.repo.ts
│   ├── routes/                              # Definición de rutas y endpoints de Express
│   │   ├── categoria.routes.ts
│   │   ├── dashboard.routes.ts
│   │   ├── inventario.routes.ts
│   │   ├── mesa.routes.ts
│   │   ├── pago.routes.ts
│   │   ├── pedido.routes.ts
│   │   ├── plato.routes.ts
│   │   ├── ubicacion.routes.ts
│   │   ├── upload.routes.ts
│   │   └── usuario.routes.ts
│   ├── services/                            # Lógica pura de negocio y orquestación
│   │   ├── categoria.service.ts
│   │   ├── contador.service.ts
│   │   ├── dashboard.service.ts
│   │   ├── email.service.ts                 # Despacho de emails mediante EmailJS REST
│   │   ├── ingrediente.service.ts
│   │   ├── inventario.service.ts            # Motor de disponibilidad culinaria
│   │   ├── mesa.service.ts
│   │   ├── pago.service.ts                  # Transacción financiera atómica y cálculos
│   │   ├── pedido.service.ts                # Máquina de estados y comanda
│   │   ├── plato.service.ts
│   │   ├── receta.service.ts
│   │   ├── ubicacion.service.ts
│   │   └── usuario.service.ts
│   ├── socket/                              # Servidor y autenticación de WebSockets
│   │   └── socket.ts                        # Handshake JWT, rooms ('room:meseros', 'room:caja')
│   ├── types/                               # Tipos e interfaces de TypeScript
│   │   ├── dashboard.types.ts
│   │   ├── pago.types.ts
│   │   └── multer-storage-cloudinary.d.ts
│   ├── utils/                               # Utilidades y scripts auxiliares
│   │   ├── constants.ts
│   │   ├── facturaTemplate.ts               # Plantilla HTML para recibos de pago
│   │   ├── fechaBolivia.ts                  # Normalización de zona horaria (-04:00)
│   │   ├── seed.ts                          # Poblado de usuarios, categorías y platos
│   │   └── seedInventario.ts                # Poblado de ingredientes y recetas
│   ├── app.ts                               # Configuración de Express, CORS y middlewares
│   └── server.ts                            # Entrada principal: HTTP Server + Socket.IO + DB
├── eslint.config.cjs                        # Configuración de ESLint
├── package.json                             # Dependencias y scripts de ejecución
├── pnpm-lock.yaml                           # Bloqueo de dependencias de pnpm
├── tsconfig.json                            # Configuración del compilador TypeScript
└── vercel.json                              # Configuración para despliegue Serverless en Vercel
```

---

## 9. Arquitectura del Backend

El backend se rige estrictamente bajo el patrón de **Arquitectura en Cuatro Capas concéntricas**, asegurando separación de responsabilidades y testeabilidad:

```text
       PETICIÓN CLIENTE (HTTP / WebSocket)
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. CAPA DE ENRUTAMIENTO Y MIDDLEWARES (src/routes, src/middlewares)
│    • Enrutadores modulares de Express por recurso
│    • verificarToken: Valida firma y expiración del JWT (8h)
│    • permitirRoles / soloAdmins: Autorización RBAC estricta
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CAPA DE CONTROLADORES (src/controllers)
│    • Extracción y validación de parámetros (req.params, req.body)
│    • Invocación de casos de uso en la capa de Servicio
│    • Estandarización de respuestas JSON: { exito, mensaje, datos }
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CAPA DE SERVICIOS DE NEGOCIO (src/services)
│    • Reglas de negocio puras y máquinas de estado
│    • Autoridad monetaria: cálculo oficial de precios y totales
│    • Emisión de eventos WebSockets reactivos (src/socket)
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. CAPA DE PERSISTENCIA Y REPOSITORIOS (src/repositories, src/models)
│    • Clases Repository que encapsulan consultas Mongoose
│    • Esquemas tipados con runValidators: true en actualizaciones
│    • Conexión persistente a MongoDB Atlas
└─────────────────────────────────────────────────────────────┘
```

### Responsabilidad de cada capa:
1. **Routes:** Asigna los verbos HTTP a controladores y aplica la cadena de middlewares de seguridad.
2. **Middlewares:** Intercepta peticiones para validar identidad, vigencia del token y autorizar roles antes de comprometer recursos.
3. **Controllers:** Maneja el ciclo Request-Response. No contiene lógica de negocio pesada ni queries de base de datos; delega en los servicios y responde con códigos HTTP canónicos (200, 201, 400, 401, 403, 404, 500).
4. **Services:** Orquesta las transacciones, valida reglas de dominio complejas (disponibilidad de ingredientes, transiciones de estado de comandas) y emite notificaciones por Socket.IO.
5. **Repositories:** Abstrae las operaciones de base de datos, asegurando que las actualizaciones validen esquemas mediante `runValidators: true`.
6. **Models:** Define la estructura física documental, tipos de datos, valores por defecto, índices de unicidad e inmutabilidad temporal (`timestamps`).

---

## 10. Roles del Sistema y Control de Acceso (RBAC)

El acceso al backend está restringido mediante el enum tipado `RolUsuario`:

| Rol | Ámbito Operativo | Responsabilidades y Permisos |
| :--- | :--- | :--- |
| **`Administrador`** | Gobierno Global | Acceso irrestricto a todos los endpoints. Gestión de personal (CRUD usuarios), configuración de ubicaciones y mesas, catálogo gastronómico, recetas e ingredientes, anulación de pedidos, cobros y dashboard gerencial. |
| **`Mesero`** | Salón y Servicio | Gestión de mesas (ocupar, cambiar estado), creación de comandas (`POST /api/pedidos`), adición de platos (`PUT /api/pedidos/:id`), solicitud de cuenta de mesa (`PATCH /:id/solicitar-cuenta`) y consulta de menú. |
| **`Cocinero`** | Cocina y Fogones | Monitoreo de comandas activas, avance operativo de estados (`PATCH /api/pedidos/:id/estado` a `EN_PREPARACION` y `ENTREGADO`) y consulta técnica de recetas e ingredientes. |
| **`Cajero`** | Caja y Finanzas | Consulta de pedidos pendientes de cobro (`GET /api/pedidos/pendientes-cobro`), liquidación de pagos (`POST /api/pagos/:pedidoId/procesar`), generación de QR, despacho de recibos por email y cierre de su turno de caja (`PATCH /api/usuarios/:id/estado`). |

---

## 11. Módulos Funcionales del Backend

### M01: Autenticación y Control de Acceso
- **Objetivo:** Validación de identidad y generación de tokens de sesión stateless.
- **Modelos:** `Usuario`.
- **Endpoints Clave:** `POST /api/usuarios/login`.
- **Reglas Críticas:** Contraseñas encriptadas con bcryptjs (costo 10). JWT con TTL de 8 horas. Verificación obligatoria de `estado === true`.

### M02: Administración de Empleados
- **Objetivo:** Gobierno del personal del restaurante y turnos de caja.
- **Modelos:** `Usuario`, `CierreCaja`.
- **Endpoints Clave:** CRUD en `/api/usuarios`, `PATCH /api/usuarios/:id/estado`.
- **Reglas Críticas:** Regla de negocio que impide eliminar o desactivar al único cajero activo del sistema. Registro automático en `CierreCaja` si se desactiva un cajero con reporte.

### M03: Gestión de Categorías y Menú
- **Objetivo:** Estructuración de la carta gastronómica y fotografía de platos.
- **Modelos:** `Categoria`, `Plato`.
- **Endpoints Clave:** CRUD `/api/categorias`, CRUD `/api/platos`, `POST /api/upload`.
- **Reglas Críticas:** Subida multipart procesada en buffer de memoria hacia Cloudinary. La disponibilidad de un plato se gestiona mediante el campo booleano `disponible: boolean` en `PUT /api/platos/:id` (no existe enum "Agotado").

### M04: Disponibilidad Culinaria e Ingredientes
- **Objetivo:** Validación técnica de preparación según insumos disponibles en cocina.
- **Modelos:** `Ingrediente`, `Receta`, `Plato`.
- **Endpoints Clave:** `/api/inventario/ingredientes`, `/api/inventario/recetas`, `/api/inventario/estado`.
- **Reglas Críticas:** Motor `validarDisponibilidadIngredientes`. Exclusión semántica por notas de comanda (si se solicita *"sin cebolla"*, se omite la cebolla de la validación). Control puramente cualitativo/booleano (sin kardex numérico).

### M05: Ubicaciones y Mesas
- **Objetivo:** Administración del plano físico y control de ocupación en tiempo real.
- **Modelos:** `Ubicacion`, `Mesa`.
- **Endpoints Clave:** CRUD `/api/ubicaciones`, CRUD `/api/mesas`, `PATCH /api/mesas/:id/estado`.
- **WebSockets:** Emite `mesas:updated`, `mesas:created`, `mesas:deleted`.
- **Reglas Críticas:** Estados válidos en base de datos: `Libre`, `Ocupada`, `Cuenta Solicitada`. Validación estricta con `runValidators: true` que rechaza estados inválidos con HTTP 400.

### M06: Gestión de Pedidos
- **Objetivo:** Registro, congelamiento de precios, observaciones y seguimiento de comandas en mesa.
- **Modelos:** `Pedido`, `Contador`, `Mesa`, `Plato`.
- **Endpoints Clave:** `POST /api/pedidos`, `GET /api/pedidos`, `PUT /api/pedidos/:id`, `PATCH /api/pedidos/:id/solicitar-cuenta`, `PATCH /api/pedidos/:id/cancel`.
- **WebSockets:** Emite `cocina:nuevo_pedido`, `caja:solicitud_pago`.
- **Reglas Críticas:**
  1. *Creación:* Código correlativo atómico `PED-XXXX`, validación de recetas e ingredientes, precios unitarios congelados desde la base de datos y mesa pasa a `Ocupada`.
  2. *Modificación:* `PUT /:id` permite añadir platos recalculando importes autoritativos. Si el pedido ya estaba en `ENTREGADO`, se reabre automáticamente a `ABIERTO` y la mesa vuelve a `Ocupada`. Bloqueado para pedidos `CERRADO` o `CANCELADO`.
  3. *Observaciones:* Campo `observacion` por plato, analizado por el motor culinario para exclusiones de ingredientes.
  4. *Cancelación:* Solo permitida en `ABIERTO` o `EN_PREPARACION` (`PATCH /api/pedidos/:id/cancel`), liberando la mesa a `Libre`.
  5. *Solicitud de Cuenta:* Pasa la mesa a `Cuenta Solicitada` y emite `caja:solicitud_pago`.

### M07: Preparación y Seguimiento de Pedidos
- **Objetivo:** Orquestación del trabajo en fogones y alertas operativas a meseros.
- **Modelos:** `Pedido`.
- **Endpoints Clave:** `PATCH /api/pedidos/:id/estado`.
- **WebSockets:** Emite `cocina:actualizar_tablero`, `mesas:alerta_listo` a la sala `room:meseros`.
- **Reglas Críticas:** Máquina de estados estricta en cocina: `ABIERTO` -> `EN_PREPARACION` -> `ENTREGADO`. No se permiten saltos arbitrarios ni retrocesos. Al transicionar a `ENTREGADO`, se dispara la alerta sonora hacia los meseros (`mesas:alerta_listo`). El estado final `CERRADO` se aplica exclusivamente en Caja al procesar el pago.

### M08: Gestión de Pagos y Cierre de Cuentas
- **Objetivo:** Liquidación monetaria, aplicación de descuentos y propinas, y liberación atómica de mesa.
- **Modelos:** `Pedido`, `Pago`, `Mesa`.
- **Endpoints Clave:** `GET /api/pedidos/pendientes-cobro`, `POST /api/pagos/:pedidoId/procesar`.
- **WebSockets:** Emite `mesas:updated` (mesa pasa a `Libre`), `mesas:pago_completado`.
- **Reglas Críticas:** El backend recalcula el subtotal oficial del pedido a partir de sus detalles e ignora cualquier `subtotalCierre` inyectado en el body. Aplica la fórmula financiera estricta: `total = subtotal - descuento + propina`. Ejecuta una transacción atómica Mongoose que asienta el registro `Pago` en estado `Pagado` con su método de pago (`Efectivo`, `Tarjeta`, `QR`), transiciona el pedido a `CERRADO` y libera la mesa a `Libre`.

### M09: Comprobantes y Pagos QR
- **Objetivo:** Generación de QR, confirmación simulada pedagógica y despacho de recibos por correo electrónico.
- **Modelos:** `Pedido`, `Pago`.
- **Endpoints Clave:** `POST /api/pagos/generar-qr/:pedidoId`, `POST /api/pagos/notificar-qr/:pedidoId`, `POST /api/pagos/:pedidoId/enviar-recibo`.
- **WebSockets:** Emite `caja:pago_confirmado`, `pedido:pago_recibido:${pedidoId}`.
- **Reglas Críticas:** El endpoint `POST /api/pagos/notificar-qr/:pedidoId` es un webhook público de simulación/notificación pedagógica que alerta a caja vía WebSockets pero **NO** constituye por sí solo el procesamiento financiero definitivo (el cobro debe ser procesado formalmente en caja mediante `POST /api/pagos/:pedidoId/procesar`). El despacho de recibos compila una plantilla HTML y la remite mediante EmailJS REST API.

### M10: Cierre de Caja y Dashboard
- **Objetivo:** Arqueo financiero de turnos y analítica gerencial en tiempo real.
- **Modelos:** `CierreCaja`, `Pago`, `Pedido`, `Mesa`, `Usuario`.
- **Endpoints Clave:** `GET /api/dashboard/resumen`.
- **Reglas Críticas:** Ejecución de pipelines de agregación en MongoDB que calculan los 8 KPIs gerenciales: Ventas Totales, Pedidos Totales, Ticket Promedio, Métodos de Pago, Platos Populares, Horas Pico, Ocupación de Mesas y Rendimiento por Empleado.

---

## 12. Catálogo de Endpoints (API Reference)

### 12.1. Health Check
- `GET /api/health`
  - **Auth:** Pública.
  - **Descripción:** Verifica el estado operativo del backend.
  - **Respuesta:** `200 OK` `{ status: "success", message: "API de Sabor & Gestión funcionando correctamente 🚀" }`.

### 12.2. Autenticación y Usuarios
- `POST /api/usuarios/login`
  - **Auth:** Pública.
  - **Body:** `{ "username": "admin", "password": "password123" }`.
  - **Respuesta:** `200 OK` `{ exito: true, token: "...", usuario: { id, nombre, rol, ... } }`.
- `GET /api/usuarios`
  - **Auth:** `verificarToken`. Roles: Todos los autenticados.
  - **Respuesta:** `200 OK` Lista de empleados activos e inactivos.
- `POST /api/usuarios`
  - **Auth:** `verificarToken, soloAdmins`.
  - **Body:** `{ "nombre", "apellido", "ci", "username", "password", "rol", "email" }`.
- `PUT /api/usuarios/:id`
  - **Auth:** `verificarToken, soloAdmins`. Actualiza datos personales o rol.
- `PATCH /api/usuarios/:id/estado`
  - **Auth:** `verificarToken, permitirRoles('Administrador', 'Cajero')`.
  - **Body:** `{ "estado": false, "reporte": { totalDia, efectivo, tarjeta, qr, ... } }`.
- `DELETE /api/usuarios/:id`
  - **Auth:** `verificarToken, soloAdmins`. Eliminación física con protección de último cajero.

### 12.3. Categorías y Menú
- `GET /api/categorias`: Pública. Lista todas las categorías activas.
- `POST /api/categorias`: `verificarToken, soloAdmins`. Crea categoría.
- `PUT /api/categorias/:id`: `verificarToken, soloAdmins`. Modifica categoría.
- `DELETE /api/categorias/:id`: `verificarToken, soloAdmins`. Elimina categoría.
- `GET /api/platos`: Pública. Lista platos del catálogo.
- `GET /api/platos/:id`: `verificarToken`. Detalle técnico de un plato.
- `POST /api/platos`: `verificarToken, soloAdmins`. Crea plato con foto previa de Cloudinary.
- `PUT /api/platos/:id`: `verificarToken, soloAdmins`. Actualiza plato y `disponible`.
- `DELETE /api/platos/:id`: `verificarToken, soloAdmins`. Elimina plato.
- `POST /api/upload`: `verificarToken, soloAdmins`. Recibe `multipart/form-data` con campo `imagen`. Sube a Cloudinary y retorna `{ imagenUrl, imagenPublicId }`.

### 12.4. Inventario Culinario y Recetas
- `GET /api/inventario/estado`: `verificarToken`. Disponibilidad de platos e insumos.
- `GET /api/inventario/ingredientes`: `verificarToken`. Lista ingredientes.
- `POST /api/inventario/ingredientes`: `verificarToken, soloAdmins`. Registra insumo.
- `PUT /api/inventario/ingredientes/:id`: `verificarToken, soloAdmins`. Modifica insumo/disponibilidad.
- `DELETE /api/inventario/ingredientes/:id`: `verificarToken, soloAdmins`. Elimina insumo.
- `GET /api/inventario/recetas`: `verificarToken`. Lista recetas y vinculación plato-insumo.
- `POST /api/inventario/recetas`: `verificarToken, soloAdmins`. Guarda receta de un plato.
- `DELETE /api/inventario/recetas/:id`: `verificarToken, soloAdmins`. Elimina receta.

### 12.5. Ubicaciones y Mesas
- `GET /api/ubicaciones`: `verificarToken`. Lista áreas físicas.
- `POST /api/ubicaciones`: `verificarToken, soloAdmins`. Crea ubicación.
- `PUT /api/ubicaciones/:id`: `verificarToken, soloAdmins`. Actualiza ubicación.
- `DELETE /api/ubicaciones/:id`: `verificarToken, soloAdmins`. Elimina ubicación.
- `GET /api/mesas`: `verificarToken`. Lista mesas registradas.
- `GET /api/mesas/:id`: `verificarToken`. Consulta mesa por ID.
- `POST /api/mesas`: `verificarToken, soloAdmins`. Crea mesa vinculada a ubicación.
- `PUT /api/mesas/:id`: `verificarToken, soloAdmins`. Modifica capacidad/ubicación.
- `PATCH /api/mesas/:id/estado`: `verificarToken, permitirRoles('Mesero', 'Administrador')`.
  - **Body:** `{ "estado": "Ocupada" }` (Valores: `Libre`, `Ocupada`, `Cuenta Solicitada`).
- `DELETE /api/mesas/:id`: `verificarToken, soloAdmins`. Elimina mesa.

### 12.6. Comandas y Pedidos
- `POST /api/pedidos`: `verificarToken, permitirRoles('Mesero', 'Administrador')`.
  - **Body:** `{ "mesa": "<MesaID>", "detalles": [{ "plato": "<PlatoID>", "cantidad": 2, "notas": "sin sal" }] }`.
- `GET /api/pedidos`: `verificarToken`. Lista comandas con filtros opcionales.
- `GET /api/pedidos/pendientes-cobro`: `verificarToken, permitirRoles('Cajero', 'Administrador')`. Lista pedidos en espera de cobro.
- `PUT /api/pedidos/:id`: `verificarToken, permitirRoles('Mesero', 'Administrador')`. Agrega platos adicionales recalculando importes.
- `PATCH /api/pedidos/:id/estado`: `verificarToken, permitirRoles('Cocinero', 'Administrador')`.
  - **Body:** `{ "estado": "EN_PREPARACION" | "ENTREGADO" }`.
- `PATCH /api/pedidos/:id/solicitar-cuenta`: `verificarToken, permitirRoles('Mesero', 'Administrador')`. Pasa mesa a `Cuenta Solicitada`.
- `PATCH /api/pedidos/:id/cancel`: `verificarToken, permitirRoles('Mesero', 'Administrador')`. Cancela pedido no procesado.

### 12.7. Pagos y Cobro
- `POST /api/pagos/generar-qr/:pedidoId`: `verificarToken`. Retorna URL de imagen QR generada con monto y código.
- `POST /api/pagos/:pedidoId/procesar`: `verificarToken, permitirRoles('Cajero', 'Administrador')`.
  - **Body:** `{ "metodoPago": "Efectivo" | "Tarjeta" | "QR", "porcentajeDescuento": 0, "porcentajePropina": 0 }`.
  - **Respuesta:** `200 OK` `{ mensaje: "Pago procesado exitosamente", comprobante: { ... } }`.
- `POST /api/pagos/notificar-qr/:pedidoId`: Pública (Simulación). Emite WebSockets a caja sin alterar la base monetaria.
- `POST /api/pagos/:pedidoId/enviar-recibo`: `verificarToken, permitirRoles('Cajero', 'Administrador')`.
  - **Body:** `{ "email": "cliente@correo.com", "clienteNombre": "Juan Pérez", "clienteCI": "1234567" }`.

### 12.8. Dashboard Gerencial
- `GET /api/dashboard/resumen`: `verificarToken, soloAdmins`. Retorna los 8 KPIs consolidados en tiempo real.

---

## 13. Autenticación y Autorización

El backend utiliza autenticación **Stateless basada en JSON Web Tokens (JWT)**:

```text
CLIENTE HTTP
     │  POST /api/usuarios/login { username, password }
     ▼
usuario.controller -> usuario.service
     ├── 1. Busca usuario activo en colección 'usuarios'
     ├── 2. Valida hash con bcryptjs.compare(password, user.password)
     └── 3. Genera token JWT: jwt.sign({ id, rol }, JWT_SECRET, { expiresIn: '8h' })
     │
     ▼ Retorna { exito: true, token: "eyJhbGciOi..." }
CLIENTE ALMACENA TOKEN
     │
     │  Petición protegida: GET /api/dashboard/resumen
     │  Header HTTP: "Authorization: Bearer eyJhbGciOi..."
     ▼
verificarToken (auth.middleware.ts)
     ├── Valida formato Bearer y firma criptográfica con JWT_SECRET
     └── Inyecta req.usuario = { id, rol }
     │
     ▼
permitirRoles('Administrador') (rol.middleware.ts)
     ├── Si req.usuario.rol coincide -> next()
     └── Si no coincide -> Retorna HTTP 403 Forbidden
```

- **Duración del Token:** 8 horas continuas (cubre un turno gastronómico completo).
- **Usuario Inactivo:** Si el usuario tiene `estado: false`, el login rechaza la sesión con código HTTP 401.

---

## 14. Comandos de Desarrollo y Ejecución

Todos los scripts disponibles en `package.json`:

```bash
# Iniciar servidor en modo desarrollo con recarga en vivo (nodemon + tsx)
pnpm run dev

# Compilar código TypeScript a JavaScript en la carpeta dist/
pnpm run build

# Ejecutar el servidor compilado en producción
pnpm start

# Ejecutar el linter para comprobar calidad de código
pnpm run lint

# Formatear el código fuente con Prettier
pnpm run format

# Ejecutar seed base (Categorías, Platos, Mesas y Usuarios iniciales)
pnpm run seed

# Ejecutar seed culinario (Ingredientes y Recetas)
pnpm run seed:inventario
```

---

## 15. Estrategia de Pruebas y Aseguramiento de Calidad

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

## 16. WebSockets en Tiempo Real (Socket.IO)

El servidor Socket.IO se encuentra inicializado sobre el servidor HTTP nativo en [`src/socket/socket.ts`](file:///home/fercho/Software/sabor-gestion-backend-personal/src/socket/socket.ts).

### 16.1. Handshake y Autenticación
El cliente debe proporcionar su token JWT en el handshake inicial:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'eyJhbGciOi...' // Token JWT obtenido en login
  }
});
```

### 16.2. Salas Lógicas (Rooms)
Al autenticar el socket, el servidor asocia al usuario a salas temáticas según su rol:
- Si `rol === 'Mesero'`: Se une a `room:meseros`.
- Si `rol === 'Cajero'`: Se une a `room:caja` y a su canal personal `user:${usuarioId}`.

### 16.3. Catálogo de Eventos Reales

| Evento | Dirección | Origen / Disparador | Destinatarios | Payload / Datos |
| :--- | :---: | :--- | :--- | :--- |
| `cocina:nuevo_pedido` | Server -> Client | `POST /api/pedidos` | Global (Cocina) | Documento comanda poblada |
| `cocina:actualizar_tablero` | Server -> Client | `PATCH /pedidos/:id/estado`, `PUT /pedidos/:id`, `POST /pagos/:id/procesar` | Global (Cocina) | Comanda actualizada |
| `mesas:alerta_listo` | Server -> Client | `PATCH /pedidos/:id/estado` (`ENTREGADO`) | `room:meseros` | `{ pedidoId, mesaId, mesaNombre }` (Activa timbre sonoro) |
| `mesas:updated` | Server -> Client | Cambio de estado de mesa, pedido creado, pago procesado | Global (Salón/Caja) | `{ id, status, name }` |
| `mesas:pago_completado` | Server -> Client | `POST /api/pagos/:pedidoId/procesar` | Global | `{ mesaId, mesaNombre, pedidoId, mensaje }` |
| `caja:solicitud_pago` / `caja:nueva_cuenta` | Server -> Client | `PATCH /pedidos/:id/solicitar-cuenta` | `room:caja` y `user:${cajeroId}` | Datos de la mesa y total a cobrar |
| `caja:pago_confirmado` | Server -> Client | `POST /api/pagos/notificar-qr/:pedidoId` | Global (Caja) | `{ pedidoId, mensaje, fecha }` |
| `pedido:pago_recibido:${pedidoId}` | Server -> Client | `POST /api/pagos/notificar-qr/:pedidoId` | Sala del pedido | `{ pedidoId, mensaje, pedido }` |
| `inventario:actualizado` | Server -> Client | Mutación de ingredientes o recetas | Global | Señal de actualización |

---

## 17. Configuración de Servicios Externos

### 17.1. MongoDB Atlas
- **Objetivo:** Persistencia NoSQL administrada en clúster cloud.
- **Variables:** `MONGO_URI`.
- **Comportamiento ante falla:** El servidor no inicia (`process.exit(1)`).

### 17.2. Cloudinary
- **Objetivo:** CDN y repositorio multimedia para imágenes de platos.
- **Variables:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- **Integración:** [`src/configs/cloudinary.ts`](file:///home/fercho/Software/sabor-gestion-backend-personal/src/configs/cloudinary.ts) configura la instancia del SDK `cloudinary.v2` y exporta `upload` de Multer con almacenamiento en memoria.
- **Comportamiento ante falla:** `POST /api/upload` retorna HTTP 500 y no guarda la foto.

### 17.3. EmailJS (Servicio de Recibos por Correo)
- **Objetivo:** Despacho de comprobantes digitales de pago formateados en HTML.
- **Variables:** `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_USER_ID`, `EMAILJS_ACCESS_TOKEN`.
- **Integración:** [`src/services/email.service.ts`](file:///home/fercho/Software/sabor-gestion-backend-personal/src/services/email.service.ts) realiza una solicitud HTTP `fetch` hacia `https://api.emailjs.com/api/v1.0/email/send`.
- **Comportamiento ante falla:** Retorna error controlado sin revertir la transacción de pago (el cobro ya quedó registrado en base de datos).

### 17.4. Generador de Códigos QR (QRServer API)
- **Objetivo:** Renderizar códigos QR con el monto y número de comanda para simular pagos digitales.
- **Integración:** Generación de URL pública en [`src/services/pago.service.ts`](file:///home/fercho/Software/sabor-gestion-backend-personal/src/services/pago.service.ts):
  `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=SABOR_GESTION_ID_<ID>_TOTAL_<TOTAL>`

---

## 18. Medidas de Seguridad Implementadas

1. **Tokens Criptográficos Stateless (JWT):** Firmados con algoritmo HMAC-SHA256, vigencia de 8 horas e inspección en cada petición HTTP o conexión WebSocket.
2. **Hashing de Contraseñas:** Algoritmo bcryptjs con 10 rondas de salt; las contraseñas en texto plano nunca se registran ni persisten.
3. **Control de Acceso Basado en Roles (RBAC):** Middleware `permitirRoles` que rechaza peticiones con HTTP 403 Forbidden antes de alcanzar la capa de servicio.
4. **Validación de Esquema en Base de Datos:** Todas las operaciones de repositorio utilizan `runValidators: true` en `findByIdAndUpdate`, impidiendo estados fuera de los enums establecidos.
5. **Autoridad Monetaria Absoluta:** Los subtotales y totales son calculados internamente consultando los precios del catálogo; los valores monetarios enviados en el body del cliente son descartados.
6. **Protección contra Mass Assignment:** Los endpoints de actualización (`PUT /api/pedidos/:id`) filtran estrictamente los campos modificables y descartan campos de control financiero e importes no autorizados (`total`, `subtotal`, `subtotalCierre`, `estado`).
7. **Protección de Último Cajero:** Regla transaccional en el servicio de usuarios que prohíbe dejar el sistema sin cajeros habilitados para operar.
8. **Protección de Entornos en Seeds:** Los scripts destructivos (`seed.ts`, `seedInventario.ts`) abortan de inmediato si `NODE_ENV === 'production'`.
9. **CORS Restringido:** Configurado en `src/app.ts` y `src/socket/socket.ts` limitando orígenes a terminales autorizadas (`localhost:5173`, `localhost:5174`, `https://quirquinita.onrender.com`, `https://tis-pied.vercel.app`).
10. **Manejo Centralizado de Excepciones:** Respuestas de error estandarizadas evitando fugas de stack traces internos del servidor.

---

## 19. Configuración para Producción

1. **Compilación estricta:** Ejecutar `pnpm run build` para generar los archivos JavaScript compilados en la carpeta `dist/`.
2. **Definir `NODE_ENV=production`:** Asegura que los scripts destructivos no puedan limpiar la base de datos y que las herramientas de desarrollo no expongan información sensible.
3. **Ejecución con proceso Node:** En producción se ejecuta `pnpm start` (`node dist/server.js`), preferentemente gestionado por un administrador de procesos como **PM2** o el supervisor nativo de la plataforma cloud.
4. **Proxy Inverso:** Si se aloja en VPS (Nginx), configurar cabeceras `Upgrade` y `Connection "Upgrade"` para soportar el túnel WebSocket de Socket.IO.

---

## 20. Guía de Despliegue

### Despliegue en Vercel (Configuración nativa del repositorio)
El repositorio cuenta con [`vercel.json`](file:///home/fercho/Software/sabor-gestion-backend-personal/vercel.json) configurado para construir y servir el backend mediante `@vercel/node`:
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

**Pasos para desplegar en Vercel:**
1. Conectar el repositorio de GitHub en el panel de Vercel.
2. Configurar el Framework Preset como `Other`.
3. Configurar todas las **Variables de Entorno** obligatorias (`MONGO_URI`, `JWT_SECRET`, etc.).
4. Ejecutar el Deploy. Vercel compilará `src/server.ts` y expondrá la API.
5. Validar con el endpoint de Health Check: `https://tu-proyecto.vercel.app/api/health`.

> [!NOTE]
> Para entornos con soporte continuo de WebSockets (Socket.IO bidireccional permanente), se recomienda un entorno basado en contenedores o servidores persistentes como **Render**, **Railway** o un **VPS**.

---

## 21. Health Check y Verificación del Sistema

El backend expone un endpoint público de verificación de salud en `GET /api/health`.

### Prueba mediante cURL:
```bash
curl -X GET http://localhost:3000/api/health
```

### Respuesta esperada (HTTP 200 OK):
```json
{
  "status": "success",
  "message": "API de Sabor & Gestión funcionando correctamente 🚀"
}
```

---

## 22. Flujo Operativo Secuencial del Sistema

```text
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. INICIO DE SESIÓN                                         │
 │    Empleado ingresa credenciales en POST /api/usuarios/login │
 │    └── Retorna Token JWT (8h) con rol correspondiente       │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 2. ASIGNACIÓN Y OCUPACIÓN DE MESA (M05)                     │
 │    Mesero ejecuta PATCH /api/mesas/:id/estado { "Ocupada" } │
 │    └── Emite WebSocket 'mesas:updated'                      │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 3. CONSULTA DE MENÚ Y COMANDA (M03, M04, M06)               │
 │    Mesero verifica disponibilidad y crea orden:             │
 │    POST /api/pedidos { mesa, detalles: [...] }              │
 │    ├── Congela precios unitarios oficiales de 'platos'      │
 │    ├── Genera correlativo 'PED-XXXX'                        │
 │    └── Emite WebSocket 'cocina:nuevo_pedido'                │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 4. PREPARACIÓN EN COCINA (M07)                              │
 │    Cocinero avanza estado en PATCH /api/pedidos/:id/estado: │
 │    ├── A) 'EN_PREPARACION' -> Emite 'cocina:actualizar_tablero'│
 │    └── B) 'ENTREGADO' -> Emite 'mesas:alerta_listo' a mesero│
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 5. SOLICITUD DE CUENTA (M06)                                │
 │    Mesero ejecuta PATCH /api/pedidos/:id/solicitar-cuenta   │
 │    ├── Mesa pasa a 'Cuenta Solicitada'                      │
 │    └── Emite WebSocket 'caja:solicitud_pago' a cajeros      │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 6. COBRO Y LIQUIDACIÓN (M08, M09)                           │
 │    Cajero ejecuta POST /api/pagos/:pedidoId/procesar        │
 │    ├── Backend calcula subtotal autoritativo + descuento    │
 │    ├── Pedido pasa a 'CERRADO'                              │
 │    ├── Mesa pasa a 'Libre' -> Emite 'mesas:updated'         │
 │    └── Se crea registro 'Pago' en estado 'Pagado'           │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 7. COMPROBANTE Y ARQUEO FINAL (M09, M10)                    │
 │    ├── Cajero envía recibo HTML vía POST /:id/enviar-recibo │
 │    ├── Al terminar turno se guarda balance en 'CierreCaja'  │
 │    └── Administrador monitorea métricas en /dashboard/resumen│
 └─────────────────────────────────────────────────────────────┘
```

---

## 23. Estados Canónicos del Dominio

### 23.1. Estados de Mesa (`src/models/Mesa.ts`)
| Estado | Descripción | Transición Habitual |
| :--- | :--- | :--- |
| **`Libre`** | Mesa disponible para recibir clientes | Pasa a `Ocupada` al crear pedido o sentar comensales |
| **`Ocupada`** | Comensales consumiendo activamente | Pasa a `Cuenta Solicitada` al pedir la cuenta |
| **`Cuenta Solicitada`** | Comanda en proceso de pago en caja | Pasa a `Libre` automáticamente al procesar el pago |

*Nota:* Aliases de frontend como `"Disponible"` y `"Esperando pago"` son normalizados por el servicio hacia `Libre` y `Cuenta Solicitada` respectivamente.

### 23.2. Estados de Pedido (`src/models/Pedido.ts`)
| Estado | Descripción | Transición Permitida |
| :--- | :--- | :--- |
| **`ABIERTO`** | Comanda registrada en espera de fogones | Pasa a `EN_PREPARACION` o `CANCELADO` |
| **`EN_PREPARACION`** | Chef elaborando los platos en cocina | Pasa a `ENTREGADO` |
| **`ENTREGADO`** | Platos servidos en la mesa | Pasa a `CERRADO` (o reabre a `ABIERTO` si se agregan platos) |
| **`CANCELADO`** | Pedido anulado y mesa liberada | Estado final inmutable |
| **`CERRADO`** | Cuenta liquidada y cobrada formalmente | Estado final inmutable |

### 23.3. Estados de Pago (`src/models/Pago.ts`)
| Estado | Descripción |
| :--- | :--- |
| **`Pendiente`** | Registro de cuenta emitido antes de cobrar |
| **`Procesado`** | Transacción en verificación |
| **`Pagado`** | Pago formalmente liquidado y asentado |
| **`Anulado`** | Cobro revocado o cancelado |

---

## 24. Reglas de Negocio Críticas

1. **Autoridad Monetaria del Backend:** Ningún importe monetario enviado por el frontend (`total`, `subtotal`, `subtotalCierre`) es aceptado como autoridad. El backend consulta el catálogo de platos y calcula la suma oficial.
2. **Máquina de Estados de Cocina No Violable:** Un pedido `ABIERTO` no puede saltar directo a `ENTREGADO`. Un pedido `ENTREGADO` no puede retroceder a `EN_PREPARACION`.
3. **Reapertura de Comandas:** Si un comensal pide platos adicionales sobre un pedido que ya estaba `ENTREGADO`, la comanda se reabre automáticamente a `ABIERTO` para alertar a cocina sobre la nueva tanda.
4. **Protección de Cajeros:** El sistema valida que siempre exista al menos un usuario activo con rol `Cajero`. No se permite eliminar ni suspender al último cajero operativo.
5. **Aislamiento de la Simulación QR:** El endpoint `POST /api/pagos/notificar-qr/:pedidoId` solo emite avisos de socket a caja; bajo ninguna circunstancia liquida dinero ni cierra el pedido automáticamente en base de datos.
6. **Inmutabilidad de Registros Cerrados:** Comandas con estado `CERRADO` o `CANCELADO` quedan congeladas frente a modificaciones posteriores.

---

## 25. Solución de Problemas Comunes (Troubleshooting)

### Problema 1: `FATAL ERROR: JWT_SECRET no está configurado`
- **Causa:** Falta definir la variable `JWT_SECRET` en el archivo `.env`.
- **Solución:** Agregue `JWT_SECRET=tu_clave_secreta` en `.env` y reinicie el servidor.

### Problema 2: `Error conectando a MongoDB: MongoServerSelectionError`
- **Causa:** La IP de su máquina no está autorizada en la Network Access List de MongoDB Atlas, o `MONGO_URI` contiene credenciales incorrectas.
- **Solución:** Ingrese a MongoDB Atlas -> Network Access -> Add IP Address (añada su IP actual o `0.0.0.0/0` temporalmente para pruebas). Verifique usuario y contraseña.

### Problema 3: Error `EADDRINUSE: address already in use :::3000`
- **Causa:** Otro proceso o instancia previa de Node.js está ocupando el puerto 3000.
- **Solución:** Mate el proceso existente o cambie el puerto en `.env` (`PORT=5000`):
  ```bash
  npx kill-port 3000
  ```

### Problema 4: `Error al subir imagen a Cloudinary (500 Internal Server Error)`
- **Causa:** Las variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` o `CLOUDINARY_API_SECRET` están ausentes o son inválidas.
- **Solución:** Verifique sus credenciales en el panel de Cloudinary y asegúrese de que el formulario multipart envíe el archivo bajo la clave `"imagen"`.

### Problema 5: `Socket rechazado (sin token)`
- **Causa:** El cliente WebSocket intentó conectarse sin proveer el token JWT en el handshake.
- **Solución:** Pase `{ auth: { token } }` en las opciones de conexión del cliente `socket.io-client`.

---

## 26. Flujo de Trabajo para Nuevos Desarrolladores

Para comenzar a desarrollar en el repositorio:
1. Clonar el repositorio y acceder a la carpeta.
2. Instalar dependencias con `pnpm install`.
3. Crear el archivo `.env` configurando `MONGO_URI` y `JWT_SECRET`.
4. Poblar la base de datos de desarrollo con datos de prueba:
   ```bash
   pnpm run seed
   pnpm run seed:inventario
   ```
5. Iniciar el servidor en modo desarrollo:
   ```bash
   pnpm run dev
   ```
6. Abrir `http://localhost:3000/api/health` en el navegador para comprobar funcionamiento.
7. Importar [`docs/openapi.yaml`](file:///home/fercho/Software/sabor-gestion-backend-personal/docs/openapi.yaml) en Swagger Editor o Postman para interactuar con los endpoints.

---

## 27. Documentación Técnica Relacionada

- **Especificación OpenAPI 3.0.3:** [`docs/openapi.yaml`](file:///home/fercho/Software/sabor-gestion-backend-personal/docs/openapi.yaml) (Contrato estricto y tipado de endpoints).
- **Informe de Módulos del Backend (PDF):** [`docs/Informe_Modulos_Backend_Sabor_Gestion.pdf`](file:///home/fercho/Software/sabor-gestion-backend-personal/docs/Informe_Modulos_Backend_Sabor_Gestion.pdf) (Documento formal académico de arquitectura).
- **Bitácora de Incidentes y Hardening:** [`docs/informe_incidentes_y_correcciones_backend.md`](file:///home/fercho/Software/sabor-gestion-backend-personal/docs/informe_incidentes_y_correcciones_backend.md) (Auditoría técnica de resolución de los incidentes BUG-01 a BUG-05).
- **Informe Funcional:** [`docs/informe_funcional_backend.md`](file:///home/fercho/Software/sabor-gestion-backend-personal/docs/informe_funcional_backend.md).

---

## 28. Limitaciones Actuales y Decisiones de Diseño

- **Simulación Académica de Pagos QR:** El flujo de cobro QR está implementado para fines pedagógicos y de validación de experiencia de usuario mediante WebSockets; no liquida transacciones en redes financieras bancarias reales.
- **Disponibilidad Culinaria vs. Kardex Numérico:** El sistema gestiona la viabilidad culinaria mediante estados booleanos (`disponible: true/false`) de platos e insumos, sin llevar un conteo numérico de existencias por gramaje o porciones de almacén.
- **Exclusividad B2B Interna:** El backend está diseñado para terminales de personal de salón, cocina y caja; no provee interfaces ni sesiones para clientes comensales.
- **Mesas en Rotación en Vivo:** El sistema no administra reservas de días u horas futuras, priorizando la atención de mesas en tiempo real.

---

## 29. Conclusión

El backend de **Sabor & Gestión** representa una solución arquitectónica madura, fuertemente tipada y de alta cohesión. Gracias a su estructura desacoplada en cuatro capas, el aislamiento estricto de roles (RBAC), su autoridad matemática sobre transacciones monetarias y la sincronización bidireccional mediante WebSockets, el sistema garantiza estabilidad, trazabilidad y rendimiento en el entorno exigente de un restaurante moderno.

---

**Autor / Desarrollador:** Fernando Banda Téllez  
**Proyecto:** Sistema de Gestión Gastronómica — Sabor & Gestión  
**Repositorio:** `sabor-gestion-backend-personal`  
**Estado:** Auditado, Asegurado y Listo para Integración (Octubre 2026)

