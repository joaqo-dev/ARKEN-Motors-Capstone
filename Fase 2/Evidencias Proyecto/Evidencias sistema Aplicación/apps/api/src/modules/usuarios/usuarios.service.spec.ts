import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { UsuariosService } from './usuarios.service';
import type { UsuarioRow } from './usuarios.repository';

const AUTOMOTORA = 'a1';
const SUC_A = '11111111-1111-1111-1111-111111111111';
const SUC_B = '22222222-2222-2222-2222-222222222222';

const adminGeneral: UsuarioAutenticado = {
  id: 'ag',
  automotoraId: AUTOMOTORA,
  sucursalId: null,
  rol: 'ADMIN_GENERAL',
};
const adminSucursalA: UsuarioAutenticado = {
  id: 'as',
  automotoraId: AUTOMOTORA,
  sucursalId: SUC_A,
  rol: 'ADMIN_SUCURSAL',
};

function usuarioRow(parcial: Partial<UsuarioRow>): UsuarioRow {
  return {
    id: 'u1',
    automotora_id: AUTOMOTORA,
    sucursal_id: SUC_A,
    nombre: 'Vendedor',
    email: 'v@demo.cl',
    rol: 'VENDEDOR',
    email_verificado: true,
    estado: 'ACTIVO',
    fecha_creacion: new Date(),
    invitacion_pendiente: false,
    ...parcial,
  };
}

function crearServicio() {
  const usuarios = {
    existeEmail: jest.fn().mockResolvedValue(false),
    create: jest
      .fn()
      .mockImplementation(async (d) =>
        usuarioRow({ sucursal_id: d.sucursalId, rol: d.rol, invitacion_pendiente: true }),
      ),
    findByIdScoped: jest.fn(),
    update: jest
      .fn()
      .mockImplementation(async (_id, _a, c) => usuarioRow({ ...c, sucursal_id: c.sucursalId })),
    setEstado: jest.fn(),
  };
  const sucursales = {
    // Solo existen (activas) las sucursales A y B de la automotora.
    findByIdScoped: jest
      .fn()
      .mockImplementation(async (id: string) => ([SUC_A, SUC_B].includes(id) ? { id } : null)),
  };
  const tokens = { create: jest.fn(), invalidarPendientes: jest.fn() };
  const sesiones = { revocarTodasDeUsuario: jest.fn() };
  const automotoras = { findById: jest.fn().mockResolvedValue({ nombre: 'Autos Demo' }) };
  const tx = { run: jest.fn().mockImplementation((fn) => fn({})) };
  const email = { enviarInvitacion: jest.fn() };

  const service = new UsuariosService(
    usuarios as never,
    tokens as never,
    sesiones as never,
    sucursales as never,
    automotoras as never,
    tx as never,
    email as never,
    { registrar: jest.fn() } as never,
  );
  return { service, usuarios, tokens, sesiones, email };
}

