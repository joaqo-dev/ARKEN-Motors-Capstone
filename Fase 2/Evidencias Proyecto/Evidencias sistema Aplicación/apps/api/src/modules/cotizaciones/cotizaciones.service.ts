import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatearCLP } from '../../common/fechas';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { DocumentosComunesService } from '../documentos-comerciales/documentos-comunes.service';
import { ListarDocumentosDto } from '../documentos-comerciales/dto-comunes';
import { CorreosService } from '../correos/correos.service';
import { DocumentosPdfService } from '../documentos-pdf/documentos-pdf.service';
import { FoliosRepository } from '../folios/folios.repository';
import { VehiculoBitacoraRepository } from '../vehiculos/vehiculo-bitacora.repository';
import { VehiculosRepository } from '../vehiculos/vehiculos.repository';
import { ConsignacionesRepository } from '../consignaciones/consignaciones.repository';
import { CotizacionDetalleRow, CotizacionesRepository } from './cotizaciones.repository';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';

export function toCotizacionResponse(row: CotizacionDetalleRow) {
  return {
    id: row.id,
    folio: row.folio,
    sucursal: { id: row.sucursal_id, nombre: row.sucursal_nombre },
    cliente: { id: row.cliente_id, nombre: row.cliente_nombre, rut: row.cliente_rut },
    vehiculo: {
      id: row.vehiculo_id,
      patente: row.vehiculo_patente,
      descripcion: row.vehiculo_descripcion,
      estado: row.vehiculo_estado,
    },
    precioCotizado: Number(row.precio_cotizado),
    costosAdicionales: row.costos.map((c) => ({
      descripcion: c.descripcion,
      monto: Number(c.monto),
    })),
    vigenciaDias: row.vigencia_dias,
    fechaEmision: row.fecha_emision,
    fechaVencimiento: row.fecha_vencimiento,
    estado: row.estado,
    venta: row.venta_id ? { id: row.venta_id, folio: row.venta_folio } : null,
    emitidaPor: { id: row.usuario_id, nombre: row.usuario_nombre },
    anulacion: row.motivo_anulacion
      ? {
          motivo: row.motivo_anulacion,
          fecha: row.fecha_anulacion,
          usuarioId: row.usuario_anulacion_id,
        }
      : null,
    pdfUrl: `/cotizaciones/${row.id}/pdf`,
  };
}

// Cotizaciones (Módulo 10.1). Todos los roles emiten y anulan (con motivo). No se
// aceptan ni rechazan a mano: vencen solas y quedan CONCRETADA cuando una venta
// las concreta (VentasService).
@Injectable()
export class CotizacionesService {
  constructor(
    private readonly cotizaciones: CotizacionesRepository,
    private readonly vehiculos: VehiculosRepository,
    private readonly consignaciones: ConsignacionesRepository,
    private readonly bitacora: VehiculoBitacoraRepository,
    private readonly folios: FoliosRepository,
    private readonly comunes: DocumentosComunesService,
    private readonly pdf: DocumentosPdfService,
    private readonly correos: CorreosService,
    private readonly tx: TransactionRunner,
  ) {}

