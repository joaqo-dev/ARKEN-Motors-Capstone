import type { OrdenVehiculo } from './dto/listar-vehiculos.dto';
import { Inject, Injectable } from '@nestjs/common';
import {
  FOTOS_RECOMENDADAS,
  type EstadoVehiculo,
  type OrigenVehiculo,
} from '@vitriauto/shared-types';
import { Pool } from 'pg';
import type { Scope } from '../../common/scope';
import { PG_POOL, Queryable } from '../../db/pool';

export interface VehiculoRow {
  id: string;
  automotora_id: string;
  sucursal_id: string;
  marca: string;
  modelo: string;
  anio: number;
  version: string | null;
  kilometraje: number;
  color: string;
  combustible: string;
  transmision: string;
  cilindrada: string | null;
  patente: string;
  categoria: string;
  traccion: string | null; // null solo en motos
  descripcion: string | null;
  precio_venta: string; // NUMERIC llega como string desde pg
  costo_adquisicion: string;
  origen: OrigenVehiculo;
  estado: EstadoVehiculo;
  venta_origen_id: string | null;
  tasacion_origen_id: string | null;
  fecha_ingreso: Date;
  observacion_revision: string | null; // lo que un admin pidió corregir al devolverlo
}

// Columnas agregadas en los listados/detalle (JOIN / subconsulta).
export interface VehiculoListadoRow extends VehiculoRow {
  sucursal_nombre: string;
  foto_portada: string | null;
  // Para saber qué le falta (pendientesVehiculo, en @vitriauto/shared-types).
  fotos_cantidad: number;
  documentos_vigentes: { tipo: string; vencido: boolean }[];
  inspeccion_aprobada: boolean;
}

export interface DatosGeneralesVehiculo {
  marca: string;
  modelo: string;
  anio: number;
  version: string | null;
  kilometraje: number;
  color: string;
  combustible: string;
  transmision: string;
  cilindrada: string | null;
  patente: string;
  categoria: string;
  traccion: string | null; // null solo en motos
  descripcion: string | null;
}

export interface NuevoVehiculo extends DatosGeneralesVehiculo {
  automotoraId: string;
  sucursalId: string;
  precioVenta: number;
  costoAdquisicion: number;
  origen: OrigenVehiculo;
  fechaIngreso: Date | null;
  tasacionOrigenId: string | null;
  // Solo parte de pago: nace PENDIENTE_REVISION y referencia la venta que lo originó.
  ventaOrigenId?: string | null;
  estado?: EstadoVehiculo;
}

export type CambiosVehiculo = Partial<DatosGeneralesVehiculo> & {
  precioVenta?: number;
  costoAdquisicion?: number;
};

