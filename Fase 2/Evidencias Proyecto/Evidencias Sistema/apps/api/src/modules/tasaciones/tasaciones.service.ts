import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { esPatenteValida, normalizarPatente } from '@vitriauto/shared-types';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { DocumentosComunesService } from '../documentos-comerciales/documentos-comunes.service';
import { ListarDocumentosDto } from '../documentos-comerciales/dto-comunes';
import { CorreosService } from '../correos/correos.service';
import { DocumentosPdfService } from '../documentos-pdf/documentos-pdf.service';
import { FoliosRepository } from '../folios/folios.repository';
import { SucursalesRepository } from '../sucursales/sucursales.repository';
import { CreateTasacionDto } from './dto/create-tasacion.dto';
import { TasacionDetalleRow, TasacionesRepository } from './tasaciones.repository';

export function toTasacionResponse(row: TasacionDetalleRow) {
  return {
    id: row.id,
    folio: row.folio,
    sucursal: { id: row.sucursal_id, nombre: row.sucursal_nombre },
    cliente: { id: row.cliente_id, nombre: row.cliente_nombre, rut: row.cliente_rut },
    vehiculoTasado: {
      patente: row.patente,
      marca: row.marca,
      modelo: row.modelo,
      version: row.version,
      anio: row.anio,
      kilometraje: row.kilometraje,
      estadoGeneral: row.estado_general,
    },
    ofertaMonto: Number(row.oferta_monto),
    fechaEmision: row.fecha_emision,
    fechaVencimiento: row.fecha_vencimiento,
    estado: row.estado,
    emitidaPor: { id: row.usuario_id, nombre: row.usuario_nombre },
    // Si se aceptó y se compró: el vehículo creado con origen COMPRA_PARTICULAR.
    vehiculoCreadoId: row.vehiculo_creado_id,
    anulacion: row.motivo_anulacion
      ? {
          motivo: row.motivo_anulacion,
          fecha: row.fecha_anulacion,
          usuarioId: row.usuario_anulacion_id,
        }
      : null,
    pdfUrl: `/tasaciones/${row.id}/pdf`,
  };
}

// Tasaciones: flujo inverso, independiente del inventario. No aparecen en la
// bitácora de ningún vehículo ni generan notificaciones.
@Injectable()
export class TasacionesService {
  constructor(
    private readonly tasaciones: TasacionesRepository,
    private readonly sucursales: SucursalesRepository,
    private readonly folios: FoliosRepository,
    private readonly comunes: DocumentosComunesService,
    private readonly pdf: DocumentosPdfService,
    private readonly correos: CorreosService,
    private readonly tx: TransactionRunner,
  ) {}

