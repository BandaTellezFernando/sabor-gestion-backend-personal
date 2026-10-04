# 15. MANUAL TÉCNICO

**Sistema de Gestión para Restaurante – Sabor & Gestión (Backend)**  
*Guía técnica integral de instalación, configuración, ejecución, administración y resolución de problemas*

---

## 15.1 Requisitos del Sistema

Esta sección describe de manera formal y cuantitativa los recursos de hardware y componentes de software indispensables para ejecutar, compilar y operar el backend del proyecto **Sabor & Gestión**. Las especificaciones han sido determinadas a partir de las demandas reales del motor Node.js, la pila de dependencias en TypeScript, la concurrencia de WebSockets y la persistencia en MongoDB Atlas.

---

### 15.1.1 Requisitos de Hardware

El backend está diseñado bajo una arquitectura ligera orientada a servicios desacoplados en Node.js, lo que permite su ejecución tanto en estaciones de trabajo de desarrollo como en instancias virtuales de nube (VPS / PaaS).

| Componente | Requisito Mínimo (Desarrollo) | Requisito Recomendado (Producción / Carga) | Justificación Técnica |
| :--- | :--- | :--- | :--- |
| **Procesador (CPU)** | 2 núcleos (x86_64 o ARM64) a 2.0 GHz (ej. Intel Core i3 / AMD Ryzen 3 / 1 vCPU) | 4 núcleos o superior a 2.5 GHz (ej. Intel Core i5/i7, AMD Ryzen 5 o 2+ vCPUs) | Node.js opera en un único hilo para el bucle de eventos (`Event Loop`), pero el compilador de TypeScript (`tsc`), el transpilador `tsx`, la librería criptográfica `bcryptjs` (cálculo intensivo de 10 rondas de salt) y la compresión de red demandan ciclos de CPU auxiliares (`worker threads` de libuv). |
| **Memoria RAM** | 2.0 GB de memoria física disponible | 4.0 GB o superior | El proceso de Node.js en ejecución estándar consume entre 80 MB y 180 MB. Sin embargo, durante el proceso de compilación (`pnpm run build`) o recarga en caliente con Nodemon (`pnpm run dev`), el compilador TypeScript almacena en memoria el árbol de tipos AST, alcanzando picos transitorios de 600 MB a 1.2 GB. |
| **Almacenamiento** | 1.5 GB de espacio libre en disco | 5.0 GB de almacenamiento SSD | El código fuente ocupa menos de 10 MB. No obstante, el árbol de dependencias instalado en `node_modules` requiere aproximadamente 300 MB a 400 MB, la compilación de salida en `dist/` demanda 15 MB, y el gestor `pnpm` utiliza un almacén global indexado (`hard links content-addressable store`) para optimizar el espacio. |
| **Conexión de Red** | Conexión de banda ancha estable (mínimo 2 Mbps de subida/bajada) | Conexión simétrica de baja latencia (< 50 ms a centros de datos) | **Estrictamente obligatoria.** El backend no aloja la base de datos de manera local por defecto, sino que se conecta a **MongoDB Atlas** mediante el puerto seguro `27017` TCP. Adicionalmente, el servidor interactúa en tiempo real con las APIs externas de **Cloudinary** (puerto `443` HTTPS), **EmailJS** (puerto `443` HTTPS) y **QR Server** (puerto `443` HTTPS). |

> [!NOTE]
> Este backend no requiere aceleradores gráficos (GPU), dispositivos de captura biométrica ni periféricos especiales.

---

### 15.1.2 Requisitos de Software

A continuación se detallan las plataformas, utilitarios y motores de ejecución requeridos para el funcionamiento del repositorio.

#### 1. Sistema Operativo Compatible
* **Linux:** Distribuciones modernas basadas en Debian/Ubuntu (Ubuntu 20.04 LTS o superior, Debian 11+), Fedora 36+, Arch Linux o Alpine Linux (glibc).
* **macOS:** macOS Monterey (versión 12) o posterior (plataformas Intel o Apple Silicon M1/M2/M3/M4).
* **Windows:** Windows 10 (versión 2004 o superior) o Windows 11 de 64 bits. Para entornos de desarrollo en Windows, se recomienda el uso de **WSL2** (Windows Subsystem for Linux con Ubuntu) o una consola PowerShell moderna ejecutada con permisos apropiados.

#### 2. Herramientas y Versiones Específicas del Proyecto

