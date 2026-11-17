import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EstadoVehiculo } from '@vitriauto/shared-types';
import { DatabaseError } from 'pg';
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
import { VehiculoFotosRepository } from '../vehiculos/vehiculo-fotos.repository';
import { VehiculosRepository } from '../vehiculos/vehiculos.repository';
import { CreateReservaDto } from './dto/create-reserva.dto';
import { ReservaDetalleRow, ReservasRepository } from './reservas.repository';

// Estados desde los que un vehículo se puede reservar.
const RESERVABLES: EstadoVehiculo[] = ['DISPONIBLE', 'EN_PREPARACION', 'PENDIENTE_REVISION'];

export function toReservaResponse(row: ReservaDetalleRow) {
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
      precioVenta: Number(row.vehiculo_precio_venta),
    },
    montoReserva: Number(row.monto_reserva),
    condicionesDevolucion: row.condiciones_devolucion,
    fechaEmision: row.fecha_emision,
    fechaVencimiento: row.fecha_vencimiento,
    estado: row.estado,
    emitidaPor: { id: row.usuario_id, nombre: row.usuario_nombre },
    cancelacion: row.motivo_cancelacion
      ? {
          motivo: row.motivo_cancelacion,
          fecha: row.fecha_cancelacion,
          usuarioId: row.usuario_cancelacion_id,
          // true: la seña quedó como ingreso de la automotora; false: se devolvió.
          senaRetenida: row.sena_retenida,
        }
      : null,
    pdfUrl: `/reservas/${row.id}/pdf`,
  };
}

// Reservas (Módulos 10.2 y 12). Todos los roles emiten; extender y cancelar
// (dar de baja) es solo de admins, y cancelar exige motivo.
@Injectable()
export class ReservasService {
  constructor(
    private readonly reservas: ReservasRepository,
    private readonly vehiculos: VehiculosRepository,
    private readonly fotos: VehiculoFotosRepository,
    private readonly bitacora: VehiculoBitacoraRepository,
    private readonly folios: FoliosRepository,
    private readonly comunes: DocumentosComunesService,
    private readonly pdf: DocumentosPdfService,
    private readonly correos: CorreosService,
    private readonly tx: TransactionRunner,
  ) {}

