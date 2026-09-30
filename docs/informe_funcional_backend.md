# SABOR & GESTIÓN
## Informe Técnico y Funcional del Backend
### Documentación Académica y Operativa de Arquitectura de Software

---

**Versión del Sistema:** 1.0.0  
**Fecha de Publicación:** Septiembre de 2026  
**Tipo de Documento:** Informe Funcional y Operativo  
**Área:** Ingeniería de Software y Gestión Gastronómica  
**Estado:** Backend Oficial en Producción  

---

### Resumen Ejecutivo

El presente informe constituye la documentación funcional y técnica formal del backend del sistema de gestión gastronómica **Sabor & Gestión**. Este software ha sido concebido y desarrollado para resolver la problemática integral de coordinación operativa, control de salón, procesamiento de comandas de cocina, administración de inventarios estructurados y liquidación financiera en establecimientos gastronómicos modernos.

A través de un enfoque arquitectónico desacoplado en capas y basado estrictamente en el principio de separación de responsabilidades, el backend centraliza toda la autoridad de validación de negocio, control de estados de salón y cómputo monetario. El sistema elimina las discrepancias habituales entre sala y cocina mediante un motor de eventos en tiempo real y erradica los riesgos de inconsistencia de precios al asumir de forma exclusiva el cálculo de subtotales, totales y asignación de precios históricos por comanda.

Este documento detalla el alcance, las responsabilidades, los perfiles de usuario, el catálogo modular, los ciclos de vida de las entidades críticas, las matrices de interacción y las garantías de seguridad que rigen el funcionamiento del sistema, sirviendo como guía académica y manual operativo definitivo del servidor.

---

## 1. Propósito General del Sistema

### 1.1 Problemática Operativa en el Sector Gastronómico
La administración tradicional de restaurantes adolece de fricciones recurrentes originadas por la fragmentación de la información:
* **Falta de sincronización entre sala y cocina:** Las comandas en papel o sistemas desarticulados generan pedidos duplicados, demoras en preparación y falta de visibilidad del estado de los platos.
* **Inconsistencias en el cobro y cálculo de precios:** La delegación manual del cálculo de importes o el uso de precios desactualizados por parte de los camareros genera diferencias financieras, afectando el arqueo de caja.
* **Desabastecimiento imprevisto y mermas:** La ausencia de vinculación entre las comandas emitidas y el consumo real de ingredientes en bodega imposibilita un control preciso de existencias y costos operativos.
* **Tiempos de rotación de mesa prolongados:** La lentitud en la solicitud de cuenta, liquidación de pagos y liberación física de las mesas merma la rentabilidad del salón.

### 1.2 Alcance y Límite de Responsabilidades
El backend de **Sabor & Gestión** actúa como el núcleo computacional y regulador del restaurante. Define con precisión qué aspectos del negocio son gestionados y delimita estrictamente su frontera de acción:

#### Responsabilidades Asumidas (Alcance Activo)
1. **Control del Salón y Mesas:** Supervisión del estado físico y operativo de las mesas del restaurante en tiempo real.
2. **Catálogo Gastronómico y Recetario:** Administración de categorías, platos e ingredientes requeridos por receta.
3. **Gestión de Stock y Almacenes:** Control de existencias físicas por ubicación (bodega central, almacén de barra, cocina caliente).
4. **Comandero y Flujo de Cocina:** Procesamiento de pedidos secuenciales, asignación de identificadores únicos correlativos, cambios de estado operativo y distribución de comandas a estaciones de trabajo.
5. **Autoridad Monetaria Absoluta:** Fijación inmutable de precios por ítem basada en el catálogo oficial en base de datos, cálculo algorítmico de subtotales y totales, y prevención de manipulaciones externas.
6. **Liquidación y Registro de Pagos:** Registro auditable de pagos en caja mediante efectivo, tarjeta o transferencia bancaria, cerrando la comanda y liberando el recurso mesa.
7. **Sincronización en Tiempo Real:** Emisión de eventos bidireccionales mediante WebSockets para actualizar instantáneamente las pantallas de salón, cocina y caja.
8. **Métricas y Analítica:** Consolidación de ingresos, ventas por método de pago y platos de mayor demanda mediante un tablero analítico centralizado.

#### Exclusiones Funcionales (Límites Explícitos)
* **No procesa pasarelas de pago de comercio electrónico:** El sistema registra y valida pagos presenciales completados en el terminal punto de venta (TPV) del restaurante; no incluye redirecciones externas a pasarelas bancarias por internet.
* **No gestiona despachos a domicilio (Delivery):** El flujo está diseñado y optimizado de forma exclusiva para el servicio de salón presencial.
* **No incluye módulo de reservas de mesas:** La asignación de mesas se realiza de forma directa a la llegada de los comensales al salón.
* **No admite clientes externos como usuarios del backend:** El cliente es un comensal presencial sin acceso a credenciales en el sistema.

### 1.3 Roles y Perfiles Operativos
El sistema implementa un modelo de control de acceso basado en roles (RBAC) con cuatro perfiles operativos estrictamente definidos:

