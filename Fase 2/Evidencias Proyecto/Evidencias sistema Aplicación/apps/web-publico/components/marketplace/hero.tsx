'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

export interface DiapositivaHero {
  id: string;
  foto: string;
  titulo: string;
  detalle: string; // año y precio, ya formateados
}

const INTERVALO_MS = 6500;

// Hero de la portada: las fotos de lo último publicado, a pantalla completa y
// en rotación lenta. La leyenda de abajo a la derecha lleva al auto que se ve.
// Con movimiento reducido no rota: queda fija la primera foto.
export function HeroPortada({
  diapositivas,
  children,
}: {
  diapositivas: DiapositivaHero[];
  children: ReactNode;
}) {
  const [actual, setActual] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (diapositivas.length < 2 || pausado) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setActual((i) => (i + 1) % diapositivas.length), INTERVALO_MS);
    return () => clearTimeout(t);
  }, [actual, pausado, diapositivas.length]);

  const vigente = diapositivas[actual];

  return (
    <section className="mk-hero" aria-label="Portada">
      <div className="mk-hero-fotos" aria-hidden>
        {diapositivas.map((d, i) => (
          <img
            key={d.id}
            src={d.foto}
            alt=""
            data-activa={i === actual}
            fetchPriority={i === 0 ? 'high' : 'low'}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        ))}
      </div>
      <div className="mk-hero-velo" aria-hidden />
      {children}
      {vigente && (
        <div
          className="mk-hero-leyenda"
          onMouseEnter={() => setPausado(true)}
          onMouseLeave={() => setPausado(false)}
          onFocus={() => setPausado(true)}
          onBlur={() => setPausado(false)}
        >
          <Link href={`/vehiculos/${vigente.id}`} className="mk-hero-auto" key={vigente.id}>
            <span className="mk-hero-auto-titulo">{vigente.titulo}</span>
            <span className="mk-hero-auto-detalle num">{vigente.detalle}</span>
            <ArrowUpRight className="icono" aria-hidden />
          </Link>
          {diapositivas.length > 1 && (
            <div className="mk-hero-pasos" role="group" aria-label="Fotos destacadas">
              {diapositivas.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  aria-label={`Ver ${d.titulo}`}
                  aria-current={i === actual}
                  data-pausado={pausado}
                  onClick={() => setActual(i)}
                >
                  <span />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
