import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';

export interface NuevaAuditoria {
  automotoraId: string;
  usuarioId: string;
  // null = acción a nivel de toda la automotora (solo visible para ADMIN_GENERAL).
  sucursalId: string | null;
  accion: string;
  entidadTipo: string;
  entidadId: string;
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
}

export interface AuditoriaRow {
  id: string;
  sucursal_id: string | null;
  sucursal_nombre: string | null;
  usuario_id: string;
  usuario_nombre: string;
  usuario_email: string;
  accion: string;
  entidad_tipo: string;
  entidad_id: string;
  valor_anterior: Record<string, unknown> | null;
  valor_nuevo: Record<string, unknown> | null;
  fecha: Date;
}

export interface FiltroAuditoria {
  desde?: string;
  hasta?: string;
  accion?: string;
  entidadTipo?: string;
  entidadId?: string;
  usuarioId?: string;
  sucursalId?: string;
  soloAutomotora?: boolean;
  limit: number;
  offset: number;
}

// Registro de auditoría (Módulo 16). Se llama dentro de la misma transacción
// que el cambio auditado, para que nunca quede un cambio sin su registro.
@Injectable()
export class AuditoriaRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async registrar(data: NuevaAuditoria, db: Queryable = this.pool): Promise<void> {
    await db.query(
      `INSERT INTO auditoria
         (automotora_id, usuario_id, sucursal_id, accion, entidad_tipo, entidad_id, valor_anterior, valor_nuevo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        data.automotoraId,
        data.usuarioId,
        data.sucursalId,
        data.accion,
        data.entidadTipo,
        data.entidadId,
        data.valorAnterior === null ? null : JSON.stringify(data.valorAnterior),
        data.valorNuevo === null ? null : JSON.stringify(data.valorNuevo),
      ],
    );
  }

  // Visibilidad (Módulo 16): ADMIN_GENERAL ve todo; ADMIN_SUCURSAL solo las filas
  // de su sucursal (las de nivel automotora, con sucursal_id NULL, no las ve).
  async findAll(
    scope: Scope,
    filtro: FiltroAuditoria,
    db: Queryable = this.pool,
  ): Promise<{ rows: AuditoriaRow[]; total: number }> {
    const conditions = ['a.automotora_id = $1'];
    const params: unknown[] = [scope.automotoraId];
    const agregar = (condicion: (p: string) => string, valor: unknown) => {
      params.push(valor);
      conditions.push(condicion(`$${params.length}`));
    };
    if (scope.sucursalId) agregar((p) => `a.sucursal_id = ${p}`, scope.sucursalId);
    if (filtro.sucursalId) agregar((p) => `a.sucursal_id = ${p}`, filtro.sucursalId);
    if (filtro.soloAutomotora) conditions.push('a.sucursal_id IS NULL');
    if (filtro.accion) agregar((p) => `a.accion = ${p}`, filtro.accion);
    if (filtro.entidadTipo) agregar((p) => `a.entidad_tipo = ${p}`, filtro.entidadTipo);
    if (filtro.entidadId) agregar((p) => `a.entidad_id = ${p}`, filtro.entidadId);
    if (filtro.usuarioId) agregar((p) => `a.usuario_id = ${p}`, filtro.usuarioId);
    if (filtro.desde)
      agregar((p) => `(a.fecha AT TIME ZONE 'America/Santiago')::date >= ${p}`, filtro.desde);
    if (filtro.hasta)
      agregar((p) => `(a.fecha AT TIME ZONE 'America/Santiago')::date <= ${p}`, filtro.hasta);
    const where = conditions.join(' AND ');

    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM auditoria a WHERE ${where}`,
      params,
    );
    params.push(filtro.limit, filtro.offset);
    const { rows } = await db.query<AuditoriaRow>(
      `SELECT a.id, a.sucursal_id, s.nombre AS sucursal_nombre, a.usuario_id, u.nombre AS usuario_nombre,
              u.email AS usuario_email, a.accion, a.entidad_tipo, a.entidad_id, a.valor_anterior,
              a.valor_nuevo, a.fecha
       FROM auditoria a
       JOIN usuario u ON u.id = a.usuario_id
       LEFT JOIN sucursal s ON s.id = a.sucursal_id
       WHERE ${where}
       ORDER BY a.fecha DESC, a.id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total) };
  }
}
