import type { TipoTrato } from './vehiculos';

export interface Liquidacion {
  precioVenta: number;
  comision: number; // lo que gana la automotora (negativo si se vendió bajo el neto)
  montoConsignante: number; // lo que recibe el dueño del vehículo
}

export interface CondicionesTrato {
  tipoTrato: TipoTrato;
  porcentajeComision: number | null; // COMISION_VENTA
  montoNeto: number | null; // PRECIO_NETO
}

// Liquidación de una consignación (Módulo 9), sin descuento de gastos. Montos en
// CLP redondeados al peso.
// - COMISION_VENTA: la automotora cobra el % sobre el precio final de venta.
// - PRECIO_NETO: el dueño recibe el neto garantizado; la automotora, la diferencia.
export function calcularLiquidacion(t: CondicionesTrato, precioVenta: number): Liquidacion {
  if (t.tipoTrato === 'PRECIO_NETO') {
    const neto = t.montoNeto ?? 0;
    return { precioVenta, comision: precioVenta - neto, montoConsignante: neto };
  }
  const comision = Math.round((precioVenta * (t.porcentajeComision ?? 0)) / 100);
  return { precioVenta, comision, montoConsignante: precioVenta - comision };
}

// Con comisión sobre la venta, lo que recibe el dueño al precio de venta
// no puede quedar bajo su precio mínimo aceptado. Máxima comisión posible:
export function comisionMaxima(precioPublicacion: number, precioMinimo: number) {
  const monto = Math.max(0, precioPublicacion - precioMinimo);
  return { monto, porcentaje: precioPublicacion > 0 ? (monto / precioPublicacion) * 100 : 0 };
}

// true si la comisión deja al dueño bajo su mínimo (al precio de venta).
export function comisionBajoMinimo(
  porcentajeComision: number,
  precioPublicacion: number,
  precioMinimo: number,
) {
  const { montoConsignante } = calcularLiquidacion(
    { tipoTrato: 'COMISION_VENTA', porcentajeComision, montoNeto: null },
    precioPublicacion,
  );
  return montoConsignante < precioMinimo;
}

// % que representa una ganancia sobre un precio, con 2 decimales (para mostrar).
export function porcentajeDeGanancia(ganancia: number, precio: number) {
  return precio > 0 ? Math.round((ganancia / precio) * 10_000) / 100 : 0;
}

// % a guardar cuando la comisión se pacta en pesos: 6 decimales, suficientes
// para que el monto se recupere exacto al peso (ver calcularLiquidacion).
export function porcentajeExacto(ganancia: number, precio: number) {
  return precio > 0 ? Math.round((ganancia / precio) * 100_000_000) / 1_000_000 : 0;
}