| Herramienta | Propósito en el Proyecto | Versión Requerida | Comando de Comprobación | Salida Típica Esperada |
| :--- | :--- | :---: | :--- | :--- |
| **Git** | Clonación del repositorio, control de versiones y sincronización de ramas. | `≥ 2.30.0` | `git --version` | `git version 2.43.0` |
| **Node.js** | Entorno de ejecución para el motor JavaScript V8 del lado del servidor. | `≥ 20.0.0 LTS` (Compatible con v20, v22, v24) | `node --version` | `v20.19.0` o `v24.18.0` |
| **pnpm** | Gestor de paquetes oficial del proyecto (definido en `package.json`). Administra la instalación determinista mediante `pnpm-lock.yaml`. | `≥ 9.0.0` (Especificado: `12.4.2`) | `pnpm --version` | `12.4.2` |
| **TypeScript / tsc** | Compilador estático oficial del lenguaje TypeScript a JavaScript ECMAScript estándar. | `^5.0.0` (Instalado: `5.9.3`) | `npx tsc --version` | `Version 5.9.3` |
| **MongoDB Atlas** | Servicio gestionado en la nube para la base de datos NoSQL documental multiregión. | `MongoDB 6.0` o superior (M0 Free Tier o clúster dedicado) | Conectividad TCP al clúster (`ping` o cadena SRV) | Conexión establecida mediante protocolo `mongodb+srv://` |
| **Navegador Web** | Inspección visual y pruebas rápidas del estado de salud del servidor y validación de URLs de imágenes y códigos QR. | Cualquier navegador moderno (Chrome, Firefox, Safari, Edge) | N/A | Renderizado de JSON del endpoint `/api/health` |
| **Cliente HTTP / Postman** | Simulación de clientes cliente/servidor, emisión de comandas, carga multipart/form-data y autorización con cabeceras Bearer. | Postman `v10+`, Thunder Client, Insomnia o cURL | `curl --version` | `curl 8.5.0 ...` |

---

## 15.2 Instalación Paso a Paso

El siguiente procedimiento está redactado de manera exhaustiva para que cualquier evaluador o estudiante pueda inicializar el entorno desde cero en una máquina limpia.

```mermaid
flowchart TD
    A[1. Clonar Repositorio Git] --> B[2. Acceder al Directorio]
    B --> C[3. Verificar Node.js y pnpm]
    C --> D[4. Ejecutar pnpm install]
    D --> E[5. Crear y Configurar .env]
    E --> F[6. Configurar MongoDB Atlas]
    F --> G[7. Auditar Instalación con pnpm list]
    G --> H[8. Carga Inicial de Datos: pnpm run seed]
    H --> I[9. Carga de Inventario: pnpm run seed:inventario]
    I --> J[10. Sistema Listo para Iniciar]
```

---

### Paso 1: Obtener el Código Fuente
Abra una ventana de terminal y descargue la copia exacta del repositorio oficial desde GitHub utilizando Git:

```bash
git clone https://github.com/BandaTellezFernando/sabor-gestion-backend-personal.git
```

* **Qué se hace:** Se replica la estructura de archivos, el historial de confirmaciones y la rama principal del proyecto.
* **Por qué se hace:** Es el paso inicial indispensable para disponer localmente del código fuente.
* **Resultado esperado:**
  ```text
  Cloning into 'sabor-gestion-backend-personal'...
  remote: Enumerating objects: 1240, done.
  remote: Counting objects: 100% (1240/1240), done.
  remote: Compressing objects: 100% (650/650), done.
  remote: Total 1240 (delta 720), reused 1150 (delta 580)
  Receiving objects: 100% (1240/1240), 1.20 MiB | 3.50 MiB/s, done.
  Resolving deltas: 100% (720/720), done.
  ```

---

### Paso 2: Acceder al Directorio del Proyecto
Navegue dentro de la carpeta creada por la clonación:

```bash
cd sabor-gestion-backend-personal
```

* **Qué se hace:** Se establece el directorio de trabajo actual en la raíz del backend.
* **Por qué se hace:** Todos los scripts de compilación, gestión de dependencias y variables de entorno deben ejecutarse en la raíz del repositorio.
* **Resultado esperado:** El indicador de la terminal apuntará a la ruta `.../sabor-gestion-backend-personal$`.

---

### Paso 3: Verificar la Instalación de Node.js
Compruebe que el entorno de ejecución Node.js se encuentra instalado y cumple con la versión mínima requerida:

```bash
node --version
```

* **Qué se hace:** Se consulta al sistema operativo la versión del binario de Node.js en el PATH.
* **Por qué se hace:** Versiones inferiores a Node.js 20 no cuentan con soporte para ciertas características del compilador TypeScript y módulos ECMAScript modernos.
* **Resultado esperado:** Una cadena con formato `v20.x.x`, `v22.x.x` o `v24.x.x` (ejemplo: `v24.18.0`).

---

### Paso 4: Verificar o Instalar el Gestor de Paquetes pnpm
Verifique la presencia de `pnpm`:

```bash
pnpm --version
```

Si la herramienta no se encuentra instalada en el sistema, habilítela mediante `corepack` (incluido nativamente en Node.js) o instálela globalmente con `npm`:

```bash
# Opción A (Recomendada con corepack):
corepack enable
corepack prepare pnpm@12.4.2 --activate

# Opción B (Alternativa directa con npm):
npm install -g pnpm
```

* **Qué se hace:** Se asegura que el gestor de paquetes que gobierna el archivo `pnpm-lock.yaml` esté disponible.
* **Por qué se hace:** Instalar paquetes con `npm` o `yarn` en lugar de `pnpm` puede generar árboles de resolución incongruentes y romper la reproducibilidad de las dependencias.
* **Resultado esperado:** La terminal muestra la versión activa de pnpm (ejemplo: `12.4.2`).

---

### Paso 5: Instalar Dependencias del Proyecto
Descargue e instale el árbol completo de dependencias de producción y desarrollo:

```bash
pnpm install
```

