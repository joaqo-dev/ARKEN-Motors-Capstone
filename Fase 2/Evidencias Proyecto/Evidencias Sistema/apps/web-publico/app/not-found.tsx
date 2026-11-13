import Link from 'next/link';
import { Cabecera } from '../components/cabecera';
import { Pie } from '../components/pie';
import { vitrinaActual } from '../lib/vitrina';

// Página no encontrada. En el subdominio de una automotora no muestra la
// cabecera ni el pie del marketplace: solo vuelve a su vitrina.
export default async function NoEncontrado() {
  const vitrina = await vitrinaActual();
  return (
    <div className="mk vt mk-mercado">
      {!vitrina && <Cabecera />}
      <main className="vt-vacio">
        <p className="vt-rotulo">Error 404</p>
        <h1>No encontramos lo que buscas</h1>
        <p>El vehículo ya no está disponible o la dirección no existe.</p>
        <Link href={vitrina ? '/#vehiculos' : '/buscar'} className="boton boton-claro">
          Ver vehículos disponibles
        </Link>
      </main>
      {!vitrina && <Pie />}
    </div>
  );
}
