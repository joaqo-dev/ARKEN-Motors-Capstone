import { Inject, Injectable } from '@nestjs/common';
import type { TipoTrato } from '@vitriauto/shared-types';
import type { CondicionesTratoCompletas } from './trato';
import { Pool } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';

export interface ConsignacionRow {
  id: string;
  automotora_id: string;
  folio: number;
  sucursal_id: string;
  vehiculo_id: string;
  cliente_id: string;
  tipo_trato: TipoTrato;
  porcentaje_comision: string | null; // NUMERIC llega como string
  monto_neto: string | null;
  precio_minimo: string;
  fecha_inicio: string; // DATE como 'YYYY-MM-DD' (ver db/pool.ts)
  fecha_fin: string;
  estado: 'ACTIVA' | 'VENCIDA' | 'DEVUELTA' | 'VENDIDA';
  usuario_id: string;
  pdf_url: string | null;
  fecha_creacion: Date;
}

export type EstadoConsignacion = ConsignacionRow['estado'];

export interface ConsignacionDetalleRow extends ConsignacionRow {
  cliente_nombre: string;
  cliente_rut: string;
  vehiculo_patente: string;
  vehiculo_descripcion: string;
  vehiculo_estado: string;
  vehiculo_precio_venta: string;
  vehiculo_sucursal_id: string;
  vehiculo_sucursal_nombre: string;
  dias_en_stock: number | null; // días desde el ingreso, solo si el auto sigue en inventario
}

// Condiciones del trato leídas de una fila (NUMERIC → number).
export const tratoDeFila = (c: ConsignacionRow) => ({
  tipoTrato: c.tipo_trato,
  porcentajeComision: c.porcentaje_comision === null ? null : Number(c.porcentaje_comision),
  montoNeto: c.monto_neto === null ? null : Number(c.monto_neto),
});

export type OrdenConsignaciones = 'dias' | 'plazo' | 'minimo' | 'folio';

