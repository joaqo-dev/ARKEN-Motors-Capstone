CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE rol_usuario AS ENUM ('ADMIN_GENERAL', 'ADMIN_SUCURSAL', 'VENDEDOR');

CREATE TYPE estado_usuario AS ENUM ('ACTIVO', 'INACTIVO');
CREATE TYPE estado_cliente AS ENUM ('ACTIVO', 'INACTIVO');

CREATE TYPE origen_vehiculo AS ENUM ('COMPRA_DIRECTA', 'CONSIGNACION', 'PARTE_PAGO', 'COMPRA_PARTICULAR');

CREATE TYPE estado_vehiculo AS ENUM (
    'DISPONIBLE',
    'RESERVADO',
    'EN_PREPARACION',
    'PENDIENTE_REVISION',
    'VENDIDO',
    'DADO_DE_BAJA'
);

CREATE TYPE categoria_vehiculo AS ENUM ('SUV', 'SEDAN', 'HATCHBACK', 'CAMIONETA', 'CAMION', 'MOTO', 'OTRO');
CREATE TYPE traccion_vehiculo AS ENUM ('X4X2', 'X4X4', 'AWD', 'OTRO');
CREATE TYPE combustible_vehiculo AS ENUM ('BENCINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO', 'GAS', 'OTRO');
CREATE TYPE transmision_vehiculo AS ENUM ('MANUAL', 'AUTOMATICA', 'OTRO');

CREATE TYPE tipo_documento_legal AS ENUM ('PERMISO_CIRCULACION', 'REVISION_TECNICA', 'SOAP');

CREATE TYPE tipo_gasto AS ENUM ('VEHICULO', 'OPERACIONAL');
CREATE TYPE categoria_gasto AS ENUM (
    'MECANICA', 'ESTETICA', 'DOCUMENTACION', 'TRAMITES',
    'ARRIENDO', 'SUELDOS_COMISIONES', 'PUBLICIDAD', 'SERVICIOS_BASICOS',
    'MANTENCION_LOCAL', 'CONTABILIDAD_LEGAL', 'IMPUESTOS_PATENTES', 'OTROS'
);
CREATE TYPE estado_gasto AS ENUM ('ACTIVO', 'ANULADO');

CREATE TYPE tipo_trato_consignacion AS ENUM ('COMISION_VENTA', 'PRECIO_NETO');
CREATE TYPE estado_consignacion AS ENUM ('ACTIVA', 'VENCIDA', 'DEVUELTA', 'VENDIDA');

CREATE TYPE estado_documento_oferta AS ENUM ('VIGENTE', 'ACEPTADA', 'RECHAZADA', 'VENCIDA', 'ANULADA');

CREATE TYPE estado_cotizacion AS ENUM ('VIGENTE', 'VENCIDA', 'CONCRETADA', 'ANULADA');

CREATE TYPE estado_reserva AS ENUM ('VIGENTE', 'VENCIDA', 'CONVERTIDA_EN_VENTA', 'CANCELADA');
CREATE TYPE estado_venta AS ENUM ('CONFIRMADA', 'ANULADA');
CREATE TYPE tipo_forma_pago AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'FINANCIAMIENTO', 'PARTE_PAGO');

CREATE TYPE tipo_evento_bitacora AS ENUM (
    'ALTA', 'CAMBIO_PRECIO', 'CAMBIO_ESTADO', 'GASTO_AGREGADO',
    'COTIZACION_GENERADA', 'RESERVA_GENERADA', 'VENTA_CONCRETADA', 'ANULACION',
    'TRANSFERENCIA_SUCURSAL'
);
CREATE TYPE tipo_referencia_bitacora AS ENUM ('GASTO', 'COTIZACION', 'RESERVA', 'VENTA');

