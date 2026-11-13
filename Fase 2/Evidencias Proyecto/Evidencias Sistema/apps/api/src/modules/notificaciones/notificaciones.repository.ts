import { Inject, Injectable } from '@nestjs/common';
import type { TipoDocumentoLegal } from '@vitriauto/shared-types';
import { Pool, PoolClient } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';

export const TIPOS_NOTIFICACION = [
  'RESERVA_POR_VENCER',
  'CONSIGNACION_POR_VENCER',
  'DOCUMENTO_LEGAL_POR_VENCER',
  'VEHICULO_POR_REVISAR',
] as const;
export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];
export type EntidadNotificacion = 'VEHICULO' | 'RESERVA' | 'CONSIGNACION';

// ---- Candidatos (eventos aún no avisados) ----

export interface DocumentoPorVencer {
  documento_id: string;
  tipo: TipoDocumentoLegal;
  fecha_vencimiento: string;
  vehiculo_id: string;
  patente: string;
  descripcion: string;
  automotora_id: string;
  sucursal_id: string;
  sucursal_nombre: string;
}

export interface ReservaPorVencer {
  reserva_id: string;
  folio: number;
  fecha_vencimiento: string;
  patente: string;
  cliente_nombre: string;
  automotora_id: string;
  sucursal_id: string; // sucursal actual del vehículo
}

export interface ConsignacionPorVencer {
  consignacion_id: string;
  folio: number;
  fecha_fin: string;
  patente: string;
  cliente_nombre: string;
  automotora_id: string;
  sucursal_id: string; // sucursal actual del vehículo
}

export interface NuevaNotificacion {
  automotoraId: string;
  sucursalId: string;
  tipo: TipoNotificacion;
  mensaje: string;
  referencias: { entidadTipo: EntidadNotificacion; entidadId: string; claveEvento: string }[];
}

export interface NotificacionRow {
  id: string;
  automotora_id: string;
  sucursal_id: string;
  sucursal_nombre: string;
  tipo: TipoNotificacion;
  mensaje: string;
  fecha_generacion: Date;
  estado: 'PENDIENTE' | 'RESUELTA';
  fecha_resolucion: Date | null;
  usuario_resolucion_id: string | null;
  referencias: { entidad_tipo: EntidadNotificacion; entidad_id: string }[];
}