* **Qué se hace:** `pnpm` lee el archivo `package.json` y el archivo de bloqueo `pnpm-lock.yaml`, descarga los paquetes verificados criptográficamente y genera la carpeta `node_modules` mediante enlaces duros.
* **Por qué se hace:** Provee las librerías esenciales del backend: Express 5, Mongoose 9, Socket.IO 4.8, jsonwebtoken, bcryptjs, Cloudinary, Multer, etc.
* **Resultado esperado:**
  ```text
  Lockfile is up to date, resolution step is skipped
  Packages: +258
  +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  Progress: resolved 258, reused 258, downloaded 0, added 258, done
  Done in 3.2s
  ```

---

### Paso 6: Crear el Archivo de Variables de Entorno (`.env`)
Genere un archivo nuevo con el nombre exacto `.env` en la raíz del proyecto:

```bash
touch .env
```

* **Qué se hace:** Se crea el archivo donde residirán las credenciales locales de ejecución.
* **Por qué se hace:** La librería `dotenv` inyecta en tiempo de arranque los valores de este archivo en el objeto global `process.env`.
* **Resultado esperado:** El archivo `.env` queda disponible en el directorio raíz.

---

### Paso 7: Configuración de Clúster en MongoDB Atlas
Si no cuenta con una base de datos activa:
1. Ingrese a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) y cree un clúster gratuito (M0 Sandbox).
2. Cree un usuario de base de datos en **Security → Database Access** con rol de lectura y escritura (`Read and write to any database`).
3. Configure la lista de acceso de red en **Security → Network Access**: añada su dirección IP actual o `0.0.0.0/0` (permitir acceso global para fines de desarrollo universitario).
4. En **Deployment → Database**, presione **Connect → Drivers (Node.js)** y copie la cadena de conexión generada con protocolo `mongodb+srv://`.
5. Abra el archivo `.env` con un editor de texto (ej. `nano .env` o VS Code) y pegue su configuración siguiendo el formato documentado en la Sección 15.3.

---

### Paso 8: Comprobar la Integridad de las Dependencias Instaladas
Verifique que los paquetes de nivel superior se encuentren correctamente enlazados:

```bash
pnpm list --depth=0
```

* **Qué se hace:** Se audita la presencia de las dependencias directas sin profundizar en subárboles.
* **Resultado esperado:**
  ```text
  Legend: production dependency, optional dependency, dev dependency

  sabor-gestion-backend@1.0.0 /home/.../sabor-gestion-backend-personal

  dependencies:
  bcryptjs 3.0.3          express 5.2.1           multer 2.1.1
  cloudinary 2.9.0        jsonwebtoken 9.0.3      socket.io 4.8.3
  cors 2.8.6              mongoose 9.3.1
  dotenv 17.3.1           morgan 1.10.1

  devDependencies:
  @types/cors 2.8.17          @types/node 20.19.30        prettier 3.5.3
  @types/express 5.0.0        @typescript-eslint/parser   ts-node 10.9.2
  @types/jsonwebtoken 9.0.10  eslint 8.57.1               tsx 4.21.0
  @types/morgan 1.9.10        nodemon 3.1.14              typescript 5.9.3
  @types/multer 2.1.0
  ```

---

### Paso 9: Carga Inicial de Datos Maestros (Seed)
Para que el sistema sea inmediatamente funcional (disponer de categorías, menú de platos, mesas y usuarios base), ejecute el script de inicialización:

```bash
pnpm run seed
```

* **Qué se hace:** Ejecuta `ts-node src/utils/seed.ts`. Limpia colecciones previas y genera:
  * 5 Categorías gastronómicas (`Entradas`, `Sopas`, `Segundos`, `Postres`, `Bebidas`).
  * 1 Usuario Administrador: `admin@sabor.com` / contraseña: `admin123`.
  * 1 Usuario Mesero: `mesero@sabor.com` / contraseña: `mesero123`.
  * 2 Platos base con precio y categoría.
  * 8 Mesas de salón en estado `Libre`.
* **Resultado esperado:**
  ```text
  🟢 Conectado a la Base de Datos para seeding...
  🧹 Colecciones limpias
  ✅ 5 categorías creadas
  ✅ Usuario Admin creado: admin@sabor.com / admin123
  ✅ Usuario Mesero creado: mesero@sabor.com / mesero123
  ✅ 2 platos de ejemplo creados
  ✅ 8 mesas creadas

  🌱 🎉 Seeding completado exitosamente

  📋 CREDENCIALES DE PRUEBA:
     Admin: admin@sabor.com / admin123
     Mesero: mesero@sabor.com / mesero123
  ```

---

### Paso 10: Carga de Datos de Inventario y Recetas (Opcional)
Para habilitar la validación preventiva de stock culinario antes de emitir pedidos, ejecute:

```bash
pnpm run seed:inventario
```

* **Qué se hace:** Ejecuta `tsx src/utils/seedInventario.ts`, creando ingredientes (`Carne de Res`, `Papa`, `Huevo`) y vinculando una receta al plato existente.
* **Resultado esperado:** `✅ Receta creada exitosamente... Seed de inventario finalizado`.

---

## 15.3 Configuración del Sistema

### 15.3.1 Variables de Entorno

El backend utiliza la biblioteca `dotenv` para leer las variables declaradas en el archivo `.env`. A continuación se presenta la tabla exhaustiva con las **11 variables de entorno reales** que consume el código fuente en `src/`:

