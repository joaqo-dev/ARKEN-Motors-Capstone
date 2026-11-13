import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export type TipoTokenAccion = 'VERIFICACION_EMAIL' | 'INVITACION_USUARIO' | 'RESET_PASSWORD';

@Injectable()
export class TokensAccionRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(
    usuarioId: string,
    tipo: TipoTokenAccion,
    tokenHash: string,
    fechaExpiracion: Date,
    db: Queryable = this.pool,
  ): Promise<void> {
    await db.query(
      `INSERT INTO token_accion (usuario_id, tipo, token_hash, fecha_expiracion)
       VALUES ($1, $2, $3, $4)`,
      [usuarioId, tipo, tokenHash, fechaExpiracion],
    );
  }

  // Marca como usado un token válido (no usado, no expirado) de forma atómica.
  // Devuelve el usuario dueño, o null si el token no sirve.
  async consumir(
    tokenHash: string,
    tipo: TipoTokenAccion,
    db: Queryable = this.pool,
  ): Promise<string | null> {
    const { rows } = await db.query<{ usuario_id: string }>(
      `UPDATE token_accion SET usado = true
       WHERE token_hash = $1 AND tipo = $2 AND usado = false AND fecha_expiracion > now()
       RETURNING usuario_id`,
      [tokenHash, tipo],
    );
    return rows[0]?.usuario_id ?? null;
  }

  // Al emitir un token nuevo, los anteriores del mismo tipo quedan inútiles.
  async invalidarPendientes(
    usuarioId: string,
    tipo: TipoTokenAccion,
    db: Queryable = this.pool,
  ): Promise<void> {
    await db.query(
      'UPDATE token_accion SET usado = true WHERE usuario_id = $1 AND tipo = $2 AND usado = false',
      [usuarioId, tipo],
    );
  }
}
