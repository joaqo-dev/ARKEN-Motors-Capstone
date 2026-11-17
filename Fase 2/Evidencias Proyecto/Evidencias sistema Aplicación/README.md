# Vitriauto — Plataforma de gestión para automotoras

**Vitriauto** es una plataforma web multi-tenant para automotoras. Cada automotora se registra y administra
su negocio desde un **panel de gestión**: inventario de vehículos, clientes,
cotizaciones, reservas, ventas, consignaciones, gastos y reportes, en una o varias
sucursales. Todo vehículo que la automotora publica aparece en su **vitrina pública**
(con subdominio propio) y en un **marketplace** común que cualquier persona puede
recorrer sin cuenta.

---

## Contenido

1. [Qué incluye el sistema](#1-qué-incluye-el-sistema)
2. [Tecnologías](#2-tecnologías)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [Cómo levantar el proyecto en otro computador](#4-cómo-levantar-el-proyecto-en-otro-computador)
5. [Cómo probar el sistema](#5-cómo-probar-el-sistema)
6. [Si algo falla](#6-si-algo-falla)
7. [Comandos útiles](#7-comandos-útiles)

---

## 1. Qué incluye el sistema

El sistema tiene tres partes que corren a la vez:

| Parte                | Dirección local         | Para quién                | Qué hace                                                       |
| -------------------- | ----------------------- | ------------------------- | -------------------------------------------------------------- |
| **Panel de gestión** | <http://localhost:3001> | Personal de la automotora | Administración completa del negocio (requiere iniciar sesión). |
| **Sitio público**    | <http://localhost:3000> | Cualquier visitante       | Marketplace con todos los vehículos publicados y vitrinas.     |
| **API**              | <http://localhost:4000> | Las dos aplicaciones      | Lógica de negocio, base de datos, archivos, PDFs y correos.    |

**Funcionalidades principales del panel:**

- **Inventario:** alta de vehículos (compra, consignación o parte de pago), fotos,
  documentos legales con control de vencimientos, inspección pre-compra, ficha
  imprimible y transferencia entre sucursales.
- **Comercial:** clientes, cotizaciones, reservas con seña, tasaciones y cierre de
  ventas con formas de pago combinables. Cada documento genera su PDF con folio.
- **Consignaciones:** trato por comisión o por precio neto, con liquidación.
- **Finanzas:** gastos por vehículo y operacionales, dashboard y analítica por período
  y sucursal.
- **Administración:** sucursales, usuarios por invitación, configuración de la
  automotora, notificaciones y auditoría.

**Roles:** _Admin General_ (ve toda la automotora), _Admin de Sucursal_ (solo su
sucursal) y _Vendedor_ (su sucursal, sin ver costos ni márgenes).

---

## 2. Tecnologías

| Capa             | Tecnología                                                   |
| ---------------- | ------------------------------------------------------------ |
| API              | NestJS (TypeScript) con SQL parametrizado vía `pg` (sin ORM) |
| Base de datos    | PostgreSQL 16                                                |
| Sitio público    | Next.js (React)                                              |
| Panel de gestión | React + Vite + Tailwind CSS                                  |
| Monorepo         | pnpm + Turborepo                                             |
| Pruebas          | Jest                                                         |
| Producción       | Docker y Caddy en un servidor Linux (carpeta `deploy/`)      |

---

## 3. Estructura del proyecto

```
.
├── apps/
│   ├── api/             API NestJS (src/modules: un módulo por área de negocio)
│   ├── web-gestion/     Panel de gestión (React + Vite)
│   └── web-publico/     Marketplace y vitrinas (Next.js)
├── packages/
│   └── shared-types/    Tipos y reglas compartidas entre la API y los frontends
├── migrations/          Migraciones de la base de datos (base/esquema-inicial.sql
│                        contiene el esquema completo)
├── scripts/             Utilidades (recrear la base local)
├── deploy/              Configuración de producción (Docker, Caddy, respaldos)
└── docker-compose.yml   PostgreSQL local con Docker (opcional)
```

---

## 4. Cómo levantar el proyecto en otro computador

Tiempo estimado: 10 a 15 minutos. Los comandos se ejecutan en una terminal, **dentro de
la carpeta del proyecto** (la que contiene este README).

> En **macOS / Linux** usa la Terminal. En **Windows** usa **PowerShell**. Cuando un
> paso es distinto según el sistema, se indican ambas versiones.

### Paso 1 — Instalar los requisitos

| Programa       | Versión       | Cómo comprobarlo | Dónde conseguirlo                                        |
| -------------- | ------------- | ---------------- | -------------------------------------------------------- |
| **Node.js**    | 20 o superior | `node --version` | <https://nodejs.org> (versión LTS)                       |
| **pnpm**       | 9             | `pnpm --version` | Ver abajo                                                |
| **PostgreSQL** | 16            | `psql --version` | <https://www.postgresql.org/download/> o Docker (paso 2) |

Para tener pnpm, después de instalar Node.js ejecuta:

```bash
corepack enable
```

Si ese comando no existe o falla, instálalo con `npm install -g pnpm@9`. Luego cierra y
vuelve a abrir la terminal y comprueba con `pnpm --version`.

### Paso 2 — Preparar la base de datos

El sistema necesita una base PostgreSQL llamada `vitriauto_dev`. Elige **una** de estas
dos opciones.

#### Opción A — Con Docker (si tienes Docker Desktop instalado y abierto)

```bash
pnpm db:up
```

Esto levanta PostgreSQL 16 con usuario `vitriauto`, contraseña `vitriauto` y la base
`vitriauto_dev` ya creada. Los archivos de configuración del paso 4 ya traen estos
datos, así que no tienes que cambiar nada.

> **Importante:** si además tienes PostgreSQL instalado en el computador y está
> corriendo, ese PostgreSQL ocupa el puerto 5432 y responde en lugar del de Docker
> (verás el error `role "vitriauto" does not exist`). Antes de `pnpm db:up`, detenlo:
>
> - **macOS (Homebrew):** `brew services stop postgresql@16` (o la versión que tengas).
> - **macOS (Postgres.app):** botón _Stop_ en la aplicación.
> - **Windows:** abre _Servicios_, busca `postgresql-x64-…` y elige _Detener_.
>
> O bien, usa directamente la **Opción B** con ese PostgreSQL.

#### Opción B — Con PostgreSQL instalado en el computador

1. Asegúrate de que el servicio de PostgreSQL esté corriendo.
2. Crea la base de datos:

   **macOS (Homebrew o Postgres.app) / Linux:**

   ```bash
   createdb vitriauto_dev
   ```

   **Windows** (usuario `postgres`; te pedirá la contraseña que elegiste al instalar
   PostgreSQL). Si `psql` no se reconoce, ábrelo desde el menú Inicio como
   _SQL Shell (psql)_ o usa pgAdmin para crear la base:

   ```powershell
   psql -U postgres -c "CREATE DATABASE vitriauto_dev"
   ```

3. Anota tu **cadena de conexión**, la vas a usar en el paso 4:

   | Caso                               | Cadena de conexión (`DATABASE_URL`)                              |
   | ---------------------------------- | ---------------------------------------------------------------- |
   | macOS con Homebrew o Postgres.app  | `postgres://TU_USUARIO_DEL_SISTEMA@localhost:5432/vitriauto_dev` |
   | Windows o Linux (usuario postgres) | `postgres://postgres:TU_CONTRASEÑA@localhost:5432/vitriauto_dev` |

   Si la contraseña tiene símbolos como `@`, `#` o `/`, reemplázalos por su código
   (`@` → `%40`, `#` → `%23`, `/` → `%2F`).

### Paso 3 — Instalar las dependencias

```bash
pnpm install
```

Debe terminar sin errores (la primera vez tarda uno o dos minutos).

### Paso 4 — Crear los archivos de configuración

El proyecto necesita **cuatro** archivos de configuración. Cada uno se crea copiando su
ejemplo:

**macOS / Linux:**

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web-gestion/.env.example apps/web-gestion/.env
cp apps/web-publico/.env.example apps/web-publico/.env.local
```

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web-gestion/.env.example apps/web-gestion/.env
Copy-Item apps/web-publico/.env.example apps/web-publico/.env.local
```

Ahora edita **dos** de ellos con cualquier editor de texto:

1. **Clave secreta de la API** (obligatoria). Genera una clave aleatoria:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```

   Copia el resultado y pégalo en `apps/api/.env`, después de `JWT_SECRET=`, sin
   espacios. Queda algo así: `JWT_SECRET=k3J9x...`

2. **Conexión a la base de datos** (solo si usaste la **Opción B** del paso 2). Reemplaza
   el valor de `DATABASE_URL` por tu cadena de conexión en **estos dos archivos**:
   - `.env` (en la raíz del proyecto)
   - `apps/api/.env`

   Debe ser exactamente la misma en ambos.

No cambies nada más. Sin una clave de Resend (`RESEND_API_KEY`) los correos no se
envían: se muestran en la terminal de la API, que es lo esperado para probar.

### Paso 5 — Crear las tablas y cargar los datos de prueba

```bash
pnpm db:migrate
pnpm --filter @vitriauto/api seed
```

El primero crea todas las tablas. El segundo carga dos automotoras de ejemplo con
sucursales, usuarios, vehículos, clientes y movimientos; al terminar muestra un resumen
con las cuentas creadas.

### Paso 6 — Iniciar el sistema

```bash
pnpm dev
```

Este comando inicia las tres partes a la vez. Espera unos segundos hasta que la
terminal muestre los tres servidores listos (puertos 4000, 3000 y 3001) y **deja esa
terminal abierta** mientras uses el sistema. Para detenerlo, presiona `Ctrl + C`.

**Para volver a iniciarlo otro día** basta con `pnpm dev` (si usas Docker, antes
`pnpm db:up`). Los pasos 1 a 5 se hacen una sola vez.

---

## 5. Cómo probar el sistema

### Panel de gestión — <http://localhost:3001>

Inicia sesión con cualquiera de estas cuentas. **Contraseña para todas: `Demo12345`**

| Correo               | Rol               | Qué permite ver                                      |
| -------------------- | ----------------- | ---------------------------------------------------- |
| `admin@demo.cl`      | Admin General     | Toda la automotora _Autos Demo_ (2 sucursales)       |
| `admin.vina@demo.cl` | Admin de Sucursal | Solo la sucursal Viña del Mar de _Autos Demo_        |
| `vendedor@demo.cl`   | Vendedor          | Su sucursal, sin costos, márgenes ni gastos          |
| `admin@motorsur.cl`  | Admin General     | Otra automotora (_Motor Sur_), con sus propios datos |

Se recomienda partir con `admin@demo.cl`, que tiene acceso a todo. Entrar con las otras
cuentas permite comprobar que cada rol ve solo lo que le corresponde y que los datos de
una automotora nunca se mezclan con los de otra.

### Sitio público

| Página                              | Dirección                          |
| ----------------------------------- | ---------------------------------- |
| Marketplace (todas las automotoras) | <http://localhost:3000>            |
| Vitrina de _Autos Demo_             | <http://autos-demo.localhost:3000> |
| Vitrina de _Motor Sur_              | <http://motor-sur.localhost:3000>  |

Las vitrinas usan subdominios de `localhost`. Funcionan en **Chrome, Edge y Firefox**;
Safari no los abre.

### Registrar una automotora nueva

Desde <http://localhost:3001> se puede crear una automotora con "Registrar mi automotora". El correo
de verificación no se envía de verdad: el enlace aparece en la terminal donde corre
`pnpm dev`. Ábrelo en el navegador para activar la cuenta. Lo mismo ocurre con las
invitaciones de usuarios y la recuperación de contraseña.

---

## 6. Si algo falla

| Síntoma                                                    | Causa probable                                                    | Solución                                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| El panel (3001) aparece en blanco                          | Falta `apps/web-gestion/.env`, o se creó con el sistema corriendo | Crear el archivo (paso 4), detener con `Ctrl + C` y volver a ejecutar `pnpm dev`.              |
| El sitio público dice "Falta la variable de entorno…"      | Falta `apps/web-publico/.env.local`                               | Crearlo (paso 4) y reiniciar `pnpm dev`.                                                       |
| La API se detiene al iniciar con un error de configuración | `JWT_SECRET` vacío o `DATABASE_URL` mal escrito                   | Revisar `apps/api/.env` (paso 4).                                                              |
| `ECONNREFUSED ... 5432`                                    | PostgreSQL no está corriendo                                      | Iniciar PostgreSQL o, con Docker, ejecutar `pnpm db:up`.                                       |
| `role "vitriauto" does not exist` (usando Docker)          | Otro PostgreSQL del computador ocupa el puerto 5432               | Detener ese PostgreSQL (ver la nota de la Opción A) o usar la Opción B.                        |
| `password authentication failed`                           | Usuario o contraseña incorrectos en `DATABASE_URL`                | Corregirlos en `.env` y en `apps/api/.env`.                                                    |
| `database "vitriauto_dev" does not exist`                  | No se creó la base                                                | Repetir el paso 2.                                                                             |
| El seed dice que la base ya tiene datos                    | Ya se había cargado antes                                         | No hace falta repetirlo. Para empezar de cero: `pnpm db:reset` (borra todo y recarga la demo). |
| El login no funciona                                       | La API no está corriendo o no se cargaron los datos               | Revisar que la terminal de `pnpm dev` no muestre errores y que el paso 5 haya terminado bien.  |
| `EADDRINUSE` (puerto en uso)                               | Otro programa usa el puerto 3000, 3001 o 4000                     | Cerrar ese programa (o una ejecución anterior de `pnpm dev`) y volver a iniciar.               |
| `pnpm` no se reconoce                                      | pnpm no está instalado o la terminal no se reinició               | Repetir el paso 1 y abrir una terminal nueva.                                                  |
| Las vitrinas (`*.localhost`) no abren                      | Navegador Safari                                                  | Usar Chrome, Edge o Firefox.                                                                   |

---

## 7. Comandos útiles

Se ejecutan desde la carpeta raíz del proyecto.

| Comando                             | Qué hace                                                            |
| ----------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                          | Inicia la API, el sitio público y el panel en modo desarrollo.      |
| `pnpm db:up`                        | Levanta PostgreSQL con Docker.                                      |
| `pnpm db:migrate`                   | Crea las tablas en una base vacía.                                  |
| `pnpm --filter @vitriauto/api seed` | Carga los datos de prueba en una base recién creada.                |
| `pnpm db:reset`                     | Borra la base local, recrea las tablas y vuelve a cargar los datos. |
| `pnpm test`                         | Ejecuta las pruebas automáticas.                                    |
| `pnpm lint && pnpm typecheck`       | Revisa el estilo y los tipos de todo el código.                     |
| `pnpm build`                        | Compila las tres aplicaciones para producción.                      |