| Rol | Perfil y Responsabilidad Funcional |
| :--- | :--- |
| **ADMINISTRADOR** | Máxima autoridad operativa. Configura usuarios, gestiona la carta y recetas, controla los almacenes y stock, supervisa el tablero analítico y audita los correlativos y cierres de turno. |
| **CAMARERO** | Operador de salón. Consulta el estado de las mesas, asigna mesas a comensales, toma comandas, agrega platos a pedidos abiertos, entrega preparaciones a la mesa y solicita la cuenta a caja. |
| **COCINERO** | Operador de producción. Visualiza en tiempo real las comandas entrantes, actualiza el estado de los pedidos de preparación a entrega y consulta las recetas e ingredientes necesarios. |
| **CAJERO** | Operador financiero de turno. Visualiza mesas con cuenta solicitada, valida los importes calculados por el sistema, procesa el cobro por los medios de pago autorizados, emite el comprobante y libera la mesa. |

### 1.4 El Comensal en el Modelo de Dominio
Una premisa fundamental del diseño es que el comensal no posee cuenta, sesión ni interfaz directa con el backend. Toda su interacción es canalizada por el camarero en la mesa y por el cajero al liquidar la comanda. Esto garantiza que ningún actor externo al personal capacitado pueda interactuar con las interfaces del servidor, elevando drásticamente el estándar de seguridad e integridad de datos.

---

## 2. Arquitectura Funcional y Modelo de Capas

### 2.1 Principios Arquitectónicos
El backend de **Sabor & Gestión** está estructurado siguiendo un diseño multicapa desacoplado, guiado por los siguientes principios de ingeniería de software:
* **Separación de Responsabilidades:** Cada capa cumple un único propósito en el ciclo de vida de la petición.
* **Validación Temprana:** Toda solicitud entrante es inspeccionada en su formato y restricciones sintácticas antes de consumir recursos de procesamiento de negocio.
* **Aislamiento de la Persistencia:** La lógica de negocio desconoce la tecnología subyacente de base de datos, interactuando únicamente a través de interfaces de repositorio.
* **Autoridad Centralizada de Dominio:** Ninguna regla de negocio ni cálculo monetario es delegado al cliente o a capas perimetrales.

### 2.2 Flujo Multicapa de una Petición
La siguiente secuencia describe el tránsito de cualquier solicitud en el sistema:

```
[ Petición Cliente ]
        │
        ▼
┌──────────────────┐
│   Capa de Ruta   │  --> Identifica el endpoint y método HTTP correspondiente
└─────────┬────────┘
        │
        ▼
┌──────────────────┐
│ Capa Middleware  │  --> Verifica token JWT, valida permisos del rol y sanea datos
└─────────┬────────┘
        │
        ▼
┌──────────────────┐
│   Controlador    │  --> Desestructura la entrada, verifica parámetros y formatea respuesta
└─────────┬────────┘
        │
        ▼
┌──────────────────┐
│ Capa de Servicio │  --> Aplica reglas de negocio, calcula precios, valida estados
└─────────┬────────┘
        │
        ▼
┌──────────────────┐
│   Repositorio    │  --> Abstrae consultas, persistencia y transacciones con la base de datos
└─────────┬────────┘
        │
        ▼
┌──────────────────┐
│  Modelo / Datos  │  --> Define esquemas, restricciones de integridad y tipos de entidades
└──────────────────┘
```

### 2.3 Descripción Funcional de las Capas

#### 1. Capa de Rutas
Define los puntos de enlace HTTP expuestos por el sistema. Su responsabilidad se limita a registrar las rutas canónicas del API, vincular los intermediarios de autenticación y autorización correspondientes a cada operación y derivar el flujo al controlador respectivo.

#### 2. Capa de Intermediarios (Middleware)
Constituye la barrera de seguridad perimetral del sistema. Inspecciona las cabeceras de la petición para validar la autenticidad y vigencia de las credenciales (tokens seguros), comprueba si el rol del usuario cuenta con los privilegios exigidos para la operación y neutraliza amenazas mediante control de tasa de peticiones y saneamiento de cadenas de texto.

#### 3. Capa de Controladores
Actúa como traductor entre el protocolo HTTP y el dominio del negocio. Extrae los parámetros de la ruta, los criterios de consulta y el cuerpo de la solicitud, verifica su integridad básica, invoca a los servicios pertinentes y transforma el resultado en una respuesta HTTP estructurada con el código de estado apropiado (creación exitosa, recurso no encontrado, conflicto de negocio o error de validación).

#### 4. Capa de Servicios
Es el núcleo del sistema. Contiene la totalidad de las reglas operativas del restaurante: verifica la disponibilidad física de las mesas, valida la existencia de stock en bodega, consulta el catálogo oficial de platos para obtener precios vigentes, calcula importes y subtotales de manera determinista, genera correlativos secuenciales y comanda la emisión de notificaciones en tiempo real hacia los canales de comunicación de los empleados.

#### 5. Capa de Repositorios
Aísla la infraestructura de almacenamiento. Proporciona una interfaz limpia para crear, consultar, modificar y listar las entidades del sistema, abstrayendo a los servicios de los detalles específicos de consulta y permitiendo que la lógica de negocio permanezca pura e independiente de la tecnología de base de datos.