  async listar(filtro: ListarDocumentosDto, actor: UsuarioAutenticado) {
    const { rows, total } = await this.cotizaciones.findAll(getScope(actor), {
      ...filtro,
      sucursalId: actor.rol === 'ADMIN_GENERAL' ? filtro.sucursalId : undefined,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    return { items: rows.map(toCotizacionResponse), total };
  }

  async obtener(id: string, actor: UsuarioAutenticado) {
    return toCotizacionResponse(await this.buscarOFallar(id, actor));
  }

  async emitir(dto: CreateCotizacionDto, actor: UsuarioAutenticado) {
    const vehiculo = await this.vehiculos.findByIdScoped(dto.vehiculoId, getScope(actor));
    if (!vehiculo) throw new NotFoundException('Vehículo no encontrado');
    await this.comunes.validarCliente(dto.clienteId, actor.automotoraId);
    const vigencia = await this.comunes.vigencia(
      'COTIZACION',
      actor.automotoraId,
      dto.vigenciaDias,
    );

    const id = await this.tx.run(async (client) => {
      const actual = await this.comunes.bloquearVehiculo(dto.vehiculoId, actor, client);
      if (actual.estado === 'VENDIDO' || actual.estado === 'DADO_DE_BAJA') {
        throw new ConflictException(`No se puede cotizar un vehículo ${actual.estado}`);
      }
      // Consignado: nunca se cotiza bajo el mínimo que aceptó el dueño.
      if (actual.origen === 'CONSIGNACION') {
        const consignacion = await this.consignaciones.lockByVehiculo(actual.id, client);
        const minimo = consignacion ? Number(consignacion.precio_minimo) : 0;
        if (dto.precioCotizado < minimo) {
          throw new BadRequestException(
            `El precio cotizado es menor al mínimo aceptado por el dueño (${formatearCLP(minimo)})`,
          );
        }
      }
      // Folio correlativo de la automotora; sucursal congelada: la del vehículo al emitir.
      const folio = await this.folios.siguiente('cotizacion', actor.automotoraId, client);
      const cotizacion = await this.cotizaciones.create(
        {
          automotoraId: actor.automotoraId,
          folio,
          sucursalId: actual.sucursal_id,
          clienteId: dto.clienteId,
          vehiculoId: dto.vehiculoId,
          precioCotizado: dto.precioCotizado,
          vigenciaDias: vigencia.dias,
          fechaVencimiento: vigencia.fechaVencimiento,
          usuarioId: actor.id,
        },
        client,
      );
      for (const costo of dto.costosAdicionales ?? []) {
        await this.cotizaciones.createCosto(cotizacion.id, costo.descripcion, costo.monto, client);
      }
      await this.bitacora.registrar(
        {
          vehiculoId: dto.vehiculoId,
          tipoEvento: 'COTIZACION_GENERADA',
          descripcion: `Cotización N° ${folio} por ${formatearCLP(dto.precioCotizado)}`,
          usuarioId: actor.id,
          referenciaTipo: 'COTIZACION',
          referenciaId: cotizacion.id,
        },
        client,
      );
      await this.comunes.auditar(
        actor,
        { tipo: 'COTIZACION', id: cotizacion.id, sucursalId: actual.sucursal_id },
        'COTIZACION_EMITIDA',
        client,
        null,
        { folio, precioCotizado: dto.precioCotizado, fechaVencimiento: vigencia.fechaVencimiento },
      );
      return cotizacion.id;
    });

    await this.pdf.generarTrasEmitir('COTIZACION', id);
    await this.correos.alEmitir('COTIZACION', id, actor, dto.enviarCorreo);
    return this.obtener(id, actor);
  }

  // Corrección de errores: nunca se edita, se anula (con motivo) y se emite otra.
  async anular(id: string, motivo: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    await this.tx.run(async (client) => {
      const actual = await this.cotizaciones.lockById(id, client);
      if (!actual) throw new NotFoundException('Cotización no encontrada');
      if (actual.estado === 'ANULADA') throw new ConflictException('La cotización ya está anulada');
      if (actual.estado === 'CONCRETADA') {
        throw new ConflictException(
          'La cotización ya se concretó en una venta: para deshacerla se anula la venta',
        );
      }
      await this.cotizaciones.anular(id, motivo, actor.id, client);
      await this.comunes.auditar(
        actor,
        { tipo: 'COTIZACION', id, sucursalId: actual.sucursal_id, folio: actual.folio },
        'COTIZACION_ANULADA',
        client,
        { estado: actual.estado },
        { estado: 'ANULADA', motivo },
      );
    });
    return this.obtener(id, actor);
  }

  async rutaPdf(id: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    return this.pdf.ruta('COTIZACION', id);
  }

  private async buscarOFallar(
    id: string,
    actor: UsuarioAutenticado,
  ): Promise<CotizacionDetalleRow> {
    const row = await this.cotizaciones.findByIdAccesible(id, getScope(actor));
    if (!row) throw new NotFoundException('Cotización no encontrada');
    return row;
  }
}
