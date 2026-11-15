-- ============================================================================
-- Plataforma de Centralización de Automotoras — esquema PostgreSQL (sin ORM).
--
-- MULTI-SUCURSAL: ventas, cotizaciones, reservas, gastos y tasaciones guardan
-- su propio sucursal_id al crearse, duplicando a propósito vehiculo.sucursal_id.
-- Un vehículo puede transferirse de sucursal y sus transacciones pasadas deben
-- seguir atribuidas a la sucursal donde ocurrieron (dashboard y analítica).
--
-- Convención: snake_case en tablas y columnas; PKs UUID (gen_random_uuid()).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- ENUMS (tipos nativos de PostgreSQL)
-- ============================================================================

CREATE TYPE rol_usuario AS ENUM ('ADMIN_GENERAL', 'ADMIN_SUCURSAL', 'VENDEDOR');
-- ADMIN_GENERAL: dueño del negocio; gestiona todas las sucursales de su automotora.
-- ADMIN_SUCURSAL: mismos permisos que ADMIN_GENERAL, acotado a su sucursal.
-- VENDEDOR: acotado a su sucursal; no ve costos de adquisición ni márgenes.

CREATE TYPE estado_usuario AS ENUM ('ACTIVO', 'INACTIVO');
CREATE TYPE estado_cliente AS ENUM ('ACTIVO', 'INACTIVO');

CREATE TYPE origen_vehiculo AS ENUM ('COMPRA_DIRECTA', 'CONSIGNACION', 'PARTE_PAGO', 'COMPRA_PARTICULAR');

CREATE TYPE estado_vehiculo AS ENUM (
    'DISPONIBLE',          -- equivalente a "publicado"; van siempre de la mano
    'RESERVADO',
    'EN_PREPARACION',
    'PENDIENTE_REVISION',  -- exclusivo de vehiculos recibidos en parte de pago
    'VENDIDO',
    'DADO_DE_BAJA'         -- reversible
);

CREATE TYPE categoria_vehiculo AS ENUM ('SUV', 'SEDAN', 'HATCHBACK', 'CAMIONETA', 'CAMION', 'MOTO', 'OTRO');
CREATE TYPE traccion_vehiculo AS ENUM ('X4X2', 'X4X4', 'AWD', 'OTRO');
CREATE TYPE combustible_vehiculo AS ENUM ('BENCINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO', 'GAS', 'OTRO');
CREATE TYPE transmision_vehiculo AS ENUM ('MANUAL', 'AUTOMATICA', 'OTRO');

CREATE TYPE tipo_documento_legal AS ENUM ('PERMISO_CIRCULACION', 'REVISION_TECNICA', 'SOAP');
-- Qué respalda el archivo subido. En SOAP, permiso y homologación el
-- vencimiento lo calcula la regla, no lo ingresa el usuario.
CREATE TYPE respaldo_documento_legal AS ENUM (
    'CERTIFICADO_REVISION', 'CERTIFICADO_HOMOLOGACION',   -- revision tecnica
    'POLIZA_SOAP',                                        -- SOAP
    'PERMISO_PAGO_TOTAL', 'PERMISO_PRIMERA_CUOTA'         -- permiso de circulacion
);

-- Gastos de un vehículo (costo directo, entra en su margen) u operacionales
-- (arriendo, sueldos...: se restan del resultado del período).
CREATE TYPE tipo_gasto AS ENUM ('VEHICULO', 'OPERACIONAL');
CREATE TYPE categoria_gasto AS ENUM (
    -- de vehículo
    'MECANICA', 'ESTETICA', 'DOCUMENTACION', 'TRAMITES',
    -- operacionales
    'ARRIENDO', 'SUELDOS_COMISIONES', 'PUBLICIDAD', 'SERVICIOS_BASICOS',
    'MANTENCION_LOCAL', 'CONTABILIDAD_LEGAL', 'IMPUESTOS_PATENTES', 'OTROS'
);
CREATE TYPE estado_gasto AS ENUM ('ACTIVO', 'ANULADO');

-- Trato con el consignante:
--   COMISION_VENTA: la automotora cobra un % del precio final de venta.
--   PRECIO_NETO:    el dueño recibe un monto líquido garantizado; la automotora
--                   se queda con la diferencia entre el precio final y ese neto.
CREATE TYPE tipo_trato_consignacion AS ENUM ('COMISION_VENTA', 'PRECIO_NETO');
CREATE TYPE estado_consignacion AS ENUM ('ACTIVA', 'VENCIDA', 'DEVUELTA', 'VENDIDA');

-- Tasaciones: el cliente acepta o rechaza la oferta de compra.
-- ANULADA: un documento emitido no se edita; se anula (con motivo) y se emite otro.
CREATE TYPE estado_documento_oferta AS ENUM ('VIGENTE', 'ACEPTADA', 'RECHAZADA', 'VENCIDA', 'ANULADA');

-- Cotizaciones: VIGENTE dentro de su plazo, VENCIDA al cumplirlo y CONCRETADA
-- cuando una venta la referencia (venta.cotizacion_id). No cambian a mano.
CREATE TYPE estado_cotizacion AS ENUM ('VIGENTE', 'VENCIDA', 'CONCRETADA', 'ANULADA');

CREATE TYPE estado_reserva AS ENUM ('VIGENTE', 'VENCIDA', 'CONVERTIDA_EN_VENTA', 'CANCELADA');
CREATE TYPE estado_venta AS ENUM ('CONFIRMADA', 'ANULADA');
CREATE TYPE tipo_forma_pago AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'FINANCIAMIENTO', 'PARTE_PAGO');

CREATE TYPE tipo_evento_bitacora AS ENUM (
    'ALTA', 'CAMBIO_PRECIO', 'CAMBIO_ESTADO', 'GASTO_AGREGADO',
    'COTIZACION_GENERADA', 'RESERVA_GENERADA', 'VENTA_CONCRETADA', 'ANULACION',
    'TRANSFERENCIA_SUCURSAL', -- registra el traslado de un vehiculo entre sucursales
    'INSPECCION_FINALIZADA'   -- informe de inspeccion pre-compra finalizado
);
CREATE TYPE tipo_referencia_bitacora AS ENUM ('GASTO', 'COTIZACION', 'RESERVA', 'VENTA', 'INSPECCION');

