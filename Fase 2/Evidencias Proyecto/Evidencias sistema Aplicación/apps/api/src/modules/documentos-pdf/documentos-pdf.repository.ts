import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export type TipoDocumentoComercial =
  'COTIZACION' | 'RESERVA' | 'TASACION' | 'CONSIGNACION' | 'VENTA';

const TABLA: Record<TipoDocumentoComercial, string> = {
  COTIZACION: 'cotizacion',
  RESERVA: 'reserva',
  TASACION: 'tasacion',
  CONSIGNACION: 'consignacion',
  VENTA: 'venta',
};

// Datos comunes del encabezado (automotora + sucursal congelada del documento)
// y del cliente, presentes en los 4 documentos.
export interface DatosEncabezado {
  folio: number;
  automotora_nombre: string;
  automotora_rut: string;
  automotora_email: string;
  sucursal_nombre: string;
  sucursal_direccion: string;
  sucursal_telefono: string;
  cliente_nombre: string;
  cliente_rut: string;
  cliente_telefono: string;
  cliente_email: string;
  cliente_direccion: string;
  ejecutivo_nombre: string;
  pdf_url: string | null;
}

export interface DatosVehiculo {
  vehiculo_marca: string;
  vehiculo_modelo: string;
  vehiculo_version: string | null;
  vehiculo_anio: number;
  vehiculo_patente: string;
  vehiculo_kilometraje: number;
  vehiculo_color: string;
}

export interface DatosCotizacion extends DatosEncabezado, DatosVehiculo {
  precio_cotizado: string;
  vigencia_dias: number;
  fecha_emision: Date;
  fecha_vencimiento: string;
  costos: { descripcion: string; monto: string }[];
}

export interface DatosReserva extends DatosEncabezado, DatosVehiculo {
  monto_reserva: string;
  vehiculo_precio_venta: string;
  condiciones_devolucion: string | null;
  fecha_emision: Date;
  fecha_vencimiento: string;
}

export interface DatosTasacion extends DatosEncabezado {
  patente: string;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number;
  kilometraje: number;
  estado_general: string;
  oferta_monto: string;
  fecha_emision: Date;
  fecha_vencimiento: string;
}

export interface DatosConsignacion extends DatosEncabezado, DatosVehiculo {
  tipo_trato: 'COMISION_VENTA' | 'PRECIO_NETO';
  porcentaje_comision: string | null;
  monto_neto: string | null;
  precio_minimo: string;
  vehiculo_precio_venta: string;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_creacion: Date;
}

export interface DatosVenta extends DatosEncabezado, DatosVehiculo {
  precio_venta_final: string;
  fecha_venta: Date;
  reserva_folio: number | null;
  reserva_monto: string | null;
  formas: { tipo: string; monto: string; patente: string | null }[];
  costos: { descripcion: string; monto: string }[];
}

const ENCABEZADO = `
  d.folio, d.pdf_url,
  a.nombre AS automotora_nombre, a.rut AS automotora_rut, a.email AS automotora_email,
  s.nombre AS sucursal_nombre, s.direccion AS sucursal_direccion, s.telefono AS sucursal_telefono,
  cl.nombre AS cliente_nombre, cl.rut AS cliente_rut, cl.telefono AS cliente_telefono,
  cl.email AS cliente_email, cl.direccion AS cliente_direccion,
  u.nombre AS ejecutivo_nombre`;

const VEHICULO = `
  v.marca AS vehiculo_marca, v.modelo AS vehiculo_modelo, v.version AS vehiculo_version,
  v.anio AS vehiculo_anio, v.patente AS vehiculo_patente, v.kilometraje AS vehiculo_kilometraje,
  v.color AS vehiculo_color, v.precio_venta AS vehiculo_precio_venta`;

const JOINS = `
  JOIN automotora a ON a.id = d.automotora_id
  JOIN sucursal s ON s.id = d.sucursal_id
  JOIN cliente cl ON cl.id = d.cliente_id
  JOIN usuario u ON u.id = d.usuario_id`;

@Injectable()
export class DocumentosPdfRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async cotizacion(id: string, db: Queryable = this.pool): Promise<DatosCotizacion | null> {
    const { rows } = await db.query<DatosCotizacion>(
      `SELECT ${ENCABEZADO}, ${VEHICULO}, d.precio_cotizado, d.vigencia_dias, d.fecha_emision, d.fecha_vencimiento,
              COALESCE((SELECT json_agg(json_build_object('descripcion', c.descripcion, 'monto', c.monto))
                        FROM cotizacion_costo c WHERE c.cotizacion_id = d.id), '[]') AS costos
       FROM cotizacion d ${JOINS} JOIN vehiculo v ON v.id = d.vehiculo_id
       WHERE d.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async reserva(id: string, db: Queryable = this.pool): Promise<DatosReserva | null> {
    const { rows } = await db.query<DatosReserva>(
      `SELECT ${ENCABEZADO}, ${VEHICULO}, d.monto_reserva, d.condiciones_devolucion,
              d.fecha_emision, d.fecha_vencimiento
       FROM reserva d ${JOINS} JOIN vehiculo v ON v.id = d.vehiculo_id
       WHERE d.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async tasacion(id: string, db: Queryable = this.pool): Promise<DatosTasacion | null> {
    const { rows } = await db.query<DatosTasacion>(
      `SELECT ${ENCABEZADO}, d.patente, d.marca, d.modelo, d.version, d.anio, d.kilometraje,
              d.estado_general, d.oferta_monto, d.fecha_emision, d.fecha_vencimiento
       FROM tasacion d ${JOINS}
       WHERE d.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async consignacion(id: string, db: Queryable = this.pool): Promise<DatosConsignacion | null> {
    const { rows } = await db.query<DatosConsignacion>(
      `SELECT ${ENCABEZADO}, ${VEHICULO}, d.tipo_trato, d.porcentaje_comision, d.monto_neto, d.precio_minimo,
              d.fecha_inicio, d.fecha_fin, d.fecha_creacion
       FROM consignacion d ${JOINS} JOIN vehiculo v ON v.id = d.vehiculo_id
       WHERE d.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async venta(id: string, db: Queryable = this.pool): Promise<DatosVenta | null> {
    const { rows } = await db.query<DatosVenta>(
      `SELECT ${ENCABEZADO}, ${VEHICULO}, d.precio_venta_final, d.fecha_venta,
              r.folio AS reserva_folio, r.monto_reserva AS reserva_monto,
              COALESCE((SELECT json_agg(json_build_object('tipo', f.tipo, 'monto', f.monto, 'patente', vr.patente))
                        FROM venta_forma_pago f LEFT JOIN vehiculo vr ON vr.id = f.vehiculo_recibido_id
                        WHERE f.venta_id = d.id), '[]') AS formas,
              COALESCE((SELECT json_agg(json_build_object('descripcion', c.descripcion, 'monto', c.monto))
                        FROM venta_costo c WHERE c.venta_id = d.id), '[]') AS costos
       FROM venta d ${JOINS} JOIN vehiculo v ON v.id = d.vehiculo_id
       LEFT JOIN reserva r ON r.id = d.reserva_id
       WHERE d.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  // Solo se fija si aún no tenía PDF: el documento emitido no cambia.
  async fijarPdf(tipo: TipoDocumentoComercial, id: string, clave: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE ${TABLA[tipo]} SET pdf_url = $2 WHERE id = $1 AND pdf_url IS NULL`,
      [id, clave],
    );
    return (rowCount ?? 0) > 0;
  }
}
