import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  esRutValido,
  esSubdominioValido,
  normalizarRut,
  SUBDOMINIOS_RESERVADOS,
  VERSION_TERMINOS,
} from '@vitriauto/shared-types';
import * as argon2 from 'argon2';
import { generarToken, hashToken } from '../../common/crypto';
import type { JwtPayload } from '../../common/usuario-autenticado';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { Queryable } from '../../db/pool';
import { TransactionRunner } from '../../db/transaction';
import {
  AccesosRepository,
  EventoAcceso,
  MotivoLoginFallido,
} from '../auditoria/accesos.repository';
import { AutomotorasRepository } from '../automotoras/automotoras.repository';
import { EmailService } from '../email/email.service';
import { SucursalesRepository } from '../sucursales/sucursales.repository';
import { SesionesRepository } from '../usuarios/sesiones.repository';
import { TokensAccionRepository } from '../usuarios/tokens-accion.repository';
import { UsuarioRow, UsuariosRepository } from '../usuarios/usuarios.repository';
import { toUsuarioResponse } from '../usuarios/usuarios.service';
import { RegistroAutomotoraDto } from './dto/registro-automotora.dto';

const HORAS_VERIFICACION = 24;
const HORAS_RESET = 1;

// Mismo mensaje para usuario inexistente, inactivo, sin verificar o password incorrecta.
const CREDENCIALES_INVALIDAS = 'Credenciales inválidas o email sin verificar';
const TOKEN_INVALIDO = 'El enlace no es válido o expiró';

export interface InfoCliente {
  userAgent: string | null;
  ip: string | null;
}

export interface SesionEmitida {
  accessToken: string;
  refreshToken: string;
  usuario: ReturnType<typeof toUsuarioResponse> & { automotoraId: string };
}

