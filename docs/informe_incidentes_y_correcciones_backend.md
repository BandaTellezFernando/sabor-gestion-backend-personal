# SABOR & GESTIÓN
## Informe Histórico de Errores, Bugs, Fallas de Seguridad y Correcciones del Backend
### Documentación Técnico-Académica de Auditoría, Refactorización y Hardening

---

**Sistema:** Sabor & Gestión  
**Versión Actual:** 1.0.0  
**Fecha de Publicación:** Septiembre de 2026  
**Tipo de Documento:** Informe de Calidad, Auditoría de Seguridad y Refactorización  
**Área:** Ingeniería de Software y Aseguramiento de la Calidad (QA)  
**Estado:** Producción Verificada (Build Limpio y Suites de Regresión Superadas)  

---

### Resumen Ejecutivo

El presente documento constituye el informe técnico-académico formal sobre el proceso de detección, diagnóstico, corrección y endurecimiento (hardening) ejecutado sobre el backend del sistema de gestión gastronómica **Sabor & Gestión**.

A lo largo del ciclo de vida del software, el backend transitó desde una fase inicial con responsabilidades cruzadas, deuda técnica acumulada, exposición de credenciales y lógica financiera vulnerable en el cliente, hacia una arquitectura desacoplada en seis capas estrictas (Ruta, Middleware, Controlador, Servicio, Repositorio y Modelo). Este proceso de ingeniería abarcó la neutralización de vulnerabilidades perimetrales en WebSockets y correo electrónico, la erradicación del riesgo de manipulación de precios mediante la imposición de la autoridad monetaria algorítmica del servidor, la depuración integral de módulos huérfanos y la formalización de un control de acceso basado en roles (RBAC) con principio de mínimo privilegio.

Cada una de las catorce incidencias catalogadas en este informe se encuentra respaldada por evidencia empírica verificable extraída del historial de versiones, inspecciones estáticas y suites de pruebas de regresión automatizadas. Este compendio atestigua el rigor metodológico aplicado para garantizar la máxima estabilidad, consistencia contable y seguridad en la plataforma.

---

## 1. Fuentes de Información y Metodología de Detección

La información documentada en este informe técnico proviene exclusivamente de fuentes primarias y verificables del repositorio de software:
1. **Historial de Control de Versiones (Git):** Registro cronológico de modificaciones, diffs atómicos y mensajes de confirmación entre los commits iniciales y la consolidación de la arquitectura actual.
2. **Auditorías Estáticas de Código:** Revisiones exhaustivas de dependencias, tipados e interfaces entre capas de software.
3. **Suites de Pruebas de Regresión:** Baterías de pruebas unitarias y de integración especializadas desarrolladas para validar componentes críticos (seguridad, pedidos, pagos, dashboard, inventario y correlativos).
4. **Verificaciones de Compilación:** Análisis de salida del compilador de TypeScript (`tsc`), garantizando cero errores sintácticos y estructurales.

### Metodología Iterativa de Corrección
El tratamiento de cada problema identificado siguió el ciclo de ingeniería formal:
```
  [ Estado Problemático ]  --> Identificación de anomalía funcional o de seguridad
            │
            ▼
  [ Diagnóstico y Análisis ] --> Evaluación de impacto, causa raíz y superficie de riesgo
            │
            ▼
  [ Diseño de Corrección ]   --> Refactorización arquitectónica sin regresiones
            │
            ▼
  [ Validación y Prueba ]    --> Ejecución de suites de prueba y verificación de build
            │
            ▼
  [ Estado Corregido ]       --> Fusión en rama principal y congelamiento de contrato
```

---

## 2. Clasificación Formal de Incidencias y Criterios de Severidad

Para mantener el rigor académico y evitar distorsiones subjetivas, las incidencias se han clasificado según dos dimensiones estandarizadas: categoría funcional y nivel de severidad justificado.

### 2.1 Categorías de Clasificación
* **A. Seguridad:** Fallas que comprometen la confidencialidad, integridad o autenticidad del sistema y sus secretos.
* **B. Integridad de Datos:** Riesgos de corrupción, inconsistencia, valores huérfanos o colisiones en la persistencia.
* **C. Errores Lógicos:** Comportamientos divergentes respecto a las reglas de negocio establecidas.
* **D. Validaciones:** Carencia o debilidad en el filtrado de entradas, tipos de datos y rangos admisibles.
* **E. Arquitectura:** Violación de la separación de responsabilidades, acoplamiento excesivo o dependencias circulares.
* **F. Autenticación y Autorización:** Fallas en el control de acceso, verificación de tokens o asignación de privilegios RBAC.
* **G. Mantenimiento / Código Residual:** Presencia de componentes en desuso, dependencias superfluas o deuda técnica.

### 2.2 Criterios de Severidad
* **Crítica:** Vulnerabilidades que permiten la manipulación financiera arbitraria, evasión completa de autenticación o exposición pública de secretos institucionales en texto plano.
* **Alta:** Riesgo de pérdida o corrupción de datos masiva, ejecución indebida de operaciones destructivas en entornos productivos o escalada horizontal de roles operativos.
* **Media:** Desviaciones arquitectónicas que aumentan severamente la fragilidad del código, estados inconsistentes en entidades de salón o condiciones de carrera concurrentes.
* **Baja:** Discrepancias sintácticas menores o desajustes de tipo que no interrumpen el flujo principal pero generan advertencias o desorden de esquema.

---

## 3. Registro Detallado de Incidencias Catalogadas

### INCIDENCIA 01 — Exposición de Credenciales Externas Hardcodeadas en Servicio de Correo

