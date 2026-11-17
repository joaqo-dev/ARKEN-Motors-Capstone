import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export type TipoDocumentoCorreo = 'COTIZACION' | 'RESERVA' | 'TASACION' | 'VENTA' | 'CONSIGNACION';
export type TipoCorreo =
  | 'DOCUMENTO'
  | 'SEGUIMIENTO_COTIZACION'
  | 'COTIZACION_POR_VENCER'
  | 'RESERVA_POR_VENCER'
  | 'TASACION_POR_VENCER';
export type EstadoCorreo = 'PENDIENTE' | 'ENVIADO' | 'FALLIDO' | 'DESCARTADO';

export interface NuevoCorreo {
  automotoraId: string;
  documentoTipo: TipoDocumentoCorreo;
  documentoId: string;
  tipo: TipoCorreo;
  destinatario: string;
  claveEvento: string | null;
  usuarioId: string | null;
}

export interface CorreoRow {
  id: string;
  automotora_id: string;
  documento_tipo: TipoDocumentoCorreo;
  documento_id: string;
  tipo: TipoCorreo;
  destinatario: string;
  estado: EstadoCorreo;
  intentos: number;
  ultimo_error: string | null;
  fecha_creacion: Date;
  fecha_envio: Date | null;
}

export interface CorreoHistorialRow extends CorreoRow {
  usuario_nombre: string | null;
}

// Todo lo que el correo necesita del documento: datos de la automotora y de la
// sucursal del documento (contacto), del cliente, y el estado actual para
// decidir si un recordatorio todavía corresponde.
export interface DocumentoCorreoRow {
  automotora_id: string;
  automotora_nombre: string;
  automotora_email: string;
  // Sucursal que define el acceso (en la consignación, la actual del vehículo).
  scope_sucursal_id: string;
  sucursal_nombre: string;
  sucursal_direccion: string;
  sucursal_comuna: string;
  sucursal_telefono: string;
  sucursal_whatsapp: string | null;
  cliente_id: string;
  cliente_nombre: string;
  cliente_email: string;
  cliente_activo: boolean;
  acepta_recordatorios: boolean;
  folio: number;
  estado: string;
  fecha_vencimiento: string | null;
  vehiculo: string; // "Toyota Corolla 2020"
  patente: string;
  vehiculo_estado: string | null; // null en la tasación (el auto es del cliente)
  monto: string;
  // automotora.correo_<tipo>: envío automático del PDF al emitir.
  envio_automatico: boolean;
}

const COMUNES = `a.id AS automotora_id, a.nombre AS automotora_nombre, a.email AS automotora_email,
  s.nombre AS sucursal_nombre, s.direccion AS sucursal_direccion, s.comuna AS sucursal_comuna,
  s.telefono AS sucursal_telefono, s.whatsapp AS sucursal_whatsapp,
  cl.id AS cliente_id, cl.nombre AS cliente_nombre, cl.email AS cliente_email,
  cl.estado = 'ACTIVO' AS cliente_activo, cl.acepta_recordatorios, d.folio, d.estado::text AS estado`;

const VEHICULO = `v.marca || ' ' || v.modelo || ' ' || v.anio AS vehiculo, v.patente,
  v.estado::text AS vehiculo_estado`;

const JOINS = `JOIN automotora a ON a.id = d.automotora_id
  JOIN sucursal s ON s.id = d.sucursal_id
  JOIN cliente cl ON cl.id = d.cliente_id`;

const CONSULTA_DOCUMENTO: Record<TipoDocumentoCorreo, string> = {
  COTIZACION: `SELECT ${COMUNES}, ${VEHICULO}, d.sucursal_id AS scope_sucursal_id,
      d.fecha_vencimiento, d.precio_cotizado::text AS monto, a.correo_cotizacion AS envio_automatico
    FROM cotizacion d ${JOINS} JOIN vehiculo v ON v.id = d.vehiculo_id WHERE d.id = $1`,
  RESERVA: `SELECT ${COMUNES}, ${VEHICULO}, d.sucursal_id AS scope_sucursal_id,
      d.fecha_vencimiento, d.monto_reserva::text AS monto, a.correo_reserva AS envio_automatico
    FROM reserva d ${JOINS} JOIN vehiculo v ON v.id = d.vehiculo_id WHERE d.id = $1`,
  TASACION: `SELECT ${COMUNES}, d.marca || ' ' || d.modelo || ' ' || d.anio AS vehiculo, d.patente,
      NULL AS vehiculo_estado, d.sucursal_id AS scope_sucursal_id, d.fecha_vencimiento,
      d.oferta_monto::text AS monto, a.correo_tasacion AS envio_automatico
    FROM tasacion d ${JOINS} WHERE d.id = $1`,
  VENTA: `SELECT ${COMUNES}, ${VEHICULO}, d.sucursal_id AS scope_sucursal_id,
      NULL AS fecha_vencimiento, d.precio_venta_final::text AS monto, a.correo_venta AS envio_automatico
    FROM venta d ${JOINS} JOIN vehiculo v ON v.id = d.vehiculo_id WHERE d.id = $1`,
  // La consignación se gestiona desde la sucursal actual del vehículo.
  CONSIGNACION: `SELECT ${COMUNES}, ${VEHICULO}, v.sucursal_id AS scope_sucursal_id,
      d.fecha_fin AS fecha_vencimiento, v.precio_venta::text AS monto,
      a.correo_consignacion AS envio_automatico
    FROM consignacion d ${JOINS} JOIN vehiculo v ON v.id = d.vehiculo_id WHERE d.id = $1`,
};

