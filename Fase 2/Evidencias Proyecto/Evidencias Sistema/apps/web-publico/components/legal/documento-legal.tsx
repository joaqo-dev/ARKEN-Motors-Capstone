import Link from 'next/link';
import type { ReactNode } from 'react';
import { VIGENCIA } from '../../lib/legal';
import { vitrinaActual } from '../../lib/vitrina';
import { Cabecera } from '../cabecera';
import { Pie } from '../pie';

// Marco de una página legal (Términos, Privacidad). En el subdominio de una
// automotora no muestra cabecera ni pie del marketplace: solo vuelve a su
// vitrina.
export async function DocumentoLegal({
  titulo,
  bajada,
  secciones,
  children,
}: {
  titulo: string;
  bajada: ReactNode;
  secciones: { id: string; titulo: string }[];
  children: ReactNode;
}) {
  const vitrina = await vitrinaActual();
  return (
    <div className="mk vt mk-mercado">
      {!vitrina && <Cabecera />}
      <main className="vt-legal">
        {vitrina && (
          <Link href="/" className="vt-legal-volver">
            ← Volver a la automotora
          </Link>
        )}
        <header className="vt-legal-cabecera">
          <p className="vt-rotulo">Vigente desde el {VIGENCIA}</p>
          <h1>{titulo}</h1>
          <p className="vt-legal-bajada">{bajada}</p>
        </header>
        <div className="vt-legal-cuerpo">
          <nav className="vt-legal-indice" aria-label="Contenido">
            <p>Contenido</p>
            <ol>
              {secciones.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.titulo}</a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="vt-legal-texto">{children}</article>
        </div>
      </main>
      {!vitrina && <Pie />}
    </div>
  );
}

export function Seccion({
  id,
  titulo,
  children,
}: {
  id: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`}>{titulo}</h2>
      {children}
    </section>
  );
}
