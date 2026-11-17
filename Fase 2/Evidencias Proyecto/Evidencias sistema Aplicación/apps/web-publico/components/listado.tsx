import { ArrowLeft, ArrowRight, Cog, Fuel, Gauge, MapPin } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import type { Busqueda, ResultadoBusqueda } from '../lib/api';
import { urlArchivo } from '../lib/config';
import { etiqueta, kilometros, precio } from '../lib/formato';
import { Orden } from './filtros';

// Tarjeta de vehículo (marketplace y vitrinas): foto sobre gris claro, la
// categoría como sello, cuatro datos con ícono en 2×2 y el precio junto a
// "Ver detalle". Sin identidad de la automotora (Módulo 2).
export function Tarjeta({
  v,
  orden = 0,
}: {
  v: ResultadoBusqueda['items'][number];
  orden?: number;
}) {
  const foto = urlArchivo(v.fotoPortada);
  const datos: [string, string, typeof Gauge][] = [
    ['Kilometraje', kilometros(v.kilometraje), Gauge],
    ['Transmisión', etiqueta(v.transmision), Cog],
    ['Combustible', etiqueta(v.combustible), Fuel],
    ['Ubicación', v.ubicacion.comuna, MapPin],
  ];
  return (
    <Link
      href={`/vehiculos/${v.id}`}
      className="vt-tarjeta"
      style={{ '--orden': Math.min(orden, 8) } as React.CSSProperties}
    >
      <div className="vt-tarjeta-foto">
        {foto ? (
          <img src={foto} alt={`${v.marca} ${v.modelo}`} loading="lazy" />
        ) : (
          <span>Sin foto</span>
        )}
        <span className="vt-sello">{etiqueta(v.categoria)}</span>
      </div>
      <div className="vt-tarjeta-cuerpo">
        <h3>
          <span className="num">{v.anio}</span> {v.marca} {v.modelo}
        </h3>
        {/* Sin versión, la línea queda vacía: todas las tarjetas alinean sus datos. */}
        <p className="vt-tarjeta-version" aria-hidden={v.version ? undefined : true}>
          {v.version ?? '\u00a0'}
        </p>
        {/* Cuadrícula de 2×2: el ícono hace de rótulo (el nombre queda para lectores de pantalla) */}
        <dl className="vt-datos">
          {datos.map(([k, valor, Icono]) => (
            <div key={k}>
              <dt>
                <Icono className="icono" aria-hidden />
                <span className="sr-only">{k}</span>
              </dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
        <div className="vt-tarjeta-pie">
          <p className="precio">{precio(v.precio)}</p>
          <span className="vt-ver">Ver detalle</span>
        </div>
      </div>
    </Link>
  );
}

function hrefPagina(ruta: string, busqueda: Busqueda, pagina: number) {
  const params = new URLSearchParams(
    Object.entries(busqueda).filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
  params.set('pagina', String(pagina));
  return `${ruta}?${params}`;
}

export function Listado({
  resultado,
  busqueda,
  ruta,
}: {
  resultado: ResultadoBusqueda;
  busqueda: Busqueda;
  ruta: string;
}) {
  return (
    <section className="listado" aria-label="Resultados">
      <div className="listado-encabezado">
        <p>
          <strong>{resultado.total}</strong> vehículo{resultado.total === 1 ? '' : 's'} disponible
          {resultado.total === 1 ? '' : 's'}
        </p>
        <Suspense>
          <Orden />
        </Suspense>
      </div>
      {resultado.items.length === 0 ? (
        <div className="vacio">
          <h2>No hay vehículos con estos filtros</h2>
          <p>Prueba quitando alguno de los filtros para ver más opciones.</p>
          <Link href={ruta} className="boton boton-contorno boton-chico" scroll={false}>
            Quitar filtros
          </Link>
        </div>
      ) : (
        <div className="vt-grilla">
          {resultado.items.map((v, i) => (
            <Tarjeta key={v.id} v={v} orden={i} />
          ))}
        </div>
      )}
      {resultado.paginas > 1 && (
        <nav className="paginacion" aria-label="Páginas">
          {resultado.pagina > 1 && (
            <Link href={hrefPagina(ruta, busqueda, resultado.pagina - 1)}>
              <ArrowLeft className="icono" aria-hidden />
              Anterior
            </Link>
          )}
          <span className="num">
            Página {resultado.pagina} de {resultado.paginas}
          </span>
          {resultado.pagina < resultado.paginas && (
            <Link href={hrefPagina(ruta, busqueda, resultado.pagina + 1)}>
              Siguiente
              <ArrowRight className="icono" aria-hidden />
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