| Dominio | Variable | Obligatoria | Valor por Defecto | Formato / Ejemplo Ficticio | Propósito en el Código |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **Servidor** | `PORT` | No | `3000` | `3000` | Puerto TCP de red donde el servidor HTTP Express y Socket.IO reciben conexiones (`src/server.ts`). |
| **Entorno** | `NODE_ENV` | Sí | N/A | `development` | Identifica el modo de ejecución. Protege contra la ejecución accidental de scripts de seed destructivos en producción (`src/utils/seed.ts`). |
| **Persistencia** | `MONGO_URI` | **SÍ** | N/A | `mongodb+srv://admin_dev:ClaveFicticia123@cluster-sabor.mongodb.net/sabor_gestion_db?retryWrites=true&w=majority` | Cadena de conexión URI a MongoDB Atlas o base de datos local. Leída en `src/configs/db.ts` y scripts de seed. |
| **Seguridad** | `JWT_SECRET` | **SÍ** | N/A | `clave_secreta_jwt_para_desarrollo_academico_2026` | Clave secreta simétrica utilizada para firmar y verificar tokens de autenticación en HTTP (`auth.middleware.ts`, `usuario.service.ts`) y WebSockets (`socket.ts`). |
| **Multimedia** | `CLOUDINARY_CLOUD_NAME` | Sí* | N/A | `mi-restaurante-cloud` | Identificador del espacio de almacenamiento en la nube de Cloudinary (`src/configs/cloudinary.ts`). |
| **Multimedia** | `CLOUDINARY_API_KEY` | Sí* | N/A | `987654321012345` | Identificador público de la API de Cloudinary (`src/configs/cloudinary.ts`). |
| **Multimedia** | `CLOUDINARY_API_SECRET` | Sí* | N/A | `abcdef1234567890abcdef12345` | Llave secreta para autorizar subidas en streaming desde Multer (`src/configs/cloudinary.ts`). |
| **Notificaciones** | `EMAILJS_SERVICE_ID` | Sí* | N/A | `service_restaurante_notif` | ID del servicio en EmailJS configurado para envío de correos transaccionales (`src/services/email.service.ts`). |
| **Notificaciones** | `EMAILJS_TEMPLATE_ID` | Sí* | N/A | `template_comprobante_pago` | ID de la plantilla HTML diseñada para el comprobante de pago (`src/services/email.service.ts`). |
| **Notificaciones** | `EMAILJS_USER_ID` | Sí* | N/A | `user_public_key_emailjs_123` | Clave pública de cuenta en EmailJS (`src/services/email.service.ts`). |
| **Notificaciones** | `EMAILJS_ACCESS_TOKEN` | Sí* | N/A | `access_token_privado_emailjs` | Token privado de autorización para peticiones directas vía `fetch` a EmailJS REST API (`src/services/email.service.ts`). |

*\* Nota: Las variables de Cloudinary y EmailJS son obligatorias si se utilizan las funciones de subida de imágenes de platos o despacho de comprobantes de pago por correo electrónico, respectivamente. Si no se configuran, el servidor arrancará normalmente pero los endpoints respectivos devolverán error al ser invocados.*

> [!CAUTION]
> **REGLA DE INTEGRIDAD CRÍTICA:**  
> La variable de base de datos en este proyecto se llama estrictamente `MONGO_URI`. Si se configura por error con el nombre alternativo `MONGODB_URI`, el archivo `src/configs/db.ts` lanzará la excepción:  
> `Error: La variable de entorno MONGO_URI no está definida.` y el servidor abortará inmediatamente con código de salida `1`.

#### Plantilla Completa de Configuración de Prueba (`.env`)

Cargue en su archivo `.env` el siguiente bloque de prueba (sustituyendo las credenciales por las correspondientes a sus servicios):

```env
# ── Servidor y Entorno ──────────────────────────────────────
PORT=3000
NODE_ENV=development

# ── Persistencia de Datos (MongoDB Atlas) ───────────────────
MONGO_URI=mongodb+srv://usuario_prueba:password123@cluster0.abcde.mongodb.net/sabor_gestion_db?retryWrites=true&w=majority

# ── Seguridad y Criptografía (JWT) ──────────────────────────
JWT_SECRET=super_secret_jwt_key_sabor_gestion_2026_universidad

# ── Almacenamiento de Imágenes (Cloudinary) ─────────────────
CLOUDINARY_CLOUD_NAME=demo_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz123

# ── Notificaciones de Recibos por Correo (EmailJS) ─────────
EMAILJS_SERVICE_ID=service_sabor_demo
EMAILJS_TEMPLATE_ID=template_recibo_demo
EMAILJS_USER_ID=user_public_key_demo
EMAILJS_ACCESS_TOKEN=token_privado_demo_emailjs
```

---

### 15.3.2 Base de Datos

* **Motor:** MongoDB (motor NoSQL orientado a documentos BSON).
* **Controlador de Conexión:** Mongoose `v9.3.1`.
* **Mecanismo de Conexión:** Protocolo estándar SRV (`mongodb+srv://`). En `src/configs/db.ts`, Mongoose establece una conexión persistente mediante un pool interno de sockets. Si la conexión se pierde en el arranque, el backend ejecuta `process.exit(1)`.
* **Restricciones de Acceso:** En entornos corporativos o de producción, el acceso a MongoDB Atlas debe limitarse a la dirección IP pública estática del servidor backend en la sección **Network Access** del clúster.

