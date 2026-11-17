import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { calcularLiquidacion, RolUsuario } from '@vitriauto/shared-types';
import { normalizarTrato } from './trato';
import { PoolClient } from 'pg';
import { formatearCLP, hoyEnChile } from '../../common/fechas';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { DocumentosPdfService } from '../documentos-pdf/documentos-pdf.service';
import { VehiculoBitacoraRepository } from '../vehiculos/vehiculo-bitacora.repository';
import { toConsignacionResumen } from '../vehiculos/vehiculos.mapper';
import { VehiculosRepository } from '../vehiculos/vehiculos.repository';
import {
  ConsignacionDetalleRow,
  ConsignacionesRepository,
  ConsignacionRow,
  tratoDeFila,
} from './consignaciones.repository';
import { ActualizarCondicionesDto } from './dto/actualizar-condiciones.dto';
import { DevolverConsignacionDto } from './dto/devolver-consignacion.dto';
import { ExtenderConsignacionDto } from './dto/extender-consignacion.dto';
import { ListarConsignacionesDto } from './dto/listar-consignaciones.dto';

export function toConsignacionResponse(row: ConsignacionDetalleRow, rol: RolUsuario) {
  return {
    ...toConsignacionResumen(row, rol),
    cliente: { id: row.cliente_id, nombre: row.cliente_nombre, rut: row.cliente_rut },
    vehiculo: {
      id: row.vehiculo_id,
      patente: row.vehiculo_patente,
      descripcion: row.vehiculo_descripcion,
      estado: row.vehiculo_estado,
      precioVenta: Number(row.vehiculo_precio_venta),
      sucursal: { id: row.vehiculo_sucursal_id, nombre: row.vehiculo_sucursal_nombre },
    },
    sucursalRegistroId: row.sucursal_id,
    diasEnStock: row.dias_en_stock,
    fechaCreacion: row.fecha_creacion,
    pdfUrl: `/consignaciones/${row.id}/pdf`,
  };
}

// Consignaciones (Módulo 9). La gestión (condiciones, extensión, devolución,
// liquidación) es solo de admins (controller); el Vendedor solo consulta, sin comisión.
@Injectable()
export class ConsignacionesService {
  constructor(
    private readonly consignaciones: ConsignacionesRepository,
    private readonly vehiculos: VehiculosRepository,
    private readonly bitacora: VehiculoBitacoraRepository,
    private readonly auditoria: AuditoriaRepository,
    private readonly pdf: DocumentosPdfService,
    private readonly tx: TransactionRunner,
  ) {}

  async rutaPdf(id: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    return this.pdf.ruta('CONSIGNACION', id);
  }

