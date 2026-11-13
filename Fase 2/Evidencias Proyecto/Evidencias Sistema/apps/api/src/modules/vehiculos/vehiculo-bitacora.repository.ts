import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export type TipoEventoBitacora =
  | 'ALTA'
  | 'CAMBIO_PRECIO'
  | 'CAMBIO_ESTADO'
  | 'GASTO_AGREGADO'
  | 'COTIZACION_GENERADA'
  | 'RESERVA_GENERADA'
  | 'VENTA_CONCRETADA'
  | 'ANULACION'
  | 'TRANSFERENCIA_SUCURSAL'
  | 'INSPECCION_FINALIZADA';

export type TipoReferenciaBitacora = 'GASTO' | 'COTIZACION' | 'RESERVA' | 'VENTA' | 'INSPECCION';

export interface NuevoEventoBitacora {
  vehiculoId: string;
  tipoEvento: TipoEventoBitacora;
  descripcion: string;
  usuarioId: string;
  referenciaTipo?: TipoReferenciaBitacora;
  referenciaId?: string;
}

export interface EventoBitacoraRow {
  id: string;
  tipo_evento: TipoEventoBitacora;
  descripcion: string;
  fecha: Date;
  usuario_id: string;
  usuario_nombre: string;
  referencia_tipo: TipoReferenciaBitacora | null;
  referencia_id: string | null;
}

@Injectable()
export class VehiculoBitacoraRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async registrar(evento: NuevoEventoBitacora, db: Queryable = this.pool): Promise<void> {
    await db.query(
      `INSERT INTO vehiculo_bitacora
         (vehiculo_id, tipo_evento, descripcion, usuario_id, referencia_tipo, referencia_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        evento.vehiculoId,
        evento.tipoEvento,
        evento.descripcion,
        evento.usuarioId,
        evento.referenciaTipo ?? null,
        evento.referenciaId ?? null,
      ],
    );
  }

  async findByVehiculo(
    vehiculoId: string,
    db: Queryable = this.pool,
  ): Promise<EventoBitacoraRow[]> {
    const { rows } = await db.query<EventoBitacoraRow>(
      `SELECT b.id, b.tipo_evento, b.descripcion, b.fecha, b.usuario_id, u.nombre AS usuario_nombre,
              b.referencia_tipo, b.referencia_id
       FROM vehiculo_bitacora b
       JOIN usuario u ON u.id = b.usuario_id
       WHERE b.vehiculo_id = $1
         -- Las cotizaciones solo se muestran si terminaron en venta (CONCRETADA):
         -- las demás serían ruido en la historia del vehículo.
         AND (b.tipo_evento <> 'COTIZACION_GENERADA'
              OR EXISTS (SELECT 1 FROM cotizacion c
                         WHERE c.id = b.referencia_id AND c.estado = 'CONCRETADA'))
       ORDER BY b.fecha DESC, b.id`,
      [vehiculoId],
    );
    return rows;
  }
}