---

### 15.3.3 Servicio de Generación de Códigos QR

El backend no requiere librerías locales pesadas ni variables de entorno para la generación de códigos QR. La función `generarPagoQR` en `src/services/pago.service.ts` construye dinámicamente un enlace que utiliza la API pública de **QR Server**:

```typescript
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${datosPago}`
```

Esto reduce la sobrecarga de CPU y memoria del servidor, delegando el renderizado de la imagen matricial al servicio CDN externo.

---

### 15.3.4 Configuración de Puertos y CORS

* **Puerto:** Por defecto, el servidor se aloja en el puerto `3000`. Puede modificarse cambiando el valor de la variable `PORT` en el `.env` (ejemplo: `PORT=8080`).
* **CORS (Cross-Origin Resource Sharing):** La política de orígenes cruzados está definida de manera estática en `src/app.ts` y `src/socket/socket.ts`. Los orígenes habilitados son:
  * `http://localhost:5173` (Entorno de desarrollo local Vite/React).
  * `http://localhost:5174` (Puerto alternativo de desarrollo frontend).
  * `https://quirquinita.onrender.com` (Despliegue frontend en Render).
  * `https://tis-pied.vercel.app` (Despliegue frontend en Vercel).
* **Credenciales:** `credentials: true` está habilitado para permitir el intercambio de cookies seguras y cabeceras de autorización.

---

## 15.4 Ejecución del Sistema

El archivo `package.json` define tres modalidades principales de ejecución del backend.

```mermaid
flowchart LR
    subgraph Desarrollo
        A[pnpm run dev] --> B[nodemon + tsx]
        B --> C[Hot Reload en src/server.ts]
    end
    subgraph Producción
        D[pnpm run build] --> E[Compilador tsc]
        E --> F[Salida dist/server.js]
        F --> G[pnpm start]
        G --> H[Node.js Engine en dist/]
    end
```

---

### 15.4.1 Modo Desarrollo (Hot Reload)

Para trabajar de manera interactiva durante el desarrollo y depuración de código:

```bash
pnpm run dev
```

* **Qué hace:** Ejecuta `nodemon --exec tsx src/server.ts`. El transpilador `tsx` ejecuta directamente el código TypeScript en memoria sin esperar una compilación previa a disco. Cualquier cambio guardado en cualquier archivo `.ts` reinicia el servidor en menos de 500 ms.
* **Salida esperada en consola:**
  ```text
  [nodemon] 3.1.14
  [nodemon] to restart at any time, enter `rs`
  [nodemon] watching path(s): *.*
  [nodemon] watching extensions: ts,json
  [nodemon] starting `tsx src/server.ts`
  🟢 Base de Datos MongoDB Conectada: sabor_gestion_db
  🚀 Servidor ejecutándose en http://localhost:3000
  🩺 Health check: http://localhost:3000/api/health
  🚀 Servidor con WebSockets en http://localhost:3000
  ```

---

### 15.4.2 Compilación del Proyecto (Build)

Antes de desplegar en producción o validar la ausencia total de errores de tipado estático:

```bash
pnpm run build
```

* **Qué hace:** Invoca el compilador oficial de TypeScript (`tsc`) configurado en `tsconfig.json`. Lee el directorio `src/`, resuelve tipos y emite los archivos JavaScript estándar resultantes y sus mapas de declaraciones en el directorio `dist/`.
* **Salida esperada:** El comando finaliza silenciosamente con código de salida `0`. Si existen errores de sintaxis o tipos, `tsc` imprimirá la lista detallada de líneas afectadas y abortará la emisión de archivos.

---

### 15.4.3 Modo Producción

Para ejecutar el servidor compilado con máxima eficiencia y menor consumo de memoria:

```bash
pnpm start
```

* **Qué hace:** Ejecuta directamente el archivo compilado `node dist/server.js` utilizando el motor nativo de Node.js, sin la sobrecarga de Nodemon ni del transpilador TypeScript.
* **Salida esperada en consola:**
  ```text
  🟢 Base de Datos MongoDB Conectada: sabor_gestion_db
  🚀 Servidor ejecutándose en http://localhost:3000
  🩺 Health check: http://localhost:3000/api/health
  🚀 Servidor con WebSockets en http://localhost:3000
  ```

---

### 15.4.4 Comprobación del Funcionamiento (Healthcheck)

Una vez iniciado el servidor en cualquiera de sus modalidades, verifique el estado del servicio mediante una petición HTTP GET al endpoint público de comprobación de salud:

#### Mediante cURL:
```bash
curl -X GET http://localhost:3000/api/health
```

#### Mediante Navegador Web:
Ingrese a la URL: `http://localhost:3000/api/health`

#### Respuesta JSON esperada (HTTP 200 OK):
```json
{
  "status": "success",
  "message": "API de Sabor & Gestión funcionando correctamente 🚀"
}
```

---

## 15.5 Administración del Sistema

Esta sección explica los procedimientos operativos habituales que un administrador técnico debe ejecutar tras la puesta en marcha del backend.

---

### 15.5.1 Cómo Detener el Servidor