export interface FiltroVehiculos {
  estado?: EstadoVehiculo;
  inventario?: boolean; // excluye VENDIDO y DADO_DE_BAJA
  origen?: OrigenVehiculo;
  sucursalId?: string;
  q?: string;
  pendientes?: boolean; // solo los que tienen algo por completar
  orden?: OrdenVehiculo;
  direccion?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

// Expresiones SQL fijas por criterio de orden (lista cerrada).
// - estado: ciclo comercial (lo vendible primero), no alfabético.
// - costo: los consignados no tienen costo propio → siempre al final.
// - dias: más días en stock = ingreso más antiguo.
const ORDEN_SQL: Record<OrdenVehiculo, { expr: string; invertir?: boolean }> = {
  estado: {
    expr: `CASE v.estado WHEN 'DISPONIBLE' THEN 1 WHEN 'RESERVADO' THEN 2
             WHEN 'EN_PREPARACION' THEN 3 WHEN 'PENDIENTE_REVISION' THEN 4
             WHEN 'VENDIDO' THEN 5 ELSE 6 END`,
  },
  precio: { expr: 'v.precio_venta' },
  costo: { expr: `CASE WHEN v.origen = 'CONSIGNACION' THEN NULL ELSE v.costo_adquisicion END` },
  dias: { expr: 'v.fecha_ingreso', invertir: true },
};

function ordenSql(orden?: OrdenVehiculo, direccion: 'asc' | 'desc' = 'asc') {
  if (!orden) return 'v.fecha_ingreso DESC, v.id';
  const { expr, invertir } = ORDEN_SQL[orden];
  const asc = (direccion === 'asc') !== !!invertir;
  return `${expr} ${asc ? 'ASC' : 'DESC'} NULLS LAST, v.fecha_ingreso DESC, v.id`;
}

const COLUMNAS_CAMBIABLES: Record<keyof CambiosVehiculo, string> = {
  marca: 'marca',
  modelo: 'modelo',
  anio: 'anio',
  version: 'version',
  kilometraje: 'kilometraje',
  color: 'color',
  combustible: 'combustible',
  transmision: 'transmision',
  cilindrada: 'cilindrada',
  patente: 'patente',
  categoria: 'categoria',
  traccion: 'traccion',
  descripcion: 'descripcion',
  precioVenta: 'precio_venta',
  costoAdquisicion: 'costo_adquisicion',
};

// Datos para saber qué le falta a cada vehículo. "Hoy" es el de Chile.
const SQL_FOTOS = '(SELECT count(*)::int FROM vehiculo_foto f WHERE f.vehiculo_id = v.id)';
const SQL_DOCUMENTOS_AL_DIA = `(SELECT count(*) FROM documento_legal_vehiculo d
   WHERE d.vehiculo_id = v.id AND d.vigente
     AND d.fecha_vencimiento >= (now() AT TIME ZONE 'America/Santiago')::date)`;
const SQL_INSPECCION_APROBADA = `COALESCE((
   SELECT i.resultado IN ('APROBADO', 'APROBADO_CON_OBSERVACIONES') FROM inspeccion i
   WHERE i.vehiculo_id = v.id AND i.estado = 'FINALIZADA'
   ORDER BY i.fecha_finalizacion DESC LIMIT 1), false)`;

// "Con pendientes": el mismo criterio que pendientesVehiculo (@vitriauto/shared-types).
// Si cambias uno, cambia el otro.
const SQL_CON_PENDIENTES = `(
  ${SQL_FOTOS} < ${FOTOS_RECOMENDADAS}
  OR coalesce(btrim(v.descripcion), '') = ''
  OR coalesce(btrim(v.version), '') = ''
  OR (coalesce(btrim(v.cilindrada), '') = '' AND v.combustible <> 'ELECTRICO')
  OR ${SQL_DOCUMENTOS_AL_DIA} < 3
  OR NOT ${SQL_INSPECCION_APROBADA})`;

const SELECT_LISTADO = `
  SELECT v.*, s.nombre AS sucursal_nombre,
         (SELECT f.url FROM vehiculo_foto f WHERE f.vehiculo_id = v.id AND f.orden = 1) AS foto_portada,
         ${SQL_FOTOS} AS fotos_cantidad,
         COALESCE((SELECT json_agg(json_build_object(
                     'tipo', d.tipo,
                     'vencido', d.fecha_vencimiento < (now() AT TIME ZONE 'America/Santiago')::date))
                   FROM documento_legal_vehiculo d WHERE d.vehiculo_id = v.id AND d.vigente), '[]')
           AS documentos_vigentes,
         ${SQL_INSPECCION_APROBADA} AS inspeccion_aprobada
  FROM vehiculo v
  JOIN sucursal s ON s.id = v.sucursal_id`;

@Injectable()
export class VehiculosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAllScoped(
    scope: Scope,
    filtro: FiltroVehiculos,
    db: Queryable = this.pool,
  ): Promise<{ rows: VehiculoListadoRow[]; total: number }> {
    const conditions = ['v.automotora_id = $1'];
    const params: unknown[] = [scope.automotoraId];
    const agregar = (condicion: (p: string) => string, valor: unknown) => {
      params.push(valor);
      conditions.push(condicion(`$${params.length}`));
    };
    // El scope manda; el filtro de sucursal solo puede acotar dentro de él.
    if (scope.sucursalId) agregar((p) => `v.sucursal_id = ${p}`, scope.sucursalId);
    if (filtro.sucursalId) agregar((p) => `v.sucursal_id = ${p}`, filtro.sucursalId);
    if (filtro.estado) agregar((p) => `v.estado = ${p}`, filtro.estado);
    if (filtro.inventario) conditions.push(`v.estado NOT IN ('VENDIDO', 'DADO_DE_BAJA')`);
    if (filtro.origen) agregar((p) => `v.origen = ${p}`, filtro.origen);
    if (filtro.pendientes) conditions.push(SQL_CON_PENDIENTES);
    if (filtro.q) {
      params.push(`%${escaparLike(filtro.q)}%`);
      const p = `$${params.length}`;
      params.push(`%${escaparLike(filtro.q.replace(/[\s.·-]/g, '').toUpperCase())}%`);
      const pPatente = `$${params.length}`;
      conditions.push(
        `(v.marca ILIKE ${p} OR v.modelo ILIKE ${p} OR v.version ILIKE ${p} OR v.patente LIKE ${pPatente})`,
      );
    }
    const where = conditions.join(' AND ');

    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total FROM vehiculo v WHERE ${where}`,
      params,
    );
    params.push(filtro.limit, filtro.offset);
    const { rows } = await db.query<VehiculoListadoRow>(
      `${SELECT_LISTADO} WHERE ${where}
       ORDER BY ${ordenSql(filtro.orden, filtro.direccion)}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total) };
  }

  async findByIdScoped(
    id: string,
    scope: Scope,
    db: Queryable = this.pool,
  ): Promise<VehiculoListadoRow | null> {
    const conditions = ['v.id = $1', 'v.automotora_id = $2'];
    const params: unknown[] = [id, scope.automotoraId];
    if (scope.sucursalId) {
      params.push(scope.sucursalId);
      conditions.push(`v.sucursal_id = $${params.length}`);
    }
    const { rows } = await db.query<VehiculoListadoRow>(
      `${SELECT_LISTADO} WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return rows[0] ?? null;
  }

  // Bloquea la fila hasta el fin de la transacción: el valor "anterior" que se
  // registra en bitácora/auditoría es consistente aunque haya ediciones concurrentes.
  async lockById(id: string, automotoraId: string, db: Queryable): Promise<VehiculoRow | null> {
    const { rows } = await db.query<VehiculoRow>(
      'SELECT * FROM vehiculo WHERE id = $1 AND automotora_id = $2 FOR UPDATE',
      [id, automotoraId],
    );
    return rows[0] ?? null;
  }

  // ¿Hay otro vehículo en inventario (ni vendido ni dado de baja) con esa patente?
  async existePatenteEnInventario(
    automotoraId: string,
    patente: string,
    excluirId: string | null,
    db: Queryable = this.pool,
  ): Promise<boolean> {
    const { rows } = await db.query(
      `SELECT 1 FROM vehiculo
       WHERE automotora_id = $1 AND patente = $2 AND estado NOT IN ('VENDIDO', 'DADO_DE_BAJA')
         AND ($3::uuid IS NULL OR id <> $3)`,
      [automotoraId, patente, excluirId],
    );
    return rows.length > 0;
  }

  async create(data: NuevoVehiculo, db: Queryable = this.pool): Promise<VehiculoRow> {
    const { rows } = await db.query<VehiculoRow>(
      `INSERT INTO vehiculo
         (automotora_id, sucursal_id, marca, modelo, anio, version, kilometraje, color,
          combustible, transmision, cilindrada, patente, categoria, traccion, descripcion,
          precio_venta, costo_adquisicion, origen, fecha_ingreso, tasacion_origen_id,
          venta_origen_id, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               COALESCE($19, now()), $20, $21, $22)
       RETURNING *`,
      [
        data.automotoraId,
        data.sucursalId,
        data.marca,
        data.modelo,
        data.anio,
        data.version,
        data.kilometraje,
        data.color,
        data.combustible,
        data.transmision,
        data.cilindrada,
        data.patente,
        data.categoria,
        data.traccion,
        data.descripcion,
        data.precioVenta,
        data.costoAdquisicion,
        data.origen,
        data.fechaIngreso,
        data.tasacionOrigenId,
        data.ventaOrigenId ?? null,
        data.estado ?? 'EN_PREPARACION',
      ],
    );
    return rows[0];
  }

  async update(id: string, cambios: CambiosVehiculo, db: Queryable = this.pool): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const campo of Object.keys(COLUMNAS_CAMBIABLES) as (keyof CambiosVehiculo)[]) {
      if (cambios[campo] === undefined) continue;
      params.push(cambios[campo]);
      sets.push(`${COLUMNAS_CAMBIABLES[campo]} = $${params.length}`);
    }
    if (sets.length === 0) return;
    await db.query(`UPDATE vehiculo SET ${sets.join(', ')} WHERE id = $1`, params);
  }

  // Precio final de la venta confirmada del vehículo (para el margen real).
  async precioVentaConfirmada(id: string, db: Queryable = this.pool): Promise<number | null> {
    const { rows } = await db.query<{ precio_venta_final: string }>(
      `SELECT precio_venta_final FROM venta WHERE vehiculo_id = $1 AND estado = 'CONFIRMADA'`,
      [id],
    );
    return rows[0] ? Number(rows[0].precio_venta_final) : null;
  }

  async setEstado(id: string, estado: EstadoVehiculo, db: Queryable = this.pool): Promise<void> {
    await db.query('UPDATE vehiculo SET estado = $2 WHERE id = $1', [id, estado]);
  }

  // Lo que un admin pide corregir al devolverlo a preparación (null lo borra).
  async setObservacionRevision(
    id: string,
    observacion: string | null,
    db: Queryable = this.pool,
  ): Promise<void> {
    await db.query('UPDATE vehiculo SET observacion_revision = $2 WHERE id = $1', [
      id,
      observacion,
    ]);
  }

  async setSucursal(id: string, sucursalId: string, db: Queryable = this.pool): Promise<void> {
    await db.query('UPDATE vehiculo SET sucursal_id = $2 WHERE id = $1', [id, sucursalId]);
  }
}

function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}
