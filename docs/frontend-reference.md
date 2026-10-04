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

| Rol Oficial | Propósito Operativo | Acciones Permitidas en Backend | Restricciones Estrictas de Seguridad |
|:---|:---|:---|:---|
| **Administrador** | Gestión integral y gerencial | Acceso absoluto a todos los módulos: usuarios, categorías, platos, mesas, ubicaciones, pedidos, inventario, recetas, pagos, reportes de cierre y analíticas del dashboard. | Ninguna restricción de ruta ni propiedad. |
| **Mesero** | Atención en salón y toma de órdenes | Consulta de catálogo y categorías; consulta de ubicaciones (`GET /api/ubicaciones`) y mesas (`GET /api/mesas`, `GET /api/mesas/:id`); gestión de ocupación temporal (`POST/DELETE/GET /api/mesas/:id/ocupar-temporal`); cambio operativo de estado de mesas (`PATCH /api/mesas/:id/estado`); apertura de pedidos (`POST /api/pedidos`); consulta de sus propios pedidos (`GET /api/pedidos`); edición de sus pedidos (`PUT /api/pedidos/:id`); solicitud de cuenta (`PATCH /api/pedidos/:id/solicitar-cuenta`); recogida física (`PATCH /api/pedidos/:id/recoger`); cancelación de comanda (`PATCH /api/pedidos/:id/cancel`). | Bloqueado en administración de usuarios/platos/mesas/recetas. Bloqueado en pagos (`POST /api/pagos/*`). Solo puede consultar, modificar, cancelar, solicitar cuenta o recoger sus **propios** pedidos (`403` si intenta acceder a pedidos de otros meseros o consultar `reportesCierre=true`). |
| **Cajero** | Facturación, cobros y arqueo | Consulta de pedidos pendientes de cobro (`GET /api/pedidos/pendientes-cobro`); procesamiento definitivo de pagos (`POST /api/pagos/:pedidoId/procesar`); generación de QR estático (`POST /api/pagos/generar-qr/:pedidoId`); emisión y reenvío de comprobantes por correo (`POST /api/pagos/:pedidoId/enviar-recibo`); cierre de turno y arqueo (`PATCH /api/usuarios/:id/estado`). | Bloqueado en `GET /api/pedidos` general (`403`, debe usar exclusivamente `/pendientes-cobro`), bloqueado en `GET /api/mesas` (`403`) y `GET /api/ubicaciones` (`403`). No puede abrir comandas ni alterar producción culinaria. |
| **Cocinero** | Producción culinaria y comandas | Visualización de comandas activas para pantalla KDS (`GET /api/pedidos/cocina` y `GET /api/pedidos` sanitizado); actualización de estado culinario (`PATCH /api/pedidos/:id/estado` para `ABIERTO` -> `EN_PREPARACION` -> `ENTREGADO`); consulta de ingredientes (`GET /api/inventario/ingredientes`, `GET /api/inventario/estado`); consulta de recetarios/escandallos (`GET /api/inventario/recetas`). | Bloqueado en `GET /api/mesas` (`403`) y `GET /api/ubicaciones` (`403`). Bloqueado en creación/edición de pedidos, pagos, cancelación o solicitud de cuentas. Los pedidos consultados por el Cocinero tienen todos los montos y datos fiscales omitidos. Bloqueado en `reportesCierre=true`. |

### 3.1 Respuesta de Denegación de Permisos (HTTP 403 Forbidden)
Si un usuario autenticado intenta ejecutar un endpoint que no le corresponde (por ejemplo, un Cocinero intentando ver las mesas, un Cajero intentando listar todos los pedidos o un Mesero intentando modificar el pedido de otro mesero), el servidor responderá:
```json
{
  "mensaje": "Acceso denegado. No tienes permisos para realizar esta acción."
}
```
*(O un mensaje específico de propiedad como `"Acceso denegado. Solo el mesero responsable del pedido o un Administrador pueden modificar este pedido."`)*

### 3.2 Reglas de Propiedad (Ownership) y Scoping de Datos por Rol

