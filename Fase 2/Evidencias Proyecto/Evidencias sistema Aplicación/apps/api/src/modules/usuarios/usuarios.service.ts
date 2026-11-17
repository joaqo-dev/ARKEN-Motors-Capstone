import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RolUsuario } from '@vitriauto/shared-types';
import { PoolClient } from 'pg';
import { generarToken, hashToken } from '../../common/crypto';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { AutomotorasRepository } from '../automotoras/automotoras.repository';
import { EmailService } from '../email/email.service';
import { SucursalesRepository } from '../sucursales/sucursales.repository';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { SesionesRepository } from './sesiones.repository';
import { TokensAccionRepository } from './tokens-accion.repository';
import { PASSWORD_PENDIENTE, UsuarioRow, UsuariosRepository } from './usuarios.repository';

const HORAS_INVITACION = 48;

export function toUsuarioResponse(row: UsuarioRow) {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    rol: row.rol,
    sucursalId: row.sucursal_id,
    estado: row.estado,
    emailVerificado: row.email_verificado,
    invitacionPendiente: row.invitacion_pendiente,
    fechaCreacion: row.fecha_creacion,
  };
}

@Injectable()
export class UsuariosService {
  constructor(
    private readonly usuarios: UsuariosRepository,
    private readonly tokens: TokensAccionRepository,
    private readonly sesiones: SesionesRepository,
    private readonly sucursales: SucursalesRepository,
    private readonly automotoras: AutomotorasRepository,
    private readonly tx: TransactionRunner,
    private readonly email: EmailService,
    private readonly auditoria: AuditoriaRepository,
  ) {}

  async listar(actor: UsuarioAutenticado) {
    const rows = await this.usuarios.findAllScoped(getScope(actor));
    return rows.map(toUsuarioResponse);
  }

  async obtener(id: string, actor: UsuarioAutenticado) {
    return toUsuarioResponse(await this.buscarOFallar(id, actor));
  }

  // Creación por invitación: el usuario nace sin contraseña utilizable y
  // recibe un correo para definirla. Quien lo crea nunca la conoce.
  async invitar(dto: CreateUsuarioDto, actor: UsuarioAutenticado) {
    const sucursalId = await this.resolverSucursalDestino(dto.rol, dto.sucursalId ?? null, actor);

    if (await this.usuarios.existeEmail(dto.email)) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const token = generarToken();
    const usuario = await this.tx.run(async (client) => {
      const creado = await this.usuarios.create(
        {
          automotoraId: actor.automotoraId,
          sucursalId,
          nombre: dto.nombre,
          email: dto.email,
          passwordHash: PASSWORD_PENDIENTE,
          rol: dto.rol,
        },
        client,
      );
      await this.tokens.create(
        creado.id,
        'INVITACION_USUARIO',
        hashToken(token),
        horasDesdeAhora(HORAS_INVITACION),
        client,
      );
      await this.auditar(actor, creado, 'USUARIO_INVITADO', client, null, this.snapshot(creado));
      return creado;
    });

    await this.enviarInvitacion(usuario, token);
    return toUsuarioResponse(usuario);
  }

  async reenviarInvitacion(id: string, actor: UsuarioAutenticado) {
    const usuario = await this.buscarOFallar(id, actor);
    if (!usuario.invitacion_pendiente) {
      throw new ConflictException('El usuario ya configuró su contraseña');
    }
    if (usuario.estado === 'INACTIVO') {
      throw new ConflictException('El usuario está desactivado');
    }

    const token = generarToken();
    await this.tx.run(async (client) => {
      await this.tokens.invalidarPendientes(usuario.id, 'INVITACION_USUARIO', client);
      await this.tokens.create(
        usuario.id,
        'INVITACION_USUARIO',
        hashToken(token),
        horasDesdeAhora(HORAS_INVITACION),
        client,
      );
      await this.auditar(actor, usuario, 'USUARIO_INVITACION_REENVIADA', client, null, {
        email: usuario.email,
      });
    });
    await this.enviarInvitacion(usuario, token);
  }

  async actualizar(id: string, dto: UpdateUsuarioDto, actor: UsuarioAutenticado) {
    const usuario = await this.buscarOFallar(id, actor);

    const cambiaRol = dto.rol !== undefined && dto.rol !== usuario.rol;
    const cambiaSucursal = dto.sucursalId !== undefined && dto.sucursalId !== usuario.sucursal_id;

    if (usuario.id === actor.id && (cambiaRol || cambiaSucursal)) {
      throw new ForbiddenException('No puedes cambiar tu propio rol ni tu sucursal');
    }

    let sucursalId: string | null | undefined;
    if (cambiaRol || cambiaSucursal) {
      const rolFinal = dto.rol ?? usuario.rol;
      // Sin sucursal explícita: Admin General queda sin sucursal; los demás conservan la actual.
      const sucursalPedida =
        dto.sucursalId !== undefined
          ? dto.sucursalId
          : rolFinal === 'ADMIN_GENERAL'
            ? null
            : usuario.sucursal_id;
      sucursalId = await this.resolverSucursalDestino(rolFinal, sucursalPedida, actor);
    }

    const row = await this.tx.run(async (client) => {
      const actualizado = await this.usuarios.update(
        id,
        actor.automotoraId,
        { nombre: dto.nombre, rol: dto.rol, sucursalId },
        client,
      );
      await this.auditar(
        actor,
        actualizado,
        'USUARIO_EDITADO',
        client,
        this.snapshot(usuario),
        this.snapshot(actualizado),
      );
      return actualizado;
    });
    return toUsuarioResponse(row);
  }