#### 6. Capa de Modelos
Representa formalmente los esquemas de información persistente del negocio. Define las propiedades requeridas, las restricciones de unicidad (como nombres de platos, correlativos o números de mesa) y las relaciones referenciales entre documentos, garantizando la consistencia estructural de los datos almacenados.

---

## 3. Catálogo Funcional de Módulos

El backend se organiza en nueve módulos funcionales especializados que operan de forma articulada.

### 3.1 Módulo de Autenticación y Usuarios
* **Propósito:** Gestionar el ciclo de vida de los colaboradores del restaurante y autenticar de manera segura sus sesiones de trabajo.
* **Actores Involucrados:** Administrador (gestiona cuentas) y Todos los Roles (inician sesión y consultan su perfil).
* **Operaciones Permitidas:** Inicio de sesión con credenciales seguras, consulta de perfil activo, registro de nuevos colaboradores, listado de empleados, actualización de datos personales y desactivación lógica de usuarios.
* **Reglas de Negocio:** La desactivación de un usuario preserva su histórico en pedidos y pagos para fines de auditoría; las contraseñas se almacenan mediante algoritmos criptográficos unidireccionales de alta seguridad; ningún usuario inactivo puede iniciar sesión.
* **Validaciones Clave:** Exigencia de correos electrónicos únicos y validados, contraseñas con longitud y complejidad adecuada, y asignación obligatoria de uno de los cuatro roles reconocidos.
* **Efectos Colaterales:** La generación de una sesión exitosa emite un token de acceso criptográfico que identifica inequívocamente al operador en las subsiguientes peticiones.

### 3.2 Módulo de Mesas
* **Propósito:** Administrar el inventario físico y la distribución espacial del salón del restaurante.
* **Actores Involucrados:** Administrador (crea y edita mesas) y Camarero (consulta y cambia estados de mesa).
* **Operaciones Permitidas:** Registro de mesas con número y capacidad, actualización de capacidad, cambio manual de estado y consulta de salón en tiempo real.
* **Estados Permitidos:** La mesa admite exclusivamente tres estados operativos:
  1. `Libre`: Mesa disponible para recibir nuevos comensales.
  2. `Ocupada`: Mesa con comensales asignados y pedido activo en curso.
  3. `Cuenta Solicitada`: Mesa cuyos comensales han terminado de consumir y esperan la liquidación en caja.
* **Reglas de Negocio:** No pueden existir dos mesas con el mismo número; no se puede asignar un nuevo pedido a una mesa que se encuentre en estado `Ocupada` o `Cuenta Solicitada` a menos que forme parte de la misma comanda activa.
* **Efectos Colaterales:** Al abrirse un pedido, la mesa pasa de forma inmediata a `Ocupada`; al completarse el pago, la mesa se libera automáticamente pasando a `Libre`.

### 3.3 Módulo de Categorías y Platos
* **Propósito:** Gestionar el catálogo gastronómico ofrecido a los comensales.
* **Actores Involucrados:** Administrador (gestión total) y Camarero / Cocinero (consulta de carta).
* **Operaciones Permitidas:** Creación y edición de categorías de menú, registro de platos vinculados a categorías, actualización de precios y cambio de disponibilidad del plato para el servicio.
* **Reglas de Negocio:** El precio de un plato debe ser un número estrictamente positivo; un plato marcado como no disponible no puede ser añadido a nuevas comandas de salón.
* **Validaciones Clave:** Nombres de plato únicos en el sistema, categoría existente y precio mayor a cero.
* **Efectos Colaterales:** El precio registrado en el plato sirve como referencia viva del catálogo; cada vez que se incluye en un pedido, el sistema copia dicho valor como precio histórico inmutable dentro de la línea de comanda.

### 3.4 Módulo de Recetas e Ingredientes
* **Propósito:** Formalizar la ficha técnica de elaboración de cada plato y la composición de materias primas.
* **Actores Involucrados:** Administrador (gestión técnica) y Cocinero (consulta operativa).
* **Operaciones Permitidas:** Registro de ingredientes con su unidad de medida estándar (gramos, mililitros, unidades), definición de recetas por plato con cantidades requeridas y actualización de rendimientos de porción.
* **Reglas de Negocio:** Una receta debe estar obligatoriamente vinculada a un plato existente del catálogo; cada ingrediente especificado en la receta debe existir en el inventario.
* **Validaciones Clave:** Cantidades de ingredientes estrictamente mayores a cero y unidades de medida compatibles.
* **Efectos Colaterales:** Permite la futura explosión de materiales para descontar existencias de almacén conforme se confirman y preparan los platos en cocina.

### 3.5 Módulo de Ubicaciones e Inventario
* **Propósito:** Supervisar las existencias físicas de materias primas e insumos en los distintos puntos de almacenamiento del establecimiento.
* **Actores Involucrados:** Administrador (control global) y Cocinero (consulta y registro de consumo).
* **Operaciones Permitidas:** Creación de ubicaciones físicas (ej. Almacén Central, Nevera Principal, Barra), registro de ingresos de mercadería, ajuste de existencias por merma y consulta de niveles de stock mínimo y crítico.
* **Reglas de Negocio:** Las cantidades de stock no pueden ser negativas; cuando un ingrediente alcanza su punto de reorden o stock mínimo, el sistema emite una alerta preventiva.
* **Validaciones Clave:** Ubicación válida, ingrediente existente y cantidades no negativas.
* **Efectos Colaterales:** Suministra la información de disponibilidad requerida antes de autorizar la preparación de platos en el módulo de cocina.

