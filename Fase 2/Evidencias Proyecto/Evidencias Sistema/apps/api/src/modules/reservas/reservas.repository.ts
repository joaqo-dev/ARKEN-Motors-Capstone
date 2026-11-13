import { Inject, Injectable } from '@nestjs/common';
import type { EstadoVehiculo } from '@vitriauto/shared-types';
import { Pool } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';
import {
  condicionesListado,
  ordenListado,
  type OrdenDocumentos,
} from '../documentos-comerciales/filtros';

export type EstadoReserva = 'VIGENTE' | 'VENCIDA' | 'CONVERTIDA_EN_VENTA' | 'CANCELADA';

export interface ReservaRow {
  id: string;
  automotora_id: string;
  folio: number;
  sucursal_id: string;
  cliente_id: string;
  vehiculo_id: string;
  monto_reserva: string;
  condiciones_devolucion: string | null;
  fecha_emision: Date;
  fecha_vencimiento: string;
  estado: EstadoReserva;
  estado_vehiculo_previo: EstadoVehiculo;
  usuario_id: string;
  pdf_url: string | null;
  motivo_cancelacion: string | null;
  fecha_cancelacion: Date | null;
  usuario_cancelacion_id: string | null;
  sena_retenida: boolean | null;
}

export interface ReservaDetalleRow extends ReservaRow {
  sucursal_nombre: string;
  cliente_nombre: string;
  cliente_rut: string;
  vehiculo_patente: string;
  vehiculo_descripcion: string;
  vehiculo_estado: EstadoVehiculo;
  vehiculo_precio_venta: string;
  usuario_nombre: string;
}

export interface NuevaReserva {
  automotoraId: string;
  folio: number;
  sucursalId: string;
  clienteId: string;
  vehiculoId: string;
  montoReserva: number;
  condicionesDevolucion: string | null;
  fechaVencimiento: string;
  estadoVehiculoPrevio: EstadoVehiculo;
  usuarioId: string;
}

const SELECT_DETALLE = `
  SELECT d.*, s.nombre AS sucursal_nombre, cl.nombre AS cliente_nombre, cl.rut AS cliente_rut,
         v.patente AS vehiculo_patente, v.marca || ' ' || v.modelo || ' ' || v.anio AS vehiculo_descripcion,
         v.estado AS vehiculo_estado, v.precio_venta AS vehiculo_precio_venta, u.nombre AS usuario_nombre
  FROM reserva d
  JOIN sucursal s ON s.id = d.sucursal_id
  JOIN cliente cl ON cl.id = d.cliente_id
  JOIN vehiculo v ON v.id = d.vehiculo_id
  JOIN usuario u ON u.id = d.usuario_id`;

@Injectable()
export class ReservasRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(
    scope: Scope,
    filtro: Parameters<typeof condicionesListado>[1] & {
      limit: number;
      offset: number;
      orden?: OrdenDocumentos;
    },
    db: Queryable = this.pool,
  ): Promise<{ rows: ReservaDetalleRow[]; total: number }> {
    const { where, params } = condicionesListado(scope, filtro, { conVehiculo: true });
    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM reserva d JOIN vehiculo v ON v.id = d.vehiculo_id WHERE ${where}`,
      params,
    );
    params.push(filtro.limit, filtro.offset);
    const { rows } = await db.query<ReservaDetalleRow>(
      `${SELECT_DETALLE} WHERE ${where}
       ORDER BY ${ordenListado(filtro.orden, { fecha: 'd.fecha_emision', monto: 'd.monto_reserva' }, 'd.fecha_vencimiento ASC, d.fecha_emision DESC')}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total) };
  }

  async findByIdAccesible(
    id: string,
    scope: Scope,
    db: Queryable = this.pool,
  ): Promise<ReservaDetalleRow | null> {
    const params: unknown[] = [id, scope.automotoraId];
    let extra = '';
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      extra = ' AND (d.sucursal_id = $3 OR v.sucursal_id = $3)';
    }
    const { rows } = await db.query<ReservaDetalleRow>(
      `${SELECT_DETALLE} WHERE d.id = $1 AND d.automotora_id = $2${extra}`,
      params,
    );
    return rows[0] ?? null;
  }

  async lockById(id: string, db: Queryable): Promise<ReservaRow | null> {
    const { rows } = await db.query<ReservaRow>('SELECT * FROM reserva WHERE id = $1 FOR UPDATE', [
      id,
    ]);
    return rows[0] ?? null;
  }

  async create(data: NuevaReserva, db: Queryable): Promise<ReservaRow> {
    const { rows } = await db.query<ReservaRow>(
      `INSERT INTO reserva
         (automotora_id, folio, sucursal_id, cliente_id, vehiculo_id, monto_reserva,
          condiciones_devolucion, fecha_vencimiento, estado_vehiculo_previo, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.automotoraId,
        data.folio,
        data.sucursalId,
        data.clienteId,
        data.vehiculoId,
        data.montoReserva,
        data.condicionesDevolucion,
        data.fechaVencimiento,
        data.estadoVehiculoPrevio,
        data.usuarioId,
      ],
    );
    return rows[0];
  }

  async extender(id: string, fechaVencimiento: string, db: Queryable): Promise<void> {
    await db.query(`UPDATE reserva SET fecha_vencimiento = $2, estado = 'VIGENTE' WHERE id = $1`, [
      id,
      fechaVencimiento,
    ]);
  }

  async cancelar(
    id: string,
    motivo: string,
    senaRetenida: boolean,
    usuarioId: string,
    db: Queryable,
  ): Promise<void> {
    await db.query(
      `UPDATE reserva
       SET estado = 'CANCELADA', motivo_cancelacion = $2, sena_retenida = $3,
           usuario_cancelacion_id = $4, fecha_cancelacion = now()
       WHERE id = $1`,
      [id, motivo, senaRetenida, usuarioId],
    );
  }

  async convertirEnVenta(id: string, db: Queryable): Promise<void> {
    await db.query(`UPDATE reserva SET estado = 'CONVERTIDA_EN_VENTA' WHERE id = $1`, [id]);
  }

  // Reserva activa (vigente o vencida sin resolver) de un vehículo, bloqueada.
  async lockActivaPorVehiculo(vehiculoId: string, db: Queryable): Promise<ReservaRow | null> {
    const { rows } = await db.query<ReservaRow>(
      `SELECT * FROM reserva WHERE vehiculo_id = $1 AND estado IN ('VIGENTE', 'VENCIDA') FOR UPDATE`,
      [vehiculoId],
    );
    return rows[0] ?? null;
  }

  // Vencida: el vehículo sigue RESERVADO hasta que un admin extienda o cancele.
  async marcarVencidas(hoy: string, db: Queryable = this.pool): Promise<number> {
    const { rowCount } = await db.query(
      `UPDATE reserva SET estado = 'VENCIDA' WHERE estado = 'VIGENTE' AND fecha_vencimiento < $1`,
      [hoy],
    );
    return rowCount ?? 0;
  }
}