CREATE TYPE tipo_notificacion AS ENUM ('RESERVA_POR_VENCER', 'CONSIGNACION_POR_VENCER', 'DOCUMENTO_LEGAL_POR_VENCER');
CREATE TYPE estado_notificacion AS ENUM ('PENDIENTE', 'RESUELTA');
CREATE TYPE tipo_entidad_notificacion AS ENUM ('VEHICULO', 'RESERVA', 'CONSIGNACION');
CREATE TYPE region_chile AS ENUM (
    'ARICA_PARINACOTA', 'TARAPACA', 'ANTOFAGASTA', 'ATACAMA', 'COQUIMBO', 'VALPARAISO',
    'METROPOLITANA', 'OHIGGINS', 'MAULE', 'NUBLE', 'BIOBIO', 'ARAUCANIA', 'LOS_RIOS',
    'LOS_LAGOS', 'AYSEN', 'MAGALLANES'
);
CREATE TYPE tipo_token_accion AS ENUM ('VERIFICACION_EMAIL', 'INVITACION_USUARIO', 'RESET_PASSWORD');

CREATE TYPE tipo_documento_correo AS ENUM ('COTIZACION', 'RESERVA', 'TASACION', 'VENTA', 'CONSIGNACION');
CREATE TYPE tipo_correo AS ENUM (
    'DOCUMENTO',
    'SEGUIMIENTO_COTIZACION',
    'COTIZACION_POR_VENCER',
    'RESERVA_POR_VENCER',
    'TASACION_POR_VENCER'
);
CREATE TYPE estado_correo AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO', 'DESCARTADO');