### 3.6 Módulo de Pedidos (Comandero)
* **Propósito:** Gestionar el flujo de vida de las órdenes de consumo desde su apertura en mesa hasta su entrega y liquidación.
* **Actores Involucrados:** Camarero (apertura, edición, entrega y solicitud de cuenta), Cocinero (preparación y despacho) y Cajero (consulta para cobro).
* **Operaciones Permitidas:** Creación de pedido asignado a mesa y camarero, adición de líneas de detalle (plato y cantidad), avance de estado operativo a preparación, confirmación de entrega a mesa, cancelación justificada y solicitud de cuenta.
* **Estados de Pedido:**
  * `ABIERTO`: Comanda creada o en proceso de toma por el camarero.
  * `EN_PREPARACION`: Comanda enviada a cocina y en proceso de elaboración por los cocineros.
  * `ENTREGADO`: Platos elaborados y servidos físicamente en la mesa del comensal.
  * `CERRADO`: Pedido completamente liquidado y pagado en caja.
  * `CANCELADO`: Pedido anulado bajo causales operativas justificadas.
* **Reglas de Negocio:** Cada pedido recibe un código correlativo único con formato `PED-XXXX`; la cancelación sólo es admisible mientras el pedido se encuentra en estado `ABIERTO` o `EN_PREPARACION`; una vez `ENTREGADO` o `CERRADO`, la cancelación está prohibida.
* **Efectos Colaterales:** La apertura cambia el estado de la mesa a `Ocupada`; la solicitud de cuenta cambia la mesa a `Cuenta Solicitada`; el cierre tras pago libera la mesa dejándola `Libre`. Se emiten eventos WebSockets inmediatos a cocina y caja.

### 3.7 Módulo de Pagos
* **Propósito:** Gestionar la liquidación financiera de las comandas y registrar de forma auditable los ingresos en caja.
* **Actores Involucrados:** Cajero (procesamiento de cobros) y Administrador (auditoría financiera).
* **Operaciones Permitidas:** Registro de pagos asociados a un pedido, consulta de comprobantes de pago por correlativo y reporte de ingresos por turno.
* **Métodos de Pago Admitidos:** `EFECTIVO`, `TARJETA` y `TRANSFERENCIA`.
* **Estados de Transacción:** `PENDIENTE`, `COMPLETADO` y `FALLIDO`.
* **Reglas de Negocio:** Un pago sólo puede registrarse sobre pedidos en estado `ENTREGADO` o `ABIERTO` con cuenta solicitada; el monto pagado debe cubrir con exactitud matemática el total calculado del pedido; no se permiten pagos parciales sin saldar.
* **Efectos Colaterales:** Al confirmarse un pago como `COMPLETADO`, el servicio de pedidos transiciona el pedido a estado `CERRADO`, el servicio de mesas actualiza la mesa a `Libre` y se actualizan los indicadores de facturación del día.

### 3.8 Módulo de Dashboard y Analítica
* **Propósito:** Consolidar métricas operativas y financieras del restaurante para la toma de decisiones estratégicas.
* **Actores Involucrados:** Administrador.
* **Operaciones Permitidas:** Consulta de resumen ejecutivo, desglose de ventas por método de pago, ranking de platos más vendidos y visualización de volumen de pedidos por rango horario.
* **Reglas de Negocio:** Los datos analíticos se calculan en tiempo real a partir de transacciones efectivamente completadas (`COMPLETADO` y `CERRADO`), excluyendo pedidos cancelados.
* **Validaciones Clave:** Acceso restringido exclusivamente a usuarios con rol Administrador.

### 3.9 Módulo de Contador y Correlativos
* **Propósito:** Garantizar la asignación secuencial, atómica y libre de colisiones de los identificadores legibles del sistema.
* **Actores Involucrados:** Operado internamente por el sistema (invocado por Pedidos y Pagos).
* **Operaciones Permitidas:** Incremento atómico de secuencias, consulta de último número generado e inicialización de contadores.
* **Reglas de Negocio:** Los identificadores de pedidos siguen la máscara `PED-XXXX` (ej. PED-0001, PED-0002) de forma estrictamente incremental; no se reutilizan números de pedidos cancelados para preservar la trazabilidad fiscal.
* **Efectos Colaterales:** Asegura que ante múltiples solicitudes concurrentes en distintas mesas, cada comanda reciba un número correlativo único e irrepetible.

---

## 4. Gestión Financiera y Autoridad de Cálculo

### 4.1 El Backend como Única Fuente de Verdad Monetaria
En arquitecturas de software empresarial para hostelería, permitir que el cliente (frontend, aplicación móvil o terminal de camarero) envíe valores monetarios como precios unitarios, subtotales o totales constituye una vulnerabilidad crítica de seguridad y consistencia contable.

