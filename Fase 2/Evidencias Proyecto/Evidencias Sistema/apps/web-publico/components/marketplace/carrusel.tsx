'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Fila horizontal con desplazamiento por tramos (scroll-snap) y flechas que se
// desactivan en los extremos. Sin JS, la fila igual se desplaza con el dedo o
// la rueda: las flechas solo agregan el paso por pantalla.
export function Carrusel({
  titulo,
  idTitulo,
  children,
  deUnoEnUno = false,
}: {
  titulo: ReactNode;
  idTitulo: string;
  children: ReactNode;
  deUnoEnUno?: boolean; // las flechas avanzan una tarjeta, no una pantalla
}) {
  const pista = useRef<HTMLUListElement>(null);
  const [inicio, setInicio] = useState(true);
  const [fin, setFin] = useState(false);

  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    const medir = () => {
      setInicio(el.scrollLeft <= 4);
      setFin(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    };
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    window.addEventListener('resize', medir);
    return () => {
      el.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
    };
  }, []);

  const mover = (sentido: 1 | -1) => {
    const el = pista.current;
    if (!el) return;
    // Paso: una tarjeta (su ancho más el espacio entre tarjetas) o casi una pantalla.
    const item = el.querySelector('li');
    const paso =
      deUnoEnUno && item
        ? item.getBoundingClientRect().width + (parseFloat(getComputedStyle(el).columnGap) || 0)
        : el.clientWidth * 0.8;
    el.scrollBy({ left: sentido * paso, behavior: 'smooth' });
  };

  return (
    <>
      <div className="mk-encabezado mk-encabezado-fila">
        {titulo}
        <div className="mk-flechas">
          <button type="button" onClick={() => mover(-1)} disabled={inicio} aria-label="Anteriores">
            <ArrowLeft className="icono" aria-hidden />
          </button>
          <button type="button" onClick={() => mover(1)} disabled={fin} aria-label="Siguientes">
            <ArrowRight className="icono" aria-hidden />
          </button>
        </div>
      </div>
      <ul className="mk-carrusel" ref={pista} aria-labelledby={idTitulo}>
        {children}
      </ul>
    </>
  );
}