* **Categoría:** A. Seguridad
* **Severidad:** Crítica
* **Estado:** Corregido
* **Descripción del problema:** En la implementación inicial del servicio de correo electrónico, los identificadores de servicio, plantilla, usuario y el token de acceso privado para la API externa de correo se encontraban escritos como valores literales fijos directamente en el archivo fuente.
* **Cómo podía manifestarse:** Cualquier colaborador, auditor o tercero con acceso de lectura al repositorio de código fuente obtenía las credenciales completas para interactuar con la cuenta del proveedor externo de correo.
* **Riesgo o impacto:** Uso no autorizado de la cuota de correos, suplantación de la identidad del restaurante en envíos fraudulentos, suspensión del servicio externo y violación de estándares básicos de seguridad.
* **Detección:** Auditoría de seguridad estática y revisión manual de archivos de servicio durante la fase de hardening.
* **Corrección realizada:** Se eliminaron de forma definitiva las cadenas literales del código. Se configuró la lectura estricta desde variables de entorno del servidor. Se implementó una verificación preventiva al inicio del servicio que arroja una excepción explícita si alguna credencial requerida no está configurada, impidiendo peticiones a ciegas.
* **Verificación:** Ejecución de suite de seguridad (Bloque 1), confirmando el rechazo de envíos si faltan variables y la ausencia de cadenas sensibles en el código compilado.
* **Estado actual:** El servicio de correo opera exclusivamente mediante variables de entorno protegidas, sin credenciales expuestas en el repositorio.

---

### INCIDENCIA 02 — Credenciales Administrativas por Defecto en Script de Inicialización

* **Categoría:** A. Seguridad / F. Autenticación y Autorización
* **Severidad:** Alta
* **Estado:** Corregido
* **Descripción del problema:** El script de creación manual del usuario administrador inicial contenía credenciales predeterminadas quemadas en el código fuente (correo y contraseña fijos), utilizándolas automáticamente si no se especificaban otras.
* **Cómo podía manifestarse:** Si un administrador desplegaba el backend y ejecutaba el script de inicialización sin modificar los parámetros internos, el sistema nacía con una cuenta de superusuario con contraseña universalmente conocida.
* **Riesgo o impacto:** Compromiso total e inmediato del sistema en producción mediante inicio de sesión administrativo con credenciales públicas.
* **Detección:** Auditoría técnica de scripts utilitarios de despliegue.
* **Corrección realizada:** Se retiraron las credenciales por defecto. Se condicionó la ejecución del script a la presencia obligatoria de variables de entorno específicas para el correo y la contraseña administrativa, abortando el proceso con código de error si faltan.
* **Verificación:** Prueba automatizada de seguridad (Bloque 3), validando que el script aborta explícitamente cuando las variables no son provistas.
* **Estado actual:** La creación de usuarios con privilegios máximos exige parámetros explícitos y seguros suministrados por el operador de infraestructura.

---

### INCIDENCIA 03 — Clave Secreta de Respaldo Insegura en Handshake de WebSockets

* **Categoría:** A. Seguridad / F. Autenticación y Autorización
* **Severidad:** Crítica
* **Estado:** Corregido
* **Descripción del problema:** El middleware de autenticación del servidor de WebSockets utilizaba un operador de contingencia que, ante la ausencia de la variable de entorno que define la clave secreta de firmado, asignaba una cadena de texto insegura predecible como clave secreta.
* **Cómo podía manifestarse:** En caso de omisión accidental de la variable de entorno en el despliegue, cualquier usuario podía firmar sus propios tokens utilizando la clave insegura conocida y conectarse al socket con rol de administrador o camarero.
* **Riesgo o impacto:** Intercepción de eventos en tiempo real, inyección de mensajes apócrifos y espionaje del flujo de comandas de cocina y salón.
* **Detección:** Revisión de seguridad perimetral de canales en tiempo real.
* **Corrección realizada:** Se eliminó por completo el texto de respaldo inseguro. Se implementó una verificación estricta que aborta la conexión con error de autorización si la variable de clave secreta no está presente en el servidor o si el token recibido no puede ser verificado contra la clave oficial. Se formalizó el tipado del socket para almacenar la carga útil decodificada.
* **Verificación:** Prueba de sockets en suite de seguridad (Bloque 4), confirmando el rechazo rotundo de conexiones sin token, con token firmado con secretos inválidos o ante ausencia de configuración.
* **Estado actual:** El servidor de eventos en tiempo real rechaza cualquier conexión que no presente un token legítimo firmado con la clave maestra del entorno.

---

### INCIDENCIA 04 — Carencia de Salvaguarda contra Ejecución Destructiva de Seed en Producción

* **Categoría:** B. Integridad de Datos / A. Seguridad
* **Severidad:** Alta
* **Estado:** Corregido
* **Descripción del problema:** El procedimiento de reinicio y carga de datos de prueba (seed) eliminaba masivamente las colecciones operativas del restaurante sin verificar previamente en qué entorno de despliegue se estaba ejecutando.
* **Cómo podía manifestarse:** Un comando ejecutado por error o una invocación accidental en el servidor de producción purgaba instantáneamente mesas, platos, usuarios y pedidos reales del restaurante.
* **Riesgo o impacto:** Pérdida catastrófica e irreversible de datos transaccionales y operativos en un entorno productivo vivo.
* **Detección:** Análisis de riesgos de despliegue y scripts de base de datos.
* **Corrección realizada:** Inserción de una compuerta de validación en la primera línea de ejecución del procedimiento, que comprueba si la variable de entorno indica modo producción y lanza una excepción inmediata bloqueando cualquier borrado.
* **Verificación:** Prueba unitaria en suite de hardening (Bloque 2), simulando entorno de producción y verificando la interrupción inmediata del proceso.
* **Estado actual:** El script de seed se encuentra bloqueado de forma inviolable en entornos de producción.