@Injectable()
export class CorreosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async documento(
    tipo: TipoDocumentoCorreo,
    id: string,
    db: Queryable = this.pool,
  ): Promise<DocumentoCorreoRow | null> {
    const { rows } = await db.query<DocumentoCorreoRow>(CONSULTA_DOCUMENTO[tipo], [id]);
    return rows[0] ?? null;
  }

  // false si el evento ya estaba encolado (clave_evento repetida).
  async encolar(c: NuevoCorreo, db: Queryable = this.pool): Promise<boolean> {
    const { rowCount } = await db.query(
      `INSERT INTO correo
         (automotora_id, documento_tipo, documento_id, tipo, destinatario, clave_evento, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (clave_evento) DO NOTHING`,
      [
        c.automotoraId,
        c.documentoTipo,
        c.documentoId,
        c.tipo,
        c.destinatario,
        c.claveEvento,
        c.usuarioId,
      ],
    );
    return (rowCount ?? 0) > 0;
  }

  // Toma hasta `limite` correos listos para enviar y los "arrienda" por 10
  // minutos (cuenta el intento): si el proceso se cae a mitad de camino, otro
  // los retoma después, y dos procesos nunca toman el mismo.
  async tomarPendientes(limite: number, db: Queryable = this.pool): Promise<CorreoRow[]> {
    const { rows } = await db.query<CorreoRow>(
      `UPDATE correo SET intentos = intentos + 1, fecha_programada = now() + interval '10 minutes'
       WHERE id IN (
         SELECT id FROM correo
         WHERE estado = 'PENDIENTE' AND fecha_programada <= now()
         ORDER BY fecha_programada
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [limite],
    );
    return rows;
  }

  async marcarEnviado(id: string, proveedorId: string | null, db: Queryable = this.pool) {
    await db.query(
      `UPDATE correo SET estado = 'ENVIADO', fecha_envio = now(), proveedor_id = $2, ultimo_error = NULL
       WHERE id = $1`,
      [id, proveedorId],
    );
  }

  async reprogramar(id: string, error: string, minutos: number, db: Queryable = this.pool) {
    await db.query(
      `UPDATE correo SET ultimo_error = $2, fecha_programada = now() + make_interval(mins => $3)
       WHERE id = $1`,
      [id, error, minutos],
    );
  }

  async cerrar(
    id: string,
    estado: 'FALLIDO' | 'DESCARTADO',
    motivo: string,
    db: Queryable = this.pool,
  ) {
    await db.query(`UPDATE correo SET estado = $2, ultimo_error = $3 WHERE id = $1`, [
      id,
      estado,
      motivo,
    ]);
  }

  async historial(
    tipo: TipoDocumentoCorreo,
    id: string,
    db: Queryable = this.pool,
  ): Promise<CorreoHistorialRow[]> {
    const { rows } = await db.query<CorreoHistorialRow>(
      `SELECT c.*, u.nombre AS usuario_nombre
       FROM correo c LEFT JOIN usuario u ON u.id = c.usuario_id
       WHERE c.documento_tipo = $1 AND c.documento_id = $2
       ORDER BY c.fecha_creacion DESC`,
      [tipo, id],
    );
    return rows;
  }

  // ---- Recordatorios (cron diario). Cada INSERT encola los eventos que tocan
  // hoy; clave_evento única evita repetirlos. Devuelven cuántos se encolaron.

  // "El vehículo sigue disponible": N días después de emitir, si todavía falta
  // para el aviso de vencimiento (si coinciden, va solo el aviso).
  async encolarSeguimientosCotizacion(hoy: string, db: Queryable = this.pool): Promise<number> {
    const { rowCount } = await db.query(
      `INSERT INTO correo (automotora_id, documento_tipo, documento_id, tipo, destinatario, clave_evento)
       SELECT d.automotora_id, 'COTIZACION', d.id, 'SEGUIMIENTO_COTIZACION', cl.email, 'SEGUIMIENTO:' || d.id
       FROM cotizacion d
       JOIN automotora a ON a.id = d.automotora_id
       JOIN cliente cl ON cl.id = d.cliente_id
       JOIN vehiculo v ON v.id = d.vehiculo_id
       WHERE d.estado = 'VIGENTE' AND v.estado = 'DISPONIBLE'
         AND cl.estado = 'ACTIVO' AND cl.acepta_recordatorios
         AND a.dias_seguimiento_cotizacion IS NOT NULL
         AND (d.fecha_emision AT TIME ZONE 'America/Santiago')::date + a.dias_seguimiento_cotizacion <= $1::date
         AND $1::date < d.fecha_vencimiento - COALESCE(a.dias_aviso_cotizacion, 0)
       ON CONFLICT (clave_evento) DO NOTHING`,
      [hoy],
    );
    return rowCount ?? 0;
  }

  async encolarAvisosCotizacion(hoy: string, db: Queryable = this.pool): Promise<number> {
    const { rowCount } = await db.query(
      `INSERT INTO correo (automotora_id, documento_tipo, documento_id, tipo, destinatario, clave_evento)
       SELECT d.automotora_id, 'COTIZACION', d.id, 'COTIZACION_POR_VENCER', cl.email,
              'AVISO:' || d.id || ':' || d.fecha_vencimiento
       FROM cotizacion d
       JOIN automotora a ON a.id = d.automotora_id
       JOIN cliente cl ON cl.id = d.cliente_id
       JOIN vehiculo v ON v.id = d.vehiculo_id
       WHERE d.estado = 'VIGENTE' AND v.estado NOT IN ('VENDIDO', 'RESERVADO', 'DADO_DE_BAJA')
         AND cl.estado = 'ACTIVO' AND cl.acepta_recordatorios
         AND a.dias_aviso_cotizacion IS NOT NULL
         AND $1::date BETWEEN d.fecha_vencimiento - a.dias_aviso_cotizacion AND d.fecha_vencimiento
       ON CONFLICT (clave_evento) DO NOTHING`,
      [hoy],
    );
    return rowCount ?? 0;
  }

  // La reserva no respeta la baja de recordatorios: el cliente pagó una seña.
  async encolarAvisosReserva(hoy: string, db: Queryable = this.pool): Promise<number> {
    const { rowCount } = await db.query(
      `INSERT INTO correo (automotora_id, documento_tipo, documento_id, tipo, destinatario, clave_evento)
       SELECT d.automotora_id, 'RESERVA', d.id, 'RESERVA_POR_VENCER', cl.email,
              'AVISO:' || d.id || ':' || d.fecha_vencimiento
       FROM reserva d
       JOIN automotora a ON a.id = d.automotora_id
       JOIN cliente cl ON cl.id = d.cliente_id
       WHERE d.estado = 'VIGENTE' AND cl.estado = 'ACTIVO'
         AND a.dias_aviso_reserva IS NOT NULL
         AND $1::date BETWEEN d.fecha_vencimiento - a.dias_aviso_reserva AND d.fecha_vencimiento
       ON CONFLICT (clave_evento) DO NOTHING`,
      [hoy],
    );
    return rowCount ?? 0;
  }

  async encolarAvisosTasacion(hoy: string, db: Queryable = this.pool): Promise<number> {
    const { rowCount } = await db.query(
      `INSERT INTO correo (automotora_id, documento_tipo, documento_id, tipo, destinatario, clave_evento)
       SELECT d.automotora_id, 'TASACION', d.id, 'TASACION_POR_VENCER', cl.email,
              'AVISO:' || d.id || ':' || d.fecha_vencimiento
       FROM tasacion d
       JOIN automotora a ON a.id = d.automotora_id
       JOIN cliente cl ON cl.id = d.cliente_id
       WHERE d.estado = 'VIGENTE' AND cl.estado = 'ACTIVO' AND cl.acepta_recordatorios
         AND a.dias_aviso_tasacion IS NOT NULL
         AND $1::date BETWEEN d.fecha_vencimiento - a.dias_aviso_tasacion AND d.fecha_vencimiento
       ON CONFLICT (clave_evento) DO NOTHING`,
      [hoy],
    );
    return rowCount ?? 0;
  }

  // ---- Baja de recordatorios (enlace del correo)

  async cliente(
    id: string,
    db: Queryable = this.pool,
  ): Promise<{ nombre: string; automotora: string; acepta_recordatorios: boolean } | null> {
    const { rows } = await db.query(
      `SELECT cl.nombre, a.nombre AS automotora, cl.acepta_recordatorios
       FROM cliente cl JOIN automotora a ON a.id = cl.automotora_id WHERE cl.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async fijarRecordatorios(clienteId: string, acepta: boolean, db: Queryable = this.pool) {
    await db.query('UPDATE cliente SET acepta_recordatorios = $2 WHERE id = $1', [
      clienteId,
      acepta,
    ]);
  }
}