1. **Scoping Automático en `GET /api/pedidos`:**
   - **Administrador:** Obtiene todos los pedidos solicitados sin filtros forzados y puede consultar arqueos con `reportesCierre=true`.
   - **Mesero:** El backend inyecta automáticamente el filtro `usuario = <authUserId>`. El mesero solo ve sus propios pedidos. Si envía el parámetro `mesero=<otroUsuarioId>` o `reportesCierre=true`, el servidor responde inmediatamente `403 Forbidden`.
   - **Cocinero:** El backend restringe la consulta automáticamente a comandas relevantes para cocina (`ABIERTO`, `EN_PREPARACION`, y `ENTREGADO` no recogido). Además, aplica un DTO de sanitización que elimina campos financieros sensibles (`total`, `subtotalCierre`, `montoDescuento`, `montoPropina`, `clienteCI`, `clienteNIT`, `cajeroAsignado`, `qrUrl`, `metodoPago`). Si envía `reportesCierre=true`, recibe `403 Forbidden`.
   - **Cajero:** Tiene prohibido invocar `GET /api/pedidos` (`403 Forbidden`). Debe invocar `GET /api/pedidos/pendientes-cobro` que contiene el DTO especializado para facturación.

2. **Control de Propiedad en Mutaciones de Pedido:**
   En los endpoints de manipulación de comandas (`PUT /api/pedidos/:id`, `PATCH /api/pedidos/:id/solicitar-cuenta`, `PATCH /api/pedidos/:id/recoger`, `PATCH /api/pedidos/:id/cancel`), el backend valida:
   ```typescript
   if (pedido.usuario.toString() !== usuarioAuthId && usuarioRol !== 'Administrador') {
     return res.status(403).json({ mensaje: "Acceso denegado..." });
   }
   ```
   Un mesero solo puede operar sobre las órdenes que él mismo haya creado. Solo el Administrador tiene autorización global para intervenir en comandas de otros usuarios.

---

# 4. Contrato de la API REST por Módulos

Referencia de especificación formal OpenAPI: `docs/openapi.yaml`.

### 4.0 Alcance del Contrato y Conteo de Operaciones HTTP
- **Rutas URI Únicas (Paths):** El backend define exactamente **33 rutas URI**.
- **Operaciones HTTP Reales (Método + Ruta):** El backend implementa exactamente **49 operaciones HTTP activas**.
- **Alcance Documental:** Las 49 operaciones documentadas a continuación corresponden a la **totalidad de operaciones activas del backend** (no se trata de un subconjunto). Toda la superficie funcional del servidor está completamente cubierta.

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
- **Seguridad:** Solo `Administrador` (`soloAdmins`). Meseros, Cocineros y Cajeros reciben `403 Forbidden`.
- **Respuesta:** `200 OK` con arreglo de usuarios `UsuarioNormalizado[]` (excluye contraseñas) o `403 Forbidden`.

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
- **Seguridad:** Requiere Token (`Mesero` o `Administrador`). Cajeros y Cocineros reciben `403 Forbidden`.
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
- **Seguridad:** Requiere Token (`Mesero` o `Administrador`). Cajeros y Cocineros reciben `403 Forbidden`.
- **Respuestas:** `200 OK` con arreglo de `Mesa[]` con `ubicacionId` poblado.

#### `GET /api/mesas/:id`
- **Seguridad:** Requiere Token (`Mesero` o `Administrador`). Cajeros y Cocineros reciben `403 Forbidden`.
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

#### `POST /api/mesas/:id/ocupar-temporal`
- **Seguridad:** Requiere Token (`Mesero` o `Administrador`). Cajeros y Cocineros reciben `403 Forbidden`.
- **Propósito:** Adquirir un bloqueo atómico temporal de 10 minutos sobre una mesa en estado `Libre` al abrir la carta/comanda, evitando colisiones entre meseros.
- **Headers:** `Authorization: Bearer <TOKEN>`
- **Request Body:** Vacío `{}`.
- **Comportamiento:**
  - Si la mesa está `Libre`: Cambia atómicamente a `Ocupada`, crea el registro temporal con expiración a los 10 minutos asignado al usuario, emite `mesas:updated` y responde `201 Created`.
  - Si la mesa ya está ocupada por otro usuario o tiene comanda activa: Responde `409 Conflict` con `{ "mensaje": "...", "ocupadoPorOtro": true, "expiraEn": "..." }`.
- **Respuestas:**
  - `201 Created`:
    ```json
    {
      "mensaje": "Mesa ocupada temporalmente por 10 minutos",
      "ocupacion": {
        "id": "60c72b2f9b1d8b2bad509871",
        "mesaId": "60c72b2f9b1d8b2bad509872",
        "usuarioId": "60c72b2f9b1d8b2bad509873",
        "expiraEn": "2026-10-04T12:10:00.000Z",
        "minutosRestantes": 10
      },
      "mesa": { "id": "...", "name": "Mesa 1", "status": "Ocupada", ... }
    }
    ```
  - `409 Conflict`:
    ```json
    {
      "mensaje": "La mesa ya se encuentra ocupada por otro mesero o tiene un pedido activo",
      "ocupadoPorOtro": true,
      "expiraEn": "2026-10-04T12:10:00.000Z"
    }
    ```
  - `400 Bad Request`: ID malformado.
  - `404 Not Found`: Mesa inexistente.