@Injectable()
export class AuthService {
  // Hash señuelo: se verifica contra él cuando el email no existe, para que el
  // tiempo de respuesta no revele qué cuentas existen.
  private hashSenueloPromise: Promise<string> | null = null;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly tx: TransactionRunner,
    private readonly automotoras: AutomotorasRepository,
    private readonly sucursales: SucursalesRepository,
    private readonly usuarios: UsuariosRepository,
    private readonly tokens: TokensAccionRepository,
    private readonly sesiones: SesionesRepository,
    private readonly accesos: AccesosRepository,
    private readonly email: EmailService,
  ) {}

  async subdominioDisponible(subdominio: string) {
    if (SUBDOMINIOS_RESERVADOS.includes(subdominio)) {
      return { disponible: false, motivo: 'RESERVADO' as const };
    }
    if (!esSubdominioValido(subdominio)) {
      return { disponible: false, motivo: 'FORMATO_INVALIDO' as const };
    }
    if (await this.automotoras.existeSubdominio(subdominio)) {
      return { disponible: false, motivo: 'EN_USO' as const };
    }
    return { disponible: true };
  }

  // Transacción única: Automotora → Sucursal principal → Usuario ADMIN_GENERAL
  // (+ token de verificación). El correo se envía después del COMMIT.
  async registrarAutomotora(dto: RegistroAutomotoraDto, cliente: InfoCliente) {
    const { automotora: datos, admin } = dto;

    if (!esRutValido(datos.rut)) {
      throw new BadRequestException('El RUT de la automotora no es válido');
    }
    if (SUBDOMINIOS_RESERVADOS.includes(datos.subdominio)) {
      throw new ConflictException('Ese subdominio está reservado por la plataforma');
    }
    if (!esSubdominioValido(datos.subdominio)) {
      throw new BadRequestException(
        'Subdominio inválido: usa solo minúsculas, números y guiones (3 a 63 caracteres)',
      );
    }
    if (await this.automotoras.existeSubdominio(datos.subdominio)) {
      throw new ConflictException('El subdominio ya está en uso');
    }
    if (await this.usuarios.existeEmail(admin.email)) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const passwordHash = await argon2.hash(admin.password);
    const token = generarToken();

    const usuario = await this.tx.run(async (client) => {
      const automotora = await this.automotoras.create(
        { ...datos, rut: normalizarRut(datos.rut) },
        client,
      );
      await this.sucursales.create(
        {
          automotoraId: automotora.id,
          nombre: 'Casa Matriz',
          direccion: datos.direccion,
          region: datos.region,
          comuna: datos.comuna,
          telefono: datos.telefono,
          encargado: null,
          esPrincipal: true,
        },
        client,
      );
      const creado = await this.usuarios.create(
        {
          automotoraId: automotora.id,
          sucursalId: null,
          nombre: admin.nombre,
          email: admin.email,
          passwordHash,
          rol: 'ADMIN_GENERAL',
          // El DTO exige aceptarlos; se guarda la versión vigente del servidor.
          terminosVersion: VERSION_TERMINOS,
        },
        client,
      );
      await this.tokens.create(
        creado.id,
        'VERIFICACION_EMAIL',
        hashToken(token),
        horasDesdeAhora(HORAS_VERIFICACION),
        client,
      );
      await this.registrarAcceso(creado, 'REGISTRO_AUTOMOTORA', cliente, client);
      return creado;
    });

    await this.email.enviarVerificacionEmail(usuario.email, usuario.nombre, token);
    return { mensaje: 'Registro exitoso. Revisa tu correo para verificar tu email.' };
  }

  async verificarEmail(token: string, cliente: InfoCliente) {
    const ok = await this.tx.run(async (client) => {
      const usuarioId = await this.tokens.consumir(hashToken(token), 'VERIFICACION_EMAIL', client);
      if (!usuarioId) return false;
      await this.usuarios.marcarEmailVerificado(usuarioId, client);
      await this.registrarAccesoDe(usuarioId, 'EMAIL_VERIFICADO', cliente, client);
      return true;
    });
    if (!ok) throw new BadRequestException(TOKEN_INVALIDO);
    return { mensaje: 'Email verificado. Ya puedes iniciar sesión.' };
  }

  // Respuesta idéntica exista o no el email (evita enumeración de cuentas).
  async reenviarVerificacion(email: string) {
    const usuario = await this.usuarios.findByEmail(email);
    if (
      usuario &&
      !usuario.email_verificado &&
      !usuario.invitacion_pendiente &&
      usuario.estado === 'ACTIVO'
    ) {
      const token = generarToken();
      await this.tx.run(async (client) => {
        await this.tokens.invalidarPendientes(usuario.id, 'VERIFICACION_EMAIL', client);
        await this.tokens.create(
          usuario.id,
          'VERIFICACION_EMAIL',
          hashToken(token),
          horasDesdeAhora(HORAS_VERIFICACION),
          client,
        );
      });
      await this.email.enviarVerificacionEmail(usuario.email, usuario.nombre, token);
    }
    return {
      mensaje: 'Si el correo corresponde a una cuenta pendiente, se enviará un nuevo enlace.',
    };
  }

  // Invitación: define la contraseña y, como el link llegó a su correo, verifica el email.
  async aceptarInvitacion(token: string, password: string, cliente: InfoCliente) {
    const passwordHash = await argon2.hash(password);
    const ok = await this.tx.run(async (client) => {
      const usuarioId = await this.tokens.consumir(hashToken(token), 'INVITACION_USUARIO', client);
      if (!usuarioId) return false;
      await this.usuarios.setPassword(usuarioId, passwordHash, client);
      await this.usuarios.marcarEmailVerificado(usuarioId, client);
      await this.registrarAccesoDe(usuarioId, 'INVITACION_ACEPTADA', cliente, client);
      return true;
    });
    if (!ok) throw new BadRequestException(TOKEN_INVALIDO);
    return { mensaje: 'Contraseña configurada. Ya puedes iniciar sesión.' };
  }

  async login(email: string, password: string, cliente: InfoCliente): Promise<SesionEmitida> {
    const usuario = await this.usuarios.findByEmailConPassword(email);
    const passwordOk = await this.verificarPassword(usuario?.password_hash ?? null, password);

    if (!usuario) throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    // El motivo queda en el registro de accesos; la respuesta es siempre la misma.
    const motivo: MotivoLoginFallido | null = !passwordOk
      ? 'PASSWORD_INCORRECTA'
      : usuario.estado !== 'ACTIVO'
        ? 'CUENTA_INACTIVA'
        : !usuario.email_verificado
          ? 'EMAIL_SIN_VERIFICAR'
          : null;
    if (motivo) {
      // Sin esperar la escritura: así el tiempo de respuesta no distingue una
      // cuenta existente de una inexistente (que no se registra).
      void this.accesos
        .registrar({
          automotoraId: usuario.automotora_id,
          usuarioId: usuario.id,
          evento: 'LOGIN_FALLIDO',
          motivo,
          ip: cliente.ip,
          userAgent: cliente.userAgent,
        })
        .catch((err: unknown) => this.logger.error('No se pudo registrar el acceso', err));
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }
    const sesion = await this.emitirSesion(usuario, cliente);
    await this.registrarAcceso(usuario, 'LOGIN_EXITOSO', cliente);
    return sesion;
  }

  // Rotación: la sesión presentada se revoca y se emite una nueva.
  async refresh(refreshToken: string | undefined, cliente: InfoCliente): Promise<SesionEmitida> {
    if (!refreshToken) throw new UnauthorizedException();

    const usuarioId = await this.sesiones.revocarVigente(hashToken(refreshToken));
    if (!usuarioId) throw new UnauthorizedException();

    // Rol/sucursal/estado se releen de la BD: los cambios se reflejan al renovar.
    const usuario = await this.usuarios.findById(usuarioId);
    if (!usuario || usuario.estado !== 'ACTIVO') throw new UnauthorizedException();

    return this.emitirSesion(usuario, cliente);
  }

  async logout(refreshToken: string | undefined, cliente: InfoCliente) {
    if (!refreshToken) return;
    const usuarioId = await this.sesiones.revocarVigente(hashToken(refreshToken));
    if (usuarioId) await this.registrarAccesoDe(usuarioId, 'LOGOUT', cliente);
  }

  async olvidePassword(email: string, cliente: InfoCliente) {
    const usuario = await this.usuarios.findByEmail(email);
    if (usuario && usuario.estado === 'ACTIVO' && !usuario.invitacion_pendiente) {
      const token = generarToken();
      await this.tx.run(async (client) => {
        await this.registrarAcceso(usuario, 'RESET_SOLICITADO', cliente, client);
        await this.tokens.invalidarPendientes(usuario.id, 'RESET_PASSWORD', client);
        await this.tokens.create(
          usuario.id,
          'RESET_PASSWORD',
          hashToken(token),
          horasDesdeAhora(HORAS_RESET),
          client,
        );
      });
      await this.email.enviarResetPassword(usuario.email, usuario.nombre, token);
    }
    return { mensaje: 'Si el correo existe, se enviará un enlace para restablecer la contraseña.' };
  }

  // Cambia la contraseña y revoca TODAS las sesiones del usuario.
  async restablecerPassword(token: string, password: string, cliente: InfoCliente) {
    const passwordHash = await argon2.hash(password);
    const ok = await this.tx.run(async (client) => {
      const usuarioId = await this.tokens.consumir(hashToken(token), 'RESET_PASSWORD', client);
      if (!usuarioId) return false;
      await this.usuarios.setPassword(usuarioId, passwordHash, client);
      await this.sesiones.revocarTodasDeUsuario(usuarioId, client);
      await this.registrarAccesoDe(usuarioId, 'PASSWORD_RESTABLECIDO', cliente, client);
      return true;
    });
    if (!ok) throw new BadRequestException(TOKEN_INVALIDO);
    return { mensaje: 'Contraseña actualizada. Inicia sesión nuevamente.' };
  }

  async perfil(usuarioId: string) {
    const usuario = await this.usuarios.findById(usuarioId);
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return { ...toUsuarioResponse(usuario), automotoraId: usuario.automotora_id };
  }

  // Registro de accesos (Módulo 16), en la transacción del cambio cuando la hay.
  private async registrarAcceso(
    usuario: { id: string; automotora_id: string },
    evento: EventoAcceso,
    cliente: InfoCliente,
    db?: Queryable,
  ) {
    await this.accesos.registrar(
      {
        automotoraId: usuario.automotora_id,
        usuarioId: usuario.id,
        evento,
        ip: cliente.ip,
        userAgent: cliente.userAgent,
      },
      db,
    );
  }

  private async registrarAccesoDe(
    usuarioId: string,
    evento: EventoAcceso,
    cliente: InfoCliente,
    db?: Queryable,
  ) {
    const usuario = await this.usuarios.findById(usuarioId, db);
    if (usuario) await this.registrarAcceso(usuario, evento, cliente, db);
  }

  private async emitirSesion(usuario: UsuarioRow, cliente: InfoCliente): Promise<SesionEmitida> {
    const payload: JwtPayload = {
      sub: usuario.id,
      automotoraId: usuario.automotora_id,
      sucursalId: usuario.sucursal_id,
      rol: usuario.rol,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = generarToken();

    await this.sesiones.create({
      usuarioId: usuario.id,
      refreshTokenHash: hashToken(refreshToken),
      fechaExpiracion: new Date(Date.now() + this.config.REFRESH_TTL_DIAS * 24 * 60 * 60 * 1000),
      userAgent: cliente.userAgent?.slice(0, 500) ?? null,
      ip: cliente.ip,
    });

    return {
      accessToken,
      refreshToken,
      usuario: { ...toUsuarioResponse(usuario), automotoraId: usuario.automotora_id },
    };
  }

  private async verificarPassword(hash: string | null, password: string): Promise<boolean> {
    try {
      // El PASSWORD_PENDIENTE de un invitado no es un hash argon2 válido: verify lanza → false.
      return await argon2.verify(hash ?? (await this.hashSenuelo()), password);
    } catch {
      return false;
    }
  }

  private hashSenuelo(): Promise<string> {
    this.hashSenueloPromise ??= argon2.hash(generarToken());
    return this.hashSenueloPromise;
  }
}

function horasDesdeAhora(horas: number): Date {
  return new Date(Date.now() + horas * 60 * 60 * 1000);
}
