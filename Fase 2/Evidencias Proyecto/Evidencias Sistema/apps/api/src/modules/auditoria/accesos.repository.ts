import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export type EventoAcceso =
  | 'LOGIN_EXITOSO'
  | 'LOGIN_FALLIDO'
  | 'LOGOUT'
  | 'REGISTRO_AUTOMOTORA'
  | 'EMAIL_VERIFICADO'
  | 'INVITACION_ACEPTADA'
  | 'RESET_SOLICITADO'
  | 'PASSWORD_RESTABLECIDO';

export type MotivoLoginFallido = 'PASSWORD_INCORRECTA' | 'CUENTA_INACTIVA' | 'EMAIL_SIN_VERIFICAR';

export interface NuevoAcceso {
  automotoraId: string;
  usuarioId: string;
  evento: EventoAcceso;
  motivo?: MotivoLoginFallido | null;
  ip: string | null;
  userAgent: string | null;
}

export interface AccesoRow {
  id: string;
  usuario_id: string;
  usuario_nombre: string;
  usuario_email: string;
  evento: EventoAcceso;
  motivo: string | null;
  ip: string | null;
  user_agent: string | null;
  fecha: Date;
}

export interface FiltroAccesos {
  usuarioId?: string;
  evento?: string;
  desde?: string;
  hasta?: string;
  limit: number;
  offset: number;
}

// Registro de accesos: inicios y cierres de sesión y cambios de credenciales.
// Inmutable (trigger en la BD).
@Injectable()
export class AccesosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async registrar(data: NuevoAcceso, db: Queryable = this.pool): Promise<void> {
    await db.query(
      `INSERT INTO registro_acceso (automotora_id, usuario_id, evento, motivo, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        data.automotoraId,
        data.usuarioId,
        data.evento,
        data.motivo ?? null,
        data.ip,
        // El user agent lo escribe el cliente: se acota para no guardar textos enormes.
        data.userAgent?.slice(0, 400) ?? null,
      ],
    );
  }

  async findAll(
    automotoraId: string,
    filtro: FiltroAccesos,
    db: Queryable = this.pool,
  ): Promise<{ rows: AccesoRow[]; total: number }> {
    const conditions = ['r.automotora_id = $1'];
    const params: unknown[] = [automotoraId];
    const agregar = (condicion: (p: string) => string, valor: unknown) => {
      params.push(valor);
      conditions.push(condicion(`$${params.length}`));
    };
    if (filtro.usuarioId) agregar((p) => `r.usuario_id = ${p}`, filtro.usuarioId);
    if (filtro.evento) agregar((p) => `r.evento::text = ${p}`, filtro.evento);
    if (filtro.desde)
      agregar((p) => `(r.fecha AT TIME ZONE 'America/Santiago')::date >= ${p}`, filtro.desde);
    if (filtro.hasta)
      agregar((p) => `(r.fecha AT TIME ZONE 'America/Santiago')::date <= ${p}`, filtro.hasta);
    const where = conditions.join(' AND ');

    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM registro_acceso r WHERE ${where}`,
      params,
    );
    params.push(filtro.limit, filtro.offset);
    const { rows } = await db.query<AccesoRow>(
      `SELECT r.id, r.usuario_id, u.nombre AS usuario_nombre, u.email AS usuario_email,
              r.evento, r.motivo, r.ip, r.user_agent, r.fecha
       FROM registro_acceso r
       JOIN usuario u ON u.id = r.usuario_id
       WHERE ${where}
       ORDER BY r.fecha DESC, r.id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total) };
  }
}
