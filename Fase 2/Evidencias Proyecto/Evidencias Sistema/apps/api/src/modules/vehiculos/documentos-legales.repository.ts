import { Inject, Injectable } from '@nestjs/common';
import type { RespaldoDocumentoLegal, TipoDocumentoLegal } from '@vitriauto/shared-types';
import { Pool } from 'pg';
import { PG_POOL, Queryable } from '../../db/pool';

export interface DocumentoLegalRow {
  id: string;
  vehiculo_id: string;
  tipo: TipoDocumentoLegal;
  respaldo: RespaldoDocumentoLegal;
  archivo_url: string; // clave interna del archivo privado, no una URL pública
  fecha_vencimiento: string; // DATE como 'YYYY-MM-DD'
  fecha_primera_inscripcion: string | null;
  fecha_carga: Date;
  cargado_por: string;
  cargado_por_nombre: string;
  vigente: boolean;
}

export interface NuevoDocumentoLegal {
  vehiculoId: string;
  tipo: TipoDocumentoLegal;
  respaldo: RespaldoDocumentoLegal;
  archivoClave: string;
  fechaVencimiento: string;
  fechaPrimeraInscripcion: string | null;
  cargadoPor: string;
}

// Con el nombre de quien lo cargó.
const SELECT_DOCUMENTO = `
  SELECT d.*, uc.nombre AS cargado_por_nombre
  FROM documento_legal_vehiculo d
  JOIN usuario uc ON uc.id = d.cargado_por`;

@Injectable()
export class DocumentosLegalesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByVehiculo(
    vehiculoId: string,
    incluirHistorial: boolean,
    db: Queryable = this.pool,
  ): Promise<DocumentoLegalRow[]> {
    const { rows } = await db.query<DocumentoLegalRow>(
      `${SELECT_DOCUMENTO}
       WHERE d.vehiculo_id = $1 AND ($2 OR d.vigente)
       ORDER BY d.tipo, d.fecha_carga DESC`,
      [vehiculoId, incluirHistorial],
    );
    return rows;
  }

  async findById(
    id: string,
    vehiculoId: string,
    db: Queryable = this.pool,
  ): Promise<DocumentoLegalRow | null> {
    const { rows } = await db.query<DocumentoLegalRow>(
      `${SELECT_DOCUMENTO} WHERE d.id = $1 AND d.vehiculo_id = $2`,
      [id, vehiculoId],
    );
    return rows[0] ?? null;
  }

  // Renovación: el documento vigente anterior pasa a historial y el nuevo queda vigente.
  async renovar(doc: NuevoDocumentoLegal, db: Queryable): Promise<DocumentoLegalRow> {
    await db.query(
      `UPDATE documento_legal_vehiculo SET vigente = false
       WHERE vehiculo_id = $1 AND tipo = $2 AND vigente`,
      [doc.vehiculoId, doc.tipo],
    );
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO documento_legal_vehiculo
         (vehiculo_id, tipo, respaldo, archivo_url, fecha_vencimiento, fecha_primera_inscripcion, cargado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        doc.vehiculoId,
        doc.tipo,
        doc.respaldo,
        doc.archivoClave,
        doc.fechaVencimiento,
        doc.fechaPrimeraInscripcion,
        doc.cargadoPor,
      ],
    );
    return (await this.findById(rows[0].id, doc.vehiculoId, db))!;
  }
}
