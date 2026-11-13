// Simulador de crédito del sitio público. Sistema francés, cuota fija; solo
// referencial: no incluye seguros, gastos ni impuesto de timbres.

export const PLAZOS_CREDITO = [12, 24, 36, 48, 60] as const;
export const PIE_MAXIMO_CREDITO = 80; // % del precio
export const PLAZO_INICIAL_CREDITO = 36;

export interface SimulacionCredito {
  pie: number; // pesos
  montoFinanciado: number;
  cuota: number;
  costoTotal: number; // cuota × plazo
}

// `tasaMensual` en % mensual (1.5 = 1,5%); `piePorcentaje` en % del precio.
export function simularCredito(
  precio: number,
  piePorcentaje: number,
  plazo: number,
  tasaMensual: number,
): SimulacionCredito {
  const pie = Math.round((precio * piePorcentaje) / 100);
  const montoFinanciado = precio - pie;
  const i = tasaMensual / 100;
  const cuota = Math.round((montoFinanciado * i) / (1 - (1 + i) ** -plazo));
  return { pie, montoFinanciado, cuota, costoTotal: cuota * plazo };
}

// Plazos ofrecidos: múltiplos de 12 meses hasta el máximo de la automotora.
export const plazosHasta = (plazoMaximo: number): number[] =>
  PLAZOS_CREDITO.filter((p) => p <= plazoMaximo);