CREATE TYPE tipo_notificacion AS ENUM (
    'RESERVA_POR_VENCER', 'CONSIGNACION_POR_VENCER', 'DOCUMENTO_LEGAL_POR_VENCER',
    'VEHICULO_POR_REVISAR' -- un vendedor lo envio a revision: un admin lo publica o lo devuelve
);
CREATE TYPE estado_notificacion AS ENUM ('PENDIENTE', 'RESUELTA');
CREATE TYPE tipo_entidad_notificacion AS ENUM ('VEHICULO', 'RESERVA', 'CONSIGNACION');
-- Regiones de Chile (ubicación de cada sucursal y filtro del marketplace).
CREATE TYPE region_chile AS ENUM (
    'ARICA_PARINACOTA', 'TARAPACA', 'ANTOFAGASTA', 'ATACAMA', 'COQUIMBO', 'VALPARAISO',
    'METROPOLITANA', 'OHIGGINS', 'MAULE', 'NUBLE', 'BIOBIO', 'ARAUCANIA', 'LOS_RIOS',
    'LOS_LAGOS', 'AYSEN', 'MAGALLANES'
);
CREATE TYPE tipo_token_accion AS ENUM ('VERIFICACION_EMAIL', 'INVITACION_USUARIO', 'RESET_PASSWORD');

-- Correos automáticos al cliente.
CREATE TYPE tipo_documento_correo AS ENUM ('COTIZACION', 'RESERVA', 'TASACION', 'VENTA', 'CONSIGNACION');
CREATE TYPE tipo_correo AS ENUM (
    'DOCUMENTO',              -- el PDF del documento recien emitido (o un reenvio)
    'SEGUIMIENTO_COTIZACION', -- "el vehiculo sigue disponible"
    'COTIZACION_POR_VENCER',
    'RESERVA_POR_VENCER',
    'TASACION_POR_VENCER'
);
CREATE TYPE estado_correo AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO', 'DESCARTADO');

-- Inspección pre-compra.
CREATE TYPE estado_inspeccion AS ENUM ('BORRADOR', 'FINALIZADA');
CREATE TYPE resultado_inspeccion AS ENUM ('APROBADO', 'APROBADO_CON_OBSERVACIONES', 'NO_APROBADO');
CREATE TYPE evaluacion_inspeccion AS ENUM ('BUENO', 'REGULAR', 'MALO', 'NO_APLICA');

-- ============================================================================
-- GRUPO 1 — NÚCLEO, SUCURSALES, USUARIOS, CLIENTES Y VEHÍCULOS
-- ============================================================================

