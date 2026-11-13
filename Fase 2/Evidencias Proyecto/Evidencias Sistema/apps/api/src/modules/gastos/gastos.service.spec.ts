import { BadRequestException, ConflictException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { GastosService } from './gastos.service';

const SUC_A = 'suc-a';
const adminGeneral: UsuarioAutenticado = {
  id: 'ag',
  automotoraId: 'a1',
  sucursalId: null,
  rol: 'ADMIN_GENERAL',
};
const dto = {
  categoria: 'MECANICA' as const,
  monto: 150_000,
  fecha: '2026-01-10',
  comentario: 'Frenos',
};

const adminSucursal: UsuarioAutenticado = {
  id: 'as',
  automotoraId: 'a1',
  sucursalId: SUC_A,
  rol: 'ADMIN_SUCURSAL',
};

function gastoDetalle(parcial: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    tipo: 'VEHICULO',
    vehiculo_id: 'v1',
    sucursal_id: SUC_A,
    categoria: 'MECANICA',
    monto: '150000.00',
    fecha: '2026-01-10',
    comentario: null,
    estado: 'ACTIVO',
    vehiculo_estado: 'DISPONIBLE',
    archivo_adjunto_url: null,
    ...parcial,
  };
}

function crearServicio(origen = 'COMPRA_DIRECTA') {
  const gastos = {
    create: jest
      .fn()
      .mockImplementation(async (d) => ({ ...gastoDetalle(), sucursal_id: d.sucursalId })),
    findByIdAccesible: jest.fn().mockResolvedValue(gastoDetalle()),
    lockById: jest.fn().mockResolvedValue(gastoDetalle()),
    update: jest.fn(),
    anular: jest.fn(),
  };
  const sucursales = {
    findByIdScoped: jest
      .fn()
      .mockImplementation(async (id: string) => (id === SUC_A ? { id: SUC_A } : null)),
  };
  const vehiculos = {
    findByIdScoped: jest.fn().mockResolvedValue({ id: 'v1', origen, sucursal_id: SUC_A }),
    lockById: jest.fn().mockResolvedValue({ id: 'v1', origen, sucursal_id: SUC_A }),
  };
  const bitacora = { registrar: jest.fn() };
  const auditoria = { registrar: jest.fn() };
  const almacenamiento = {
    validarDocumento: jest.fn(),
    guardarDocumento: jest.fn(),
    eliminar: jest.fn(),
  };
  const tx = { run: jest.fn().mockImplementation((fn) => fn({})) };
  const service = new GastosService(
    gastos as never,
    vehiculos as never,
    bitacora as never,
    auditoria as never,
    sucursales as never,
    almacenamiento as never,
    tx as never,
  );
  return { service, gastos, vehiculos, bitacora, auditoria };
}

describe('GastosService.crear', () => {
  it('rechaza gastos en vehículos consignados', async () => {
    const { service, gastos } = crearServicio('CONSIGNACION');
    await expect(service.crear('v1', dto, undefined, adminGeneral)).rejects.toThrow(
      BadRequestException,
    );
    expect(gastos.create).not.toHaveBeenCalled();
  });

  it('congela la sucursal actual del vehículo y registra bitácora + auditoría', async () => {
    const { service, gastos, bitacora, auditoria } = crearServicio();
    await service.crear('v1', dto, undefined, adminGeneral);
    expect(gastos.create).toHaveBeenCalledWith(
      expect.objectContaining({ sucursalId: SUC_A, vehiculoId: 'v1', monto: 150_000 }),
      expect.anything(),
    );
    expect(bitacora.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: 'GASTO_AGREGADO',
        referenciaTipo: 'GASTO',
        referenciaId: 'g1',
      }),
      expect.anything(),
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'GASTO_CREADO', sucursalId: SUC_A }),
      expect.anything(),
    );
  });

  it('rechaza una fecha futura', async () => {
    const { service } = crearServicio();
    await expect(
      service.crear('v1', { ...dto, fecha: '2999-01-01' }, undefined, adminGeneral),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('GastosService.actualizar / anular', () => {
  it('no edita un gasto de un vehículo vendido', async () => {
    const { service, gastos } = crearServicio();
    gastos.findByIdAccesible.mockResolvedValue(gastoDetalle({ vehiculo_estado: 'VENDIDO' }));
    await expect(service.actualizar('g1', { monto: 1 }, adminGeneral)).rejects.toThrow(
      ConflictException,
    );
    expect(gastos.update).not.toHaveBeenCalled();
  });

  it('sí anula un gasto de un vehículo vendido', async () => {
    const { service, gastos, auditoria } = crearServicio();
    gastos.findByIdAccesible.mockResolvedValue(gastoDetalle({ vehiculo_estado: 'VENDIDO' }));
    await service.anular('g1', { motivo: 'Monto mal ingresado' }, adminGeneral);
    expect(gastos.anular).toHaveBeenCalledWith('g1', expect.anything());
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'GASTO_ANULADO',
        valorNuevo: { estado: 'ANULADO', motivo: 'Monto mal ingresado' },
      }),
      expect.anything(),
    );
  });

  it('no anula dos veces', async () => {
    const { service, gastos } = crearServicio();
    gastos.lockById.mockResolvedValue(gastoDetalle({ estado: 'ANULADO' }));
    await expect(service.anular('g1', {}, adminGeneral)).rejects.toThrow(ConflictException);
  });
});

const operacional = {
  categoria: 'ARRIENDO' as const,
  monto: 1_200_000,
  fecha: '2026-01-05',
  comentario: 'Arriendo local',
};

describe('GastosService.crearOperacional', () => {
  it('el Admin General puede registrar un gasto general (sin sucursal)', async () => {
    const { service, gastos, bitacora } = crearServicio();
    await service.crearOperacional(operacional, undefined, adminGeneral);
    expect(gastos.create).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'OPERACIONAL', vehiculoId: null, sucursalId: null }),
      expect.anything(),
    );
    expect(bitacora.registrar).not.toHaveBeenCalled(); // no hay vehículo
  });

  it('el Admin de Sucursal siempre registra en la suya y no puede elegir otra', async () => {
    const { service, gastos } = crearServicio();
    await service.crearOperacional(operacional, undefined, adminSucursal);
    expect(gastos.create).toHaveBeenCalledWith(
      expect.objectContaining({ sucursalId: SUC_A }),
      expect.anything(),
    );
    await expect(
      service.crearOperacional({ ...operacional, sucursalId: 'otra' }, undefined, adminSucursal),
    ).rejects.toThrow('Solo puedes registrar gastos de tu sucursal');
  });

  it('valida que la sucursal elegida por el Admin General exista', async () => {
    const { service } = crearServicio();
    await expect(
      service.crearOperacional(
        { ...operacional, sucursalId: 'no-existe' },
        undefined,
        adminGeneral,
      ),
    ).rejects.toThrow('La sucursal no existe');
  });

  it('un gasto de vehículo no acepta una categoría operacional al editar', async () => {
    const { service } = crearServicio();
    await expect(service.actualizar('g1', { categoria: 'ARRIENDO' }, adminGeneral)).rejects.toThrow(
      'no corresponde a un gasto de vehículo',
    );
  });
});