CREATE TABLE automotora (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre                   TEXT NOT NULL,
    rut                      TEXT NOT NULL,
    subdominio               TEXT NOT NULL UNIQUE,
    direccion                TEXT NOT NULL,
    telefono                 TEXT NOT NULL,
    email                    TEXT NOT NULL,
    logo_url                 TEXT,
    banner_url               TEXT,
    descripcion              TEXT,
    dias_validez_cotizacion  INTEGER NOT NULL DEFAULT 15 CHECK (dias_validez_cotizacion BETWEEN 1 AND 365),
    dias_validez_reserva     INTEGER NOT NULL DEFAULT 3 CHECK (dias_validez_reserva BETWEEN 1 AND 365),
    dias_validez_tasacion    INTEGER NOT NULL DEFAULT 15 CHECK (dias_validez_tasacion BETWEEN 1 AND 365),
    correo_cotizacion        BOOLEAN NOT NULL DEFAULT true,
    correo_reserva           BOOLEAN NOT NULL DEFAULT true,
    correo_tasacion          BOOLEAN NOT NULL DEFAULT true,
    correo_venta             BOOLEAN NOT NULL DEFAULT true,
    correo_consignacion      BOOLEAN NOT NULL DEFAULT true,
    dias_seguimiento_cotizacion INTEGER DEFAULT 3 CHECK (dias_seguimiento_cotizacion BETWEEN 1 AND 60),
    dias_aviso_cotizacion    INTEGER DEFAULT 2 CHECK (dias_aviso_cotizacion BETWEEN 1 AND 30),
    dias_aviso_reserva       INTEGER DEFAULT 1 CHECK (dias_aviso_reserva BETWEEN 1 AND 30),
    dias_aviso_tasacion      INTEGER DEFAULT 2 CHECK (dias_aviso_tasacion BETWEEN 1 AND 30),
    fecha_registro           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sucursal (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id  UUID NOT NULL REFERENCES automotora(id),
    nombre         TEXT NOT NULL,
    direccion      TEXT NOT NULL,
    region         region_chile NOT NULL,
    comuna         TEXT NOT NULL,
    telefono       TEXT NOT NULL,
    encargado      TEXT,
    horario_atencion TEXT,
    whatsapp       TEXT CHECK (whatsapp ~ '^\+569[0-9]{8}$'),
    es_principal   BOOLEAN NOT NULL DEFAULT false,
    activa         BOOLEAN NOT NULL DEFAULT true,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sucursal_automotora ON sucursal(automotora_id);

CREATE TABLE usuario (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id     UUID NOT NULL REFERENCES automotora(id),
    sucursal_id       UUID REFERENCES sucursal(id),
    nombre            TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE,
    password_hash     TEXT NOT NULL,
    rol               rol_usuario NOT NULL,
    email_verificado  BOOLEAN NOT NULL DEFAULT false,
    estado            estado_usuario NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_usuario_sucursal_segun_rol CHECK (
        (rol = 'ADMIN_GENERAL' AND sucursal_id IS NULL) OR
        (rol IN ('ADMIN_SUCURSAL', 'VENDEDOR') AND sucursal_id IS NOT NULL)
    )
);
CREATE INDEX idx_usuario_automotora ON usuario(automotora_id);
CREATE INDEX idx_usuario_sucursal ON usuario(sucursal_id);

CREATE TABLE token_accion (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id        UUID NOT NULL REFERENCES usuario(id),
    tipo              tipo_token_accion NOT NULL,
    token_hash        TEXT NOT NULL UNIQUE,
    fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_expiracion  TIMESTAMPTZ NOT NULL,
    usado             BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_token_accion_usuario ON token_accion(usuario_id, tipo);

CREATE TABLE sesion (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id           UUID NOT NULL REFERENCES usuario(id),
    refresh_token_hash   TEXT NOT NULL UNIQUE,
    fecha_creacion       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_expiracion     TIMESTAMPTZ NOT NULL,
    revocada             BOOLEAN NOT NULL DEFAULT false,
    user_agent           TEXT,
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
    acepta_recordatorios BOOLEAN NOT NULL DEFAULT true,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (automotora_id, rut)
);
CREATE INDEX idx_cliente_automotora ON cliente(automotora_id);

CREATE TABLE vehiculo (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id        UUID NOT NULL REFERENCES automotora(id),
    sucursal_id          UUID NOT NULL REFERENCES sucursal(id),
    marca                TEXT NOT NULL,
    modelo               TEXT NOT NULL,
    anio                 INTEGER NOT NULL CHECK (anio >= 1900),
    version              TEXT,
    kilometraje          INTEGER NOT NULL CHECK (kilometraje >= 0),
    color                TEXT NOT NULL,
    combustible          combustible_vehiculo NOT NULL,
    transmision          transmision_vehiculo NOT NULL,
    cilindrada           TEXT,
    patente              TEXT NOT NULL,
    categoria            categoria_vehiculo NOT NULL,
    traccion             traccion_vehiculo,
    descripcion          TEXT,
    precio_venta         NUMERIC(12, 2) NOT NULL CHECK (precio_venta > 0),
    costo_adquisicion    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (costo_adquisicion >= 0),
    origen               origen_vehiculo NOT NULL,
    estado               estado_vehiculo NOT NULL DEFAULT 'EN_PREPARACION',
    venta_origen_id      UUID,
    tasacion_origen_id   UUID UNIQUE,
    fecha_ingreso        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_vehiculo_traccion
        CHECK ((categoria = 'MOTO') = (traccion IS NULL)),
    CONSTRAINT chk_vehiculo_consignacion_sin_costo
        CHECK (origen <> 'CONSIGNACION' OR costo_adquisicion = 0),
    CONSTRAINT chk_vehiculo_parte_pago_con_venta
        CHECK ((origen = 'PARTE_PAGO') = (venta_origen_id IS NOT NULL)),
    CONSTRAINT chk_vehiculo_compra_particular_con_tasacion
        CHECK ((origen = 'COMPRA_PARTICULAR') = (tasacion_origen_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_vehiculo_patente_en_inventario
    ON vehiculo(automotora_id, patente) WHERE estado NOT IN ('VENDIDO', 'DADO_DE_BAJA');
CREATE INDEX idx_vehiculo_automotora_estado ON vehiculo(automotora_id, estado);
CREATE INDEX idx_vehiculo_sucursal ON vehiculo(sucursal_id);
CREATE INDEX idx_vehiculo_publicados ON vehiculo(sucursal_id, precio_venta) WHERE estado = 'DISPONIBLE';

CREATE TABLE vehiculo_foto (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehiculo_id UUID NOT NULL REFERENCES vehiculo(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    orden       INTEGER NOT NULL CHECK (orden BETWEEN 1 AND 30),
    CONSTRAINT uq_vehiculo_foto_orden UNIQUE (vehiculo_id, orden) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX idx_vehiculo_foto_vehiculo ON vehiculo_foto(vehiculo_id);

CREATE TABLE documento_legal_vehiculo (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehiculo_id        UUID NOT NULL REFERENCES vehiculo(id) ON DELETE CASCADE,
    tipo               tipo_documento_legal NOT NULL,
    archivo_url        TEXT NOT NULL,
    fecha_vencimiento  DATE NOT NULL,
    fecha_carga        TIMESTAMPTZ NOT NULL DEFAULT now(),
    vigente            BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_doclegal_vehiculo_tipo ON documento_legal_vehiculo(vehiculo_id, tipo);
CREATE UNIQUE INDEX uq_doclegal_vigente
    ON documento_legal_vehiculo(vehiculo_id, tipo) WHERE vigente;

CREATE TABLE gasto (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id         UUID NOT NULL REFERENCES automotora(id),
    numero                INTEGER NOT NULL,
    tipo                  tipo_gasto NOT NULL DEFAULT 'VEHICULO',
    vehiculo_id           UUID REFERENCES vehiculo(id),
    sucursal_id           UUID REFERENCES sucursal(id),
    categoria             categoria_gasto NOT NULL,
    monto                 NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
    fecha                 DATE NOT NULL,
    comentario            TEXT,
    archivo_adjunto_url   TEXT,
    estado                estado_gasto NOT NULL DEFAULT 'ACTIVO',
    usuario_id            UUID NOT NULL REFERENCES usuario(id),
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
    sucursal_id     UUID NOT NULL REFERENCES sucursal(id),
    vehiculo_id     UUID NOT NULL UNIQUE REFERENCES vehiculo(id),
    cliente_id      UUID NOT NULL REFERENCES cliente(id),
    tipo_trato          tipo_trato_consignacion NOT NULL,
    porcentaje_comision NUMERIC(9, 6),
    monto_neto          NUMERIC(12, 2),
    precio_minimo       NUMERIC(12, 2) NOT NULL CHECK (precio_minimo > 0),
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
    UNIQUE (sucursal_id, folio)
);
CREATE INDEX idx_consignacion_cliente ON consignacion(cliente_id);
CREATE INDEX idx_consignacion_automotora ON consignacion(automotora_id);

CREATE TABLE cotizacion (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id      UUID NOT NULL REFERENCES automotora(id),
    folio              INTEGER NOT NULL,
    sucursal_id        UUID NOT NULL REFERENCES sucursal(id),
    cliente_id         UUID NOT NULL REFERENCES cliente(id),
    vehiculo_id        UUID NOT NULL REFERENCES vehiculo(id),
    precio_cotizado    NUMERIC(12, 2) NOT NULL CHECK (precio_cotizado > 0),
    vigencia_dias      INTEGER NOT NULL CHECK (vigencia_dias > 0),
    fecha_emision      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_vencimiento  DATE NOT NULL,
    estado             estado_cotizacion NOT NULL DEFAULT 'VIGENTE',
    usuario_id         UUID NOT NULL REFERENCES usuario(id),
    pdf_url            TEXT,
    motivo_anulacion       TEXT,
    fecha_anulacion        TIMESTAMPTZ,
    usuario_anulacion_id   UUID REFERENCES usuario(id),
    CONSTRAINT chk_cotizacion_anulacion CHECK ((estado = 'ANULADA') = (motivo_anulacion IS NOT NULL)),
    UNIQUE (sucursal_id, folio)
);
CREATE INDEX idx_cotizacion_vehiculo ON cotizacion(vehiculo_id);
CREATE INDEX idx_cotizacion_cliente ON cotizacion(cliente_id);
CREATE INDEX idx_cotizacion_automotora ON cotizacion(automotora_id);

CREATE TABLE cotizacion_costo (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id  UUID NOT NULL REFERENCES cotizacion(id) ON DELETE CASCADE,
    descripcion    TEXT NOT NULL,
    monto          NUMERIC(12, 2) NOT NULL CHECK (monto >= 0)
);
CREATE INDEX idx_cotizacion_costo_cotizacion ON cotizacion_costo(cotizacion_id);

CREATE TABLE reserva (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id            UUID NOT NULL REFERENCES automotora(id),
    folio                    INTEGER NOT NULL,
    sucursal_id              UUID NOT NULL REFERENCES sucursal(id),
    cliente_id               UUID NOT NULL REFERENCES cliente(id),
    vehiculo_id              UUID NOT NULL REFERENCES vehiculo(id),
    monto_reserva            NUMERIC(12, 2) NOT NULL CHECK (monto_reserva > 0),
    condiciones_devolucion   TEXT,
    fecha_emision            TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_vencimiento        DATE NOT NULL,
    estado                   estado_reserva NOT NULL DEFAULT 'VIGENTE',
    estado_vehiculo_previo   estado_vehiculo NOT NULL,
    usuario_id               UUID NOT NULL REFERENCES usuario(id),
    pdf_url                  TEXT,
    motivo_cancelacion       TEXT,
    fecha_cancelacion        TIMESTAMPTZ,
    usuario_cancelacion_id   UUID REFERENCES usuario(id),
    sena_retenida            BOOLEAN,
    CONSTRAINT chk_reserva_cancelacion CHECK ((estado = 'CANCELADA') = (motivo_cancelacion IS NOT NULL)),
    CONSTRAINT chk_reserva_sena CHECK ((estado = 'CANCELADA') = (sena_retenida IS NOT NULL)),
    CONSTRAINT chk_reserva_estado_previo
        CHECK (estado_vehiculo_previo IN ('DISPONIBLE', 'EN_PREPARACION', 'PENDIENTE_REVISION')),
    UNIQUE (sucursal_id, folio)
);
CREATE UNIQUE INDEX uq_reserva_activa_por_vehiculo
    ON reserva(vehiculo_id) WHERE estado IN ('VIGENTE', 'VENCIDA');
CREATE INDEX idx_reserva_vehiculo ON reserva(vehiculo_id);
CREATE INDEX idx_reserva_cliente ON reserva(cliente_id);
CREATE INDEX idx_reserva_automotora ON reserva(automotora_id);

CREATE TABLE tasacion (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id      UUID NOT NULL REFERENCES automotora(id),
    folio              INTEGER NOT NULL,
    sucursal_id        UUID NOT NULL REFERENCES sucursal(id),
    cliente_id         UUID NOT NULL REFERENCES cliente(id),
    patente            TEXT NOT NULL,
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
    usuario_id         UUID NOT NULL REFERENCES usuario(id),
    pdf_url            TEXT,
    motivo_anulacion       TEXT,
    fecha_anulacion        TIMESTAMPTZ,
    usuario_anulacion_id   UUID REFERENCES usuario(id),
    CONSTRAINT chk_tasacion_anulacion CHECK ((estado = 'ANULADA') = (motivo_anulacion IS NOT NULL)),
    UNIQUE (sucursal_id, folio)
);
CREATE INDEX idx_tasacion_cliente ON tasacion(cliente_id);
CREATE INDEX idx_tasacion_automotora ON tasacion(automotora_id);

CREATE TABLE venta (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id        UUID NOT NULL REFERENCES automotora(id),
    folio                INTEGER NOT NULL,
    sucursal_id          UUID NOT NULL REFERENCES sucursal(id),
    vehiculo_id          UUID NOT NULL REFERENCES vehiculo(id),
    cliente_id           UUID NOT NULL REFERENCES cliente(id),
    reserva_id           UUID UNIQUE REFERENCES reserva(id),
    cotizacion_id        UUID REFERENCES cotizacion(id),
    precio_venta_final   NUMERIC(12, 2) NOT NULL CHECK (precio_venta_final > 0),
    fecha_venta          TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado               estado_venta NOT NULL DEFAULT 'CONFIRMADA',
    motivo_anulacion     TEXT,
    fecha_anulacion      TIMESTAMPTZ,
    usuario_anulacion_id UUID REFERENCES usuario(id),
    usuario_id           UUID NOT NULL REFERENCES usuario(id),
    pdf_url              TEXT,
    CONSTRAINT chk_venta_anulacion CHECK ((estado = 'ANULADA') = (motivo_anulacion IS NOT NULL)),
    UNIQUE (sucursal_id, folio)
);
CREATE INDEX idx_venta_vehiculo ON venta(vehiculo_id);
CREATE INDEX idx_venta_cliente ON venta(cliente_id);
CREATE INDEX idx_venta_automotora_fecha ON venta(automotora_id, fecha_venta);
CREATE INDEX idx_venta_sucursal_fecha ON venta(sucursal_id, fecha_venta);
CREATE UNIQUE INDEX uq_venta_confirmada_por_vehiculo ON venta(vehiculo_id) WHERE estado = 'CONFIRMADA';
CREATE UNIQUE INDEX uq_venta_confirmada_por_cotizacion ON venta(cotizacion_id) WHERE estado = 'CONFIRMADA';
CREATE INDEX idx_venta_automotora ON venta(automotora_id);

CREATE TABLE venta_costo (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id     UUID NOT NULL REFERENCES venta(id) ON DELETE CASCADE,
    descripcion  TEXT NOT NULL,
    monto        NUMERIC(12, 2) NOT NULL CHECK (monto >= 0)
);
CREATE INDEX idx_venta_costo_venta ON venta_costo(venta_id);

CREATE TABLE venta_forma_pago (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id              UUID NOT NULL REFERENCES venta(id) ON DELETE CASCADE,
    tipo                  tipo_forma_pago NOT NULL,
    monto                 NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
    vehiculo_recibido_id  UUID UNIQUE REFERENCES vehiculo(id),
    CONSTRAINT chk_forma_pago_parte_pago CHECK ((tipo = 'PARTE_PAGO') = (vehiculo_recibido_id IS NOT NULL))
);
CREATE INDEX idx_venta_forma_pago_venta ON venta_forma_pago(venta_id);

ALTER TABLE vehiculo
    ADD CONSTRAINT fk_vehiculo_venta_origen FOREIGN KEY (venta_origen_id) REFERENCES venta(id),
    ADD CONSTRAINT fk_vehiculo_tasacion_origen FOREIGN KEY (tasacion_origen_id) REFERENCES tasacion(id);

CREATE TABLE vehiculo_bitacora (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehiculo_id      UUID NOT NULL REFERENCES vehiculo(id),
    tipo_evento      tipo_evento_bitacora NOT NULL,
    descripcion      TEXT NOT NULL,
    fecha            TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_id       UUID NOT NULL REFERENCES usuario(id),
    referencia_tipo  tipo_referencia_bitacora,
    referencia_id    UUID
);
CREATE INDEX idx_bitacora_vehiculo ON vehiculo_bitacora(vehiculo_id);

CREATE TABLE notificacion (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id     UUID NOT NULL REFERENCES automotora(id),
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
    entidad_tipo     tipo_entidad_notificacion NOT NULL,
    entidad_id       UUID NOT NULL,
    clave_evento     TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_notif_referencias_notificacion ON notificacion_referencia(notificacion_id);
CREATE INDEX idx_notif_referencias_entidad ON notificacion_referencia(entidad_tipo, entidad_id);

CREATE TABLE correo (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id    UUID NOT NULL REFERENCES automotora(id),
    documento_tipo   tipo_documento_correo NOT NULL,
    documento_id     UUID NOT NULL,
    tipo             tipo_correo NOT NULL,
    destinatario     TEXT NOT NULL,
    clave_evento     TEXT UNIQUE,
    estado           estado_correo NOT NULL DEFAULT 'PENDIENTE',
    intentos         INTEGER NOT NULL DEFAULT 0,
    ultimo_error     TEXT,
    proveedor_id     TEXT,
    usuario_id       UUID REFERENCES usuario(id),
    fecha_creacion   TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_programada TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_envio      TIMESTAMPTZ,
    CONSTRAINT chk_correo_envio CHECK ((estado = 'ENVIADO') = (fecha_envio IS NOT NULL))
);
CREATE INDEX idx_correo_pendiente ON correo(fecha_programada) WHERE estado = 'PENDIENTE';
CREATE INDEX idx_correo_documento ON correo(documento_tipo, documento_id);

CREATE TABLE auditoria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automotora_id   UUID NOT NULL REFERENCES automotora(id),
    usuario_id      UUID NOT NULL REFERENCES usuario(id),
    sucursal_id     UUID REFERENCES sucursal(id),
    accion          TEXT NOT NULL,
    entidad_tipo    TEXT NOT NULL,
    entidad_id      UUID NOT NULL,
    valor_anterior  JSONB,
    valor_nuevo     JSONB,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditoria_automotora_fecha ON auditoria(automotora_id, fecha);
CREATE INDEX idx_auditoria_sucursal_fecha ON auditoria(sucursal_id, fecha);
CREATE INDEX idx_auditoria_entidad ON auditoria(entidad_tipo, entidad_id);

CREATE FUNCTION auditoria_inmutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La auditoria es inmutable: no se permite % sobre auditoria', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auditoria_inmutable
    BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();
