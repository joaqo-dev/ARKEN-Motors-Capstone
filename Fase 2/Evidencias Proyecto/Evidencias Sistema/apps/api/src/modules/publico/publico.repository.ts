import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';
import type { BuscarVehiculosDto, Orden } from './dto/buscar-vehiculos.dto';

// Único origen de datos del sitio público. SOLO expone columnas públicas:
// nunca costos, patente, consignación ni datos internos.

export interface VehiculoPublicoRow {
  id: string;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number;
  kilometraje: number;
  precio_venta: string;
  categoria: string;
  transmision: string;
  combustible: string;
  foto_portada: string | null;
  region: string;
  comuna: string;
}

export interface VehiculoPublicoDetalleRow extends VehiculoPublicoRow {
  color: string;
  cilindrada: string | null;
  traccion: string | null;
  descripcion: string | null;
  fotos: string[];
  sucursal_id: string;
  sucursal_nombre: string;
  sucursal_direccion: string;
  sucursal_telefono: string;
  sucursal_whatsapp: string | null;
  sucursal_horario: string | null;
  automotora_nombre: string;
  automotora_subdominio: string;
  automotora_logo: string | null;
  financiamiento_activo: boolean;
  financiamiento_tasa_mensual: string | null;
  financiamiento_pie_minimo: number;
  financiamiento_plazo_maximo: number;
}

export interface AutomotoraPublicaRow {
  id: string;
  nombre: string;
  subdominio: string;
  email: string;
  descripcion: string | null;
  logo_url: string | null;
  banner_url: string | null;
  sucursales: {
    id: string;
    nombre: string;
    direccion: string;
    region: string;
    comuna: string;
    telefono: string;
    whatsapp: string | null;
    horario_atencion: string | null;
    es_principal: boolean;
  }[];
}

export interface AutomotoraDirectorioRow {
  nombre: string;
  subdominio: string;
  descripcion: string | null;
  logo_url: string | null;
  banner_url: string | null;
  vehiculos: string;
  comunas: string[];
}

export const POR_PAGINA = 30; // Módulo 2: máximo 30 por página

const ORDEN_SQL: Record<Orden, string> = {
  recientes: 'v.fecha_ingreso DESC, v.id',
  precio_asc: 'v.precio_venta ASC, v.id',
  precio_desc: 'v.precio_venta DESC, v.id',
  anio_desc: 'v.anio DESC, v.id',
  anio_asc: 'v.anio ASC, v.id',
  km_asc: 'v.kilometraje ASC, v.id',
  km_desc: 'v.kilometraje DESC, v.id',
};

// Publicado = DISPONIBLE (Módulo 7.6), en una sucursal activa.
const BASE = `
  FROM vehiculo v
  JOIN sucursal s ON s.id = v.sucursal_id AND s.activa
  JOIN automotora a ON a.id = v.automotora_id
  WHERE v.estado = 'DISPONIBLE'`;

