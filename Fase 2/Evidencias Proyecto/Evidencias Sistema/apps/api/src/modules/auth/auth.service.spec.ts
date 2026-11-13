import { UnauthorizedException } from '@nestjs/common';
import { VERSION_TERMINOS } from '@vitriauto/shared-types';
import * as argon2 from 'argon2';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthService } from './auth.service';
import { RegistroAutomotoraDto } from './dto/registro-automotora.dto';

const cliente = { userAgent: 'jest', ip: '127.0.0.1' };

async function crearServicio(usuario: Record<string, unknown> | null) {
  const usuarios = { findByEmailConPassword: jest.fn().mockResolvedValue(usuario) };
  const sesiones = { create: jest.fn() };
  const jwt = { signAsync: jest.fn().mockResolvedValue('jwt') };
  const config = { REFRESH_TTL_DIAS: 7 };
  const accesos = { registrar: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(
    config as never,
    jwt as never,
    {} as never,
    {} as never,
    {} as never,
    usuarios as never,
    {} as never,
    sesiones as never,
    accesos as never,
    {} as never,
  );
  return { service, sesiones, jwt, accesos };
}

describe('AuthService.login', () => {
  let hash: string;
  beforeAll(async () => {
    hash = await argon2.hash('Secreta123');
  });

  const base = () => ({
    id: 'u1',
    automotora_id: 'a1',
    sucursal_id: null,
    nombre: 'Admin',
    email: 'a@d.cl',
    rol: 'ADMIN_GENERAL',
    email_verificado: true,
    estado: 'ACTIVO',
    fecha_creacion: new Date(),
    invitacion_pendiente: false,
    password_hash: hash,
  });

  it('emite sesión con el payload del JWT derivado de la BD', async () => {
    const { service, jwt, sesiones } = await crearServicio(base());
    await service.login('a@d.cl', 'Secreta123', cliente);
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'u1',
      automotoraId: 'a1',
      sucursalId: null,
      rol: 'ADMIN_GENERAL',
    });
    expect(sesiones.create).toHaveBeenCalled();
  });

  it('un inicio de sesión exitoso queda en el registro de accesos con IP y navegador', async () => {
    const { service, accesos } = await crearServicio(base());
    await service.login('a@d.cl', 'Secreta123', cliente);
    expect(accesos.registrar).toHaveBeenCalledWith(
      {
        automotoraId: 'a1',
        usuarioId: 'u1',
        evento: 'LOGIN_EXITOSO',
        ip: '127.0.0.1',
        userAgent: 'jest',
      },
      undefined,
    );
  });

  it.each([
    ['password incorrecta', {}, 'Otra12345', 'PASSWORD_INCORRECTA'],
    ['usuario inactivo', { estado: 'INACTIVO' }, 'Secreta123', 'CUENTA_INACTIVA'],
    ['email sin verificar', { email_verificado: false }, 'Secreta123', 'EMAIL_SIN_VERIFICAR'],
  ])('fallido por %s: se registra con su motivo', async (_caso, cambios, password, motivo) => {
    const { service, accesos } = await crearServicio({ ...base(), ...cambios });
    await service.login('a@d.cl', password, cliente).catch(() => undefined);
    expect(accesos.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'LOGIN_FALLIDO', motivo, usuarioId: 'u1' }),
    );
  });

  it('un email que no existe no se registra (no se guarda texto de terceros)', async () => {
    const { service, accesos } = await crearServicio(null);
    await service.login('x@y.cl', 'Secreta123', cliente).catch(() => undefined);
    expect(accesos.registrar).not.toHaveBeenCalled();
  });

  it.each([
    ['usuario inexistente', null, 'Secreta123'],
    ['password incorrecta', {}, 'Otra12345'],
    ['email sin verificar', { email_verificado: false }, 'Secreta123'],
    ['usuario inactivo', { estado: 'INACTIVO' }, 'Secreta123'],
    ['invitación pendiente', { password_hash: '!INVITACION_PENDIENTE' }, '!INVITACION_PENDIENTE'],
  ])('%s → mismo error genérico', async (_caso, cambios, password) => {
    const usuario = cambios === null ? null : { ...base(), ...cambios };
    const { service } = await crearServicio(usuario);
    const error = await service.login('a@d.cl', password, cliente).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(
      'Credenciales inválidas o email sin verificar',
    );
  });
});

describe('Registro de automotora: Términos de uso y Política de privacidad', () => {
  const cuerpo = (aceptaTerminos: unknown) => ({
    automotora: {
      nombre: 'Autos Prueba',
      rut: '76.123.456-0',
      direccion: 'Av. Siempre Viva 123',
      region: 'METROPOLITANA',
      comuna: 'Providencia',
      telefono: '+56 2 2345 6789',
      email: 'contacto@prueba.cl',
      subdominio: 'autos-prueba',
    },
    admin: { nombre: 'Ana', email: 'ana@prueba.cl', password: 'Secreta123' },
    aceptaTerminos,
  });

  it.each([[false], [undefined], ['true']])(
    'sin aceptarlos (aceptaTerminos = %p) el registro no pasa la validación',
    async (valor) => {
      const dto = plainToInstance(RegistroAutomotoraDto, cuerpo(valor));
      const errores = await validate(dto);
      expect(errores.some((e) => e.property === 'aceptaTerminos')).toBe(true);
    },
  );

  it('aceptándolos, el Admin General queda con la versión vigente del servidor', async () => {
    const dto = plainToInstance(RegistroAutomotoraDto, cuerpo(true));
    expect((await validate(dto)).filter((e) => e.property === 'aceptaTerminos')).toEqual([]);

    const usuarios = {
      existeEmail: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({
        id: 'u1',
        automotora_id: 'a1',
        email: 'ana@prueba.cl',
        nombre: 'Ana',
      }),
    };
    const service = new AuthService(
      {} as never,
      {} as never,
      { run: (fn: (c: unknown) => unknown) => fn({}) } as never,
      {
        existeSubdominio: jest.fn().mockResolvedValue(false),
        create: jest.fn().mockResolvedValue({ id: 'a1' }),
      } as never,
      { create: jest.fn() } as never,
      usuarios as never,
      { create: jest.fn() } as never,
      {} as never,
      { registrar: jest.fn() } as never,
      { enviarVerificacionEmail: jest.fn() } as never,
    );
    await service.registrarAutomotora(dto, cliente);
    expect(usuarios.create).toHaveBeenCalledWith(
      expect.objectContaining({ rol: 'ADMIN_GENERAL', terminosVersion: VERSION_TERMINOS }),
      expect.anything(),
    );
  });
});
