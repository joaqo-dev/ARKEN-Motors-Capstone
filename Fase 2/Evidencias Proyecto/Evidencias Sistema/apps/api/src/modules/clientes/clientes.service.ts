import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { esRutValido, normalizarRut } from '@vitriauto/shared-types';
import { DatabaseError, type PoolClient } from 'pg';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { ClienteRow, ClientesRepository } from './clientes.repository';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { ListarClientesDto } from './dto/listar-clientes.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

const RUT_DUPLICADO = 'Ya existe un cliente con ese RUT en la automotora';

export function toClienteResponse(row: ClienteRow) {
  return {
    id: row.id,
    nombre: row.nombre,
    rut: row.rut,
    telefono: row.telefono,
    email: row.email,
    direccion: row.direccion,
    estado: row.estado,
    aceptaRecordatorios: row.acepta_recordatorios,
    fechaCreacion: row.fecha_creacion,
  };
}

// Datos de la ficha que se guardan en la auditoría (antes / después).
function snapshot(row: ClienteRow) {
  return {
    nombre: row.nombre,
    rut: row.rut,
    telefono: row.telefono,
    email: row.email,
    direccion: row.direccion,
    aceptaRecordatorios: row.acepta_recordatorios,
  };
}

@Injectable()
export class ClientesService {
  constructor(
    private readonly clientes: ClientesRepository,
    private readonly auditoria: AuditoriaRepository,
    private readonly tx: TransactionRunner,
  ) {}

  async listar(filtro: ListarClientesDto, usuario: UsuarioAutenticado) {
    const { rows, total } = await this.clientes.findAll(usuario.automotoraId, {
      q: filtro.q || undefined,
      incluirInactivos: filtro.incluirInactivos ?? false,
      limit: filtro.limit ?? 50,
      offset: filtro.offset ?? 0,
    });
    return { items: rows.map(toClienteResponse), total };
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    return toClienteResponse(await this.buscarOFallar(id, usuario));
  }

  // Visible para cualquier usuario que vea la ficha, sin importar la sucursal
  // de cada documento.
  async historial(id: string, usuario: UsuarioAutenticado) {
    await this.buscarOFallar(id, usuario);
    const rows = await this.clientes.historial(id, usuario.automotoraId);
    return rows.map((r) => ({
      tipo: r.tipo,
      id: r.id,
      folio: r.folio,
      sucursal: { id: r.sucursal_id, nombre: r.sucursal_nombre },
      fecha: r.fecha,
      estado: r.estado,
      vehiculo: { id: r.vehiculo_id, descripcion: r.vehiculo },
      // Cotización: precio cotizado · Reserva: seña · Tasación: oferta ·
      // Venta: precio final · Consignación: precio mínimo aceptado.
      monto: Number(r.monto),
    }));
  }

  async crear(dto: CreateClienteDto, usuario: UsuarioAutenticado) {
    const rut = this.validarRut(dto.rut);
    if (await this.clientes.findByRut(rut, usuario.automotoraId)) {
      throw new ConflictException(RUT_DUPLICADO);
    }
    const row = await this.conRutUnico(() =>
      this.tx.run(async (client) => {
        const creado = await this.clientes.create(
          { ...dto, rut, automotoraId: usuario.automotoraId },
          client,
        );
        await this.auditar(usuario, creado.id, 'CLIENTE_CREADO', client, null, snapshot(creado));
        return creado;
      }),
    );
    return toClienteResponse(row);
  }

  async actualizar(id: string, dto: UpdateClienteDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarOFallar(id, usuario);
    const rut = dto.rut !== undefined ? this.validarRut(dto.rut) : undefined;
    if (rut !== undefined && rut !== actual.rut) {
      const otro = await this.clientes.findByRut(rut, usuario.automotoraId);
      if (otro) throw new ConflictException(RUT_DUPLICADO);
    }
    const row = await this.conRutUnico(() =>
      this.tx.run(async (client) => {
        const actualizado = await this.clientes.update(
          id,
          usuario.automotoraId,
          { ...dto, rut },
          client,
        );
        const antes = snapshot(actual);
        const despues = snapshot(actualizado);
        // Guardar sin cambios no deja registro.
        if (JSON.stringify(antes) !== JSON.stringify(despues)) {
          await this.auditar(usuario, id, 'CLIENTE_EDITADO', client, antes, despues);
        }
        return actualizado;
      }),
    );
    return toClienteResponse(row);
  }

  // Baja lógica: el cliente nunca se elimina. Solo admins (controller); afecta
  // a todas las sucursales porque la ficha es de la automotora.
  async desactivar(id: string, usuario: UsuarioAutenticado) {
    return this.cambiarEstado(id, 'INACTIVO', usuario);
  }

  async activar(id: string, usuario: UsuarioAutenticado) {
    return this.cambiarEstado(id, 'ACTIVO', usuario);
  }

  private async cambiarEstado(
    id: string,
    estado: 'ACTIVO' | 'INACTIVO',
    usuario: UsuarioAutenticado,
  ) {
    const actual = await this.buscarOFallar(id, usuario);
    if (actual.estado === estado) return toClienteResponse(actual);

    const row = await this.tx.run(async (client) => {
      const actualizado = await this.clientes.setEstado(id, usuario.automotoraId, estado, client);
      await this.auditar(
        usuario,
        id,
        estado === 'INACTIVO' ? 'CLIENTE_DESACTIVADO' : 'CLIENTE_ACTIVADO',
        client,
        { estado: actual.estado },
        { estado },
      );
      return actualizado;
    });
    return toClienteResponse(row);
  }

  // La ficha es de la automotora; el registro guarda la sucursal desde donde se
  // actuó (null si fue un ADMIN_GENERAL).
  private async auditar(
    usuario: UsuarioAutenticado,
    clienteId: string,
    accion: string,
    client: PoolClient,
    anterior: Record<string, unknown> | null,
    nuevo: Record<string, unknown> | null,
  ) {
    await this.auditoria.registrar(
      {
        automotoraId: usuario.automotoraId,
        usuarioId: usuario.id,
        sucursalId: usuario.sucursalId,
        accion,
        entidadTipo: 'CLIENTE',
        entidadId: clienteId,
        valorAnterior: anterior,
        valorNuevo: nuevo,
      },
      client,
    );
  }

  private validarRut(rut: string): string {
    if (!esRutValido(rut)) throw new BadRequestException('El RUT no es válido');
    return normalizarRut(rut);
  }

  // Cubre la carrera entre dos altas simultáneas con el mismo RUT (UNIQUE en BD).
  private async conRutUnico<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof DatabaseError && err.code === '23505') {
        throw new ConflictException(RUT_DUPLICADO);
      }
      throw err;
    }
  }

  private async buscarOFallar(id: string, usuario: UsuarioAutenticado): Promise<ClienteRow> {
    const row = await this.clientes.findById(id, usuario.automotoraId);
    if (!row) throw new NotFoundException('Cliente no encontrado');
    return row;
  }
}
