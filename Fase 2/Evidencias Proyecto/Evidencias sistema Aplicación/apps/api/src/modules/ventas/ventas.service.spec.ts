import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { VentasService } from './ventas.service';

const vendedor: UsuarioAutenticado = {
  id: 'va',
  automotoraId: 'a1',
  sucursalId: 's1',
  rol: 'VENDEDOR',
};
const admin: UsuarioAutenticado = {
  id: 'as',
  automotoraId: 'a1',
  sucursalId: 's1',
  rol: 'ADMIN_SUCURSAL',
};

function vehiculo(parcial: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    estado: 'DISPONIBLE',
    sucursal_id: 's1',
    origen: 'COMPRA_DIRECTA',
    patente: 'BCDF15',
    ...parcial,
  };
}

function crearServicio(
  opciones: {
    vehiculo?: Record<string, unknown>;
    reserva?: Record<string, unknown> | null;
    consignacion?: Record<string, unknown>;
    cotizacion?: Record<string, unknown> | null;
  } = {},
) {
  const v = vehiculo(opciones.vehiculo);
  const ventas = {
    create: jest.fn().mockResolvedValue({ id: 'venta1' }),
    createCosto: jest.fn(),
    createFormaPago: jest.fn(),
    findByIdAccesible: jest
      .fn()
      .mockResolvedValue({ id: 'venta1', formas: [], costos: [], vehiculo_origen: v.origen }),
    lockById: jest.fn(),
    anular: jest.fn(),
  };
  const vehiculos = {
    findByIdScoped: jest.fn().mockResolvedValue(v),
    lockById: jest.fn().mockResolvedValue({ ...v, estado: 'VENDIDO' }),
    existePatenteEnInventario: jest.fn().mockResolvedValue(false),
    create: jest.fn().mockResolvedValue({ id: 'recibido1' }),
    setEstado: jest.fn(),
  };
  const fotos = { contar: jest.fn().mockResolvedValue(3) };
  const bitacora = { registrar: jest.fn() };
  const reservas = {
    lockActivaPorVehiculo: jest.fn().mockResolvedValue(opciones.reserva ?? null),
    convertirEnVenta: jest.fn(),
    cancelar: jest.fn(),
  };
  const consignaciones = {
    lockByVehiculo: jest.fn().mockResolvedValue(opciones.consignacion ?? null),
    findByVehiculo: jest.fn().mockResolvedValue(opciones.consignacion ?? null),
    setEstado: jest.fn(),
  };
  const cotizaciones = {
    lockById: jest.fn().mockResolvedValue(opciones.cotizacion ?? null),
    setEstado: jest.fn(),
  };
  const folios = { siguiente: jest.fn().mockResolvedValue(1) };
  const comunes = {
    validarCliente: jest.fn(),
    bloquearVehiculo: jest.fn().mockResolvedValue(v),
    auditar: jest.fn(),
  };
  const pdf = { generarTrasEmitir: jest.fn() };
  const tx = { run: jest.fn().mockImplementation((fn) => fn({})) };
  const service = new VentasService(
    ventas as never,
    vehiculos as never,
    fotos as never,
    bitacora as never,
    reservas as never,
    consignaciones as never,
    cotizaciones as never,
    folios as never,
    comunes as never,
    pdf as never,
    { alEmitir: jest.fn() } as never,
    tx as never,
  );
  return {
    service,
    ventas,
    vehiculos,
    reservas,
    consignaciones,
    cotizaciones,
    comunes,
    bitacora,
  };
}

const base = {
  vehiculoId: 'v1',
  clienteId: 'c1',
  precioVentaFinal: 9_000_000,
  formasPago: [{ tipo: 'EFECTIVO' as const, monto: 9_000_000 }],
};

