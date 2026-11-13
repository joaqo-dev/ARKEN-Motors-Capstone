import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';
import { formatearCLP, hoyEnChile } from '../../common/fechas';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { VehiculoBitacoraRepository } from '../vehiculos/vehiculo-bitacora.repository';
import { VehiculosRepository } from '../vehiculos/vehiculos.repository';
import { AnularGastoDto } from './dto/anular-gasto.dto';
import { CreateGastoDto, CreateGastoOperacionalDto } from './dto/create-gasto.dto';
import { ListarGastosDto } from './dto/listar-gastos.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import {
  CATEGORIAS_OPERACIONAL,
  CATEGORIAS_VEHICULO,
  GastoDetalleRow,
  GastoRow,
  GastosRepository,
} from './gastos.repository';
import { SucursalesRepository } from '../sucursales/sucursales.repository';

export function toGastoResponse(row: GastoDetalleRow) {
  return {
    id: row.id,
    numero: row.numero,
    tipo: row.tipo,
    // Solo en gastos de vehículo.
    vehiculo: row.vehiculo_id
      ? {
          id: row.vehiculo_id,
          patente: row.vehiculo_patente,
          descripcion: row.vehiculo_descripcion,
        }
      : null,
    // null = gasto general de la automotora.
    sucursal: row.sucursal_id ? { id: row.sucursal_id, nombre: row.sucursal_nombre } : null,
    categoria: row.categoria,
    monto: Number(row.monto),
    fecha: row.fecha,
    comentario: row.comentario,
    // Boleta privada: se descarga por la API, con sesión y scope.
    adjuntoUrl: row.archivo_adjunto_url ? `/gastos/${row.id}/adjunto` : null,
    estado: row.estado,
    registradoPor: { id: row.usuario_id, nombre: row.usuario_nombre },
    fechaCreacion: row.fecha_creacion,
  };
}

// Gastos. Solo ADMIN_GENERAL / ADMIN_SUCURSAL (controller): son costos y el
// Vendedor no los ve. Dos tipos:
// - VEHICULO: costo directo de un auto (entra en su margen al venderse).
// - OPERACIONAL: arriendo, sueldos... de una sucursal o generales de la
//   automotora (solo ADMIN_GENERAL): se restan del resultado del período.
@Injectable()
export class GastosService {
  constructor(
    private readonly gastos: GastosRepository,
    private readonly vehiculos: VehiculosRepository,
    private readonly bitacora: VehiculoBitacoraRepository,
    private readonly auditoria: AuditoriaRepository,
    private readonly sucursales: SucursalesRepository,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly tx: TransactionRunner,
  ) {}

