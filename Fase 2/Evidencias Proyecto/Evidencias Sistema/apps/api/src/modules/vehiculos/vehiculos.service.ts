import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  esPatenteValida,
  mesRevisionTecnica,
  normalizarPatente,
  sugerirVencimientoRevisionTecnica,
} from '@vitriauto/shared-types';
import { DatabaseError, PoolClient } from 'pg';
import { formatearCLP, hoyEnChile } from '../../common/fechas';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { ClientesRepository } from '../clientes/clientes.repository';
import { normalizarTrato } from '../consignaciones/trato';
import { ConsignacionesRepository } from '../consignaciones/consignaciones.repository';
import { CorreosService } from '../correos/correos.service';
import { DocumentosPdfService } from '../documentos-pdf/documentos-pdf.service';
import { FoliosRepository } from '../folios/folios.repository';
import { NotificacionesRepository } from '../notificaciones/notificaciones.repository';
import { SucursalesRepository } from '../sucursales/sucursales.repository';
import { TasacionesRepository } from '../tasaciones/tasaciones.repository';
import { DocumentosLegalesRepository } from './documentos-legales.repository';
import { CambiarEstadoVehiculoDto } from './dto/cambiar-estado.dto';
import { CreateVehiculoDto, DatosConsignacionDto } from './dto/create-vehiculo.dto';
import { ListarVehiculosDto } from './dto/listar-vehiculos.dto';
import { TransferirVehiculoDto } from './dto/transferir-vehiculo.dto';
import { UpdateVehiculoDto } from './dto/update-vehiculo.dto';
import { VehiculoBitacoraRepository } from './vehiculo-bitacora.repository';
import { VehiculoFotosRepository } from './vehiculo-fotos.repository';
import {
  toConsignacionResumen,
  toDocumentoResponse,
  toFotoResponse,
  toVehiculoResponse,
} from './vehiculos.mapper';
import { VehiculoListadoRow, VehiculoRow, VehiculosRepository } from './vehiculos.repository';

const PATENTE_DUPLICADA = 'Ya existe un vehículo con esa patente en el inventario de la automotora';

const ETIQUETA_ORIGEN: Record<string, string> = {
  COMPRA_DIRECTA: 'Compra directa',
  CONSIGNACION: 'Consignación',
  PARTE_PAGO: 'Parte de pago',
  COMPRA_PARTICULAR: 'Compra a particular',
};

// Datos generales del vehículo tal como se guardan en la auditoría.
function datosGenerales(v: VehiculoRow): Record<string, unknown> {
  return {
    marca: v.marca,
    modelo: v.modelo,
    anio: v.anio,
    version: v.version,
    kilometraje: v.kilometraje,
    color: v.color,
    combustible: v.combustible,
    transmision: v.transmision,
    cilindrada: v.cilindrada,
    patente: v.patente,
    categoria: v.categoria,
    traccion: v.traccion,
    descripcion: v.descripcion,
  };
}

@Injectable()
export class VehiculosService {
  constructor(
    private readonly vehiculos: VehiculosRepository,
    private readonly fotos: VehiculoFotosRepository,
    private readonly documentos: DocumentosLegalesRepository,
    private readonly bitacora: VehiculoBitacoraRepository,
    private readonly consignaciones: ConsignacionesRepository,
    private readonly clientes: ClientesRepository,
    private readonly sucursales: SucursalesRepository,
    private readonly folios: FoliosRepository,
    private readonly auditoria: AuditoriaRepository,
    private readonly tasaciones: TasacionesRepository,
    private readonly pdf: DocumentosPdfService,
    private readonly correos: CorreosService,
    private readonly tx: TransactionRunner,
    private readonly notificaciones: NotificacionesRepository,
  ) {}