CREATE TABLE automotora (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre                   TEXT NOT NULL,
    rut                      TEXT NOT NULL,
    subdominio               TEXT NOT NULL UNIQUE, -- fijo, no editable tras el registro

    -- Datos de contacto de la casa matriz. Junto al vehículo se muestran los
    -- de su sucursal.
    direccion                TEXT NOT NULL,
    telefono                 TEXT NOT NULL,
    email                    TEXT NOT NULL,
    logo_url                 TEXT, -- URL publica de la imagen
    banner_url               TEXT, -- URL publica de la imagen
    descripcion              TEXT, -- descripcion breve para el perfil publico

    -- Vigencias por defecto (días); se pueden ajustar caso a caso al emitir.
    dias_validez_cotizacion  INTEGER NOT NULL DEFAULT 15 CHECK (dias_validez_cotizacion BETWEEN 1 AND 365),
    dias_validez_reserva     INTEGER NOT NULL DEFAULT 3 CHECK (dias_validez_reserva BETWEEN 1 AND 365),
    dias_validez_tasacion    INTEGER NOT NULL DEFAULT 15 CHECK (dias_validez_tasacion BETWEEN 1 AND 365),

    -- Correos automáticos al cliente: envío del PDF al emitir, por tipo de documento.
    correo_cotizacion        BOOLEAN NOT NULL DEFAULT true,
    correo_reserva           BOOLEAN NOT NULL DEFAULT true,
    correo_tasacion          BOOLEAN NOT NULL DEFAULT true,
    correo_venta             BOOLEAN NOT NULL DEFAULT true,
    correo_consignacion      BOOLEAN NOT NULL DEFAULT true,
    -- Recordatorios: dias despues de emitir (seguimiento) o antes de vencer. NULL = no se envia.
    dias_seguimiento_cotizacion INTEGER DEFAULT 3 CHECK (dias_seguimiento_cotizacion BETWEEN 1 AND 60),
    dias_aviso_cotizacion    INTEGER DEFAULT 2 CHECK (dias_aviso_cotizacion BETWEEN 1 AND 30),
    dias_aviso_reserva       INTEGER DEFAULT 1 CHECK (dias_aviso_reserva BETWEEN 1 AND 30),
    dias_aviso_tasacion      INTEGER DEFAULT 2 CHECK (dias_aviso_tasacion BETWEEN 1 AND 30),

    -- Simulador de crédito de la ficha pública. Solo referencial: la plataforma
    -- no otorga ni intermedia créditos. Sin tasa no se muestra.
    financiamiento_activo        BOOLEAN NOT NULL DEFAULT false,
    financiamiento_tasa_mensual  NUMERIC(4,2) CHECK (financiamiento_tasa_mensual BETWEEN 0.01 AND 5.00), -- % mensual
    financiamiento_pie_minimo    INTEGER NOT NULL DEFAULT 20 CHECK (financiamiento_pie_minimo BETWEEN 0 AND 80), -- % del precio
    financiamiento_plazo_maximo  INTEGER NOT NULL DEFAULT 48 CHECK (financiamiento_plazo_maximo IN (12, 24, 36, 48, 60)), -- meses
    CHECK (NOT financiamiento_activo OR financiamiento_tasa_mensual IS NOT NULL),

    fecha_registro          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sucursal (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id  UUID NOT NULL REFERENCES automotora(id),

    nombre         TEXT NOT NULL,
    direccion      TEXT NOT NULL,
    -- Ubicación estructurada: el marketplace filtra por región y comuna.
    region         region_chile NOT NULL,
    comuna         TEXT NOT NULL,
    telefono       TEXT NOT NULL,
    encargado      TEXT, -- nombre del encargado/responsable de la sucursal
    horario_atencion TEXT, -- texto libre, se muestra en el perfil publico
    -- Celular para el boton de WhatsApp de sus vehiculos (+569XXXXXXXX); si es NULL se usa telefono.
    whatsapp       TEXT CHECK (whatsapp ~ '^\+569[0-9]{8}$'),
    es_principal   BOOLEAN NOT NULL DEFAULT false, -- true para la creada automaticamente al registrar la automotora
    -- Baja lógica: una sucursal con historial no puede borrarse por las FK.
    -- false = dada de baja.
    activa         BOOLEAN NOT NULL DEFAULT true,

    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sucursal_automotora ON sucursal(automotora_id);

CREATE TABLE usuario (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id     UUID NOT NULL REFERENCES automotora(id),

    -- NULL solo cuando rol = ADMIN_GENERAL. Obligatorio para ADMIN_SUCURSAL y
    -- VENDEDOR (lo asegura el CHECK de más abajo).
    sucursal_id       UUID REFERENCES sucursal(id),

    nombre            TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE, -- usado para login, unico a nivel global
    password_hash     TEXT NOT NULL,
    rol               rol_usuario NOT NULL,
    email_verificado  BOOLEAN NOT NULL DEFAULT false,
    estado            estado_usuario NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Aceptación de los Términos de uso y la Política de privacidad (versión =
    -- fecha de publicación). La registra quien inscribe la automotora.
    terminos_version      TEXT,
    terminos_aceptados_en TIMESTAMPTZ,

    CONSTRAINT chk_usuario_terminos CHECK ((terminos_version IS NULL) = (terminos_aceptados_en IS NULL)),
    CONSTRAINT chk_usuario_sucursal_segun_rol CHECK (
        (rol = 'ADMIN_GENERAL' AND sucursal_id IS NULL) OR
        (rol IN ('ADMIN_SUCURSAL', 'VENDEDOR') AND sucursal_id IS NOT NULL)
    )
);
CREATE INDEX idx_usuario_automotora ON usuario(automotora_id);
CREATE INDEX idx_usuario_sucursal ON usuario(sucursal_id);

-- ============================================================================
-- AUTENTICACIÓN: tokens de un solo uso y sesiones activas
-- ============================================================================

CREATE TABLE token_accion (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id        UUID NOT NULL REFERENCES usuario(id),
    tipo              tipo_token_accion NOT NULL,
    token_hash        TEXT NOT NULL UNIQUE, -- se guarda el HASH del token, nunca el valor enviado por correo
    fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_expiracion  TIMESTAMPTZ NOT NULL, -- ~24h verificacion, ~48h invitacion, ~1h reset_password
    usado             BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_token_accion_usuario ON token_accion(usuario_id, tipo);

CREATE TABLE sesion (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id           UUID NOT NULL REFERENCES usuario(id),
    refresh_token_hash   TEXT NOT NULL UNIQUE, -- se guarda el HASH del refresh token, nunca el valor real
    fecha_creacion       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_expiracion     TIMESTAMPTZ NOT NULL,
    revocada             BOOLEAN NOT NULL DEFAULT false,
    user_agent           TEXT, -- informativo, util para que el usuario vea "sesiones activas"
    ip                   TEXT
);
CREATE INDEX idx_sesion_usuario ON sesion(usuario_id, revocada);

CREATE TABLE cliente (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id  UUID NOT NULL REFERENCES automotora(id),

    nombre         TEXT NOT NULL,
    rut            TEXT NOT NULL,
    telefono       TEXT NOT NULL,
    email          TEXT NOT NULL,
    direccion      TEXT NOT NULL,
    estado         estado_cliente NOT NULL DEFAULT 'ACTIVO',
    -- false = pidió no recibir recordatorios ni seguimientos (enlace de baja del
    -- correo). Los documentos emitidos y el aviso de reserva se envían igual.
    acepta_recordatorios BOOLEAN NOT NULL DEFAULT true,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- El RUT se guarda normalizado ("12345678-K") para que esta restricción funcione.
    UNIQUE (automotora_id, rut) -- no pueden existir 2 clientes con el mismo RUT en la misma automotora
);
CREATE INDEX idx_cliente_automotora ON cliente(automotora_id);

-- vehiculos, ventas y tasaciones se referencian entre sí (vehiculo ->
-- venta_origen / tasacion_origen, venta -> vehiculo, tasacion -> vehiculo).
-- Se crean sin esas FK y se agregan al final con ALTER TABLE.

CREATE TABLE vehiculo (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id        UUID NOT NULL REFERENCES automotora(id),

    -- Sucursal actual del vehículo; cambia al transferirlo. El historial de
    -- ubicaciones está en vehiculo_bitacora (tipo_evento = TRANSFERENCIA_SUCURSAL).
    sucursal_id          UUID NOT NULL REFERENCES sucursal(id),

    -- Datos generales
    marca                TEXT NOT NULL,
    modelo               TEXT NOT NULL,
    anio                 INTEGER NOT NULL CHECK (anio >= 1900),
    version              TEXT,
    kilometraje          INTEGER NOT NULL CHECK (kilometraje >= 0),
    color                TEXT NOT NULL,
    combustible          combustible_vehiculo NOT NULL,
    transmision          transmision_vehiculo NOT NULL,
    cilindrada           TEXT,
    patente              TEXT NOT NULL, -- normalizada: mayusculas, sin espacios ni guiones
    categoria            categoria_vehiculo NOT NULL,
    traccion             traccion_vehiculo, -- NULL solo en motos (no aplica)
    descripcion          TEXT,

    -- Lo que un admin pidió corregir al devolverlo de PENDIENTE_REVISION a
    -- EN_PREPARACION. Se borra al reenviarlo o al publicarlo.
    observacion_revision TEXT,

    -- Comerciales
    precio_venta         NUMERIC(12, 2) NOT NULL CHECK (precio_venta > 0),
    costo_adquisicion    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (costo_adquisicion >= 0),
    -- En vehículos con origen = CONSIGNACION queda en 0: su costo para el margen
    -- es la comisión pactada en consignaciones.

    origen               origen_vehiculo NOT NULL,
    -- Nace EN_PREPARACION y no pasa a DISPONIBLE (publicado) sin al menos 1 foto.
    -- RESERVADO y VENDIDO solo los fijan Reservas y Ventas.
    estado               estado_vehiculo NOT NULL DEFAULT 'EN_PREPARACION',

    -- Origen del vehículo, cuando aplica (FK agregadas más abajo con ALTER TABLE).
    venta_origen_id      UUID,        -- set cuando origen = PARTE_PAGO
    tasacion_origen_id   UUID UNIQUE, -- set cuando origen = COMPRA_PARTICULAR

    -- Fecha de ingreso al inventario (en compra directa, la fecha de compra).
    fecha_ingreso        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Coherencia entre el origen y sus datos asociados.
    CONSTRAINT chk_vehiculo_traccion
        CHECK ((categoria = 'MOTO') = (traccion IS NULL)),
    CONSTRAINT chk_vehiculo_consignacion_sin_costo
        CHECK (origen <> 'CONSIGNACION' OR costo_adquisicion = 0),
    CONSTRAINT chk_vehiculo_parte_pago_con_venta
        CHECK ((origen = 'PARTE_PAGO') = (venta_origen_id IS NOT NULL)),
    CONSTRAINT chk_vehiculo_compra_particular_con_tasacion
        CHECK ((origen = 'COMPRA_PARTICULAR') = (tasacion_origen_id IS NOT NULL))
);
-- Patente única en el inventario activo de cada automotora. No cuentan los
-- vendidos ni los dados de baja: un vehículo que reingresa (parte de pago,
-- reconsignación) es un registro nuevo y el anterior conserva su historial.
CREATE UNIQUE INDEX uq_vehiculo_patente_en_inventario
    ON vehiculo(automotora_id, patente) WHERE estado NOT IN ('VENDIDO', 'DADO_DE_BAJA');
CREATE INDEX idx_vehiculo_automotora_estado ON vehiculo(automotora_id, estado);
CREATE INDEX idx_vehiculo_sucursal ON vehiculo(sucursal_id);
-- Marketplace: consultas sobre el inventario publicado de todas las automotoras.
CREATE INDEX idx_vehiculo_publicados ON vehiculo(sucursal_id, precio_venta) WHERE estado = 'DISPONIBLE';

CREATE TABLE vehiculo_foto (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehiculo_id UUID NOT NULL REFERENCES vehiculo(id) ON DELETE CASCADE,

    url         TEXT NOT NULL,
    orden       INTEGER NOT NULL CHECK (orden BETWEEN 1 AND 30), -- orden = 1 se usa como foto de portada

    -- Diferible: permite reordenar las fotos dentro de una transacción.
    CONSTRAINT uq_vehiculo_foto_orden UNIQUE (vehiculo_id, orden) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX idx_vehiculo_foto_vehiculo ON vehiculo_foto(vehiculo_id);

CREATE TABLE documento_legal_vehiculo (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehiculo_id        UUID NOT NULL REFERENCES vehiculo(id) ON DELETE CASCADE,

    tipo               tipo_documento_legal NOT NULL,
    respaldo           respaldo_documento_legal NOT NULL,
    archivo_url        TEXT NOT NULL,
    fecha_vencimiento  DATE NOT NULL,
    -- Solo para la homologación: desde ella se calcula el vencimiento.
    fecha_primera_inscripcion DATE,
    fecha_carga        TIMESTAMPTZ NOT NULL DEFAULT now(),
    cargado_por        UUID NOT NULL REFERENCES usuario(id),
    vigente            BOOLEAN NOT NULL DEFAULT true, -- solo un registro vigente por vehiculo+tipo; el resto es historial

    CONSTRAINT chk_doclegal_respaldo_segun_tipo CHECK (
        (tipo = 'REVISION_TECNICA' AND respaldo IN ('CERTIFICADO_REVISION', 'CERTIFICADO_HOMOLOGACION')) OR
        (tipo = 'SOAP' AND respaldo = 'POLIZA_SOAP') OR
        (tipo = 'PERMISO_CIRCULACION' AND respaldo IN ('PERMISO_PAGO_TOTAL', 'PERMISO_PRIMERA_CUOTA'))
    ),
    CONSTRAINT chk_doclegal_inscripcion CHECK (
        (respaldo = 'CERTIFICADO_HOMOLOGACION') = (fecha_primera_inscripcion IS NOT NULL)
    )
);
CREATE INDEX idx_doclegal_vehiculo_tipo ON documento_legal_vehiculo(vehiculo_id, tipo);
CREATE UNIQUE INDEX uq_doclegal_vigente
    ON documento_legal_vehiculo(vehiculo_id, tipo) WHERE vigente;

-- Informe de inspección pre-compra: lista de chequeo por secciones. Se llena
-- como BORRADOR y queda fijo al finalizar; las anteriores se conservan. La
-- última FINALIZADA, si está aprobada, se publica en la página del vehículo.
CREATE TABLE inspeccion (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id           UUID NOT NULL REFERENCES automotora(id),
    -- Sucursal donde estaba el vehículo al iniciar la inspección.
    sucursal_id             UUID NOT NULL REFERENCES sucursal(id),
    vehiculo_id             UUID NOT NULL REFERENCES vehiculo(id),

    kilometraje             INTEGER NOT NULL CHECK (kilometraje >= 0), -- al momento de inspeccionar
    observaciones           TEXT, -- generales, publicas

    estado                  estado_inspeccion NOT NULL DEFAULT 'BORRADOR',
    -- Lo decide quien inspecciona (el sistema sugiere uno según los puntos).
    resultado               resultado_inspeccion,

    usuario_id              UUID NOT NULL REFERENCES usuario(id), -- quien la inicio
    fecha_creacion          TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_finalizacion_id UUID REFERENCES usuario(id),
    fecha_finalizacion      TIMESTAMPTZ,

    CONSTRAINT chk_inspeccion_finalizada CHECK (
        (estado = 'FINALIZADA') =
        (resultado IS NOT NULL AND fecha_finalizacion IS NOT NULL AND usuario_finalizacion_id IS NOT NULL)
    )
);
-- A lo sumo un borrador por vehículo.
CREATE UNIQUE INDEX uq_inspeccion_borrador_por_vehiculo
    ON inspeccion(vehiculo_id) WHERE estado = 'BORRADOR';
CREATE INDEX idx_inspeccion_vehiculo ON inspeccion(vehiculo_id, fecha_finalizacion);

CREATE TABLE inspeccion_punto (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspeccion_id  UUID NOT NULL REFERENCES inspeccion(id) ON DELETE CASCADE,

    seccion        TEXT NOT NULL, -- codigo de la seccion (lista en shared-types)
    -- Código del punto de la lista estándar; NULL = punto agregado en esta inspección.
    codigo         TEXT,
    nombre         TEXT NOT NULL,
    orden          INTEGER NOT NULL,

    evaluacion     evaluacion_inspeccion, -- NULL = aun sin evaluar (borrador)
    observacion    TEXT, -- publica
    nota_interna   TEXT, -- nunca se publica

    UNIQUE (inspeccion_id, codigo)
);
CREATE INDEX idx_inspeccion_punto_inspeccion ON inspeccion_punto(inspeccion_id);

CREATE TABLE inspeccion_foto (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id        UUID NOT NULL REFERENCES inspeccion_punto(id) ON DELETE CASCADE,
    url             TEXT NOT NULL, -- foto publica (webp)
    fecha_carga     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inspeccion_foto_punto ON inspeccion_foto(punto_id);

-- ============================================================================
-- GASTOS Y CONSIGNACIONES
-- ============================================================================

CREATE TABLE gasto (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id         UUID NOT NULL REFERENCES automotora(id),
    -- Correlativo por automotora (los gastos generales no tienen sucursal).
    -- Se asigna al crear, con lock por automotora.
    numero                INTEGER NOT NULL,
    tipo                  tipo_gasto NOT NULL DEFAULT 'VEHICULO',

    -- Solo en gastos de VEHICULO. No se permite si vehiculo.origen = 'CONSIGNACION'
    -- (lo valida el Service).
    vehiculo_id           UUID REFERENCES vehiculo(id),

    -- Sucursal fijada al crear el gasto. En un gasto OPERACIONAL, NULL = gasto
    -- general de la automotora (solo cuenta en la vista consolidada).
    sucursal_id           UUID REFERENCES sucursal(id),

    categoria             categoria_gasto NOT NULL,
    monto                 NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
    fecha                 DATE NOT NULL, -- fecha en que se incurrio el gasto
    comentario            TEXT,
    archivo_adjunto_url   TEXT, -- clave de archivo privado (boleta), no una URL publica
    estado                estado_gasto NOT NULL DEFAULT 'ACTIVO',

    usuario_id            UUID NOT NULL REFERENCES usuario(id), -- solo ADMIN_GENERAL / ADMIN_SUCURSAL pueden crear/editar
    fecha_creacion        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_gasto_tipo CHECK (
        (tipo = 'VEHICULO' AND vehiculo_id IS NOT NULL AND sucursal_id IS NOT NULL
            AND categoria IN ('MECANICA', 'ESTETICA', 'DOCUMENTACION', 'TRAMITES'))
     OR (tipo = 'OPERACIONAL' AND vehiculo_id IS NULL
            AND categoria NOT IN ('MECANICA', 'ESTETICA', 'DOCUMENTACION', 'TRAMITES'))
    ),
    UNIQUE (automotora_id, numero)
);
CREATE INDEX idx_gasto_vehiculo ON gasto(vehiculo_id);
CREATE INDEX idx_gasto_automotora_fecha ON gasto(automotora_id, fecha);
CREATE INDEX idx_gasto_sucursal_fecha ON gasto(sucursal_id, fecha);
CREATE INDEX idx_gasto_sucursal ON gasto(sucursal_id);

CREATE TABLE consignacion (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id   UUID NOT NULL REFERENCES automotora(id),
    folio           INTEGER NOT NULL,

    -- Sucursal fijada al registrar la consignación (el folio es de la automotora).
    sucursal_id     UUID NOT NULL REFERENCES sucursal(id),

    vehiculo_id     UUID NOT NULL UNIQUE REFERENCES vehiculo(id), -- relacion 1:1
    cliente_id      UUID NOT NULL REFERENCES cliente(id), -- consignante (dueño del vehiculo)

    -- Condiciones del trato: modificables durante la vigencia.
    tipo_trato          tipo_trato_consignacion NOT NULL,
    -- 6 decimales: una comisión pactada en pesos se convierte a % sin perder el monto.
    porcentaje_comision NUMERIC(9, 6),  -- solo COMISION_VENTA
    monto_neto          NUMERIC(12, 2), -- solo PRECIO_NETO: lo que recibe el dueño
    precio_minimo       NUMERIC(12, 2) NOT NULL CHECK (precio_minimo > 0), -- en PRECIO_NETO, >= monto_neto

    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    estado          estado_consignacion NOT NULL DEFAULT 'ACTIVA',

    usuario_id      UUID NOT NULL REFERENCES usuario(id),
    pdf_url         TEXT,
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_consignacion_trato CHECK (
        (tipo_trato = 'COMISION_VENTA' AND porcentaje_comision > 0 AND porcentaje_comision <= 100
            AND monto_neto IS NULL)
     OR (tipo_trato = 'PRECIO_NETO' AND monto_neto > 0 AND porcentaje_comision IS NULL
            AND precio_minimo >= monto_neto)
    ),
    CONSTRAINT chk_consignacion_fechas CHECK (fecha_fin >= fecha_inicio),
    UNIQUE (automotora_id, folio) -- correlativo de toda la automotora (compartido entre sucursales)
);
CREATE INDEX idx_consignacion_cliente ON consignacion(cliente_id);
CREATE INDEX idx_consignacion_automotora ON consignacion(automotora_id);

-- ============================================================================
-- GRUPO 2 — DOCUMENTOS COMERCIALES Y VENTAS
-- ============================================================================

CREATE TABLE cotizacion (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id      UUID NOT NULL REFERENCES automotora(id),
    folio              INTEGER NOT NULL,

    -- Sucursal fijada al emitir el documento.
    sucursal_id        UUID NOT NULL REFERENCES sucursal(id),

    cliente_id         UUID NOT NULL REFERENCES cliente(id),
    vehiculo_id        UUID NOT NULL REFERENCES vehiculo(id),

    precio_cotizado    NUMERIC(12, 2) NOT NULL CHECK (precio_cotizado > 0),
    vigencia_dias      INTEGER NOT NULL CHECK (vigencia_dias > 0),
    fecha_emision      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_vencimiento  DATE NOT NULL,
    estado             estado_cotizacion NOT NULL DEFAULT 'VIGENTE',

    usuario_id         UUID NOT NULL REFERENCES usuario(id),
    pdf_url            TEXT, -- clave del PDF privado, generado al emitir

    -- Anulación: motivo obligatorio.
    motivo_anulacion       TEXT,
    fecha_anulacion        TIMESTAMPTZ,
    usuario_anulacion_id   UUID REFERENCES usuario(id),

    CONSTRAINT chk_cotizacion_anulacion CHECK ((estado = 'ANULADA') = (motivo_anulacion IS NOT NULL)),
    UNIQUE (automotora_id, folio) -- correlativo de toda la automotora (compartido entre sucursales)
);
CREATE INDEX idx_cotizacion_vehiculo ON cotizacion(vehiculo_id);
CREATE INDEX idx_cotizacion_cliente ON cotizacion(cliente_id);
CREATE INDEX idx_cotizacion_automotora ON cotizacion(automotora_id);

CREATE TABLE cotizacion_costo (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id  UUID NOT NULL REFERENCES cotizacion(id) ON DELETE CASCADE,

    -- Adicionales (p. ej. traspaso, o $0 para algo de regalo): suman al total a
    -- pagar, nunca al margen.
    descripcion    TEXT NOT NULL,
    monto          NUMERIC(12, 2) NOT NULL CHECK (monto >= 0)
);
CREATE INDEX idx_cotizacion_costo_cotizacion ON cotizacion_costo(cotizacion_id);

CREATE TABLE reserva (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id            UUID NOT NULL REFERENCES automotora(id),
    folio                    INTEGER NOT NULL,

    -- Sucursal fijada al emitir el documento.
    sucursal_id              UUID NOT NULL REFERENCES sucursal(id),

    cliente_id               UUID NOT NULL REFERENCES cliente(id),
    vehiculo_id              UUID NOT NULL REFERENCES vehiculo(id),

    monto_reserva            NUMERIC(12, 2) NOT NULL CHECK (monto_reserva > 0),
    condiciones_devolucion   TEXT,
    fecha_emision            TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_vencimiento        DATE NOT NULL,
    -- VENCIDA: pasó el plazo y el vehículo sigue RESERVADO hasta que un admin la
    -- extienda (vuelve a VIGENTE) o la cancele (CANCELADA).
    estado                   estado_reserva NOT NULL DEFAULT 'VIGENTE',

    -- Estado del vehículo al reservarse: se restaura al cancelar la reserva.
    estado_vehiculo_previo   estado_vehiculo NOT NULL,

    usuario_id               UUID NOT NULL REFERENCES usuario(id),
    pdf_url                  TEXT, -- clave del PDF privado, generado al emitir

    -- Cancelación: solo admins, motivo obligatorio.
    motivo_cancelacion       TEXT,
    fecha_cancelacion        TIMESTAMPTZ,
    usuario_cancelacion_id   UUID REFERENCES usuario(id),
    -- Al cancelar: true = la seña se retiene y cuenta como ingreso (en
    -- fecha_cancelacion); false = se devuelve. Siempre true si se anula su venta.
    sena_retenida            BOOLEAN,

    CONSTRAINT chk_reserva_cancelacion CHECK ((estado = 'CANCELADA') = (motivo_cancelacion IS NOT NULL)),
    CONSTRAINT chk_reserva_sena CHECK ((estado = 'CANCELADA') = (sena_retenida IS NOT NULL)),
    CONSTRAINT chk_reserva_estado_previo
        CHECK (estado_vehiculo_previo IN ('DISPONIBLE', 'EN_PREPARACION', 'PENDIENTE_REVISION')),
    UNIQUE (automotora_id, folio) -- correlativo de toda la automotora (compartido entre sucursales)
);
-- Un vehículo tiene a lo sumo una reserva activa (vigente o vencida sin resolver).
CREATE UNIQUE INDEX uq_reserva_activa_por_vehiculo
    ON reserva(vehiculo_id) WHERE estado IN ('VIGENTE', 'VENCIDA');
CREATE INDEX idx_reserva_vehiculo ON reserva(vehiculo_id);
CREATE INDEX idx_reserva_cliente ON reserva(cliente_id);
CREATE INDEX idx_reserva_automotora ON reserva(automotora_id);

CREATE TABLE tasacion (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id      UUID NOT NULL REFERENCES automotora(id),
    folio              INTEGER NOT NULL,

    -- Sucursal fijada al emitir. La tasación no tiene un vehículo propio del cual
    -- derivarla (el auto aún es del cliente): este campo es su única fuente.
    sucursal_id        UUID NOT NULL REFERENCES sucursal(id),

    cliente_id         UUID NOT NULL REFERENCES cliente(id), -- persona que ofrece vender su vehiculo

    -- Datos del vehículo del cliente (no es un registro de vehiculos).
    patente            TEXT NOT NULL, -- normalizada; debe coincidir con la del vehiculo si se compra
    marca              TEXT NOT NULL,
    modelo             TEXT NOT NULL,
    version            TEXT,
    anio               INTEGER NOT NULL CHECK (anio >= 1900),
    kilometraje        INTEGER NOT NULL CHECK (kilometraje >= 0),
    estado_general     TEXT NOT NULL,

    oferta_monto       NUMERIC(12, 2) NOT NULL CHECK (oferta_monto > 0),
    fecha_emision      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_vencimiento  DATE NOT NULL,
    estado             estado_documento_oferta NOT NULL DEFAULT 'VIGENTE',
    -- No genera notificaciones de vencimiento.

    usuario_id         UUID NOT NULL REFERENCES usuario(id),
    pdf_url            TEXT, -- clave del PDF privado, generado al emitir

    -- Anulación: motivo obligatorio.
    motivo_anulacion       TEXT,
    fecha_anulacion        TIMESTAMPTZ,
    usuario_anulacion_id   UUID REFERENCES usuario(id),

    -- Si se acepta, se crea a mano un vehículo con origen COMPRA_PARTICULAR que
    -- la referencia en vehiculo.tasacion_origen_id.

    CONSTRAINT chk_tasacion_anulacion CHECK ((estado = 'ANULADA') = (motivo_anulacion IS NOT NULL)),
    UNIQUE (automotora_id, folio) -- correlativo de toda la automotora (compartido entre sucursales)
);
CREATE INDEX idx_tasacion_cliente ON tasacion(cliente_id);
CREATE INDEX idx_tasacion_automotora ON tasacion(automotora_id);

CREATE TABLE venta (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id        UUID NOT NULL REFERENCES automotora(id),
    folio                INTEGER NOT NULL,

    -- Sucursal fijada al cerrar la venta.
    sucursal_id          UUID NOT NULL REFERENCES sucursal(id),

    vehiculo_id          UUID NOT NULL REFERENCES vehiculo(id),
    cliente_id           UUID NOT NULL REFERENCES cliente(id),
    reserva_id           UUID UNIQUE REFERENCES reserva(id), -- si proviene de una reserva previa
    cotizacion_id        UUID REFERENCES cotizacion(id),    -- si concreta una cotización (queda CONCRETADA)

    precio_venta_final   NUMERIC(12, 2) NOT NULL CHECK (precio_venta_final > 0),
    fecha_venta          TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado               estado_venta NOT NULL DEFAULT 'CONFIRMADA',

    -- Anulación: solo admins, motivo obligatorio.
    motivo_anulacion     TEXT,
    fecha_anulacion      TIMESTAMPTZ,
    usuario_anulacion_id UUID REFERENCES usuario(id),

    usuario_id           UUID NOT NULL REFERENCES usuario(id), -- ADMIN_GENERAL, ADMIN_SUCURSAL o VENDEDOR
    pdf_url              TEXT,

    CONSTRAINT chk_venta_anulacion CHECK ((estado = 'ANULADA') = (motivo_anulacion IS NOT NULL)),
    UNIQUE (automotora_id, folio) -- correlativo de toda la automotora (compartido entre sucursales)
);
CREATE INDEX idx_venta_vehiculo ON venta(vehiculo_id);
CREATE INDEX idx_venta_cliente ON venta(cliente_id);
CREATE INDEX idx_venta_automotora_fecha ON venta(automotora_id, fecha_venta);
CREATE INDEX idx_venta_sucursal_fecha ON venta(sucursal_id, fecha_venta);
-- Un vehículo tiene a lo sumo una venta confirmada (las anuladas quedan como historial).
CREATE UNIQUE INDEX uq_venta_confirmada_por_vehiculo ON venta(vehiculo_id) WHERE estado = 'CONFIRMADA';
-- Una cotización la concreta a lo sumo una venta confirmada (si se anula, puede volver a concretarse).
CREATE UNIQUE INDEX uq_venta_confirmada_por_cotizacion ON venta(cotizacion_id) WHERE estado = 'CONFIRMADA';
CREATE INDEX idx_venta_automotora ON venta(automotora_id);

CREATE TABLE venta_costo (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id     UUID NOT NULL REFERENCES venta(id) ON DELETE CASCADE,

    descripcion  TEXT NOT NULL,
    monto        NUMERIC(12, 2) NOT NULL CHECK (monto >= 0)
    -- Adicionales (p. ej. traspaso; $0 = algo de regalo): suman al total que paga
    -- el cliente y al cuadre de formas de pago, pero nunca al margen, dashboard ni
    -- analítica: la automotora solo los traspasa.
);
CREATE INDEX idx_venta_costo_venta ON venta_costo(venta_id);

CREATE TABLE venta_forma_pago (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id              UUID NOT NULL REFERENCES venta(id) ON DELETE CASCADE,

    tipo                  tipo_forma_pago NOT NULL,
    monto                 NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
    -- La suma de montos de una venta debe cuadrar con precio_venta_final +
    -- adicionales (venta_costos), menos la seña de la reserva si la hay
    -- (lo valida el Service antes de confirmar).

    vehiculo_recibido_id  UUID UNIQUE REFERENCES vehiculo(id), -- solo si tipo = 'PARTE_PAGO'

    CONSTRAINT chk_forma_pago_parte_pago CHECK ((tipo = 'PARTE_PAGO') = (vehiculo_recibido_id IS NOT NULL))
);
CREATE INDEX idx_venta_forma_pago_venta ON venta_forma_pago(venta_id);

-- ---- FKs circulares pendientes (vehiculos <-> ventas, vehiculos <-> tasaciones) ----
ALTER TABLE vehiculo
    ADD CONSTRAINT fk_vehiculo_venta_origen FOREIGN KEY (venta_origen_id) REFERENCES venta(id),
    ADD CONSTRAINT fk_vehiculo_tasacion_origen FOREIGN KEY (tasacion_origen_id) REFERENCES tasacion(id);

-- ============================================================================
-- GRUPO 3 — ENTIDADES TRANSVERSALES
-- ============================================================================

CREATE TABLE vehiculo_bitacora (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehiculo_id      UUID NOT NULL REFERENCES vehiculo(id),

    tipo_evento      tipo_evento_bitacora NOT NULL,
    descripcion      TEXT NOT NULL,
    fecha            TIMESTAMPTZ NOT NULL DEFAULT now(),

    usuario_id       UUID NOT NULL REFERENCES usuario(id),

    -- Referencia polimórfica al registro que originó el evento (gasto, cotización,
    -- reserva o venta). En TRANSFERENCIA_SUCURSAL queda nula y el detalle va en
    -- descripcion. Las tasaciones no aparecen aquí.
    referencia_tipo  tipo_referencia_bitacora,
    referencia_id    UUID
);
CREATE INDEX idx_bitacora_vehiculo ON vehiculo_bitacora(vehiculo_id);

CREATE TABLE notificacion (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id     UUID NOT NULL REFERENCES automotora(id),

    -- Sucursal afectada. Solo la ven esa sucursal y el ADMIN_GENERAL. Si agrupa
    -- varios vehículos (permiso/SOAP por vencer), todos son de la misma sucursal.
    sucursal_id       UUID NOT NULL REFERENCES sucursal(id),

    tipo              tipo_notificacion NOT NULL,
    mensaje           TEXT NOT NULL,
    fecha_generacion  TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado            estado_notificacion NOT NULL DEFAULT 'PENDIENTE',
    fecha_resolucion  TIMESTAMPTZ,
    usuario_resolucion_id UUID REFERENCES usuario(id),

    CONSTRAINT chk_notificacion_resolucion CHECK ((estado = 'RESUELTA') = (fecha_resolucion IS NOT NULL))
);
CREATE INDEX idx_notificacion_automotora_estado ON notificacion(automotora_id, estado);
CREATE INDEX idx_notificacion_sucursal_estado ON notificacion(sucursal_id, estado);

CREATE TABLE notificacion_referencia (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notificacion_id  UUID NOT NULL REFERENCES notificacion(id) ON DELETE CASCADE,

    -- Permite agrupar varios vehículos en una notificación (permiso/SOAP por vencer).
    entidad_tipo     tipo_entidad_notificacion NOT NULL,
    entidad_id       UUID NOT NULL,

    -- Identifica el evento avisado para que el cron diario no lo repita:
    --   DOC:<documento_legal_id>                          (renovar = documento nuevo = aviso nuevo)
    --   RESERVA:<reserva_id>:<fecha_vencimiento>          (extender = fecha nueva = aviso nuevo)
    --   CONSIGNACION:<id>:<fecha_fin>:PREVIO | :DIA       (7 días hábiles antes y el mismo día)
    --   REVISION:<vehiculo_id>:<instante>                 (cada envío a revisión)
    clave_evento     TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_notif_referencias_notificacion ON notificacion_referencia(notificacion_id);
CREATE INDEX idx_notif_referencias_entidad ON notificacion_referencia(entidad_tipo, entidad_id);

-- Bandeja de salida de correos al cliente. El documento se guarda primero y el
-- correo se encola: un proceso lo envía (con reintentos) sin bloquear ni
-- revertir la operación. También es el historial visible en el panel.
CREATE TABLE correo (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id    UUID NOT NULL REFERENCES automotora(id),

    -- Documento al que pertenece (sin FK: puede ser de 5 tablas distintas).
    documento_tipo   tipo_documento_correo NOT NULL,
    documento_id     UUID NOT NULL,

    tipo             tipo_correo NOT NULL,
    destinatario     TEXT NOT NULL, -- email del cliente al momento de encolar

    -- Evita repetir un correo automático (NULL en reenvíos manuales):
    --   DOCUMENTO:<documento_id>
    --   SEGUIMIENTO:<cotizacion_id>
    --   AVISO:<documento_id>:<fecha_vencimiento>   (extender = fecha nueva = aviso nuevo)
    clave_evento     TEXT UNIQUE,

    estado           estado_correo NOT NULL DEFAULT 'PENDIENTE',
    intentos         INTEGER NOT NULL DEFAULT 0,
    ultimo_error     TEXT,          -- motivo del ultimo fallo o del descarte
    proveedor_id     TEXT,          -- id que entrega el proveedor (Resend) al aceptarlo

    usuario_id       UUID REFERENCES usuario(id), -- quien lo pidio; NULL = automatico
    fecha_creacion   TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_programada TIMESTAMPTZ NOT NULL DEFAULT now(), -- proximo intento
    fecha_envio      TIMESTAMPTZ,

    CONSTRAINT chk_correo_envio CHECK ((estado = 'ENVIADO') = (fecha_envio IS NOT NULL))
);
CREATE INDEX idx_correo_pendiente ON correo(fecha_programada) WHERE estado = 'PENDIENTE';
CREATE INDEX idx_correo_documento ON correo(documento_tipo, documento_id);

CREATE TABLE auditoria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id   UUID NOT NULL REFERENCES automotora(id),
    usuario_id      UUID NOT NULL REFERENCES usuario(id),

    -- NULL en acciones de toda la automotora (configuración, CRUD de sucursales).
    -- Con valor, ADMIN_SUCURSAL solo ve las de su sucursal; ADMIN_GENERAL ve todas.
    sucursal_id     UUID REFERENCES sucursal(id),

    accion          TEXT NOT NULL,
    entidad_tipo    TEXT NOT NULL,
    entidad_id      UUID NOT NULL,
    valor_anterior  JSONB,
    valor_nuevo     JSONB,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now()

    -- Retención indefinida: no se elimina automáticamente.
);
CREATE INDEX idx_auditoria_automotora_fecha ON auditoria(automotora_id, fecha);
CREATE INDEX idx_auditoria_sucursal_fecha ON auditoria(sucursal_id, fecha);
CREATE INDEX idx_auditoria_entidad ON auditoria(entidad_tipo, entidad_id);

-- Auditoría inmutable: los registros no se modifican ni se borran.
-- (La misma función protege el registro de accesos.)
CREATE FUNCTION auditoria_inmutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'El registro es inmutable: no se permite % sobre %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auditoria_inmutable
    BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();

-- Registro de accesos: seguridad de las cuentas, aparte de la auditoría de
-- negocio. Solo eventos de usuarios existentes (un email desconocido no se
-- guarda). No registra las renovaciones automáticas del token. Lo ve solo el
-- ADMIN_GENERAL.
CREATE TYPE evento_acceso AS ENUM (
    'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT', 'REGISTRO_AUTOMOTORA',
    'EMAIL_VERIFICADO', 'INVITACION_ACEPTADA', 'RESET_SOLICITADO', 'PASSWORD_RESTABLECIDO'
);
CREATE TABLE registro_acceso (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id  UUID NOT NULL REFERENCES automotora(id),
    usuario_id     UUID NOT NULL REFERENCES usuario(id),
    evento         evento_acceso NOT NULL,
    -- Solo en LOGIN_FALLIDO: PASSWORD_INCORRECTA, CUENTA_INACTIVA, EMAIL_SIN_VERIFICAR
    motivo         TEXT,
    ip             TEXT,
    user_agent     TEXT,
    fecha          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_registro_acceso_automotora_fecha ON registro_acceso(automotora_id, fecha);
CREATE INDEX idx_registro_acceso_usuario_fecha ON registro_acceso(usuario_id, fecha);

CREATE TRIGGER trg_registro_acceso_inmutable
    BEFORE UPDATE OR DELETE ON registro_acceso
    FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();
