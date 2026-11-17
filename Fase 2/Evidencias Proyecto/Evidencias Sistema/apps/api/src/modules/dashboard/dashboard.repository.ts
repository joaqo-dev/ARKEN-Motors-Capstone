import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

// Alcance de sucursales: null = toda la automotora (consolidado).
export interface Alcance {
  automotoraId: string;
  sucursalIds: string[] | null;
}

export interface Periodo {
  desde: string; // 'YYYY-MM-DD', inclusive (hora de Chile)
  hasta: string; // 'YYYY-MM-DD', inclusive
}

export interface InventarioSucursalRow {
  sucursal_id: string;
  stock_propio: string;
  stock_consignado: string;
  publicados: string;
  reservados: string;
  estancados: string;
  costo_inventario: string;
  ganancia_propios: string;
  ganancia_consignados: string;
}

export interface VentasSucursalRow {
  sucursal_id: string;
  cantidad: string;
  ingresos: string;
  margen: string;
}

export interface GastoSucursalRow {
  sucursal_id: string | null; // null = gasto general de la automotora
  tipo: 'VEHICULO' | 'OPERACIONAL';
  cantidad: string;
  monto: string;
}

export interface MontoSucursalRow {
  sucursal_id: string;
  cantidad: string;
  monto: string;
}

export interface EstancadoRow {
  id: string;
  patente: string;
  descripcion: string;
  sucursal_id: string;
  sucursal_nombre: string;
  estado: string;
  origen: string;
  precio_venta: string;
  dias: number;
  fotos: number;
}

export interface MarcaModeloRow {
  marca: string;
  modelo: string;
  cantidad: string;
  dias_promedio: string;
  margen_promedio: string;
  ingresos: string;
}

export interface MesRow {
  mes: string; // 'YYYY-MM'
  cantidad: string;
  monto: string;
  margen: string;
}

export interface EmbudoRow {
  cotizaciones: string;
  cotizaciones_concretadas: string;
  cotizaciones_vencidas: string;
  reservas: string;
  reservas_convertidas: string;
  reservas_canceladas: string;
  ventas: string;
  ventas_desde_cotizacion: string;
  ventas_desde_reserva: string;
}

export interface ResumenVentasRow {
  cantidad: string;
  ingresos: string;
  margen: string;
  dias_promedio: string | null;
  descuento_promedio: string | null; // fracción sobre el último precio publicado
}

export interface AntiguedadRow {
  tramo: string; // '0-15' | '16-30' | '31-45' | '46-90' | '90+'
  cantidad: string;
  capital: string; // costo + gastos de los propios
  valor_publicado: string;
}

export interface GrupoRow {
  clave: string;
  cantidad: string;
  monto: string;
  margen: string;
  dias_promedio: string | null;
}

const EN_INVENTARIO = `v.estado NOT IN ('VENDIDO', 'DADO_DE_BAJA')`;
const FECHA_LOCAL = (columna: string) => `(${columna} AT TIME ZONE 'America/Santiago')::date`;

// Ganancia de la automotora en una consignación sobre un precio (misma regla
// que calcularLiquidacion): % del precio, o precio menos el neto garantizado.
const COMISION = (precio: string) =>
  `CASE WHEN c.tipo_trato = 'COMISION_VENTA' THEN round(${precio} * c.porcentaje_comision / 100)
        ELSE ${precio} - c.monto_neto END`;

const GASTOS_ACTIVOS = `COALESCE((SELECT sum(g.monto) FROM gasto g
                                  WHERE g.vehiculo_id = v.id AND g.estado = 'ACTIVO'), 0)`;

// Margen real de una venta (Módulo 7.7): propio = precio final − costo − gastos;
// consignado = comisión sobre el precio final. Los costos de traspaso no entran.
const MARGEN_VENTA = `CASE WHEN v.origen = 'CONSIGNACION' THEN ${COMISION('ve.precio_venta_final')}
                          ELSE ve.precio_venta_final - v.costo_adquisicion - ${GASTOS_ACTIVOS} END`;

