import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { DashboardService, mesesEntre, sugerenciaEstancado } from './dashboard.service';

const ag: UsuarioAutenticado = {
  id: 'ag',
  automotoraId: 'a1',
  sucursalId: null,
  rol: 'ADMIN_GENERAL',
};
const adminA: UsuarioAutenticado = {
  id: 'as',
  automotoraId: 'a1',
  sucursalId: 'sA',
  rol: 'ADMIN_SUCURSAL',
};
const vendedorA: UsuarioAutenticado = {
  id: 'va',
  automotoraId: 'a1',
  sucursalId: 'sA',
  rol: 'VENDEDOR',
};

function crearServicio() {
  const repo = {
    sucursales: jest.fn().mockResolvedValue([
      { id: 'sA', nombre: 'Casa Matriz', activa: true },
      { id: 'sB', nombre: 'Norte', activa: true },
    ]),
    inventario: jest.fn().mockResolvedValue([
      {
        sucursal_id: 'sA',
        stock_propio: '2',
        stock_consignado: '1',
        publicados: '2',
        reservados: '1',
        estancados: '0',
        costo_inventario: '14000000',
        ganancia_propios: '3000000',
        ganancia_consignados: '960000',
      },
      {
        sucursal_id: 'sB',
        stock_propio: '1',
        stock_consignado: '0',
        publicados: '1',
        reservados: '0',
        estancados: '1',
        costo_inventario: '5000000',
        ganancia_propios: '1000000',
        ganancia_consignados: '0',
      },
    ]),
    reservasPorVencer: jest
      .fn()
      .mockResolvedValue([{ sucursal_id: 'sA', cantidad: '1', monto: '300000' }]),
    ventas: jest
      .fn()
      .mockResolvedValue([
        { sucursal_id: 'sB', cantidad: '1', ingresos: '8000000', margen: '1500000' },
      ]),
    senasRetenidas: jest
      .fn()
      .mockResolvedValue([{ sucursal_id: 'sA', cantidad: '1', monto: '500000' }]),
    gastos: jest.fn().mockResolvedValue([]),
    // Analítica
    estancados: jest.fn().mockResolvedValue([]),
    porMarcaModelo: jest.fn().mockResolvedValue([]),
    ventasPorMes: jest
      .fn()
      .mockResolvedValue([{ mes: '2026-02', cantidad: '2', monto: '20000000', margen: '3000000' }]),
    senasPorMes: jest
      .fn()
      .mockResolvedValue([{ mes: '2026-03', cantidad: '1', monto: '500000', margen: '0' }]),
    gastosOperacionalesPorMes: jest
      .fn()
      .mockResolvedValue([{ mes: '2026-02', cantidad: '1', monto: '1000000', margen: '0' }]),
    resumenVentas: jest.fn().mockResolvedValue({
      cantidad: '2',
      ingresos: '20000000',
      margen: '3000000',
      dias_promedio: '32.5',
      descuento_promedio: '0.0321',
    }),
    embudo: jest.fn().mockResolvedValue({
      cotizaciones: '8',
      cotizaciones_concretadas: '2',
      cotizaciones_vencidas: '3',
      reservas: '2',
      reservas_convertidas: '1',
      reservas_canceladas: '1',
      ventas: '2',
      ventas_desde_cotizacion: '2',
      ventas_desde_reserva: '1',
    }),
    antiguedad: jest
      .fn()
      .mockResolvedValue([
        { tramo: '46-90', cantidad: '2', capital: '9000000', valor_publicado: '12000000' },
      ]),
    inventarioPor: jest.fn().mockResolvedValue([]),
    ventasPor: jest.fn().mockResolvedValue([
      {
        clave: 'Valentina',
        cantidad: '2',
        monto: '20000000',
        margen: '3000000',
        dias_promedio: '30',
      },
    ]),
    formasPago: jest.fn().mockResolvedValue([]),
    gastosPorCategoria: jest.fn().mockResolvedValue([]),
  };
  return { service: new DashboardService(repo as never), repo };
}

