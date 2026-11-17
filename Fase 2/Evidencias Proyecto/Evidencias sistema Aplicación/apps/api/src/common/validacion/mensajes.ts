import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

// Errores de validación en español y uno por campo. Los mensajes propios de cada
// DTO se respetan; los que class-validator genera en inglés se traducen.

// Nombre legible de los campos que no se entienden con solo separar el camelCase.
const ETIQUETAS: Record<string, string> = {
  anio: 'año',
  categoria: 'categoría',
  comuna: 'comuna',
  costoAdquisicion: 'costo de adquisición',
  costosAdicionales: 'adicionales',
  descripcion: 'descripción',
  direccion: 'dirección',
  email: 'email',
  estadoGeneral: 'estado general',
  fechaFin: 'fecha de término',
  fechaIngreso: 'fecha de ingreso',
  fechaPrimeraInscripcion: 'fecha de primera inscripción',
  fechaVencimiento: 'fecha de vencimiento',
  financiamientoTasaMensual: 'tasa mensual',
  formasPago: 'formas de pago',
  horarioAtencion: 'horario de atención',
  montoNeto: 'monto neto',
  montoReserva: 'monto de la reserva',
  nuevaFechaFin: 'nueva fecha de término',
  nuevaFechaVencimiento: 'nueva fecha de vencimiento',
  ofertaMonto: 'oferta',
  porcentajeComision: 'comisión',
  precioCotizado: 'precio cotizado',
  precioMinimo: 'precio mínimo',
  precioVenta: 'precio de venta',
  precioVentaFinal: 'precio de venta final',
  region: 'región',
  rol: 'rol',
  sucursalId: 'sucursal',
  telefono: 'teléfono',
  tipoTrato: 'tipo de trato',
  traccion: 'tracción',
  transmision: 'transmisión',
  vehiculoRecibido: 'vehículo recibido',
  version: 'versión',
  vigenciaDias: 'vigencia',
};

const etiqueta = (propiedad: string) =>
  ETIQUETAS[propiedad] ??
  propiedad
    .replace(/Id$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

// Plantillas en inglés de class-validator → español. `c` es el nombre del campo.
const TRADUCCIONES: [RegExp, (c: string, m: RegExpMatchArray) => string][] = [
  [/should not be empty$/, (c) => `${c}: es obligatorio`],
  [
    /must be shorter than or equal to (\d+) characters$/,
    (c, m) => `${c}: máximo ${m[1]} caracteres`,
  ],
  [
    /must be longer than or equal to (\d+) characters$/,
    (c, m) => `${c}: mínimo ${m[1]} caracteres`,
  ],
  [/must not be less than (-?[\d.]+)$/, (c, m) => `${c}: debe ser al menos ${m[1]}`],
  [/must not be greater than (-?[\d.]+)$/, (c, m) => `${c}: no puede ser mayor que ${m[1]}`],
  [/must be an integer number$/, (c) => `${c}: debe ser un número entero`],
  [/must be a number conforming/, (c) => `${c}: debe ser un número`],
  [/must be a string$/, (c) => `${c}: debe ser texto`],
  [/must be an email$/, (c) => `${c}: ingresa un email válido`],
  [/must be a UUID$/, (c) => `${c}: no es válido`],
  [/must be a valid ISO 8601 date string$/, (c) => `${c}: debe ser una fecha válida (AAAA-MM-DD)`],
  [/must be a boolean value$/, (c) => `${c}: debe ser verdadero o falso`],
  [/must be one of the following values/, (c) => `${c}: el valor no es válido`],
  [/must contain at least (\d+) elements$/, (c, m) => `${c}: debe tener al menos ${m[1]}`],
  [/must be an array$/, (c) => `${c}: debe ser una lista`],
];

// Si el DTO trae su propio mensaje, ese manda; si no, la primera traducción que calce.
function traducir(mensaje: string, campo: string, propiedad: string): string {
  if (/^property .+ should not exist$/.test(mensaje)) {
    return `El campo "${propiedad}" no está permitido`;
  }
  for (const [patron, armar] of TRADUCCIONES) {
    const m = mensaje.match(patron);
    if (m) return mayuscula(armar(campo, m));
  }
  // Mensaje en inglés sin plantilla conocida: uno genérico en vez del original.
  return /^[\w.[\]]+ (must|should) /.test(mensaje) ? mayuscula(`${campo}: no es válido`) : mensaje;
}

// Qué restricción se informa cuando un campo falla en varias (la más útil primero).
const PRIORIDAD = [
  'whitelistValidation',
  'isDefined',
  'isNotEmpty',
  'isString',
  'isInt',
  'isNumber',
];

function aplanar(errores: ValidationError[], ruta: string[] = []): string[] {
  return errores.flatMap((e) => {
    const camino = [...ruta, e.property];
    const propios: string[] = [];
    if (e.constraints) {
      const claves = Object.keys(e.constraints);
      const clave = PRIORIDAD.find((p) => claves.includes(p)) ?? claves[0]!;
      // En listas (formas de pago, adicionales) se indica la fila: "formas de pago, fila 2".
      const filas = camino.filter((p) => /^\d+$/.test(p));
      const padre = camino.slice(0, -1).find((p) => !/^\d+$/.test(p));
      const contexto =
        padre && filas.length ? ` (${etiqueta(padre)}, fila ${Number(filas.at(-1)) + 1})` : '';
      propios.push(
        traducir(e.constraints[clave]!, etiqueta(e.property) + contexto, camino.join('.')),
      );
    }
    return [...propios, ...aplanar(e.children ?? [], camino)];
  });
}

export function erroresDeValidacion(errores: ValidationError[]) {
  return new BadRequestException([...new Set(aplanar(errores))]);
}