* **En primer plano (Terminal interactiva):** Presione la combinación de teclas `Ctrl + C` en la consola donde se está ejecutando el proceso. Esto envía la señal estándar `SIGINT`, permitiendo al proceso Node.js cerrar sus conexiones activas y finalizar limpiamente.
* **En segundo plano o procesos bloqueados:** Si el servidor quedó ejecutándose en segundo plano o el puerto quedó atrapado, localice el identificador de proceso (PID) y finalícelo:
  ```bash
  # En Linux / macOS:
  lsof -i :3000
  # Una vez obtenido el PID (ej. 12345):
  kill -9 12345

  # O en un único paso:
  npx kill-port 3000
  ```

---

### 15.5.2 Cómo Reiniciar el Backend

1. **En entorno de desarrollo:**
   * Si el cambio fue en un archivo de código TypeScript (`src/**/*.ts`), Nodemon lo detecta y reinicia automáticamente sin intervención.
   * Si se desea forzar un reinicio manual desde la misma terminal sin detener el proceso, escriba `rs` y presione `Enter`.
   * Si se editó el archivo `.env`, presione `Ctrl + C` y vuelva a ejecutar `pnpm run dev` para que `dotenv` recargue los nuevos valores en memoria.
2. **En entorno de producción:**
   ```bash
   pnpm run build && pnpm start
   ```

---

### 15.5.3 Procedimiento de Actualización de Versión

Para incorporar cambios o correcciones enviados al repositorio central de Git:

```bash
# 1. Obtener los últimos cambios de la rama principal
git pull origin main

# 2. Instalar o actualizar dependencias que hayan cambiado en pnpm-lock.yaml
pnpm install

# 3. Recompilar los archivos TypeScript para actualizar dist/
pnpm run build

# 4. Reiniciar la instancia de producción
pnpm start
```

---

### 15.5.4 Revisión y Monitoreo de Logs

El sistema utiliza la biblioteca `morgan` configurada en formato `'dev'` (`src/app.ts`), complementada con logs semánticos de consola con indicadores visuales:

* **Peticiones HTTP entrantes:** Se imprimen en tiempo real en la salida estándar (`stdout`) indicando método, ruta, código de estado HTTP y tiempo de respuesta:
  ```text
  GET /api/health 200 2.450 ms - 89
  POST /api/usuarios/login 200 78.120 ms - 245
  GET /api/platos 304 4.102 ms - -
  ```
* **Eventos de WebSockets:**
  ```text
  ⚡ Usuario conectado: hG8_Xk92LaP (Rol: Mesero)
  ⚡ Usuario conectado: mK2_Yq18ZwT (Rol: Cajero)
  🔥 Usuario desconectado: hG8_Xk92LaP
  ```
* **Errores de servidor:** Se canalizan a la salida de errores (`stderr`) con detalles del stack trace y código de respuesta HTTP 500.

> [!NOTE]
> El proyecto no utiliza servicios de logging en disco rotativo ni herramientas complejas como Winston o Pino. Todo el flujo de logs se canaliza directamente a la consola estándar del proceso, lo que facilita su captura por cualquier plataforma PaaS o contenedor.

---

### 15.5.5 Verificación de Servicios Vinculados

| Servicio | Método de Comprobación | Diagnóstico de Falla |
| :--- | :--- | :--- |
| **Backend HTTP** | Petición `GET /api/health`. Debe retornar HTTP 200 con `{ status: "success" }`. | Si no responde, el proceso no está corriendo o el puerto está bloqueado por el cortafuegos. |
| **MongoDB Atlas** | Observar el mensaje de inicio: `🟢 Base de Datos MongoDB Conectada: ...` | Si la conexión falla, se imprime `🔴 Error conectando a MongoDB` y el proceso termina inmediatamente con código `1`. |
| **WebSockets** | Conectar un cliente Socket.IO a `ws://localhost:3000` pasando el token JWT en el handshake (`auth: { token }`). Debe emitir log `⚡ Usuario conectado`. | Si el token no se envía o es inválido, el socket se rechaza con log `⚡ Socket rechazado (sin token)` o `(token inválido)`. |
| **Cloudinary** | Enviar una petición `POST /api/upload` con un archivo de imagen en campo `image` y cabecera de autenticación. | Si las credenciales son erróneas, la API devuelve error HTTP 500 con detalle de Cloudinary. |
| **EmailJS** | Ejecutar `POST /api/pagos/enviar-recibo/:pedidoId` con un payload JSON `{ "email": "destino@correo.com" }`. | Si faltan variables en `.env`, el servicio lanza la excepción `Credenciales de EmailJS no configuradas`. |

---

## 15.6 Solución de Problemas Frecuentes

La siguiente matriz diagnóstica aborda las contingencias técnicas reales que pueden presentarse durante la instalación, compilación y ejecución del backend.