  async listar(filtro: ListarDocumentosDto, actor: UsuarioAutenticado) {
    const { rows, total } = await this.reservas.findAll(getScope(actor), {
      ...filtro,
      sucursalId: actor.rol === 'ADMIN_GENERAL' ? filtro.sucursalId : undefined,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    return { items: rows.map(toReservaResponse), total };
  }

  async obtener(id: string, actor: UsuarioAutenticado) {
    return toReservaResponse(await this.buscarOFallar(id, actor));
  }

  async emitir(dto: CreateReservaDto, actor: UsuarioAutenticado) {
    const vehiculo = await this.vehiculos.findByIdScoped(dto.vehiculoId, getScope(actor));
    if (!vehiculo) throw new NotFoundException('Vehículo no encontrado');
    await this.comunes.validarCliente(dto.clienteId, actor.automotoraId);
    const vigencia = await this.comunes.vigencia('RESERVA', actor.automotoraId, dto.vigenciaDias);

    let id: string;
    try {
      id = await this.tx.run(async (client) => {
        const actual = await this.comunes.bloquearVehiculo(dto.vehiculoId, actor, client);
        if (!RESERVABLES.includes(actual.estado)) {
          throw new ConflictException(`No se puede reservar un vehículo ${actual.estado}`);
        }
        if (dto.montoReserva > Number(actual.precio_venta)) {
          throw new BadRequestException(
            'El monto de la reserva no puede superar el precio de venta',
          );
        }
        const folio = await this.folios.siguiente('reserva', actor.automotoraId, client);
        const reserva = await this.reservas.create(
          {
            automotoraId: actor.automotoraId,
            folio,
            sucursalId: actual.sucursal_id,
            clienteId: dto.clienteId,
            vehiculoId: dto.vehiculoId,
            montoReserva: dto.montoReserva,
            condicionesDevolucion: dto.condicionesDevolucion ?? null,
            fechaVencimiento: vigencia.fechaVencimiento,
            estadoVehiculoPrevio: actual.estado,
            usuarioId: actor.id,
          },
          client,
        );
        await this.vehiculos.setEstado(dto.vehiculoId, 'RESERVADO', client);
        await this.bitacora.registrar(
          {
            vehiculoId: dto.vehiculoId,
            tipoEvento: 'RESERVA_GENERADA',
            descripcion: `Reserva N° ${folio} por ${formatearCLP(dto.montoReserva)} hasta el ${vigencia.fechaVencimiento} — Estado: ${actual.estado} → RESERVADO`,
            usuarioId: actor.id,
            referenciaTipo: 'RESERVA',
            referenciaId: reserva.id,
          },
          client,
        );
        await this.comunes.auditar(
          actor,
          { tipo: 'RESERVA', id: reserva.id, sucursalId: actual.sucursal_id },
          'RESERVA_EMITIDA',
          client,
          null,
          { folio, montoReserva: dto.montoReserva, fechaVencimiento: vigencia.fechaVencimiento },
        );
        return reserva.id;
      });
    } catch (err) {
      if (err instanceof DatabaseError && err.constraint === 'uq_reserva_activa_por_vehiculo') {
        throw new ConflictException('El vehículo ya tiene una reserva activa');
      }
      throw err;
    }

    await this.pdf.generarTrasEmitir('RESERVA', id);
    await this.correos.alEmitir('RESERVA', id, actor, dto.enviarCorreo);
    return this.obtener(id, actor);
  }

  async extender(id: string, nuevaFechaVencimiento: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    await this.tx.run(async (client) => {
      const actual = await this.reservas.lockById(id, client);
      if (!actual) throw new NotFoundException('Reserva no encontrada');
      if (actual.estado !== 'VIGENTE' && actual.estado !== 'VENCIDA') {
        throw new ConflictException(`No se puede extender una reserva ${actual.estado}`);
      }
      this.comunes.validarNuevaFechaVencimiento(actual.fecha_vencimiento, nuevaFechaVencimiento);
      await this.reservas.extender(id, nuevaFechaVencimiento, client);
      await this.comunes.auditar(
        actor,
        { tipo: 'RESERVA', id, sucursalId: actual.sucursal_id, folio: actual.folio },
        'RESERVA_EXTENDIDA',
        client,
        { fechaVencimiento: actual.fecha_vencimiento, estado: actual.estado },
        { fechaVencimiento: nuevaFechaVencimiento, estado: 'VIGENTE' },
      );
    });
    return this.obtener(id, actor);
  }

  // Dar de baja una reserva (Módulo 12): libera el vehículo a su estado previo.
  // El admin indica si la seña se retiene (ingreso) o se devuelve al cliente.
  async cancelar(id: string, motivo: string, senaRetenida: boolean, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    await this.tx.run(async (client) => {
      const actual = await this.reservas.lockById(id, client);
      if (!actual) throw new NotFoundException('Reserva no encontrada');
      if (actual.estado !== 'VIGENTE' && actual.estado !== 'VENCIDA') {
        throw new ConflictException(`No se puede cancelar una reserva ${actual.estado}`);
      }
      const vehiculo = await this.vehiculos.lockById(
        actual.vehiculo_id,
        actor.automotoraId,
        client,
      );
      if (!vehiculo) throw new NotFoundException('Vehículo no encontrado');

      await this.reservas.cancelar(id, motivo, senaRetenida, actor.id, client);

      let detalleEstado = '';
      if (vehiculo.estado === 'RESERVADO') {
        // Si se reservó publicado pero ya no tiene fotos, no puede volver a publicarse.
        let restaurado = actual.estado_vehiculo_previo;
        if (restaurado === 'DISPONIBLE' && (await this.fotos.contar(vehiculo.id, client)) === 0) {
          restaurado = 'EN_PREPARACION';
        }
        await this.vehiculos.setEstado(vehiculo.id, restaurado, client);
        detalleEstado = ` — Estado: RESERVADO → ${restaurado}`;
      }
      await this.bitacora.registrar(
        {
          vehiculoId: vehiculo.id,
          tipoEvento: 'ANULACION',
          descripcion:
            `Reserva N° ${actual.folio} cancelada (seña ${senaRetenida ? 'retenida' : 'devuelta'}): ${motivo}` +
            detalleEstado,
          usuarioId: actor.id,
          referenciaTipo: 'RESERVA',
          referenciaId: id,
        },
        client,
      );
      await this.comunes.auditar(
        actor,
        { tipo: 'RESERVA', id, sucursalId: actual.sucursal_id, folio: actual.folio },
        'RESERVA_CANCELADA',
        client,
        { estado: actual.estado },
        { estado: 'CANCELADA', motivo, senaRetenida },
      );
    });
    return this.obtener(id, actor);
  }

  async rutaPdf(id: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    return this.pdf.ruta('RESERVA', id);
  }

  private async buscarOFallar(id: string, actor: UsuarioAutenticado): Promise<ReservaDetalleRow> {
    const row = await this.reservas.findByIdAccesible(id, getScope(actor));
    if (!row) throw new NotFoundException('Reserva no encontrada');
    return row;
  }
}
