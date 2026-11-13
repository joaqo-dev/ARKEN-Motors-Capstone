import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { cx } from './componentes';

// Visor de fotos a pantalla completa. Usa <dialog> nativo (capa superior, foco
// atrapado y Escape). Teclado: ← → Inicio Fin; en móvil, deslizar cambia de foto.
export function Lightbox({
  fotos,
  inicial,
  titulo,
  onCerrar,
}: {
  fotos: { url: string; alt?: string }[];
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
    // Sin d.close() al desmontar: en desarrollo React monta los efectos dos veces
    // y ese cierre dispararía onClose. Al quitarse del DOM, el <dialog> sale de la
    // capa superior por sí solo.
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
      const f = fotos[((i % total) + total) % total];
      if (f) new Image().src = f.url;
    }
  }, [actual, fotos, total]);

  // La miniatura activa siempre a la vista.
  useEffect(() => {
    document
      .getElementById(`lightbox-miniatura-${actual}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [actual]);

  const teclado = (e: React.KeyboardEvent) => {
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

  const foto = fotos[actual];
  return (
    <dialog
      ref={dialogo}
      aria-label={`Fotos de ${titulo}`}
      onClose={onCerrar}
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onKeyDown={teclado}
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
      className="lightbox fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-white backdrop:bg-black/90 backdrop:backdrop-blur-sm"
    >
      <div
        className="flex h-full flex-col"
        onClick={(e) => e.target === e.currentTarget && onCerrar()}
      >
        <header className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <p className="min-w-0 truncate text-sm text-white/80">
            <span className="font-medium text-white">{titulo}</span>
            <span className="ml-2 tabular-nums" aria-live="polite">
              {actual + 1} / {total}
            </span>
          </p>
          <button
            type="button"
            onClick={onCerrar}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 active:scale-95"
            aria-label="Cerrar"
            autoFocus
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div
          className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2 sm:px-20"
          onClick={(e) => e.target === e.currentTarget && onCerrar()}
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          {foto && (
            <img
              key={foto.url}
              src={foto.url}
              alt={foto.alt ?? `${titulo}, foto ${actual + 1} de ${total}`}
              draggable={false}
              className="lightbox-foto max-h-full max-w-full select-none rounded-lg object-contain"
              data-direccion={direccion}
              style={{
                transform: arrastre ? `translateX(${arrastre}px)` : undefined,
                transition: arrastre ? 'none' : undefined,
              }}
            />
          )}
          {total > 1 && (
            <>
              <BotonFlecha lado="izquierda" onClick={() => ir(actual - 1)} />
              <BotonFlecha lado="derecha" onClick={() => ir(actual + 1)} />
            </>
          )}
        </div>

        {total > 1 && (
          <nav
            aria-label="Miniaturas"
            className="flex gap-2 overflow-x-auto px-4 pb-4 pt-3 [scrollbar-width:none] sm:justify-center sm:px-6"
          >
            {fotos.map((f, i) => (
              <button
                key={f.url}
                id={`lightbox-miniatura-${i}`}
                type="button"
                onClick={() => ir(i)}
                aria-label={`Foto ${i + 1}`}
                aria-current={i === actual}
                className={cx(
                  'h-14 w-20 shrink-0 overflow-hidden rounded-xl transition-[opacity,box-shadow] duration-150',
                  i === actual ? 'opacity-100 ring-2 ring-white' : 'opacity-45 hover:opacity-80',
                )}
              >
                <img src={f.url} alt="" className="size-full object-cover" draggable={false} />
              </button>
            ))}
          </nav>
        )}
      </div>
    </dialog>
  );
}

function BotonFlecha({ lado, onClick }: { lado: 'izquierda' | 'derecha'; onClick: () => void }) {
  const Icono = lado === 'izquierda' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === 'izquierda' ? 'Foto anterior' : 'Foto siguiente'}
      className={cx(
        'absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:scale-95 sm:flex',
        lado === 'izquierda' ? 'left-4' : 'right-4',
      )}
    >
      <Icono className="size-6" aria-hidden />
    </button>
  );
}