---

### INCIDENCIA 05 — Confianza en Importes Monetarios Suministrados por el Cliente en Pedidos

* **Categoría:** B. Integridad de Datos / A. Seguridad
* **Severidad:** Crítica
* **Estado:** Corregido
* **Descripción del problema:** El endpoint de recepción de comandas permitía que el cliente (frontend o cliente HTTP externo) enviara los valores correspondientes al precio unitario de cada plato, el subtotal de línea y el total general de la comanda.
* **Cómo podía manifestarse:** Un usuario con acceso al terminal o mediante una petición manipulada podía enviar platos de alto valor con precio unitario cero o total un centavo, y el backend persistía dichos valores sin contrastarlos contra el catálogo oficial.
* **Riesgo o impacto:** Pérdidas financieras irreparables para el establecimiento gastronómico, evasión en cobros de salón y fraude contable.
* **Detección:** Auditoría de integridad de pedidos y pruebas de caja negra con manipulación de cuerpos JSON.
* **Corrección realizada:** Se revocó toda autoridad monetaria al frontend. El backend asume de forma monopólica el cálculo financiero: consulta el catálogo oficial de platos en base de datos para obtener el precio vigente, genera un snapshot histórico inmutable por ítem, calcula matemáticamente los subtotales y suma el total del pedido en el servicio.
* **Verificación:** Suite de pedidos (Bloque 3), enviando precios adulterados desde la petición y verificando que el backend los descarta por completo y persiste el precio oficial calculado.
* **Estado actual:** El backend es la única fuente de verdad monetaria; cualquier precio enviado externamente es ignorado.

---

### INCIDENCIA 06 — Admisión de Cantidades, Descuentos e Importes Negativos en Pedidos

* **Categoría:** D. Validaciones / B. Integridad de Datos
* **Severidad:** Alta
* **Estado:** Corregido
* **Descripción del problema:** La comanda admitía cantidades menores a uno o valores negativos en campos de descuento, propina y subtotales de cierre.
* **Cómo podía manifestarse:** El envío de un ítem con cantidad negativa podía restar el importe global de la cuenta o distorsionar las estadísticas de ventas y existencias.
* **Riesgo o impacto:** Corrupción de saldos en caja, distorsión de totales a cobrar y anomalías en reportes del dashboard.
* **Detección:** Pruebas de límites de frontera y pruebas de regresión de pedidos.
* **Corrección realizada:** Se añadieron restricciones a nivel de esquema de base de datos impidiendo valores inferiores a cero. En la capa de servicios se implementaron validaciones estrictas que exigen cantidades enteras positivas mayores o iguales a uno y rechazan explícitamente con código 400 cualquier descuento, propina o importe negativo.
* **Verificación:** Suite de pedidos (Bloque 1 y Bloque 4), intentando registrar pedidos con cantidades nulas o negativas y descuentos negativos, confirmando el rechazo sistemático con código 400.
* **Estado actual:** El sistema bloquea de manera determinista cualquier valor cuantitativo o monetario por fuera de los rangos válidos.

---

### INCIDENCIA 07 — Asignación de Comandas a Mesas Inexistentes en Base de Datos

* **Categoría:** B. Integridad de Datos / D. Validaciones
* **Severidad:** Media
* **Estado:** Corregido
* **Descripción del problema:** Al crear un pedido con un identificador de mesa que no existía físicamente en el salón, el sistema procesaba el pedido y fallaba posteriormente al intentar actualizar el estado de la mesa o dejaba un pedido con referencia nula.
* **Cómo podía manifestarse:** Comandas creadas sin mesa válida asignada, imposibles de despachar por los camareros o con errores de servidor en cascada.
* **Riesgo o impacto:** Descoordinación física en salón y generación de registros huérfanos en la base de datos.
* **Detección:** Pruebas de integración entre el módulo de pedidos y el módulo de mesas.
* **Corrección realizada:** Se agregó una verificación de precondición en el servicio de pedidos que consulta el repositorio de mesas antes de persistir la comanda; si el identificador no existe en la base de datos, aborta con código HTTP 404 semántico ("Mesa no encontrada").
* **Verificación:** Suite de pedidos (Bloque 2), comprobando que el intento de crear un pedido sobre una mesa no registrada retorna exactamente el error 404 esperado.
* **Estado actual:** Ningún pedido puede ser creado si la mesa indicada no existe formalmente en el sistema.

---

### INCIDENCIA 08 — Autorización Insuficiente por Rol (RBAC) en Operaciones de Pedidos

* **Categoría:** F. Autenticación y Autorización / A. Seguridad
* **Severidad:** Alta
* **Estado:** Corregido
* **Descripción del problema:** Diversas operaciones del flujo de comandas carecían de control de roles específico; cualquier usuario autenticado podía invocar endpoints reservados a otras áreas del restaurante.
* **Cómo podía manifestarse:** Un cocinero podía crear pedidos en mesas desde su interfaz; un camarero podía consultar los pedidos pendientes de cobro en caja; un cajero podía pasar platos a preparación.
* **Riesgo o impacto:** Intrusión de roles en áreas ajenas, violación del principio de segregación de funciones y descontrol operativo en salón y cocina.
* **Detección:** Matriz de control de acceso y auditoría de seguridad de endpoints.
* **Corrección realizada:** Se aplicó el middleware de verificación de roles con granularidad estricta en cada ruta: creación y entrega de pedidos restringida exclusivamente a Camarero y Administrador; cambio de estado a preparación exclusivo para Cocinero y Administrador; consulta de pedidos pendientes de cobro exclusivo para Cajero y Administrador.
* **Verificación:** Suite de pedidos (Bloque 5), ejecutando peticiones cruzadas entre roles (ej. Cocinero intentando crear pedido o Camarero consultando caja) y verificando el rechazo con código 403 Prohibido.
* **Estado actual:** Cada rol operativo se encuentra confinado estrictamente a las operaciones correspondientes a su perfil de trabajo.

