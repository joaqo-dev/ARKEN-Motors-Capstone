import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  calcularLiquidacion,
  EstadoVehiculo,
  esPatenteValida,
  normalizarPatente,
  RolUsuario,
} from '@vitriauto/shared-types';
import { DatabaseError } from 'pg';
import { formatearCLP, hoyEnChile } from '../../common/fechas';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { CotizacionesRepository } from '../cotizaciones/cotizaciones.repository';
import { ConsignacionesRepository, tratoDeFila } from '../consignaciones/consignaciones.repository';
import { DocumentosComunesService } from '../documentos-comerciales/documentos-comunes.service';
import { ListarDocumentosDto } from '../documentos-comerciales/dto-comunes';
import { CorreosService } from '../correos/correos.service';
import { DocumentosPdfService } from '../documentos-pdf/documentos-pdf.service';
import { FoliosRepository } from '../folios/folios.repository';
import { ReservasRepository } from '../reservas/reservas.repository';
import { VehiculoBitacoraRepository } from '../vehiculos/vehiculo-bitacora.repository';
import { VehiculoFotosRepository } from '../vehiculos/vehiculo-fotos.repository';
import { VehiculosRepository } from '../vehiculos/vehiculos.repository';
import { CreateVentaDto } from './dto/create-venta.dto';
import { VentaDetalleRow, VentasRepository } from './ventas.repository';

// Estados desde los que se puede vender (Módulo 7.6: transiciones flexibles).
const VENDIBLES: EstadoVehiculo[] = [
  'DISPONIBLE',
  'EN_PREPARACION',
  'PENDIENTE_REVISION',
  'RESERVADO',
];

const aCentavos = (monto: number) => Math.round(monto * 100);

export function toVentaResponse(row: VentaDetalleRow) {
  const precio = Number(row.precio_venta_final);
  const sena = row.reserva_monto ? Number(row.reserva_monto) : 0;
  const adicionales = row.costos.reduce((s, c) => s + Number(c.monto), 0);
  return {
    id: row.id,
    folio: row.folio,
    sucursal: { id: row.sucursal_id, nombre: row.sucursal_nombre },
    cliente: { id: row.cliente_id, nombre: row.cliente_nombre, rut: row.cliente_rut },
    vehiculo: {
      id: row.vehiculo_id,
      patente: row.vehiculo_patente,
      descripcion: row.vehiculo_descripcion,
      origen: row.vehiculo_origen,
    },
    precioVentaFinal: precio,
    reserva: row.reserva_id
      ? { id: row.reserva_id, folio: row.reserva_folio, senaDescontada: sena }
      : null,
    cotizacion: row.cotizacion_id ? { id: row.cotizacion_id, folio: row.cotizacion_folio } : null,
    // Total que paga el cliente (precio + adicionales) y lo pagado en esta venta.
    totalAPagar: precio + adicionales,
    saldoPagado: precio + adicionales - sena,
    formasPago: row.formas.map((f) => ({
      tipo: f.tipo,
      monto: Number(f.monto),
      vehiculoRecibido: f.vehiculo_recibido_id
        ? { id: f.vehiculo_recibido_id, patente: f.patente }
        : null,
    })),
    costosAdicionales: row.costos.map((c) => ({
      descripcion: c.descripcion,
      monto: Number(c.monto),
    })),
    fechaVenta: row.fecha_venta,
    estado: row.estado,
    vendidaPor: { id: row.usuario_id, nombre: row.usuario_nombre },
    anulacion: row.motivo_anulacion
      ? {
          motivo: row.motivo_anulacion,
          fecha: row.fecha_anulacion,
          usuarioId: row.usuario_anulacion_id,
        }
      : null,
    pdfUrl: `/ventas/${row.id}/pdf`,
  };
}

