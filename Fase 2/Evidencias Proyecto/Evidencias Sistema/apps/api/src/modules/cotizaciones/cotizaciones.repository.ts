import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';
import {
  condicionesListado,
  ordenListado,
  type OrdenDocumentos,
} from '../documentos-comerciales/filtros';

export type EstadoCotizacion = 'VIGENTE' | 'VENCIDA' | 'CONCRETADA' | 'ANULADA';

export interface CotizacionRow {
  id: string;
  automotora_id: string;
  folio: number;
  sucursal_id: string;
  cliente_id: string;
  vehiculo_id: string;
  precio_cotizado: string;
  vigencia_dias: number;
  fecha_emision: Date;
  fecha_vencimiento: string;
  estado: EstadoCotizacion;
  usuario_id: string;
  pdf_url: string | null;
  motivo_anulacion: string | null;
  fecha_anulacion: Date | null;
  usuario_anulacion_id: string | null;
}

export interface CotizacionDetalleRow extends CotizacionRow {
  sucursal_nombre: string;
  cliente_nombre: string;
  cliente_rut: string;
  vehiculo_patente: string;
  vehiculo_descripcion: string;
  vehiculo_sucursal_id: string;
  vehiculo_estado: string;
  usuario_nombre: string;
  venta_id: string | null; // venta confirmada que la concretó
  venta_folio: number | null;
  costos: { descripcion: string; monto: string }[];
}

export interface NuevaCotizacion {
  automotoraId: string;
  folio: number;
  sucursalId: string;
  clienteId: string;
  vehiculoId: string;
  precioCotizado: number;
  vigenciaDias: number;
  fechaVencimiento: string;
  usuarioId: string;
}

const SELECT_DETALLE = `
  SELECT d.*, s.nombre AS sucursal_nombre, cl.nombre AS cliente_nombre, cl.rut AS cliente_rut,
         v.patente AS vehiculo_patente, v.marca || ' ' || v.modelo || ' ' || v.anio AS vehiculo_descripcion,
         v.sucursal_id AS vehiculo_sucursal_id, v.estado AS vehiculo_estado, u.nombre AS usuario_nombre,
         vc.id AS venta_id, vc.folio AS venta_folio,
         COALESCE((SELECT json_agg(json_build_object('descripcion', c.descripcion, 'monto', c.monto))
                   FROM cotizacion_costo c WHERE c.cotizacion_id = d.id), '[]') AS costos
  FROM cotizacion d
  JOIN sucursal s ON s.id = d.sucursal_id
  JOIN cliente cl ON cl.id = d.cliente_id
  JOIN vehiculo v ON v.id = d.vehiculo_id
  JOIN usuario u ON u.id = d.usuario_id
  LEFT JOIN venta vc ON vc.cotizacion_id = d.id AND vc.estado = 'CONFIRMADA'`;

@Injectable()
export class CotizacionesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(
    scope: Scope,
    filtro: Parameters<typeof condicionesListado>[1] & {
      limit: number;
      offset: number;
      orden?: OrdenDocumentos;
    },
    db: Queryable = this.pool,
  ): Promise<{ rows: CotizacionDetalleRow[]; total: number }> {
    const { where, params } = condicionesListado(scope, filtro, { conVehiculo: true });
    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM cotizacion d JOIN vehiculo v ON v.id = d.vehiculo_id WHERE ${where}`,
      params,
    );
    params.push(filtro.limit, filtro.offset);
    const { rows } = await db.query<CotizacionDetalleRow>(
      `${SELECT_DETALLE} WHERE ${where}
       ORDER BY ${ordenListado(filtro.orden, { fecha: 'd.fecha_emision', monto: 'd.precio_cotizado' })}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total) };
  }

  async findByIdAccesible(
    id: string,
    scope: Scope,
    db: Queryable = this.pool,
  ): Promise<CotizacionDetalleRow | null> {
    const params: unknown[] = [id, scope.automotoraId];
    let extra = '';
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      extra = ' AND (d.sucursal_id = $3 OR v.sucursal_id = $3)';
    }
    const { rows } = await db.query<CotizacionDetalleRow>(
      `${SELECT_DETALLE} WHERE d.id = $1 AND d.automotora_id = $2${extra}`,
      params,
    );
    return rows[0] ?? null;
  }

  async lockById(id: string, db: Queryable): Promise<CotizacionRow | null> {
    const { rows } = await db.query<CotizacionRow>(
      'SELECT * FROM cotizacion WHERE id = $1 FOR UPDATE',
      [id],
    );
    return rows[0] ?? null;
  }

  async create(data: NuevaCotizacion, db: Queryable): Promise<CotizacionRow> {
    const { rows } = await db.query<CotizacionRow>(
      `INSERT INTO cotizacion
         (automotora_id, folio, sucursal_id, cliente_id, vehiculo_id, precio_cotizado,
          vigencia_dias, fecha_vencimiento, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.automotoraId,
        data.folio,
        data.sucursalId,
        data.clienteId,
        data.vehiculoId,
        data.precioCotizado,
        data.vigenciaDias,
        data.fechaVencimiento,
        data.usuarioId,
      ],
    );
    return rows[0];
  }

  async createCosto(
    cotizacionId: string,
    descripcion: string,
    monto: number,
    db: Queryable,
  ): Promise<void> {
    await db.query(
      'INSERT INTO cotizacion_costo (cotizacion_id, descripcion, monto) VALUES ($1, $2, $3)',
      [cotizacionId, descripcion, monto],
    );
  }

  async setEstado(id: string, estado: EstadoCotizacion, db: Queryable): Promise<void> {
    await db.query('UPDATE cotizacion SET estado = $2 WHERE id = $1', [id, estado]);
  }

  async anular(id: string, motivo: string, usuarioId: string, db: Queryable): Promise<void> {
    await db.query(
      `UPDATE cotizacion
       SET estado = 'ANULADA', motivo_anulacion = $2, usuario_anulacion_id = $3, fecha_anulacion = now()
       WHERE id = $1`,
      [id, motivo, usuarioId],
    );
  }

  async marcarVencidas(hoy: string, db: Queryable = this.pool): Promise<number> {
    const { rowCount } = await db.query(
      `UPDATE cotizacion SET estado = 'VENCIDA' WHERE estado = 'VIGENTE' AND fecha_vencimiento < $1`,
      [hoy],
    );
    return rowCount ?? 0;
  }
}