  async listar(filtro: ListarVehiculosDto, actor: UsuarioAutenticado) {
    // Ordenar por costo revelaría costos, que el Vendedor no puede ver.
    if (filtro.orden === 'costo' && actor.rol === 'VENDEDOR') {
      throw new ForbiddenException('No tienes permiso para ordenar por costo');
    }
    const { rows, total } = await this.vehiculos.findAllScoped(getScope(actor), {
      estado: filtro.estado,
      inventario: filtro.inventario === 'true',
      origen: filtro.origen,
      pendientes: filtro.pendientes === 'true',
      // El filtro por sucursal es un selector del ADMIN_GENERAL; para el resto manda el scope.
      sucursalId: actor.rol === 'ADMIN_GENERAL' ? filtro.sucursalId : undefined,
      q: filtro.q || undefined,
      orden: filtro.orden,
      direccion: filtro.direccion,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    return { items: rows.map((r) => toVehiculoResponse(r, actor.rol)), total };
  }

  async obtener(id: string, actor: UsuarioAutenticado) {
    const vehiculo = await this.buscarOFallar(id, actor);
    const [fotos, documentos, consignacion] = await Promise.all([
      this.fotos.findByVehiculo(id),
      this.documentos.findByVehiculo(id, false),
      vehiculo.origen === 'CONSIGNACION' ? this.consignaciones.findByVehiculo(id) : null,
    ]);
    return {
      ...toVehiculoResponse(vehiculo, actor.rol),
      fotos: fotos.map(toFotoResponse),
      documentosLegales: documentos.map(toDocumentoResponse),
      consignacion: consignacion ? toConsignacionResumen(consignacion, actor.rol) : null,
    };
  }

  async crear(dto: CreateVehiculoDto, actor: UsuarioAutenticado) {
    const sucursalId = await this.resolverSucursalAlta(dto.sucursalId, actor);
    const patente = this.validarPatente(dto.patente);
    const fechaIngreso = this.validarFechaIngreso(dto.fechaIngreso);

    if (dto.origen === 'CONSIGNACION') {
      if (dto.costoAdquisicion) {
        throw new BadRequestException(
          'Un vehículo en consignación no tiene costo de adquisición: su costo es la comisión pactada',
        );
      }
      await this.validarConsignacion(dto.consignacion!, dto.precioVenta, actor);
    } else if (dto.consignacion) {
      throw new BadRequestException('Los datos de consignación solo aplican a origen CONSIGNACION');
    }
    let folioTasacion: number | null = null;
    if (dto.origen === 'COMPRA_PARTICULAR') {
      folioTasacion = await this.validarTasacion(dto.tasacionId!, patente, actor);
    } else if (dto.tasacionId) {
      throw new BadRequestException('tasacionId solo aplica a origen COMPRA_PARTICULAR');
    }

    if (await this.vehiculos.existePatenteEnInventario(actor.automotoraId, patente, null)) {
      throw new ConflictException(PATENTE_DUPLICADA);
    }

    let consignacionId: string | null = null;
    const id = await this.conPatenteUnica(() =>
      this.tx.run(async (client) => {
        const vehiculo = await this.vehiculos.create(
          {
            automotoraId: actor.automotoraId,
            sucursalId,
            marca: dto.marca,
            modelo: dto.modelo,
            anio: dto.anio,
            version: dto.version ?? null,
            kilometraje: dto.kilometraje,
            color: dto.color,
            combustible: dto.combustible,
            transmision: dto.transmision,
            cilindrada: dto.cilindrada ?? null,
            patente,
            categoria: dto.categoria,
            traccion: traccionSegunCategoria(dto.categoria, dto.traccion),
            descripcion: dto.descripcion ?? null,
            precioVenta: dto.precioVenta,
            costoAdquisicion: dto.origen === 'CONSIGNACION' ? 0 : dto.costoAdquisicion!,
            origen: dto.origen,
            fechaIngreso,
            tasacionOrigenId: dto.origen === 'COMPRA_PARTICULAR' ? dto.tasacionId! : null,
          },
          client,
        );

        let detalleConsignacion = folioTasacion ? ` — tasación N° ${folioTasacion}` : '';
        if (dto.origen === 'CONSIGNACION') {
          const c = dto.consignacion!;
          const trato = normalizarTrato(c, dto.precioVenta);
          const folio = await this.folios.siguiente('consignacion', actor.automotoraId, client);
          consignacionId = (
            await this.consignaciones.create(
              {
                automotoraId: actor.automotoraId,
                folio,
                sucursalId,
                vehiculoId: vehiculo.id,
                clienteId: c.clienteId,
                trato,
                fechaInicio: c.fechaInicio ?? hoyEnChile(),
                fechaFin: c.fechaFin,
                usuarioId: actor.id,
              },
              client,
            )
          ).id;
          detalleConsignacion = ` — consignación folio ${folio}`;
          await this.auditoria.registrar(
            {
              automotoraId: actor.automotoraId,
              usuarioId: actor.id,
              sucursalId,
              accion: 'CONSIGNACION_EMITIDA',
              entidadTipo: 'CONSIGNACION',
              entidadId: consignacionId!,
              valorAnterior: null,
              valorNuevo: {
                folio,
                ...trato,
                fechaFin: c.fechaFin,
              },
            },
            client,
          );
        }

        await this.bitacora.registrar(
          {
            vehiculoId: vehiculo.id,
            tipoEvento: 'ALTA',
            descripcion: `Alta de vehículo (${ETIQUETA_ORIGEN[dto.origen]})${detalleConsignacion}`,
            usuarioId: actor.id,
          },
          client,
        );
        await this.auditar(actor, vehiculo, 'VEHICULO_CREADO', client, {
          anterior: null,
          nuevo: {
            ...datosGenerales(vehiculo),
            origen: vehiculo.origen,
            precioVenta: Number(vehiculo.precio_venta),
            costoAdquisicion: Number(vehiculo.costo_adquisicion),
          },
        });
        return vehiculo.id;
      }),
    );

    if (consignacionId) {
      await this.pdf.generarTrasEmitir('CONSIGNACION', consignacionId);
      await this.correos.alEmitir(
        'CONSIGNACION',
        consignacionId,
        actor,
        dto.consignacion?.enviarCorreo,
      );
    }
    return this.obtener(id, actor);
  }

  async actualizar(id: string, dto: UpdateVehiculoDto, actor: UsuarioAutenticado) {
    if (dto.costoAdquisicion !== undefined && actor.rol === 'VENDEDOR') {
      throw new ForbiddenException('No tienes permisos para modificar el costo de adquisición');
    }
    await this.buscarOFallar(id, actor);
    const patente = dto.patente !== undefined ? this.validarPatente(dto.patente) : undefined;

    await this.conPatenteUnica(() =>
      this.tx.run(async (client) => {
        const actual = await this.bloquear(id, actor, client);
        if (actual.estado === 'VENDIDO') {
          throw new ConflictException('Un vehículo vendido no se puede editar');
        }
        // El precio de un auto publicado solo lo cambia un admin (es lo que ve el
        // cliente). El resto de la ficha el Vendedor la sigue editando.
        if (
          actor.rol === 'VENDEDOR' &&
          actual.estado === 'DISPONIBLE' &&
          dto.precioVenta !== undefined &&
          dto.precioVenta !== Number(actual.precio_venta)
        ) {
          throw new ForbiddenException(
            'El precio de un vehículo publicado solo lo cambia un admin',
          );
        }
        if (dto.costoAdquisicion !== undefined && actual.origen === 'CONSIGNACION') {
          throw new BadRequestException(
            'Un vehículo en consignación no tiene costo de adquisición: su costo es la comisión pactada',
          );
        }
        if (
          patente !== undefined &&
          patente !== actual.patente &&
          (await this.vehiculos.existePatenteEnInventario(actor.automotoraId, patente, id, client))
        ) {
          throw new ConflictException(PATENTE_DUPLICADA);
        }

        // Moto ⇄ otra categoría: la tracción se vacía o pasa a ser obligatoria.
        const traccion =
          dto.categoria !== undefined || dto.traccion !== undefined
            ? traccionSegunCategoria(
                dto.categoria ?? actual.categoria,
                dto.traccion ?? actual.traccion ?? undefined,
              )
            : undefined;
        const cambios = { ...dto, patente, traccion };
        await this.vehiculos.update(id, cambios, client);

        // Datos generales (marca, kilometraje, descripción…): solo lo que cambió.
        // Precio y costo tienen su propia acción, más abajo.
        const anteriores = datosGenerales(actual);
        const editados = Object.keys(anteriores).filter((k) => {
          const nuevo = cambios[k as keyof typeof cambios];
          return nuevo !== undefined && (nuevo ?? null) !== (anteriores[k] ?? null);
        });
        if (editados.length > 0) {
          await this.auditar(actor, actual, 'VEHICULO_EDITADO', client, {
            anterior: Object.fromEntries(editados.map((k) => [k, anteriores[k]])),
            nuevo: Object.fromEntries(editados.map((k) => [k, cambios[k as keyof typeof cambios]])),
          });
        }

        const precioAnterior = Number(actual.precio_venta);
        if (dto.precioVenta !== undefined && dto.precioVenta !== precioAnterior) {
          await this.bitacora.registrar(
            {
              vehiculoId: id,
              tipoEvento: 'CAMBIO_PRECIO',
              descripcion: `Precio de venta: ${formatearCLP(precioAnterior)} → ${formatearCLP(dto.precioVenta)}`,
              usuarioId: actor.id,
            },
            client,
          );
          await this.auditar(actor, actual, 'VEHICULO_CAMBIO_PRECIO', client, {
            anterior: { precioVenta: precioAnterior },
            nuevo: { precioVenta: dto.precioVenta },
          });
        }

        const costoAnterior = Number(actual.costo_adquisicion);
        if (dto.costoAdquisicion !== undefined && dto.costoAdquisicion !== costoAnterior) {
          await this.auditar(actor, actual, 'VEHICULO_CAMBIO_COSTO', client, {
            anterior: { costoAdquisicion: costoAnterior },
            nuevo: { costoAdquisicion: dto.costoAdquisicion },
          });
        }
      }),
    );

    return this.obtener(id, actor);
  }

  async cambiarEstado(id: string, dto: CambiarEstadoVehiculoDto, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);

    await this.tx.run(async (client) => {
      const actual = await this.bloquear(id, actor, client);
      if (actual.estado === dto.estado) return;

      if (actual.estado === 'VENDIDO') {
        throw new ConflictException('El vehículo está vendido: para revertirlo, anula la venta');
      }
      if (actual.estado === 'RESERVADO') {
        throw new ConflictException('El vehículo está reservado: primero cancela la reserva');
      }
      if (actual.origen === 'CONSIGNACION') {
        const consignacion = await this.consignaciones.findByVehiculo(id, client);
        if (consignacion?.estado === 'DEVUELTA') {
          throw new ConflictException(
            'La consignación fue devuelta al consignante: para volver a venderlo, regístralo como una consignación nueva',
          );
        }
      }
      if (
        actual.estado === 'DADO_DE_BAJA' &&
        (await this.vehiculos.existePatenteEnInventario(
          actor.automotoraId,
          actual.patente,
          id,
          client,
        ))
      ) {
        throw new ConflictException(
          `No se puede reactivar: ya hay otro vehículo con patente ${actual.patente} en el inventario`,
        );
      }
      // Revisión antes de publicar: el Vendedor lo envía a revisión y un admin lo
      // publica o lo devuelve a preparación indicando qué corregir.
      const esAdmin = actor.rol !== 'VENDEDOR';
      if (dto.estado === 'DISPONIBLE' && !esAdmin) {
        throw new ForbiddenException('Solo un admin publica vehículos: envíalo a revisión');
      }
      if (
        (dto.estado === 'DISPONIBLE' || dto.estado === 'PENDIENTE_REVISION') &&
        (await this.fotos.contar(id, client)) === 0
      ) {
        throw new ConflictException(
          dto.estado === 'DISPONIBLE'
            ? 'Para publicar el vehículo (DISPONIBLE) necesita al menos 1 foto'
            : 'Para enviarlo a revisión necesita al menos 1 foto',
        );
      }
      const devuelto =
        esAdmin && actual.estado === 'PENDIENTE_REVISION' && dto.estado === 'EN_PREPARACION';
      if (devuelto && !dto.motivo) {
        throw new BadRequestException('Indica qué hay que corregir para que lo puedan arreglar');
      }

      await this.vehiculos.setEstado(id, dto.estado, client);
      if (devuelto) {
        await this.vehiculos.setObservacionRevision(id, dto.motivo!, client);
      } else if (
        (dto.estado === 'PENDIENTE_REVISION' || dto.estado === 'DISPONIBLE') &&
        actual.observacion_revision
      ) {
        await this.vehiculos.setObservacionRevision(id, null, client);
      }
      // El aviso "por revisar": se crea al enviarlo y se resuelve al salir de revisión.
      if (actual.estado === 'PENDIENTE_REVISION') {
        await this.notificaciones.resolverDeVehiculo('VEHICULO_POR_REVISAR', id, actor.id, client);
      }
      if (dto.estado === 'PENDIENTE_REVISION') {
        await this.notificaciones.create(
          {
            automotoraId: actor.automotoraId,
            sucursalId: actual.sucursal_id,
            tipo: 'VEHICULO_POR_REVISAR',
            mensaje: `${actual.marca} ${actual.modelo} ${actual.anio} (${actual.patente}) está listo para revisar y publicar`,
            referencias: [
              {
                entidadTipo: 'VEHICULO',
                entidadId: id,
                claveEvento: `REVISION:${id}:${new Date().toISOString()}`,
              },
            ],
          },
          client,
        );
      }
      await this.bitacora.registrar(
        {
          vehiculoId: id,
          tipoEvento: 'CAMBIO_ESTADO',
          descripcion:
            `Estado: ${actual.estado} → ${dto.estado}` + (dto.motivo ? ` — ${dto.motivo}` : ''),
          usuarioId: actor.id,
        },
        client,
      );
      await this.auditar(actor, actual, 'VEHICULO_CAMBIO_ESTADO', client, {
        anterior: { estado: actual.estado },
        nuevo: { estado: dto.estado, ...(dto.motivo ? { motivo: dto.motivo } : {}) },
      });
    });

    return this.obtener(id, actor);
  }

  // Solo ADMIN_GENERAL (controller). Las transacciones ya generadas conservan su
  // sucursal: aquí solo cambia la ubicación actual del vehículo.
  async transferir(id: string, dto: TransferirVehiculoDto, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    const destino = await this.sucursales.findByIdScoped(dto.sucursalDestinoId, getScope(actor));
    if (!destino)
      throw new BadRequestException('La sucursal de destino no existe o fue dada de baja');

    await this.tx.run(async (client) => {
      const actual = await this.bloquear(id, actor, client);
      if (actual.estado === 'VENDIDO') {
        throw new ConflictException('Un vehículo vendido no se puede transferir');
      }
      if (actual.sucursal_id === destino.id) {
        throw new BadRequestException('El vehículo ya está en esa sucursal');
      }
      const origen = await this.sucursales.findByIdScoped(
        actual.sucursal_id,
        getScope(actor),
        client,
      );
      const nombreOrigen = origen?.nombre ?? 'sucursal dada de baja';

      await this.vehiculos.setSucursal(id, destino.id, client);
      await this.bitacora.registrar(
        {
          vehiculoId: id,
          tipoEvento: 'TRANSFERENCIA_SUCURSAL',
          descripcion: `Transferencia: ${nombreOrigen} → ${destino.nombre}`,
          usuarioId: actor.id,
        },
        client,
      );
      await this.auditar(actor, actual, 'VEHICULO_TRANSFERIDO', client, {
        anterior: { sucursalId: actual.sucursal_id, sucursal: nombreOrigen },
        nuevo: { sucursalId: destino.id, sucursal: destino.nombre },
      });
    });

    return this.obtener(id, actor);
  }

  async obtenerBitacora(id: string, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    const eventos = await this.bitacora.findByVehiculo(id);
    return eventos.map((e) => ({
      id: e.id,
      tipoEvento: e.tipo_evento,
      descripcion: e.descripcion,
      fecha: e.fecha,
      usuario: { id: e.usuario_id, nombre: e.usuario_nombre },
      referencia: e.referencia_tipo ? { tipo: e.referencia_tipo, id: e.referencia_id } : null,
    }));
  }

  // Sugerencia para el formulario: mes de revisión técnica según el último dígito.
  sugerenciaRevisionTecnica(patente: string) {
    const normalizada = this.validarPatente(patente);
    return {
      patente: normalizada,
      mes: mesRevisionTecnica(normalizada),
      fechaVencimientoSugerida: sugerirVencimientoRevisionTecnica(
        normalizada,
        new Date(`${hoyEnChile()}T12:00:00`),
      ),
    };
  }

  // ADMIN_SUCURSAL / VENDEDOR: se usa su sucursal. ADMIN_GENERAL: debe elegirla.
  private async resolverSucursalAlta(
    sucursalId: string | undefined,
    actor: UsuarioAutenticado,
  ): Promise<string> {
    if (actor.rol !== 'ADMIN_GENERAL') {
      if (sucursalId && sucursalId !== actor.sucursalId) {
        throw new ForbiddenException('Solo puedes dar de alta vehículos en tu propia sucursal');
      }
      return actor.sucursalId!;
    }
    if (!sucursalId) {
      throw new BadRequestException('Indica la sucursal donde se ingresa el vehículo');
    }
    const sucursal = await this.sucursales.findByIdScoped(sucursalId, getScope(actor));
    if (!sucursal)
      throw new BadRequestException('La sucursal indicada no existe o fue dada de baja');
    return sucursal.id;
  }

  // La compra a particular nace de una tasación ACEPTADA, de la misma patente y
  // aún no usada (vehiculos.tasacion_origen_id es UNIQUE).
  private async validarTasacion(tasacionId: string, patente: string, actor: UsuarioAutenticado) {
    const tasacion = await this.tasaciones.findByIdScoped(tasacionId, getScope(actor));
    if (!tasacion) throw new BadRequestException('La tasación no existe');
    if (tasacion.estado !== 'ACEPTADA') {
      throw new BadRequestException(
        `La tasación está ${tasacion.estado}: solo una ACEPTADA origina una compra`,
      );
    }
    if (tasacion.vehiculo_creado_id) {
      throw new ConflictException('La tasación ya originó un vehículo en inventario');
    }
    if (tasacion.patente !== patente) {
      throw new BadRequestException(
        `La patente no coincide con la del vehículo tasado (${tasacion.patente})`,
      );
    }
    return tasacion.folio;
  }

  private async validarConsignacion(
    datos: DatosConsignacionDto,
    precioVenta: number,
    actor: UsuarioAutenticado,
  ) {
    const cliente = await this.clientes.findById(datos.clienteId, actor.automotoraId);
    if (!cliente) throw new BadRequestException('El consignante no existe');
    if (cliente.estado !== 'ACTIVO')
      throw new BadRequestException('El consignante está desactivado');
    normalizarTrato(datos, precioVenta); // valida antes de abrir la transacción
    const inicio = datos.fechaInicio ?? hoyEnChile();
    if (datos.fechaFin < inicio) {
      throw new BadRequestException(
        'La fecha de término de la consignación es anterior a la de inicio',
      );
    }
  }

  private validarPatente(patente: string): string {
    if (!esPatenteValida(patente)) {
      throw new BadRequestException('Patente inválida (formatos: AB1234, BCDF12, ABC12, AB123)');
    }
    return normalizarPatente(patente);
  }

  private validarFechaIngreso(fecha: string | undefined): Date | null {
    if (!fecha) return null;
    if (fecha > hoyEnChile())
      throw new BadRequestException('La fecha de ingreso no puede ser futura');
    // Mediodía en Chile (UTC-3/-4): cae en la misma fecha calendario todo el año.
    return new Date(`${fecha}T12:00:00-04:00`);
  }

  private async auditar(
    actor: UsuarioAutenticado,
    vehiculo: VehiculoRow,
    accion: string,
    client: PoolClient,
    valores: { anterior: Record<string, unknown> | null; nuevo: Record<string, unknown> | null },
  ) {
    await this.auditoria.registrar(
      {
        automotoraId: actor.automotoraId,
        usuarioId: actor.id,
        // La sucursal del vehículo: así la ve el Admin de esa sucursal.
        sucursalId: vehiculo.sucursal_id,
        accion,
        entidadTipo: 'VEHICULO',
        entidadId: vehiculo.id,
        valorAnterior: valores.anterior,
        valorNuevo: valores.nuevo,
      },
      client,
    );
  }

  private async bloquear(
    id: string,
    actor: UsuarioAutenticado,
    client: PoolClient,
  ): Promise<VehiculoRow> {
    const row = await this.vehiculos.lockById(id, actor.automotoraId, client);
    const scope = getScope(actor);
    // Revalida el scope dentro de la transacción (pudo transferirse entre medio).
    if (!row || (scope.sucursalId && row.sucursal_id !== scope.sucursalId)) {
      throw new NotFoundException('Vehículo no encontrado');
    }
    return row;
  }

  // Carrera entre dos altas/ediciones con la misma patente: el índice único parcial la ataja.
  private async conPatenteUnica<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        err.code === '23505' &&
        err.constraint?.includes('patente')
      ) {
        throw new ConflictException(PATENTE_DUPLICADA);
      }
      if (
        err instanceof DatabaseError &&
        err.code === '23505' &&
        err.constraint?.includes('tasacion')
      ) {
        throw new ConflictException('La tasación ya originó un vehículo en inventario');
      }
      throw err;
    }
  }

  private async buscarOFallar(id: string, actor: UsuarioAutenticado): Promise<VehiculoListadoRow> {
    const row = await this.vehiculos.findByIdScoped(id, getScope(actor));
    if (!row) throw new NotFoundException('Vehículo no encontrado');
    return row;
  }
}

// La tracción no aplica a las motos (queda vacía); en el resto es obligatoria.
export function traccionSegunCategoria(categoria: string, traccion?: string | null): string | null {
  if (categoria === 'MOTO') return null;
  if (!traccion) throw new BadRequestException('Indica la tracción del vehículo');
  return traccion;
}
