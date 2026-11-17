// Fotos de ejemplo: Wikimedia Commons, licencias libres (autor y licencia de
// cada una en fotos/CREDITOS.md). Vite las copia al build con hash.
const archivos = import.meta.glob<string>('./fotos/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

// URLs de las fotos de un modelo ("sportage" -> sportage-1.jpg, sportage-2.jpg…).
export function fotosDe(clave: string): string[] {
  return Object.keys(archivos)
    .filter((ruta) => ruta.startsWith(`./fotos/${clave}-`))
    .sort()
    .map((ruta) => archivos[ruta]!);
}
