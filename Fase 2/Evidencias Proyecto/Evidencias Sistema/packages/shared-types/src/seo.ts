// SEO de la vitrina: título y descripción con que la automotora aparece en
// Google. Lo usan el sitio público y la vista previa de Configuración.

// "Providencia", "Providencia y Viña del Mar", "A, B y C"
export function unirComunas(comunas: string[]): string {
  const unicas = [...new Set(comunas)];
  if (unicas.length <= 1) return unicas[0] ?? '';
  return `${unicas.slice(0, -1).join(', ')} y ${unicas[unicas.length - 1]}`;
}

export function tituloSeoAutomotora(nombre: string, comunas: string[]): string {
  const donde = unirComunas(comunas);
  return donde ? `${nombre} | Automotora en ${donde}` : `${nombre} | Automotora`;
}

// Google muestra unos 160 caracteres de la descripción.
export const LARGO_DESCRIPCION_SEO = 160;

// La descripción propia (recortada a lo que muestra Google) o, si no hay, una
// armada con sus sucursales.
export function descripcionSeoAutomotora(
  nombre: string,
  descripcion: string | null,
  comunas: string[],
): string {
  const propia = descripcion?.replace(/\s+/g, ' ').trim();
  if (propia) return recortar(propia, LARGO_DESCRIPCION_SEO);
  const donde = unirComunas(comunas);
  const sucursales = new Set(comunas).size > 1 ? 'varias sucursales' : 'atención directa';
  return `${nombre}, automotora${donde ? ` en ${donde}` : ''} con ${sucursales}. Conoce nuestros autos, horarios y cómo contactarnos.`;
}

function recortar(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto;
  const corte = texto.lastIndexOf(' ', maximo - 1);
  return `${texto.slice(0, corte > 0 ? corte : maximo - 1).replace(/[,.;:]$/, '')}…`;
}
