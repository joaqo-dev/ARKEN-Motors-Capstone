import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { esWhatsappValido, normalizarWhatsapp } from '@vitriauto/shared-types';
import { PoolClient } from 'pg';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { SucursalRow, SucursalesRepository } from './sucursales.repository';

export function toSucursalResponse(row: SucursalRow) {
  return {
    id: row.id,
    nombre: row.nombre,
    direccion: row.direccion,
    region: row.region,
    comuna: row.comuna,
    telefono: row.telefono,
    encargado: row.encargado,
    horarioAtencion: row.horario_atencion,
    whatsapp: row.whatsapp,
    esPrincipal: row.es_principal,
    fechaCreacion: row.fecha_creacion,
  };
}

@Injectable()
export class SucursalesService {
  constructor(
    private readonly sucursales: SucursalesRepository,
    private readonly auditoria: AuditoriaRepository,
    private readonly tx: TransactionRunner,
  ) {}

  async listar(usuario: UsuarioAutenticado) {
    const rows = await this.sucursales.findAllScoped(getScope(usuario));
    return rows.map(toSucursalResponse);
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    return toSucursalResponse(await this.buscarOFallar(id, usuario));
  }

  // Solo ADMIN_GENERAL (controlado en el controller). Las sucursales creadas
  // manualmente nunca son principales: la principal nace con el registro.
  async crear(dto: CreateSucursalDto, usuario: UsuarioAutenticado) {
    const row = await this.tx.run(async (client) => {
      await this.validarNombreUnico(usuario.automotoraId, dto.nombre, null, client);
      const creada = await this.sucursales.create(
        {
          automotoraId: usuario.automotoraId,
          nombre: dto.nombre,
          direccion: dto.direccion,
          region: dto.region,
          comuna: dto.comuna,
          telefono: dto.telefono,
          encargado: dto.encargado || null,
          horarioAtencion: dto.horarioAtencion || null,
          whatsapp: this.validarWhatsapp(dto.whatsapp),
          esPrincipal: false,
        },
        client,
      );
      await this.auditar(
        usuario,
        creada.id,
        'SUCURSAL_CREADA',
        client,
        null,
        this.snapshot(creada),
      );
      return creada;
    });
    return toSucursalResponse(row);
  }

  async actualizar(id: string, dto: UpdateSucursalDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarOFallar(id, usuario);
    const row = await this.tx.run(async (client) => {
      if (dto.nombre !== undefined) {
        await this.validarNombreUnico(usuario.automotoraId, dto.nombre, id, client);
      }
      const actualizada = await this.sucursales.update(
        id,
        usuario.automotoraId,
        {
          ...dto,
          encargado: dto.encargado === '' ? null : dto.encargado,
          horarioAtencion: dto.horarioAtencion === '' ? null : dto.horarioAtencion,
          whatsapp: dto.whatsapp === undefined ? undefined : this.validarWhatsapp(dto.whatsapp),
        },
        client,
      );
      await this.auditar(
        usuario,
        id,
        'SUCURSAL_EDITADA',
        client,
        this.snapshot(actual),
        this.snapshot(actualizada),
      );
      return actualizada;
    });
    return toSucursalResponse(row);
  }

  // Dos sucursales activas con el mismo nombre serían indistinguibles en los selectores.
  private async validarNombreUnico(
    automotoraId: string,
    nombre: string,
    excluirId: string | null,
    client: PoolClient,
  ) {
    if (await this.sucursales.existeNombre(automotoraId, nombre, excluirId, client)) {
      throw new ConflictException(`Ya existe una sucursal llamada "${nombre.trim()}"`);
    }
  }

  async darDeBaja(id: string, usuario: UsuarioAutenticado) {
    const sucursal = await this.buscarOFallar(id, usuario);

    if (sucursal.es_principal) {
      throw new ConflictException('La sucursal principal no puede darse de baja');
    }
    const vehiculos = await this.sucursales.contarVehiculosActivos(id);
    if (vehiculos > 0) {
      throw new ConflictException(
        `La sucursal tiene ${vehiculos} vehículo(s) activo(s). Transfiérelos a otra sucursal antes de darla de baja.`,
      );
    }
    const usuarios = await this.sucursales.contarUsuariosActivos(id);
    if (usuarios > 0) {
      throw new ConflictException(
        `La sucursal tiene ${usuarios} usuario(s) asignado(s). Reasígnalos a otra sucursal antes de darla de baja.`,
      );
    }

    await this.tx.run(async (client) => {
      await this.sucursales.darDeBaja(id, usuario.automotoraId, client);
      await this.auditar(
        usuario,
        id,
        'SUCURSAL_DADA_DE_BAJA',
        client,
        { activa: true },
        { activa: false },
      );
    });
  }

  private snapshot(s: SucursalRow) {
    return {
      nombre: s.nombre,
      direccion: s.direccion,
      region: s.region,
      comuna: s.comuna,
      telefono: s.telefono,
      encargado: s.encargado,
      horarioAtencion: s.horario_atencion,
      whatsapp: s.whatsapp,
    };
  }

  private validarWhatsapp(valor: string | null | undefined): string | null {
    if (!valor) return null;
    if (!esWhatsappValido(valor)) {
      throw new BadRequestException(
        'WhatsApp inválido: debe ser un celular chileno (+569XXXXXXXX)',
      );
    }
    return normalizarWhatsapp(valor);
  }

  // CRUD de sucursales: acción a nivel de automotora (sucursal_id NULL, Módulo 16).
  private async auditar(
    usuario: UsuarioAutenticado,
    sucursalId: string,
    accion: string,
    client: PoolClient,
    anterior: Record<string, unknown> | null,
    nuevo: Record<string, unknown> | null,
  ) {
    await this.auditoria.registrar(
      {
        automotoraId: usuario.automotoraId,
        usuarioId: usuario.id,
        sucursalId: null,
        accion,
        entidadTipo: 'SUCURSAL',
        entidadId: sucursalId,
        valorAnterior: anterior,
        valorNuevo: nuevo,
      },
      client,
    );
  }

  private async buscarOFallar(id: string, usuario: UsuarioAutenticado): Promise<SucursalRow> {
    const row = await this.sucursales.findByIdScoped(id, getScope(usuario));
    if (!row) throw new NotFoundException('Sucursal no encontrada');
    return row;
  }
}