| N.º | Problema Reportado | Causa Raíz Probable | Procedimiento Diagnóstico | Solución Paso a Paso |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `Error: Cannot find module '...'` al iniciar el servidor. | No se ejecutó la instalación de dependencias o se agregaron librerías sin actualizar `node_modules`. | Verificar la existencia de la carpeta `node_modules` en la raíz del proyecto. | Ejecutar `pnpm install` para sincronizar el árbol de librerías con el archivo de bloqueo `pnpm-lock.yaml`. |
| **2** | `Error: listen EADDRINUSE: address already in use :::3000` | El puerto 3000 ya está siendo utilizado por otra instancia previa del backend o por otra aplicación. | Ejecutar `lsof -i :3000` en Linux/macOS o `netstat -ano \| findstr :3000` en Windows. | Finalizar el proceso que ocupa el puerto con `npx kill-port 3000` o cambiar la variable `PORT=3001` en el archivo `.env`. |
| **3** | `Error: La variable de entorno MONGO_URI no está definida.` | Falta el archivo `.env` o la variable fue nombrada erróneamente como `MONGODB_URI`. | Abrir `.env` y revisar la ortografía exacta de la clave de conexión. | Asegurarse de que el archivo se llame exactamente `.env` y que la línea comience con `MONGO_URI=mongodb+srv://...`. |
| **4** | `MongooseServerSelectionError: connection timed out` | La IP pública actual de la máquina no está autorizada en la lista blanca de MongoDB Atlas. | Revisar la consola de MongoDB Atlas en el apartado **Network Access**. | Añadir la dirección IP actual o añadir temporalmente `0.0.0.0/0` (permitir acceso desde cualquier IP) en MongoDB Atlas. |
| **5** | `MongoServerError: bad auth : Authentication failed.` | El usuario o la contraseña incluidos en la cadena `MONGO_URI` son incorrectos o contienen caracteres especiales no escapados. | Verificar las credenciales en **Database Access** de MongoDB Atlas. | Generar una nueva contraseña alfanumérica sin caracteres especiales confusos y actualizar la URI en el `.env`. |
| **6** | `Error: JWT_SECRET no está configurado en las variables de entorno` | La variable `JWT_SECRET` está ausente o vacía en el archivo `.env`. | Comprobar el contenido de `.env` buscando la variable `JWT_SECRET`. | Añadir `JWT_SECRET=una_clave_secreta_segura` en el archivo `.env` y reiniciar el servidor. |
| **7** | Falla en `pnpm run build` con errores de tipo TypeScript (`TS2322`, `TS2339`). | Incompatibilidad de tipos o modificaciones manuales en las interfaces de `src/types/`. | Ejecutar `npx tsc --noEmit` para visualizar la lista completa de errores del compilador. | Corregir las inconsistencias de tipado en los archivos señalados en la salida de la terminal hasta que `tsc` complete sin errores. |
| **8** | Respuesta `401 Unauthorized` al consultar endpoints protegidos. | No se envió la cabecera `Authorization` o el token JWT expiró (vida útil máxima: 8 horas). | Inspeccionar las cabeceras HTTP de la petición en Postman o en el cliente frontend. | Obtener un nuevo token válido mediante `POST /api/usuarios/login` e incluirlo como cabecera: `Authorization: Bearer <nuevo_token>`. |
| **9** | Rechazo de conexión en WebSockets (`Unauthorized`). | El cliente Socket.IO intentó conectarse sin proveer el token JWT en el objeto `auth` o cabecera del handshake. | Revisar los logs del backend: `⚡ Socket rechazado (sin token)`. | Configurar el cliente de sockets pasando `{ auth: { token: "..." } }` al inicializar la conexión con el servidor. |
| **10** | Error `Seed no permitido en producción. Operación destructiva abortada.` | Se intentó ejecutar `pnpm run seed` con la variable `NODE_ENV=production`. | Verificar el valor de `NODE_ENV` en el archivo `.env` o en el entorno del sistema. | El comando de seed borra la base de datos deliberadamente. Solo debe ejecutarse en entornos de desarrollo (`NODE_ENV=development`). |

---

## 15.7 Estructura y Organización del Código

El backend implementa una arquitectura en capas con separación rigurosa de responsabilidades, garantizando alta cohesión y bajo acoplamiento:

```text
sabor-gestion-backend-personal/
├── .env                  # Variables de entorno locales (ignorado por Git)
├── .gitignore            # Reglas de exclusión para control de versiones
├── eslint.config.cjs     # Configuración de análisis estático de código
├── package.json          # Metadatos, dependencias y scripts de ejecución
├── pnpm-lock.yaml        # Árbol determinista de dependencias congeladas
├── tsconfig.json         # Configuración del compilador oficial de TypeScript
├── vercel.json           # Manifiesto de despliegue serverless para Vercel
├── docs/                 # Documentación técnica, diagramas y especificación OpenAPI
│   ├── openapi.yaml      # Contrato formal OpenAPI 3.0.3 del backend
│   └── Manual_Tecnico_Sabor_Gestion.pdf
└── src/                  # Código fuente TypeScript del backend
    ├── server.ts         # Punto de entrada principal (servidor HTTP + WebSockets)
    ├── app.ts            # Configuración de Express, middlewares globales y rutas
    ├── configs/          # Conexiones con servicios externos (MongoDB, Cloudinary)
    ├── controllers/      # Controladores HTTP (manejo de req, res y códigos de estado)
    ├── middlewares/      # Interceptores de seguridad (JWT, control de roles RBAC)
    ├── models/           # Esquemas y modelos de persistencia Mongoose
    ├── repositories/     # Capa de acceso a datos y consultas a colecciones
    ├── routes/           # Declaración y enrutamiento modular de endpoints de la API
    ├── services/         # Capa de lógica de negocio y reglas transaccionales
    ├── socket/           # Gestión de WebSockets (Socket.IO, salas y autenticación)
    ├── types/            # Definiciones de tipos e interfaces TypeScript
    └── utils/            # Scripts de soporte y utilitarios de datos (seeds)
```