En **Sabor & Gestión**, rige el principio de **Autoridad Monetaria Absoluta del Servidor**:
1. El camarero únicamente envía la identificación de la mesa, el identificador del plato y la cantidad solicitada.
2. El frontend tiene estrictamente prohibido imponer o sugerir precios unitarios, subtotales o totales.
3. El backend intercepta la solicitud, busca el registro oficial del plato en la base de datos y toma su precio vigente directamente del catálogo.

### 4.2 Snapshot Histórico de Precios
Si el precio de un plato varía en el catálogo general (por ejemplo, por alza en costos de insumos), dicha modificación jamás debe alterar los pedidos históricos ya creados o cerrados.

Para resolver este desafío contable:
* En el instante exacto en que se añade un plato a la comanda, el servicio del backend captura una copia inmutable del precio vigente del plato denominada **precio unitario histórico** (snapshot).
* Esta copia queda alojada dentro del ítem de detalle del pedido. Si el administrador ajusta el precio en el menú minutos después, la comanda en curso conserva de forma íntegra el precio con el que fue pactada con el comensal.

### 4.3 Algoritmo de Cálculo de Subtotales y Totales
El cálculo de los importes se realiza en el servidor bajo reglas matemáticas deterministas y sin margen a manipulación externa:
* **Validación de Cantidad:** La cantidad por cada ítem debe ser un número entero estrictamente mayor o igual a uno ($cantidad ge 1$). Se rechazan cantidades fraccionarias no autorizadas, valores cero o cantidades negativas.
* **Subtotal por Línea:** Se calcula multiplicando el precio unitario del catálogo por la cantidad requerida:
  $$Subtotal_{ítem} = PrecioUnitario_{plato} 	imes Cantidad$$
* **Total del Pedido:** Se obtiene mediante la sumatoria lineal de los subtotales de cada línea de la comanda:
  $$Total_{pedido} = sum_{i=1}^{n} Subtotal_{ítem_i}$$
* **Blindaje contra Valores Negativos:** El sistema prohíbe de forma estructural importes negativos, descuentos no tipificados y desbordamientos aritméticos.

### 4.4 Flujo de Cobro y Consistencia Financiera
Cuando los comensales solicitan la liquidación de la cuenta:
1. El cajero visualiza el importe total calculado por el servidor para esa mesa.
2. El comensal efectúa el pago en el punto de cobro utilizando efectivo, tarjeta o transferencia.
3. El cajero ingresa al sistema el medio de pago utilizado y el importe recibido.
4. El servicio financiero valida que el monto recibido coincida exactamente con el total del pedido.
5. Al validarse la coincidencia, el pago se marca como `COMPLETADO`, el pedido se transforma a `CERRADO`, y el correlativo de cobro queda registrado en el historial contable, impidiendo que el pedido vuelva a ser alterado o cobrado por segunda vez.

---

## 5. Ciclo de Vida de Entidades Principales

El comportamiento dinámico del restaurante se rige por máquinas de estado formales que gobiernan las transiciones de las mesas y los pedidos.

### 5.1 Ciclo de Vida de una Mesa
El salón opera bajo tres estados mutuamente excluyentes:

```
  ┌────────────────────────────────────────────────────────┐
  │                                                        │
  ▼                                                        │
┌──────────────┐    Asignación y Comanda     ┌─────────────┴┐
│    LIBRE     │ ──────────────────────────> │   OCUPADA    │
└──────────────┘                             └──────┬───────┘
  ▲                                                 │
  │                     Solicitud                   │
  │                     de Cuenta                   │
  │                                                 ▼
  │  Cobro y Cierre                   ┌─────────────────────┐
  └────────────────────────────────── │  CUENTA SOLICITADA  │
                                      └─────────────────────┘
```

#### Matriz de Transiciones de Mesa:
| Estado Origen | Estado Destino | Evento Disparador | Rol Autorizado | Validación del Sistema |
| :--- | :--- | :--- | :--- | :--- |
| `Libre` | `Ocupada` | Apertura de comanda y asignación | Camarero / Admin | Mesa sin pedidos previos activos. |
| `Ocupada` | `Cuenta Solicitada` | Solicitud formal de la cuenta | Camarero / Cajero | Pedido asociado en estado `ENTREGADO`. |
| `Cuenta Solicitada` | `Libre` | Registro de pago exitoso | Cajero / Admin | Pago registrado como `COMPLETADO`. |
| `Ocupada` | `Libre` | Cancelación justificada de comanda | Camarero / Admin | Pedido anulado sin consumo pendiente. |

### 5.2 Ciclo de Vida de un Pedido (Comanda)
El pedido transiciona a través de estados que representan su progreso físico en la cocina y el salón:

```
       ┌─────────────┐
       │   ABIERTO   │ ─── (Cancelación temprana) ───┐
       └──────┬──────┘                               │
              │                                      │
              │ Envío a cocina                       │
              ▼                                      ▼
       ┌─────────────┐                        ┌─────────────┐
       │     EN      │ ─── (Cancelación) ───> │  CANCELADO  │
       │ PREPARACION │                        └─────────────┘
       └──────┬──────┘
              │
              │ Preparación finalizada
              ▼
       ┌─────────────┐
       │  ENTREGADO  │
       └──────┬──────┘
              │
              │ Pago completado en caja
              ▼
       ┌─────────────┐
       │   CERRADO   │
       └─────────────┘
```