  // Baja lógica: bloquea futuros logins y revoca de inmediato todas sus sesiones.
  async desactivar(id: string, actor: UsuarioAutenticado) {
    const usuario = await this.buscarOFallar(id, actor);
    if (usuario.id === actor.id) {
      throw new ForbiddenException('No puedes desactivar tu propia cuenta');
    }
    const row = await this.tx.run(async (client) => {
      const actualizado = await this.usuarios.setEstado(usuario.id, 'INACTIVO', client);
      await this.sesiones.revocarTodasDeUsuario(usuario.id, client);
      await this.auditar(
        actor,
        usuario,
        'USUARIO_DESACTIVADO',
        client,
        { estado: usuario.estado },
        { estado: 'INACTIVO' },
      );
      return actualizado;
    });
    return toUsuarioResponse(row);
  }

  async activar(id: string, actor: UsuarioAutenticado) {
    const usuario = await this.buscarOFallar(id, actor);
    if (usuario.id === actor.id) {
      throw new ForbiddenException('No puedes reactivar tu propia cuenta');
    }
    if (usuario.sucursal_id) {
      // La sucursal pudo darse de baja mientras el usuario estaba inactivo.
      await this.resolverSucursalDestino(usuario.rol, usuario.sucursal_id, actor);
    }
    const row = await this.tx.run(async (client) => {
      const actualizado = await this.usuarios.setEstado(usuario.id, 'ACTIVO', client);
      await this.auditar(
        actor,
        usuario,
        'USUARIO_ACTIVADO',
        client,
        { estado: usuario.estado },
        { estado: 'ACTIVO' },
      );
      return actualizado;
    });
    return toUsuarioResponse(row);
  }

  private snapshot(u: UsuarioRow) {
    return {
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      sucursalId: u.sucursal_id,
      estado: u.estado,
    };
  }

  // Sucursal del usuario afectado (null para un ADMIN_GENERAL: acción a nivel de automotora).
  private async auditar(
    actor: UsuarioAutenticado,
    usuario: UsuarioRow,
    accion: string,
    client: PoolClient,
    anterior: Record<string, unknown> | null,
    nuevo: Record<string, unknown> | null,
  ) {
    await this.auditoria.registrar(
      {
        automotoraId: actor.automotoraId,
        usuarioId: actor.id,
        sucursalId: usuario.sucursal_id,
        accion,
        entidadTipo: 'USUARIO',
        entidadId: usuario.id,
        valorAnterior: anterior,
        valorNuevo: nuevo,
      },
      client,
    );
  }

  // Aplica las reglas de rol ↔ sucursal y devuelve la sucursal final a guardar.
  private async resolverSucursalDestino(
    rol: RolUsuario,
    sucursalId: string | null,
    actor: UsuarioAutenticado,
  ): Promise<string | null> {
    if (actor.rol === 'ADMIN_SUCURSAL') {
      if (rol === 'ADMIN_GENERAL') {
        throw new ForbiddenException('Un Admin de Sucursal no puede asignar el rol Admin General');
      }
      if (sucursalId !== null && sucursalId !== actor.sucursalId) {
        throw new ForbiddenException('Solo puedes asignar usuarios a tu propia sucursal');
      }
      return actor.sucursalId;
    }

    if (rol === 'ADMIN_GENERAL') {
      if (sucursalId !== null) {
        throw new BadRequestException('Un Admin General no se asigna a una sucursal');
      }
      return null;
    }

    if (sucursalId === null) {
      throw new BadRequestException('La sucursal es obligatoria para este rol');
    }
    const sucursal = await this.sucursales.findByIdScoped(sucursalId, getScope(actor));
    if (!sucursal)
      throw new BadRequestException('La sucursal indicada no existe o fue dada de baja');
    return sucursal.id;
  }

  private async buscarOFallar(id: string, actor: UsuarioAutenticado): Promise<UsuarioRow> {
    const row = await this.usuarios.findByIdScoped(id, getScope(actor));
    if (!row) throw new NotFoundException('Usuario no encontrado');
    return row;
  }

  private async enviarInvitacion(usuario: UsuarioRow, token: string) {
    const automotora = await this.automotoras.findById(usuario.automotora_id);
    await this.email.enviarInvitacion(
      usuario.email,
      usuario.nombre,
      automotora?.nombre ?? '',
      token,
    );
  }
}

function horasDesdeAhora(horas: number): Date {
  return new Date(Date.now() + horas * 60 * 60 * 1000);
}
