import {
  calcularLiquidacion,
  porcentajeDeGanancia,
  porcentajeExacto,
} from '@vitriauto/shared-types';

// Ejemplo del negocio: el dueño acuerda $10.000.000, la automotora publica y
// vende en $11.000.000.
describe('calcularLiquidacion', () => {
  it('COMISION_VENTA: 5% sobre el precio final de venta', () => {
    expect(
      calcularLiquidacion(
        { tipoTrato: 'COMISION_VENTA', porcentajeComision: 5, montoNeto: null },
        11_000_000,
      ),
    ).toEqual({ precioVenta: 11_000_000, comision: 550_000, montoConsignante: 10_450_000 });
  });

  it('COMISION_VENTA redondea al peso', () => {
    const l = calcularLiquidacion(
      { tipoTrato: 'COMISION_VENTA', porcentajeComision: 7.5, montoNeto: null },
      9_999_999,
    );
    expect(l.comision).toBe(750_000);
  });

  it('PRECIO_NETO: el dueño recibe el neto y la automotora la diferencia', () => {
    expect(
      calcularLiquidacion(
        { tipoTrato: 'PRECIO_NETO', porcentajeComision: null, montoNeto: 10_000_000 },
        11_000_000,
      ),
    ).toEqual({ precioVenta: 11_000_000, comision: 1_000_000, montoConsignante: 10_000_000 });
  });

  it('PRECIO_NETO bajo el neto: el dueño recibe igual su neto (ganancia negativa)', () => {
    const l = calcularLiquidacion(
      { tipoTrato: 'PRECIO_NETO', porcentajeComision: null, montoNeto: 10_000_000 },
      9_800_000,
    );
    expect(l).toEqual({ precioVenta: 9_800_000, comision: -200_000, montoConsignante: 10_000_000 });
  });
});

describe('porcentajeExacto', () => {
  it('una comisión pactada en pesos se recupera exacta al peso', () => {
    for (const [ganancia, precio] of [
      [1_000_000, 11_000_000],
      [777_777, 19_990_000],
      [1_234_567, 98_765_432],
    ]) {
      const porcentajeComision = porcentajeExacto(ganancia, precio);
      const l = calcularLiquidacion(
        { tipoTrato: 'COMISION_VENTA', porcentajeComision, montoNeto: null },
        precio,
      );
      expect(l.comision).toBe(ganancia);
    }
  });
});

describe('porcentajeDeGanancia', () => {
  it('ganancia sobre el precio de venta, con 2 decimales', () => {
    expect(porcentajeDeGanancia(1_000_000, 11_000_000)).toBe(9.09);
    expect(porcentajeDeGanancia(550_000, 11_000_000)).toBe(5);
    expect(porcentajeDeGanancia(100, 0)).toBe(0);
  });
});