@Injectable()
export class NotificacionesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // Documentos vigentes de vehículos en inventario que vencen hasta `limite`
  // (incluidos los ya vencidos) y que aún no se avisaron.
  async documentosPorVencer(
    limite: string,
    db: Queryable = this.pool,
  ): Promise<DocumentoPorVencer[]> {
    const { rows } = await db.query<DocumentoPorVencer>(
      `SELECT d.id AS documento_id, d.tipo, d.fecha_vencimiento, v.id AS vehiculo_id, v.patente,
              v.marca || ' ' || v.modelo AS descripcion, v.automotora_id, v.sucursal_id, s.nombre AS sucursal_nombre
       FROM documento_legal_vehiculo d
       JOIN vehiculo v ON v.id = d.vehiculo_id
       JOIN sucursal s ON s.id = v.sucursal_id
       WHERE d.vigente
         AND v.estado NOT IN ('VENDIDO', 'DADO_DE_BAJA')
         AND d.fecha_vencimiento <= $1
         AND NOT EXISTS (SELECT 1 FROM notificacion_referencia r WHERE r.clave_evento = 'DOC:' || d.id)
       ORDER BY v.automotora_id, v.sucursal_id, d.tipo, d.fecha_vencimiento, v.patente`,
      [limite],
    );
    return rows;
  }

  async reservasPorVencer(limite: string, db: Queryable = this.pool): Promise<ReservaPorVencer[]> {
    const { rows } = await db.query<ReservaPorVencer>(
      `SELECT r.id AS reserva_id, r.folio, r.fecha_vencimiento, v.patente, cl.nombre AS cliente_nombre,
              r.automotora_id, v.sucursal_id
       FROM reserva r
       JOIN vehiculo v ON v.id = r.vehiculo_id
       JOIN cliente cl ON cl.id = r.cliente_id
       WHERE r.estado IN ('VIGENTE', 'VENCIDA')
         AND r.fecha_vencimiento <= $1
         AND NOT EXISTS (SELECT 1 FROM notificacion_referencia n
                         WHERE n.clave_evento = 'RESERVA:' || r.id || ':' || r.fecha_vencimiento)`,
      [limite],
    );
    return rows;
  }

  // momento PREVIO: vence entre mañana y `limite`; DIA: vence hoy o ya venció.
  async consignacionesPorVencer(
    hoy: string,
    limite: string,
    momento: 'PREVIO' | 'DIA',
    db: Queryable = this.pool,
  ): Promise<ConsignacionPorVencer[]> {
    const previo = momento === 'PREVIO';
    const rango = previo ? 'c.fecha_fin > $1 AND c.fecha_fin <= $2' : 'c.fecha_fin <= $1';
    const params = previo ? [hoy, limite, momento] : [hoy, momento];
    const pMomento = `$${params.length}`;
    const { rows } = await db.query<ConsignacionPorVencer>(
      `SELECT c.id AS consignacion_id, c.folio, c.fecha_fin, v.patente, cl.nombre AS cliente_nombre,
              c.automotora_id, v.sucursal_id
       FROM consignacion c
       JOIN vehiculo v ON v.id = c.vehiculo_id
       JOIN cliente cl ON cl.id = c.cliente_id
       WHERE c.estado IN ('ACTIVA', 'VENCIDA')
         AND ${rango}
         AND NOT EXISTS (SELECT 1 FROM notificacion_referencia n
                         WHERE n.clave_evento = 'CONSIGNACION:' || c.id || ':' || c.fecha_fin || ':' || ${pMomento})`,
      params,
    );
    return rows;
  }

  async create(data: NuevaNotificacion, client: PoolClient): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO notificacion (automotora_id, sucursal_id, tipo, mensaje)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [data.automotoraId, data.sucursalId, data.tipo, data.mensaje],
    );
    for (const ref of data.referencias) {
      await client.query(
        `INSERT INTO notificacion_referencia (notificacion_id, entidad_tipo, entidad_id, clave_evento)
         VALUES ($1, $2, $3, $4)`,
        [rows[0].id, ref.entidadTipo, ref.entidadId, ref.claveEvento],
      );
    }
    return rows[0].id;
  }

  // Visibilidad: la sucursal afectada + todos los ADMIN_GENERAL.
  async findAllScoped(
    scope: Scope,
    filtro: {
      estado?: 'PENDIENTE' | 'RESUELTA';
      tipo?: TipoNotificacion;
      limit: number;
      offset: number;
    },
    db: Queryable = this.pool,
  ): Promise<{ rows: NotificacionRow[]; total: number; pendientes: number }> {
    const conditions = ['n.automotora_id = $1'];
    const params: unknown[] = [scope.automotoraId];
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      conditions.push(`n.sucursal_id = $${params.length}`);
    }
    const whereScope = conditions.join(' AND ');
    const paramsScope = [...params];
    if (filtro.estado) {
      params.push(filtro.estado);
      conditions.push(`n.estado = $${params.length}`);
    }
    if (filtro.tipo) {
      params.push(filtro.tipo);
      conditions.push(`n.tipo = $${params.length}`);
    }
    const where = conditions.join(' AND ');

    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM notificacion n WHERE ${where}`,
      params,
    );
    const { rows: pendientes } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM notificacion n WHERE ${whereScope} AND n.estado = 'PENDIENTE'`,
      paramsScope,
    );
    params.push(filtro.limit, filtro.offset);
    const { rows } = await db.query<NotificacionRow>(
      `SELECT n.*, s.nombre AS sucursal_nombre,
              COALESCE((SELECT json_agg(json_build_object('entidad_tipo', r.entidad_tipo, 'entidad_id', r.entidad_id))
                        FROM notificacion_referencia r WHERE r.notificacion_id = n.id), '[]') AS referencias
       FROM notificacion n JOIN sucursal s ON s.id = n.sucursal_id
       WHERE ${where}
       ORDER BY n.estado DESC, n.fecha_generacion DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total), pendientes: Number(pendientes[0].total) };
  }

  // Marca RESUELTA solo si está en el scope y pendiente. Devuelve si cambió.
  async resolver(
    id: string,
    scope: Scope,
    usuarioId: string,
    db: Queryable = this.pool,
  ): Promise<{ sucursal_id: string; tipo: string; mensaje: string } | null> {
    const params: unknown[] = [id, scope.automotoraId, usuarioId];
    let extra = '';
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      extra = ' AND sucursal_id = $4';
    }
    // Devuelve la notificación resuelta (para la auditoría), o null si no cambió.
    const { rows } = await db.query<{ sucursal_id: string; tipo: string; mensaje: string }>(
      `UPDATE notificacion
       SET estado = 'RESUELTA', fecha_resolucion = now(), usuario_resolucion_id = $3
       WHERE id = $1 AND automotora_id = $2 AND estado = 'PENDIENTE'${extra}
       RETURNING sucursal_id, tipo, mensaje`,
      params,
    );
    return rows[0] ?? null;
  }

  // Resuelve los avisos pendientes de un tipo que apuntan a un vehículo (ej. el
  // "por revisar" cuando un admin lo publica o lo devuelve).
  async resolverDeVehiculo(
    tipo: TipoNotificacion,
    vehiculoId: string,
    usuarioId: string,
    db: Queryable,
  ): Promise<void> {
    await db.query(
      `UPDATE notificacion n
       SET estado = 'RESUELTA', fecha_resolucion = now(), usuario_resolucion_id = $3
       WHERE n.tipo = $1 AND n.estado = 'PENDIENTE'
         AND EXISTS (SELECT 1 FROM notificacion_referencia r
                     WHERE r.notificacion_id = n.id AND r.entidad_tipo = 'VEHICULO' AND r.entidad_id = $2)`,
      [tipo, vehiculoId, usuarioId],
    );
  }

  async existeEnScope(id: string, scope: Scope, db: Queryable = this.pool): Promise<boolean> {
    const params: unknown[] = [id, scope.automotoraId];
    let extra = '';
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      extra = ' AND sucursal_id = $3';
    }
    const { rows } = await db.query(
      `SELECT 1 FROM notificacion WHERE id = $1 AND automotora_id = $2${extra}`,
      params,
    );
    return rows.length > 0;
  }
}