describe('DashboardService', () => {
  it('ADMIN_GENERAL sin filtro: consolidado = suma de sucursales, con desglose', async () => {
    const { service, repo } = crearServicio();
    const r = await service.dashboard({}, ag);
    expect(repo.inventario.mock.calls[0][0]).toEqual({ automotoraId: 'a1', sucursalIds: null });
    expect(r.alcance.tipo).toBe('CONSOLIDADO');
    expect(r.indicadores).toMatchObject({
      stock: { propio: 3, consignado: 1, total: 4 },
      gananciasProyectadas: 4_960_000,
      ventasPeriodo: { cantidad: 1, ingresos: 8_000_000 },
      senasRetenidas: 500_000,
      utilidadPeriodo: 2_000_000,
    });
    expect(r.porSucursal).toHaveLength(2);
  });

  it('utilidad neta: resta los gastos operacionales; los de vehículo son informativos y los generales solo van al consolidado', async () => {
    const { service, repo } = crearServicio();
    repo.gastos.mockResolvedValue([
      { sucursal_id: 'sA', tipo: 'OPERACIONAL', cantidad: '1', monto: '400000' },
      { sucursal_id: 'sB', tipo: 'VEHICULO', cantidad: '2', monto: '250000' },
      { sucursal_id: null, tipo: 'OPERACIONAL', cantidad: '1', monto: '100000' },
    ]);
    const r = await service.dashboard({}, ag);
    // Bruta 2.000.000 (margen 1.500.000 + señas 500.000) − operacionales 500.000.
    expect(r.indicadores).toMatchObject({
      utilidadPeriodo: 2_000_000,
      gastosOperacionalesPeriodo: 500_000,
      gastosGeneralesPeriodo: 100_000,
      gastosVehiculosPeriodo: 250_000,
      utilidadNetaPeriodo: 1_500_000,
    });
    // Por sucursal, sin los generales: sA = 500.000 señas − 400.000 arriendo.
    const sA = r.porSucursal!.find((p) => p.sucursal.id === 'sA')!;
    expect(sA.indicadores).toMatchObject({
      gastosOperacionalesPeriodo: 400_000,
      utilidadNetaPeriodo: 100_000,
    });
    const sB = r.porSucursal!.find((p) => p.sucursal.id === 'sB')!;
    expect(sB.indicadores).toMatchObject({
      gastosVehiculosPeriodo: 250_000,
      utilidadNetaPeriodo: 1_500_000,
    });
  });

  it('ADMIN_GENERAL filtra por varias sucursales', async () => {
    const { service, repo } = crearServicio();
    const r = await service.dashboard({ sucursalIds: ['sA', 'sB'] }, ag);
    expect(repo.ventas.mock.calls[0][0]).toEqual({ automotoraId: 'a1', sucursalIds: ['sA', 'sB'] });
    expect(r.alcance.tipo).toBe('SUCURSALES');
  });

  it('rechaza una sucursal que no es de la automotora', async () => {
    const { service } = crearServicio();
    await expect(service.dashboard({ sucursalIds: ['otra'] }, ag)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('ADMIN_SUCURSAL queda fijo en su sucursal y no puede pedir otra', async () => {
    const { service, repo } = crearServicio();
    const r = await service.dashboard({}, adminA);
    expect(repo.inventario.mock.calls[0][0]).toEqual({ automotoraId: 'a1', sucursalIds: ['sA'] });
    expect(r.porSucursal).toBeUndefined();
    await expect(service.dashboard({ sucursalIds: ['sB'] }, adminA)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('el VENDEDOR no ve costos, márgenes ni gastos', async () => {
    const { service } = crearServicio();
    const r = await service.dashboard({}, vendedorA);
    for (const campo of [
      'costoInventario',
      'gananciasProyectadas',
      'margenRealPeriodo',
      'utilidadPeriodo',
      'utilidadNetaPeriodo',
      'gastosOperacionalesPeriodo',
      'gastosVehiculosPeriodo',
      'gastosGeneralesPeriodo',
    ]) {
      expect(r.indicadores).not.toHaveProperty(campo);
    }
    expect(r.indicadores).toHaveProperty('ventasPeriodo');
  });

  it('período por defecto: mes actual; rechaza un rango invertido', async () => {
    const { service } = crearServicio();
    const r = await service.dashboard({}, ag);
    expect(r.periodo.desde).toMatch(/^\d{4}-\d{2}-01$/);
    await expect(
      service.dashboard({ desde: '2026-10-10', hasta: '2026-10-01' }, ag),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('sugerenciaEstancado', () => {
  it('prioriza fotos, luego preparación, luego antigüedad', () => {
    expect(sugerenciaEstancado({ dias: 50, fotos: 0, estado: 'DISPONIBLE' })).toMatch(/fotos/);
    expect(sugerenciaEstancado({ dias: 50, fotos: 2, estado: 'EN_PREPARACION' })).toMatch(
      /preparación/,
    );
    expect(sugerenciaEstancado({ dias: 120, fotos: 2, estado: 'DISPONIBLE' })).toMatch(/rebaja/);
    expect(sugerenciaEstancado({ dias: 50, fotos: 2, estado: 'DISPONIBLE' })).toMatch(/precio/);
  });
});

describe('DashboardService.analitica', () => {
  const periodo = { desde: '2026-01-15', hasta: '2026-03-10' };

  it('arma la tendencia con todos los meses y la utilidad neta de cada uno', async () => {
    const { service } = crearServicio();
    const r = await service.analitica(periodo, ag);
    expect(r.tendencia).toEqual([
      {
        mes: '2026-01',
        ventas: 0,
        ingresos: 0,
        margen: 0,
        gastosOperacionales: 0,
        utilidadNeta: 0,
      },
      {
        mes: '2026-02',
        ventas: 2,
        ingresos: 20_000_000,
        margen: 3_000_000,
        gastosOperacionales: 1_000_000,
        utilidadNeta: 2_000_000,
      },
      // La seña retenida es ingreso y utilidad del mes en que se canceló la reserva.
      {
        mes: '2026-03',
        ventas: 0,
        ingresos: 500_000,
        margen: 0,
        gastosOperacionales: 0,
        utilidadNeta: 500_000,
      },
    ]);
    expect(r.resumen).toMatchObject({
      ventas: 2,
      ticketPromedio: 10_000_000,
      diasPromedioVenta: 32.5,
      descuentoPromedio: 0.0321,
      tasaCierreCotizaciones: 0.25,
      margenPromedio: 1_500_000,
    });
    expect(r.inventario.antiguedad).toHaveLength(5);
    expect(r.ventasPorVendedor).toHaveLength(1);
  });

  it('el Vendedor no ve márgenes, capital, gastos ni el ranking de vendedores', async () => {
    const { service } = crearServicio();
    const r = await service.analitica(periodo, vendedorA);
    expect(r.tendencia[1]).toEqual({ mes: '2026-02', ventas: 2, ingresos: 20_000_000 });
    expect(r.resumen).not.toHaveProperty('margen');
    expect(r.inventario.antiguedad[3]).not.toHaveProperty('capital');
    expect(r.ventasPorOrigen[0]).not.toHaveProperty('margen');
    expect(r).not.toHaveProperty('ventasPorVendedor');
    expect(r).not.toHaveProperty('gastosPorCategoria');
  });

  it('rechaza períodos de más de 10 años', async () => {
    const { service } = crearServicio();
    await expect(
      service.analitica({ desde: '2000-01-01', hasta: '2026-01-01' }, ag),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('mesesEntre', () => {
  it('incluye ambos extremos y cruza el año', () => {
    expect(mesesEntre('2025-11-20', '2026-02-01')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });
});
