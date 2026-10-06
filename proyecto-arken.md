# Arken — Plataforma de Centralización de Automotoras

> Documento de presentación del proyecto. Reúne qué es la plataforma, qué hace,
> con qué tecnologías está construida y cómo se desplegará. Las reglas de
> negocio completas y el detalle técnico fino viven en la carpeta `docs/` del
> repositorio; este documento es su resumen ordenado.

**Contenido**

1. [Resumen](#1-resumen)
2. [Descripción del proyecto (lenguaje simple)](#2-descripción-del-proyecto-lenguaje-simple)
3. [Funcionalidades](#3-funcionalidades)
4. [Descripción técnica del proyecto](#4-descripción-técnica-del-proyecto)
5. [Tecnologías utilizadas](#5-tecnologías-utilizadas)
6. [Despliegue](#6-despliegue)
7. [Alcance y decisiones de diseño](#7-alcance-y-decisiones-de-diseño)

---

## 1. Resumen

**Arken** es una plataforma web para automotoras (empresas que compran y venden
vehículos usados). Cada automotora que se registra obtiene, al mismo tiempo:

- **Un sistema de gestión** para administrar su negocio: inventario de
  vehículos, clientes, cotizaciones, reservas, tasaciones, ventas,
  consignaciones, gastos, documentos en PDF, alertas, indicadores y auditoría.
- **Su propia página web pública** (vitrina), en una dirección propia del tipo
  `nombre-automotora.dominio.cl`, que muestra automáticamente los vehículos que
  tiene a la venta.
- **Presencia en un marketplace común**, una vitrina general donde cualquier
  persona busca autos y motos entre la oferta de todas las automotoras
  registradas, sin crear cuenta, y las contacta directo por WhatsApp.

El inventario se carga **una sola vez** en el sistema de gestión y desde ahí
alimenta la vitrina propia y el marketplace. La plataforma es **multi-empresa**
(muchas automotoras comparten la misma instalación, cada una ve solo sus datos)
y **multi-sucursal** (una automotora puede operar en varios locales).

| En números                      |                                                                 |
| ------------------------------- | --------------------------------------------------------------- |
| Aplicaciones                    | 3 (API, panel de gestión, sitio público) + 1 paquete compartido |
| Módulos de negocio              | 18                                                              |
| Tablas en la base de datos      | 23                                                              |
| Roles de usuario                | 3 (Admin General, Admin de Sucursal, Vendedor)                  |
| Pruebas automatizadas de la API | 163                                                             |

---

## 2. Descripción del proyecto (lenguaje simple)

### El problema

Muchas automotoras pequeñas y medianas llevan su negocio en planillas Excel,
cuadernos o sistemas armados a medida. Eso trae problemas concretos:

- No saben con certeza **cuánto ganaron realmente con cada auto**, porque los
  gastos (mecánica, pintura, trámites) quedan anotados en otra parte.
- Las cotizaciones y reservas se hacen a mano, sin numeración ordenada ni un
  respaldo en PDF que el cliente pueda guardar.
- Si tienen varias sucursales, cada una lleva sus cosas por separado y el dueño
  no tiene una vista consolidada.
- Su presencia en internet depende de publicar auto por auto en portales de
  avisos genéricos, sin una página propia que muestre su marca.

### La solución

Arken reúne todo en un solo lugar. La automotora se registra en minutos, carga
sus vehículos con fotos y desde ese momento:

- **Sabe en qué está cada auto**: si está en preparación, publicado, reservado,
  vendido o dado de baja, en qué sucursal se encuentra y cuánto se ha invertido
  en él.
- **Atiende a sus clientes con orden**: registra a cada cliente una sola vez y
  le emite cotizaciones, reservas y tasaciones con número correlativo y PDF
  profesional, que además le llegan solas por correo.
- **Vende con control**: al cerrar una venta registra cómo se pagó (efectivo,
  transferencia, crédito, auto en parte de pago, etc.), el sistema verifica que
  los montos cuadren y emite el comprobante.
- **Ve cómo va el negocio**: un panel de inicio con ingresos, ventas, utilidad
  y stock, y una sección de analítica que muestra qué marcas se venden más
  rápido, qué autos llevan demasiado tiempo sin venderse y cuánto se negocia en
  promedio.
- **Tiene su propia página web** sin tener que diseñarla: basta con subir su
  logo y una foto de portada. Sus autos publicados aparecen solos, con fotos,
  precios, ubicación y un botón para escribirle por WhatsApp.
- **Aparece en el marketplace**, donde compradores de todo Chile buscan entre
  la oferta de todas las automotoras.

### Para quién es

| Quién                                      | Qué hace en la plataforma                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Dueño de la automotora** (Admin General) | Ve y administra todas las sucursales: inventario, ventas, costos, márgenes, usuarios y configuración.                      |
| **Jefe de sucursal** (Admin de Sucursal)   | Lo mismo que el dueño, pero solo para su sucursal.                                                                         |
| **Vendedor**                               | Gestiona autos, clientes, cotizaciones, reservas y ventas de su sucursal, pero no ve costos ni márgenes.                   |
| **Comprador**                              | Busca vehículos en el marketplace o en la página de una automotora, sin registrarse, y contacta por WhatsApp o por correo. |

### Un día de uso, como ejemplo

1. Llega un auto comprado a un particular. El vendedor lo ingresa al sistema
   con su patente, datos y fotos tomadas con el celular (se aceptan incluso
   fotos de iPhone; el sistema las optimiza solas).
2. Mientras se prepara, se registran sus gastos (mecánica, lavado). Cuando está
   listo, se marca como disponible y aparece al instante en la página de la
   automotora y en el marketplace.
3. Un comprador lo encuentra en el marketplace y escribe por WhatsApp. El
   vendedor le emite una cotización: el cliente la recibe por correo en PDF.
4. Tres días después, si el auto sigue disponible, el sistema le envía al
   cliente un recordatorio automático: "el auto sigue disponible".
5. El cliente vuelve, deja una seña (reserva) y luego cierra la compra pagando
   una parte en efectivo y otra con su auto antiguo, que entra al inventario
   como "auto recibido en parte de pago".
6. El dueño ve en el panel de inicio la venta, el margen real obtenido (precio
   de venta menos costo y gastos) y la utilidad del mes.

---

## 3. Funcionalidades

Las funcionalidades se organizan en 18 módulos. Las reglas completas de cada uno
están en `docs/01-modulos-funcionales.md`.

### 3.1 Plataforma pública

**Registro de automotoras (Módulo 1)**

- Formulario público donde la automotora ingresa sus datos (nombre, RUT,
  dirección, teléfono, correo), elige su subdominio y crea su usuario
  administrador.
- El registro crea en una sola operación la automotora, su sucursal principal y
  el usuario Admin General. Activación inmediata, con verificación obligatoria
  del correo antes de iniciar sesión.

**Marketplace global (Módulo 2)**

- Portada con buscador rápido (texto, marca, tipo, región, precio), vehículos
  recién publicados, accesos por marca, tipo y región, y un directorio de
  automotoras.
- Búsqueda con filtros por marca, modelo, tipo (incluidas motos), transmisión,
  región y comuna de la sucursal, y rangos de precio, año y kilometraje (barras
  deslizables). Los filtros son dinámicos: solo muestran opciones que existen en
  el inventario publicado.
- Ordenamiento por precio, año y kilometraje; paginación de 30 resultados.
- Detalle del vehículo con galería de fotos a pantalla completa, ficha técnica,
  datos de la sucursal y botón de WhatsApp con un mensaje ya escrito sobre ese
  auto. En el celular, una barra fija muestra el precio y el botón de WhatsApp.
- Acceso 100 % anónimo. Nunca se exponen datos internos (patente, costos,
  consignación).

**Vitrina de cada automotora (Módulo 3)**

- Una página propia por automotora en su subdominio, con su logo, foto de
  portada (banner), descripción, inventario de todas sus sucursales con
  filtros, y la sección "Encuéntranos" con mapa, teléfono, WhatsApp, horario y
  "cómo llegar" de cada sucursal.
- Formulario de contacto por correo que llega a la automotora (con protección
  contra envíos masivos y bots).
- Tema claro y oscuro a elección del visitante.
- **Posicionamiento en buscadores (SEO) enfocado en la empresa**: título del
  tipo "Automotora X | Automotora en Providencia y Viña del Mar", descripción,
  dirección oficial única, datos estructurados para Google (`AutoDealer`),
  vista previa al compartir en WhatsApp y redes, y un mapa del sitio
  (`sitemap.xml`) que se actualiza solo con cada automotora nueva.

### 3.2 Sistema de gestión (panel de la automotora)

**Sucursales (Módulo 4)**

- Crear, editar y dar de baja sucursales, con dirección, región, comuna,
  teléfono, WhatsApp, encargado y horario.
- Transferir un vehículo entre sucursales, dejando registro en su historial.

**Usuarios y roles (Módulo 5)**

- Tres roles fijos con permisos distintos (ver tabla de la sección 2).
- Los usuarios se crean por invitación: el administrador ingresa nombre, correo
  y rol, y el invitado recibe un correo para definir su propia contraseña.
- Inicio y cierre de sesión, recuperación de contraseña, desactivación de
  usuarios sin perder su historial.

**Clientes (Módulo 6)**

- Ficha única por cliente (nombre, RUT, teléfono, correo, dirección), aunque
  sea comprador, vendedor particular o dueño de un auto en consignación.
- RUT con formato automático (12.345.678-5) y validación del dígito verificador.
- Historial completo del cliente: todas sus cotizaciones, reservas,
  tasaciones, ventas y consignaciones, de cualquier sucursal.

**Vehículos e inventario (Módulo 7)**

- Ficha completa: marca, modelo, versión, año, kilometraje, color, combustible,
  transmisión, tracción, cilindrada, patente, tipo (SUV, sedán, hatchback,
  camioneta, camión, **moto**, otro), descripción y precios.
- Cuatro orígenes: compra directa, compra a particular (desde una tasación),
  auto recibido en parte de pago y consignación.
- Estados: en preparación, disponible (publicado), reservado, pendiente de
  revisión, vendido y dado de baja. Para publicar se exige al menos una foto.
- Hasta 30 fotos por vehículo, ordenables, con visor a pantalla completa.
- Documentos legales (permiso de circulación, revisión técnica, SOAP) con fecha
  de vencimiento; al ingresar la patente el sistema sugiere el mes de la
  revisión técnica.
- Balance del vehículo: costo de adquisición, gastos, margen proyectado o real.
- Bitácora: historial de todo lo que le pasó al auto (alta, cambios de precio y
  estado, gastos, cotizaciones, reservas, venta, transferencias).
- Listado separado en pestañas: **En inventario**, **Vendidos** y **Dados de
  baja**, con búsqueda, filtros, orden y días en stock.

**Gastos (Módulo 8)**

- Gastos de vehículo (mecánica, estética, documentación, trámites), que entran
  en el margen de ese auto, y gastos operacionales (arriendo, sueldos,
  publicidad, servicios, etc.), que se restan de la utilidad del período.
- Número correlativo por gasto, boleta adjunta (PDF o foto, incluso de iPhone),
  edición y anulación con motivo.
- Listado por período, tipo, categoría y sucursal, con totales.

**Consignaciones (Módulo 9)**

- Autos que un particular deja para que la automotora los venda. Dos tipos de
  trato: comisión (porcentaje del precio) o precio neto garantizado al dueño.
- Precio mínimo aceptado por el dueño (no se puede cotizar por debajo), plazo,
  extensión, devolución del vehículo y liquidación automática al venderse.

**Documentos comerciales (Módulo 10)**

- **Cotización**: precio ofrecido, adicionales (por ejemplo, traspaso) y
  vigencia. Estados vigente, vencida, concretada (cuando termina en venta) y
  anulada.
- **Reserva**: seña que aparta el vehículo por un plazo; se puede extender,
  cancelar (decidiendo si la seña se devuelve o se retiene) o concretar en
  venta, descontando la seña del saldo.
- **Tasación**: la automotora ofrece comprar el auto de un cliente; si se
  acepta, el vehículo entra al inventario como compra a particular.
- Todos con folio correlativo por sucursal y PDF. Nunca se editan: se anulan
  con motivo y se emite uno nuevo.

**Ventas (Módulo 11)**

- Flujo por pasos: vehículo, cliente, formas de pago (combinables: efectivo,
  transferencia, cheque, financiamiento y auto en parte de pago), adicionales,
  resumen y comprobante PDF.
- El sistema verifica que los pagos cuadren exactamente con el total.
- Puede concretar una cotización o una reserva existente.

**Anulación y cancelación (Módulo 12)**

- Anulación de ventas y cancelación de reservas, solo por administradores, con
  motivo obligatorio y reversión automática de los estados involucrados.

**Notificaciones internas (Módulo 13)**

- Avisos automáticos para el equipo: reservas por vencer, consignaciones por
  vencer y documentos legales por vencer (agrupados cuando corresponde). Cada
  aviso se genera una sola vez y se marca como resuelto al atenderlo.

**Dashboard del negocio (Módulo 14)**

- Ingresos, ventas, stock (propio y consignado), utilidad neta, inventario por
  estado, costo de inventario, ganancias proyectadas, reservas por vencer y
  autos estancados (más de 45 días), con gráfico de ingresos acumulados.
- Selector de período y, para el dueño, de una o varias sucursales con
  comparación entre ellas. El vendedor no ve costos ni márgenes.

**Analítica (Módulo 15)**

- Resumen del período (ticket promedio, margen por auto, días hasta vender,
  descuento negociado, tasa de cierre de cotizaciones), evolución mensual,
  embudo comercial, formas de pago, antigüedad del inventario, stock por tipo,
  rendimiento por origen, ventas por vendedor, gastos por categoría y ventas por
  marca y modelo (exportable a CSV), con sugerencias de acción para los autos
  estancados.

**Auditoría (Módulo 16)**

- Registro inmutable de cada acción relevante (cambios de precio y estado,
  documentos, ventas, gastos, usuarios, sucursales, configuración), mostrado
  como un historial de actividad por día con solo los datos que cambiaron
  ("antes → después") y enlaces a cada documento.

**Configuración (Módulo 17)**

- Datos de la empresa, logo y banner, vigencia por defecto de los documentos,
  configuración de los correos automáticos y una vista previa de cómo aparece
  la automotora en Google.

**Correos automáticos al cliente (Módulo 18)**

- Al emitir una cotización, reserva, tasación, venta o consignación, el cliente
  recibe el PDF por correo, con el nombre de la automotora como remitente y las
  respuestas dirigidas a la automotora.
- Recordatorios programados: seguimiento de cotización ("el auto sigue
  disponible", solo si de verdad sigue disponible), cotización, reserva y
  tasación por vencer, con días configurables.
- Historial de correos en cada documento, con opción de reenviar, y enlace para
  que el cliente deje de recibir recordatorios.

### 3.3 Características transversales

- **Diseño adaptable**: el panel y el sitio público funcionan en computador,
  tablet y celular (listas compactas en lugar de tablas, menús adaptados).
- **Tema claro y oscuro** en el panel y en el sitio público.
- **Navegación con historial**: el botón "Volver" regresa a la pantalla desde la
  que se llegó, aunque se haya cambiado de módulo.
- **Fotos optimizadas**: toda foto se convierte a formato WebP, se endereza, se
  ajusta de tamaño y se le quitan los metadatos (incluida la ubicación GPS).

---

## 4. Descripción técnica del proyecto

### 4.1 Arquitectura general

El sistema está compuesto por tres aplicaciones independientes que comparten una
única base de datos PostgreSQL, organizadas en un monorepo:

```
                         ┌────────────────────────────┐
  Compradores ─────────► │ Sitio público (Next.js)    │──┐
  (anónimos)             │ dominio.cl, *.dominio.cl   │  │
                         └────────────────────────────┘  │  HTTP / JSON
                         ┌────────────────────────────┐  ├──────────────► ┌─────────────────┐     ┌──────────────┐
  Usuarios de la ──────► │ Panel de gestión (React)   │──┘                │ API (NestJS)    │────►│ PostgreSQL 16 │
  automotora             │ app.dominio.cl             │                   │ api.dominio.cl  │     └──────────────┘
                         └────────────────────────────┘                   └─────────────────┘
                                                                             │        │
                                                              Resend (correo)◄┘        └► Disco (fotos, PDFs, boletas)
```

| Aplicación                        | Responsabilidad                                                                                                                                                                                    | Dominio de producción         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `apps/api` (NestJS)               | Toda la lógica de negocio de los 18 módulos, autenticación, tareas programadas, PDFs, correos y archivos                                                                                           | `api.dominio.cl`              |
| `apps/web-gestion` (React + Vite) | Panel interno de gestión, una sola instancia para todas las automotoras                                                                                                                            | `app.dominio.cl`              |
| `apps/web-publico` (Next.js)      | Marketplace global y vitrinas por subdominio, renderizadas en el servidor                                                                                                                          | `dominio.cl` y `*.dominio.cl` |
| `packages/shared-types`           | Enums, esquemas Zod y funciones puras compartidas por las tres aplicaciones (validación de RUT y patente, normalización de nombres, formateo de teléfono, cálculo de liquidaciones, textos de SEO) | —                             |

El panel no necesita un subdominio por automotora: el usuario inicia sesión en
`app.dominio.cl` y la API sabe a qué automotora y sucursal pertenece a partir de
su sesión. Los subdominios comodín (`*.dominio.cl`) son exclusivos de las
vitrinas públicas: un _middleware_ de Next.js lee el subdominio del encabezado
`Host` y reescribe la ruta hacia la página de perfil correspondiente.

### 4.2 Multi-tenancy y control de acceso por sucursal

- **Modelo multi-tenant de esquema compartido**: una sola base de datos y un
  solo esquema; cada tabla de negocio lleva `automotora_id` y la mayoría además
  `sucursal_id`.
- **El aislamiento se garantiza en la capa de aplicación**: `automotoraId` y
  `sucursalId` nunca se reciben del cliente; se derivan del JWT ya validado
  mediante una función `getScope(usuario)`:

  ```
  ADMIN_GENERAL                → filtro { automotora_id }
  ADMIN_SUCURSAL / VENDEDOR    → filtro { automotora_id, sucursal_id }
  ```

  Ese _scope_ se aplica en la capa Repository de todos los módulos, nunca a
  criterio de cada endpoint.

- **Sucursal "congelada"**: ventas, cotizaciones, reservas, tasaciones, gastos y
  consignaciones guardan la sucursal en que ocurrieron al crearse, y nunca la
  recalculan desde la ubicación actual del vehículo. Así, si un auto se
  transfiere de sucursal, el historial y los indicadores por sucursal siguen
  siendo correctos.
- **Permisos por rol**: un `RolesGuard` restringe endpoints completos (por
  ejemplo, gastos y auditoría solo para administradores), y los Services
  omiten los campos sensibles (costos, márgenes) en las respuestas para el
  Vendedor.

### 4.3 Backend: arquitectura en capas

Cada módulo de NestJS sigue la misma estructura, sin excepciones:

```
Controller  → solo HTTP: recibe la request, valida el DTO, delega
  Service   → toda la lógica de negocio (reglas de docs/01)
    Repository → único lugar que ejecuta SQL
```

- **DTOs** validados con `class-validator` y `class-transformer` mediante un
  `ValidationPipe` global (lista blanca de propiedades y normalización de
  entradas, por ejemplo, recorte de espacios y normalización de marca y modelo).
- **Transacciones explícitas** para toda operación multi-tabla (cerrar una
  venta, registrar una automotora, transferir un vehículo, emitir un
  documento): un `TransactionRunner` maneja `BEGIN`/`COMMIT`/`ROLLBACK` y cada
  Repository acepta el cliente de la transacción.
- **Folios correlativos sin colisiones**: el siguiente folio por sucursal se
  calcula dentro de la transacción tras tomar un _advisory lock_ de PostgreSQL
  (`pg_advisory_xact_lock`), de modo que dos emisiones simultáneas nunca
  obtienen el mismo número. El mismo mecanismo numera los gastos por automotora.
- **Integridad delegada a la base de datos cuando es posible**: restricciones
  `CHECK`, índices únicos parciales (por ejemplo, una sola venta confirmada por
  vehículo, una sola reserva activa por vehículo, patente única dentro del
  inventario) y llaves foráneas. La API traduce las violaciones de restricción a
  errores de negocio legibles.
- **Manejo de errores centralizado** con un `GlobalExceptionFilter` que entrega
  un formato JSON uniforme.

### 4.4 Acceso a datos: SQL sin ORM

Decisión explícita del proyecto: se usa **SQL escrito a mano** mediante el
driver `pg` (node-postgres), sin ORM, para tener control total sobre las
consultas, su rendimiento y la transparencia del modelo. Las responsabilidades
que normalmente resuelve un ORM se cubren con reglas estrictas:

- **Toda consulta es parametrizada** (`$1`, `$2`, …); nunca se concatena un
  valor recibido del usuario en el texto SQL. Cuando una parte de la consulta
  es dinámica (por ejemplo, el orden de una tabla), se elige de una lista
  cerrada de valores, nunca se interpola texto del cliente.
- Los resultados se tipan manualmente con interfaces TypeScript por fila.
- Las fechas `DATE` se leen como texto `YYYY-MM-DD` para evitar desfases de zona
  horaria; los montos `NUMERIC` se convierten explícitamente.

### 4.5 Modelo de datos

El esquema (`docs/schema.sql`, PostgreSQL 16) tiene **23 tablas** agrupadas en:

| Grupo                 | Tablas                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Núcleo y acceso       | `automotora`, `sucursal`, `usuario`, `token_accion`, `sesion`                                                                |
| Clientes e inventario | `cliente`, `vehiculo`, `vehiculo_foto`, `documento_legal_vehiculo`, `vehiculo_bitacora`                                      |
| Operación             | `gasto`, `consignacion`, `cotizacion`, `cotizacion_costo`, `reserva`, `tasacion`, `venta`, `venta_costo`, `venta_forma_pago` |
| Seguimiento           | `notificacion`, `notificacion_referencia`, `correo`, `auditoria`                                                             |

Aspectos destacados del diseño:

- **Enums nativos** de PostgreSQL para estados, roles, categorías y regiones.
- **Referencias circulares** entre `vehiculo ↔ venta` (auto recibido en parte
  de pago) y `vehiculo ↔ tasacion` (auto comprado desde una tasación): las
  tablas se crean primero y esas llaves foráneas se agregan al final con
  `ALTER TABLE`.
- **Auditoría inmutable**: un _trigger_ impide `UPDATE` y `DELETE` sobre la
  tabla `auditoria`; el registro se escribe en la misma transacción que el
  cambio auditado.
- **Bajas lógicas** (sucursales, usuarios, clientes): nada se borra físicamente
  si tiene historial asociado.
- **Patente única solo dentro del inventario** mediante un índice único parcial
  (`WHERE estado NOT IN ('VENDIDO', 'DADO_DE_BAJA')`), lo que permite que un
  vehículo vendido vuelva a ingresar como un registro nuevo sin perder el
  historial del anterior.
- **Esquema consistente desde el primer día**: durante el desarrollo no se
  acumulan migraciones; el archivo `schema.sql` es la única fuente de verdad y la
  base local se recrea con `pnpm db:reset`. Las migraciones incrementales
  (`node-pg-migrate`) comenzarán después del primer despliegue a producción.

### 4.6 Autenticación y seguridad

- **Contraseñas** con `argon2id`; nunca en texto plano ni en registros.
- **Sesión** con JWT de acceso de corta duración (15 minutos) y token de
  actualización revocable (tabla `sesion`, con rotación), ambos en cookies
  `httpOnly`, `Secure` y `SameSite=Strict`.
- **Protección CSRF** con patrón de doble cookie: toda petición que modifica
  datos debe enviar el encabezado `X-CSRF-Token` igual a la cookie.
- **Tokens de acción** (verificación de correo, invitación, recuperación de
  contraseña) aleatorios, de un solo uso y con expiración; en la base solo se
  guarda su _hash_.
- **Recuperación de contraseña sin enumeración de cuentas**: la respuesta es
  siempre la misma, exista o no el correo.
- **Límite de peticiones** (`@nestjs/throttler`), más estricto en inicio de
  sesión, recuperación de contraseña y formularios públicos.
- **Cabeceras de seguridad** con `helmet` y CORS restringido a los dominios
  propios.
- **Archivos subidos**: el tipo real se detecta por la firma de bytes (no por la
  extensión), con límite de tamaño y nombre aleatorio. Fotos públicas y
  documentos privados se separan: los privados (documentos legales, boletas,
  PDFs) solo se descargan con sesión y respetando el _scope_.
- **Variables de entorno validadas al arrancar** con Zod: la API no inicia si
  falta un valor crítico.

### 4.7 Procesos en segundo plano

Con `@nestjs/schedule`, en hora de Chile y también al arrancar la API (para
cubrir los días en que estuvo detenida):

| Tarea                        | Horario     | Qué hace                                                                                                                              |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Vencimientos                 | 00:05       | Marca como vencidas las cotizaciones, reservas y tasaciones cuyo plazo terminó, y las consignaciones vencidas                         |
| Notificaciones internas      | 06:30       | Genera los avisos de reservas, consignaciones y documentos legales por vencer, sin repetir eventos ya avisados (`clave_evento` único) |
| Recordatorios a clientes     | 07:00       | Encola seguimientos y avisos de vencimiento según la configuración de cada automotora                                                 |
| Bandeja de salida de correos | cada minuto | Envía los correos pendientes                                                                                                          |

**Correos con bandeja de salida (patrón _outbox_)**: el documento se guarda
primero y el correo se encola en la tabla `correo`. Un proceso lo envía aparte
con reintentos de espera creciente (hasta 5) y, si al momento de enviarlo ya no
corresponde (documento anulado, vehículo vendido), lo descarta. Así un fallo del
proveedor de correo nunca revierte ni bloquea una operación. La toma de correos
pendientes usa `FOR UPDATE SKIP LOCKED`, de modo que dos procesos nunca envían el
mismo correo.

### 4.8 Documentos PDF e imágenes

- **PDFs** (cotización, reserva, tasación, consignación y comprobante de venta)
  generados en el servidor con `@react-pdf/renderer` tras emitir el documento,
  guardados como archivo privado y adjuntados a los correos.
- **Correos** construidos con plantillas `react-email` y enviados con Resend; el
  remitente muestra el nombre de la automotora y las respuestas van a su correo.
- **Fotos**: se aceptan JPG, PNG, WebP, HEIC/HEIF (iPhone) y AVIF. Con `sharp`
  se enderezan según su orientación EXIF, se acota su lado mayor (2000 px
  vehículos, 2400 px banner, 512 px logo), se eliminan los metadatos y se
  guardan como WebP. Las fotos HEIC pasan antes por `heic-convert`. En una
  prueba real, un JPG de 2,05 MB quedó en 238 KB.

### 4.9 Panel de gestión (frontend)

- **React 19 + Vite + TypeScript**, enrutado con React Router.
- **TanStack Query** para el estado del servidor: caché, invalidación tras cada
  mutación y actualización automática (por ejemplo, del estado de un correo en
  curso).
- **React Hook Form** para formularios y **Tailwind CSS v4** para estilos, con
  un sistema de diseño propio (tokens de color, tema oscuro, componentes
  propios para listas desplegables y fechas en lugar de los del sistema
  operativo).
- Componentes de interfaz compartidos (tablas con su versión de lista para
  celulares, modales que en el celular se abren como hoja inferior, menús,
  pestañas, avisos _toast_) y animaciones breves y con propósito, que respetan
  la preferencia de movimiento reducido del sistema.
- Cliente HTTP único que maneja cookies, el encabezado CSRF y la renovación
  automática de la sesión.

### 4.10 Sitio público (frontend)

- **Next.js 15 (App Router)** con renderizado en el servidor: Google y las
  vistas previas de redes sociales reciben el HTML completo.
- **Subdominios por automotora** resueltos por _middleware_.
- **SEO**: metadatos por página, URL canónica, datos estructurados schema.org,
  Open Graph, `robots.txt` y `sitemap.xml` dinámico. Solo se indexan las
  vitrinas y la portada; el detalle de vehículos y las búsquedas llevan
  `noindex, follow`.
- **Server Actions** para el formulario de contacto y la baja de recordatorios
  (la petición va del servidor de Next.js a la API, sin exponer CORS).
- CSS propio, sin framework, con tema claro y oscuro y diseño adaptable.

### 4.11 Calidad y pruebas

- **163 pruebas automatizadas** con Jest sobre los Services con lógica de
  negocio no trivial (con Repositories simulados), más pruebas de funciones
  puras (fechas, liquidación de consignaciones, validaciones, conversión de
  imágenes).
- **TypeScript estricto** en todo el monorepo, **ESLint** y **Prettier**
  compartidos.
- **Commits convencionales** (`feat:`, `fix:`, `refactor:`) en español.
- Script de **datos de demostración** (`seed`) que usa los Services reales (así
  respeta folios, bitácora y auditoría): una automotora con dos sucursales,
  usuarios de cada rol, clientes y vehículos en todos los estados.

---

## 5. Tecnologías utilizadas

### Backend (API)

| Tecnología                              | Uso en el proyecto                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| **Node.js 20 + TypeScript**             | Entorno de ejecución y lenguaje de todo el proyecto                                 |
| **NestJS 10**                           | Framework de la API: módulos, inyección de dependencias, _guards_, _pipes_, filtros |
| **PostgreSQL 16**                       | Base de datos relacional                                                            |
| **pg (node-postgres)**                  | Driver de PostgreSQL; consultas SQL parametrizadas, sin ORM                         |
| **node-pg-migrate**                     | Migraciones de esquema (a partir del primer despliegue)                             |
| **class-validator / class-transformer** | Validación y normalización de los datos de entrada (DTOs)                           |
| **Zod**                                 | Validación de variables de entorno y esquemas compartidos                           |
| **argon2**                              | _Hash_ de contraseñas                                                               |
| **@nestjs/jwt**                         | Tokens de sesión (JWT)                                                              |
| **@nestjs/throttler**                   | Límite de peticiones por IP                                                         |
| **helmet / cookie-parser**              | Cabeceras de seguridad y lectura de cookies                                         |
| **@nestjs/schedule**                    | Tareas programadas (vencimientos, avisos, correos)                                  |
| **@react-pdf/renderer**                 | Generación de los PDF de documentos comerciales                                     |
| **Resend + react-email**                | Envío de correos y sus plantillas                                                   |
| **sharp + heic-convert**                | Conversión y optimización de fotos a WebP (incluido HEIC de iPhone)                 |
| **Jest + ts-jest**                      | Pruebas automatizadas                                                               |

### Panel de gestión

| Tecnología            | Uso en el proyecto                       |
| --------------------- | ---------------------------------------- |
| **React 19**          | Interfaz de usuario                      |
| **Vite 6**            | Servidor de desarrollo y empaquetado     |
| **React Router 7**    | Navegación entre pantallas               |
| **TanStack Query 5**  | Datos del servidor, caché e invalidación |
| **React Hook Form 7** | Formularios y su validación              |
| **Tailwind CSS 4**    | Estilos y sistema de diseño              |
| **Lucide**            | Íconos                                   |
| **Geist**             | Tipografía                               |

### Sitio público

| Tecnología                  | Uso en el proyecto                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| **Next.js 15 (App Router)** | Renderizado en el servidor, _middleware_ de subdominios, metadatos, SEO, _Server Actions_ |
| **React 19**                | Componentes                                                                               |
| **CSS propio**              | Estilos, temas claro y oscuro, diseño adaptable                                           |

### Herramientas e infraestructura

| Tecnología                      | Uso en el proyecto                                             |
| ------------------------------- | -------------------------------------------------------------- |
| **Turborepo + pnpm workspaces** | Monorepo: tres aplicaciones y un paquete compartido            |
| **ESLint + Prettier**           | Calidad y formato de código                                    |
| **Docker + Docker Compose**     | Contenedores de producción (y base de datos local)             |
| **Caddy**                       | Proxy inverso, HTTPS automático y entrega de archivos públicos |
| **Cloudflare**                  | DNS y validación del certificado comodín                       |
| **Hetzner Cloud**               | Servidor virtual de producción                                 |
| **GitHub Actions**              | Despliegue continuo                                            |
| **Google Search Console**       | Indexación de las vitrinas (tras el despliegue)                |

---

## 6. Despliegue

> Estado actual: el sistema está **completo y funcionando en el entorno de
> desarrollo**. El despliegue a producción se hará una vez que se cuente con el
> dominio definitivo. Esta sección describe la infraestructura planificada
> (detalle en `docs/03-arquitectura-stack.md`).

### 6.1 Infraestructura

- **Servidor**: un VPS en Hetzner Cloud (plan CPX21: 3 vCPU, 4 GB de RAM),
  suficiente para el alcance del proyecto (una automotora de prueba durante la
  evaluación, con margen para más).
- **Contenedores** orquestados con Docker Compose:

  ```yaml
  services:
    postgres: # PostgreSQL 16 con volumen persistente
    api: # NestJS, puerto interno 4000
    web-publico: # Next.js, puerto interno 3000
    web-gestion: # Panel React compilado (archivos estáticos), puerto interno 3001
    caddy: # proxy inverso + HTTPS + archivos públicos (fotos)
  ```

- **Archivos subidos** (fotos, PDFs, documentos legales, boletas) en un
  **volumen Docker persistente**, independiente del contenedor de la API, para
  no perderlos al reconstruirla. Las fotos públicas las sirve Caddy
  directamente; los documentos privados, solo la API.

### 6.2 Dominios y HTTPS

- **DNS en Cloudflare**, con registros A apuntando a la IP del servidor:
  `dominio.cl`, `*.dominio.cl` (comodín para las vitrinas), `app.dominio.cl`
  (panel) y `api.dominio.cl` (API).
- **Caddy** obtiene y renueva solo los certificados HTTPS. El certificado
  comodín (`*.dominio.cl`) se valida por DNS mediante el plugin de Cloudflare,
  porque ese tipo de certificado no puede emitirse solo por HTTP.
- Las cookies de sesión se comparten entre `app.` y `api.` mediante
  `COOKIE_DOMAIN=.dominio.cl`.

### 6.3 Integración y despliegue continuos

Con GitHub Actions, en cada _push_ a la rama `main`:

1. Se ejecutan las pruebas automatizadas.
2. Si pasan, el _pipeline_ se conecta por SSH al servidor y ejecuta
   `git pull && docker compose up -d --build`.

No se contempla un ambiente intermedio (_staging_), por ser complejidad
innecesaria para este alcance. Las variables de entorno de producción se guardan
como _GitHub Secrets_ y se inyectan en el despliegue; nunca se versionan.

### 6.4 Respaldos

Tarea diaria en el servidor con `pg_dump` comprimido, que conserva los últimos 7
respaldos. Es una red de seguridad ante errores humanos, no un plan de
continuidad ante una falla total de la infraestructura (aceptable para el
alcance del proyecto).

### 6.5 Pasos para la puesta en producción

1. Contratar el dominio definitivo y delegar su DNS a Cloudflare.
2. Crear el VPS e instalar Docker; configurar los registros DNS.
3. Verificar el dominio en **Resend** (registros SPF y DKIM en Cloudflare) para
   que los correos no lleguen a _spam_, y definir `EMAIL_FROM` con una
   dirección del dominio.
4. Configurar las variables de entorno de producción (`DATABASE_URL`,
   `JWT_SECRET`, `APP_URL`, `SITIO_URL`, `CORS_ORIGINS`, `COOKIE_DOMAIN`,
   `RESEND_API_KEY`, `EMAIL_FROM`, `UPLOADS_DIR` y las del sitio público y el
   panel) como _GitHub Secrets_.
5. Crear la base con `schema.sql` (primera migración) y levantar los
   contenedores.
6. Cargar manualmente la automotora de demostración en producción.
7. Verificar el dominio en **Google Search Console** (propiedad de tipo dominio,
   que cubre todos los subdominios) y enviar el `sitemap.xml`.
8. Programar el respaldo diario.

---

## 7. Alcance y decisiones de diseño

Decisiones deliberadas, no omisiones:

- **Sin cobro a las automotoras**: es un proyecto académico; no hay modelo de
  monetización en esta fase.
- **Comprador anónimo**: el visitante del marketplace no se registra ni guarda
  favoritos; contacta por WhatsApp o por el formulario de la vitrina.
- **Roles fijos** (tres), no configurables por la automotora.
- **Carga de inventario manual**, sin importación masiva desde Excel o CSV.
- **Vitrina con diseño estándar** de la plataforma, personalizable con logo,
  banner y descripción.
- **Notificaciones internas solo dentro del sistema**; los correos están
  dirigidos únicamente a los clientes (documentos y recordatorios).
- **Multimedia solo con fotografías** (1 a 30 por vehículo), sin video.
- **Revisión técnica simplificada**: periodicidad anual para todos los
  vehículos, con el mes sugerido según el último dígito de la patente.
- **SEO enfocado en la automotora como empresa**, no en cada vehículo (que es
  efímero: se vende).

### Documentación del repositorio

| Archivo                              | Contenido                                         |
| ------------------------------------ | ------------------------------------------------- |
| `docs/00-vision-general.md`          | Contexto, actores y decisiones de alcance         |
| `docs/01-modulos-funcionales.md`     | Los 18 módulos con todas sus reglas de negocio    |
| `docs/02-modelo-datos.md`            | Razones del diseño del esquema                    |
| `docs/schema.sql`                    | Definición exacta de la base de datos (23 tablas) |
| `docs/03-arquitectura-stack.md`      | Tecnologías y despliegue                          |
| `docs/04-arquitectura-codigo.md`     | Capas, convenciones y pruebas                     |
| `docs/05-seguridad-autenticacion.md` | Seguridad y flujos de autenticación               |
| `docs/06-plan-implementacion.md`     | Orden de construcción, paso a paso                |
