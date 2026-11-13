import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Cabecera } from '../../components/cabecera';
import { Filtros } from '../../components/filtros';
import { Listado } from '../../components/listado';
import { Pie } from '../../components/pie';
import { api, paramsBusqueda, type Busqueda } from '../../lib/api';
import { urlArchivo } from '../../lib/config';

const miles = new Intl.NumberFormat('es-CL');

// Resultados de búsqueda: no se indexan (el SEO se enfoca en las automotoras).
export const metadata: Metadata = {
  title: 'Buscar vehículos',
  robots: { index: false, follow: true },
};

// Búsqueda del marketplace: todo el inventario publicado, con filtros
// dinámicos, orden y paginación. Acceso anónimo.
export default async function BuscarPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const busqueda = await searchParams;
  const [resultado, filtros, recientes] = await Promise.all([
    api.buscar(paramsBusqueda(busqueda)),
    api.filtros(paramsBusqueda({}, { marca: busqueda.marca, region: busqueda.region })),
    // La foto de la franja: la del último auto publicado (no cambia al filtrar).
    api.buscar(paramsBusqueda({ orden: 'recientes' })),
  ]);
  // Una foto distinta a la del hero de la portada: el segundo auto publicado con foto.
  const conFoto = (recientes?.items ?? []).filter((v) => v.fotoPortada && v.categoria !== 'MOTO');
  const foto = urlArchivo((conFoto[1] ?? conFoto[0])?.fotoPortada ?? null);
  const total = recientes?.total ?? 0;

  return (
    <div className="mk vt mk-mercado">
      <div className="mk-franja">
        {foto && <img src={foto} alt="" />}
        <Cabecera activa="buscar" sobreImagen />
        <div className="mk-franja-contenido">
          <h1>Vehículos disponibles</h1>
          {total > 0 && (
            <p className="num">
              {miles.format(total)} publicados por automotoras de todo Chile, con contacto directo.
            </p>
          )}
        </div>
      </div>
      <main className="vt-seccion vt-inventario vt-busqueda">
        <div className="busqueda">
          {filtros && (
            <Suspense>
              <Filtros filtros={filtros} conUbicacion conSucursal={false} />
            </Suspense>
          )}
          {resultado ? (
            <Listado resultado={resultado} busqueda={busqueda} ruta="/buscar" />
          ) : (
            <p className="vacio">Revisa los filtros: algún valor no es válido.</p>
          )}
        </div>
      </main>
      <Pie />
    </div>
  );
}