export interface FiltroConsignaciones {
  estado?: EstadoConsignacion;
  clienteId?: string;
  sucursalId?: string;
  q?: string;
  orden?: OrdenConsignaciones;
  direccion?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

const SELECT_DETALLE = `
  SELECT c.*, cl.nombre AS cliente_nombre, cl.rut AS cliente_rut,
         v.patente AS vehiculo_patente, v.marca || ' ' || v.modelo || ' ' || v.anio AS vehiculo_descripcion,
         v.estado AS vehiculo_estado, v.precio_venta AS vehiculo_precio_venta,
         v.sucursal_id AS vehiculo_sucursal_id, s.nombre AS vehiculo_sucursal_nombre,
         CASE WHEN v.estado NOT IN ('VENDIDO', 'DADO_DE_BAJA')
              THEN ((now() AT TIME ZONE 'America/Santiago')::date
                    - (v.fecha_ingreso AT TIME ZONE 'America/Santiago')::date)::int
         END AS dias_en_stock
  FROM consignacion c
  JOIN cliente cl ON cl.id = c.cliente_id
  JOIN vehiculo v ON v.id = c.vehiculo_id
  JOIN sucursal s ON s.id = v.sucursal_id`;

export interface NuevaConsignacion {
  automotoraId: string;
  folio: number;
  sucursalId: string;
  vehiculoId: string;
  clienteId: string;
  trato: CondicionesTratoCompletas;
  fechaInicio: string;
  fechaFin: string;
  usuarioId: string;
}

@Injectable()
export class ConsignacionesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(data: NuevaConsignacion, db: Queryable = this.pool): Promise<ConsignacionRow> {
    const { rows } = await db.query<ConsignacionRow>(
      `INSERT INTO consignacion
         (automotora_id, folio, sucursal_id, vehiculo_id, cliente_id, tipo_trato,
          porcentaje_comision, monto_neto, precio_minimo, fecha_inicio, fecha_fin, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        data.automotoraId,
        data.folio,
        data.sucursalId,
        data.vehiculoId,
        data.clienteId,
        data.trato.tipoTrato,
        data.trato.porcentajeComision,
        data.trato.montoNeto,
        data.trato.precioMinimo,
        data.fechaInicio,
        data.fechaFin,
        data.usuarioId,
      ],
    );
    return rows[0];
  }

  // El scope se aplica sobre la sucursal actual del vehículo (quien lo tiene
  // decide extender o devolver). El folio y la atribución siguen en la sucursal
  // fijada en la consignación.
  async findAllScoped(
    scope: Scope,
    filtro: FiltroConsignaciones,
    db: Queryable = this.pool,
  ): Promise<{ rows: ConsignacionDetalleRow[]; total: number }> {
    const conditions = ['c.automotora_id = $1'];
    const params: unknown[] = [scope.automotoraId];
    const agregar = (condicion: (p: string) => string, valor: unknown) => {
      params.push(valor);
      conditions.push(condicion(`$${params.length}`));
    };
    if (scope.sucursalId) agregar((p) => `v.sucursal_id = ${p}`, scope.sucursalId);
    if (filtro.sucursalId) agregar((p) => `v.sucursal_id = ${p}`, filtro.sucursalId);
    if (filtro.estado) agregar((p) => `c.estado = ${p}`, filtro.estado);
    if (filtro.clienteId) agregar((p) => `c.cliente_id = ${p}`, filtro.clienteId);
    // Búsqueda: vehículo (patente, marca, modelo), consignante (nombre o RUT) o N°.
    const q = filtro.q?.trim();
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`);
      const texto = `$${params.length}`;
      const opciones = [`(v.marca || ' ' || v.modelo) ILIKE ${texto}`, `cl.nombre ILIKE ${texto}`];
      const compacto = q.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
      if (compacto) {
        params.push(`%${compacto}%`);
        opciones.push(
          `v.patente ILIKE $${params.length}`,
          `replace(cl.rut, '-', '') ILIKE $${params.length}`,
        );
      }
      if (/^\d{1,9}$/.test(q)) {
        params.push(Number(q));
        opciones.push(`c.folio = $${params.length}`);
      }
      conditions.push(`(${opciones.join(' OR ')})`);
    }
    const where = conditions.join(' AND ');
    const sentido = filtro.direccion === 'desc' ? 'DESC' : 'ASC';
    const ordenSql = {
      dias: `v.fecha_ingreso ${sentido === 'ASC' ? 'DESC' : 'ASC'}`, // más días = ingreso más antiguo
      plazo: `c.fecha_fin ${sentido}`,
      minimo: `c.precio_minimo ${sentido}`,
      folio: `c.folio ${sentido}`,
    }[filtro.orden ?? 'plazo'];

    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM consignacion c JOIN vehiculo v ON v.id = c.vehiculo_id
       JOIN cliente cl ON cl.id = c.cliente_id WHERE ${where}`,
      params,
    );
    params.push(filtro.limit, filtro.offset);
    const { rows } = await db.query<ConsignacionDetalleRow>(
      `${SELECT_DETALLE} WHERE ${where}
       ORDER BY ${ordenSql}, c.folio DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total) };
  }

  async findByIdScoped(
    id: string,
    scope: Scope,
    db: Queryable = this.pool,
  ): Promise<ConsignacionDetalleRow | null> {
    const conditions = ['c.id = $1', 'c.automotora_id = $2'];
    const params: unknown[] = [id, scope.automotoraId];
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      conditions.push(`v.sucursal_id = $${params.length}`);
    }
    const { rows } = await db.query<ConsignacionDetalleRow>(
      `${SELECT_DETALLE} WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return rows[0] ?? null;
  }

  async lockById(id: string, db: Queryable): Promise<ConsignacionRow | null> {
    const { rows } = await db.query<ConsignacionRow>(
      'SELECT * FROM consignacion WHERE id = $1 FOR UPDATE',
      [id],
    );
    return rows[0] ?? null;
  }

  async lockByVehiculo(vehiculoId: string, db: Queryable): Promise<ConsignacionRow | null> {
    const { rows } = await db.query<ConsignacionRow>(
      'SELECT * FROM consignacion WHERE vehiculo_id = $1 FOR UPDATE',
      [vehiculoId],
    );
    return rows[0] ?? null;
  }

  // Se guardan las cuatro columnas juntas: cambiar el tipo de trato limpia la
  // columna del otro tipo (lo exige chk_consignacion_trato).
  async updateCondiciones(id: string, c: CondicionesTratoCompletas, db: Queryable): Promise<void> {
    await db.query(
      `UPDATE consignacion
          SET tipo_trato = $2, porcentaje_comision = $3, monto_neto = $4, precio_minimo = $5
        WHERE id = $1`,
      [id, c.tipoTrato, c.porcentajeComision, c.montoNeto, c.precioMinimo],
    );
  }

  async extender(id: string, fechaFin: string, db: Queryable): Promise<void> {
    await db.query(`UPDATE consignacion SET fecha_fin = $2, estado = 'ACTIVA' WHERE id = $1`, [
      id,
      fechaFin,
    ]);
  }

  async setEstado(id: string, estado: EstadoConsignacion, db: Queryable): Promise<void> {
    await db.query('UPDATE consignacion SET estado = $2 WHERE id = $1', [id, estado]);
  }

  // Tarea diaria: el plazo terminó (fecha_fin anterior a hoy) → VENCIDA.
  async marcarVencidas(hoy: string, db: Queryable = this.pool): Promise<number> {
    const { rowCount } = await db.query(
      `UPDATE consignacion SET estado = 'VENCIDA' WHERE estado = 'ACTIVA' AND fecha_fin < $1`,
      [hoy],
    );
    return rowCount ?? 0;
  }

  async findByVehiculo(
    vehiculoId: string,
    db: Queryable = this.pool,
  ): Promise<ConsignacionRow | null> {
    const { rows } = await db.query<ConsignacionRow>(
      'SELECT * FROM consignacion WHERE vehiculo_id = $1',
      [vehiculoId],
    );
    return rows[0] ?? null;
  }
}
