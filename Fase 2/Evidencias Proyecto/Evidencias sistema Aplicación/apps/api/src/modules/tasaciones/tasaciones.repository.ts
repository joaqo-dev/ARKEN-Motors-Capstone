import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';
import {
  condicionesListado,
  ordenListado,
  type OrdenDocumentos,
} from '../documentos-comerciales/filtros';

export type EstadoOferta = 'VIGENTE' | 'ACEPTADA' | 'RECHAZADA' | 'VENCIDA' | 'ANULADA';

export interface TasacionRow {
  id: string;
  automotora_id: string;
  folio: number;
  sucursal_id: string;
  cliente_id: string;
  patente: string;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number;
  kilometraje: number;
  estado_general: string;
  oferta_monto: string;
  fecha_emision: Date;
  fecha_vencimiento: string;
  estado: EstadoOferta;
  usuario_id: string;
  pdf_url: string | null;
  motivo_anulacion: string | null;
  fecha_anulacion: Date | null;
  usuario_anulacion_id: string | null;
}

export interface TasacionDetalleRow extends TasacionRow {
  sucursal_nombre: string;
  cliente_nombre: string;
  cliente_rut: string;
  usuario_nombre: string;
  vehiculo_creado_id: string | null;
}

export interface NuevaTasacion {
  automotoraId: string;
  folio: number;
  sucursalId: string;
  clienteId: string;
  patente: string;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number;
  kilometraje: number;
  estadoGeneral: string;
  ofertaMonto: number;
  fechaVencimiento: string;
  usuarioId: string;
}

const SELECT_DETALLE = `
  SELECT d.*, s.nombre AS sucursal_nombre, cl.nombre AS cliente_nombre, cl.rut AS cliente_rut,
         u.nombre AS usuario_nombre,
         (SELECT v.id FROM vehiculo v WHERE v.tasacion_origen_id = d.id) AS vehiculo_creado_id
  FROM tasacion d
  JOIN sucursal s ON s.id = d.sucursal_id
  JOIN cliente cl ON cl.id = d.cliente_id
  JOIN usuario u ON u.id = d.usuario_id`;

// La tasación no tiene vehículo propio: su scope es solo su sucursal_id.
@Injectable()
export class TasacionesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(
    scope: Scope,
    filtro: Parameters<typeof condicionesListado>[1] & {
      limit: number;
      offset: number;
      orden?: OrdenDocumentos;
    },
    db: Queryable = this.pool,
  ): Promise<{ rows: TasacionDetalleRow[]; total: number }> {
    const { where, params } = condicionesListado(scope, filtro, { conVehiculo: false });
    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM tasacion d WHERE ${where}`,
      params,
    );
    params.push(filtro.limit, filtro.offset);
    const { rows } = await db.query<TasacionDetalleRow>(
      `${SELECT_DETALLE} WHERE ${where}
       ORDER BY ${ordenListado(filtro.orden, { fecha: 'd.fecha_emision', monto: 'd.oferta_monto' })}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total) };
  }

  async findByIdScoped(
    id: string,
    scope: Scope,
    db: Queryable = this.pool,
  ): Promise<TasacionDetalleRow | null> {
    const params: unknown[] = [id, scope.automotoraId];
    let extra = '';
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      extra = ' AND d.sucursal_id = $3';
    }
    const { rows } = await db.query<TasacionDetalleRow>(
      `${SELECT_DETALLE} WHERE d.id = $1 AND d.automotora_id = $2${extra}`,
      params,
    );
    return rows[0] ?? null;
  }

  async lockById(id: string, db: Queryable): Promise<TasacionRow | null> {
    const { rows } = await db.query<TasacionRow>(
      'SELECT * FROM tasacion WHERE id = $1 FOR UPDATE',
      [id],
    );
    return rows[0] ?? null;
  }

  async create(data: NuevaTasacion, db: Queryable): Promise<TasacionRow> {
    const { rows } = await db.query<TasacionRow>(
      `INSERT INTO tasacion
         (automotora_id, folio, sucursal_id, cliente_id, patente, marca, modelo, version, anio,
          kilometraje, estado_general, oferta_monto, fecha_vencimiento, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        data.automotoraId,
        data.folio,
        data.sucursalId,
        data.clienteId,
        data.patente,
        data.marca,
        data.modelo,
        data.version,
        data.anio,
        data.kilometraje,
        data.estadoGeneral,
        data.ofertaMonto,
        data.fechaVencimiento,
        data.usuarioId,
      ],
    );
    return rows[0];
  }

  async setEstado(id: string, estado: EstadoOferta, db: Queryable): Promise<void> {
    await db.query('UPDATE tasacion SET estado = $2 WHERE id = $1', [id, estado]);
  }

  async anular(id: string, motivo: string, usuarioId: string, db: Queryable): Promise<void> {
    await db.query(
      `UPDATE tasacion
       SET estado = 'ANULADA', motivo_anulacion = $2, usuario_anulacion_id = $3, fecha_anulacion = now()
       WHERE id = $1`,
      [id, motivo, usuarioId],
    );
  }

  async tieneVehiculoCreado(id: string, db: Queryable = this.pool): Promise<boolean> {
    const { rows } = await db.query('SELECT 1 FROM vehiculo WHERE tasacion_origen_id = $1', [id]);
    return rows.length > 0;
  }

  // ¿La patente ya está en el inventario de la automotora (ni vendida ni dada de baja)?
  async patenteEnInventario(
    automotoraId: string,
    patente: string,
    db: Queryable = this.pool,
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT 1 FROM vehiculo
        WHERE automotora_id = $1 AND patente = $2 AND estado NOT IN ('VENDIDO', 'DADO_DE_BAJA')
        LIMIT 1`,
      [automotoraId, patente],
    );
    return (rowCount ?? 0) > 0;
  }

  async marcarVencidas(hoy: string, db: Queryable = this.pool): Promise<number> {
    const { rowCount } = await db.query(
      `UPDATE tasacion SET estado = 'VENCIDA' WHERE estado = 'VIGENTE' AND fecha_vencimiento < $1`,
      [hoy],
    );
    return rowCount ?? 0;
  }
}
