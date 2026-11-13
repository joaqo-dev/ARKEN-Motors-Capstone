import { BadRequestException, ConflictException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { ReservasService } from './reservas.service';

const admin: UsuarioAutenticado = {
  id: 'as',
  automotoraId: 'a1',
  sucursalId: 's1',
  rol: 'ADMIN_SUCURSAL',
};

function crearServicio(
  opciones: {
    estadoVehiculo?: string;
    reserva?: Record<string, unknown>;
    fotos?: number;
  } = {},
) {
  const vehiculo = {
    id: 'v1',
    estado: opciones.estadoVehiculo ?? 'EN_PREPARACION',
    sucursal_id: 's1',
    precio_venta: '9000000.00',
  };
  const reservas = {
    findByIdAccesible: jest.fn().mockResolvedValue({ id: 'r1' }),
    lockById: jest.fn().mockResolvedValue({
      id: 'r1',
      folio: 3,
      vehiculo_id: 'v1',
      sucursal_id: 's1',
      estado: 'VIGENTE',
      fecha_vencimiento: '2026-10-01',
      estado_vehiculo_previo: 'DISPONIBLE',
      ...opciones.reserva,
    }),
    create: jest.fn().mockResolvedValue({ id: 'r1' }),
    cancelar: jest.fn(),
    extender: jest.fn(),
  };
  const vehiculos = {
    findByIdScoped: jest.fn().mockResolvedValue(vehiculo),
    lockById: jest
      .fn()
      .mockResolvedValue({ ...vehiculo, estado: opciones.estadoVehiculo ?? 'RESERVADO' }),
    setEstado: jest.fn(),
  };
  const fotos = { contar: jest.fn().mockResolvedValue(opciones.fotos ?? 2) };
  const bitacora = { registrar: jest.fn() };
  const folios = { siguiente: jest.fn().mockResolvedValue(1) };
  const comunes = {
    validarCliente: jest.fn(),
    vigencia: jest.fn().mockResolvedValue({ dias: 3, fechaVencimiento: '2026-10-02' }),
    bloquearVehiculo: jest.fn().mockResolvedValue({ ...vehiculo }),
    validarNuevaFechaVencimiento: jest.fn(),
    auditar: jest.fn(),
  };
  const pdf = { generarTrasEmitir: jest.fn() };
  const tx = { run: jest.fn().mockImplementation((fn) => fn({})) };
  const service = new ReservasService(
    reservas as never,
    vehiculos as never,
    fotos as never,
    bitacora as never,
    folios as never,
    comunes as never,
    pdf as never,
    { alEmitir: jest.fn() } as never,
    tx as never,
  );
  return { service, reservas, vehiculos, comunes, bitacora };
}

describe('ReservasService.emitir', () => {
  const dto = { vehiculoId: 'v1', clienteId: 'c1', montoReserva: 500_000 };

  it('guarda el estado previo del vehículo y lo pasa a RESERVADO', async () => {
    const { service, reservas, vehiculos } = crearServicio({ estadoVehiculo: 'EN_PREPARACION' });
    await service.emitir(dto, admin);
    expect(reservas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        estadoVehiculoPrevio: 'EN_PREPARACION',
        sucursalId: 's1',
        folio: 1,
      }),
      expect.anything(),
    );
    expect(vehiculos.setEstado).toHaveBeenCalledWith('v1', 'RESERVADO', expect.anything());
  });

  it.each(['RESERVADO', 'VENDIDO', 'DADO_DE_BAJA'])('no reserva un vehículo %s', async (estado) => {
    const { service, comunes } = crearServicio();
    comunes.bloquearVehiculo.mockResolvedValue({
      id: 'v1',
      estado,
      sucursal_id: 's1',
      precio_venta: '9000000',
    });
    await expect(service.emitir(dto, admin)).rejects.toThrow(ConflictException);
  });

  it('rechaza una seña mayor al precio de venta', async () => {
    const { service } = crearServicio();
    await expect(service.emitir({ ...dto, montoReserva: 10_000_000 }, admin)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('ReservasService.cancelar', () => {
  it('restaura el estado previo del vehículo', async () => {
    const { service, vehiculos, reservas } = crearServicio();
    await service.cancelar('r1', 'Cliente desistió', true, admin);
    expect(reservas.cancelar).toHaveBeenCalledWith(
      'r1',
      'Cliente desistió',
      true,
      'as',
      expect.anything(),
    );
    expect(vehiculos.setEstado).toHaveBeenCalledWith('v1', 'DISPONIBLE', expect.anything());
  });

  it('si estaba publicado pero ya no tiene fotos, vuelve a EN_PREPARACION', async () => {
    const { service, vehiculos } = crearServicio({ fotos: 0 });
    await service.cancelar('r1', 'Cliente desistió', true, admin);
    expect(vehiculos.setEstado).toHaveBeenCalledWith('v1', 'EN_PREPARACION', expect.anything());
  });

  it('una reserva vencida también se puede dar de baja', async () => {
    const { service, reservas } = crearServicio({ reserva: { estado: 'VENCIDA' } });
    await service.cancelar('r1', 'Plazo cumplido', false, admin);
    expect(reservas.cancelar).toHaveBeenCalled();
  });

  it.each(['CANCELADA', 'CONVERTIDA_EN_VENTA'])('no cancela una reserva %s', async (estado) => {
    const { service } = crearServicio({ reserva: { estado } });
    await expect(service.cancelar('r1', 'x', true, admin)).rejects.toThrow(ConflictException);
  });
});