  async listar(filtro: ListarGastosDto, actor: UsuarioAutenticado) {
    const { rows, total, totalesPorCategoria } = await this.gastos.findAll(getScope(actor), {
      desde: filtro.desde,
      hasta: filtro.hasta,
      tipo: filtro.tipo,
      categoria: filtro.categoria,
      sucursalId: actor.rol === 'ADMIN_GENERAL' ? filtro.sucursalId : undefined,
      soloGenerales: actor.rol === 'ADMIN_GENERAL' ? filtro.soloGenerales : undefined,
      vehiculoId: filtro.vehiculoId,
      incluirAnulados: filtro.incluirAnulados ?? false,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    const porCategoria = totalesPorCategoria.map((t) => ({
      tipo: t.tipo,
      categoria: t.categoria,
      total: Number(t.total),
    }));
    const deTipo = (tipo: string) =>
      porCategoria.filter((t) => t.tipo === tipo).reduce((suma, t) => suma + t.total, 0);
    return {
      items: rows.map(toGastoResponse),
      total,
      totales: {
        porCategoria,
        vehiculos: deTipo('VEHICULO'),
        operacionales: deTipo('OPERACIONAL'),
        general: porCategoria.reduce((suma, t) => suma + t.total, 0),
      },
    };
  }

  // Todos los gastos del vehículo, sin importar en qué sucursal se registraron.
  async listarDeVehiculo(vehiculoId: string, actor: UsuarioAutenticado) {
    await this.buscarVehiculoOFallar(vehiculoId, actor);
    return (await this.gastos.findByVehiculo(vehiculoId)).map(toGastoResponse);
  }

  async obtener(id: string, actor: UsuarioAutenticado) {
    return toGastoResponse(await this.buscarOFallar(id, actor));
  }

  async crear(
    vehiculoId: string,
    dto: CreateGastoDto,
    adjunto: { buffer: Buffer } | undefined,
    actor: UsuarioAutenticado,
  ) {
    const vehiculo = await this.buscarVehiculoOFallar(vehiculoId, actor);
    if (vehiculo.origen === 'CONSIGNACION') {
      throw new BadRequestException(
        'No se pueden registrar gastos en un vehículo en consignación: el vehículo no es de la automotora y su liquidación no descuenta gastos',
      );
    }
    this.validarFecha(dto.fecha);
    const archivo = adjunto ? this.almacenamiento.validarDocumento(adjunto.buffer) : null;

    const clave = archivo ? await this.almacenamiento.guardarDocumento(archivo) : null;
    try {
      const id = await this.tx.run(async (client) => {
        // Bloquea el vehículo: el gasto queda en la sucursal que tiene al crearlo.
        const actual = await this.vehiculos.lockById(vehiculoId, actor.automotoraId, client);
        const scope = getScope(actor);
        if (!actual || (scope.sucursalId && actual.sucursal_id !== scope.sucursalId)) {
          throw new NotFoundException('Vehículo no encontrado');
        }
        const gasto = await this.gastos.create(
          {
            automotoraId: actor.automotoraId,
            tipo: 'VEHICULO',
            vehiculoId,
            sucursalId: actual.sucursal_id,
            categoria: dto.categoria,
            monto: dto.monto,
            fecha: dto.fecha,
            comentario: dto.comentario ?? null,
            archivoAdjuntoUrl: clave,
            usuarioId: actor.id,
          },
          client,
        );
        await this.bitacora.registrar(
          {
            vehiculoId,
            tipoEvento: 'GASTO_AGREGADO',
            descripcion:
              `Gasto ${dto.categoria}: ${formatearCLP(dto.monto)}` +
              (dto.comentario ? ` — ${dto.comentario}` : ''),
            usuarioId: actor.id,
            referenciaTipo: 'GASTO',
            referenciaId: gasto.id,
          },
          client,
        );
        await this.auditar(actor, gasto, 'GASTO_CREADO', client, null, this.snapshot(gasto));
        return gasto.id;
      });
      return this.obtener(id, actor);
    } catch (err) {
      if (clave) await this.almacenamiento.eliminar(clave);
      throw err;
    }
  }

  // Gasto operacional (sin vehículo). El Admin de Sucursal lo registra en la
  // suya; el Admin General elige una o ninguna (gasto general).
  async crearOperacional(
    dto: CreateGastoOperacionalDto,
    adjunto: { buffer: Buffer } | undefined,
    actor: UsuarioAutenticado,
  ) {
    this.validarFecha(dto.fecha);
    const sucursalId = await this.resolverSucursalOperacional(dto.sucursalId, actor);
    const archivo = adjunto ? this.almacenamiento.validarDocumento(adjunto.buffer) : null;
    const clave = archivo ? await this.almacenamiento.guardarDocumento(archivo) : null;
    try {
      const id = await this.tx.run(async (client) => {
        const gasto = await this.gastos.create(
          {
            automotoraId: actor.automotoraId,
            tipo: 'OPERACIONAL',
            vehiculoId: null,
            sucursalId,
            categoria: dto.categoria,
            monto: dto.monto,
            fecha: dto.fecha,
            comentario: dto.comentario ?? null,
            archivoAdjuntoUrl: clave,
            usuarioId: actor.id,
          },
          client,
        );
        await this.auditar(actor, gasto, 'GASTO_CREADO', client, null, this.snapshot(gasto));
        return gasto.id;
      });
      return this.obtener(id, actor);
    } catch (err) {
      if (clave) await this.almacenamiento.eliminar(clave);
      throw err;
    }
  }

  // Editable mientras el vehículo no esté vendido; después se anula y se crea
  // otro. Un gasto operacional es editable mientras esté activo.
  async actualizar(id: string, dto: UpdateGastoDto, actor: UsuarioAutenticado) {
    const gasto = await this.buscarOFallar(id, actor);
    if (dto.fecha !== undefined) this.validarFecha(dto.fecha);
    if (dto.categoria !== undefined) {
      const validas: readonly string[] =
        gasto.tipo === 'VEHICULO' ? CATEGORIAS_VEHICULO : CATEGORIAS_OPERACIONAL;
      if (!validas.includes(dto.categoria)) {
        throw new BadRequestException(
          gasto.tipo === 'VEHICULO'
            ? 'Esa categoría no corresponde a un gasto de vehículo'
            : 'Esa categoría no corresponde a un gasto operacional',
        );
      }
    }

    await this.tx.run(async (client) => {
      const actual = await this.bloquearActivo(id, client);
      if (gasto.tipo === 'VEHICULO' && gasto.vehiculo_estado === 'VENDIDO') {
        throw new ConflictException(
          'El vehículo ya se vendió: el gasto quedó fijo. Para corregirlo, anúlalo y registra uno nuevo.',
        );
      }
      await this.gastos.update(id, dto, client);
      const nuevo = { ...actual, ...this.aColumnas(dto) };
      await this.auditar(
        actor,
        actual,
        'GASTO_EDITADO',
        client,
        this.snapshot(actual),
        this.snapshot(nuevo),
      );
    });
    return this.obtener(id, actor);
  }

  async anular(id: string, dto: AnularGastoDto, actor: UsuarioAutenticado) {
    await this.buscarOFallar(id, actor);
    await this.tx.run(async (client) => {
      const actual = await this.bloquearActivo(id, client);
      await this.gastos.anular(id, client);
      await this.auditar(actor, actual, 'GASTO_ANULADO', client, this.snapshot(actual), {
        estado: 'ANULADO',
        ...(dto.motivo ? { motivo: dto.motivo } : {}),
      });
    });
    return this.obtener(id, actor);
  }

  async reemplazarAdjunto(
    id: string,
    adjunto: { buffer: Buffer } | undefined,
    actor: UsuarioAutenticado,
  ) {
    if (!adjunto) throw new BadRequestException('Adjunta el archivo de la boleta');
    await this.buscarOFallar(id, actor);
    const clave = await this.almacenamiento.guardarDocumento(
      this.almacenamiento.validarDocumento(adjunto.buffer),
    );
    let anterior: string | null = null;
    try {
      await this.tx.run(async (client) => {
        const actual = await this.bloquearActivo(id, client);
        anterior = actual.archivo_adjunto_url;
        await this.gastos.setAdjunto(id, clave, client);
        await this.auditar(
          actor,
          actual,
          'GASTO_ADJUNTO_REEMPLAZADO',
          client,
          { conAdjunto: anterior !== null },
          { conAdjunto: true },
        );
      });
    } catch (err) {
      await this.almacenamiento.eliminar(clave);
      throw err;
    }
    if (anterior) await this.almacenamiento.eliminar(anterior);
    return this.obtener(id, actor);
  }

  async rutaAdjunto(id: string, actor: UsuarioAutenticado) {
    const gasto = await this.buscarOFallar(id, actor);
    if (!gasto.archivo_adjunto_url) throw new NotFoundException('El gasto no tiene adjunto');
    return this.almacenamiento.rutaDocumento(gasto.archivo_adjunto_url);
  }

  private async bloquearActivo(id: string, client: PoolClient): Promise<GastoRow> {
    const actual = await this.gastos.lockById(id, client);
    if (!actual) throw new NotFoundException('Gasto no encontrado');
    if (actual.estado === 'ANULADO') throw new ConflictException('El gasto está anulado');
    return actual;
  }

  private async resolverSucursalOperacional(
    pedida: string | null | undefined,
    actor: UsuarioAutenticado,
  ): Promise<string | null> {
    if (actor.rol !== 'ADMIN_GENERAL') {
      if (pedida && pedida !== actor.sucursalId) {
        throw new ForbiddenException('Solo puedes registrar gastos de tu sucursal');
      }
      return actor.sucursalId;
    }
    if (!pedida) return null; // gasto general de la automotora
    const sucursal = await this.sucursales.findByIdScoped(pedida, getScope(actor));
    if (!sucursal) throw new BadRequestException('La sucursal no existe');
    return pedida;
  }

  private validarFecha(fecha: string) {
    if (fecha > hoyEnChile())
      throw new BadRequestException('La fecha del gasto no puede ser futura');
  }

  private aColumnas(dto: UpdateGastoDto): Partial<GastoRow> {
    return {
      ...(dto.categoria !== undefined ? { categoria: dto.categoria } : {}),
      ...(dto.monto !== undefined ? { monto: String(dto.monto) } : {}),
      ...(dto.fecha !== undefined ? { fecha: dto.fecha } : {}),
      ...(dto.comentario !== undefined ? { comentario: dto.comentario } : {}),
    };
  }

  private snapshot(g: GastoRow) {
    return {
      numero: g.numero,
      categoria: g.categoria,
      monto: Number(g.monto),
      fecha: g.fecha,
      comentario: g.comentario,
      estado: g.estado,
    };
  }

  private async auditar(
    actor: UsuarioAutenticado,
    gasto: GastoRow,
    accion: string,
    client: PoolClient,
    anterior: Record<string, unknown> | null,
    nuevo: Record<string, unknown> | null,
  ) {
    await this.auditoria.registrar(
      {
        automotoraId: actor.automotoraId,
        usuarioId: actor.id,
        sucursalId: gasto.sucursal_id, // sucursal del gasto (null = general)
        accion,
        entidadTipo: 'GASTO',
        entidadId: gasto.id,
        valorAnterior: anterior,
        valorNuevo: nuevo,
      },
      client,
    );
  }

  private async buscarOFallar(id: string, actor: UsuarioAutenticado): Promise<GastoDetalleRow> {
    const row = await this.gastos.findByIdAccesible(id, getScope(actor));
    if (!row) throw new NotFoundException('Gasto no encontrado');
    return row;
  }

  private async buscarVehiculoOFallar(id: string, actor: UsuarioAutenticado) {
    const row = await this.vehiculos.findByIdScoped(id, getScope(actor));
    if (!row) throw new NotFoundException('Vehículo no encontrado');
    return row;
  }
}