  async listar(filtro: ListarDocumentosDto, actor: UsuarioAutenticado) {
    const { rows, total } = await this.tasaciones.findAll(getScope(actor), {
      ...filtro,
      vehiculoId: undefined,
      sucursalId: actor.rol === 'ADMIN_GENERAL' ? filtro.sucursalId : undefined,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    return { items: rows.map(toTasacionResponse), total };
  }

  async obtener(id: string, actor: UsuarioAutenticado) {
    return toTasacionResponse(await this.buscarOFallar(id, actor));
  }

  async emitir(dto: CreateTasacionDto, actor: UsuarioAutenticado) {
    const sucursalId = await this.resolverSucursal(dto.sucursalId, actor);
    if (!esPatenteValida(dto.patente)) {
      throw new BadRequestException('Patente inválida (formatos: AB1234, BCDF12, ABC12, AB123)');
    }
    // Se tasa un auto ajeno: uno que ya está en el inventario no se puede comprar.
    const patente = normalizarPatente(dto.patente);
    if (await this.tasaciones.patenteEnInventario(actor.automotoraId, patente)) {
      throw new ConflictException(
        `El vehículo ${patente} ya está en el inventario de la automotora`,
      );
    }
    await this.comunes.validarCliente(dto.clienteId, actor.automotoraId);
    const vigencia = await this.comunes.vigencia('TASACION', actor.automotoraId, dto.vigenciaDias);

    const id = await this.tx.run(async (client) => {
      const folio = await this.folios.siguiente('tasacion', actor.automotoraId, client);
      const tasacion = await this.tasaciones.create(
        {
          automotoraId: actor.automotoraId,
          folio,
          sucursalId,
          clienteId: dto.clienteId,
          patente,
          marca: dto.marca,
          modelo: dto.modelo,
          version: dto.version ?? null,
          anio: dto.anio,
          kilometraje: dto.kilometraje,
          estadoGeneral: dto.estadoGeneral,
          ofertaMonto: dto.ofertaMonto,
          fechaVencimiento: vigencia.fechaVencimiento,
          usuarioId: actor.id,
        },
        client,
      );
      await this.comunes.auditar(
        actor,
        { tipo: 'TASACION', id: tasacion.id, sucursalId },
        'TASACION_EMITIDA',
        client,
        null,
        { folio, ofertaMonto: dto.ofertaMonto, fechaVencimiento: vigencia.fechaVencimiento },
      );
      return tasacion.id;
    });

    await this.pdf.generarTrasEmitir('TASACION', id);
    await this.correos.alEmitir('TASACION', id, actor, dto.enviarCorreo);
    return this.obtener(id, actor);
  }

  async resolver(id: string, estado: 'ACEPTADA' | 'RECHAZADA', actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    await this.tx.run(async (client) => {
      const actual = await this.tasaciones.lockById(id, client);
      if (!actual) throw new NotFoundException('Tasación no encontrada');
      if (actual.estado !== 'VIGENTE') {
        throw new ConflictException(
          `La tasación está ${actual.estado}: solo se resuelve una VIGENTE`,
        );
      }
      await this.tasaciones.setEstado(id, estado, client);
      await this.comunes.auditar(
        actor,
        { tipo: 'TASACION', id, sucursalId: actual.sucursal_id },
        `TASACION_${estado}`,
        client,
        { estado: actual.estado },
        { estado },
      );
    });
    return this.obtener(id, actor);
  }

  async anular(id: string, motivo: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    await this.tx.run(async (client) => {
      const actual = await this.tasaciones.lockById(id, client);
      if (!actual) throw new NotFoundException('Tasación no encontrada');
      if (actual.estado === 'ANULADA') throw new ConflictException('La tasación ya está anulada');
      if (await this.tasaciones.tieneVehiculoCreado(id, client)) {
        throw new ConflictException(
          'La tasación ya originó un vehículo en inventario: no se puede anular',
        );
      }
      await this.tasaciones.anular(id, motivo, actor.id, client);
      await this.comunes.auditar(
        actor,
        { tipo: 'TASACION', id, sucursalId: actual.sucursal_id },
        'TASACION_ANULADA',
        client,
        { estado: actual.estado },
        { estado: 'ANULADA', motivo },
      );
    });
    return this.obtener(id, actor);
  }

  async rutaPdf(id: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    return this.pdf.ruta('TASACION', id);
  }

  // Sin vehículo del cual derivarla: la sucursal es la del usuario o la que
  // elija el ADMIN_GENERAL.
  private async resolverSucursal(sucursalId: string | undefined, actor: UsuarioAutenticado) {
    if (actor.rol !== 'ADMIN_GENERAL') {
      if (sucursalId && sucursalId !== actor.sucursalId) {
        throw new ForbiddenException('Solo puedes emitir tasaciones en tu propia sucursal');
      }
      return actor.sucursalId!;
    }
    if (!sucursalId) throw new BadRequestException('Indica la sucursal que emite la tasación');
    const sucursal = await this.sucursales.findByIdScoped(sucursalId, getScope(actor));
    if (!sucursal)
      throw new BadRequestException('La sucursal indicada no existe o fue dada de baja');
    return sucursal.id;
  }

  private async buscarOFallar(id: string, actor: UsuarioAutenticado): Promise<TasacionDetalleRow> {
    const row = await this.tasaciones.findByIdScoped(id, getScope(actor));
    if (!row) throw new NotFoundException('Tasación no encontrada');
    return row;
  }
}
