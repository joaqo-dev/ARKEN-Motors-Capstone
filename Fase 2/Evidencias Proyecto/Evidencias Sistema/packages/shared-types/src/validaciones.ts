// Reglas de validación compartidas entre backend y frontend.

// Subdominio: minúsculas, dígitos y guiones; sin guion al inicio ni al final (DNS).
export const SUBDOMINIO_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

// Subdominios usados por la propia plataforma o que se prestan a confusión.
export const SUBDOMINIOS_RESERVADOS: readonly string[] = [
  'app',
  'api',
  'www',
  'admin',
  'mail',
  'static',
  'assets',
  'cdn',
  'soporte',
  'ayuda',
];

export function esSubdominioValido(subdominio: string): boolean {
  return SUBDOMINIO_REGEX.test(subdominio) && !SUBDOMINIOS_RESERVADOS.includes(subdominio);
}

// Fortaleza mínima de contraseña: 8+ caracteres, al menos una letra y un dígito.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export function esPasswordValida(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}

// Normaliza un RUT chileno a "12345678-K" (sin puntos, DV en mayúscula).
export function normalizarRut(rut: string): string {
  const limpio = rut.replace(/[.\s]/g, '').replace(/-/g, '').toUpperCase();
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

// Valida el dígito verificador (módulo 11) de un RUT chileno, con o sin puntos/guion.
export function esRutValido(rut: string): boolean {
  const limpio = rut.replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(limpio)) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  const dvEsperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === dvEsperado;
}

// Celular chileno para WhatsApp: '+569XXXXXXXX'. Acepta espacios, guiones y
// omitir el '+56' (ej. '9 1234 5678').
export function normalizarWhatsapp(valor: string): string {
  const digitos = valor.replace(/[^\d]/g, '');
  if (digitos.length === 9) return `+56${digitos}`;
  return `+${digitos}`;
}

export const WHATSAPP_REGEX = /^\+569\d{8}$/;

export function esWhatsappValido(valor: string): boolean {
  return WHATSAPP_REGEX.test(normalizarWhatsapp(valor));
}

// Marcas que se escriben como sigla (todo en mayúsculas).
const SIGLAS_MARCA = new Set([
  'BMW',
  'BYD',
  'BAIC',
  'DFSK',
  'DS',
  'FAW',
  'GAC',
  'GMC',
  'GWM',
  'JAC',
  'JMC',
  'KGM',
  'MG',
  'RAM',
  'SEAT',
]);

// Normaliza marca y modelo ("toyota HILUX" = "Toyota Hilux"): cada palabra o
// parte separada por guion con mayúscula inicial. Van en mayúsculas las que
// llevan dígitos ("CX-5", "RAV4"), las siglas conocidas ("BMW") y las partes
// de 2 a 4 letras sin vocales ("CB 190R", "XTZ 250", "YZF-R3").
const SIGLA_SIN_VOCALES = /^[b-df-hj-np-tv-z]{2,4}$/i;

export function normalizarNombreVehiculo(texto: string): string {
  return texto
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((palabra) => {
      const mayus = palabra.toLocaleUpperCase('es-CL');
      if (/\d/.test(palabra) || SIGLAS_MARCA.has(mayus)) return mayus;
      return palabra
        .split('-')
        .map((p) =>
          SIGLA_SIN_VOCALES.test(p)
            ? p.toLocaleUpperCase('es-CL')
            : p.charAt(0).toLocaleUpperCase('es-CL') + p.slice(1).toLocaleLowerCase('es-CL'),
        )
        .join('-');
    })
    .join(' ');
}

// Teléfono chileno para mostrar: "+56 9 1234 5678" (celular) o
// "+56 2 2233 4455" (fijo). Acepta el número con o sin +56 y espacios; si no
// calza con el formato, lo devuelve tal cual.
export function formatearTelefono(telefono: string): string {
  let digitos = telefono.replace(/\D/g, '');
  if (digitos.length === 9) digitos = `56${digitos}`;
  if (digitos.length !== 11 || !digitos.startsWith('56')) return telefono.trim();
  return `+${digitos.slice(0, 2)} ${digitos.slice(2, 3)} ${digitos.slice(3, 7)} ${digitos.slice(7)}`;
}

// RUT para mostrar o mientras se escribe: "12.345.678-5". Acepta puntos y
// guion opcionales y texto parcial (el último carácter es siempre el dígito
// verificador). Se guarda con normalizarRut.
export function formatearRut(rut: string): string {
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  // La K solo puede ser el dígito verificador.
  const valido = limpio.replace(/K(?=.)/g, '').slice(0, 9);
  if (valido.length < 2) return valido;
  const cuerpo = valido.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${valido.slice(-1)}`;
}
