import { Injectable } from '@nestjs/common';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { AccesosRepository } from './accesos.repository';
import { AuditoriaRepository } from './auditoria.repository';
import { ListarAccesosDto } from './dto/listar-accesos.dto';
import { ListarAuditoriaDto } from './dto/listar-auditoria.dto';

@Injectable()
export class AuditoriaService {
  constructor(
    private readonly auditoria: AuditoriaRepository,
    private readonly registroAccesos: AccesosRepository,
  ) {}

  async listar(filtro: ListarAuditoriaDto, actor: UsuarioAutenticado) {
    const esGeneral = actor.rol === 'ADMIN_GENERAL';
    const { rows, total } = await this.auditoria.findAll(getScope(actor), {
      ...filtro,
      sucursalId: esGeneral ? filtro.sucursalId : undefined,
      soloAutomotora: esGeneral ? filtro.soloAutomotora : undefined,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        fecha: r.fecha,
        usuario: { id: r.usuario_id, nombre: r.usuario_nombre, email: r.usuario_email },
        sucursal: r.sucursal_id ? { id: r.sucursal_id, nombre: r.sucursal_nombre } : null,
        accion: r.accion,
        entidad: { tipo: r.entidad_tipo, id: r.entidad_id },
        valorAnterior: r.valor_anterior,
        valorNuevo: r.valor_nuevo,
      })),
      total,
    };
  }

  // Solo ADMIN_GENERAL (controller): todos los usuarios de su automotora.
  async accesos(filtro: ListarAccesosDto, actor: UsuarioAutenticado) {
    const { rows, total } = await this.registroAccesos.findAll(actor.automotoraId, {
      ...filtro,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        fecha: r.fecha,
        usuario: { id: r.usuario_id, nombre: r.usuario_nombre, email: r.usuario_email },
        evento: r.evento,
        motivo: r.motivo,
        ip: r.ip,
        userAgent: r.user_agent,
      })),
      total,
    };
  }
}