// Ventas (Módulo 11) y su anulación (Módulo 12). Cierre: todos los roles.
// Anulación: solo admins (controller), con motivo obligatorio.
@Injectable()
export class VentasService {
  constructor(
    private readonly ventas: VentasRepository,
    private readonly vehiculos: VehiculosRepository,
    private readonly fotos: VehiculoFotosRepository,
    private readonly bitacora: VehiculoBitacoraRepository,
    private readonly reservas: ReservasRepository,
    private readonly consignaciones: ConsignacionesRepository,
    private readonly cotizaciones: CotizacionesRepository,
    private readonly folios: FoliosRepository,
    private readonly comunes: DocumentosComunesService,
    private readonly pdf: DocumentosPdfService,
    private readonly correos: CorreosService,
    private readonly tx: TransactionRunner,
  ) {}

  async listar(filtro: ListarDocumentosDto, actor: UsuarioAutenticado) {
    const { rows, total } = await this.ventas.findAll(getScope(actor), {
      ...filtro,
      sucursalId: actor.rol === 'ADMIN_GENERAL' ? filtro.sucursalId : undefined,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    return { items: rows.map(toVentaResponse), total };
  }

  async obtener(id: string, actor: UsuarioAutenticado) {
    const row = await this.buscarOFallar(id, actor);
    return {
      ...toVentaResponse(row),
      liquidacionConsignacion: await this.liquidacion(row, actor.rol),
    };
  }

  async cerrar(dto: CreateVentaDto, actor: UsuarioAutenticado) {
    const vehiculo = await this.vehiculos.findByIdScoped(dto.vehiculoId, getScope(actor));
    if (!vehiculo) throw new NotFoundException('Vehículo no encontrado');
    await this.comunes.validarCliente(dto.clienteId, actor.automotoraId);
    const recibidos = this.validarFormasPago(dto, vehiculo.patente);

    let id: string;
    try {
      id = await this.tx.run(async (client) => {
        const actual = await this.comunes.bloquearVehiculo(dto.vehiculoId, actor, client);
        if (!VENDIBLES.includes(actual.estado)) {
          throw new ConflictException(`No se puede vender un vehículo ${actual.estado}`);
        }

        // Si el vehículo tiene una reserva activa, la venta debe concretarla.
        const reserva = await this.reservas.lockActivaPorVehiculo(actual.id, client);
        if (reserva && dto.reservaId !== reserva.id) {
          throw new ConflictException(
            `El vehículo tiene la reserva N° ${reserva.folio} activa: la venta debe concretarla (indica reservaId)`,
          );
        }
        if (!reserva && dto.reservaId) {
          throw new BadRequestException('La reserva indicada no está activa para este vehículo');
        }
        if (reserva && reserva.cliente_id !== dto.clienteId) {
          throw new BadRequestException('La reserva es de otro cliente');
        }

        // Cotización que concreta: vigente, del mismo vehículo y cliente.
        const cotizacion = dto.cotizacionId
          ? await this.cotizaciones.lockById(dto.cotizacionId, client)
          : null;
        if (dto.cotizacionId) {
          if (
            !cotizacion ||
            cotizacion.automotora_id !== actor.automotoraId ||
            cotizacion.vehiculo_id !== actual.id
          ) {
            throw new BadRequestException('La cotización no corresponde a este vehículo');
          }
          if (cotizacion.cliente_id !== dto.clienteId) {
            throw new BadRequestException('La cotización es de otro cliente');
          }
          if (cotizacion.estado !== 'VIGENTE') {
            throw new ConflictException(
              `La cotización N° ${cotizacion.folio} está ${cotizacion.estado}: solo se concreta una VIGENTE`,
            );
          }
        }

        // Cuadre: las formas de pago suman el total a pagar = precio final +
        // adicionales − seña ya pagada. Los adicionales no entran en el margen.
        const sena = reserva ? Number(reserva.monto_reserva) : 0;
        const adicionales = (dto.costosAdicionales ?? []).reduce((s, c) => s + c.monto, 0);
        if (sena > dto.precioVentaFinal + adicionales) {
          throw new BadRequestException('La seña de la reserva supera el total de la venta');
        }
        const totalPagos = dto.formasPago.reduce((suma, f) => suma + aCentavos(f.monto), 0);
        const esperado = aCentavos(dto.precioVentaFinal + adicionales - sena);
        if (totalPagos !== esperado) {
          const detalle = [
            `precio ${formatearCLP(dto.precioVentaFinal)}`,
            ...(adicionales ? [`+ adicionales ${formatearCLP(adicionales)}`] : []),
            ...(sena ? [`− seña ${formatearCLP(sena)}`] : []),
          ];
          throw new BadRequestException(
            `Las formas de pago suman ${formatearCLP(totalPagos / 100)} y deben sumar ${formatearCLP(esperado / 100)}` +
              (detalle.length > 1 ? ` (${detalle.join(' ')})` : ''),
          );
        }

        // Consignado: bajo el precio mínimo solo un admin puede cerrar la venta.
        let bajoPrecioMinimo = false;
        const consignacion =
          actual.origen === 'CONSIGNACION'
            ? await this.consignaciones.lockByVehiculo(actual.id, client)
            : null;
        if (consignacion) {
          if (consignacion.estado !== 'ACTIVA' && consignacion.estado !== 'VENCIDA') {
            throw new ConflictException(`La consignación está ${consignacion.estado}`);
          }
          bajoPrecioMinimo = dto.precioVentaFinal < Number(consignacion.precio_minimo);
          if (bajoPrecioMinimo && actor.rol === 'VENDEDOR') {
            throw new ForbiddenException(
              `El precio es menor al mínimo aceptado por el consignante (${formatearCLP(Number(consignacion.precio_minimo))}): solo un admin puede cerrar esta venta`,
            );
          }
        }

        const folio = await this.folios.siguiente('venta', actor.automotoraId, client);
        const venta = await this.ventas.create(
          {
            automotoraId: actor.automotoraId,
            folio,
            sucursalId: actual.sucursal_id,
            vehiculoId: actual.id,
            clienteId: dto.clienteId,
            reservaId: reserva?.id ?? null,
            cotizacionId: cotizacion?.id ?? null,
            precioVentaFinal: dto.precioVentaFinal,
            usuarioId: actor.id,
          },
          client,
        );
        for (const costo of dto.costosAdicionales ?? []) {
          await this.ventas.createCosto(venta.id, costo.descripcion, costo.monto, client);
        }

        for (const [i, forma] of dto.formasPago.entries()) {
          let recibidoId: string | null = null;
          if (forma.tipo === 'PARTE_PAGO') {
            const datos = recibidos.get(i)!;
            if (
              await this.vehiculos.existePatenteEnInventario(
                actor.automotoraId,
                datos.patente,
                null,
                client,
              )
            ) {
              throw new ConflictException(
                `El vehículo recibido en parte de pago (${datos.patente}) ya está en el inventario`,
              );
            }
            const recibido = await this.vehiculos.create(
              {
                automotoraId: actor.automotoraId,
                sucursalId: actual.sucursal_id,
                marca: datos.marca,
                modelo: datos.modelo,
                anio: datos.anio,
                version: datos.version ?? null,
                kilometraje: datos.kilometraje,
                color: datos.color,
                combustible: datos.combustible ?? 'OTRO',
                transmision: datos.transmision ?? 'OTRO',
                cilindrada: null,
                patente: datos.patente,
                categoria: datos.categoria ?? 'OTRO',
                // Moto: sin tracción (no aplica).
                traccion: datos.categoria === 'MOTO' ? null : (datos.traccion ?? 'OTRO'),
                descripcion: null,
                // Precio provisorio hasta completar la revisión; su costo es el valor en que se recibió.
                precioVenta: forma.monto,
                costoAdquisicion: forma.monto,
                origen: 'PARTE_PAGO',
                estado: 'PENDIENTE_REVISION',
                ventaOrigenId: venta.id,
                fechaIngreso: null,
                tasacionOrigenId: null,
              },
              client,
            );
            recibidoId = recibido.id;
            await this.bitacora.registrar(
              {
                vehiculoId: recibido.id,
                tipoEvento: 'ALTA',
                descripcion: `Recibido en parte de pago (venta N° ${folio}) por ${formatearCLP(forma.monto)} — pendiente de revisión`,
                usuarioId: actor.id,
                referenciaTipo: 'VENTA',
                referenciaId: venta.id,
              },
              client,
            );
          }
          await this.ventas.createFormaPago(venta.id, forma.tipo, forma.monto, recibidoId, client);
        }

        await this.vehiculos.setEstado(actual.id, 'VENDIDO', client);
        await this.bitacora.registrar(
          {
            vehiculoId: actual.id,
            tipoEvento: 'VENTA_CONCRETADA',
            descripcion:
              `Venta N° ${folio} por ${formatearCLP(dto.precioVentaFinal)} — Estado: ${actual.estado} → VENDIDO` +
              (reserva
                ? ` (concreta la reserva N° ${reserva.folio}, seña ${formatearCLP(sena)})`
                : '') +
              (cotizacion ? ` (concreta la cotización N° ${cotizacion.folio})` : ''),
            usuarioId: actor.id,
            referenciaTipo: 'VENTA',
            referenciaId: venta.id,
          },
          client,
        );
        if (reserva) await this.reservas.convertirEnVenta(reserva.id, client);
        if (cotizacion) await this.cotizaciones.setEstado(cotizacion.id, 'CONCRETADA', client);
        if (consignacion) await this.consignaciones.setEstado(consignacion.id, 'VENDIDA', client);

        await this.comunes.auditar(
          actor,
          { tipo: 'VENTA', id: venta.id, sucursalId: actual.sucursal_id },
          'VENTA_CONFIRMADA',
          client,
          null,
          {
            folio,
            precioVentaFinal: dto.precioVentaFinal,
            formasPago: dto.formasPago.map((f) => ({ tipo: f.tipo, monto: f.monto })),
            ...(reserva ? { reservaFolio: reserva.folio, sena } : {}),
            ...(cotizacion ? { cotizacionFolio: cotizacion.folio } : {}),
            ...(bajoPrecioMinimo
              ? { bajoPrecioMinimo: true, precioMinimo: Number(consignacion!.precio_minimo) }
              : {}),
          },
        );
        return venta.id;
      });
    } catch (err) {
      if (err instanceof DatabaseError && err.constraint === 'uq_venta_confirmada_por_cotizacion') {
        throw new ConflictException('La cotización ya fue concretada en otra venta');
      }
      if (err instanceof DatabaseError && err.constraint === 'uq_venta_confirmada_por_vehiculo') {
        throw new ConflictException('El vehículo ya tiene una venta confirmada');
      }
      if (err instanceof DatabaseError && err.constraint === 'uq_vehiculo_patente_en_inventario') {
        throw new ConflictException(
          'El vehículo recibido en parte de pago ya está en el inventario',
        );
      }
      throw err;
    }

    await this.pdf.generarTrasEmitir('VENTA', id);
    await this.correos.alEmitir('VENTA', id, actor, dto.enviarCorreo);
    return this.obtener(id, actor);
  }

  // Anulación (Módulo 12): el vehículo vuelve a estar disponible, la reserva que
  // concretaba se cancela con la seña retenida (ingreso), la consignación se
  // reactiva, y el vehículo recibido en parte de pago NO se toca.
  async anular(id: string, motivo: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    await this.tx.run(async (client) => {
      const venta = await this.ventas.lockById(id, client);
      if (!venta) throw new NotFoundException('Venta no encontrada');
      if (venta.estado !== 'CONFIRMADA') throw new ConflictException('La venta ya está anulada');

      const vehiculo = await this.vehiculos.lockById(venta.vehiculo_id, actor.automotoraId, client);
      if (!vehiculo) throw new NotFoundException('Vehículo no encontrado');

      await this.ventas.anular(id, motivo, actor.id, client);

      let detalleEstado = '';
      if (vehiculo.estado === 'VENDIDO') {
        if (
          await this.vehiculos.existePatenteEnInventario(
            actor.automotoraId,
            vehiculo.patente,
            vehiculo.id,
            client,
          )
        ) {
          throw new ConflictException(
            `No se puede anular: ya hay otro vehículo con patente ${vehiculo.patente} en el inventario`,
          );
        }
        const destino: EstadoVehiculo =
          (await this.fotos.contar(vehiculo.id, client)) > 0 ? 'DISPONIBLE' : 'EN_PREPARACION';
        await this.vehiculos.setEstado(vehiculo.id, destino, client);
        detalleEstado = ` — Estado: VENDIDO → ${destino}`;
      }

      if (venta.reserva_id) {
        await this.reservas.cancelar(
          venta.reserva_id,
          `Anulación de la venta N° ${venta.folio}: ${motivo}`,
          true, // la seña no se devuelve: queda como ingreso
          actor.id,
          client,
        );
      }
      // La cotización que concretaba vuelve a vigente (o vencida si ya pasó su plazo).
      if (venta.cotizacion_id) {
        const cotizacion = await this.cotizaciones.lockById(venta.cotizacion_id, client);
        if (cotizacion?.estado === 'CONCRETADA') {
          const estado = cotizacion.fecha_vencimiento < hoyEnChile() ? 'VENCIDA' : 'VIGENTE';
          await this.cotizaciones.setEstado(cotizacion.id, estado, client);
        }
      }
      if (vehiculo.origen === 'CONSIGNACION') {
        const consignacion = await this.consignaciones.findByVehiculo(vehiculo.id, client);
        if (consignacion?.estado === 'VENDIDA') {
          const estado = consignacion.fecha_fin < hoyEnChile() ? 'VENCIDA' : 'ACTIVA';
          await this.consignaciones.setEstado(consignacion.id, estado, client);
        }
      }

      await this.bitacora.registrar(
        {
          vehiculoId: vehiculo.id,
          tipoEvento: 'ANULACION',
          descripcion: `Venta N° ${venta.folio} anulada: ${motivo}${detalleEstado}`,
          usuarioId: actor.id,
          referenciaTipo: 'VENTA',
          referenciaId: venta.id,
        },
        client,
      );
      await this.comunes.auditar(
        actor,
        { tipo: 'VENTA', id, sucursalId: venta.sucursal_id, folio: venta.folio },
        'VENTA_ANULADA',
        client,
        { estado: 'CONFIRMADA' },
        { estado: 'ANULADA', motivo, ...(venta.reserva_id ? { senaRetenida: true } : {}) },
      );
    });
    return this.obtener(id, actor);
  }

  async rutaPdf(id: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    return this.pdf.ruta('VENTA', id);
  }

  // Estructura de las formas de pago (antes de abrir la transacción).
  private validarFormasPago(dto: CreateVentaDto, patenteVendida: string) {
    const recibidos = new Map<
      number,
      NonNullable<CreateVentaDto['formasPago'][number]['vehiculoRecibido']>
    >();
    const patentes = new Set<string>();
    dto.formasPago.forEach((forma, i) => {
      if (forma.tipo !== 'PARTE_PAGO') {
        if (forma.vehiculoRecibido) {
          throw new BadRequestException('vehiculoRecibido solo aplica a formas de pago PARTE_PAGO');
        }
        return;
      }
      if (!forma.vehiculoRecibido) {
        throw new BadRequestException(
          'Una forma de pago PARTE_PAGO requiere los datos del vehículo recibido',
        );
      }
      if (!esPatenteValida(forma.vehiculoRecibido.patente)) {
        throw new BadRequestException(
          `Patente inválida del vehículo recibido: ${forma.vehiculoRecibido.patente}`,
        );
      }
      const patente = normalizarPatente(forma.vehiculoRecibido.patente);
      if (patente === patenteVendida || patentes.has(patente)) {
        throw new BadRequestException(`Patente repetida en la venta: ${patente}`);
      }
      patentes.add(patente);
      recibidos.set(i, { ...forma.vehiculoRecibido, patente });
    });
    return recibidos;
  }

  // Liquidación de la consignación (solo admins: el vendedor no ve la comisión).
  private async liquidacion(row: VentaDetalleRow, rol: RolUsuario) {
    if (rol === 'VENDEDOR' || row.vehiculo_origen !== 'CONSIGNACION') return null;
    const consignacion = await this.consignaciones.findByVehiculo(row.vehiculo_id);
    if (!consignacion) return null;
    return calcularLiquidacion(tratoDeFila(consignacion), Number(row.precio_venta_final));
  }

  private async buscarOFallar(id: string, actor: UsuarioAutenticado): Promise<VentaDetalleRow> {
    const row = await this.ventas.findByIdAccesible(id, getScope(actor));
    if (!row) throw new NotFoundException('Venta no encontrada');
    return row;
  }
}
