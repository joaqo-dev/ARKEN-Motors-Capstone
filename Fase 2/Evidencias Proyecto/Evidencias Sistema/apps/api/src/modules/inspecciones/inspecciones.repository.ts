import { Inject, Injectable } from '@nestjs/common';
import type { EvaluacionInspeccion, ResultadoInspeccion } from '@vitriauto/shared-types';
import { Pool, PoolClient } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export interface InspeccionRow {
  id: string;
  automotora_id: string;
  sucursal_id: string;
  vehiculo_id: string;
  kilometraje: number;
  observaciones: string | null;
  estado: 'BORRADOR' | 'FINALIZADA';
  resultado: ResultadoInspeccion | null;
  usuario_id: string;
  fecha_creacion: Date;
  usuario_finalizacion_id: string | null;
  fecha_finalizacion: Date | null;
}

// Con los nombres de quienes la iniciaron y finalizaron.
export interface InspeccionDetalleRow extends InspeccionRow {
  usuario_nombre: string;
  finalizada_por: string | null;
  puntos_total: number;
  puntos_evaluados: number;
}

export interface FotoRow {
  id: string;
  url: string;
}

export interface PuntoRow {
  id: string;
  seccion: string;
  codigo: string | null;
  nombre: string;
  orden: number;
  evaluacion: EvaluacionInspeccion | null;
  observacion: string | null;
  nota_interna: string | null;
  fotos: FotoRow[];
}

export interface NuevoPunto {
  seccion: string;
  codigo: string | null;
  nombre: string;
  orden: number;
}

export interface CambiosPunto {
  evaluacion?: EvaluacionInspeccion | null;
  observacion?: string | null;
  notaInterna?: string | null;
  nombre?: string;
}

const SELECT_DETALLE = `
  SELECT i.*, u.nombre AS usuario_nombre, uf.nombre AS finalizada_por,
         (SELECT count(*)::int FROM inspeccion_punto p WHERE p.inspeccion_id = i.id) AS puntos_total,
         (SELECT count(*)::int FROM inspeccion_punto p
           WHERE p.inspeccion_id = i.id AND p.evaluacion IS NOT NULL) AS puntos_evaluados
  FROM inspeccion i
  JOIN usuario u ON u.id = i.usuario_id
  LEFT JOIN usuario uf ON uf.id = i.usuario_finalizacion_id`;

const SELECT_PUNTOS = `
  SELECT p.id, p.seccion, p.codigo, p.nombre, p.orden, p.evaluacion, p.observacion, p.nota_interna,
         COALESCE((SELECT json_agg(json_build_object('id', f.id, 'url', f.url) ORDER BY f.fecha_carga)
                   FROM inspeccion_foto f WHERE f.punto_id = p.id), '[]') AS fotos
  FROM inspeccion_punto p`;

