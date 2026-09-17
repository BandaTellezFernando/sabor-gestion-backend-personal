# Sabor & Gestión - Backend (API RESTful)

## 1. Propósito del sistema

Este repositorio contiene el núcleo lógico y motor de procesamiento (Backend) para el Sistema Integral de Gestión Gastronómica "Sabor & Gestión". Expone una API RESTful segura y modular para la gestión de personal, catálogo, control de mesas, módulo de atención (Core) y facturación.

## 2. Tecnologías utilizadas

- **Entorno:** Node.js
- **Lenguaje:** TypeScript
- **Framework:** Express.js
- **Base de Datos:** MongoDB (NoSQL)
- **ODM:** Mongoose
- **Tiempo Real:** WebSockets (Socket.io)
- **Autenticación:** JWT (JSON Web Tokens) Stateless
- **Seguridad:** Middlewares personalizados y encriptación con bcryptjs

## 3. Instrucciones para instalar y ejecutar el proyecto

1. Clonar el repositorio: `git clone https://github.com/tu-usuario/sabor-gestion-backend.git`
2. Instalar dependencias: `npm install`
3. Configurar variables de entorno:
   - Solicitar acceso al proyecto en **Doppler** al líder técnico.
   - Alternativamente, crear un archivo `.env` en la raíz basado en el `.env.example` (Configurar `PORT`, `DB_URI` y `JWT_SECRET`).
4. Ejecutar entorno de desarrollo:
   - Usando Doppler: `doppler run -- npm run dev`
   - Usando `.env` local: `npm run dev`

## 4. Arquitectura y Estructura del Repositorio

El proyecto utiliza una **Arquitectura en Capas** basada en el patrón de Separación de Responsabilidades, lo que garantiza modularidad y escalabilidad.

```text
 src/
├──  configs/      # Conexión a la base de datos y servicios de terceros
├──  controllers/  # Lógica de Negocio (Procesamiento de datos y respuestas)
├──  middlewares/  # Filtros de seguridad (Verificación de Tokens, Roles de usuario)
├──  models/       # Modelos ODM (Estructura de colecciones en MongoDB)
├──  routes/       # Enrutadores (Definición de endpoints HTTP)
├──  sockets/      # Eventos bidireccionales en tiempo real (Próximamente)
├──  app.ts        # Configuración de la instancia de Express y middlewares globales
└──  server.ts     # Entry Point: Inicialización del servidor y conexión a BD
```