#### `DELETE /api/mesas/:id/ocupar-temporal`
- **Seguridad:** Requiere Token (`Mesero` o `Administrador`). Solo el usuario que bloqueó la mesa o un `Administrador` pueden cancelarla.
- **Propósito:** Liberar voluntariamente la mesa cuando el mesero cancela la apertura de comanda antes de confirmar el pedido.
- **Regla:** Si la mesa ya tiene un pedido activo (`ABIERTO`, `EN_PREPARACION`, etc.), la cancelación temporal es rechazada con `400 Bad Request` para proteger la comanda en curso.
- **Respuestas:**
  - `200 OK`:
    ```json
    {
      "mensaje": "Ocupación temporal cancelada exitosamente",
      "mesa": { "id": "...", "name": "Mesa 1", "status": "Disponible", ... }
    }
    ```
  - `403 Forbidden`: Si otro mesero intenta cancelar el bloqueo ajeno.
  - `404 Not Found`: Si no hay ocupación temporal activa o la mesa no existe.

#### `GET /api/mesas/:id/ocupar-temporal`
- **Seguridad:** Requiere Token (`Mesero` o `Administrador`). Cajeros y Cocineros reciben `403 Forbidden`.
- **Propósito:** Consultar el estado del bloqueo temporal, tiempo restante e identidad del propietario.
- **Respuestas:**
  - `200 OK`:
    ```json
    {
      "activa": true,
      "esPropietario": true,
      "ocupacion": {
        "id": "...",
        "mesaId": "...",
        "usuarioId": "...",
        "expiraEn": "2026-10-04T12:10:00.000Z",
        "minutosRestantes": 8
      },
      "mesa": { ... }
    }
    ```

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
- **Seguridad:** Requiere Token (`Administrador`, `Mesero`, `Cocinero`). Cajeros reciben `403 Forbidden` (deben usar `GET /api/pedidos/pendientes-cobro`).
- **Scoping Automático según Rol:**
  - `Administrador`: Acceso irrestricto a todos los pedidos y acceso a `reportesCierre=true`.
  - `Mesero`: El backend inyecta automáticamente `usuario = <authUserId>`. Solo visualiza sus propias órdenes. Si envía `mesero=<otroId>` o `reportesCierre=true`, recibe `403 Forbidden`.
  - `Cocinero`: El backend restringe la consulta al flujo de producción culinaria (`ABIERTO`, `EN_PREPARACION`, y `ENTREGADO` no recogido). Todos los datos financieros (`total`, `subtotalCierre`, `montoDescuento`, `montoPropina`, `clienteCI`, `clienteNIT`, `cajeroAsignado`, `qrUrl`, `metodoPago`) son omitidos por seguridad. Si envía `reportesCierre=true`, recibe `403 Forbidden`.
  - `Cajero`: Recibe `403 Forbidden`.
- **Query Parameters Opcionales:**
  - `hoy=true`: Filtra pedidos creados o actualizados en la fecha actual de Bolivia.
  - `fecha=YYYY-MM-DD`: Filtra pedidos en una fecha calendario específica.
  - `mesa=<ObjectId>`: Filtra pedidos asociados a una mesa concreta.
  - `activo=true`: Filtra órdenes en curso (`ABIERTO`, `EN_PREPARACION`, `ENTREGADO`). Excluye automáticamente pedidos en `ENTREGADO` que ya fueron recogidos por el mesero (mantiene el tablero operativo de cocina limpio).
  - `recogido=true | false`: Filtra según si el pedido ya fue recogido físicamente por el mesero.
  - `incluirRecogidos=true`: Al combinarse con `activo=true`, incluye también pedidos en estado `ENTREGADO` que ya fueron recogidos.
  - `cajero=<ObjectId>`: Filtra pedidos asignados al cajero indicado o sin asignar.
  - `mesero=<ObjectId>`: Filtra pedidos abiertos por el mesero indicado (solo Administrador puede filtrar por otros meseros).
  - `reportesCierre=true`: **Retorna los reportes de `CierreCaja` de las últimas 48 horas** (solo Administrador).
