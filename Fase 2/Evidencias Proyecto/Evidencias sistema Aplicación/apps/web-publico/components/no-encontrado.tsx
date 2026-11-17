import Link from 'next/link';
import { vitrinaActual } from '../lib/vitrina';
import { Cabecera } from './cabecera';
import { Pie } from './pie';

// Página no encontrada. En el subdominio de una automotora no muestra la
// cabecera ni el pie del marketplace: solo vuelve a su vitrina.
export async function NoEncontrado({ texto }: { texto: string }) {
  const vitrina = await vitrinaActual();
  return (
    <div className="mk vt mk-mercado">
      {!vitrina && <Cabecera />}
      <main className="vt-vacio">
        <p className="vt-rotulo">Error 404</p>
        <h1>No encontramos lo que buscas</h1>
        <p>{texto}</p>
        <Link href={vitrina ? '/#vehiculos' : '/buscar'} className="boton boton-claro">
          Ver vehículos disponibles
        </Link>
      </main>
      {!vitrina && <Pie />}
    </div>
  );
}