@Injectable()
export class PublicoRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async buscar(
    filtro: BuscarVehiculosDto,
    db: Queryable = this.pool,
  ): Promise<{ rows: VehiculoPublicoRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const agregar = (condicion: (p: string) => string, valor: unknown) => {
      params.push(valor);
      conditions.push(condicion(`$${params.length}`));
    };
    if (filtro.subdominio) agregar((p) => `a.subdominio = ${p}`, filtro.subdominio);
    if (filtro.sucursalId) agregar((p) => `v.sucursal_id = ${p}`, filtro.sucursalId);
    if (filtro.marca) agregar((p) => `lower(v.marca) = lower(${p})`, filtro.marca);
    if (filtro.modelo) agregar((p) => `lower(v.modelo) = lower(${p})`, filtro.modelo);
    if (filtro.anioMin !== undefined) agregar((p) => `v.anio >= ${p}`, filtro.anioMin);
    if (filtro.anioMax !== undefined) agregar((p) => `v.anio <= ${p}`, filtro.anioMax);
    if (filtro.precioMin !== undefined) agregar((p) => `v.precio_venta >= ${p}`, filtro.precioMin);
    if (filtro.precioMax !== undefined) agregar((p) => `v.precio_venta <= ${p}`, filtro.precioMax);
    if (filtro.kmMin !== undefined) agregar((p) => `v.kilometraje >= ${p}`, filtro.kmMin);
    if (filtro.kmMax !== undefined) agregar((p) => `v.kilometraje <= ${p}`, filtro.kmMax);
    if (filtro.categoria) agregar((p) => `v.categoria = ${p}`, filtro.categoria);
    if (filtro.transmision) agregar((p) => `v.transmision = ${p}`, filtro.transmision);
    if (filtro.region) agregar((p) => `s.region = ${p}`, filtro.region);
    if (filtro.comuna) agregar((p) => `lower(s.comuna) = lower(${p})`, filtro.comuna);
    if (filtro.q) {
      params.push(`%${filtro.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const p = `$${params.length}`;
      conditions.push(`(v.marca ILIKE ${p} OR v.modelo ILIKE ${p} OR v.version ILIKE ${p})`);
    }
    const where = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';

    const { rows: conteo } = await db.query<{ total: string }>(
      `SELECT count(*) AS total ${BASE}${where}`,
      params,
    );
    const pagina = filtro.pagina ?? 1;
    params.push(POR_PAGINA, (pagina - 1) * POR_PAGINA);
    const { rows } = await db.query<VehiculoPublicoRow>(
      `SELECT v.id, v.marca, v.modelo, v.version, v.anio, v.kilometraje, v.precio_venta, v.categoria,
              v.transmision, v.combustible, s.region, s.comuna,
              (SELECT f.url FROM vehiculo_foto f WHERE f.vehiculo_id = v.id AND f.orden = 1) AS foto_portada
       ${BASE}${where}
       ORDER BY ${ORDEN_SQL[filtro.orden ?? 'recientes']}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: Number(conteo[0].total) };
  }

  async detalle(id: string, db: Queryable = this.pool): Promise<VehiculoPublicoDetalleRow | null> {
    const { rows } = await db.query<VehiculoPublicoDetalleRow>(
      `SELECT v.id, v.marca, v.modelo, v.version, v.anio, v.kilometraje, v.precio_venta, v.categoria,
              v.transmision, v.combustible, v.color, v.cilindrada, v.traccion, v.descripcion,
              s.region, s.comuna, s.id AS sucursal_id, s.nombre AS sucursal_nombre,
              s.direccion AS sucursal_direccion, s.telefono AS sucursal_telefono,
              s.whatsapp AS sucursal_whatsapp, s.horario_atencion AS sucursal_horario,
              a.nombre AS automotora_nombre, a.subdominio AS automotora_subdominio, a.logo_url AS automotora_logo,
              a.financiamiento_activo, a.financiamiento_tasa_mensual,
              a.financiamiento_pie_minimo, a.financiamiento_plazo_maximo,
              COALESCE((SELECT array_agg(f.url ORDER BY f.orden) FROM vehiculo_foto f WHERE f.vehiculo_id = v.id), '{}') AS fotos,
              (SELECT f.url FROM vehiculo_foto f WHERE f.vehiculo_id = v.id AND f.orden = 1) AS foto_portada
       ${BASE} AND v.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  // Opciones de filtro dinámicas: solo valores presentes en el inventario publicado.
  async filtros(
    opciones: { subdominio?: string; marca?: string; region?: string },
    db: Queryable = this.pool,
  ) {
    const params: unknown[] = [];
    let alcance = '';
    if (opciones.subdominio) {
      params.push(opciones.subdominio);
      alcance = ` AND a.subdominio = $${params.length}`;
    }
    const q = async <T extends QueryResultRow>(
      select: string,
      extra = '',
      extraParams: unknown[] = [],
    ) =>
      (await db.query<T>(`SELECT ${select} ${BASE}${alcance}${extra}`, [...params, ...extraParams]))
        .rows;

    const [marcas, categorias, transmisiones, regiones, rangos, sucursales] = await Promise.all([
      q<{ valor: string; cantidad: string }>(
        'v.marca AS valor, count(*) AS cantidad',
        ' GROUP BY v.marca ORDER BY v.marca',
      ),
      q<{ valor: string; cantidad: string }>(
        'v.categoria AS valor, count(*) AS cantidad',
        ' GROUP BY v.categoria ORDER BY v.categoria',
      ),
      q<{ valor: string; cantidad: string }>(
        'v.transmision AS valor, count(*) AS cantidad',
        ' GROUP BY v.transmision ORDER BY v.transmision',
      ),
      q<{ valor: string; cantidad: string }>(
        's.region AS valor, count(*) AS cantidad',
        ' GROUP BY s.region ORDER BY s.region',
      ),
      q<Record<string, string | null>>(
        `min(v.anio) AS anio_min, max(v.anio) AS anio_max, min(v.precio_venta) AS precio_min,
         max(v.precio_venta) AS precio_max, min(v.kilometraje) AS km_min, max(v.kilometraje) AS km_max`,
      ),
      opciones.subdominio
        ? q<{ id: string; nombre: string; comuna: string; cantidad: string }>(
            's.id, s.nombre, s.comuna, count(*) AS cantidad',
            ' GROUP BY s.id, s.nombre, s.comuna ORDER BY s.nombre',
          )
        : Promise.resolve([]),
    ]);
    const modelos = opciones.marca
      ? await q<{ valor: string; cantidad: string }>(
          'v.modelo AS valor, count(*) AS cantidad',
          ` AND lower(v.marca) = lower($${params.length + 1}) GROUP BY v.modelo ORDER BY v.modelo`,
          [opciones.marca],
        )
      : [];
    const comunas = opciones.region
      ? await q<{ valor: string; cantidad: string }>(
          's.comuna AS valor, count(*) AS cantidad',
          ` AND s.region = $${params.length + 1} GROUP BY s.comuna ORDER BY s.comuna`,
          [opciones.region],
        )
      : [];
    return {
      marcas,
      modelos,
      categorias,
      transmisiones,
      regiones,
      comunas,
      rangos: rangos[0],
      sucursales,
    };
  }

  async automotora(
    subdominio: string,
    db: Queryable = this.pool,
  ): Promise<AutomotoraPublicaRow | null> {
    const { rows } = await db.query<AutomotoraPublicaRow>(
      `SELECT a.id, a.nombre, a.subdominio, a.email, a.descripcion, a.logo_url, a.banner_url,
              COALESCE((SELECT json_agg(json_build_object(
                          'id', s.id, 'nombre', s.nombre, 'direccion', s.direccion, 'region', s.region,
                          'comuna', s.comuna, 'telefono', s.telefono, 'whatsapp', s.whatsapp,
                          'horario_atencion', s.horario_atencion, 'es_principal', s.es_principal)
                          ORDER BY s.es_principal DESC, s.nombre)
                        FROM sucursal s WHERE s.automotora_id = a.id AND s.activa), '[]') AS sucursales
       FROM automotora a WHERE a.subdominio = $1`,
      [subdominio],
    );
    return rows[0] ?? null;
  }

  // Directorio del marketplace: automotoras con inventario publicado, las que
  // tienen más vehículos primero. Solo datos públicos del perfil.
  async directorio(db: Queryable = this.pool): Promise<AutomotoraDirectorioRow[]> {
    const { rows } = await db.query<AutomotoraDirectorioRow>(
      `SELECT a.nombre, a.subdominio, a.descripcion, a.logo_url, a.banner_url,
              count(*) AS vehiculos,
              array_agg(DISTINCT s.comuna ORDER BY s.comuna) AS comunas
       ${BASE}
       GROUP BY a.id
       ORDER BY count(*) DESC, a.nombre`,
    );
    return rows;
  }

  // Todas las vitrinas (tengan o no stock publicado): las que tienen al menos
  // una sucursal activa. Para el sitemap del sitio público.
  async vitrinas(db: Queryable = this.pool): Promise<{ subdominio: string }[]> {
    const { rows } = await db.query<{ subdominio: string }>(
      `SELECT a.subdominio FROM automotora a
       WHERE EXISTS (SELECT 1 FROM sucursal s WHERE s.automotora_id = a.id AND s.activa)
       ORDER BY a.subdominio`,
    );
    return rows;
  }
}
