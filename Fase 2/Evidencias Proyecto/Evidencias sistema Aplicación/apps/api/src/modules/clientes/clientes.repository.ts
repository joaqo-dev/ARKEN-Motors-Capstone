import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export interface ClienteRow {
  id: string;
  automotora_id: string;
  nombre: string;
  rut: string;
  telefono: string;
  email: string;
  direccion: string;
  estado: 'ACTIVO' | 'INACTIVO';
  acepta_recordatorios: boolean;
  fecha_creacion: Date;
}

export interface NuevoCliente {
  automotoraId: string;
  nombre: string;
  rut: string;
  telefono: string;
  email: string;
  direccion: string;
}

export type CambiosCliente = Partial<Omit<NuevoCliente, 'automotoraId'>> & {
  aceptaRecordatorios?: boolean;
};

export interface HistorialRow {
  tipo: 'COTIZACION' | 'RESERVA' | 'TASACION' | 'VENTA' | 'CONSIGNACION';
  id: string;
  folio: number;
  sucursal_id: string;
  sucursal_nombre: string;
  fecha: Date;
  estado: string;
  vehiculo_id: string | null;
  vehiculo: string; // patente + descripción (en tasaciones, el auto del cliente)
  monto: string;
}

export interface FiltroClientes {
  q?: string;
  incluirInactivos: boolean;
  limit: number;
  offset: number;
}

