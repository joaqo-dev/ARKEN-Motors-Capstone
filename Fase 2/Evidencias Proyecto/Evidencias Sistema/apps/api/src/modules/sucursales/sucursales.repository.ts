import { Inject, Injectable } from '@nestjs/common';
import type { RegionChile } from '@vitriauto/shared-types';
import { Pool } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';

export interface SucursalRow {
  id: string;
  automotora_id: string;
  nombre: string;
  direccion: string;
  region: RegionChile;
  comuna: string;
  telefono: string;
  encargado: string | null;
  horario_atencion: string | null;
  whatsapp: string | null;
  es_principal: boolean;
  activa: boolean;
  fecha_creacion: Date;
}

export interface NuevaSucursal {
  automotoraId: string;
  nombre: string;
  direccion: string;
  region: RegionChile;
  comuna: string;
  telefono: string;
  encargado: string | null;
  horarioAtencion?: string | null;
  whatsapp?: string | null;
  esPrincipal: boolean;
}

export interface CambiosSucursal {
  nombre?: string;
  direccion?: string;
  region?: RegionChile;
  comuna?: string;
  telefono?: string;
  encargado?: string | null;
  horarioAtencion?: string | null;
  whatsapp?: string | null;
}

@Injectable()
export class SucursalesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAllScoped(scope: Scope, db: Queryable = this.pool): Promise<SucursalRow[]> {
    const conditions = ['automotora_id = $1', 'activa = true'];
    const params: unknown[] = [scope.automotoraId];
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      conditions.push(`id = $${params.length}`);
    }
    const { rows } = await db.query<SucursalRow>(
      `SELECT * FROM sucursal WHERE ${conditions.join(' AND ')}
       ORDER BY es_principal DESC, nombre`,
      params,
    );
    return rows;
  }

  async findByIdScoped(
    id: string,
    scope: Scope,
    db: Queryable = this.pool,
  ): Promise<SucursalRow | null> {
    const conditions = ['id = $1', 'automotora_id = $2', 'activa = true'];
    const params: unknown[] = [id, scope.automotoraId];
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      conditions.push(`id = $${params.length}`);
    }
    const { rows } = await db.query<SucursalRow>(
      `SELECT * FROM sucursal WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return rows[0] ?? null;
  }

  async create(data: NuevaSucursal, db: Queryable = this.pool): Promise<SucursalRow> {
    const { rows } = await db.query<SucursalRow>(
      `INSERT INTO sucursal
         (automotora_id, nombre, direccion, region, comuna, telefono, encargado, horario_atencion,
          whatsapp, es_principal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.automotoraId,
        data.nombre,
        data.direccion,
        data.region,
        data.comuna,
        data.telefono,
        data.encargado,
        data.horarioAtencion ?? null,
        data.whatsapp ?? null,
        data.esPrincipal,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    automotoraId: string,
    cambios: CambiosSucursal,
    db: Queryable = this.pool,
  ): Promise<SucursalRow> {
    // Nombres de columna fijos (lista blanca); solo los valores van como parámetros.
    const columnas: Record<keyof CambiosSucursal, string> = {
      nombre: 'nombre',
      direccion: 'direccion',
      region: 'region',
      comuna: 'comuna',
      telefono: 'telefono',
      encargado: 'encargado',
      horarioAtencion: 'horario_atencion',
      whatsapp: 'whatsapp',
    };
    const sets: string[] = [];
    const params: unknown[] = [id, automotoraId];
    for (const campo of Object.keys(columnas) as (keyof CambiosSucursal)[]) {
      if (cambios[campo] === undefined) continue;
      params.push(cambios[campo]);
      sets.push(`${columnas[campo]} = $${params.length}`);
    }
    if (sets.length === 0) {
      const { rows } = await db.query<SucursalRow>(
        'SELECT * FROM sucursal WHERE id = $1 AND automotora_id = $2',
        params,
      );
      return rows[0];
    }
    const { rows } = await db.query<SucursalRow>(
      `UPDATE sucursal SET ${sets.join(', ')}
       WHERE id = $1 AND automotora_id = $2
       RETURNING *`,
      params,
    );
    return rows[0];
  }

  async darDeBaja(id: string, automotoraId: string, db: Queryable = this.pool): Promise<void> {
    await db.query('UPDATE sucursal SET activa = false WHERE id = $1 AND automotora_id = $2', [
      id,
      automotoraId,
    ]);
  }

  // Vehículos activos: cualquier estado salvo VENDIDO / DADO_DE_BAJA.
  async contarVehiculosActivos(id: string, db: Queryable = this.pool): Promise<number> {
    const { rows } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM vehiculo
       WHERE sucursal_id = $1 AND estado NOT IN ('VENDIDO', 'DADO_DE_BAJA')`,
      [id],
    );
    return Number(rows[0].total);
  }

  async contarUsuariosActivos(id: string, db: Queryable = this.pool): Promise<number> {
    const { rows } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM usuario WHERE sucursal_id = $1 AND estado = 'ACTIVO'`,
      [id],
    );
    return Number(rows[0].total);
  }
}
