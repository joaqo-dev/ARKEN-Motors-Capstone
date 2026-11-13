import { BadRequestException } from '@nestjs/common';
import { comisionBajoMinimo, comisionMaxima, type TipoTrato } from '@vitriauto/shared-types';
import { formatearCLP } from '../../common/fechas';

export interface CondicionesTratoCompletas {
  tipoTrato: TipoTrato;
  porcentajeComision: number | null;
  montoNeto: number | null;
  precioMinimo: number;
}

// Normaliza las condiciones del trato antes de guardarlas:
// - COMISION_VENTA: exige porcentaje (0–100] y precio mínimo; sin monto neto.
// - PRECIO_NETO: exige monto neto; el precio mínimo ES el neto (vender por
//   menos deja a la automotora con pérdida); sin porcentaje.
export function normalizarTrato(
  c: {
    tipoTrato: TipoTrato;
    porcentajeComision?: number | null;
    montoNeto?: number | null;
    precioMinimo?: number | null;
  },
  precioPublicacion?: number,
): CondicionesTratoCompletas {
  if (c.tipoTrato === 'PRECIO_NETO') {
    if (!c.montoNeto || c.montoNeto <= 0)
      throw new BadRequestException('Indica el monto neto que recibirá el dueño');
    return {
      tipoTrato: 'PRECIO_NETO',
      porcentajeComision: null,
      montoNeto: c.montoNeto,
      precioMinimo: c.montoNeto,
    };
  }
  if (!c.porcentajeComision || c.porcentajeComision <= 0 || c.porcentajeComision > 100)
    throw new BadRequestException('La comisión debe ser un porcentaje entre 0 y 100');
  if (!c.precioMinimo || c.precioMinimo <= 0)
    throw new BadRequestException('Indica el precio mínimo aceptado por el dueño');
  // La comisión no puede dejar al dueño bajo su mínimo al precio de venta.
  if (precioPublicacion) {
    if (precioPublicacion < c.precioMinimo)
      throw new BadRequestException(
        'El precio de venta es menor al precio mínimo aceptado por el dueño',
      );
    if (comisionBajoMinimo(c.porcentajeComision, precioPublicacion, c.precioMinimo)) {
      const max = comisionMaxima(precioPublicacion, c.precioMinimo);
      throw new BadRequestException(
        `La comisión deja al dueño bajo su precio mínimo: el máximo es ${formatearCLP(max.monto)} (${max.porcentaje.toLocaleString('es-CL', { maximumFractionDigits: 2 })}%)`,
      );
    }
  }
  return {
    tipoTrato: 'COMISION_VENTA',
    porcentajeComision: c.porcentajeComision,
    montoNeto: null,
    precioMinimo: c.precioMinimo,
  };
}