@Injectable()
export class DashboardRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // Foto actual del inventario, por sucursal ACTUAL del vehículo.
  async inventario(
    alcance: Alcance,
    hoy: string,
    diasEstancado: number,
    db: Queryable = this.pool,
  ): Promise<InventarioSucursalRow[]> {
    const { rows } = await db.query<InventarioSucursalRow>(
      `SELECT x.sucursal_id,
              count(*) FILTER (WHERE x.origen <> 'CONSIGNACION') AS stock_propio,
              count(*) FILTER (WHERE x.origen = 'CONSIGNACION') AS stock_consignado,
              count(*) FILTER (WHERE x.estado = 'DISPONIBLE') AS publicados,
              count(*) FILTER (WHERE x.estado = 'RESERVADO') AS reservados,
              count(*) FILTER (WHERE x.ingreso <= $3::date - $4::int) AS estancados,
              COALESCE(sum(x.costo_adquisicion + x.gastos) FILTER (WHERE x.origen <> 'CONSIGNACION'), 0) AS costo_inventario,
              COALESCE(sum(x.precio_venta - x.costo_adquisicion - x.gastos) FILTER (WHERE x.origen <> 'CONSIGNACION'), 0) AS ganancia_propios,
              COALESCE(sum(x.comision) FILTER (WHERE x.origen = 'CONSIGNACION'), 0) AS ganancia_consignados
       FROM (
         SELECT v.sucursal_id, v.origen, v.estado, v.precio_venta, v.costo_adquisicion,
                ${FECHA_LOCAL('v.fecha_ingreso')} AS ingreso,
                ${GASTOS_ACTIVOS} AS gastos,
                ${COMISION('v.precio_venta')} AS comision
         FROM vehiculo v LEFT JOIN consignacion c ON c.vehiculo_id = v.id
         WHERE v.automotora_id = $1 AND ($2::uuid[] IS NULL OR v.sucursal_id = ANY($2)) AND ${EN_INVENTARIO}
       ) x
       GROUP BY x.sucursal_id`,
      [alcance.automotoraId, alcance.sucursalIds, hoy, diasEstancado],
    );
    return rows;
  }

  // Reservas activas que vencen hasta `limite` (o ya vencidas), por sucursal actual del vehículo.
  async reservasPorVencer(
    alcance: Alcance,
    limite: string,
    db: Queryable = this.pool,
  ): Promise<MontoSucursalRow[]> {
    const { rows } = await db.query<MontoSucursalRow>(
      `SELECT v.sucursal_id, count(*) AS cantidad, sum(r.monto_reserva) AS monto
       FROM reserva r JOIN vehiculo v ON v.id = r.vehiculo_id
       WHERE r.automotora_id = $1 AND ($2::uuid[] IS NULL OR v.sucursal_id = ANY($2))
         AND r.estado IN ('VIGENTE', 'VENCIDA') AND r.fecha_vencimiento <= $3
       GROUP BY v.sucursal_id`,
      [alcance.automotoraId, alcance.sucursalIds, limite],
    );
    return rows;
  }

  // Ventas confirmadas del período, por sucursal CONGELADA de la venta.
  async ventas(
    alcance: Alcance,
    periodo: Periodo,
    db: Queryable = this.pool,
  ): Promise<VentasSucursalRow[]> {
    const { rows } = await db.query<VentasSucursalRow>(
      `SELECT ve.sucursal_id, count(*) AS cantidad, sum(ve.precio_venta_final) AS ingresos,
              sum(${MARGEN_VENTA}) AS margen
       FROM venta ve
       JOIN vehiculo v ON v.id = ve.vehiculo_id
       LEFT JOIN consignacion c ON c.vehiculo_id = v.id
       WHERE ve.automotora_id = $1 AND ($2::uuid[] IS NULL OR ve.sucursal_id = ANY($2))
         AND ve.estado = 'CONFIRMADA'
         AND ${FECHA_LOCAL('ve.fecha_venta')} BETWEEN $3 AND $4
       GROUP BY ve.sucursal_id`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows;
  }

  // Señas retenidas (ingreso) del período: fecha de cancelación, sucursal congelada de la reserva.
  async senasRetenidas(
    alcance: Alcance,
    periodo: Periodo,
    db: Queryable = this.pool,
  ): Promise<MontoSucursalRow[]> {
    const { rows } = await db.query<MontoSucursalRow>(
      `SELECT r.sucursal_id, count(*) AS cantidad, sum(r.monto_reserva) AS monto
       FROM reserva r
       WHERE r.automotora_id = $1 AND ($2::uuid[] IS NULL OR r.sucursal_id = ANY($2))
         AND r.estado = 'CANCELADA' AND r.sena_retenida
         AND ${FECHA_LOCAL('r.fecha_cancelacion')} BETWEEN $3 AND $4
       GROUP BY r.sucursal_id`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows;
  }

  // Gastos activos del período, por tipo y sucursal congelada del gasto. Los
  // generales (sucursal NULL) solo entran en la vista consolidada ($2 NULL).
  async gastos(
    alcance: Alcance,
    periodo: Periodo,
    db: Queryable = this.pool,
  ): Promise<GastoSucursalRow[]> {
    const { rows } = await db.query<GastoSucursalRow>(
      `SELECT g.sucursal_id, g.tipo, count(*) AS cantidad, sum(g.monto) AS monto
       FROM gasto g
       WHERE g.automotora_id = $1 AND ($2::uuid[] IS NULL OR g.sucursal_id = ANY($2))
         AND g.estado = 'ACTIVO' AND g.fecha BETWEEN $3 AND $4
       GROUP BY g.sucursal_id, g.tipo`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows;
  }

  // Vehículos en inventario hace más de `dias` días (Módulo 15).
  async estancados(
    alcance: Alcance,
    hoy: string,
    dias: number,
    db: Queryable = this.pool,
  ): Promise<EstancadoRow[]> {
    const { rows } = await db.query<EstancadoRow>(
      `SELECT v.id, v.patente, v.marca || ' ' || v.modelo || ' ' || v.anio AS descripcion,
              v.sucursal_id, s.nombre AS sucursal_nombre, v.estado, v.origen, v.precio_venta,
              ($3::date - ${FECHA_LOCAL('v.fecha_ingreso')})::int AS dias,
              (SELECT count(*) FROM vehiculo_foto f WHERE f.vehiculo_id = v.id)::int AS fotos
       FROM vehiculo v JOIN sucursal s ON s.id = v.sucursal_id
       WHERE v.automotora_id = $1 AND ($2::uuid[] IS NULL OR v.sucursal_id = ANY($2)) AND ${EN_INVENTARIO}
         AND ${FECHA_LOCAL('v.fecha_ingreso')} <= $3::date - $4::int
       ORDER BY dias DESC`,
      [alcance.automotoraId, alcance.sucursalIds, hoy, dias],
    );
    return rows;
  }

  // Análisis por marca/modelo sobre ventas confirmadas del período (Módulo 15).
  async porMarcaModelo(
    alcance: Alcance,
    periodo: Periodo,
    db: Queryable = this.pool,
  ): Promise<MarcaModeloRow[]> {
    const { rows } = await db.query<MarcaModeloRow>(
      `SELECT v.marca, v.modelo, count(*) AS cantidad,
              avg(${FECHA_LOCAL('ve.fecha_venta')} - ${FECHA_LOCAL('v.fecha_ingreso')}) AS dias_promedio,
              avg(${MARGEN_VENTA}) AS margen_promedio,
              sum(ve.precio_venta_final) AS ingresos
       FROM venta ve
       JOIN vehiculo v ON v.id = ve.vehiculo_id
       LEFT JOIN consignacion c ON c.vehiculo_id = v.id
       WHERE ve.automotora_id = $1 AND ($2::uuid[] IS NULL OR ve.sucursal_id = ANY($2))
         AND ve.estado = 'CONFIRMADA'
         AND ${FECHA_LOCAL('ve.fecha_venta')} BETWEEN $3 AND $4
       GROUP BY v.marca, v.modelo
       ORDER BY count(*) DESC, v.marca, v.modelo`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows;
  }

  // Sucursales de la automotora (incluidas las dadas de baja: tienen historia).
  async sucursales(
    automotoraId: string,
    db: Queryable = this.pool,
  ): Promise<{ id: string; nombre: string; activa: boolean }[]> {
    const { rows } = await db.query<{ id: string; nombre: string; activa: boolean }>(
      'SELECT id, nombre, activa FROM sucursal WHERE automotora_id = $1 ORDER BY es_principal DESC, nombre',
      [automotoraId],
    );
    return rows;
  }

  // --------------------------------------------------------------- Analítica ampliada

  // Ventas confirmadas por mes (sucursal congelada): cantidad, ingresos y margen real.
  async ventasPorMes(alcance: Alcance, periodo: Periodo, db: Queryable = this.pool) {
    const { rows } = await db.query<MesRow>(
      `SELECT to_char(${FECHA_LOCAL('ve.fecha_venta')}, 'YYYY-MM') AS mes, count(*) AS cantidad,
              sum(ve.precio_venta_final) AS monto, sum(${MARGEN_VENTA}) AS margen
       FROM venta ve
       JOIN vehiculo v ON v.id = ve.vehiculo_id
       LEFT JOIN consignacion c ON c.vehiculo_id = v.id
       WHERE ve.automotora_id = $1 AND ($2::uuid[] IS NULL OR ve.sucursal_id = ANY($2))
         AND ve.estado = 'CONFIRMADA' AND ${FECHA_LOCAL('ve.fecha_venta')} BETWEEN $3 AND $4
       GROUP BY 1 ORDER BY 1`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows;
  }

  // Señas retenidas por mes (fecha de cancelación, sucursal congelada de la reserva).
  async senasPorMes(alcance: Alcance, periodo: Periodo, db: Queryable = this.pool) {
    const { rows } = await db.query<MesRow>(
      `SELECT to_char(${FECHA_LOCAL('r.fecha_cancelacion')}, 'YYYY-MM') AS mes, count(*) AS cantidad,
              sum(r.monto_reserva) AS monto, 0 AS margen
       FROM reserva r
       WHERE r.automotora_id = $1 AND ($2::uuid[] IS NULL OR r.sucursal_id = ANY($2))
         AND r.estado = 'CANCELADA' AND r.sena_retenida
         AND ${FECHA_LOCAL('r.fecha_cancelacion')} BETWEEN $3 AND $4
       GROUP BY 1 ORDER BY 1`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows;
  }

  // Gastos operacionales activos por mes (los generales solo en el consolidado).
  async gastosOperacionalesPorMes(alcance: Alcance, periodo: Periodo, db: Queryable = this.pool) {
    const { rows } = await db.query<MesRow>(
      `SELECT to_char(g.fecha, 'YYYY-MM') AS mes, count(*) AS cantidad, sum(g.monto) AS monto, 0 AS margen
       FROM gasto g
       WHERE g.automotora_id = $1 AND ($2::uuid[] IS NULL OR g.sucursal_id = ANY($2))
         AND g.estado = 'ACTIVO' AND g.tipo = 'OPERACIONAL' AND g.fecha BETWEEN $3 AND $4
       GROUP BY 1 ORDER BY 1`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows;
  }

  // Resumen de las ventas del período: días promedio hasta vender y descuento
  // promedio sobre el último precio publicado del auto.
  async resumenVentas(alcance: Alcance, periodo: Periodo, db: Queryable = this.pool) {
    const { rows } = await db.query<ResumenVentasRow>(
      `SELECT count(*) AS cantidad, COALESCE(sum(ve.precio_venta_final), 0) AS ingresos,
              COALESCE(sum(${MARGEN_VENTA}), 0) AS margen,
              avg(${FECHA_LOCAL('ve.fecha_venta')} - ${FECHA_LOCAL('v.fecha_ingreso')}) AS dias_promedio,
              avg((v.precio_venta - ve.precio_venta_final) / NULLIF(v.precio_venta, 0)) AS descuento_promedio
       FROM venta ve
       JOIN vehiculo v ON v.id = ve.vehiculo_id
       LEFT JOIN consignacion c ON c.vehiculo_id = v.id
       WHERE ve.automotora_id = $1 AND ($2::uuid[] IS NULL OR ve.sucursal_id = ANY($2))
         AND ve.estado = 'CONFIRMADA' AND ${FECHA_LOCAL('ve.fecha_venta')} BETWEEN $3 AND $4`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows[0];
  }

  // Embudo comercial del período (cada documento por su fecha de emisión y su
  // sucursal congelada; las cotizaciones anuladas no cuentan).
  async embudo(alcance: Alcance, periodo: Periodo, db: Queryable = this.pool) {
    const p = [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta];
    const { rows } = await db.query<EmbudoRow>(
      `SELECT
         (SELECT count(*) FROM cotizacion d WHERE d.automotora_id = $1 AND ($2::uuid[] IS NULL OR d.sucursal_id = ANY($2))
            AND d.estado <> 'ANULADA' AND ${FECHA_LOCAL('d.fecha_emision')} BETWEEN $3 AND $4) AS cotizaciones,
         (SELECT count(*) FROM cotizacion d WHERE d.automotora_id = $1 AND ($2::uuid[] IS NULL OR d.sucursal_id = ANY($2))
            AND d.estado = 'CONCRETADA' AND ${FECHA_LOCAL('d.fecha_emision')} BETWEEN $3 AND $4) AS cotizaciones_concretadas,
         (SELECT count(*) FROM cotizacion d WHERE d.automotora_id = $1 AND ($2::uuid[] IS NULL OR d.sucursal_id = ANY($2))
            AND d.estado = 'VENCIDA' AND ${FECHA_LOCAL('d.fecha_emision')} BETWEEN $3 AND $4) AS cotizaciones_vencidas,
         (SELECT count(*) FROM reserva d WHERE d.automotora_id = $1 AND ($2::uuid[] IS NULL OR d.sucursal_id = ANY($2))
            AND ${FECHA_LOCAL('d.fecha_emision')} BETWEEN $3 AND $4) AS reservas,
         (SELECT count(*) FROM reserva d WHERE d.automotora_id = $1 AND ($2::uuid[] IS NULL OR d.sucursal_id = ANY($2))
            AND d.estado = 'CONVERTIDA_EN_VENTA' AND ${FECHA_LOCAL('d.fecha_emision')} BETWEEN $3 AND $4) AS reservas_convertidas,
         (SELECT count(*) FROM reserva d WHERE d.automotora_id = $1 AND ($2::uuid[] IS NULL OR d.sucursal_id = ANY($2))
            AND d.estado = 'CANCELADA' AND ${FECHA_LOCAL('d.fecha_emision')} BETWEEN $3 AND $4) AS reservas_canceladas,
         (SELECT count(*) FROM venta d WHERE d.automotora_id = $1 AND ($2::uuid[] IS NULL OR d.sucursal_id = ANY($2))
            AND d.estado = 'CONFIRMADA' AND ${FECHA_LOCAL('d.fecha_venta')} BETWEEN $3 AND $4) AS ventas,
         (SELECT count(*) FROM venta d WHERE d.automotora_id = $1 AND ($2::uuid[] IS NULL OR d.sucursal_id = ANY($2))
            AND d.estado = 'CONFIRMADA' AND d.cotizacion_id IS NOT NULL AND ${FECHA_LOCAL('d.fecha_venta')} BETWEEN $3 AND $4) AS ventas_desde_cotizacion,
         (SELECT count(*) FROM venta d WHERE d.automotora_id = $1 AND ($2::uuid[] IS NULL OR d.sucursal_id = ANY($2))
            AND d.estado = 'CONFIRMADA' AND d.reserva_id IS NOT NULL AND ${FECHA_LOCAL('d.fecha_venta')} BETWEEN $3 AND $4) AS ventas_desde_reserva`,
      p,
    );
    return rows[0];
  }

  // Antigüedad del inventario actual por tramos (sucursal actual del vehículo).
  async antiguedad(alcance: Alcance, hoy: string, db: Queryable = this.pool) {
    const { rows } = await db.query<AntiguedadRow>(
      `SELECT x.tramo, count(*) AS cantidad,
              COALESCE(sum(x.costo_adquisicion + x.gastos) FILTER (WHERE x.origen <> 'CONSIGNACION'), 0) AS capital,
              sum(x.precio_venta) AS valor_publicado
       FROM (
         SELECT v.origen, v.precio_venta, v.costo_adquisicion, ${GASTOS_ACTIVOS} AS gastos,
                CASE WHEN $3::date - ${FECHA_LOCAL('v.fecha_ingreso')} <= 15 THEN '0-15'
                     WHEN $3::date - ${FECHA_LOCAL('v.fecha_ingreso')} <= 30 THEN '16-30'
                     WHEN $3::date - ${FECHA_LOCAL('v.fecha_ingreso')} <= 45 THEN '31-45'
                     WHEN $3::date - ${FECHA_LOCAL('v.fecha_ingreso')} <= 90 THEN '46-90'
                     ELSE '90+' END AS tramo
         FROM vehiculo v
         WHERE v.automotora_id = $1 AND ($2::uuid[] IS NULL OR v.sucursal_id = ANY($2)) AND ${EN_INVENTARIO}
       ) x
       GROUP BY x.tramo`,
      [alcance.automotoraId, alcance.sucursalIds, hoy],
    );
    return rows;
  }

  // Inventario actual agrupado por una columna (categoría u origen).
  async inventarioPor(
    alcance: Alcance,
    columna: 'categoria' | 'origen',
    db: Queryable = this.pool,
  ) {
    const { rows } = await db.query<GrupoRow>(
      `SELECT v.${columna}::text AS clave, count(*) AS cantidad, sum(v.precio_venta) AS monto,
              COALESCE(sum(v.costo_adquisicion + ${GASTOS_ACTIVOS}) FILTER (WHERE v.origen <> 'CONSIGNACION'), 0) AS margen,
              NULL AS dias_promedio
       FROM vehiculo v
       WHERE v.automotora_id = $1 AND ($2::uuid[] IS NULL OR v.sucursal_id = ANY($2)) AND ${EN_INVENTARIO}
       GROUP BY 1 ORDER BY count(*) DESC`,
      [alcance.automotoraId, alcance.sucursalIds],
    );
    return rows;
  }

  // Ventas confirmadas del período agrupadas por origen del vehículo, categoría
  // o vendedor (usuario que cerró la venta).
  async ventasPor(
    alcance: Alcance,
    periodo: Periodo,
    agrupacion: 'origen' | 'categoria' | 'vendedor',
    db: Queryable = this.pool,
  ) {
    const clave = {
      origen: 'v.origen::text',
      categoria: 'v.categoria::text',
      vendedor: 'u.nombre',
    }[agrupacion];
    const { rows } = await db.query<GrupoRow>(
      `SELECT ${clave} AS clave, count(*) AS cantidad, sum(ve.precio_venta_final) AS monto,
              sum(${MARGEN_VENTA}) AS margen,
              avg(${FECHA_LOCAL('ve.fecha_venta')} - ${FECHA_LOCAL('v.fecha_ingreso')}) AS dias_promedio
       FROM venta ve
       JOIN vehiculo v ON v.id = ve.vehiculo_id
       JOIN usuario u ON u.id = ve.usuario_id
       LEFT JOIN consignacion c ON c.vehiculo_id = v.id
       WHERE ve.automotora_id = $1 AND ($2::uuid[] IS NULL OR ve.sucursal_id = ANY($2))
         AND ve.estado = 'CONFIRMADA' AND ${FECHA_LOCAL('ve.fecha_venta')} BETWEEN $3 AND $4
       GROUP BY 1 ORDER BY count(*) DESC, sum(ve.precio_venta_final) DESC`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows;
  }

  // Formas de pago de las ventas confirmadas del período.
  async formasPago(alcance: Alcance, periodo: Periodo, db: Queryable = this.pool) {
    const { rows } = await db.query<GrupoRow>(
      `SELECT f.tipo::text AS clave, count(DISTINCT ve.id) AS cantidad, sum(f.monto) AS monto,
              0 AS margen, NULL AS dias_promedio
       FROM venta_forma_pago f JOIN venta ve ON ve.id = f.venta_id
       WHERE ve.automotora_id = $1 AND ($2::uuid[] IS NULL OR ve.sucursal_id = ANY($2))
         AND ve.estado = 'CONFIRMADA' AND ${FECHA_LOCAL('ve.fecha_venta')} BETWEEN $3 AND $4
       GROUP BY 1 ORDER BY sum(f.monto) DESC`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows;
  }

  // Gastos activos del período por categoría (los generales solo en el consolidado).
  async gastosPorCategoria(alcance: Alcance, periodo: Periodo, db: Queryable = this.pool) {
    const { rows } = await db.query<GrupoRow & { tipo: string }>(
      `SELECT g.categoria::text AS clave, g.tipo::text AS tipo, count(*) AS cantidad, sum(g.monto) AS monto,
              0 AS margen, NULL AS dias_promedio
       FROM gasto g
       WHERE g.automotora_id = $1 AND ($2::uuid[] IS NULL OR g.sucursal_id = ANY($2))
         AND g.estado = 'ACTIVO' AND g.fecha BETWEEN $3 AND $4
       GROUP BY 1, 2 ORDER BY sum(g.monto) DESC`,
      [alcance.automotoraId, alcance.sucursalIds, periodo.desde, periodo.hasta],
    );
    return rows;
  }
}
