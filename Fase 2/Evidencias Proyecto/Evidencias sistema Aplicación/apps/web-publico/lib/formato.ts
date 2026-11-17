const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});
const numero = new Intl.NumberFormat('es-CL');

export const precio = (valor: number) => clp.format(valor);
export const kilometros = (valor: number) => `${numero.format(valor)} km`;
const porcentaje = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
export const tasaTexto = (tasaMensual: number) => `Tasa ${porcentaje.format(tasaMensual)}% mensual`;

const ETIQUETAS: Record<string, string> = {
  SUV: 'SUV',
  SEDAN: 'Sedán',
  HATCHBACK: 'Hatchback',
  CAMIONETA: 'Camioneta',
  CAMION: 'Camión',
  MOTO: 'Moto',
  MANUAL: 'Manual',
  AUTOMATICA: 'Automática',
  BENCINA: 'Bencina',
  DIESEL: 'Diésel',
  HIBRIDO: 'Híbrido',
  ELECTRICO: 'Eléctrico',
  GAS: 'Gas',
  X4X2: '4x2',
  X4X4: '4x4',
  AWD: 'AWD',
  OTRO: 'Otro',
};

export const etiqueta = (valor: string) => ETIQUETAS[valor] ?? valor;
