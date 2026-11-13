import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';

export const CATEGORIAS_VEHICULO = ['MECANICA', 'ESTETICA', 'DOCUMENTACION', 'TRAMITES'] as const;
export const CATEGORIAS_OPERACIONAL = [
  'ARRIENDO',
  'SUELDOS_COMISIONES',
  'PUBLICIDAD',
  'SERVICIOS_BASICOS',
  'MANTENCION_LOCAL',
  'CONTABILIDAD_LEGAL',
  'IMPUESTOS_PATENTES',
  'OTROS',
] as const;
export type CategoriaGasto =
  (typeof CATEGORIAS_VEHICULO)[number] | (typeof CATEGORIAS_OPERACIONAL)[number];
export type TipoGasto = 'VEHICULO' | 'OPERACIONAL';

export interface GastoRow {
  id: string;
  automotora_id: string;
  numero: number; // correlativo por automotora
  tipo: TipoGasto;
  vehiculo_id: string | null; // solo VEHICULO
  sucursal_id: string | null; // NULL = gasto general de la automotora (OPERACIONAL)
  categoria: CategoriaGasto;
  monto: string; // NUMERIC llega como string
  fecha: string; // DATE 'YYYY-MM-DD'
  comentario: string | null;
  archivo_adjunto_url: string | null;
  estado: 'ACTIVO' | 'ANULADO';
  usuario_id: string;
  fecha_creacion: Date;
}

export interface GastoDetalleRow extends GastoRow {
  sucursal_nombre: string | null;
  usuario_nombre: string;
  vehiculo_patente: string | null;
  vehiculo_descripcion: string | null;
  vehiculo_estado: string | null;
  vehiculo_sucursal_id: string | null;
}

export interface NuevoGasto {
  automotoraId: string;
  tipo: TipoGasto;
  vehiculoId: string | null;
  sucursalId: string | null;
  categoria: CategoriaGasto;
  monto: number;
  fecha: string;
  comentario: string | null;
  archivoAdjuntoUrl: string | null;
  usuarioId: string;
}

export interface CambiosGasto {
  categoria?: CategoriaGasto;
  monto?: number;
  fecha?: string;
  comentario?: string | null;
}

export interface FiltroGastos {
  desde?: string;
  hasta?: string;
  tipo?: TipoGasto;
  categoria?: CategoriaGasto;
  sucursalId?: string;
  soloGenerales?: boolean; // sin sucursal (gastos generales de la automotora)
  vehiculoId?: string;
  incluirAnulados: boolean;
  limit: number;
  offset: number;
}

const SELECT_DETALLE = `
  SELECT g.*, s.nombre AS sucursal_nombre, u.nombre AS usuario_nombre,
         v.patente AS vehiculo_patente, v.marca || ' ' || v.modelo || ' ' || v.anio AS vehiculo_descripcion,
         v.estado AS vehiculo_estado, v.sucursal_id AS vehiculo_sucursal_id
  FROM gasto g
  LEFT JOIN sucursal s ON s.id = g.sucursal_id
  JOIN usuario u ON u.id = g.usuario_id
  LEFT JOIN vehiculo v ON v.id = g.vehiculo_id`;

