# Arken: Plataforma de Centralización de Automotoras

## 1. ¿Qué es el proyecto?
Arken es una plataforma web multi-empresa diseñada para automotoras pequeñas y medianas, es decir, empresas que compran y venden vehículos usados.

A diferencia de las planillas o de los portales de avisos genéricos, cada automotora que se registra obtiene al mismo tiempo tres cosas: un **sistema de gestión** completo para su negocio, **su propia página web pública** en un subdominio (`nombre-automotora.dominio.cl`) y **presencia en un marketplace común** donde cualquier persona busca autos y motos entre la oferta de todas las automotoras.

El inventario se carga **una sola vez** y desde ahí alimenta los tres canales. La plataforma es **multi-empresa**, porque muchas automotoras comparten la misma instalación y cada una ve solo sus datos, y es **multi-sucursal**, porque una automotora puede operar en varios locales.

| En números | |
| --- | --- |
| Aplicaciones | 3 (API, panel de gestión y sitio público) + 1 paquete compartido |
| Módulos de negocio | 18 |
| Tablas en la base de datos | 23 |
| Roles de usuario | 3 (Admin General, Admin de Sucursal y Vendedor) |
| Pruebas automatizadas de la API | 163 |

---

## 2. Problemática que Resuelve
Las automotoras pequeñas y medianas llevan su negocio en planillas Excel, cuadernos o sistemas armados a medida, y eso les genera problemas concretos:
* **No conocen la utilidad real de cada auto:** los gastos de mecánica, pintura y trámites quedan anotados en otra parte, así que nunca se descuentan del precio de venta.
* **Documentos comerciales hechos a mano:** las cotizaciones y reservas no tienen numeración ordenada ni un respaldo en PDF que el cliente pueda guardar.
* **Sin vista consolidada entre sucursales:** cada local lleva sus registros por separado y el dueño no ve el negocio completo.
* **Dependencia de portales genéricos:** publican auto por auto en sitios de avisos, sin una página propia que muestre su marca.

---

## 3. Pilares de la Solución

```
                     +-----------------------------------------+
                     |        1. SISTEMA DE GESTIÓN            |
                     |   Panel interno con 18 módulos:         |
                     |   inventario, documentos, ventas,       |
                     |   gastos, analítica y auditoría         |
                     +--------------------+--------------------+
                                          |
                          Inventario cargado una sola vez
                                          |
                     +--------------------v--------------------+
                     |        API + PostgreSQL 16 (23 tablas)  |
                     |   Aislamiento por automotora y sucursal |
                     +----------+-------------------+----------+
                                |                   |
                                v                   v
      +---------------------------------+   +---------------------------------+
      |   2. VITRINA DE CADA AUTOMOTORA |   |   3. MARKETPLACE GLOBAL         |
      |   nombre-automotora.dominio.cl  |   |   dominio.cl                    |
      |   Marca propia, sucursales y SEO|   |   Búsqueda anónima entre todas  |
      +---------------------------------+   +---------------------------------+
```

### 1. Sistema de Gestión (panel de la automotora)
* **Inventario de vehículos** con ficha completa, hasta 30 fotos, documentos legales con vencimiento, bitácora de todo lo que le pasó al auto y balance de costo, gastos y margen.
* **Documentos comerciales** (cotizaciones, reservas y tasaciones) con folio correlativo por sucursal y PDF, que llegan solos por correo al cliente, junto con recordatorios automáticos.
* **Ventas por pasos** con formas de pago combinables: efectivo, transferencia, cheque, financiamiento y auto en parte de pago. El sistema verifica que los montos cuadren exactamente con el total.
* **Consignaciones y gastos:** autos que un particular deja para vender, a comisión o con precio neto garantizado, y gastos por vehículo u operacionales con boleta adjunta.
* **Dashboard y analítica** con ingresos, utilidad neta, ticket promedio, días hasta vender, descuento negociado, tasa de cierre de cotizaciones y autos estancados, con sugerencias de acción.
* **Auditoría inmutable** de cada acción relevante, que muestra solo los datos que cambiaron ("antes → después").
* **Tres roles fijos:** el Vendedor gestiona autos, clientes y ventas de su sucursal, pero no ve costos ni márgenes.

### 2. Vitrina Pública de cada Automotora
* Página propia en su subdominio, con logo, foto de portada, descripción, inventario de todas sus sucursales con filtros y un mapa por sucursal.
* Botón de WhatsApp con un mensaje ya escrito sobre el auto, y formulario de contacto protegido contra envíos masivos y bots.
* **SEO enfocado en la automotora como empresa:** título, descripción, datos estructurados `AutoDealer` para Google, vista previa al compartir y un `sitemap.xml` que se actualiza solo.