// Clientes viven a nivel de automotora (sin sucursal_id, Módulo 6):
// el filtro de tenant es solo automotora_id, para todos los roles.
@Injectable()
export class ClientesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(
    automotoraId: string,
    filtro: FiltroClientes,
    db: Queryable = this.pool,
  ): Promise<{ rows: ClienteRow[]; total: number }> {
    const conditions = ['automotora_id = $1'];
    const params: unknown[] = [automotoraId];
    if (!filtro.incluirInactivos) conditions.push(`estado = 'ACTIVO'`);
    if (filtro.q) {
      // Nombre por coincidencia parcial; RUT comparado sin puntos ni guion.
      params.push(`%${escaparLike(filtro.q)}%`);
      const pNombre = params.length;
      params.push(`%${escaparLike(filtro.q.replace(/[.\s-]/g, '').toUpperCase())}%`);
      const pRut = params.length;
      conditions.push(`(nombre ILIKE $${pNombre} OR replace(rut, '-', '') LIKE $${pRut})`);
    }
    const where = conditions.join(' AND ');

    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM cliente WHERE ${where}`,
      params,
    );
    params.push(filtro.limit, filtro.offset);
    const { rows } = await db.query<ClienteRow>(
      `SELECT * FROM cliente WHERE ${where}
       ORDER BY nombre
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total) };
  }

  async findById(
    id: string,
    automotoraId: string,
    db: Queryable = this.pool,
  ): Promise<ClienteRow | null> {
    const { rows } = await db.query<ClienteRow>(
      'SELECT * FROM cliente WHERE id = $1 AND automotora_id = $2',
      [id, automotoraId],
    );
    return rows[0] ?? null;
  }

  // Historial completo del cliente (Módulo 6, opción A): TODOS sus documentos,
  // de cualquier sucursal, con la sucursal como un dato más de cada fila.
  async historial(
    clienteId: string,
    automotoraId: string,
    db: Queryable = this.pool,
  ): Promise<HistorialRow[]> {
    const vehiculo = `v.patente || ' — ' || v.marca || ' ' || v.modelo || ' ' || v.anio`;
    const { rows } = await db.query<HistorialRow>(
      `SELECT * FROM (
         SELECT 'COTIZACION' AS tipo, d.id, d.folio, d.sucursal_id, s.nombre AS sucursal_nombre,
                d.fecha_emision AS fecha, d.estado::text AS estado, d.vehiculo_id, ${vehiculo} AS vehiculo,
                d.precio_cotizado AS monto
         FROM cotizacion d JOIN vehiculo v ON v.id = d.vehiculo_id JOIN sucursal s ON s.id = d.sucursal_id
         WHERE d.cliente_id = $1 AND d.automotora_id = $2
         UNION ALL
         SELECT 'RESERVA', d.id, d.folio, d.sucursal_id, s.nombre, d.fecha_emision, d.estado::text,
                d.vehiculo_id, ${vehiculo}, d.monto_reserva
         FROM reserva d JOIN vehiculo v ON v.id = d.vehiculo_id JOIN sucursal s ON s.id = d.sucursal_id
         WHERE d.cliente_id = $1 AND d.automotora_id = $2
         UNION ALL
         SELECT 'TASACION', d.id, d.folio, d.sucursal_id, s.nombre, d.fecha_emision, d.estado::text,
                (SELECT v.id FROM vehiculo v WHERE v.tasacion_origen_id = d.id),
                d.patente || ' — ' || d.marca || ' ' || d.modelo || ' ' || d.anio, d.oferta_monto
         FROM tasacion d JOIN sucursal s ON s.id = d.sucursal_id
         WHERE d.cliente_id = $1 AND d.automotora_id = $2
         UNION ALL
         SELECT 'VENTA', d.id, d.folio, d.sucursal_id, s.nombre, d.fecha_venta, d.estado::text,
                d.vehiculo_id, ${vehiculo}, d.precio_venta_final
         FROM venta d JOIN vehiculo v ON v.id = d.vehiculo_id JOIN sucursal s ON s.id = d.sucursal_id
         WHERE d.cliente_id = $1 AND d.automotora_id = $2
         UNION ALL
         SELECT 'CONSIGNACION', d.id, d.folio, d.sucursal_id, s.nombre, d.fecha_creacion, d.estado::text,
                d.vehiculo_id, ${vehiculo}, d.precio_minimo
         FROM consignacion d JOIN vehiculo v ON v.id = d.vehiculo_id JOIN sucursal s ON s.id = d.sucursal_id
         WHERE d.cliente_id = $1 AND d.automotora_id = $2
       ) h
       ORDER BY h.fecha DESC`,
      [clienteId, automotoraId],
    );
    return rows;
  }

  async findByRut(
    rut: string,
    automotoraId: string,
    db: Queryable = this.pool,
  ): Promise<ClienteRow | null> {
    const { rows } = await db.query<ClienteRow>(
      'SELECT * FROM cliente WHERE rut = $1 AND automotora_id = $2',
      [rut, automotoraId],
    );
    return rows[0] ?? null;
  }

  async create(data: NuevoCliente, db: Queryable = this.pool): Promise<ClienteRow> {
    const { rows } = await db.query<ClienteRow>(
      `INSERT INTO cliente (automotora_id, nombre, rut, telefono, email, direccion)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.automotoraId, data.nombre, data.rut, data.telefono, data.email, data.direccion],
    );
    return rows[0];
  }

  async update(
    id: string,
    automotoraId: string,
    cambios: CambiosCliente,
    db: Queryable = this.pool,
  ): Promise<ClienteRow> {
    const columnas: Record<keyof CambiosCliente, string> = {
      nombre: 'nombre',
      rut: 'rut',
      telefono: 'telefono',
      email: 'email',
      direccion: 'direccion',
      aceptaRecordatorios: 'acepta_recordatorios',
    };
    const sets: string[] = [];
    const params: unknown[] = [id, automotoraId];
    for (const campo of Object.keys(columnas) as (keyof CambiosCliente)[]) {
      if (cambios[campo] === undefined) continue;
      params.push(cambios[campo]);
      sets.push(`${columnas[campo]} = $${params.length}`);
    }
    const { rows } = await db.query<ClienteRow>(
      sets.length === 0
        ? 'SELECT * FROM cliente WHERE id = $1 AND automotora_id = $2'
        : `UPDATE cliente SET ${sets.join(', ')} WHERE id = $1 AND automotora_id = $2 RETURNING *`,
      params,
    );
    return rows[0];
  }

  async setEstado(
    id: string,
    automotoraId: string,
    estado: 'ACTIVO' | 'INACTIVO',
    db: Queryable = this.pool,
  ): Promise<ClienteRow> {
    const { rows } = await db.query<ClienteRow>(
      'UPDATE cliente SET estado = $3 WHERE id = $1 AND automotora_id = $2 RETURNING *',
      [id, automotoraId, estado],
    );
    return rows[0];
  }
}

// Evita que % y _ escritos por el usuario actúen como comodines de LIKE.
function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}