### Flujo de Ejecución Arquitectónico

```text
Petición Cliente (HTTP / WebSocket)
   │
   ▼
[src/routes] ───────────► Define la URL, verbo HTTP y asocia middlewares.
   │
   ▼
[src/middlewares] ──────► Valida el token JWT (`verificarToken`) y permisos de rol (`permitirRoles`).
   │
   ▼
[src/controllers] ──────► Extrae parámetros de `req`, coordina la respuesta y captura excepciones.
   │
   ▼
[src/services] ─────────► Ejecuta reglas de negocio (cálculo de totales, stock, validaciones).
   │
   ▼
[src/repositories] ─────► Abstrae las consultas a la base de datos (`find`, `create`, `updateOne`).
   │
   ▼
[src/models] ───────────► Esquema Mongoose con validación de tipos, enums e integridad de datos.
   │
   ▼
[MongoDB Atlas] ────────► Base de datos en la nube donde residen las colecciones BSON.
```

---

## 15.8 Credenciales y Recomendaciones de Seguridad

1. **Protección Criptográfica del `.env`:** Nunca agregue el archivo `.env` al control de versiones de Git. El archivo `.gitignore` incluye `.env` para prevenir filtraciones accidentales a repositorios públicos o privados.
2. **Generación Segura de `JWT_SECRET`:** En entornos de producción, la clave de firma de tokens debe ser una cadena aleatoria de alta entropía (al menos 32 caracteres generados criptográficamente, ej. con `openssl rand -base64 32`).
3. **Mínimo Privilegio en Base de Datos:** No utilice credenciales de superusuario (`atlasAdmin`) para conectar el backend. Cree un usuario restringido a la base de datos operativa (`sabor_gestion_db`).
4. **Protección contra Inyección y Mass Assignment:** El backend utiliza validaciones estrictas y DTOs en la capa de servicios para evitar que clientes maliciosos alteren campos financieros críticos (como el estado de un pago o subtotales) a través de peticiones HTTP PUT o PATCH.
5. **Aislamiento de Entornos:** Mantenga bases de datos independientes para desarrollo y producción para evitar pérdida accidental de datos por scripts de inicialización (`pnpm run seed`).

---

## 15.9 Lista de Verificación Post-Instalación

Utilice la siguiente lista de control para validar de manera exhaustiva que el backend se encuentra correctamente desplegado y operativo:

- [ ] **Node.js:** Versión instalada confirmada igual o superior a `20.0.0` (`node -v`).
- [ ] **pnpm:** Versión de pnpm disponible y compatible (`pnpm -v`).
- [ ] **Dependencias:** Comando `pnpm install` ejecutado exitosamente sin advertencias de resolución.
- [ ] **Variables de Entorno:** Archivo `.env` creado con la clave `MONGO_URI` y `JWT_SECRET` correctamente asignadas.
- [ ] **MongoDB Atlas:** Conectividad de red habilitada en Atlas (IP autorizada en Network Access).
- [ ] **Datos Iniciales:** Script `pnpm run seed` ejecutado exitosamente generando usuarios de prueba.
- [ ] **Arranque del Servidor:** Comando `pnpm run dev` (o `pnpm start`) ejecutado, mostrando en consola el mensaje `🟢 Base de Datos MongoDB Conectada`.
- [ ] **Healthcheck:** Endpoint `GET /api/health` retorna código HTTP 200 con mensaje de éxito.
- [ ] **Autenticación:** Petición `POST /api/usuarios/login` con credenciales de prueba (`admin@sabor.com` / `admin123`) retorna un token JWT válido y datos del usuario.
- [ ] **Endpoint Protegido:** Petición `GET /api/categorias` con cabecera `Authorization: Bearer <token>` devuelve el listado de categorías con código HTTP 200.
- [ ] **WebSockets:** Conexión a `ws://localhost:3000` con Socket.IO emitiendo el evento de autenticación en consola.

---

## 15.10 Notas para el Desarrollador

Para cualquier ingeniero o estudiante que asuma el mantenimiento del proyecto:

* **Documentación OpenAPI:** La especificación completa de todos los endpoints, parámetros, respuestas y esquemas JSON se encuentra en [docs/openapi.yaml](docs/openapi.yaml). Puede visualizarse copiando su contenido en [Swagger Editor](https://editor.swagger.io/).
* **Adición de Nuevos Endpoints:** Para agregar una nueva funcionalidad, siga el orden de capas establecido:
  1. Diseñe el modelo en `src/models/`.
  2. Implemente las operaciones de persistencia en `src/repositories/`.
  3. Codifique la lógica y validaciones de negocio en `src/services/`.
  4. Defina el controlador en `src/controllers/`.
  5. Vincule las rutas y middlewares en `src/routes/`.
  6. Registre el enrutador en `src/app.ts`.
* **Regla de Actualización de Datos:** Nunca utilice `findByIdAndUpdate` omitiendo `{ runValidators: true }` si el modelo posee enums estrictos.
* **Control de Calidad de Código:** Antes de realizar un commit, ejecute `pnpm run lint` para verificar cumplimiento de estilo de código y `pnpm run build` para comprobar que no existan errores de compilación TypeScript.
