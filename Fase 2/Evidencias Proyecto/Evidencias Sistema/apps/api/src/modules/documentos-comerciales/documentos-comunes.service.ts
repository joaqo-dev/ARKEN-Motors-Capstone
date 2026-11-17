import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { hoyEnChile, sumarDias } from '../../common/fechas';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { AutomotorasRepository } from '../automotoras/automotoras.repository';
import { ClientesRepository } from '../clientes/clientes.repository';
import { VehiculoRow, VehiculosRepository } from '../vehiculos/vehiculos.repository';

export type TipoVigencia = 'COTIZACION' | 'RESERVA' | 'TASACION';

// Reglas transversales a Cotización, Reserva y Tasación (Módulo 10).
@Injectable()
export class DocumentosComunesService {
  constructor(
    private readonly clientes: ClientesRepository,
    private readonly automotoras: AutomotorasRepository,
    private readonly vehiculos: VehiculosRepository,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async validarCliente(clienteId: string, automotoraId: string) {
    const cliente = await this.clientes.findById(clienteId, automotoraId);
    if (!cliente) throw new BadRequestException('El cliente no existe');
    if (cliente.estado !== 'ACTIVO') throw new BadRequestException('El cliente está desactivado');
    return cliente;
  }

  // Vigencia por defecto configurable por automotora, ajustable caso a caso.
  async vigencia(
    tipo: TipoVigencia,
    automotoraId: string,
    diasIndicados: number | undefined,
  ): Promise<{ dias: number; fechaVencimiento: string }> {
    let dias = diasIndicados;
    if (dias === undefined) {
      const automotora = await this.automotoras.findById(automotoraId);
      if (!automotora) throw new NotFoundException('Automotora no encontrada');
      dias = {
        COTIZACION: automotora.dias_validez_cotizacion,
        RESERVA: automotora.dias_validez_reserva,
        TASACION: automotora.dias_validez_tasacion,
      }[tipo];
    }
    return { dias, fechaVencimiento: sumarDias(hoyEnChile(), dias) };
  }

  // Bloquea el vehículo dentro de la transacción y revalida el scope.
  async bloquearVehiculo(
    id: string,
    actor: UsuarioAutenticado,
    client: PoolClient,
  ): Promise<VehiculoRow> {
    const row = await this.vehiculos.lockById(id, actor.automotoraId, client);
    const scope = getScope(actor);
    if (!row || (scope.sucursalId && row.sucursal_id !== scope.sucursalId)) {
      throw new NotFoundException('Vehículo no encontrado');
    }
    return row;
  }

  validarNuevaFechaVencimiento(actual: string, nueva: string) {
    if (nueva <= actual || nueva < hoyEnChile()) {
      throw new BadRequestException(
        'La nueva fecha de vencimiento debe ser posterior a la actual y no puede estar en el pasado',
      );
    }
  }

  async auditar(
    actor: UsuarioAutenticado,
    // folio: se guarda junto al cambio para que la auditoría enlace «N° X» también en
    // anulaciones, cancelaciones y extensiones, que no lo incluyen en sus valores.
    entidad: { tipo: string; id: string; sucursalId: string; folio?: number },
    accion: string,
    client: PoolClient,
    anterior: Record<string, unknown> | null,
    nuevo: Record<string, unknown> | null,
  ) {
    await this.auditoria.registrar(
      {
        automotoraId: actor.automotoraId,
        usuarioId: actor.id,
        sucursalId: entidad.sucursalId, // sucursal congelada del documento
        accion,
        entidadTipo: entidad.tipo,
        entidadId: entidad.id,
        valorAnterior: anterior,
        valorNuevo:
          entidad.folio !== undefined && nuevo && nuevo.folio === undefined
            ? { ...nuevo, folio: entidad.folio }
            : nuevo,
      },
      client,
    );
  }
}