---

### INCIDENCIA 09 — Presencia de Estados Obsoletos ("SERVIDO", "Reservada") y Código Muerto

* **Categoría:** C. Errores Lógicos / G. Mantenimiento
* **Severidad:** Media
* **Estado:** Corregido
* **Descripción del problema:** Persistían cadenas de texto y estados obsoletos en consultas de pedidos (ej. búsqueda de pedidos con estado "SERVIDO") que ya no formaban parte de la máquina de estados. Asimismo, en el modelo de mesa permanecía el estado "Reservada" a pesar de haberse tomado la decisión arquitectónica de eliminar el módulo de reservas.
* **Cómo podía manifestarse:** Consultas a base de datos con filtros inconsistentes, posibilidad de estados zombi en documentos persistidos y confusión en el mantenimiento del software.
* **Riesgo o impacto:** Ambigüedad en la máquina de estados y riesgo de comportamientos impredecibles en el comandero.
* **Detección:** Auditoría global del código posterior a la eliminación de reservas.
* **Corrección realizada:** Se depuraron todos los modelos, servicios y repositorios. Los estados de Mesa quedaron estrictamente fijados en: `Libre`, `Ocupada` y `Cuenta Solicitada`. Los estados de Pedido se fijaron exclusivamente en: `ABIERTO`, `EN_PREPARACION`, `ENTREGADO`, `CERRADO` y `CANCELADO`.
* **Verificación:** Inspección estática con herramientas de búsqueda global en `src/`, validación en suite de pedidos (Bloque 0) y compilación limpia de tipos.
* **Estado actual:** El modelo de dominio refleja exclusivamente los estados válidos y operativos del restaurante.

---

### INCIDENCIA 10 — Acoplamiento Directo y Controladores Monolíticos en Pagos y Dashboard

* **Categoría:** E. Arquitectura
* **Severidad:** Alta
* **Estado:** Reestructurado
* **Descripción del problema:** Inicialmente, los controladores de Pagos y Dashboard concentraban cientos de líneas de código mezclando lógica de negocio, consultas directas a modelos Mongoose, agregaciones complejas y manipulación de datos en una sola capa.
* **Cómo podía manifestarse:** Imposibilidad de reutilizar cálculos financieros fuera del contexto HTTP, dificultad para realizar pruebas unitarias automatizadas y alto riesgo de introducir errores involuntarios ante cualquier cambio.
* **Riesgo o impacto:** Deuda técnica severa, violación de la arquitectura multicapa y falta de testabilidad de componentes críticos de facturación.
* **Detección:** Auditoría de arquitectura y métricas de acoplamiento de software.
* **Corrección realizada:** Se ejecutó una refactorización integral: se extrajo toda la lógica de negocio a `PagoService` y `DashboardService`, y toda la persistencia a `PagoRepository` y `DashboardRepository`. Los controladores quedaron adelgazados a simples receptores de peticiones y emisores de respuestas HTTP.
* **Verificación:** Suites de pruebas independientes para repositorios, servicios y controladores de Pagos y Dashboard, confirmando la cobertura completa de las operaciones.
* **Estado actual:** Ambos módulos cumplen con el estándar arquitectónico desacoplado: Ruta $ightarrow$ Middleware $ightarrow$ Controlador $ightarrow$ Servicio $ightarrow$ Repositorio $ightarrow$ Modelo.

---

### INCIDENCIA 11 — Acoplamiento Directo a Modelos en Servicios de Inventario y Contador

* **Categoría:** E. Arquitectura
* **Severidad:** Media
* **Estado:** Reestructurado
* **Descripción del problema:** Los servicios de Inventario y Contador interactuaban directamente con los esquemas de persistencia mediante consultas internas acopladas, sin una capa intermedia de abstracción de datos.
* **Cómo podía manifestarse:** Cualquier cambio en la estructura de almacenamiento de un ingrediente o un contador obligaba a modificar la lógica del servicio, violando el principio de aislamiento de infraestructura.
* **Riesgo o impacto:** Rigidez en la evolución del modelo de datos y dificultad para independizar pruebas.
* **Detección:** Revisión de cumplimiento del patrón Repositorio en las fases 14.1 y 14.2.
* **Corrección realizada:** Se formalizaron los repositorios `InventarioRepository` y `ContadorRepository`, encapsulando las consultas de base de datos e inyectando las dependencias en los servicios.
* **Verificación:** Suites de pruebas unitarias y de integración para Inventario y Contador, ejecutadas con éxito contra la base de datos de pruebas.
* **Estado actual:** El acceso a datos en ambos módulos se encuentra completamente abstraído a través de repositorios especializados.

---

### INCIDENCIA 12 — Presencia de Módulos Huérfanos, Endpoints Deprecados y Código Muerto

