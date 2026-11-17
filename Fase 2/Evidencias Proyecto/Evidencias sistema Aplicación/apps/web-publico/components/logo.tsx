import { urlArchivo } from '../lib/config';

// Logo de la automotora; si no tiene, sus iniciales sobre blanco.
export function LogoAutomotora({
  nombre,
  logoUrl,
  tamano,
}: {
  nombre: string;
  logoUrl: string | null;
  tamano: 'chico' | 'grande';
}) {
  const logo = urlArchivo(logoUrl);
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span className={`logo-marca logo-${tamano}`}>
      {logo ? <img src={logo} alt={`Logo de ${nombre}`} /> : <span aria-hidden>{iniciales}</span>}
    </span>
  );
}
