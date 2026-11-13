import { BadRequestException, ConflictException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { ConsignacionesService } from './consignaciones.service';

const admin: UsuarioAutenticado = {
  id: 'as',
  automotoraId: 'a1',
  sucursalId: 's1',
  rol: 'ADMIN_SUCURSAL',
};

function consignacion(parcial: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    folio: 4,
    vehiculo_id: 'v1',
    sucursal_id: 's0',
    vehiculo_sucursal_id: 's1',
    tipo_trato: 'COMISION_VENTA',
    porcentaje_comision: '8.00',
    monto_neto: null,
    precio_minimo: '10000000.00',
    vehiculo_precio_venta: '12000000.00',
    fecha_inicio: '2026-01-01',
    fecha_fin: '2026-03-01',
    estado: 'ACTIVA',
    ...parcial,
  };
}

function crearServicio(parcial: Record<string, unknown> = {}, estadoVehiculo = 'DISPONIBLE') {
  const consignaciones = {
    findByIdScoped: jest.fn().mockResolvedValue(consignacion(parcial)),
    lockById: jest.fn().mockResolvedValue(consignacion(parcial)),
    updateCondiciones: jest.fn(),
    extender: jest.fn(),
    setEstado: jest.fn(),
  };
  const vehiculos = {
    lockById: jest.fn().mockResolvedValue({ id: 'v1', estado: estadoVehiculo }),
    setEstado: jest.fn(),
  };
  const bitacora = { registrar: jest.fn() };
  const auditoria = { registrar: jest.fn() };
  const tx = { run: jest.fn().mockImplementation((fn) => fn({})) };
  const service = new ConsignacionesService(
    consignaciones as never,
    vehiculos as never,
    bitacora as never,
    auditoria as never,
    {} as never,
    tx as never,
  );
  return { service, consignaciones, vehiculos, bitacora, auditoria };
}

describe('ConsignacionesService', () => {
  it('extender una VENCIDA la vuelve ACTIVA con la nueva fecha', async () => {
    const { service, consignaciones } = crearServicio({ estado: 'VENCIDA' });
    await service.extender('c1', { nuevaFechaFin: '2999-06-30' }, admin);
    expect(consignaciones.extender).toHaveBeenCalledWith('c1', '2999-06-30', expect.anything());
  });

  it('no extiende a una fecha anterior o igual a la actual', async () => {
    const { service } = crearServicio({ fecha_fin: '2999-06-30' });
    await expect(service.extender('c1', { nuevaFechaFin: '2999-06-30' }, admin)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('devolver: consignación DEVUELTA, vehículo DADO_DE_BAJA y evento en bitácora', async () => {
    const { service, consignaciones, vehiculos, bitacora, auditoria } = crearServicio({
      estado: 'VENCIDA',
    });
    await service.devolver('c1', { motivo: 'El dueño lo retira' }, admin);
    expect(consignaciones.setEstado).toHaveBeenCalledWith('c1', 'DEVUELTA', expect.anything());
    expect(vehiculos.setEstado).toHaveBeenCalledWith('v1', 'DADO_DE_BAJA', expect.anything());
    expect(bitacora.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: 'CAMBIO_ESTADO' }),
      expect.anything(),
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'CONSIGNACION_DEVUELTA', sucursalId: 's1' }),
      expect.anything(),
    );
  });

  it.each(['RESERVADO', 'VENDIDO'])('no devuelve un vehículo %s', async (estado) => {
    const { service } = crearServicio({}, estado);
    await expect(service.devolver('c1', {}, admin)).rejects.toThrow(ConflictException);
  });

  it('solo cambia condiciones de una consignación ACTIVA', async () => {
    const { service } = crearServicio({ estado: 'VENCIDA' });
    await expect(
      service.actualizarCondiciones('c1', { porcentajeComision: 5 }, admin),
    ).rejects.toThrow(ConflictException);
  });

  it('cambiar a PRECIO_NETO exige el neto y lo usa como precio mínimo', async () => {
    const { service, consignaciones } = crearServicio();
    await expect(
      service.actualizarCondiciones('c1', { tipoTrato: 'PRECIO_NETO' }, admin),
    ).rejects.toThrow('Indica el monto neto');
    await service.actualizarCondiciones(
      'c1',
      { tipoTrato: 'PRECIO_NETO', montoNeto: 10_500_000 },
      admin,
    );
    expect(consignaciones.updateCondiciones).toHaveBeenCalledWith(
      'c1',
      {
        tipoTrato: 'PRECIO_NETO',
        porcentajeComision: null,
        montoNeto: 10_500_000,
        precioMinimo: 10_500_000,
      },
      expect.anything(),
    );
  });

  it('rechaza una comisión que deja al dueño bajo su mínimo (al precio de venta)', async () => {
    // Publicado en $12.000.000 con mínimo $10.000.000: máximo $2.000.000 (16,67%).
    const { service, consignaciones } = crearServicio();
    await expect(
      service.actualizarCondiciones('c1', { porcentajeComision: 20 }, admin),
    ).rejects.toThrow('La comisión deja al dueño bajo su precio mínimo');
    expect(consignaciones.updateCondiciones).not.toHaveBeenCalled();
    await service.actualizarCondiciones('c1', { porcentajeComision: 16 }, admin);
    expect(consignaciones.updateCondiciones).toHaveBeenCalled();
  });

  it('liquidación PRECIO_NETO: advierte si el precio no cubre el neto', async () => {
    const { service } = crearServicio({
      tipo_trato: 'PRECIO_NETO',
      porcentaje_comision: null,
      monto_neto: '10000000.00',
      precio_minimo: '10000000.00',
    });
    expect(await service.liquidacion('c1', 11_000_000, admin)).toMatchObject({
      comision: 1_000_000,
      montoConsignante: 10_000_000,
      advertencias: [],
    });
    const bajo = await service.liquidacion('c1', 9_500_000, admin);
    expect(bajo.comision).toBe(-500_000);
    expect(bajo.advertencias).toHaveLength(2); // bajo el mínimo + pérdida
  });

  it('liquidación al precio actual, con advertencia bajo el precio mínimo', async () => {
    const { service } = crearServicio();
    expect(await service.liquidacion('c1', undefined, admin)).toMatchObject({
      comision: 960_000,
      montoConsignante: 11_040_000,
      advertencias: [],
    });
    const bajo = await service.liquidacion('c1', 9_000_000, admin);
    expect(bajo.advertencias).toHaveLength(1);
  });
});
