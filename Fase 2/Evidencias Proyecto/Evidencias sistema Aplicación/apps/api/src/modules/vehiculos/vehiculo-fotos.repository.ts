import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export interface FotoRow {
  id: string;
  vehiculo_id: string;
  url: string;
  orden: number;
}

@Injectable()
export class VehiculoFotosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByVehiculo(vehiculoId: string, db: Queryable = this.pool): Promise<FotoRow[]> {
    const { rows } = await db.query<FotoRow>(
      'SELECT * FROM vehiculo_foto WHERE vehiculo_id = $1 ORDER BY orden',
      [vehiculoId],
    );
    return rows;
  }

  async contar(vehiculoId: string, db: Queryable = this.pool): Promise<number> {
    const { rows } = await db.query<{ total: string }>(
      'SELECT count(*) AS total FROM vehiculo_foto WHERE vehiculo_id = $1',
      [vehiculoId],
    );
    return Number(rows[0].total);
  }

  async create(
    vehiculoId: string,
    url: string,
    orden: number,
    db: Queryable = this.pool,
  ): Promise<FotoRow> {
    const { rows } = await db.query<FotoRow>(
      'INSERT INTO vehiculo_foto (vehiculo_id, url, orden) VALUES ($1, $2, $3) RETURNING *',
      [vehiculoId, url, orden],
    );
    return rows[0];
  }

  // Borra la foto y compacta el orden de las siguientes (la portada siempre es orden = 1).
  async deleteYCompactar(
    vehiculoId: string,
    fotoId: string,
    db: Queryable,
  ): Promise<FotoRow | null> {
    const { rows } = await db.query<FotoRow>(
      'DELETE FROM vehiculo_foto WHERE id = $1 AND vehiculo_id = $2 RETURNING *',
      [fotoId, vehiculoId],
    );
    const borrada = rows[0];
    if (!borrada) return null;
    await db.query(
      'UPDATE vehiculo_foto SET orden = orden - 1 WHERE vehiculo_id = $1 AND orden > $2',
      [vehiculoId, borrada.orden],
    );
    return borrada;
  }

  // Requiere transacción: el UNIQUE(vehiculo_id, orden) es diferido hasta el COMMIT.
  async reordenar(vehiculoId: string, fotoIdsEnOrden: string[], db: Queryable): Promise<void> {
    await db.query(
      `UPDATE vehiculo_foto f SET orden = n.orden
       FROM unnest($2::uuid[]) WITH ORDINALITY AS n(id, orden)
       WHERE f.id = n.id AND f.vehiculo_id = $1`,
      [vehiculoId, fotoIdsEnOrden],
    );
  }
}
