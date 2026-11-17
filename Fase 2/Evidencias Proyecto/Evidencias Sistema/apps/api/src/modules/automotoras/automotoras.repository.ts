import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export interface AutomotoraRow {
  id: string;
  nombre: string;
  rut: string;
  subdominio: string;
  direccion: string;
  telefono: string;
  email: string;
  logo_url: string | null;
  banner_url: string | null;
  descripcion: string | null;
  dias_validez_cotizacion: number;
  dias_validez_reserva: number;
  dias_validez_tasacion: number;
  correo_cotizacion: boolean;
  correo_reserva: boolean;
  correo_tasacion: boolean;
  correo_venta: boolean;
  correo_consignacion: boolean;
  dias_seguimiento_cotizacion: number | null;
  dias_aviso_cotizacion: number | null;
  dias_aviso_reserva: number | null;
  dias_aviso_tasacion: number | null;
  financiamiento_activo: boolean;
  financiamiento_tasa_mensual: string | null; // NUMERIC: pg lo entrega como texto
  financiamiento_pie_minimo: number;
  financiamiento_plazo_maximo: number;
  fecha_registro: Date;
}

export interface NuevaAutomotora {
  nombre: string;
  rut: string;
  subdominio: string;
  direccion: string;
  telefono: string;
  email: string;
}

export interface CambiosConfiguracion {
  nombre?: string;
  rut?: string;
  email?: string;
  direccion?: string;
  telefono?: string;
  descripcion?: string | null;
  diasValidezCotizacion?: number;
  diasValidezReserva?: number;
  diasValidezTasacion?: number;
  correoCotizacion?: boolean;
  correoReserva?: boolean;
  correoTasacion?: boolean;
  correoVenta?: boolean;
  correoConsignacion?: boolean;
  diasSeguimientoCotizacion?: number | null;
  diasAvisoCotizacion?: number | null;
  diasAvisoReserva?: number | null;
  diasAvisoTasacion?: number | null;
  financiamientoActivo?: boolean;
  financiamientoTasaMensual?: number | null;
  financiamientoPieMinimo?: number;
  financiamientoPlazoMaximo?: number;
}

const COLUMNAS_CONFIGURACION: Record<keyof CambiosConfiguracion, string> = {
  nombre: 'nombre',
  rut: 'rut',
  email: 'email',
  direccion: 'direccion',
  telefono: 'telefono',
  descripcion: 'descripcion',
  diasValidezCotizacion: 'dias_validez_cotizacion',
  diasValidezReserva: 'dias_validez_reserva',
  diasValidezTasacion: 'dias_validez_tasacion',
  correoCotizacion: 'correo_cotizacion',
  correoReserva: 'correo_reserva',
  correoTasacion: 'correo_tasacion',
  correoVenta: 'correo_venta',
  correoConsignacion: 'correo_consignacion',
  diasSeguimientoCotizacion: 'dias_seguimiento_cotizacion',
  diasAvisoCotizacion: 'dias_aviso_cotizacion',
  diasAvisoReserva: 'dias_aviso_reserva',
  diasAvisoTasacion: 'dias_aviso_tasacion',
  financiamientoActivo: 'financiamiento_activo',
  financiamientoTasaMensual: 'financiamiento_tasa_mensual',
  financiamientoPieMinimo: 'financiamiento_pie_minimo',
  financiamientoPlazoMaximo: 'financiamiento_plazo_maximo',
};

@Injectable()
export class AutomotorasRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(id: string, db: Queryable = this.pool): Promise<AutomotoraRow | null> {
    const { rows } = await db.query<AutomotoraRow>('SELECT * FROM automotora WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async existeSubdominio(subdominio: string, db: Queryable = this.pool): Promise<boolean> {
    const { rows } = await db.query('SELECT 1 FROM automotora WHERE subdominio = $1', [subdominio]);
    return rows.length > 0;
  }

  async create(data: NuevaAutomotora, db: Queryable = this.pool): Promise<AutomotoraRow> {
    const { rows } = await db.query<AutomotoraRow>(
      `INSERT INTO automotora (nombre, rut, subdominio, direccion, telefono, email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.nombre, data.rut, data.subdominio, data.direccion, data.telefono, data.email],
    );
    return rows[0];
  }

  async lockById(id: string, db: Queryable): Promise<AutomotoraRow | null> {
    const { rows } = await db.query<AutomotoraRow>(
      'SELECT * FROM automotora WHERE id = $1 FOR UPDATE',
      [id],
    );
    return rows[0] ?? null;
  }

  // El subdominio nunca se actualiza (fijo tras el registro, Módulo 1).
  async update(
    id: string,
    cambios: CambiosConfiguracion,
    db: Queryable = this.pool,
  ): Promise<AutomotoraRow> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const campo of Object.keys(COLUMNAS_CONFIGURACION) as (keyof CambiosConfiguracion)[]) {
      if (cambios[campo] === undefined) continue;
      params.push(cambios[campo]);
      sets.push(`${COLUMNAS_CONFIGURACION[campo]} = $${params.length}`);
    }
    const { rows } = await db.query<AutomotoraRow>(
      sets.length === 0
        ? 'SELECT * FROM automotora WHERE id = $1'
        : `UPDATE automotora SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );
    return rows[0];
  }

  async setImagen(
    id: string,
    tipo: 'LOGO' | 'BANNER',
    url: string | null,
    db: Queryable = this.pool,
  ): Promise<void> {
    const columna = tipo === 'LOGO' ? 'logo_url' : 'banner_url';
    await db.query(`UPDATE automotora SET ${columna} = $2 WHERE id = $1`, [id, url]);
  }
}
