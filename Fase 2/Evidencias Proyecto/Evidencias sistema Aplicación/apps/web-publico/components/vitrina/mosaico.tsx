'use client';

import { Images } from 'lucide-react';
import { useState } from 'react';
import { Lightbox } from '../lightbox';

// Mosaico de fotos de la ficha en la vitrina: la portada grande a la izquierda
// y hasta cuatro más en una rejilla de 2×2. Cada foto abre el visor en ella;
// "Ver galería" lo abre desde la primera. Con menos fotos, el mosaico se
// reacomoda (data-cantidad) para no dejar huecos.
export function Mosaico({ fotos, alt }: { fotos: string[]; alt: string }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  if (fotos.length === 0) return <div className="vt-mosaico vacio">Sin fotos</div>;
  const visibles = fotos.slice(0, 5);
  return (
    <div className="vt-mosaico" data-cantidad={visibles.length}>
      {visibles.map((f, i) => (
        <button
          key={f}
          type="button"
          className="vt-mosaico-foto"
          onClick={() => setAbierta(i)}
          aria-label={`Ver foto ${i + 1} de ${fotos.length} en grande`}
        >
          {/* Todo el mosaico está a la vista al abrir: sin carga diferida. La portada
              es el contenido principal (LCP): va con prioridad alta. */}
          <img src={f} alt={i === 0 ? alt : ''} fetchPriority={i === 0 ? 'high' : 'auto'} />
        </button>
      ))}
      <button type="button" className="vt-mosaico-ver" onClick={() => setAbierta(0)}>
        <Images className="icono" aria-hidden />
        Ver galería
        {fotos.length > 1 && <span className="num">{fotos.length}</span>}
      </button>
      {abierta !== null && (
        <Lightbox fotos={fotos} inicial={abierta} titulo={alt} onCerrar={() => setAbierta(null)} />
      )}
    </div>
  );
}
