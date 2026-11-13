import { BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseError } from 'pg';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { ClientesService } from './clientes.service';

const adminSucursal: UsuarioAutenticado = {
  id: 'as',
  automotoraId: 'a1',
  sucursalId: 's2',
  rol: 'ADMIN_SUCURSAL',
};
const vendedor: UsuarioAutenticado = {
  id: 'v',
  automotoraId: 'a1',
  sucursalId: 's1',
  rol: 'VENDEDOR',
};
const dto = {
  nombre: 'Ana Pérez',
  rut: '11.111.111-1',
  telefono: '+56911111111',
  email: 'ana@mail.cl',
  direccion: 'Calle 1',
};

function crearServicio() {
  const clientes = {
    findByRut: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    create: jest.fn().mockImplementation(async (d) => ({ ...d, id: 'c1', estado: 'ACTIVO' })),
    update: jest.fn().mockImplementation(async (_id, _a, c) => ({ id: 'c1', ...c })),
    setEstado: jest.fn().mockImplementation(async (id, _a, estado) => ({ id, estado })),
  };
  const auditoria = { registrar: jest.fn() };
  const tx = { run: jest.fn().mockImplementation((fn) => fn({ cliente: 'tx' })) };
  return {
    service: new ClientesService(clientes as never, auditoria as never, tx as never),
    clientes,
    auditoria,
  };
}

describe('ClientesService', () => {
  it('normaliza el RUT antes de buscar duplicados y guardar', async () => {
    const { service, clientes } = crearServicio();
    await service.crear(dto, vendedor);
    expect(clientes.findByRut).toHaveBeenCalledWith('11111111-1', 'a1');
    expect(clientes.create).toHaveBeenCalledWith(
      expect.objectContaining({ rut: '11111111-1', automotoraId: 'a1' }),
      { cliente: 'tx' },
    );
  });

  it('audita el alta del cliente en la misma transacción', async () => {
    const { service, auditoria } = crearServicio();
    await service.crear(dto, vendedor);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'CLIENTE_CREADO',
        entidadTipo: 'CLIENTE',
        entidadId: 'c1',
        sucursalId: 's1',
        valorAnterior: null,
        valorNuevo: expect.objectContaining({ rut: '11111111-1' }),
      }),
      { cliente: 'tx' },
    );
  });

  it('audita la edición con el antes y el después (corrección de RUT)', async () => {
    const { service, clientes, auditoria } = crearServicio();
    const actual = {
      id: 'c1',
      nombre: 'Ana Pérez',
      rut: '11111111-1',
      telefono: '+56911111111',
      email: 'ana@mail.cl',
      direccion: 'Calle 1',
      estado: 'ACTIVO',
      acepta_recordatorios: true,
    };
    clientes.findById.mockResolvedValue(actual);
    // Como el repositorio: los campos no enviados (undefined) no cambian.
    clientes.update.mockImplementation(async (_id, _a, c) => ({
      ...actual,
      ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)),
    }));
    await service.actualizar('c1', { rut: '12.345.678-5' }, vendedor);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'CLIENTE_EDITADO',
        valorAnterior: expect.objectContaining({ rut: '11111111-1' }),
        valorNuevo: expect.objectContaining({ rut: '12345678-5' }),
      }),
      { cliente: 'tx' },
    );
  });

  it('guardar sin cambios no deja registro en la auditoría', async () => {
    const { service, clientes, auditoria } = crearServicio();
    const actual = {
      id: 'c1',
      nombre: 'Ana Pérez',
      rut: '11111111-1',
      telefono: '+56911111111',
      email: 'ana@mail.cl',
      direccion: 'Calle 1',
      estado: 'ACTIVO',
      acepta_recordatorios: true,
    };
    clientes.findById.mockResolvedValue(actual);
    // Como el repositorio: los campos no enviados (undefined) no cambian.
    clientes.update.mockImplementation(async (_id, _a, c) => ({
      ...actual,
      ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)),
    }));
    await service.actualizar('c1', { nombre: 'Ana Pérez' }, vendedor);
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  it('rechaza un RUT con dígito verificador incorrecto', async () => {
    const { service } = crearServicio();
    await expect(service.crear({ ...dto, rut: '11.111.111-2' }, vendedor)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un RUT ya registrado en la misma automotora', async () => {
    const { service, clientes } = crearServicio();
    clientes.findByRut.mockResolvedValue({ id: 'otro' });
    await expect(service.crear(dto, vendedor)).rejects.toThrow(ConflictException);
  });

  it('traduce la violación del UNIQUE (alta concurrente) a 409', async () => {
    const { service, clientes } = crearServicio();
    const err = new DatabaseError('duplicate key', 0, 'error');
    err.code = '23505';
    clientes.create.mockRejectedValue(err);
    await expect(service.crear(dto, vendedor)).rejects.toThrow(ConflictException);
  });

  it('al editar, permite conservar el mismo RUT aunque venga con otro formato', async () => {
    const { service, clientes } = crearServicio();
    clientes.findById.mockResolvedValue({ id: 'c1', rut: '11111111-1' });
    await service.actualizar('c1', { rut: '11111111-1' }, vendedor);
    expect(clientes.findByRut).not.toHaveBeenCalled();
  });

  it('al editar, rechaza cambiar a un RUT de otro cliente', async () => {
    const { service, clientes } = crearServicio();
    clientes.findById.mockResolvedValue({ id: 'c1', rut: '11111111-1' });
    clientes.findByRut.mockResolvedValue({ id: 'c2' });
    await expect(service.actualizar('c1', { rut: '22.222.222-2' }, vendedor)).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('ClientesService.desactivar', () => {
  it('desactiva y audita en la misma transacción, con la sucursal de quien actúa', async () => {
    const { service, clientes, auditoria } = crearServicio();
    clientes.findById.mockResolvedValue({ id: 'c1', estado: 'ACTIVO' });
    await service.desactivar('c1', adminSucursal);
    expect(clientes.setEstado).toHaveBeenCalledWith('c1', 'a1', 'INACTIVO', { cliente: 'tx' });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      {
        automotoraId: 'a1',
        usuarioId: 'as',
        sucursalId: 's2',
        accion: 'CLIENTE_DESACTIVADO',
        entidadTipo: 'CLIENTE',
        entidadId: 'c1',
        valorAnterior: { estado: 'ACTIVO' },
        valorNuevo: { estado: 'INACTIVO' },
      },
      { cliente: 'tx' },
    );
  });

  it('no audita si el cliente ya estaba inactivo', async () => {
    const { service, clientes, auditoria } = crearServicio();
    clientes.findById.mockResolvedValue({ id: 'c1', estado: 'INACTIVO' });
    await service.desactivar('c1', adminSucursal);
    expect(clientes.setEstado).not.toHaveBeenCalled();
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});