- **Respuestas:** `200 OK` con arreglo de pedidos con `fechaDiaBolivia` y `fechaHoraBolivia` calculadas, o `403 Forbidden`.

#### `GET /api/pedidos/cocina`
- **Seguridad:** Requiere Token (`Cocinero`, `Administrador`).
- **Propósito:** Tablero KDS de Cocina. Retorna exclusivamente las comandas activas en preparación culinaria (`ABIERTO`, `EN_PREPARACION` y `ENTREGADO` pendiente de recogida física por el mesero).
- **Sanitización Estricta:** Omite automáticamente todos los montos económicos, subtotales, totales, descuentos, propinas, datos fiscales del cliente y asignaciones de caja (`total`, `subtotalCierre`, `montoDescuento`, `montoPropina`, `clienteCI`, `clienteNIT`, `cajeroAsignado`, `qrUrl`, `metodoPago`).
- **Respuestas:** `200 OK` con arreglo de comandas sanitizadas `PedidoCocinaDTO[]`, `401 Unauthorized` o `403 Forbidden`.

#### `GET /api/pedidos/pendientes-cobro`
- **Seguridad:** `Cajero`, `Administrador`.
- **Query Parameter Opcional:** `cajero=<ObjectId>`
- **Propósito:** Obtiene las comandas con cuenta solicitada pendientes de pago en caja.
- **Respuestas:** `200 OK` con arreglo formateado para el módulo de facturación.

#### `PUT /api/pedidos/:id`
- **Seguridad:** `Mesero`, `Administrador`.
- **Regla de Propiedad:** Si el usuario es `Mesero`, debe ser el propietario que abrió la comanda (`pedido.usuario === authUserId`); de lo contrario el servidor responde `403 Forbidden`. Solo el `Administrador` puede editar pedidos de otros meseros.
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
- **Respuestas:** `200 OK` con el pedido actualizado, `400 Bad Request`, `403 Forbidden` o `404 Not Found`.

#### `PATCH /api/pedidos/:id/estado`
- **Seguridad:** `Cocinero`, `Administrador`.
- **Propósito:** Avanzar la orden en el flujo de cocina.
- **Request Body:** `{ "estado": "EN_PREPARACION" }` o `{ "estado": "ENTREGADO" }`.
- **Regla:** Valida máquina de estados. Al pasar a `ENTREGADO`, emite `mesas:alerta_listo` a la sala `room:meseros`.
- **Respuestas:** `200 OK` con `{ "mensaje": "Pedido movido a ...", "pedido": { ... } }`.

#### `PATCH /api/pedidos/:id/recoger`
- **Seguridad:** `Mesero`, `Administrador`.
- **Propósito:** Registrar que el mesero responsable (o un Administrador) recogió físicamente la comanda preparada del pase de cocina.
- **Reglas de Negocio:**
  - El pedido debe estar en estado `ENTREGADO` (`400 Bad Request` si está en `ABIERTO`, `EN_PREPARACION`, `CANCELADO` o `CERRADO`).
  - Solo puede ser invocado por el mesero que creó el pedido (`pedido.usuario`) o por un usuario con rol `Administrador` (`403 Forbidden` si otro usuario intenta recogerlo).
  - Si el pedido ya fue marcado como recogido previamente, retorna `409 Conflict`.
  - **NO altera el estado del pedido:** `pedido.estado` se mantiene en `ENTREGADO`.
  - Persiste `recogido: true`, `recogidoPor: ObjectId`, `fechaRecogida: Date` y retorna `fechaRecogidaBolivia`.
  - Emite en tiempo real los eventos Socket.IO `cocina:pedido_recogido` y `cocina:actualizar_tablero` para que la pantalla de cocina retire la tarjeta de la columna "Listo" sin recargar la página.
- **Respuestas:**
  - `200 OK` con `{ "mensaje": "Pedido marcado como recogido por el mesero", "recogido": true, "recogidoPor": "...", "fechaRecogida": "...", "fechaRecogidaBolivia": "...", "pedido": { ... } }`.
  - `400 Bad Request` si no está en estado `ENTREGADO` o el ID es inválido.
  - `403 Forbidden` si el mesero autenticado no es el responsable del pedido.
  - `404 Not Found` si el pedido no existe.
  - `409 Conflict` si ya fue marcado como recogido previamente.

