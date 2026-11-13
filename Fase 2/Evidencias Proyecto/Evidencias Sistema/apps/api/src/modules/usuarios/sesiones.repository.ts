import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export interface NuevaSesion {
  usuarioId: string;
  refreshTokenHash: string;
  fechaExpiracion: Date;
  userAgent: string | null;
  ip: string | null;
}

@Injectable()
export class SesionesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(data: NuevaSesion, db: Queryable = this.pool): Promise<void> {
    await db.query(
      `INSERT INTO sesion (usuario_id, refresh_token_hash, fecha_expiracion, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5)`,
      [data.usuarioId, data.refreshTokenHash, data.fechaExpiracion, data.userAgent, data.ip],
    );
  }

  // Revoca atómicamente una sesión vigente (para rotación en refresh).
  // Devuelve el usuario dueño, o null si la sesión no existe, expiró o ya estaba revocada.
  async revocarVigente(
    refreshTokenHash: string,
    db: Queryable = this.pool,
  ): Promise<string | null> {
    const { rows } = await db.query<{ usuario_id: string }>(
      `UPDATE sesion SET revocada = true
       WHERE refresh_token_hash = $1 AND revocada = false AND fecha_expiracion > now()
       RETURNING usuario_id`,
      [refreshTokenHash],
    );
    return rows[0]?.usuario_id ?? null;
  }

  async revocarTodasDeUsuario(usuarioId: string, db: Queryable = this.pool): Promise<void> {
    await db.query('UPDATE sesion SET revocada = true WHERE usuario_id = $1 AND revocada = false', [
      usuarioId,
    ]);
  }
}