#### Definición de Estados y Restricciones:
1. **ABIERTO:** El pedido ha sido iniciado por el camarero en el salón. En este estado se permite agregar o eliminar platos y modificar cantidades. Si los comensales se retiran antes de ordenar a cocina, puede ser cancelado directamente.
2. **EN_PREPARACION:** La comanda ha sido transmitida a las estaciones de cocina. Los cocineros visualizan los ítems y comienzan la elaboración. Aún es posible cancelar bajo autorización excepcional del administrador o aviso del camarero si la preparación no ha consumido ingredientes irreversibles.
3. **ENTREGADO:** Los platos han sido cocinados y servidos en la mesa del cliente. En este estado **está estrictamente prohibido cancelar el pedido**, dado que la comida ya fue elaborada y servida.
4. **CERRADO:** El cajero ha procesado y confirmado el pago total en caja. El pedido queda sellado de forma definitiva e inmutable. No se admiten adiciones, cancelaciones ni modificaciones posteriores.
5. **CANCELADO:** Estado terminal de pedidos anulados. Preserva su registro para auditoría, pero no se considera en la facturación efectiva del día.

---

## 6. Eventos en Tiempo Real (WebSockets)

### 6.1 Propósito y Arquitectura de Eventos
La dinámica de un restaurante requiere comunicación instantánea. El mecanismo tradicional de sondeo periódico (polling) por parte del navegador satura el servidor con peticiones innecesarias y genera latencias de hasta varios minutos, causando que los platos se enfríen o que caja desconozca el estado de una mesa.

El backend integra un motor de **WebSockets** que permite al servidor notificar de forma proactiva y en milisegundos a las terminales conectadas cuando ocurre una mutación de estado relevante.

### 6.2 Salas y Canales de Distribución
Para evitar la sobrecarga de información y garantizar la privacidad de los datos, las conexiones se organizan por salas temáticas según la función del empleado:
* **Canal Salón (Camareros):** Recibe avisos de platos listos para servir en mesa, alertas de mesas asignadas y confirmaciones de cobro para liberar el espacio.
* **Canal Cocina (Cocineros):** Recibe en tiempo real las nuevas comandas que pasan a preparación, modificaciones de ítems y cancelaciones inmediatas para detener la cocción.
* **Canal Caja (Cajeros):** Recibe avisos de mesas que han solicitado la cuenta, pedidos entregados listos para cobrar y actualizaciones de pagos en trámite.
* **Canal General (Administración):** Supervisa el flujo global de actividad del establecimiento.

### 6.3 Catálogo de Eventos Operativos Emitidos

| Evento de Sistema | Origen | Destinatarios | Significado Operativo |
| :--- | :--- | :--- | :--- |
| `pedido:creado` | Camarero | Cocina, Salón | Se ha abierto una nueva comanda con correlativo `PED-XXXX`. |
| `pedido:preparando` | Cocinero | Salón | La cocina ha iniciado la preparación de los platos. |
| `pedido:entregado` | Camarero / Cocinero | Caja, Salón | Los platos están en la mesa; la comanda queda apta para cobro. |
| `mesa:cuenta_solicitada`| Camarero | Caja | Los comensales solicitan la cuenta; caja prepara la liquidación. |
| `pago:completado` | Cajero | Salón, Admin | La cuenta ha sido saldada; la mesa se marca como libre en el salón. |
| `pedido:cancelado` | Camarero / Admin | Cocina, Caja | Se anula la comanda; cocina interrumpe la preparación. |

---

## 7. Matriz de Interacción Entre Módulos

El funcionamiento del sistema se sustenta en la cooperación armónica entre sus distintos módulos funcionales. La siguiente matriz ilustra las dependencias directas entre ellos:

| Módulo Origen | Usuarios | Mesas | Categorías/Platos | Recetas/Ingred. | Inventario | Pedidos | Pagos | Dashboard | Contador |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Usuarios** | — | Lectura | — | — | — | Registro | Registro | — | — |
| **Mesas** | — | — | — | — | — | Validación | Cierre | Analítica | — |
| **Platos** | — | — | Catálogo | Insumo | Validación | Precios | — | Analítica | — |
| **Recetas** | — | — | Vínculo | — | Deducción | — | — | — | — |
| **Inventario**| — | — | — | Existencias | — | Stock | — | Analítica | — |
| **Pedidos** | Asignación | Bloqueo | Snapshot | Verificación | Descuento | — | Facturación | Métricas | Correlativo |
| **Pagos** | Auditoría | Liberación | — | — | — | Cierre | — | Ingresos | — |
| **Dashboard** | — | Ocupación | Top Ventas | — | Alertas | Conteo | Totalizado | — | — |
| **Contador** | — | — | — | — | — | Asignación | — | — | — |

### Impacto en Cascada de Operaciones Críticas:

#### Caso 1: Creación de un Pedido en Mesa
1. El módulo de **Usuarios** valida la sesión y rol del camarero.
2. El módulo de **Mesas** verifica que la mesa esté `Libre` y la actualiza a `Ocupada`.
3. El módulo de **Contador** genera de forma atómica el siguiente correlativo secuencial `PED-XXXX`.
4. El módulo de **Platos** suministra los precios unitarios vigentes de cada plato.
5. El módulo de **Pedidos** aplica el snapshot histórico de precios, calcula subtotales por línea y el total general.
6. El módulo de **WebSockets** emite la señal a cocina notificando la nueva orden.

#### Caso 2: Registro de Pago y Cierre de Servicio
1. El módulo de **Usuarios** valida la sesión del cajero.
2. El módulo de **Pedidos** verifica que la comanda esté `ENTREGADO` o en cuenta solicitada.
3. El módulo de **Pagos** valida que el monto coincida con el total calculado del pedido y registra la transacción como `COMPLETADO`.
4. El módulo de **Pedidos** actualiza el estado de la comanda a `CERRADO`.
5. El módulo de **Mesas** cambia el estado de la mesa a `Libre`, dejándola disponible para nuevos comensales.
6. El módulo de **Dashboard** incorpora el ingreso a las estadísticas consolidadas del día.
7. El módulo de **WebSockets** notifica al salón la liberación de la mesa.

---

## 8. Flujo Operativo Completo de un Servicio (Casos de Uso)

A continuación, se detalla el ciclo completo de atención a una mesa en un turno gastronómico típico, describiendo la interacción paso a paso de cada actor con el backend:

### Paso 1: Apertura de Turno y Verificación de Inventario
* **Actor Principal:** Administrador y Cocinero.
* **Acciones en el Backend:**
  1. El administrador y el cocinero inician sesión con sus credenciales mediante el módulo de autenticación.
  2. El cocinero consulta los niveles de inventario en el módulo de inventarios para verificar que haya existencias suficientes de ingredientes clave para el menú del día.
  3. Si algún ingrediente se encuentra agotado, el administrador ingresa al módulo de platos y actualiza temporalmente la disponibilidad del plato afectado, impidiendo que el salón tome comandas de dicho plato.

### Paso 2: Asignación de Mesa a Comensales
* **Actor Principal:** Camarero.
* **Acciones en el Backend:**
  1. Llega un grupo de comensales al salón del restaurante.
  2. El camarero accede a la vista de mesas desde su terminal móvil y consulta el estado de las mesas en el módulo de mesas.
  3. Identifica una mesa en estado `Libre` con la capacidad adecuada y ubica a los clientes.

### Paso 3: Toma de Comanda y Creación de Pedido
* **Actor Principal:** Camarero.
* **Acciones en el Backend:**
  1. El camarero toma la orden de los comensales y selecciona los platos solicitados en el catálogo de platos.
  2. Envía la solicitud de creación de pedido al módulo de pedidos especificando el número de mesa, los identificadores de plato y las cantidades deseadas.
  3. El backend verifica la disponibilidad, obtiene los precios oficiales del catálogo, calcula subtotales y total, genera el correlativo `PED-0042`, asocia al camarero responsable y actualiza el estado de la mesa a `Ocupada`.
  4. El pedido queda inicialmente registrado en estado `ABIERTO` o se despacha a preparación.

### Paso 4: Notificación y Preparación en Cocina
* **Actor Principal:** Cocinero.
* **Acciones en el Backend:**
  1. La pantalla de cocina emite una alerta sonora y visual al recibir el evento en tiempo real emitido por el backend.
  2. El cocinero visualiza la comanda `PED-0042` con la lista de platos y notas especiales.
  3. El cocinero interactúa con el sistema para cambiar el estado del pedido a `EN_PREPARACION`, informando a la sala que los platos están en fuego.
  4. Los cocineros consultan las recetas y requerimientos técnicos en caso necesario.

### Paso 5: Finalización y Entrega de Platos a la Mesa
* **Actor Principal:** Cocinero y Camarero.
* **Acciones en el Backend:**
  1. Al culminar la cocción de todos los platos de la orden, el cocinero marca el pedido como listo en el sistema.
  2. El backend notifica instantáneamente al camarero mediante WebSockets en su terminal de salón.
  3. El camarero retira los platos del pase de cocina, los sirve en la mesa correspondiente y actualiza el pedido en el backend al estado `ENTREGADO`.
  4. En este punto, el sistema bloquea definitivamente la opción de cancelación de la comanda.

### Paso 6: Solicitud de Cuenta y Cobro en Caja
* **Actor Principal:** Camarero y Cajero.
* **Acciones en el Backend:**
  1. Los clientes solicitan la cuenta. El camarero marca en el sistema la solicitud de cuenta para esa mesa.
  2. El módulo de mesas actualiza el estado a `Cuenta Solicitada`.
  3. La pantalla de caja muestra la mesa prioritaria pendiente de cobro junto con el importe total calculado de forma inviolable por el backend.
  4. El cajero recibe el pago del comensal (ej. tarjeta de crédito), ingresa al módulo de pagos y procesa la transacción indicando el método `TARJETA` y el monto exacto.
  5. El backend registra la transacción como `COMPLETADO` y genera el comprobante auditable.