// Inspección pre-compra (Módulo 7.11). El acceso se valida contra el vehículo
// (su sucursal actual) en el Service.
@Injectable()
export class InspeccionesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async crear(
    data: {
      automotoraId: string;
      sucursalId: string;
      vehiculoId: string;
      kilometraje: number;
      usuarioId: string;
    },
    puntos: NuevoPunto[],
    client: PoolClient,
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO inspeccion (automotora_id, sucursal_id, vehiculo_id, kilometraje, usuario_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [data.automotoraId, data.sucursalId, data.vehiculoId, data.kilometraje, data.usuarioId],
    );
    const id = rows[0].id;
    await client.query(
      `INSERT INTO inspeccion_punto (inspeccion_id, seccion, codigo, nombre, orden)
       SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::int[])`,
      [
        id,
        puntos.map((p) => p.seccion),
        puntos.map((p) => p.codigo),
        puntos.map((p) => p.nombre),
        puntos.map((p) => p.orden),
      ],
    );
    return id;
  }

  async porId(id: string, db: Queryable = this.pool): Promise<InspeccionDetalleRow | null> {
    const { rows } = await db.query<InspeccionDetalleRow>(`${SELECT_DETALLE} WHERE i.id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async bloquear(id: string, db: Queryable): Promise<InspeccionRow | null> {
    const { rows } = await db.query<InspeccionRow>(
      'SELECT * FROM inspeccion WHERE id = $1 FOR UPDATE',
      [id],
    );
    return rows[0] ?? null;
  }

  // Historial del vehículo: la más reciente primero (los borradores arriba).
  async porVehiculo(vehiculoId: string, db: Queryable = this.pool) {
    const { rows } = await db.query<InspeccionDetalleRow>(
      `${SELECT_DETALLE} WHERE i.vehiculo_id = $1
       ORDER BY (i.estado = 'BORRADOR') DESC, COALESCE(i.fecha_finalizacion, i.fecha_creacion) DESC`,
      [vehiculoId],
    );
    return rows;
  }

  async puntos(inspeccionId: string, db: Queryable = this.pool): Promise<PuntoRow[]> {
    const { rows } = await db.query<PuntoRow>(
      `${SELECT_PUNTOS} WHERE p.inspeccion_id = $1 ORDER BY p.orden`,
      [inspeccionId],
    );
    return rows;
  }

  async punto(
    puntoId: string,
    inspeccionId: string,
    db: Queryable = this.pool,
  ): Promise<PuntoRow | null> {
    const { rows } = await db.query<PuntoRow>(
      `${SELECT_PUNTOS} WHERE p.id = $1 AND p.inspeccion_id = $2`,
      [puntoId, inspeccionId],
    );
    return rows[0] ?? null;
  }

  async actualizar(
    id: string,
    cambios: { kilometraje?: number; observaciones?: string | null },
    db: Queryable = this.pool,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    if (cambios.kilometraje !== undefined) {
      params.push(cambios.kilometraje);
      sets.push(`kilometraje = $${params.length}`);
    }
    if (cambios.observaciones !== undefined) {
      params.push(cambios.observaciones);
      sets.push(`observaciones = $${params.length}`);
    }
    if (sets.length)
      await db.query(`UPDATE inspeccion SET ${sets.join(', ')} WHERE id = $1`, params);
  }

  async actualizarPunto(puntoId: string, cambios: CambiosPunto, db: Queryable = this.pool) {
    const columnas: Record<keyof CambiosPunto, string> = {
      evaluacion: 'evaluacion',
      observacion: 'observacion',
      notaInterna: 'nota_interna',
      nombre: 'nombre',
    };
    const sets: string[] = [];
    const params: unknown[] = [puntoId];
    for (const campo of Object.keys(columnas) as (keyof CambiosPunto)[]) {
      if (cambios[campo] === undefined) continue;
      params.push(cambios[campo]);
      sets.push(`${columnas[campo]} = $${params.length}`);
    }
    if (sets.length) {
      await db.query(`UPDATE inspeccion_punto SET ${sets.join(', ')} WHERE id = $1`, params);
    }
  }

  // Punto propio al final de su sección.
  async agregarPunto(
    inspeccionId: string,
    seccion: string,
    nombre: string,
    db: Queryable = this.pool,
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO inspeccion_punto (inspeccion_id, seccion, codigo, nombre, orden)
       VALUES ($1, $2, NULL, $3,
         COALESCE((SELECT max(orden) FROM inspeccion_punto WHERE inspeccion_id = $1), 0) + 1)
       RETURNING id`,
      [inspeccionId, seccion, nombre],
    );
    return rows[0].id;
  }

  // Devuelve las fotos del punto para borrar sus archivos.
  async eliminarPunto(puntoId: string, db: Queryable = this.pool): Promise<string[]> {
    const { rows } = await db.query<{ url: string }>(
      'SELECT url FROM inspeccion_foto WHERE punto_id = $1',
      [puntoId],
    );
    await db.query('DELETE FROM inspeccion_punto WHERE id = $1', [puntoId]);
    return rows.map((r) => r.url);
  }

  async contarFotos(puntoId: string, db: Queryable = this.pool): Promise<number> {
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM inspeccion_foto WHERE punto_id = $1',
      [puntoId],
    );
    return rows[0].n;
  }

  async agregarFoto(puntoId: string, url: string, db: Queryable = this.pool) {
    await db.query('INSERT INTO inspeccion_foto (punto_id, url) VALUES ($1, $2)', [puntoId, url]);
  }

  // Solo si la foto pertenece a esta inspección. Devuelve su URL (o null).
  async eliminarFoto(
    fotoId: string,
    inspeccionId: string,
    db: Queryable = this.pool,
  ): Promise<string | null> {
    const { rows } = await db.query<{ url: string }>(
      `DELETE FROM inspeccion_foto f USING inspeccion_punto p
       WHERE f.id = $1 AND f.punto_id = p.id AND p.inspeccion_id = $2
       RETURNING f.url`,
      [fotoId, inspeccionId],
    );
    return rows[0]?.url ?? null;
  }

  async finalizar(
    id: string,
    resultado: ResultadoInspeccion,
    usuarioId: string,
    db: Queryable,
  ): Promise<void> {
    await db.query(
      `UPDATE inspeccion
       SET estado = 'FINALIZADA', resultado = $2, usuario_finalizacion_id = $3, fecha_finalizacion = now()
       WHERE id = $1`,
      [id, resultado, usuarioId],
    );
  }

  // Descarta un borrador; devuelve las URLs de sus fotos para borrar los archivos.
  async eliminar(id: string, db: Queryable): Promise<string[]> {
    const { rows } = await db.query<{ url: string }>(
      `SELECT f.url FROM inspeccion_foto f JOIN inspeccion_punto p ON p.id = f.punto_id
       WHERE p.inspeccion_id = $1`,
      [id],
    );
    await db.query('DELETE FROM inspeccion WHERE id = $1', [id]);
    return rows.map((r) => r.url);
  }

  // La que se publica: la última finalizada del vehículo, solo si está aprobada
  // (con o sin observaciones). Si la última no lo está, no se publica ninguna.
  async publicaDeVehiculo(vehiculoId: string, db: Queryable = this.pool) {
    const { rows } = await db.query<InspeccionRow>(
      `SELECT * FROM (
         SELECT * FROM inspeccion
         WHERE vehiculo_id = $1 AND estado = 'FINALIZADA'
         ORDER BY fecha_finalizacion DESC LIMIT 1
       ) ultima
       WHERE resultado IN ('APROBADO', 'APROBADO_CON_OBSERVACIONES')`,
      [vehiculoId],
    );
    return rows[0] ?? null;
  }
}
