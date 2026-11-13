import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

// Documentos con folio correlativo por automotora (compartido entre
// sucursales): UNIQUE(automotora_id, folio).
export type TablaConFolio = 'consignacion' | 'cotizacion' | 'reserva' | 'tasacion' | 'venta';

const TABLAS: readonly TablaConFolio[] = [
  'consignacion',
  'cotizacion',
  'reserva',
  'tasacion',
  'venta',
];

@Injectable()
export class FoliosRepository {
  // Debe llamarse dentro de una transacción (recibe el client): el advisory lock
  // serializa las emisiones de la automotora hasta el COMMIT, así dos documentos
  // simultáneos no obtienen el mismo folio.
  async siguiente(tabla: TablaConFolio, automotoraId: string, client: PoolClient): Promise<number> {
    if (!TABLAS.includes(tabla)) throw new Error(`Tabla sin folio: ${tabla}`);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `folio:${tabla}:${automotoraId}`,
    ]);
    const { rows } = await client.query<{ folio: number }>(
      `SELECT COALESCE(MAX(folio), 0) + 1 AS folio FROM ${tabla} WHERE automotora_id = $1`,
      [automotoraId],
    );
    return rows[0].folio;
  }
}