#### `PATCH /api/pedidos/:id/solicitar-cuenta`
- **Seguridad:** `Mesero`, `Administrador`.
- **Regla de Propiedad:** Si el usuario es `Mesero`, debe ser el propietario que abrió la comanda (`pedido.usuario === authUserId`); de lo contrario el servidor responde `403 Forbidden`.
- **Propósito:** El comensal solicita la pre-cuenta. Cambia la mesa a `'Cuenta Solicitada'` y notifica a caja.
- **Respuestas:** `200 OK` (emite `caja:nueva_cuenta`, `caja:solicitud_pago` y `mesas:updated` con estado `'Esperando pago'`) o `403 Forbidden`.

#### `PATCH /api/pedidos/:id/cancel`
- **Seguridad:** `Mesero`, `Administrador`.
- **Regla de Propiedad:** Si el usuario es `Mesero`, debe ser el propietario que abrió la comanda (`pedido.usuario === authUserId`); de lo contrario el servidor responde `403 Forbidden`.
- **Propósito:** Anular comanda y liberar la mesa vinculada.
- **Respuestas:** `200 OK` (emite `mesas:updated` con status `'Disponible'`) o `403 Forbidden`.

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
- **Seguridad:** Requiere Token (`Cajero` o `Administrador`). Meseros y Cocineros reciben `403 Forbidden`.
- **Propósito:** Genera la URL del código QR estático con el identificador del pedido y su monto.
- **Respuestas:** `200 OK` con `{ "qrUrl": "https://api.qrserver.com/...", "total": 120.00 }` o `403 Forbidden`.

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
- **Seguridad:** Requiere Token (`Cocinero` o `Administrador`). Meseros y Cajeros reciben `403 Forbidden`.
- **Respuestas:** `200 OK` con lista de `Ingrediente[]` o `403 Forbidden`.

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
- **Seguridad:** Requiere Token (`Cocinero` o `Administrador`). Meseros y Cajeros reciben `403 Forbidden`.
- **Respuestas:** `200 OK` con lista de escandallos poblados con plato e ingredientes o `403 Forbidden`.

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
3. **Paso 3:** Al seleccionar una mesa `Libre`, el frontend solicita su ocupación temporal inmediata (`POST /api/mesas/:id/ocupar-temporal`).
   - **Caso Éxito (`201 Created`):** La mesa pasa atómicamente a `Ocupada` (rojo) para todos los clientes (emite `mesas:updated`), y se inicia una cuenta regresiva de 10 minutos. El frontend abre la carta/comanda para tomar la orden.
   - **Caso Conflicto (`409 Conflict`):** Si otro mesero tomó la mesa milisegundos antes o existe comanda activa, la UI muestra una advertencia ("Mesa tomada por otro mesero") e impide abrir la comanda.
   - **Caso Cancelación:** Si el mesero decide salir sin tomar orden, invoca `DELETE /api/mesas/:id/ocupar-temporal`, liberando la mesa inmediatamente a `Libre` (`mesas:updated`).
4. **Paso 4:** El mesero selecciona platos y observaciones, enviando la comanda definitiva con `POST /api/pedidos`.
   - *Resultado:* El pedido se crea (`ABIERTO`), la mesa permanece `Ocupada`, la ocupación temporal se consume/elimina automáticamente, y se emiten `cocina:nuevo_pedido` y `mesas:updated`.
   - *Resiliencia ante errores:* Si falla la validación de stock de ingredientes o reglas de negocio al enviar el pedido, la ocupación temporal permanece intacta para que el mesero pueda corregir la comanda sin perder la mesa.
   - *Expiración automática:* Si transcurren 10 minutos sin enviar pedido ni cancelar, el limpiador en segundo plano del backend revierte la mesa a `Libre` y emite `mesas:updated`.

### Flujo 2: Cocina, Preparación y Recogida (Cocinero y Mesero)
1. **Paso 1:** Cocinero con sesión activa escucha el evento Socket `cocina:nuevo_pedido` y consulta `GET /api/pedidos?activo=true`.
2. **Paso 2:** Inicia preparación invocando `PATCH /api/pedidos/:id/estado` con `{ "estado": "EN_PREPARACION" }`.
   - *Resultado:* Se actualiza el tablero de cocina para todos los clientes (`cocina:actualizar_tablero`).
3. **Paso 3:** Al finalizar la cocción, invoca `PATCH /api/pedidos/:id/estado` con `{ "estado": "ENTREGADO" }`.
   - *Resultado:* Backend emite `mesas:alerta_listo` a la sala `room:meseros`. La orden permanece en la columna "Listo" del tablero de Cocina esperando que el mesero la retire.
