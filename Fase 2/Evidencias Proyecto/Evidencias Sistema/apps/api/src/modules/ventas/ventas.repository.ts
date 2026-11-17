import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';
import {
  condicionesListado,
  ordenListado,
  type OrdenDocumentos,
} from '../documentos-comerciales/filtros';
import type { TipoFormaPago } from './dto/create-venta.dto';

export interface VentaRow {
  id: string;
  automotora_id: string;
  folio: number;
  sucursal_id: string;
  vehiculo_id: string;
  cliente_id: string;
  reserva_id: string | null;
  cotizacion_id: string | null;
  precio_venta_final: string;
  fecha_venta: Date;
  estado: 'CONFIRMADA' | 'ANULADA';
  motivo_anulacion: string | null;
  fecha_anulacion: Date | null;
  usuario_anulacion_id: string | null;
  usuario_id: string;
  pdf_url: string | null;
}

export interface VentaDetalleRow extends VentaRow {
  sucursal_nombre: string;
  cliente_nombre: string;
  cliente_rut: string;
  vehiculo_patente: string;
  vehiculo_descripcion: string;
  vehiculo_origen: string;
  usuario_nombre: string;
  reserva_folio: number | null;
  cotizacion_folio: number | null;
  reserva_monto: string | null;
  formas: {
    tipo: TipoFormaPago;
    monto: string;
    vehiculo_recibido_id: string | null;
    patente: string | null;
  }[];
  costos: { descripcion: string; monto: string }[];
}

export interface NuevaVenta {
  automotoraId: string;
  folio: number;
  sucursalId: string;
  vehiculoId: string;
  clienteId: string;
  reservaId: string | null;
  cotizacionId: string | null;
  precioVentaFinal: number;
  usuarioId: string;
}

// Scope: filtro sobre la sucursal CONGELADA de la venta (o la actual del
// vehículo, que no cambia tras venderse: un vehículo vendido no se transfiere).
const SELECT_DETALLE = `
  SELECT d.*, s.nombre AS sucursal_nombre, cl.nombre AS cliente_nombre, cl.rut AS cliente_rut,
         v.patente AS vehiculo_patente, v.marca || ' ' || v.modelo || ' ' || v.anio AS vehiculo_descripcion,
         v.origen AS vehiculo_origen, u.nombre AS usuario_nombre,
         r.folio AS reserva_folio, r.monto_reserva AS reserva_monto, co.folio AS cotizacion_folio,
         COALESCE((SELECT json_agg(json_build_object(
                     'tipo', f.tipo, 'monto', f.monto, 'vehiculo_recibido_id', f.vehiculo_recibido_id,
                     'patente', vr.patente))
                   FROM venta_forma_pago f LEFT JOIN vehiculo vr ON vr.id = f.vehiculo_recibido_id
                   WHERE f.venta_id = d.id), '[]') AS formas,
         COALESCE((SELECT json_agg(json_build_object('descripcion', c.descripcion, 'monto', c.monto))
                   FROM venta_costo c WHERE c.venta_id = d.id), '[]') AS costos
  FROM venta d
  JOIN sucursal s ON s.id = d.sucursal_id
  JOIN cliente cl ON cl.id = d.cliente_id
  JOIN vehiculo v ON v.id = d.vehiculo_id
  JOIN usuario u ON u.id = d.usuario_id
  LEFT JOIN reserva r ON r.id = d.reserva_id
  LEFT JOIN cotizacion co ON co.id = d.cotizacion_id`;

@Injectable()
export class VentasRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(
    scope: Scope,
    filtro: Parameters<typeof condicionesListado>[1] & {
      limit: number;
      offset: number;
      orden?: OrdenDocumentos;
    },
    db: Queryable = this.pool,
  ): Promise<{ rows: VentaDetalleRow[]; total: number }> {
    // Ventas usan fecha_venta en vez de fecha_emision para el rango.
    const { desde, hasta, ...resto } = filtro;
    const { where, params } = condicionesListado(scope, resto, { conVehiculo: true });
    const conditions = [where];
    if (desde) {
      params.push(desde);
      conditions.push(`d.fecha_venta >= $${params.length}::date`);
    }
    if (hasta) {
      params.push(hasta);
      conditions.push(`d.fecha_venta < ($${params.length}::date + 1)`);
    }
    const filtroSql = conditions.join(' AND ');
    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM venta d JOIN vehiculo v ON v.id = d.vehiculo_id WHERE ${filtroSql}`,
      params,
    );
    params.push(filtro.limit, filtro.offset);
    const { rows } = await db.query<VentaDetalleRow>(
      `${SELECT_DETALLE} WHERE ${filtroSql}
       ORDER BY ${ordenListado(filtro.orden, { fecha: 'd.fecha_venta', monto: 'd.precio_venta_final' })}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total) };
  }

  async findByIdAccesible(
    id: string,
    scope: Scope,
    db: Queryable = this.pool,
  ): Promise<VentaDetalleRow | null> {
    const params: unknown[] = [id, scope.automotoraId];
    let extra = '';
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      extra = ' AND (d.sucursal_id = $3 OR v.sucursal_id = $3)';
    }
    const { rows } = await db.query<VentaDetalleRow>(
      `${SELECT_DETALLE} WHERE d.id = $1 AND d.automotora_id = $2${extra}`,
      params,
    );
    return rows[0] ?? null;
  }

  async lockById(id: string, db: Queryable): Promise<VentaRow | null> {
    const { rows } = await db.query<VentaRow>('SELECT * FROM venta WHERE id = $1 FOR UPDATE', [id]);
    return rows[0] ?? null;
  }

  async create(data: NuevaVenta, db: Queryable): Promise<VentaRow> {
    const { rows } = await db.query<VentaRow>(
      `INSERT INTO venta
         (automotora_id, folio, sucursal_id, vehiculo_id, cliente_id, reserva_id, cotizacion_id,
          precio_venta_final, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.automotoraId,
        data.folio,
        data.sucursalId,
        data.vehiculoId,
        data.clienteId,
        data.reservaId,
        data.cotizacionId,
        data.precioVentaFinal,
        data.usuarioId,
      ],
    );
    return rows[0];
  }

  async createCosto(
    ventaId: string,
    descripcion: string,
    monto: number,
    db: Queryable,
  ): Promise<void> {
    await db.query('INSERT INTO venta_costo (venta_id, descripcion, monto) VALUES ($1, $2, $3)', [
      ventaId,
      descripcion,
      monto,
    ]);
  }

  async createFormaPago(
    ventaId: string,
    tipo: TipoFormaPago,
    monto: number,
    vehiculoRecibidoId: string | null,
    db: Queryable,
  ): Promise<void> {
    await db.query(
      'INSERT INTO venta_forma_pago (venta_id, tipo, monto, vehiculo_recibido_id) VALUES ($1, $2, $3, $4)',
      [ventaId, tipo, monto, vehiculoRecibidoId],
    );
  }

  async anular(id: string, motivo: string, usuarioId: string, db: Queryable): Promise<void> {
    await db.query(
      `UPDATE venta
       SET estado = 'ANULADA', motivo_anulacion = $2, usuario_anulacion_id = $3, fecha_anulacion = now()
       WHERE id = $1`,
      [id, motivo, usuarioId],
    );
  }
}