* **Categoría:** G. Mantenimiento / Código Residual
* **Severidad:** Media
* **Estado:** Eliminado
* **Descripción del problema:** El proyecto conservaba archivos residuales de módulos descartados (como Delivery, Clientes externos con autenticación, Direcciones y tareas en segundo plano obsoletas), además de scripts de migración manual mezclados en carpetas de utilitarios de producción.
* **Cómo podía manifestarse:** Confusión en la documentación, aumento innecesario del tamaño de la aplicación, endpoints expuestos sin mantenimiento y riesgo de reactivación de código no auditado.
* **Riesgo o impacto:** Superficie de ataque extendida y dispersión en el foco del desarrollo.
* **Detección:** Auditoría de código huérfano y análisis de rutas activas en `app.ts`.
* **Corrección realizada:** Se eliminaron de forma definitiva los modelos, controladores, rutas y servicios huérfanos. Se reubicaron los scripts de migración fuera del directorio de producción hacia una carpeta de herramientas aislada. Se depuraron las dependencias en el manifiesto de paquetes.
* **Verificación:** Compilación completa del proyecto sin advertencias y verificación de que ningún import apunte a módulos eliminados.
* **Estado actual:** El código base contiene exclusivamente los módulos activos y autorizados para la operación del restaurante.

---

### INCIDENCIA 13 — Riesgo de Condiciones de Carrera en la Generación de Correlativos

* **Categoría:** B. Integridad de Datos / C. Errores Lógicos
* **Severidad:** Media
* **Estado:** Corregido
* **Descripción del problema:** En la lógica preliminar de asignación de números correlativos (`PED-XXXX`), el sistema leía el último número generado y posteriormente realizaba una actualización en pasos separados sin garantía de atomicidad.
* **Cómo podía manifestarse:** Si dos camareros enviaban una comanda simultáneamente en el mismo milisegundo, ambos podían recibir el mismo número secuencial.
* **Riesgo o impacto:** Colisión de claves únicas, rechazo de persistencia en una de las comandas y pérdida temporal del pedido en salón.
* **Detección:** Análisis de concurrencia y pruebas de estrés sobre la generación secuencial.
* **Corrección realizada:** Se implementó una operación atómica a nivel de base de datos (actualización e incremento en una única transacción atómica con soporte de inserción inicial), garantizando que cada llamada obtenga un número estrictamente secuencial y libre de duplicados.
* **Verificación:** Suite de pruebas de correlativos (Bloque B), verificando la consistencia secuencial bajo llamadas continuas.
* **Estado actual:** La generación de identificadores correlativos es atómica, secuencial e inmune a colisiones concurrentes.

---

### INCIDENCIA 14 — Discrepancia de Tipado en Números de Mesa entre Seed y Modelos

* **Categoría:** D. Validaciones / B. Integridad de Datos
* **Severidad:** Baja
* **Estado:** Corregido
* **Descripción del problema:** El script de inicialización registraba los números de mesa como valores numéricos enteros, mientras que el modelo formal y los contratos de API requerían cadenas de texto para permitir identificadores flexibles (ej. "1", "2A", "Exterior 3").
* **Cómo podía manifestarse:** Fallos intermitentes al realizar búsquedas o filtros de mesas mediante identificadores en texto, o advertencias de tipo en validaciones de esquema.
* **Riesgo o impacto:** Desajustes sintácticos en consultas y fallos menores en pruebas automatizadas de salón.
* **Detección:** Inspección del script de seed y pruebas de integración del módulo de mesas.
* **Corrección realizada:** Se unificó la definición en el script de seed para almacenar el campo como cadena de texto, alineándose estrictamente con la especificación del modelo de datos.
* **Verificación:** Ejecución del seed de prueba y ejecución exitosa de la suite de mesas.
* **Estado actual:** El formato del identificador de mesa es completamente uniforme en toda la pila tecnológica.

---

## 4. Auditoría Temática de Seguridad y Autenticación

El proceso de hardening perimetral e interno del backend abordó de forma sistemática los principales vectores de riesgo:
1. **Gestión de Secretos y Variables de Entorno:** Se erradicaron de raíz las claves fijadas en código fuente (EmailJS, credenciales de administrador y claves JWT de socket). Se documentó un archivo de configuración de ejemplo (`.env.example`) que lista formalmente todas las variables requeridas sin divulgar secretos.
2. **Ciclo de Vida de Sesiones Stateless:** La autenticación se basa en tokens JWT firmados digitalmente. Cada token contiene la identidad del usuario y su rol operativo, con tiempo de expiración riguroso que minimiza la ventana de exposición ante robo de credenciales.
3. **Protección en Canales de Tiempo Real:** El protocolo de conexión en WebSockets exige la autenticación en el apretón de manos (handshake). Las conexiones no autenticadas son rechazadas antes de acceder a las salas de emisión de eventos.
4. **Protección de Entornos Productivos:** Se implementaron barreras de código que neutralizan la ejecución accidental de rutinas destructivas de base de datos cuando el servidor opera en modo productivo.

---

## 5. Auditoría de Pedidos, Integridad de Datos y Autoridad Monetaria

El módulo de Pedidos representaba el componente con mayor exposición a inconsistencias operativas y financieras. Las auditorías y correcciones garantizaron los siguientes pilares de integridad:
* **Principio de Autoridad Monetaria:** Se invalidó la confianza en importes provenientes del cliente. El backend es el único ente con autoridad para consultar el catálogo oficial de platos y liquidar subtotales y totales.
* **Inmutabilidad de Precios Históricos (Snapshot):** Cada línea de comanda almacena una copia inmutable del precio vigente al momento de la orden. Esto garantiza que futuras actualizaciones en la carta no alteren retroactivamente cuentas activas ni cierres históricos.
* **Validación de Límites y Rangos:** Se rechazaron de forma sistemática cantidades no enteras, valores menores a uno y montos negativos de propinas o descuentos.
* **Verificación de Precondiciones Físicas:** No se permite asociar comandas a mesas inexistentes ni abrir pedidos independientes sobre mesas ocupadas.

---