  async listar(filtro: ListarConsignacionesDto, actor: UsuarioAutenticado) {
    const { rows, total } = await this.consignaciones.findAllScoped(getScope(actor), {
      estado: filtro.estado,
      clienteId: filtro.clienteId,
      sucursalId: actor.rol === 'ADMIN_GENERAL' ? filtro.sucursalId : undefined,
      q: filtro.q,
      orden: filtro.orden,
      direccion: filtro.direccion,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    return { items: rows.map((r) => toConsignacionResponse(r, actor.rol)), total };
  }

  async obtener(id: string, actor: UsuarioAutenticado) {
    return toConsignacionResponse(await this.buscarOFallar(id, actor), actor.rol);
  }

  async actualizarCondiciones(
    id: string,
    dto: ActualizarCondicionesDto,
    actor: UsuarioAutenticado,
  ) {
    const detalle = await this.buscarOFallar(id, actor);
    await this.tx.run(async (client) => {
      const actual = await this.bloquear(id, client);
      if (actual.estado !== 'ACTIVA') {
        throw new ConflictException(
          'Solo se modifican las condiciones de una consignación ACTIVA (si venció, extiéndela primero)',
        );
      }
      // Lo que no viene en el DTO se mantiene; si cambia el tipo de trato, se
      // exige el dato propio del nuevo tipo (normalizarTrato).
      const previo = tratoDeFila(actual);
      const tipoTrato = dto.tipoTrato ?? previo.tipoTrato;
      const mismoTipo = tipoTrato === previo.tipoTrato;
      const nuevo = normalizarTrato(
        {
          tipoTrato,
          porcentajeComision:
            dto.porcentajeComision ?? (mismoTipo ? previo.porcentajeComision : null),
          montoNeto: dto.montoNeto ?? (mismoTipo ? previo.montoNeto : null),
          precioMinimo: dto.precioMinimo ?? Number(actual.precio_minimo),
        },
        Number(detalle.vehiculo_precio_venta),
      );
      await this.consignaciones.updateCondiciones(id, nuevo, client);
      await this.auditar(
        actor,
        detalle,
        'CONSIGNACION_CAMBIO_CONDICIONES',
        client,
        this.condiciones(actual),
        { ...nuevo },
      );
    });
    return this.obtener(id, actor);
  }

  // Al vencer el plazo: extender (vuelve a ACTIVA) o devolver el vehículo.
  async extender(id: string, dto: ExtenderConsignacionDto, actor: UsuarioAutenticado) {
    const detalle = await this.buscarOFallar(id, actor);
    await this.tx.run(async (client) => {
      const actual = await this.bloquear(id, client);
      if (actual.estado !== 'ACTIVA' && actual.estado !== 'VENCIDA') {
        throw new ConflictException(`No se puede extender una consignación ${actual.estado}`);
      }
      if (dto.nuevaFechaFin <= actual.fecha_fin || dto.nuevaFechaFin < hoyEnChile()) {
        throw new BadRequestException(
          'La nueva fecha de término debe ser posterior a la actual y no puede estar en el pasado',
        );
      }
      await this.consignaciones.extender(id, dto.nuevaFechaFin, client);
      await this.auditar(
        actor,
        detalle,
        'CONSIGNACION_EXTENDIDA',
        client,
        { fechaFin: actual.fecha_fin, estado: actual.estado },
        { fechaFin: dto.nuevaFechaFin, estado: 'ACTIVA' },
      );
    });
    return this.obtener(id, actor);
  }

  // Devolución al consignante: la consignación queda DEVUELTA y el vehículo
  // sale del inventario (DADO_DE_BAJA), liberando la patente.
  async devolver(id: string, dto: DevolverConsignacionDto, actor: UsuarioAutenticado) {
    const detalle = await this.buscarOFallar(id, actor);
    await this.tx.run(async (client) => {
      const actual = await this.bloquear(id, client);
      if (actual.estado !== 'ACTIVA' && actual.estado !== 'VENCIDA') {
        throw new ConflictException(`No se puede devolver una consignación ${actual.estado}`);
      }
      const vehiculo = await this.vehiculos.lockById(
        actual.vehiculo_id,
        actor.automotoraId,
        client,
      );
      if (!vehiculo) throw new NotFoundException('Vehículo no encontrado');
      if (vehiculo.estado === 'RESERVADO' || vehiculo.estado === 'VENDIDO') {
        throw new ConflictException(
          `El vehículo está ${vehiculo.estado}: no se puede devolver al consignante`,
        );
      }

      await this.consignaciones.setEstado(id, 'DEVUELTA', client);
      await this.vehiculos.setEstado(vehiculo.id, 'DADO_DE_BAJA', client);
      await this.bitacora.registrar(
        {
          vehiculoId: vehiculo.id,
          tipoEvento: 'CAMBIO_ESTADO',
          descripcion:
            `Estado: ${vehiculo.estado} → DADO_DE_BAJA — devuelto al consignante (consignación folio ${actual.folio})` +
            (dto.motivo ? `: ${dto.motivo}` : ''),
          usuarioId: actor.id,
        },
        client,
      );
      await this.auditar(
        actor,
        detalle,
        'CONSIGNACION_DEVUELTA',
        client,
        { estado: actual.estado, estadoVehiculo: vehiculo.estado },
        {
          estado: 'DEVUELTA',
          estadoVehiculo: 'DADO_DE_BAJA',
          ...(dto.motivo ? { motivo: dto.motivo } : {}),
        },
      );
    });
    return this.obtener(id, actor);
  }

  // Liquidación (sin descuento de gastos): comisión de la automotora vs. monto
  // para el consignante. Sin precio indicado, se simula al precio de venta actual.
  async liquidacion(id: string, precioVenta: number | undefined, actor: UsuarioAutenticado) {
    const detalle = await this.buscarOFallar(id, actor);
    const precio = precioVenta ?? Number(detalle.vehiculo_precio_venta);
    const liquidacion = calcularLiquidacion(tratoDeFila(detalle), precio);
    const precioMinimo = Number(detalle.precio_minimo);
    const advertencias: string[] = [];
    if (precio < precioMinimo) {
      advertencias.push(
        `El precio es menor al mínimo aceptado por el consignante (${formatearCLP(precioMinimo)})`,
      );
    }
    if (liquidacion.montoConsignante < 0) {
      advertencias.push('La comisión supera el precio de venta');
    }
    if (liquidacion.comision < 0) {
      advertencias.push(
        'El precio no alcanza a cubrir el neto garantizado al dueño: la automotora pierde la diferencia',
      );
    }
    return { ...liquidacion, precioMinimo, advertencias };
  }

  private condiciones(c: ConsignacionRow) {
    return { ...tratoDeFila(c), precioMinimo: Number(c.precio_minimo) };
  }

  private async auditar(
    actor: UsuarioAutenticado,
    detalle: ConsignacionDetalleRow,
    accion: string,
    client: PoolClient,
    anterior: Record<string, unknown>,
    nuevo: Record<string, unknown>,
  ) {
    await this.auditoria.registrar(
      {
        automotoraId: actor.automotoraId,
        usuarioId: actor.id,
        // Sucursal donde está hoy el vehículo (quien gestiona la consignación).
        sucursalId: detalle.vehiculo_sucursal_id,
        accion,
        entidadTipo: 'CONSIGNACION',
        entidadId: detalle.id,
        valorAnterior: anterior,
        // Con el folio, la auditoría enlaza «Consignación N° X» también en extensiones y devoluciones.
        valorNuevo: nuevo.folio === undefined ? { ...nuevo, folio: detalle.folio } : nuevo,
      },
      client,
    );
  }

  private async bloquear(id: string, client: PoolClient): Promise<ConsignacionRow> {
    const row = await this.consignaciones.lockById(id, client);
    if (!row) throw new NotFoundException('Consignación no encontrada');
    return row;
  }

  private async buscarOFallar(
    id: string,
    actor: UsuarioAutenticado,
  ): Promise<ConsignacionDetalleRow> {
    const row = await this.consignaciones.findByIdScoped(id, getScope(actor));
    if (!row) throw new NotFoundException('Consignación no encontrada');
    return row;
  }
}
