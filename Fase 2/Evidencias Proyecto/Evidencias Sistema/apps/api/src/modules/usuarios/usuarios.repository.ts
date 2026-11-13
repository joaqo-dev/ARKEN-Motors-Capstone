import { Inject, Injectable } from '@nestjs/common';
import type { EstadoUsuario, RolUsuario } from '@vitriauto/shared-types';
import { Pool } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';

// Valor imposible de verificar con argon2: el usuario invitado no puede
// iniciar sesión hasta definir su contraseña.
export const PASSWORD_PENDIENTE = '!INVITACION_PENDIENTE';

export interface UsuarioRow {
  id: string;
  automotora_id: string;
  sucursal_id: string | null;
  nombre: string;
  email: string;
  rol: RolUsuario;
  email_verificado: boolean;
  estado: EstadoUsuario;
  fecha_creacion: Date;
  invitacion_pendiente: boolean;
}

export interface UsuarioConPasswordRow extends UsuarioRow {
  password_hash: string;
}

export interface NuevoUsuario {
  automotoraId: string;
  sucursalId: string | null;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: RolUsuario;
  // Versión de los Términos que aceptó (solo quien registra la automotora).
  terminosVersion?: string | null;
}

export interface CambiosUsuario {
  nombre?: string;
  rol?: RolUsuario;
  sucursalId?: string | null;
}

const COLUMNAS = `id, automotora_id, sucursal_id, nombre, email, rol, email_verificado, estado,
  fecha_creacion, (password_hash = '${PASSWORD_PENDIENTE}') AS invitacion_pendiente`;

@Injectable()
export class UsuariosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // Para login: única consulta que devuelve el hash de la contraseña.
  async findByEmailConPassword(
    email: string,
    db: Queryable = this.pool,
  ): Promise<UsuarioConPasswordRow | null> {
    const { rows } = await db.query<UsuarioConPasswordRow>(
      `SELECT ${COLUMNAS}, password_hash FROM usuario WHERE email = $1`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findByEmail(email: string, db: Queryable = this.pool): Promise<UsuarioRow | null> {
    const { rows } = await db.query<UsuarioRow>(
      `SELECT ${COLUMNAS} FROM usuario WHERE email = $1`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findById(id: string, db: Queryable = this.pool): Promise<UsuarioRow | null> {
    const { rows } = await db.query<UsuarioRow>(`SELECT ${COLUMNAS} FROM usuario WHERE id = $1`, [
      id,
    ]);
    return rows[0] ?? null;
  }

  async findByIdScoped(
    id: string,
    scope: Scope,
    db: Queryable = this.pool,
  ): Promise<UsuarioRow | null> {
    const conditions = ['id = $1', 'automotora_id = $2'];
    const params: unknown[] = [id, scope.automotoraId];
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      conditions.push(`sucursal_id = $${params.length}`);
    }
    const { rows } = await db.query<UsuarioRow>(
      `SELECT ${COLUMNAS} FROM usuario WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return rows[0] ?? null;
  }

  async findAllScoped(scope: Scope, db: Queryable = this.pool): Promise<UsuarioRow[]> {
    const conditions = ['automotora_id = $1'];
    const params: unknown[] = [scope.automotoraId];
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      conditions.push(`sucursal_id = $${params.length}`);
    }
    const { rows } = await db.query<UsuarioRow>(
      `SELECT ${COLUMNAS} FROM usuario WHERE ${conditions.join(' AND ')} ORDER BY nombre`,
      params,
    );
    return rows;
  }

  async existeEmail(email: string, db: Queryable = this.pool): Promise<boolean> {
    const { rows } = await db.query('SELECT 1 FROM usuario WHERE email = $1', [email]);
    return rows.length > 0;
  }

  async create(data: NuevoUsuario, db: Queryable = this.pool): Promise<UsuarioRow> {
    const { rows } = await db.query<UsuarioRow>(
      `INSERT INTO usuario (automotora_id, sucursal_id, nombre, email, password_hash, rol,
                            terminos_version, terminos_aceptados_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text, CASE WHEN $7::text IS NULL THEN NULL ELSE now() END)
       RETURNING ${COLUMNAS}`,
      [
        data.automotoraId,
        data.sucursalId,
        data.nombre,
        data.email,
        data.passwordHash,
        data.rol,
        data.terminosVersion ?? null,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    automotoraId: string,
    cambios: CambiosUsuario,
    db: Queryable = this.pool,
  ): Promise<UsuarioRow> {
    const columnas: Record<keyof CambiosUsuario, string> = {
      nombre: 'nombre',
      rol: 'rol',
      sucursalId: 'sucursal_id',
    };
    const sets: string[] = [];
    const params: unknown[] = [id, automotoraId];
    for (const campo of Object.keys(columnas) as (keyof CambiosUsuario)[]) {
      if (cambios[campo] === undefined) continue;
      params.push(cambios[campo]);
      sets.push(`${columnas[campo]} = $${params.length}`);
    }
    const { rows } = await db.query<UsuarioRow>(
      sets.length === 0
        ? `SELECT ${COLUMNAS} FROM usuario WHERE id = $1 AND automotora_id = $2`
        : `UPDATE usuario SET ${sets.join(', ')} WHERE id = $1 AND automotora_id = $2
           RETURNING ${COLUMNAS}`,
      params,
    );
    return rows[0];
  }

  async setEstado(
    id: string,
    estado: EstadoUsuario,
    db: Queryable = this.pool,
  ): Promise<UsuarioRow> {
    const { rows } = await db.query<UsuarioRow>(
      `UPDATE usuario SET estado = $2 WHERE id = $1 RETURNING ${COLUMNAS}`,
      [id, estado],
    );
    return rows[0];
  }

  async setPassword(id: string, passwordHash: string, db: Queryable = this.pool): Promise<void> {
    await db.query('UPDATE usuario SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
  }

  async marcarEmailVerificado(id: string, db: Queryable = this.pool): Promise<void> {
    await db.query('UPDATE usuario SET email_verificado = true WHERE id = $1', [id]);
  }
}