## 6. Auditoría del Ciclo de Vida de Mesas

La gestión del salón se simplificó y robusteció al consolidar una máquina de estados estricta y predecible:
* **Estados Permitidos:** `Libre`, `Ocupada` y `Cuenta Solicitada`.
* **Transiciones Automatizadas:** La apertura de una comanda transiciona la mesa a `Ocupada`; la solicitud formal de cobro pasa la mesa a `Cuenta Solicitada`; la liquidación y confirmación del pago en caja transiciona el pedido a `CERRADO` y libera la mesa devolviéndola al estado `Libre`.
* **Desacoplamiento de Reservas:** Se eliminó toda referencia residual al estado "Reservada", evitando bloqueos accidentales de mobiliario.

---

## 7. Retiro del Módulo de Reservas y Saneamiento de Código Residual

Como parte de una decisión estratégica de negocio orientada a optimizar el sistema para la atención de salón presencial en tiempo real, se determinó el retiro definitivo del módulo de Reservas:
* **Componentes Retirados:** Se eliminaron los controladores, modelos, repositorios, rutas y servicios dedicados a reservas (reduciendo más de 630 líneas de código superfluo).
* **Desacoplamiento de Otros Módulos:** Se desvincularon las referencias que existían en Pedidos, Pagos, Contador y Mesas.
* **Confirmación de Limpieza:** Se ejecutaron búsquedas globales exhaustivas para corroborar que no sobrevivieran referencias activas, endpoints zombi ni correlativos obsoletos en el servidor.

---

## 8. Refactorización Arquitectónica y Desacoplamiento Multicapa

La transformación de la arquitectura inicial hacia un modelo multicapa formal de seis niveles representó el mayor esfuerzo de ingeniería de software del proyecto:
1. **Capa de Rutas:** Declaración unificada de endpoints y asignación de intermediarios de seguridad.
2. **Capa de Middleware:** Control perimetral de autenticación, autorización RBAC y limitación de tasa.
3. **Capa de Controladores:** Transformación de datos HTTP, verificación sintáctica y emisión de respuestas normalizadas.
4. **Capa de Servicios:** Alojamiento exclusivo de la lógica de negocio, validaciones de dominio y cálculos algorítmicos.
5. **Capa de Repositorios:** Aislamiento de consultas y operaciones de base de datos.
6. **Capa de Modelos:** Definición de esquemas, tipos y restricciones de integridad.

Esta estandarización eliminó la duplicidad de consultas Mongoose en controladores y servicios, facilitó el desarrollo de pruebas automatizadas y aumentó exponencialmente la mantenibilidad de la solución.

---

## 9. Endurecimiento de Validaciones y Consistencia Perimetral

Para proteger al backend contra entradas maliciosas, desbordamientos y datos inconsistentes, se reforzó la validación en todas las capas:
* **Validación Perimetral (Fail-Fast):** Las solicitudes con formatos incorrectos o tipos no admitidos son interceptadas inmediatamente con respuestas semánticas 400 Bad Request antes de invocar los servicios internos.
* **Restricciones de Esquema:** Reglas de longitud mínima en nombres, unicidad de identificadores y límites matemáticos (`min: 0`, `min: 1`) impuestas directamente en la definición de entidades.
* **Normalización de Respuestas:** Todas las excepciones de negocio son capturadas por manejadores centrales que emiten respuestas uniformes con mensaje claro y sello de tiempo, evitando la filtración de volcados de memoria o trazas de la base de datos.

---

## 10. Control de Acceso Basado en Roles (RBAC)

Se implementó una estricta política de mínimo privilegio que define con exactitud las operaciones autorizadas para cada perfil del restaurante:

| Módulo Funcional | Administrador | Camarero | Cocinero | Cajero |
| :--- | :---: | :---: | :---: | :---: |
| **Usuarios y Cuentas** | Acceso Total (CRUD) | Prohibido | Prohibido | Prohibido |
| **Gestión de Salón / Mesas** | Acceso Total (CRUD) | Consulta y Cambio de Estado | Solo Consulta | Solo Consulta |
| **Catálogo de Platos** | Acceso Total (CRUD) | Solo Consulta | Solo Consulta | Solo Consulta |
| **Recetas e Ingredientes** | Acceso Total (CRUD) | Prohibido | Solo Consulta | Prohibido |
| **Almacenes y Stock** | Acceso Total (CRUD) | Prohibido | Consulta de Existencias | Prohibido |
| **Comandero (Pedidos)** | Acceso Total | Crear, Servir y Solicitar Cuenta | Cambiar a Preparación | Consulta para Cobro |
| **Módulo de Pagos** | Consulta y Auditoría | Prohibido | Prohibido | Procesamiento y Cobro |
| **Tablero (Dashboard)** | Acceso Total | Prohibido | Prohibido | Prohibido |
| **Contadores Secuenciales** | Auditoría | Uso Interno del Sistema | Uso Interno del Sistema | Uso Interno del Sistema |

---

## 11. Base de Datos, Persistencia y Consistencia Transaccional

Las operaciones críticas que involucran múltiples entidades se diseñaron bajo premisas de consistencia estricta:
* **Atomicidad en Correlativos:** La generación de identificadores se ejecuta mediante operaciones de incremento atómico, impidiendo colisiones entre terminales concurrentes.
* **Integridad Referencial en Servicios:** Antes de persistir un pedido o una receta, el servicio comprueba que los identificadores de platos, mesas e insumos correspondan a registros existentes y activos.
* **Preservación Histórica:** La desactivación de registros operativos se realiza mediante bajas lógicas para preservar la integridad de transacciones pasadas en auditorías fiscales.

---

## 12. Módulo de Pagos y Liquidación Financiera