4. **Paso 4 (Recogida física por el mesero):** El mesero responsable recibe la notificación, acude a la barra de cocina a recoger los platos y presiona "Recoger Pedido" en su comanda (`PATCH /api/pedidos/:id/recoger`).
   - *Resultado:*
     - El pedido registra `recogido: true`, `recogidoPor` y `fechaRecogida` (con `fechaRecogidaBolivia`).
     - El estado del pedido se mantiene intacto (`ENTREGADO`).
     - Se emite en tiempo real `cocina:pedido_recogido` y `cocina:actualizar_tablero`.
     - La tarjeta desaparece automáticamente de la vista activa de Cocina (`GET /api/pedidos?activo=true` la excluye), manteniendo limpio el tablero sin requerir recargar la página.

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
| **`cocina:actualizar_tablero`** | Broadcast (Todos) | Cambio de estado de comanda (`PATCH /pedidos/:id/estado`), actualización de detalles (`PUT`), pedido recogido (`PATCH /pedidos/:id/recoger`) o pago completado (`/procesar`). | Documento `Pedido` actualizado. |
| **`cocina:pedido_recogido`** | Broadcast (Todos) | Mesero marca la recogida de la comanda en cocina (`PATCH /api/pedidos/:id/recoger`). | `{ "pedidoId": "...", "codigo": "PED-0001", "mesaId": "...", "mesaNombre": "Mesa 1", "recogido": true, "recogidoPor": "...", "fechaRecogida": "..." }` |
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
8. **NO asumir que la recogida del pedido por el mesero es un estado nuevo:** El estado del pedido se mantiene en `ENTREGADO`. La recogida se registra mediante `PATCH /api/pedidos/:id/recoger`, la cual establece el flag booleano `recogido: true` y retira la orden del tablero activo de cocina sin alterar la máquina de estados del pedido.

---

# 13. Lista de Verificación para el Desarrollador Frontend

- [ ] **Configurar Variables de Entorno Next.js:** Definir `NEXT_PUBLIC_API_URL=http://localhost:3000/api` y `NEXT_PUBLIC_SOCKET_URL=http://localhost:3000` en `.env.local`.
- [ ] **Configurar Puerto de Desarrollo Frontend:** Configurar Next.js en puerto `3001` (ej. `"dev": "next dev -p 3001"`) para evitar colisiones con el puerto `3000` del backend.
- [ ] **Implementar Flujo de Login:** Enviar `email` y `password` a `POST /api/usuarios/login` y capturar el token JWT.
- [ ] **Manejar JWT y Persistencia:** Adjuntar cabecera `Authorization: Bearer <token>` en todas las peticiones con interceptor HTTP (Axios / Fetch).
- [ ] **Manejar Roles y Rutas Protegidas:** Ocultar o proteger vistas en el cliente según el rol (`Administrador`, `Mesero`, `Cajero`, `Cocinero`).
- [ ] **Implementar Consumo de Endpoints REST:** Integrar las 48 operaciones HTTP respetando DTOs y parámetros oficiales.
- [ ] **Implementar Máquina de Estados:** Validar transiciones de pedidos y mesas en UI antes de disparar las peticiones.
- [ ] **Restringir Opciones de Pago:** Ofrecer únicamente `'Efectivo'`, `'Tarjeta'` y `'QR'` en el formulario de cobro en caja.
- [ ] **Conectar Socket.IO con Handshake Autenticado:** Pasar el token en `auth: { token }` al inicializar la conexión con `NEXT_PUBLIC_SOCKET_URL`.
- [ ] **Configurar Listeners de WebSockets:** Manejar `cocina:nuevo_pedido`, `cocina:pedido_recogido`, `cocina:actualizar_tablero`, `mesas:updated`, `mesas:alerta_listo` y `caja:nueva_cuenta`.
- [ ] **Manejar Errores Globales:** Capturar respuestas 401 para redirección automática y 400 con mensajes de validación de negocio.
- [ ] **Probar Flujo E2E de Pedido:** Ocupación temporal de mesa -> Apertura de comanda en salón por Mesero -> Preparación en Cocina -> Alerta de entrega -> Recogida física por Mesero (`PATCH /api/pedidos/:id/recoger`).
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
   - Existen **32 rutas URI (paths)** y **48 operaciones HTTP activas (Método + Ruta)**. Todas las 48 operaciones están documentadas en esta guía y corresponden a la totalidad del backend.
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