describe('VentasService.cerrar', () => {
  it('rechaza formas de pago que no cuadran con el precio', async () => {
    const { service, ventas } = crearServicio();
    await expect(
      service.cerrar(
        {
          ...base,
          formasPago: [
            { tipo: 'EFECTIVO', monto: 5_000_000 },
            { tipo: 'TRANSFERENCIA', monto: 3_000_000 },
          ],
        },
        vendedor,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(ventas.create).not.toHaveBeenCalled();
  });

  it('cuadra formas combinadas y marca el vehículo VENDIDO', async () => {
    const { service, ventas, vehiculos } = crearServicio();
    await service.cerrar(
      {
        ...base,
        formasPago: [
          { tipo: 'EFECTIVO', monto: 4_000_000 },
          { tipo: 'FINANCIAMIENTO', monto: 5_000_000 },
        ],
      },
      vendedor,
    );
    expect(ventas.createFormaPago).toHaveBeenCalledTimes(2);
    expect(vehiculos.setEstado).toHaveBeenCalledWith('v1', 'VENDIDO', expect.anything());
  });

  it('los adicionales suman al total a pagar (y los de $0 son solo referencia)', async () => {
    const { service, ventas } = crearServicio();
    const costosAdicionales = [
      { descripcion: 'Transferencia e inscripción', monto: 350_000 },
      { descripcion: 'Mantención de regalo', monto: 0 },
    ];
    // Sin sumar el adicional: no cuadra.
    await expect(service.cerrar({ ...base, costosAdicionales }, vendedor)).rejects.toThrow(
      'deben sumar $9.350.000 (precio $9.000.000 + adicionales $350.000)',
    );
    // Precio + adicionales: cuadra; el precio final (base del margen) no cambia.
    await service.cerrar(
      {
        ...base,
        costosAdicionales,
        formasPago: [{ tipo: 'EFECTIVO', monto: 9_350_000 }],
      },
      vendedor,
    );
    expect(ventas.create).toHaveBeenCalledWith(
      expect.objectContaining({ precioVentaFinal: 9_000_000 }),
      expect.anything(),
    );
  });

  it('con reserva: los pagos cuadran contra precio − seña y la reserva se convierte', async () => {
    const reserva = { id: 'r1', folio: 2, cliente_id: 'c1', monto_reserva: '500000.00' };
    const { service, reservas, ventas } = crearServicio({
      vehiculo: { estado: 'RESERVADO' },
      reserva,
    });
    await service.cerrar(
      { ...base, reservaId: 'r1', formasPago: [{ tipo: 'TRANSFERENCIA', monto: 8_500_000 }] },
      vendedor,
    );
    expect(ventas.create).toHaveBeenCalledWith(
      expect.objectContaining({ reservaId: 'r1', precioVentaFinal: 9_000_000 }),
      expect.anything(),
    );
    expect(reservas.convertirEnVenta).toHaveBeenCalledWith('r1', expect.anything());
  });

  it('un vehículo con reserva activa exige concretarla', async () => {
    const reserva = { id: 'r1', folio: 2, cliente_id: 'c1', monto_reserva: '500000.00' };
    const { service } = crearServicio({ vehiculo: { estado: 'RESERVADO' }, reserva });
    await expect(service.cerrar(base, vendedor)).rejects.toThrow(ConflictException);
  });

  it('la reserva debe ser del mismo cliente', async () => {
    const reserva = { id: 'r1', folio: 2, cliente_id: 'otro', monto_reserva: '500000.00' };
    const { service } = crearServicio({ vehiculo: { estado: 'RESERVADO' }, reserva });
    await expect(
      service.cerrar(
        { ...base, reservaId: 'r1', formasPago: [{ tipo: 'EFECTIVO', monto: 8_500_000 }] },
        vendedor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  describe('concretando una cotización', () => {
    const cotizacion = {
      id: 'co1',
      folio: 7,
      automotora_id: 'a1',
      vehiculo_id: 'v1',
      cliente_id: 'c1',
      estado: 'VIGENTE',
    };

    it('la vincula a la venta y la deja CONCRETADA', async () => {
      const { service, ventas, cotizaciones } = crearServicio({ cotizacion });
      await service.cerrar({ ...base, cotizacionId: 'co1' }, vendedor);
      expect(ventas.create).toHaveBeenCalledWith(
        expect.objectContaining({ cotizacionId: 'co1' }),
        expect.anything(),
      );
      expect(cotizaciones.setEstado).toHaveBeenCalledWith('co1', 'CONCRETADA', expect.anything());
    });

    it('solo se concreta una cotización VIGENTE', async () => {
      const { service, ventas } = crearServicio({
        cotizacion: { ...cotizacion, estado: 'VENCIDA' },
      });
      await expect(service.cerrar({ ...base, cotizacionId: 'co1' }, vendedor)).rejects.toThrow(
        ConflictException,
      );
      expect(ventas.create).not.toHaveBeenCalled();
    });

    it('debe ser del mismo vehículo y cliente', async () => {
      const otroVehiculo = crearServicio({ cotizacion: { ...cotizacion, vehiculo_id: 'v2' } });
      await expect(
        otroVehiculo.service.cerrar({ ...base, cotizacionId: 'co1' }, vendedor),
      ).rejects.toThrow(BadRequestException);
      const otroCliente = crearServicio({ cotizacion: { ...cotizacion, cliente_id: 'c2' } });
      await expect(
        otroCliente.service.cerrar({ ...base, cotizacionId: 'co1' }, vendedor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('parte de pago: crea el vehículo recibido PENDIENTE_REVISION con su costo', async () => {
    const { service, vehiculos, ventas } = crearServicio();
    await service.cerrar(
      {
        ...base,
        formasPago: [
          { tipo: 'EFECTIVO', monto: 6_000_000 },
          {
            tipo: 'PARTE_PAGO',
            monto: 3_000_000,
            vehiculoRecibido: {
              patente: 'xy-12.34',
              marca: 'Kia',
              modelo: 'Rio',
              anio: 2015,
              kilometraje: 120000,
              color: 'Azul',
            },
          },
        ],
      },
      vendedor,
    );
    expect(vehiculos.create).toHaveBeenCalledWith(
      expect.objectContaining({
        patente: 'XY1234',
        origen: 'PARTE_PAGO',
        estado: 'PENDIENTE_REVISION',
        ventaOrigenId: 'venta1',
        costoAdquisicion: 3_000_000,
        combustible: 'OTRO',
      }),
      expect.anything(),
    );
    expect(ventas.createFormaPago).toHaveBeenCalledWith(
      'venta1',
      'PARTE_PAGO',
      3_000_000,
      'recibido1',
      expect.anything(),
    );
  });

  it('parte de pago sin datos del vehículo → 400', async () => {
    const { service } = crearServicio();
    await expect(
      service.cerrar({ ...base, formasPago: [{ tipo: 'PARTE_PAGO', monto: 9_000_000 }] }, vendedor),
    ).rejects.toThrow(BadRequestException);
  });

  describe('consignado bajo el precio mínimo', () => {
    const consignacion = { id: 'cons1', estado: 'ACTIVA', precio_minimo: '9500000.00' };

    it('el vendedor no puede cerrar', async () => {
      const { service } = crearServicio({ vehiculo: { origen: 'CONSIGNACION' }, consignacion });
      await expect(service.cerrar(base, vendedor)).rejects.toThrow(ForbiddenException);
    });

    it('un admin sí, y queda marcado en la auditoría; la consignación pasa a VENDIDA', async () => {
      const { service, comunes, consignaciones } = crearServicio({
        vehiculo: { origen: 'CONSIGNACION' },
        consignacion,
      });
      await service.cerrar(base, admin);
      expect(comunes.auditar).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'VENTA_CONFIRMADA',
        expect.anything(),
        null,
        expect.objectContaining({ bajoPrecioMinimo: true }),
      );
      expect(consignaciones.setEstado).toHaveBeenCalledWith('cons1', 'VENDIDA', expect.anything());
    });
  });
});

describe('VentasService.anular', () => {
  it('libera el vehículo, cancela la reserva con la seña retenida y no toca la parte de pago', async () => {
    const { service, ventas, vehiculos, reservas } = crearServicio();
    ventas.lockById.mockResolvedValue({
      id: 'venta1',
      folio: 4,
      estado: 'CONFIRMADA',
      vehiculo_id: 'v1',
      reserva_id: 'r1',
      sucursal_id: 's1',
    });
    await service.anular('venta1', 'Error en el RUT del comprador', admin);
    expect(ventas.anular).toHaveBeenCalledWith(
      'venta1',
      'Error en el RUT del comprador',
      'as',
      expect.anything(),
    );
    expect(vehiculos.setEstado).toHaveBeenCalledTimes(1);
    expect(vehiculos.setEstado).toHaveBeenCalledWith('v1', 'DISPONIBLE', expect.anything());
    expect(reservas.cancelar).toHaveBeenCalledWith(
      'r1',
      expect.stringContaining('venta N° 4'),
      true,
      'as',
      expect.anything(),
    );
  });

  it('la cotización que concretaba vuelve a VIGENTE si sigue en plazo', async () => {
    const { service, ventas, cotizaciones } = crearServicio({
      cotizacion: { id: 'co1', estado: 'CONCRETADA', fecha_vencimiento: '2999-12-31' },
    });
    ventas.lockById.mockResolvedValue({
      id: 'venta1',
      folio: 4,
      estado: 'CONFIRMADA',
      vehiculo_id: 'v1',
      reserva_id: null,
      cotizacion_id: 'co1',
      sucursal_id: 's1',
    });
    await service.anular('venta1', 'Cliente se arrepintió', admin);
    expect(cotizaciones.setEstado).toHaveBeenCalledWith('co1', 'VIGENTE', expect.anything());
  });

  it('no anula dos veces', async () => {
    const { service, ventas } = crearServicio();
    ventas.lockById.mockResolvedValue({ id: 'venta1', estado: 'ANULADA' });
    await expect(service.anular('venta1', 'x', admin)).rejects.toThrow(ConflictException);
  });
});