### Paso 7: Liberación de la Mesa y Cierre del Ciclo
* **Actor Principal:** Cajero (asistido por automatismo del sistema).
* **Acciones en el Backend:**
  1. Tras validar el cobro, el servicio de pedidos cambia automáticamente el estado del pedido `PED-0042` a `CERRADO`.
  2. El servicio de mesas actualiza inmediatamente el estado de la mesa a `Libre`.
  3. Se emite un evento WebSocket al canal de salón para indicar que la mesa puede ser desinfectada y asignada a nuevos comensales.
  4. Las métricas financieras y el volumen de platos vendidos se incorporan de forma instantánea al tablero del módulo de dashboard.

---

## 9. Consideraciones de Seguridad y Control de Acceso

La seguridad y la confiabilidad operativa del backend se sustentan en múltiples capas de protección:

### 9.1 Autenticación Centralizada y Tokens Criptográficos
* El sistema no utiliza sesiones tradicionales en memoria del servidor con estado (stateful), sino una arquitectura sin estado (stateless) gobernada por **tokens de autenticación criptográficos (JWT)**.
* Cada token emitido en el inicio de sesión contiene la identidad del usuario, su identificador único y su rol operativo encriptado bajo algoritmos de firma robustos.
* Los tokens poseen un período de expiración riguroso, obligando a reautenticar sesiones caducadas y previniendo el uso indebido de credenciales comprometidas.

### 9.2 Control de Acceso Basado en Roles (RBAC)
Cada solicitud entrante debe superar una barrera de autorización que coteja el rol presente en el token con la matriz de privilegios exigida por el recurso. La siguiente tabla resume la política de control de acceso:

| Módulo Funcional | Administrador | Camarero | Cocinero | Cajero |
| :--- | :---: | :---: | :---: | :---: |
| **Gestión de Usuarios** | Total (CRUD) | Ninguno | Ninguno | Ninguno |
| **Administración de Mesas** | Total (CRUD) | Consulta y Estado | Consulta | Consulta |
| **Catálogo de Platos** | Total (CRUD) | Consulta Carta | Consulta Carta | Consulta Carta |
| **Recetas e Ingredientes**| Total (CRUD) | Ninguno | Consulta Ficha | Ninguno |
| **Ubicaciones e Inventario**| Total (CRUD) | Ninguno | Consulta Stock | Ninguno |
| **Creación y Edición Pedidos**| Total | Crear y Entregar | Cambiar a Prep. | Consulta Total |
| **Procesamiento de Pagos** | Consulta / Auditar | Ninguno | Ninguno | Total (Cobro) |
| **Dashboard y Analítica** | Total | Ninguno | Ninguno | Ninguno |
| **Correlativos y Contadores** | Auditoría | Sistema | Sistema | Sistema |

### 9.3 Saneamiento Perimetral y Validación de Tipos
* Toda petición con cuerpo JSON o parámetros de consulta es validada contra reglas de tipado estrictas antes de alcanzar los controladores.
* Se rechazan peticiones con campos inesperados, tipos incongruentes (por ejemplo, textos en campos de cantidad numérica) o valores por fuera de los rangos válidos.
* Las cadenas de texto son saneadas para impedir ataques de inyección de código o desbordamiento de búfer.

### 9.4 Política de Orígenes Cruzados (CORS) y Mitigación de Abusos
* El backend restringe la comunicación únicamente a clientes alojados en orígenes explícitamente autorizados (whitelist de dominios del restaurante).
* Se aplica una política de **limitación de tasa de solicitudes (Rate Limiting)** que restringe la cantidad máxima de peticiones admisibles por dirección IP en ventanas de tiempo predeterminadas, previniendo ataques de fuerza bruta en los endpoints de autenticación y saturación por denegación de servicio.

### 9.5 Manejo Estandarizado de Errores y Trazabilidad
* Todas las respuestas de error del sistema respetan un formato JSON consistente que incluye código de estado HTTP semántico, mensaje descriptivo y sello de tiempo.
* Se ocultan intencionalmente detalles internos de la base de datos o volcados de memoria para evitar la fuga de información sensible hacia el exterior.
* Toda falla crítica queda registrada en los diarios de auditoría del servidor para su análisis forense por parte del equipo de infraestructura.

---

## 10. Conclusión y Valor Técnico

El backend de **Sabor & Gestión** representa una solución de software moderna, robusta y altamente eficiente para la administración gastronómica. Al desacoplar sus componentes en un modelo estricto de seis capas, centralizar la autoridad de cálculo monetario y coordinar la operación mediante eventos en tiempo real, el sistema garantiza:
1. **Cero discrepancias financieras** entre los consumos de salón y la liquidación en caja.
2. **Máxima fluidez operativa** en la comunicación salón-cocina sin tiempos muertos.
3. **Control riguroso de inventarios y materias primas** asociado directamente a la producción.
4. **Seguridad y trazabilidad integral** en cada una de las 47 operaciones funcionales soportadas.

Esta arquitectura asegura la escalabilidad futura del negocio gastronómico, sentando las bases para una operación rentable, moderna y plenamente controlada.
