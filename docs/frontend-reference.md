# Guía Técnica de Integración Backend – Frontend: Sabor & Gestión

> **Documento Oficial de Integración Técnica**  
> **Destinatarios:** Desarrolladores Frontend, Arquitectos de Software y Agentes de IA  
> **Sistema Backend:** `sabor-gestion-backend-personal`  
> **Versión de Referencia:** 1.0.0  

---

## Índice General

1. [Información General](#1-información-general)
2. [Autenticación y Ciclo de Vida de Sesión](#2-autenticación-y-ciclo-de-vida-de-sesión)
3. [Roles y Control de Acceso Basado en Roles (RBAC)](#3-roles-y-control-de-acceso-basado-en-roles-rbac)
4. [Contrato de la API REST por Módulos](#4-contrato-de-la-api-rest-por-módulos)
5. [Entidades de Dominio (TypeScript)](#5-entidades-de-dominio-typescript)
6. [Máquinas de Estado y Transiciones](#6-máquinas-de-estado-y-transiciones)
7. [Reglas de Negocio Críticas](#7-reglas-de-negocio-críticas)
8. [Flujos Funcionales E2E](#8-flujos-funcionales-e2e)
9. [Integración en Tiempo Real con WebSockets (Socket.IO)](#9-integración-en-tiempo-real-con-websockets-socketio)
10. [Manejo de Errores y Códigos de Respuesta HTTP](#10-manejo-de-errores-y-códigos-de-respuesta-http)
11. [Convenciones de Datos, Moneda y Fechas](#11-convenciones-de-datos-moneda-y-fechas)
12. [Restricciones del Frontend (Reglas que el Frontend NO debe asumir)](#12-restricciones-del-frontend-reglas-que-el-frontend-no-debe-asumir)
13. [Lista de Verificación para el Desarrollador Frontend](#13-lista-de-verificación-para-el-desarrollador-frontend)
14. [Fuentes de Verdad y Registro de Discrepancias](#14-fuentes-de-verdad-y-registro-de-discrepancias)

---

# 1. Información General

### 1.1 Entorno de Ejecución, Puertos y Variables para Next.js
- **Protocolo y Host Base del Backend (Desarrollo):** `http://localhost:3000`
- **Puerto del Servidor Backend:** `3000` (definido por defecto o configurado en la variable de entorno `PORT` en `.env`).
- **Puerto Asignado al Frontend (Next.js):** Para evitar colisiones en `localhost`, el frontend en Next.js debe ejecutarse en el puerto **`3001`** (por ejemplo, mediante `"dev": "next dev -p 3001"` en su `package.json`).
- **Prefijo Global de la API:** `/api`
- **Formato de Comunicación:** `application/json` (excepto subida de archivos que emplea `multipart/form-data`).
- **Codificación de Caracteres:** `UTF-8`.

#### Variables de Entorno del Cliente (Next.js)
El frontend debe configurar en su archivo `.env.local`:
```env
# URL base para el consumo de la API REST
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# URL base para la conexión de WebSockets (Socket.IO)
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```
> **Advertencia de Seguridad:** Nunca expongas secretos de servidor ni claves criptográficas mediante el prefijo `NEXT_PUBLIC_*`. Únicamente las URLs públicas de enlace con el backend deben llevar este prefijo en Next.js.

### 1.2 Endpoint de Comprobación de Salud (Healthcheck)
Permite al frontend verificar la disponibilidad del servidor antes de iniciar peticiones operativas o reconexiones.

- **Método y Ruta:** `GET /api/health`
- **Autenticación:** Pública (no requiere token ni cabeceras especiales).
- **Respuesta Exitosa (HTTP 200 OK):**
```json
{
  "status": "success",
  "message": "API de Sabor & Gestión funcionando correctamente 🚀"
}
```

### 1.3 Formato General de Respuestas
El backend responde de acuerdo a las convenciones REST estándar:
- **Colecciones / Listados:** Devuelve directamente un arreglo de objetos JSON `[ { ... }, { ... } ]`.
- **Operaciones de Mutación (Creación, Actualización, Eliminación):** Devuelven un objeto con mensaje descriptivo y los datos actualizados, habitualmente bajo la estructura:
```json
{
  "mensaje": "Descripción de la operación exitosa",
  "usuario": { ... } // O "pedido", "comprobante", "receta", etc.
}
```
- **Errores:** Devuelven un objeto JSON con la propiedad `mensaje` y, cuando aplique, metadatos adicionales (por ejemplo `errores` o `faltantes` en validación de disponibilidad de ingredientes):
```json
{
  "mensaje": "Descripción del error ocurrido"
}
```

---

# 2. Autenticación y Ciclo de Vida de Sesión

### 2.1 Endpoint de Inicio de Sesión
El personal operativo (Administrador, Mesero, Cajero, Cocinero) se autentica mediante sus credenciales institucionales.

- **Método y Ruta:** `POST /api/usuarios/login`
- **Autenticación Requerida:** Ninguna (Ruta Pública).
- **Cuerpo de la Solicitud (Request Body):**
```json
{
  "email": "admin@sabor.com",
  "password": "Password123!"
}
```
> **Nota de Implementación:** El campo de identificación es **`email`**, no `username`. El backend realiza sanitización `trim()` y búsqueda insensible a mayúsculas.

- **Respuesta Exitosa (HTTP 200 OK):**
```json
{
  "mensaje": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": "651f8a7e3b9c1d2e4f5a6b7c",
    "nombre": "Fernando",
    "apellido": "Banda",
    "ci": "1234567",
    "email": "admin@sabor.com",
    "rol": "Administrador",
    "estado": true,
    "verificado": true,
    "createdAt": "2026-10-01T12:00:00.000Z",
    "updatedAt": "2026-10-01T12:00:00.000Z"
  }
}
```

### 2.2 Estructura del Token JWT
- **Algoritmo de Firma:** HMAC-SHA256 (`HS256`) utilizando la clave secreta `JWT_SECRET`.
- **Tiempo de Validez:** Exactamente **8 horas** (`expiresIn: '8h'`).
- **Contenido del Payload Decodificado:**
```typescript
interface UsuarioTokenPayload {
  id: string       // ObjectId del usuario en MongoDB
  rol: string      // 'Administrador' | 'Mesero' | 'Cajero' | 'Cocinero'
  iat: number      // Timestamp Unix de emisión
  exp: number      // Timestamp Unix de expiración (iat + 28800s)
}
```

### 2.3 Envío del Token en Peticiones HTTP
Para todas las rutas protegidas, el frontend debe adjuntar el token en la cabecera estándar HTTP `Authorization`:
```http
Authorization: Bearer <TOKEN_JWT>
```

### 2.4 Comportamiento y Respuestas de Error de Autenticación (HTTP 401)
El middleware `verificarToken` intercepta las solicitudes no autorizadas:
- **Cabecera `Authorization` ausente:**
  - Código: `401 Unauthorized`
  - Cuerpo: `{"mensaje": "Acceso denegado. No se proporcionó un token."}`
- **Token alterado, malformado o expirado:**
  - Código: `401 Unauthorized`
  - Cuerpo: `{"mensaje": "Token inválido o expirado."}`
- **Credenciales incorrectas durante el login:**
  - Código: `401 Unauthorized`
  - Cuerpo: `{"mensaje": "Credenciales inválidas"}`
- **Usuario desactivado en base de datos (`estado: false`):**
  - Código: `401 Unauthorized`
  - Cuerpo: `{"mensaje": "Usuario inactivo"}`

> **Regla de Almacenamiento en Frontend:** El backend no impone la forma en que el frontend almacena el token. La aplicación cliente Next.js puede emplear cookies seguras (`cookies-next`), `localStorage`, `sessionStorage` o estado en memoria, siempre que garantice adjuntar la cabecera `Authorization: Bearer <token>` en cada invocación REST y durante el handshake de Socket.IO.

---

# 3. Roles y Control de Acceso Basado en Roles (RBAC)

El backend define cuatro (4) roles jerárquicos y operativos. No existen roles adicionales.

| Rol Oficial | Propósito Operativo | Acciones Permitidas en Backend |
|:---|:---|:---|
| **Administrador** | Gestión integral y gerencial | Acceso absoluto a todos los módulos: alta, baja, modificación y eliminación de usuarios, categorías, platos, mesas, ubicaciones, ingredientes, recetas; consulta de cierres de caja y analíticas del dashboard; anulación de pedidos. |
| **Mesero** | Atención en salón y toma de órdenes | Consulta de catálogo y categorías; visualización de mesas y ubicaciones; apertura de nuevos pedidos (`POST /api/pedidos`); edición de platos y observaciones en pedidos abiertos (`PUT /api/pedidos/:id`); solicitud formal de cuenta (`PATCH /api/pedidos/:id/solicitar-cuenta`); actualización de estado operativo de mesas (`PATCH /api/mesas/:id/estado`). |
| **Cajero** | Facturación, cobros y arqueo | Consulta de pedidos pendientes de cobro (`GET /api/pedidos/pendientes-cobro`); procesamiento definitivo de pagos (`POST /api/pagos/:pedidoId/procesar`); generación y envío de comprobantes por correo; consulta de mesas y pedidos; cambio de su propio estado activo/inactivo para cierre de turno y registro de `CierreCaja`. |
| **Cocinero** | Producción culinaria y comandas | Visualización de pedidos en cocina; actualización de estados de comanda (`PATCH /api/pedidos/:id/estado` para transiciones `ABIERTO` -> `EN_PREPARACION` -> `ENTREGADO`); consulta de inventario de ingredientes y recetarios/escandallos. |

### 3.1 Respuesta de Denegación de Permisos (HTTP 403 Forbidden)
Si un usuario autenticado intenta ejecutar un endpoint que no le corresponde (por ejemplo, un Cocinero intentando cobrar una cuenta o un Mesero intentando eliminar un plato), el middleware `permitirRoles` responderá:
```json
{
  "mensaje": "Acceso denegado. No tienes permisos para realizar esta acción."
}
```

---

# 4. Contrato de la API REST por Módulos

Referencia de especificación formal OpenAPI: `docs/openapi.yaml`.

### 4.0 Alcance del Contrato y Conteo de Operaciones HTTP
- **Rutas URI Únicas (Paths):** El backend define exactamente **31 rutas URI**.
- **Operaciones HTTP Reales (Método + Ruta):** El backend implementa exactamente **47 operaciones HTTP activas**.
- **Alcance Documental:** Las 47 operaciones documentadas a continuación corresponden a la **totalidad de operaciones activas del backend** (no se trata de un subconjunto). Toda la superficie funcional del servidor está completamente cubierta.

---

### 4.1 Módulo 1: Autenticación y Empleados (`/api/usuarios`)

#### `POST /api/usuarios/login`
- **Seguridad:** Pública.
- **Request Body:** `{ "email": "...", "password": "..." }`
- **Respuestas:**
  - `200 OK`: `{ "mensaje": "Login exitoso", "token": "...", "usuario": { ... } }`
  - `400 Bad Request`: Falta correo o contraseña.
  - `401 Unauthorized`: Credenciales inválidas o usuario inactivo.

#### `GET /api/usuarios`
- **Seguridad:** Requiere Token (`verificarToken`).
- **Roles:** Cualquier usuario autenticado.
- **Respuesta:** `200 OK` con arreglo de usuarios `UsuarioNormalizado[]` (excluye contraseñas).

#### `POST /api/usuarios`
- **Seguridad:** Solo `Administrador`.
- **Request Body:** `{ "nombre": "...", "apellido": "...", "ci": "...", "email": "...", "password": "...", "rol": "..." }`
- **Respuestas:** `201 Created` con el usuario registrado o `400 Bad Request` si faltan campos o ya existe CI/correo.

#### `PUT /api/usuarios/:id`
- **Seguridad:** Solo `Administrador`.
- **Parámetros:** `id` (ObjectId de MongoDB).
- **Request Body:** `{ "nombre"?: "...", "apellido"?: "...", "email"?: "...", "rol"?: "...", "password"?: "..." }`
- **Respuestas:** `200 OK` con usuario actualizado o `404 Not Found`.

#### `PATCH /api/usuarios/:id/estado`
- **Seguridad:** `Administrador`, `Cajero`.
- **Propósito:** Activar/desactivar un usuario. Si se desactiva un Cajero (`estado: false`), registra automáticamente el arqueo en la colección `CierreCaja`.
- **Request Body:**
```json
{
  "estado": false,
  "reporte": {
    "totalDia": 1500.50,
    "efectivo": 1000.00,
    "tarjeta": 300.50,
    "qr": 200.00,
    "descuentos": 50.00,
    "propinas": 20.00,
    "pagosProcesados": 15
  }
}
```
- **Regla de Negocio:** No permite desactivar al último cajero activo del sistema (`400 Bad Request`).
- **Respuestas:** `200 OK` con `{ "mensaje": "Usuario marcado como ...", "usuario": { ... } }` o `404 Not Found`.

#### `DELETE /api/usuarios/:id`
- **Seguridad:** Solo `Administrador`.
- **Respuestas:** `200 OK` o `404 Not Found`.

---

### 4.2 Módulo 2: Categorías (`/api/categorias`)

#### `GET /api/categorias`
- **Seguridad:** Pública (permite visualización directa del menú para clientes).
- **Respuestas:** `200 OK` con arreglo `Categoria[]`.

#### `POST /api/categorias`
- **Seguridad:** Solo `Administrador`.
- **Request Body:** `{ "nombre": "Bebidas" }`
- **Respuestas:** `201 Created` o `400 Bad Request` si ya existe el nombre.

#### `PUT /api/categorias/:id`
- **Seguridad:** Solo `Administrador`.
- **Request Body:** `{ "nombre": "Bebidas Calientes" }`
- **Respuestas:** `200 OK` o `404 Not Found`.

#### `DELETE /api/categorias/:id`
- **Seguridad:** Solo `Administrador`.
- **Respuestas:** `200 OK` o `404 Not Found`.

---

### 4.3 Módulo 3: Platos y Menú (`/api/platos`)

#### `GET /api/platos`
- **Seguridad:** Pública (permite navegación de catálogo culinario sin sesión).
- **Respuestas:** `200 OK` con arreglo `Plato[]` con el campo `categoria` poblado (`_id`, `nombre`).

#### `GET /api/platos/:id`
- **Seguridad:** Requiere Token (`verificarToken`).
- **Respuestas:** `200 OK` con detalle del plato o `404 Not Found`.

#### `POST /api/platos`
- **Seguridad:** Solo `Administrador`.
- **Request Body:**
```json
{
  "nombre": "Pique Macho",
  "descripcion": "Carne de res con papas fritas, salchichas, huevo y locoto",
  "precio": 45.00,
  "categoria": "651f8a7e3b9c1d2e4f5a6b7c",
  "imagenUrl": "https://res.cloudinary.com/...",
  "imagenPublicId": "sabor/pique_macho_xyz",
  "disponible": true
}
```
- **Respuestas:** `201 Created` o `400 Bad Request` si faltan campos obligatorios.

#### `PUT /api/platos/:id`
- **Seguridad:** Solo `Administrador`.
- **Request Body:** Parcial de los campos de `Plato`. Si se sustituye la imagen, el backend destruye el recurso anterior en Cloudinary vía `imagenPublicId`.
- **Respuestas:** `200 OK` o `404 Not Found`.

#### `DELETE /api/platos/:id`
- **Seguridad:** Solo `Administrador`.
- **Respuestas:** `200 OK` o `404 Not Found`.

---

### 4.4 Módulo 4: Ubicaciones de Salón (`/api/ubicaciones`)

#### `GET /api/ubicaciones`
- **Seguridad:** Requiere Token (`verificarToken`).
- **Respuestas:** `200 OK` con lista de ubicaciones (`Planta Baja`, `Terraza`, `Patio Central`, etc.).

#### `POST /api/ubicaciones`
- **Seguridad:** Solo `Administrador`.
- **Request Body:** `{ "nombre": "Patio Central", "descripcion": "Zona al aire libre" }`
- **Respuestas:** `201 Created` o `400 Bad Request`.

#### `PUT /api/ubicaciones/:id`
- **Seguridad:** Solo `Administrador`.
- **Respuestas:** `200 OK` o `404 Not Found`.

#### `DELETE /api/ubicaciones/:id`
- **Seguridad:** Solo `Administrador`.
- **Respuestas:** `200 OK` o `404 Not Found`.

---

### 4.5 Módulo 5: Mesas (`/api/mesas`)

#### `GET /api/mesas`
- **Seguridad:** Requiere Token (`verificarToken`).
- **Respuestas:** `200 OK` con arreglo de `Mesa[]` con `ubicacionId` poblado.

#### `GET /api/mesas/:id`
- **Seguridad:** Requiere Token (`verificarToken`).
- **Respuestas:** `200 OK` o `404 Not Found`.

#### `POST /api/mesas`
- **Seguridad:** Solo `Administrador`.
- **Request Body:**
```json
{
  "numero": "Mesa 12",
  "capacidad": 4,
  "ubicacion": "Planta Baja",
  "ubicacionId": "651f8a7e3b9c1d2e4f5a6b7c"
}
```
- **Respuestas:** `201 Created` (emite evento `mesas:created`).

#### `PUT /api/mesas/:id`
- **Seguridad:** Solo `Administrador`.
- **Request Body:** Parcial de atributos físicos de la mesa (`numero`, `capacidad`, `ubicacion`).
- **Respuestas:** `200 OK` (emite evento `mesas:updated`).

#### `PATCH /api/mesas/:id/estado`
- **Seguridad:** `Mesero`, `Administrador` (Cajeros y Cocineros reciben `403 Forbidden`).
- **Propósito:** Cambiar el estado operativo de la mesa en salón.
- **Request Body:**
```json
{
  "estado": "Ocupada" 
}
```
> **Valores Válidos:** Exactamente `'Libre'`, `'Ocupada'` o `'Cuenta Solicitada'`.  
> *Aliases de UI en frontend:* Si el frontend utiliza `'Disponible'`, debe mapearse a `'Libre'`; si utiliza `'Esperando pago'`, debe mapearse a `'Cuenta Solicitada'`.
- **Respuestas:** `200 OK` (emite `mesas:updated`), `400 Bad Request` (estado inválido) o `404 Not Found`.

#### `DELETE /api/mesas/:id`
- **Seguridad:** Solo `Administrador`.
- **Respuestas:** `200 OK` (emite `mesas:deleted`) o `404 Not Found`.

---

### 4.6 Módulo 6: Pedidos (`/api/pedidos`)

#### `POST /api/pedidos`
- **Seguridad:** `Mesero`, `Administrador`.
- **Propósito:** Apertura de comanda en salón y ocupación de mesa asociada al pedido.
- **Request Body:**
```json
{
  "mesa": "651f8a7e3b9c1d2e4f5a6b7c",
  "detalles": [
    {
      "plato": "651f8a7e3b9c1d2e4f5a6b7d",
      "cantidad": 2,
      "observacion": "Sin cebolla"
    }
  ],
  "clienteNombre": "Juan Pérez",
  "clienteCI": "7894561",
  "clienteNIT": "",
  "montoDescuento": 0,
  "montoPropina": 0
}
```
- **Comportamiento del Servidor:**
  1. Valida existencia de la mesa.
  2. Obtiene precios vigentes de la colección `Plato`.
  3. Ejecuta `validarDisponibilidadIngredientes()` contra las recetas activas (si en la observación se especifica exclusión, ej. "sin cebolla", se excluye del control). Si un ingrediente requerido tiene `disponible: false`, rechaza con `400 Bad Request`.
  4. Genera correlativo diario secuencial `PED-XXXX`.
  5. Cambia el estado de la mesa a `'Ocupada'`.
  6. Emite WebSockets: `cocina:nuevo_pedido` y `mesas:updated`.
- **Respuestas:** `201 Created` con el pedido registrado o `400 Bad Request` (falta de disponibilidad de ingredientes con lista de `faltantes`).

#### `GET /api/pedidos`
- **Seguridad:** Requiere Token (`verificarToken`).
- **Query Parameters Opcionales:**
  - `hoy=true`: Filtra pedidos creados o actualizados en la fecha actual de Bolivia.
  - `fecha=YYYY-MM-DD`: Filtra pedidos en una fecha calendario específica.
  - `mesa=<ObjectId>`: Filtra pedidos asociados a una mesa concreta.
  - `activo=true`: Filtra órdenes en curso (`ABIERTO`, `EN_PREPARACION`, `ENTREGADO`).
  - `cajero=<ObjectId>`: Filtra pedidos asignados al cajero indicado o sin asignar.
  - `mesero=<ObjectId>`: Filtra pedidos abiertos por el mesero indicado.
  - `reportesCierre=true`: **Retorna los reportes de `CierreCaja` de las últimas 48 horas**.
- **Respuestas:** `200 OK` con arreglo de pedidos con `fechaDiaBolivia` y `fechaHoraBolivia` calculadas.

#### `GET /api/pedidos/pendientes-cobro`
- **Seguridad:** `Cajero`, `Administrador`.
- **Query Parameter Opcional:** `cajero=<ObjectId>`
- **Propósito:** Obtiene las comandas con cuenta solicitada pendientes de pago en caja.
- **Respuestas:** `200 OK` con arreglo formateado para el módulo de facturación.

#### `PUT /api/pedidos/:id`
- **Seguridad:** `Mesero`, `Administrador`.
- **Propósito:** Modificación de platos u observaciones antes de que la orden sea cancelada o cobrada.
- **Request Body Permitido:**
```json
{
  "detalles": [
    {
      "plato": "651f8a7e3b9c1d2e4f5a6b7d",
      "cantidad": 3,
      "observacion": "Bien cocido"
    }
  ],
  "clienteNombre": "Juan Pérez",
  "clienteCI": "7894561",
  "clienteNIT": "1020304050",
  "montoDescuento": 5.00,
  "montoPropina": 2.00
}
```
- **Protecciones del Backend:**
  - Si el cliente envía `estado`, se rechaza con `400 Bad Request`.
  - Si el pedido está en `CERRADO` o `CANCELADO`, se rechaza con `400 Bad Request`.
  - Si el pedido estaba en `ENTREGADO` y se envían nuevos `detalles`, el backend lo reabre automáticamente a `ABIERTO` para producción en cocina.
  - Emite `cocina:actualizar_tablero` y `mesas:updated`.
- **Respuestas:** `200 OK` con el pedido actualizado o `400 / 404`.

#### `PATCH /api/pedidos/:id/estado`
- **Seguridad:** `Cocinero`, `Administrador`.
- **Propósito:** Avanzar la orden en el flujo de cocina.
- **Request Body:** `{ "estado": "EN_PREPARACION" }` o `{ "estado": "ENTREGADO" }`.
- **Regla:** Valida máquina de estados. Al pasar a `ENTREGADO`, emite `mesas:alerta_listo` a la sala `room:meseros`.
- **Respuestas:** `200 OK` con `{ "mensaje": "Pedido movido a ...", "pedido": { ... } }`.

#### `PATCH /api/pedidos/:id/solicitar-cuenta`
- **Seguridad:** `Mesero`, `Administrador`.
- **Propósito:** El comensal solicita la pre-cuenta. Cambia la mesa a `'Cuenta Solicitada'` y notifica a caja.
- **Respuestas:** `200 OK` (emite `caja:nueva_cuenta`, `caja:solicitud_pago` y `mesas:updated` con estado `'Esperando pago'`).

#### `PATCH /api/pedidos/:id/cancel`
- **Seguridad:** `Mesero`, `Administrador`.
- **Propósito:** Anular comanda y liberar la mesa vinculada.
- **Respuestas:** `200 OK` (emite `mesas:updated` con status `'Disponible'`).

---

### 4.7 Módulo 7: Pagos y Cierre de Cuentas (`/api/pagos`)

#### `POST /api/pagos/:pedidoId/procesar`
- **Seguridad:** `Cajero`, `Administrador`.
- **Propósito:** Transacción atómica que liquida el pedido, persiste el registro contable en `pagos` y libera la mesa a `'Libre'`.
- **Request Body:**
```json
{
  "metodoPago": "Efectivo", 
  "montoDescuento": 0,
  "montoPropina": 5.00,
  "nombreCliente": "Ana Torres",
  "ci": "6543210",
  "nit": "",
  "cajeroAsignado": "651f8a7e3b9c1d2e4f5a6b7c"
}
```
> **Métodos de Pago Permitidos en Formulario:** Exclusivamente **`'Efectivo' | 'Tarjeta' | 'QR'`**.  
> *Nota de Consistencia:* Aunque el esquema de base de datos legado de `Pedido` contenga valores históricos como `'Transferencia'` u `'Otro'`, el servicio de liquidación contable (`pago.service.ts`), el modelo formal `Pago` y el contrato OpenAPI definen exclusivamente `['Efectivo', 'Tarjeta', 'QR']`. El frontend debe restringir las opciones seleccionables en la interfaz únicamente a estos tres métodos válidos.  
> **Autoridad Financiera:** Si el frontend envía `subtotalCierre`, el backend lo **ignora por completo**. El subtotal se deriva exclusivamente de los ítems reales del pedido en base de datos.
- **Respuestas:** `200 OK` con `{ "mensaje": "Pago procesado exitosamente", "comprobante": { ... } }`.  
  *Eventos emitidos:* `cocina:actualizar_tablero`, `mesas:updated` (status: `'Disponible'`) y `mesas:pago_completado`.

#### `POST /api/pagos/generar-qr/:pedidoId`
- **Seguridad:** Requiere Token (`verificarToken`).
- **Propósito:** Genera la URL del código QR estático con el identificador del pedido y su monto.
- **Respuestas:** `200 OK` con `{ "qrUrl": "https://api.qrserver.com/...", "total": 120.00 }`.

#### `POST /api/pagos/notificar-qr/:pedidoId`
- **Seguridad:** Pública (simulación externa de webhook bancario o pasarela móvil).
- **Propósito:** Notifica a la caja en tiempo real que el comensal ha escaneado y transferido vía QR desde su móvil.
- **IMPORTANTE:** Este endpoint **NO cierra el pedido ni crea el registro de pago contable**. Solo emite WebSockets (`caja:pago_confirmado` y `pedido:pago_recibido:${pedidoId}`) para que el Cajero confirme y procese formalmente en `/procesar`.
- **Respuestas:** `200 OK` con `{ "exito": true, "mensaje": "Simulación de pago exitosa. Notificando a la caja..." }`.

#### `POST /api/pagos/:pedidoId/enviar-recibo`
- **Seguridad:** `Cajero`, `Administrador`.
- **Request Body:**
```json
{
  "email": "cliente@correo.com",
  "clienteNombre": "Ana Torres",
  "clienteCI": "6543210"
}
```
- **Respuestas:** `200 OK` con `{ "mensaje": "Recibo enviado por correo exitosamente" }`.

---

### 4.8 Módulo 8: Inventario y Recetas (`/api/inventario`)

#### `GET /api/inventario/ingredientes` y `GET /api/inventario/estado`
- **Seguridad:** Requiere Token (`verificarToken`).
- **Respuestas:** `200 OK` con lista de `Ingrediente[]`.

#### `POST /api/inventario/ingredientes`
- **Seguridad:** Solo `Administrador`.
- **Request Body:**
```json
{
  "nombre": "Carne de Res",
  "unidadMedida": "kg",
  "disponible": true
}
```
> **Unidades de Medida Válidas:** `'kg'`, `'g'`, `'l'`, `'ml'`, `'unidades'`.
- **Respuestas:** `201 Created` (emite `inventario:actualizado`).

#### `PUT /api/inventario/ingredientes/:id`
- **Seguridad:** Solo `Administrador`.
- **Respuestas:** `200 OK` (emite `inventario:actualizado`).

#### `DELETE /api/inventario/ingredientes/:id`
- **Seguridad:** Solo `Administrador`.
- **Respuestas:** `200 OK` (emite `inventario:actualizado`).

#### `GET /api/inventario/recetas`
- **Seguridad:** Requiere Token (`verificarToken`).
- **Respuestas:** `200 OK` con lista de escandallos poblados con plato e ingredientes.

#### `POST /api/inventario/recetas`
- **Seguridad:** Solo `Administrador`.
- **Request Body:**
```json
{
  "plato": "651f8a7e3b9c1d2e4f5a6b7d",
  "ingredientes": [
    {
      "ingrediente": "651f8a7e3b9c1d2e4f5a6b80",
      "cantidadNecesaria": 0.25
    }
  ]
}
```
- **Respuestas:** `201 Created` o `200 OK` si se actualizó una receta existente (emite `inventario:actualizado`).

#### `DELETE /api/inventario/recetas/:id`
- **Seguridad:** Solo `Administrador`.
- **Respuestas:** `200 OK` (emite `inventario:actualizado`).

---

### 4.9 Módulo 9: Dashboard Gerencial (`/api/dashboard`)

#### `GET /api/dashboard/resumen`
- **Seguridad:** Solo `Administrador`.
- **Propósito:** Consolidado de indicadores clave (KPIs), platos estrella, popularidad de categorías y últimas comandas del día.
- **Respuestas Exitosa (HTTP 200 OK):**
```json
{
  "kpis": {
    "ventasHoy": 3450.00,
    "ordenesHoy": 28,
    "clientesEstimados": 84,
    "mesasActivas": 6,
    "ocupacionPorcentaje": 60
  },
  "platosMasVendidos": [
    { "nombre": "Pique Macho", "cantidad": 14, "imagen": "https://..." }
  ],
  "categoriasPopulares": [
    { "nombre": "Platos Fuertes", "pedidos": 20, "porcentaje": 71.4 }
  ],
  "ordenesRecientes": [
    { "id": "PED-0028", "mesa": "Mesa 4", "hora": "13:45", "estado": "En Preparación", "total": 150.00 }
  ]
}
```

---

### 4.10 Módulo 10: Subida de Archivos a Cloudinary (`/api/upload`)

#### `POST /api/upload`
- **Seguridad:** Solo `Administrador`.
- **Content-Type:** `multipart/form-data`
- **Campo requerido:** `imagen` (archivo de imagen binaria: jpg, png, webp, etc.).
- **Respuesta Exitosa (HTTP 200 OK):**
```json
{
  "mensaje": "Imagen subida con éxito",
  "url": "https://res.cloudinary.com/dt.../image/upload/v1234/sabor/plato.webp",
  "publicId": "sabor/plato_xyz"
}
```

---

# 5. Entidades de Dominio (TypeScript)

Tipos exactos para que el frontend los adopte en sus modelos de datos:

```typescript
// 1. Usuario del Sistema
export interface Usuario {
  id: string
  nombre: string
  apellido: string
  ci: string
  email: string
  rol: 'Administrador' | 'Mesero' | 'Cocinero' | 'Cajero'
  estado: boolean
  verificado: boolean
  createdAt?: string
  updatedAt?: string
}

// 2. Categoría de Platos
export interface Categoria {
  _id: string
  nombre: string
}

// 3. Plato / Ítem de Menú
export interface Plato {
  _id: string
  nombre: string
  descripcion: string
  precio: number
  imagenUrl: string
  imagenPublicId: string
  disponible: boolean
  categoria: string | Categoria
}

// 4. Ubicación de Salón
export interface Ubicacion {
  _id: string
  nombre: string
  descripcion?: string
}

// 5. Mesa
export interface Mesa {
  _id: string
  numero: string
  capacidad: number
  ubicacion: string
  ubicacionId?: string | Ubicacion
  estado: 'Libre' | 'Ocupada' | 'Cuenta Solicitada'
  createdAt?: string
  updatedAt?: string
}

// 6. Detalle de Pedido (Comanda)
export interface DetallePedido {
  plato: string | Plato
  nombrePlato?: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  observacion: string
}

// 7. Pedido
export interface Pedido {
  _id: string
  codigo: string                  // 'PED-0001'
  fechaDiaBolivia?: string        // 'YYYY-MM-DD'
  fechaHoraBolivia?: string       // 'YYYY-MM-DD HH:mm:ss'
  fechaHora: string | Date
  estado: 'ABIERTO' | 'EN_PREPARACION' | 'ENTREGADO' | 'CANCELADO' | 'CERRADO'
  total: number
  mesa?: string | Mesa
  usuario: string | Usuario       // Mesero que abrió la orden
  detalles: DetallePedido[]
  qrUrl?: string
  metodoPago?: 'Efectivo' | 'Tarjeta' | 'QR' // Métodos oficiales de cobro
  montoDescuento?: number
  montoPropina?: number
  subtotalCierre?: number
  clienteNombre?: string
  clienteCI?: string
  clienteNIT?: string
  cajeroAsignado?: string | Usuario
  createdAt?: string
  updatedAt?: string
}

// 8. Registro de Pago
export interface Pago {
  _id: string
  codigoPago: string              // 'PAG-XXXXXX'
  codigoPedido: string            // 'PED-XXXX'
  pedido: string | Pedido
  mesa: string | Mesa
  mesero: string | Usuario
  cajero?: string | Usuario
  nombreCliente: string
  ci?: string
  nit?: string
  subtotal: number
  descuento: number
  propina: number
  totalFinal: number
  metodoPago: 'Efectivo' | 'QR' | 'Tarjeta'
  estadoPago: 'Pendiente' | 'Procesado' | 'Pagado' | 'Anulado'
  fechaEnvioCajaBolivia?: string
  fechaEnvioCaja: string | Date
  fechaPagoBolivia?: string
  fechaPago?: string | Date
  observaciones?: string
}

// 9. Comprobante de Cobro
export interface ComprobantePago {
  pedidoId: string
  meseroNombre: string
  subtotal: number
  montoDescuento: number
  montoPropina: number
  descuentoAplicado: number
  propinaAplicada: number
  total: number
  totalPagado: number
  metodoPago: 'Efectivo' | 'QR' | 'Tarjeta'
  cajeroAsignado?: string | null
  fechaBolivia: string
  fecha: string | Date
}

// 10. Arqueo y Cierre de Caja
export interface CierreCaja {
  _id: string
  cajeroId: string
  cajeroNombre: string
  totalDia: number
  efectivo: number
  tarjeta: number
  qr: number
  descuentos: number
  propinas: number
  pagosProcesados: number
  fechaCierreBolivia?: string
  fechaCierre: string | Date
}

// 11. Ingrediente y Receta
export interface Ingrediente {
  _id: string
  nombre: string
  unidadMedida: 'kg' | 'g' | 'l' | 'ml' | 'unidades'
  disponible: boolean             // Disponibilidad booleana (true = activo/disponible para preparar)
  fechaRegistro: string | Date
}

export interface RecetaIngrediente {
  ingrediente: string | Ingrediente
  cantidadNecesaria: number
}

export interface Receta {
  _id: string
  plato: string | Plato
  ingredientes: RecetaIngrediente[]
}
```

---

# 6. Máquinas de Estado y Transiciones

### 6.1 Máquina de Estados del Pedido

```
  [ ABIERTO ] ──────> [ EN_PREPARACION ] ──────> [ ENTREGADO ] ──────> [ CERRADO ] (Terminal)
       │                       │                        │
       │                       │                        └── (Reapertura a ABIERTO si Mesero
       │                       │                             agrega platos en PUT /pedidos/:id)
       ▼                       ▼
  [ CANCELADO ]          [ CANCELADO ]
   (Terminal)             (Terminal)
```

- **`ABIERTO`:** Estado inicial al registrar comanda. Permite cancelarse o pasar a cocción.
- **`EN_PREPARACION`:** El cocinero toma la orden en el tablero de cocina.
- **`ENTREGADO`:** Platos listos y servidos en mesa. Emite alerta sonora/visual a meseros (`mesas:alerta_listo`).
- **`CERRADO`:** Pago liquidado en caja. Estado inmutable (no admite modificaciones).
- **`CANCELADO`:** Anulado por mesero o administrador. Estado inmutable; libera la mesa asociada.

### 6.2 Máquina de Estados de la Mesa

```
  [ Libre ] ──────── (Crear Pedido) ────────> [ Ocupada ]
      ▲                                            │
      │                                    (Solicitar Cuenta)
      │                                            │
      │                                            ▼
      └───────── (Procesar Pago) ───────── [ Cuenta Solicitada ]
```

- **`Libre`:** Mesa disponible en salón. *(Alias frontend: `'Disponible'`)*.
- **`Ocupada`:** Comensales consumiendo en la mesa.
- **`Cuenta Solicitada`:** Comensales solicitaron la cuenta; pendiente de cobro en caja. *(Alias frontend: `'Esperando pago'`)*.

---

# 7. Reglas de Negocio Críticas

1. **Autoridad Total de Precios en el Backend:**  
   El frontend **no** calcula precios unitarios ni subtotales con validez legal. Los precios oficiales residen en la base de datos (`Plato.precio`). Si el frontend envía importes alterados, el backend los recalcula e ignora los enviados.
2. **Subtotal Provisto en Cierre es Ignorado (BUG-03):**  
   Al invocar `POST /api/pagos/:pedidoId/procesar`, cualquier campo `subtotalCierre` provisto en el JSON es descartado. El backend suma de forma independiente los ítems registrados en el pedido.
3. **Inmutabilidad y Protección de Campos en Pedidos (BUG-02):**  
   En `PUT /api/pedidos/:id`, el cliente tiene estrictamente prohibido alterar campos de control contable o de estado (`estado`, `metodoPago`, etc.). Cualquier intento generará `400 Bad Request`.
4. **La Notificación QR no Cierra el Pago (BUG-04):**  
   El endpoint público `POST /api/pagos/notificar-qr/:pedidoId` es un simulador de notificación móvil que avisa vía WebSockets. No altera el estado de cierre del pedido. Solo el Cajero tiene la autoridad de cerrar la transacción invocando `/procesar`.
5. **Permisos de Estado de Mesa Restringidos (BUG-05):**  
   Solo los roles **`Mesero`** y **`Administrador`** pueden invocar `PATCH /api/mesas/:id/estado`. Cocineros y Cajeros reciben `403 Forbidden`.
6. **Validación de Disponibilidad Booleana de Ingredientes y Escandallos:**  
   Al crear o actualizar un pedido, el backend verifica la disponibilidad booleana de los ingredientes requeridos según la receta. Si un insumo necesario tiene `disponible: false`, la comanda es rechazada a menos que en el campo `observacion` del detalle se indique exclusión explícita (ej. `"Sin cebolla"`). El backend no maneja control de cantidades numéricas de inventario ni umbrales mínimos; opera mediante el indicador booleano `disponible: boolean`.
7. **Protección de Cierre de Caja y Desactivación de Cajero:**  
   El sistema impide desactivar al único cajero activo si existen operaciones en curso o mesas con cuenta solicitada.

---

# 8. Flujos Funcionales E2E

### Flujo 1: Salón y Comensal (Mesero)
1. **Paso 1:** Mesero inicia sesión (`POST /api/usuarios/login`) y obtiene su token con rol `Mesero`.
2. **Paso 2:** Consulta mesas (`GET /api/mesas`) para identificar mesas en estado `Libre` (verde).
3. **Paso 3:** Consulta catálogo (`GET /api/platos`) y toma el pedido del comensal.
4. **Paso 4:** Envía la comanda con `POST /api/pedidos`.
   - *Resultado:* Mesa cambia automáticamente a `Ocupada` (rojo). Se emite `cocina:nuevo_pedido`.

### Flujo 2: Cocina y Preparación (Cocinero)
1. **Paso 1:** Cocinero con sesión activa escucha el evento Socket `cocina:nuevo_pedido` y consulta `GET /api/pedidos?activo=true`.
2. **Paso 2:** Inicia preparación invocando `PATCH /api/pedidos/:id/estado` con `{ "estado": "EN_PREPARACION" }`.
   - *Resultado:* Se actualiza el tablero de cocina para todos los clientes (`cocina:actualizar_tablero`).
3. **Paso 3:** Al finalizar la cocción, invoca `PATCH /api/pedidos/:id/estado` con `{ "estado": "ENTREGADO" }`.
   - *Resultado:* Backend emite `mesas:alerta_listo` a la sala `room:meseros`. Los meseros reciben la alerta con el número de mesa.

### Flujo 3: Cobro y Facturación en Caja (Mesero y Cajero)
1. **Paso 1:** El cliente solicita la cuenta. El Mesero presiona "Pedir Cuenta", invocando `PATCH /api/pedidos/:id/solicitar-cuenta`.
   - *Resultado:* Mesa cambia a `Cuenta Solicitada` (`Esperando pago`). Backend emite `caja:nueva_cuenta` y `caja:solicitud_pago` a `room:caja`.
2. **Paso 2:** El Cajero consulta `GET /api/pedidos/pendientes-cobro` y abre el modal de facturación.
3. **Paso 3 (Opcional - Pago QR):** Si el cliente paga con QR, se muestra el código generado (`POST /api/pagos/generar-qr/:pedidoId`). Si se recibe la confirmación móvil simulada (`POST /api/pagos/notificar-qr/:pedidoId`), la pantalla de caja se actualiza con `caja:pago_confirmado`.
4. **Paso 4:** El Cajero cobra y confirma el pago con `POST /api/pagos/:pedidoId/procesar` seleccionando `'Efectivo'`, `'Tarjeta'` o `'QR'`.
   - *Resultado:* Pedido pasa a `CERRADO`. Se crea el documento en `pagos`. La mesa pasa automáticamente a `Libre` (emitiendo `mesas:pago_completado` y `mesas:updated`). El backend retorna el `ComprobantePago`.

### Flujo 4: Cierre de Turno y Arqueo (Cajero)
1. **Paso 1:** Al finalizar la jornada, el Cajero revisa el resumen de ventas.
2. **Paso 2:** En su perfil o panel de caja, ejecuta su cierre de turno desactivando su estado operativo vía `PATCH /api/usuarios/:id/estado` enviando `{ "estado": false, "reporte": { ... } }`.
   - *Resultado:* Se almacena el documento oficial `CierreCaja` con los montos en efectivo, tarjeta, QR y propinas.
3. **Paso 3:** El Administrador puede consultar los cierres mediante `GET /api/pedidos?reportesCierre=true` o revisar las métricas consolidadas en `GET /api/dashboard/resumen`.

---

# 9. Integración en Tiempo Real con WebSockets (Socket.IO)

El servidor utiliza **Socket.IO** montado sobre el mismo servidor HTTP.

### 9.1 Handshake y Autenticación del Socket
El cliente Next.js debe conectarse enviando el token JWT. Puede hacerlo de dos formas compatibles en las opciones de `io(...)`:
```javascript
import { io } from 'socket.io-client';

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

const socket = io(socketUrl, {
  auth: {
    token: miTokenJWT // Opción 1: Recomendada
  },
  extraHeaders: {
    Authorization: `Bearer ${miTokenJWT}` // Opción 2: Cabecera estándar
  },
  transports: ['websocket', 'polling']
});
```

### 9.2 Salas (Rooms) Automáticas al Conectar
Al autenticar el socket, el servidor examina `decoded.rol` y suscribe la conexión a las siguientes salas:
- Si `rol === 'Mesero'`: Se une a **`room:meseros`**.
- Si `rol === 'Cajero'`: Se une a **`room:caja`** y a **`user:<usuarioId>`**.

### 9.3 Catálogo Completo de Eventos WebSocket

| Evento | Dirección / Destino | Disparador / Causa | Estructura del Payload |
|:---|:---|:---|:---|
| **`cocina:nuevo_pedido`** | Broadcast (Todos) | Creación exitosa de comanda (`POST /api/pedidos`). | `Pedido` completo poblado con mesa y detalles de platos. |
| **`cocina:actualizar_tablero`** | Broadcast (Todos) | Cambio de estado de comanda (`PATCH /pedidos/:id/estado`), actualización de detalles (`PUT`) o pago completado (`/procesar`). | Documento `Pedido` actualizado. |
| **`mesas:alerta_listo`** | Exclusivo a `room:meseros` | La comanda pasa al estado `ENTREGADO` por cocina. | `{ "pedidoId": "...", "mesaId": "...", "mesaNombre": "Mesa 3" }` |
| **`mesas:created`** | Broadcast (Todos) | Alta de mesa (`POST /api/mesas`). | Documento `Mesa` creado. |
| **`mesas:updated`** | Broadcast (Todos) | Cambio de estado o edición de mesa, cancelación de pedido o solicitud de cuenta. | `{ "id": "...", "status": "Ocupada", "name": "Mesa 1" }` |
| **`mesas:deleted`** | Broadcast (Todos) | Eliminación de mesa (`DELETE /api/mesas/:id`). | Documento `Mesa` eliminado. |
| **`mesas:pago_completado`** | Broadcast (Todos) | Procesamiento definitivo del cobro (`POST /api/pagos/:id/procesar`). | `{ "mesaId": "...", "mesaNombre": "Mesa 1", "pedidoId": "...", "mensaje": "Pago procesado exitosamente" }` |
| **`caja:nueva_cuenta`** | A `user:<cajeroId>` o `room:caja` | Solicitud de cuenta desde salón (`PATCH /pedidos/:id/solicitar-cuenta`). | Payload estructurado con código de pedido, mesa, total y detalles. |
| **`caja:solicitud_pago`** | A `user:<cajeroId>` o `room:caja` | Solicitud de cuenta desde salón (`PATCH /pedidos/:id/solicitar-cuenta`). | Idéntico a `caja:nueva_cuenta` (compatibilidad de listeners de caja). |
| **`caja:pago_confirmado`** | Broadcast (Todos) | Simulación de transferencia QR recibida (`POST /api/pagos/notificar-qr/:id`). | `{ "pedidoId": "...", "mensaje": "Transferencia QR recibida", "fecha": "..." }` |
| **`pedido:pago_recibido:${pedidoId}`** | Broadcast dinámico por ID de pedido | Simulación de transferencia QR (`POST /api/pagos/notificar-qr/:id`). | `{ "pedidoId": "...", "mensaje": "Pago QR recibido correctamente", "pedido": { ... } }` |
| **`inventario:actualizado`** | Broadcast (Todos) | Alta, baja o edición de ingredientes o recetas escandallo. | *(Sin payload)* Indica al frontend que debe refrescar catálogo/recetas. |

---

# 10. Manejo de Errores y Códigos de Respuesta HTTP

| Código HTTP | Significado Semántico | Casos Reales en Backend | Acción Sugerida en Frontend |
|:---|:---|:---|:---|
| **`400 Bad Request`** | Solicitud malformada o regla de negocio infringida | Campos requeridos faltantes; intento de manipular `estado` vía PUT; ingredientes no disponibles; montos negativos; transición de estado ilegal en pedido. | Mostrar alerta visual con `error.response.data.mensaje` o lista de ingredientes faltantes. |
| **`401 Unauthorized`** | Sesión inexistente o inválida | Token ausente, corrupto o expirado tras 8h; credenciales erróneas en login; cuenta inactiva. | Limpiar credenciales locales y redirigir inmediatamente a `/login`. |
| **`403 Forbidden`** | Permisos insuficientes (RBAC) | Mesero intentando crear un usuario; Cocinero intentando cobrar; Cajero intentando cambiar estado de mesa. | Bloquear botón en interfaz o notificar que la cuenta no tiene privilegios. |
| **`404 Not Found`** | Recurso no encontrado | Identificador de pedido, mesa, plato o usuario inexistente en base de datos. | Mostrar estado "No encontrado" o redirigir a la vista general. |
| **`409 Conflict`** | Conflicto de unicidad | Duplicidad de correo o CI en usuario; duplicidad de código o número de mesa. | Informar al usuario que el valor ya se encuentra registrado. |
| **`500 Internal Error`** | Excepción no controlada en servidor | Error de conexión a base de datos, falla en Cloudinary o excepción de sistema. | Notificar que ocurrió un error inesperado y solicitar reintento. |

---

# 11. Convenciones de Datos, Moneda y Fechas

1. **Zona Horaria Oficial:**  
   El backend opera en la zona horaria **Bolivia (`America/La_Paz`, UTC-4)**.
2. **Campos de Fecha y Hora en Respuestas:**
   - `fechaDiaBolivia`: Cadena en formato ISO corto `YYYY-MM-DD` (ej. `"2026-10-03"`).
   - `fechaHoraBolivia`: Cadena formateada para lectura `YYYY-MM-DD HH:mm:ss` o `DD/MM/YYYY, HH:mm:ss`.
   - `createdAt` / `updatedAt` / `fechaHora`: Cadenas en formato estándar ISO-8601 UTC (ej. `"2026-10-03T17:45:11.000Z"`).
3. **Moneda y Manejo Numérico:**
   - Moneda oficial: **Bolivianos (BOB, Bs.)**.
   - Los importes son números de punto flotante serializados a 2 decimales (`Number.toFixed(2)`). El frontend debe redondear a 2 decimales para visualización sin alterar los valores base.
4. **Formato de Identificadores (IDs):**
   - Identificadores de Base de Datos: Cadenas hexadecimales de 24 caracteres correspondientes a `ObjectId` de MongoDB (ej. `"651f8a7e3b9c1d2e4f5a6b7c"`).
   - Códigos Legibles de Negocio:
     - Pedidos: Cadena correlativa diaria `"PED-0001"`, `"PED-0002"`.
     - Pagos: Cadena alfanumérica `"PAG-XXXXXX"`.
5. **Paginación:**  
   Actualmente los endpoints de listado (`/api/platos`, `/api/mesas`, `/api/pedidos`, etc.) retornan arreglos directos con la totalidad de registros. El backend no implementa cursores ni parámetros `page`/`limit`.

---

# 12. Restricciones del Frontend (Reglas que el Frontend NO debe asumir)

1. **NO asumir que el cliente puede determinar el precio o el subtotal:** El servidor consulta directamente el catálogo y calcula los subtotales de forma matemática pura.
2. **NO asumir que `POST /api/pagos/notificar-qr` cierra contablemente el pedido:** Es únicamente una señal de simulación que despierta un aviso en el panel de caja. La transacción se perfecciona únicamente con `POST /api/pagos/:pedidoId/procesar`.
3. **NO asumir que se puede modificar el estado de un pedido mediante `PUT /api/pedidos/:id`:** La propiedad `estado` enviada en el body de un PUT provocará un error `400 Bad Request`. Los avances de estado en cocina se ejecutan exclusivamente con `PATCH /api/pedidos/:id/estado`.
4. **NO asumir que cualquier rol puede cambiar estados de mesa:** El endpoint `PATCH /api/mesas/:id/estado` solo autoriza a `Mesero` y `Administrador`.
5. **NO asumir que los IDs son enteros autoincrementales:** Todos los recursos utilizan strings de 24 caracteres hexadecimales propios de MongoDB `ObjectId`.
6. **NO asumir que existe un endpoint `GET /api/pedidos/:id`:** Para consultar pedidos, el cliente debe filtrar sobre `GET /api/pedidos` o consultar `GET /api/pedidos/pendientes-cobro`.
7. **NO enviar campos no documentados ni métodos de pago no admitidos:** El formulario de cobro debe limitarse a `'Efectivo'`, `'Tarjeta'` y `'QR'`.

---

# 13. Lista de Verificación para el Desarrollador Frontend

- [ ] **Configurar Variables de Entorno Next.js:** Definir `NEXT_PUBLIC_API_URL=http://localhost:3000/api` y `NEXT_PUBLIC_SOCKET_URL=http://localhost:3000` en `.env.local`.
- [ ] **Configurar Puerto de Desarrollo Frontend:** Configurar Next.js en puerto `3001` (ej. `"dev": "next dev -p 3001"`) para evitar colisiones con el puerto `3000` del backend.
- [ ] **Implementar Flujo de Login:** Enviar `email` y `password` a `POST /api/usuarios/login` y capturar el token JWT.
- [ ] **Manejar JWT y Persistencia:** Adjuntar cabecera `Authorization: Bearer <token>` en todas las peticiones con interceptor HTTP (Axios / Fetch).
- [ ] **Manejar Roles y Rutas Protegidas:** Ocultar o proteger vistas en el cliente según el rol (`Administrador`, `Mesero`, `Cajero`, `Cocinero`).
- [ ] **Implementar Consumo de Endpoints REST:** Integrar las 47 operaciones HTTP respetando DTOs y parámetros oficiales.
- [ ] **Implementar Máquina de Estados:** Validar transiciones de pedidos y mesas en UI antes de disparar las peticiones.
- [ ] **Restringir Opciones de Pago:** Ofrecer únicamente `'Efectivo'`, `'Tarjeta'` y `'QR'` en el formulario de cobro en caja.
- [ ] **Conectar Socket.IO con Handshake Autenticado:** Pasar el token en `auth: { token }` al inicializar la conexión con `NEXT_PUBLIC_SOCKET_URL`.
- [ ] **Configurar Listeners de WebSockets:** Manejar `cocina:nuevo_pedido`, `mesas:updated`, `mesas:alerta_listo` y `caja:nueva_cuenta`.
- [ ] **Manejar Errores Globales:** Capturar respuestas 401 para redirección automática y 400 con mensajes de validación de negocio.
- [ ] **Probar Flujo E2E de Pedido:** Apertura de comanda en salón por Mesero -> Preparación en Cocina -> Alerta de entrega.
- [ ] **Probar Flujo E2E de Pago:** Solicitud de pre-cuenta -> Cobro en Caja -> Emisión de Comprobante -> Mesa liberada.

---

# 14. Fuentes de Verdad y Registro de Discrepancias

### 14.1 Fuentes de Verdad Formales
- **Contrato de Interfaz REST:** `docs/openapi.yaml`
- **Comportamiento Lógico y Autoridad de Negocio:** Código fuente real del backend (`src/controllers/`, `src/services/`, `src/repositories/`, `src/models/`).
- **Integración en Tiempo Real:** `src/socket/socket.ts` y llamadas reales a `getIO().emit(...)` en controladores.

> **Aviso Importante:** Este documento técnico complementa la especificación OpenAPI explicando cómo debe ser consumida operativamente por una aplicación cliente; en ningún caso sustituye el esquema formal OpenAPI.

### 14.2 Registro de Discrepancias Identificadas

Durante la auditoría del código real frente a documentación histórica y configuraciones de entorno, se identificaron las siguientes discrepancias que el frontend debe tener presentes:

1. **Conteo de Rutas vs Operaciones HTTP:**
   - Existen **31 rutas URI (paths)** y **47 operaciones HTTP activas (Método + Ruta)**. Todas las 47 operaciones están documentadas en esta guía y corresponden a la totalidad del backend.
2. **Métodos de Pago en Pedido vs Pago:**
   - El modelo `Pedido` posee un enum histórico amplio (`['Efectivo', 'Tarjeta', 'Transferencia', 'QR', 'Otro']`), pero el servicio transaccional `pago.service.ts`, el modelo formal `Pago` y OpenAPI aceptan y persisten exclusivamente: `['Efectivo', 'Tarjeta', 'QR']`. El frontend debe limitar su selector de pago exclusivamente a estas 3 opciones.
3. **Configuración de Orígenes Permitidos (CORS):**
   - En `src/app.ts`, los orígenes permitidos son: `'http://localhost:5173'`, `'https://quirquinita.onrender.com'` y `'https://tis-pied.vercel.app'`.
   - En `src/socket/socket.ts`, los orígenes de Socket.IO son: `'http://localhost:5173'`, `'http://localhost:5174'` y `'https://quirquinita.onrender.com'`. Falta `'https://tis-pied.vercel.app'` en sockets.
   - En documentación antigua figuraba una variable `FRONTEND_URL`, pero el código actual define las URLs directamente en las configuraciones de CORS.
4. **Ruta del Módulo de Sockets:**
   - La especificación hacía referencia a `src/socket.ts`; el archivo real en el repositorio se ubica en `src/socket/socket.ts`.
5. **Endpoint de Consulta de Pedido por ID:**
   - No existe un endpoint directo `GET /api/pedidos/:id` en las rutas activas de Express. Las búsquedas de comanda se realizan filtrando en `GET /api/pedidos` o mediante `GET /api/pedidos/pendientes-cobro`.
6. **Control de Roles en Desactivación de Empleado:**
   - La ruta `PATCH /api/usuarios/:id/estado` admite los roles `'Administrador'` y `'Cajero'`. Esto permite que el cajero en funciones pueda inactivar su propio turno para registrar su `CierreCaja`.
7. **Generador de Códigos QR:**
   - No se requiere ninguna clave o credencial en `.env` para generar el código QR. El backend invoca directamente el servicio público CDN `api.qrserver.com`.