@Injectable()
export class GastosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // El scope se aplica sobre la sucursal fijada en el gasto. Los generales (sin
  // sucursal) solo los ve el ADMIN_GENERAL y sin filtro de sucursal (vista
  // consolidada).
  async findAll(
    scope: Scope,
    filtro: FiltroGastos,
    db: Queryable = this.pool,
  ): Promise<{
    rows: GastoDetalleRow[];
    total: number;
    totalesPorCategoria: { tipo: TipoGasto; categoria: CategoriaGasto; total: string }[];
  }> {
    const conditions = ['g.automotora_id = $1'];
    const params: unknown[] = [scope.automotoraId];
    const agregar = (condicion: (p: string) => string, valor: unknown) => {
      params.push(valor);
      conditions.push(condicion(`$${params.length}`));
    };
    if (scope.sucursalId) agregar((p) => `g.sucursal_id = ${p}`, scope.sucursalId);
    if (filtro.sucursalId) agregar((p) => `g.sucursal_id = ${p}`, filtro.sucursalId);
    if (filtro.soloGenerales) conditions.push('g.sucursal_id IS NULL');
    if (filtro.vehiculoId) agregar((p) => `g.vehiculo_id = ${p}`, filtro.vehiculoId);
    if (filtro.tipo) agregar((p) => `g.tipo = ${p}`, filtro.tipo);
    if (filtro.categoria) agregar((p) => `g.categoria = ${p}`, filtro.categoria);
    if (filtro.desde) agregar((p) => `g.fecha >= ${p}`, filtro.desde);
    if (filtro.hasta) agregar((p) => `g.fecha <= ${p}`, filtro.hasta);
    if (!filtro.incluirAnulados) conditions.push(`g.estado = 'ACTIVO'`);
    const where = conditions.join(' AND ');

    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM gasto g WHERE ${where}`,
      params,
    );
    // Los totales solo suman gastos activos, aunque el listado incluya anulados.
    const { rows: totalesPorCategoria } = await db.query<{
      tipo: TipoGasto;
      categoria: CategoriaGasto;
      total: string;
    }>(
      `SELECT g.tipo, g.categoria, sum(g.monto) AS total FROM gasto g
       WHERE ${where} AND g.estado = 'ACTIVO'
       GROUP BY g.tipo, g.categoria ORDER BY g.tipo DESC, g.categoria`,
      params,
    );
    const paramsPagina = [...params, filtro.limit, filtro.offset];
    const { rows } = await db.query<GastoDetalleRow>(
      `${SELECT_DETALLE} WHERE ${where}
       ORDER BY g.fecha DESC, g.fecha_creacion DESC
       LIMIT $${paramsPagina.length - 1} OFFSET $${paramsPagina.length}`,
      paramsPagina,
    );
    return { rows, total: Number(conteo[0].total), totalesPorCategoria };
  }

  async findByVehiculo(vehiculoId: string, db: Queryable = this.pool): Promise<GastoDetalleRow[]> {
    const { rows } = await db.query<GastoDetalleRow>(
      `${SELECT_DETALLE} WHERE g.vehiculo_id = $1 ORDER BY g.fecha DESC, g.fecha_creacion DESC`,
      [vehiculoId],
    );
    return rows;
  }

  // Acceso a un gasto: desde la sucursal donde se registró o donde está hoy el
  // vehículo. Un gasto general solo es accesible para el ADMIN_GENERAL.
  async findByIdAccesible(
    id: string,
    scope: Scope,
    db: Queryable = this.pool,
  ): Promise<GastoDetalleRow | null> {
    const conditions = ['g.id = $1', 'g.automotora_id = $2'];
    const params: unknown[] = [id, scope.automotoraId];
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      conditions.push(`(g.sucursal_id = $3 OR v.sucursal_id = $3)`);
    }
    const { rows } = await db.query<GastoDetalleRow>(
      `${SELECT_DETALLE} WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return rows[0] ?? null;
  }

  async lockById(id: string, db: Queryable): Promise<GastoRow | null> {
    const { rows } = await db.query<GastoRow>('SELECT * FROM gasto WHERE id = $1 FOR UPDATE', [id]);
    return rows[0] ?? null;
  }

  // Debe llamarse dentro de una transacción (recibe el client): el advisory lock
  // serializa los gastos de la automotora hasta el COMMIT, así dos gastos
  // simultáneos no obtienen el mismo número.
  async create(data: NuevoGasto, db: PoolClient): Promise<GastoRow> {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `numero:gasto:${data.automotoraId}`,
    ]);
    const { rows } = await db.query<GastoRow>(
      `INSERT INTO gasto
         (automotora_id, numero, tipo, vehiculo_id, sucursal_id, categoria, monto, fecha,
          comentario, archivo_adjunto_url, usuario_id)
       VALUES ($1, (SELECT COALESCE(MAX(numero), 0) + 1 FROM gasto WHERE automotora_id = $1),
               $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.automotoraId,
        data.tipo,
        data.vehiculoId,
        data.sucursalId,
        data.categoria,
        data.monto,
        data.fecha,
        data.comentario,
        data.archivoAdjuntoUrl,
        data.usuarioId,
      ],
    );
    return rows[0];
  }

  async update(id: string, cambios: CambiosGasto, db: Queryable = this.pool): Promise<void> {
    const columnas: Record<keyof CambiosGasto, string> = {
      categoria: 'categoria',
      monto: 'monto',
      fecha: 'fecha',
      comentario: 'comentario',
    };
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const campo of Object.keys(columnas) as (keyof CambiosGasto)[]) {
      if (cambios[campo] === undefined) continue;
      params.push(cambios[campo]);
      sets.push(`${columnas[campo]} = $${params.length}`);
    }
    if (sets.length === 0) return;
    await db.query(`UPDATE gasto SET ${sets.join(', ')} WHERE id = $1`, params);
  }

  async anular(id: string, db: Queryable = this.pool): Promise<void> {
    await db.query(`UPDATE gasto SET estado = 'ANULADO' WHERE id = $1`, [id]);
  }

  async setAdjunto(id: string, clave: string, db: Queryable = this.pool): Promise<void> {
    await db.query('UPDATE gasto SET archivo_adjunto_url = $2 WHERE id = $1', [id, clave]);
  }

  async sumaActivosPorVehiculo(vehiculoId: string, db: Queryable = this.pool): Promise<number> {
    const { rows } = await db.query<{ total: string }>(
      `SELECT COALESCE(sum(monto), 0) AS total FROM gasto WHERE vehiculo_id = $1 AND estado = 'ACTIVO'`,
      [vehiculoId],
    );
    return Number(rows[0].total);
  }
}
