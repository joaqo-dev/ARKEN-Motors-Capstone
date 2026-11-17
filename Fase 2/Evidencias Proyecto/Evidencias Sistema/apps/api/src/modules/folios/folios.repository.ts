import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

// Documentos con folio correlativo POR AUTOMOTORA (compartido entre sus
// sucursales): UNIQUE(automotora_id, folio). Así un folio identifica un solo
// documento de cada tipo en toda la automotora.
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
  // Debe llamarse dentro de una transacción (recibe el client, no el pool): el
  // advisory lock serializa las emisiones de la misma automotora hasta el COMMIT,
  // así dos documentos simultáneos (aunque sean de sucursales distintas) no
  // obtienen el mismo folio.
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