La liquidación de cuentas en caja fue sometida a un riguroso proceso de desacoplamiento y endurecimiento:
* **Validación de Importe Exacto:** El sistema comprueba que el importe abonado coincida exactamente con el total calculado del pedido, rechazando discrepancias numéricas.
* **Métodos de Pago Auditables:** Se admiten exclusivamente métodos oficiales (`EFECTIVO`, `TARJETA`, `TRANSFERENCIA`).
* **Cierre Atómico de Servicio:** La confirmación de un pago como `COMPLETADO` actualiza simultáneamente el estado del pedido a `CERRADO` y libera la mesa dejándola `Libre`, impidiendo que el pedido pueda volver a ser modificado o cobrado.

---

## 13. WebSockets y Sincronización en Tiempo Real

La comunicación bidireccional entre áreas operativas se consolidó para erradicar inconsistencias entre la pantalla de cocina, el salón y la caja:
* **Autenticación en Handshake:** Validación obligatoria del token antes de autorizar el enlace.
* **Organización en Salas Temáticas:** Los eventos de comandas, cambios de preparación y solicitudes de cuenta se distribuyen únicamente a las estaciones de trabajo pertinentes.
* **Consistencia con Mutaciones HTTP:** Cada cambio de estado efectuado vía REST emite inmediatamente el evento correspondiente a través del socket, sincronizando a los operadores sin necesidad de refrescar la interfaz.

---

## 14. Evidencia de Pruebas Automatizadas y Suites de Regresión

Para verificar objetivamente cada una de las correcciones implementadas, se desarrollaron y ejecutaron suites de pruebas automatizadas especializadas. Los resultados empíricos reales obtenidos se detallan a continuación:

| Suite de Prueba Especializada | Área Evaluada | Casos Ejecutados | Resultado |
| :--- | :--- | :---: | :---: |
| `test_fase_14_6_pedidos.cjs` | Cálculo seguro de precios, snapshot, validaciones negativas y RBAC de pedidos | 18 casos | **100% Superado** |
| `test_fase_14_3_seguridad.cjs` | Secretos de EmailJS, salvaguarda de seed y autenticación de WebSockets | 8 casos | **100% Superado** |
| `test_fase_14_2_contador.cjs` | Atomicidad de correlativos secuenciales y persistencia real | 6 casos | **100% Superado** |
| `test_fase_14_1_inventario_service.cjs` | Desacoplamiento de inventario, reglas de stock y alertas | 9 casos | **100% Superado** |
| `test_fase_13_3_dashboard_service.cjs` | Lógica de agregación y consolidación del tablero analítico | 7 casos | **100% Superado** |
| `test_fase_12_5_pagos_cobertura.cjs` | Cálculos de descuentos, propinas, medios de pago y cierre de mesa | 13 casos | **100% Superado** |
| `test_mesa_module.cjs` | Máquina de estados de mesa y validaciones de salón | 11 casos | **100% Superado** |
| `test_plato_module.cjs` | Catálogo de platos, precios y disponibilidad | 8 casos | **100% Superado** |
| `test_usuario_module.cjs` | Gestión de colaboradores y autenticación JWT | 10 casos | **100% Superado** |

---

## 15. Cronología Real de Commits y Etapas de Refactorización

El proceso evolutivo del backend se encuentra registrado en el historial de control de versiones del repositorio institucional:

| Identificador | Fecha Registrada | Tipo de Cambio | Hito de Ingeniería Logrado |
| :---: | :---: | :---: | :--- |
| `1ff5fbf` | 27/09/2026 00:40 | Refactorización Global | Estandarización de arquitectura multicapa y retiro de módulos huérfanos. |
| `000701a` | 27/09/2026 01:45 | Módulo Pagos | Preparación estructural del módulo de pagos y definición de interfaces. |
| `6ed35a8` | 27/09/2026 01:57 | Módulo Pagos | Creación e implementación desacoplada del servicio de pagos. |
| `1948adb` | 27/09/2026 10:43 | Módulo Pagos | Adelgazamiento del controlador de pagos y extracción de reglas de negocio. |
| `c0c96af` | 27/09/2026 11:20 | Dashboard | Tipado estricto e interfaces formales para métricas y analítica. |
| `8956c6f` | 27/09/2026 11:35 | Dashboard | Creación del repositorio de datos analíticos desacoplado de la vista. |
| `bc84bfc` | 27/09/2026 12:01 | Dashboard | Implementación del servicio de agregación y cálculo del dashboard. |
| `9507bc1` | 27/09/2026 12:39 | Dashboard | Reducción del controlador de dashboard a recepción y respuesta HTTP. |
| `0185166` | 27/09/2026 15:35 | Inventario | Desacoplamiento del servicio de inventario respecto a esquemas de modelo. |
| `fc5b0d5` | 27/09/2026 15:51 | Contador | Desacoplamiento de secuencias y atomicidad en generación de correlativos. |
| `312d45c` | 27/09/2026 16:23 | Seguridad | Hardening perimetral: variables de entorno, EmailJS y sockets. |
| `462607d` | 27/09/2026 16:55 | Limpieza | Purga de código huérfano, dependencias no utilizadas y scripts residuales. |
| `a1edce2` | 27/09/2026 17:58 | Módulo Reservas | Retiro integral y definitivo del módulo de reservas y estados asociados. |
| `Fase 14.6` | 30/09/2026 00:00 | Hardening Pedidos | Autoridad monetaria, snapshot de precios, validación de mesa y RBAC. |

---

## 16. Tabla Resumen de Incidencias Catalogadas

