'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

// Visor de fotos a pantalla completa. Usa <dialog> nativo (capa superior, foco
// atrapado y Escape). Teclado: ← → Inicio Fin; en móvil, deslizar cambia de foto.
export function Lightbox({
  fotos,
  inicial,
  titulo,
  onCerrar,
}: {
  fotos: string[];
  inicial: number;
  titulo: string;
  onCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [actual, setActual] = useState(inicial);
  const [arrastre, setArrastre] = useState(0);
  const inicio = useRef<{ x: number; t: number } | null>(null);
  const total = fotos.length;
  // Dirección del último cambio: la foto nueva entra desde ese lado.
  const [direccion, setDireccion] = useState<'adelante' | 'atras'>('adelante');
  const ir = (i: number) => {
    setDireccion(i < actual ? 'atras' : 'adelante');
    setActual(((i % total) + total) % total);
  };

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    // Sin d.close() al desmontar: en desarrollo React monta los efectos dos
    // veces y ese cierre dispararía onClose (el visor se cerraría solo). Al
    // quitarse del DOM, el <dialog> sale de la capa superior por sí mismo.
    if (!d.open) d.showModal();
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  // Precarga las vecinas para que avanzar sea instantáneo.
  useEffect(() => {
    for (const i of [actual - 1, actual + 1]) {
      const url = fotos[((i % total) + total) % total];
      if (url) new Image().src = url;
    }
  }, [actual, fotos, total]);

  useEffect(() => {
    document
      .getElementById(`lightbox-miniatura-${actual}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [actual]);

  const teclado = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') ir(actual + 1);
    else if (e.key === 'ArrowLeft') ir(actual - 1);
    else if (e.key === 'Home') ir(0);
    else if (e.key === 'End') ir(total - 1);
    else return;
    e.preventDefault();
  };

  // Deslizar: la foto sigue al dedo y, al soltar, avanza si se movió lo
  // suficiente o si fue un gesto rápido.
  const alPresionar = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || total < 2) return;
    inicio.current = { x: e.clientX, t: performance.now() };
  };
  const alMover = (e: PointerEvent) => {
    if (inicio.current) setArrastre(e.clientX - inicio.current.x);
  };
  const alSoltar = (e: PointerEvent) => {
    if (!inicio.current) return;
    const dx = e.clientX - inicio.current.x;
    const velocidad = Math.abs(dx) / (performance.now() - inicio.current.t);
    if (Math.abs(dx) > 60 || velocidad > 0.4) ir(actual + (dx < 0 ? 1 : -1));
    inicio.current = null;
    setArrastre(0);
  };
  const fuera = (e: React.MouseEvent) => e.target === e.currentTarget && onCerrar();

  return (
    <dialog
      ref={dialogo}
      className="lightbox"
      aria-label={`Fotos de ${titulo}`}
      onClose={onCerrar}
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onKeyDown={teclado}
      onClick={fuera}
    >
      <div className="lightbox-cuerpo" onClick={fuera}>
        <header className="lightbox-cabecera">
          <p>
            <strong>{titulo}</strong>
            <span className="num" aria-live="polite">
              {actual + 1} / {total}
            </span>
          </p>
          <button
            type="button"
            className="lightbox-boton"
            onClick={onCerrar}
            aria-label="Cerrar"
            autoFocus
          >
            <X className="icono" aria-hidden />
          </button>
        </header>

        <div
          className="lightbox-escena"
          onClick={fuera}
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          <img
            key={fotos[actual]}
            className="lightbox-foto"
            data-direccion={direccion}
            src={fotos[actual]}
            alt={`${titulo}, foto ${actual + 1} de ${total}`}
            draggable={false}
            style={{
              transform: arrastre ? `translateX(${arrastre}px)` : undefined,
              transition: arrastre ? 'none' : undefined,
            }}
          />
          {total > 1 && (
            <>
              <button
                type="button"
                className="lightbox-boton lightbox-flecha izquierda"
                onClick={() => ir(actual - 1)}
                aria-label="Foto anterior"
              >
                <ChevronLeft className="icono" aria-hidden />
              </button>
              <button
                type="button"
                className="lightbox-boton lightbox-flecha derecha"
                onClick={() => ir(actual + 1)}
                aria-label="Foto siguiente"
              >
                <ChevronRight className="icono" aria-hidden />
              </button>
            </>
          )}
        </div>

        {total > 1 && (
          <nav className="lightbox-miniaturas" aria-label="Miniaturas">
            {fotos.map((url, i) => (
              <button
                key={url}
                id={`lightbox-miniatura-${i}`}
                type="button"
                onClick={() => ir(i)}
                aria-label={`Foto ${i + 1}`}
                aria-current={i === actual}
              >
                <img src={url} alt="" draggable={false} />
              </button>
            ))}
          </nav>
        )}
      </div>
    </dialog>
  );
}
