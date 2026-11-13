import { VERSION_TERMINOS } from '@vitriauto/shared-types';

// Datos del titular de Vitriauto para los Términos y la Política de
// privacidad. Se configuran por entorno; mientras falten, la página lo indica
// entre corchetes.
const o = (valor: string | undefined, faltante: string) => valor?.trim() || `[${faltante}]`;

export const TITULAR = {
  razonSocial: o(process.env.LEGAL_RAZON_SOCIAL, 'Razón social del titular de Vitriauto'),
  rut: o(process.env.LEGAL_RUT, 'RUT del titular'),
  domicilio: o(process.env.LEGAL_DOMICILIO, 'Domicilio legal'),
  correo: o(process.env.LEGAL_CORREO, 'Correo de contacto para privacidad'),
  ciudad: o(process.env.LEGAL_CIUDAD, 'Ciudad de los tribunales competentes'),
};

// "2026-11-06" → "6 de noviembre de 2026"
export const VIGENCIA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${VERSION_TERMINOS}T00:00:00Z`));