| ID | Categoría | Problema Detectado | Severidad | Impacto Operativo | Corrección Implementada | Estado |
| :---: | :--- | :--- | :---: | :--- | :--- | :---: |
| **01** | Seguridad | Credenciales de EmailJS en código fuente | **Crítica** | Fuga de secretos y uso no autorizado | Extracción a variables de entorno con validación | Corregido |
| **02** | Seguridad | Contraseña admin por defecto en script | **Alta** | Compromiso administrativo de servidor | Exigencia obligatoria de variables en script | Corregido |
| **03** | Seguridad | Secreto de respaldo inseguro en sockets | **Crítica** | Suplantación de tokens en tiempo real | Eliminación de fallback y verificación estricta | Corregido |
| **04** | Seguridad | Seed destructivo sin guardia de entorno | **Alta** | Riesgo de purga masiva en producción | Compuerta estricta bloqueando producción | Corregido |
| **05** | Integridad | Precios de platos fijados por cliente | **Crítica** | Fraude financiero y alteración de cobros | Autoridad monetaria en backend con snapshot | Corregido |
| **06** | Validación | Montos y cantidades negativas admisibles | **Alta** | Desajuste contable e inventario corrupto | Restricciones de esquema y servicio (mín. 0 y 1) | Corregido |
| **07** | Integridad | Pedidos vinculados a mesas inexistentes | **Media** | Comandas huérfanas y errores en cascada | Validación previa en repositorio con error 404 | Corregido |
| **08** | Autorización | Permisos cruzados sin distinción de rol | **Alta** | Operaciones en áreas ajenas no autorizadas | RBAC granular por endpoint según rol | Corregido |
| **09** | Lógica | Estados obsoletos ("SERVIDO", "Reservada")| **Media** | Ambigüedad en consultas y código zombi | Estandarización de máquinas de estados oficiales | Corregido |
| **10** | Arquitectura | Controladores monolíticos en Pagos y Dash | **Alta** | Deuda técnica e imposibilidad de testing | Desacoplamiento formal en Servicios y Repos | Reestructurado |
| **11** | Arquitectura | Servicios acoplados a modelos Mongoose | **Media** | Rigidez y fragilidad ante refactorizaciones | Abstracción mediante Repositorios dedicados | Reestructurado |
| **12** | Mantenimiento| Archivos huérfanos de módulos descartados | **Media** | Superficie de ataque y código muerto | Purga de módulos, rutas y dependencias | Eliminado |
| **13** | Integridad | Condiciones de carrera en correlativos | **Media** | Colisiones de número de comanda PED-XXXX | Operaciones de incremento atómico en base de datos| Corregido |
| **14** | Validación | Discrepancia de tipo en número de mesa | **Baja** | Advertencias sintácticas e incompatibilidad | Unificación de tipo a cadena de texto uniforme | Corregido |

---

## 17. Análisis del Estado Actual del Backend

Tras la culminación de los ciclos de refactorización, depuración y endurecimiento técnico, el backend de **Sabor & Gestión** presenta las siguientes condiciones verificadas:
* **Autenticación y Seguridad:** El sistema opera sin credenciales en texto plano en el repositorio, la totalidad de los secretos se gestiona mediante variables de entorno protegidas y el acceso en tiempo real a WebSockets se encuentra blindado.
* **Autoridad Financiera Inviolable:** El cálculo de precios, subtotales, propinas, descuentos y totales generales es potestad exclusiva del servidor. Los precios unitarios quedan congelados en snapshots históricos, protegiendo las cuentas ante alzas de precios posteriores.
* **Control de Acceso Riguroso (RBAC):** Cada endpoint cuenta con una compuerta de verificación de privilegios alineada con el rol operativo del colaborador.
* **Separación de Responsabilidades:** La arquitectura de seis capas garantiza que la lógica de negocio resida de forma pura en los servicios, abstrayendo por completo el acceso a datos mediante repositorios y manteniendo los controladores delgados.
* **Ciclo de Vida de Salón Predecible:** Las mesas y pedidos operan bajo máquinas de estado deterministas, con liberación automatizada de recursos tras la liquidación del pago.
* **Estabilidad y Regresión:** La totalidad de las suites de prueba especializadas arrojan un 100% de éxito y el proyecto compila limpiamente sin errores de tipo ni dependencias rotas.

> **Declaración de Responsabilidad Técnica:** Ningún sistema de software puede ser catalogado como absolutamente infalible. No obstante, las vulnerabilidades lógicas, los riesgos de manipulación de importes y las desviaciones arquitectónicas detectadas durante las fases de auditoría fueron exhaustivamente corregidos y verificados con las herramientas de aseguramiento disponibles.

---

## 18. Conclusiones y Lecciones de Ingeniería

El proceso de refactorización y aseguramiento del backend de **Sabor & Gestión** ejemplifica la aplicación práctica de principios avanzados de ingeniería de software a un sistema empresarial crítico:
1. **La seguridad perimetral debe complementarse con integridad interna:** No basta con proteger las rutas con JWT; es indispensable que el servidor ejerza una autoridad estricta sobre el cálculo de datos financieros para impedir manipulaciones desde clientes comprometidos.
2. **El desacoplamiento arquitectónico habilita la testabilidad:** La separación entre controladores, servicios y repositorios transformó un código monolítico difícil de verificar en un sistema modular donde cada componente puede ser auditado de forma unitaria.
3. **El saneamiento continuo previene la degradación del sistema:** La eliminación proactiva de módulos descartados, dependencias no utilizadas y scripts obsoletos redujo la superficie de ataque y clarificó el alcance operativo del restaurante.

El resultado final es una plataforma robusta, confiable, segura y preparada para la operación gastronómica en tiempo real.