### 3. Marketplace Global
* Buscador con filtros dinámicos por marca, modelo, tipo (incluidas motos), transmisión, región, comuna, precio, año y kilometraje.
* Acceso 100 % anónimo, sin crear cuenta. Nunca expone datos internos como la patente, los costos o la consignación.
* Detalle del vehículo con galería a pantalla completa y barra fija de WhatsApp en el celular.

---

## 4. Arquitectura y Tecnologías

El proyecto es un monorepo con **Turborepo** y **pnpm workspaces**:

| Aplicación | Tecnología | Responsabilidad |
| --- | --- | --- |
| `apps/api` | NestJS 10 + TypeScript | Lógica de negocio de los 18 módulos, autenticación, tareas programadas, PDFs, correos y archivos |
| `apps/web-gestion` | React 19 + Vite + TanStack Query + Tailwind CSS 4 | Panel interno de gestión, con una sola instancia para todas las automotoras |
| `apps/web-publico` | Next.js 15 (App Router) | Marketplace y vitrinas por subdominio, renderizados en el servidor |
| `packages/shared-types` | TypeScript + Zod | Enums, esquemas y funciones puras compartidas (RUT, patente, liquidaciones, SEO) |

**Decisiones técnicas destacadas:**
* **SQL escrito a mano, sin ORM**, con el driver `pg`: toda consulta va parametrizada y no se concatena ningún valor que venga del usuario.
* **Multi-tenancy de esquema compartido:** `automotoraId` y `sucursalId` se derivan siempre del JWT validado, nunca del cliente, y se aplican en la capa Repository de todos los módulos.
* **Arquitectura en capas** Controller → Service → Repository, con transacciones explícitas en toda operación que toque varias tablas.
* **Folios sin colisiones** mediante *advisory locks* de PostgreSQL, de modo que dos emisiones simultáneas nunca reciben el mismo número.
* **Correos con patrón *outbox*:** un fallo del proveedor de correo nunca revierte ni bloquea una operación.
* **Seguridad:** contraseñas con argon2id, JWT de corta duración con refresh token revocable en cookies `httpOnly`, protección CSRF, límite de peticiones, `helmet` y validación de archivos por firma de bytes.
* **Fotos optimizadas** con `sharp`: se convierten a WebP (incluido HEIC de iPhone), se enderezan, se ajusta su tamaño y se les quitan los metadatos GPS.

**Infraestructura de producción (planificada):** Docker Compose sobre un VPS en Hetzner Cloud, Caddy como proxy inverso con HTTPS automático, Cloudflare para DNS y el certificado comodín, GitHub Actions para el despliegue continuo y respaldo diario con `pg_dump`.

---

## 5. Propuesta de Valor y Diferenciación
Arken lleva a las automotoras pequeñas y medianas una herramienta integral de gestión, analítica y presencia digital que hoy solo tienen las grandes empresas del rubro. Con una sola carga de inventario, la automotora ordena su operación, conoce el margen real de cada vehículo y obtiene, sin diseñar nada, una página propia y visibilidad en un marketplace común.

Todo corre sobre tecnologías de código abierto e infraestructura de bajo costo. Con al menos cinco automotoras, la operación se estima en unos US$11 a 15 al mes, sin licencias costosas ni desarrollos a medida.

---

## 6. Documentación

| Archivo | Contenido |
| --- | --- |
| [`docs/00-vision-general.md`](docs/00-vision-general.md) | Contexto, actores y decisiones de alcance |
| [`docs/01-modulos-funcionales.md`](docs/01-modulos-funcionales.md) | Los 18 módulos con todas sus reglas de negocio |
| [`docs/02-modelo-datos.md`](docs/02-modelo-datos.md) | Razones del diseño del esquema |
| [`docs/schema.sql`](docs/schema.sql) | Definición exacta de la base de datos (23 tablas) |
| [`docs/03-arquitectura-stack.md`](docs/03-arquitectura-stack.md) | Tecnologías y despliegue |
| [`docs/04-arquitectura-codigo.md`](docs/04-arquitectura-codigo.md) | Capas, convenciones y pruebas |
| [`docs/05-seguridad-autenticacion.md`](docs/05-seguridad-autenticacion.md) | Seguridad y flujos de autenticación |
| [`docs/06-plan-implementacion.md`](docs/06-plan-implementacion.md) | Orden de construcción, paso a paso |

---

> Proyecto desarrollado por **Joaquín Cabrera** para la asignatura **PTY4614 Capstone**, Ingeniería en Informática, Duoc UC (2026).
