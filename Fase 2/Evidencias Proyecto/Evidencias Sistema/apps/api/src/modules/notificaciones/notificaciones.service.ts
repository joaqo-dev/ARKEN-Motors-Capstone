import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseError } from 'pg';
import { hoyEnChile, sumarDias, sumarDiasHabiles } from '../../common/fechas';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import {
  NotificacionesRepository,
  NotificacionRow,
  TipoNotificacion,
} from './notificaciones.repository';
import { planificarNotificaciones } from './planificador';

// Anticipación de los avisos.
const DIAS_HABILES_DOCUMENTOS = 7;
const DIAS_HABILES_CONSIGNACIONES = 7;
const DIAS_RESERVAS = 1;

export function toNotificacionResponse(row: NotificacionRow) {
  return {
    id: row.id,
    tipo: row.tipo,
    mensaje: row.mensaje,
    sucursal: { id: row.sucursal_id, nombre: row.sucursal_nombre },
    fechaGeneracion: row.fecha_generacion,
    estado: row.estado,
    fechaResolucion: row.fecha_resolucion,
    resueltaPor: row.usuario_resolucion_id,
    referencias: row.referencias.map((r) => ({ tipo: r.entidad_tipo, id: r.entidad_id })),
  };
}

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly notificaciones: NotificacionesRepository,
    private readonly auditoria: AuditoriaRepository,
    private readonly tx: TransactionRunner,
  ) {}

  // Genera los avisos de todas las automotoras. Idempotente: cada evento tiene
  // una clave única y nunca se avisa dos veces.
  async generar(hoy: string = hoyEnChile()): Promise<number> {
    const [documentos, reservas, consignacionesPrevio, consignacionesDia] = await Promise.all([
      this.notificaciones.documentosPorVencer(sumarDiasHabiles(hoy, DIAS_HABILES_DOCUMENTOS)),
      this.notificaciones.reservasPorVencer(sumarDias(hoy, DIAS_RESERVAS)),
      this.notificaciones.consignacionesPorVencer(
        hoy,
        sumarDiasHabiles(hoy, DIAS_HABILES_CONSIGNACIONES),
        'PREVIO',
      ),
      this.notificaciones.consignacionesPorVencer(hoy, '', 'DIA'),
    ]);
    const plan = planificarNotificaciones(
      { documentos, reservas, consignacionesPrevio, consignacionesDia },
      hoy,
    );

    let creadas = 0;
    for (const notificacion of plan) {
      try {
        await this.tx.run((client) => this.notificaciones.create(notificacion, client));
        creadas++;
      } catch (err) {
        // Otra ejecución ya avisó este evento (clave_evento UNIQUE): se omite.
        if (err instanceof DatabaseError && err.code === '23505') continue;
        throw err;
      }
    }
    if (creadas > 0) this.logger.log(`${creadas} notificación(es) generada(s)`);
    return creadas;
  }

  async listar(
    filtro: {
      estado?: 'PENDIENTE' | 'RESUELTA';
      tipo?: TipoNotificacion;
      limit?: number;
      offset?: number;
    },
    actor: UsuarioAutenticado,
  ) {
    const { rows, total, pendientes } = await this.notificaciones.findAllScoped(getScope(actor), {
      estado: filtro.estado,
      tipo: filtro.tipo,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    return { items: rows.map(toNotificacionResponse), total, pendientes };
  }

  async resolver(id: string, actor: UsuarioAutenticado) {
    const scope = getScope(actor);
    const cambio = await this.tx.run(async (client) => {
      const resuelta = await this.notificaciones.resolver(id, scope, actor.id, client);
      if (resuelta) {
        await this.auditoria.registrar(
          {
            automotoraId: actor.automotoraId,
            usuarioId: actor.id,
            sucursalId: resuelta.sucursal_id,
            accion: 'NOTIFICACION_RESUELTA',
            entidadTipo: 'NOTIFICACION',
            entidadId: id,
            valorAnterior: { estado: 'PENDIENTE' },
            valorNuevo: { estado: 'RESUELTA', tipo: resuelta.tipo, mensaje: resuelta.mensaje },
          },
          client,
        );
      }
      return resuelta;
    });
    if (!cambio && !(await this.notificaciones.existeEnScope(id, scope))) {
      throw new NotFoundException('Notificación no encontrada');
    }
    // Si ya estaba resuelta, la operación es idempotente.
  }
}