describe('UsuariosService.invitar', () => {
  it('exige sucursal para VENDEDOR y ADMIN_SUCURSAL', async () => {
    const { service } = crearServicio();
    await expect(
      service.invitar({ nombre: 'X', email: 'x@d.cl', rol: 'VENDEDOR' }, adminGeneral),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza sucursal para ADMIN_GENERAL', async () => {
    const { service } = crearServicio();
    await expect(
      service.invitar(
        { nombre: 'X', email: 'x@d.cl', rol: 'ADMIN_GENERAL', sucursalId: SUC_A },
        adminGeneral,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza una sucursal inexistente o dada de baja', async () => {
    const { service } = crearServicio();
    await expect(
      service.invitar(
        {
          nombre: 'X',
          email: 'x@d.cl',
          rol: 'VENDEDOR',
          sucursalId: '99999999-9999-9999-9999-999999999999',
        },
        adminGeneral,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('crea el usuario sin contraseña utilizable, con token de invitación y correo', async () => {
    const { service, usuarios, tokens, email } = crearServicio();
    const res = await service.invitar(
      { nombre: 'X', email: 'x@d.cl', rol: 'VENDEDOR', sucursalId: SUC_B },
      adminGeneral,
    );
    expect(usuarios.create).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: '!INVITACION_PENDIENTE', sucursalId: SUC_B }),
      expect.anything(),
    );
    expect(tokens.create).toHaveBeenCalledWith(
      expect.any(String),
      'INVITACION_USUARIO',
      expect.any(String),
      expect.any(Date),
      expect.anything(),
    );
    expect(email.enviarInvitacion).toHaveBeenCalled();
    expect(res.invitacionPendiente).toBe(true);
  });

  it('ADMIN_SUCURSAL no puede crear un ADMIN_GENERAL', async () => {
    const { service } = crearServicio();
    await expect(
      service.invitar({ nombre: 'X', email: 'x@d.cl', rol: 'ADMIN_GENERAL' }, adminSucursalA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ADMIN_SUCURSAL no puede asignar a otra sucursal', async () => {
    const { service } = crearServicio();
    await expect(
      service.invitar(
        { nombre: 'X', email: 'x@d.cl', rol: 'VENDEDOR', sucursalId: SUC_B },
        adminSucursalA,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ADMIN_SUCURSAL asigna su propia sucursal aunque no la indique', async () => {
    const { service, usuarios } = crearServicio();
    await service.invitar({ nombre: 'X', email: 'x@d.cl', rol: 'VENDEDOR' }, adminSucursalA);
    expect(usuarios.create).toHaveBeenCalledWith(
      expect.objectContaining({ sucursalId: SUC_A }),
      expect.anything(),
    );
  });
});

describe('UsuariosService.actualizar', () => {
  it('al promover a ADMIN_GENERAL deja la sucursal en null', async () => {
    const { service, usuarios } = crearServicio();
    usuarios.findByIdScoped.mockResolvedValue(usuarioRow({}));
    await service.actualizar('u1', { rol: 'ADMIN_GENERAL' }, adminGeneral);
    expect(usuarios.update).toHaveBeenCalledWith(
      'u1',
      AUTOMOTORA,
      { nombre: undefined, rol: 'ADMIN_GENERAL', sucursalId: null },
      expect.anything(),
    );
  });

  it('al bajar un ADMIN_GENERAL a VENDEDOR exige sucursal', async () => {
    const { service, usuarios } = crearServicio();
    usuarios.findByIdScoped.mockResolvedValue(
      usuarioRow({ rol: 'ADMIN_GENERAL', sucursal_id: null }),
    );
    await expect(service.actualizar('u1', { rol: 'VENDEDOR' }, adminGeneral)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('nadie cambia su propio rol', async () => {
    const { service, usuarios } = crearServicio();
    usuarios.findByIdScoped.mockResolvedValue(
      usuarioRow({ id: 'ag', rol: 'ADMIN_GENERAL', sucursal_id: null }),
    );
    await expect(
      service.actualizar('ag', { rol: 'VENDEDOR', sucursalId: SUC_A }, adminGeneral),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('UsuariosService.desactivar', () => {
  it('revoca todas las sesiones en la misma transacción', async () => {
    const { service, usuarios, sesiones } = crearServicio();
    usuarios.findByIdScoped.mockResolvedValue(usuarioRow({}));
    usuarios.setEstado.mockResolvedValue(usuarioRow({ estado: 'INACTIVO' }));
    await service.desactivar('u1', adminGeneral);
    expect(usuarios.setEstado).toHaveBeenCalledWith('u1', 'INACTIVO', expect.anything());
    expect(sesiones.revocarTodasDeUsuario).toHaveBeenCalledWith('u1', expect.anything());
  });

  it('nadie se desactiva a sí mismo', async () => {
    const { service, usuarios } = crearServicio();
    usuarios.findByIdScoped.mockResolvedValue(usuarioRow({ id: 'ag' }));
    await expect(service.desactivar('ag', adminGeneral)).rejects.toThrow(ForbiddenException);
  });
});
