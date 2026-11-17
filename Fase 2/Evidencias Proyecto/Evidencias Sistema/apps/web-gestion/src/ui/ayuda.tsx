import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useAyudas } from '../lib/ayudas';

// Burbuja de ayuda única para todo el panel. Cualquier elemento con
// `data-ayuda="…"` (los botones la reciben con la prop `ayuda`) la muestra al
// pasar el mouse (tras una breve pausa, para no aparecer al cruzar la pantalla)
// o al enfocarlo con el teclado. Un solo oyente delegado: no envuelve botones.
const ESPERA_MS = 450;
const MARGEN = 8;

interface Estado {
  texto: string;
  x: number; // centro horizontal del botón
  y: number; // borde donde se apoya la burbuja
  abajo: boolean; // sin espacio arriba: se muestra debajo
}

export function BurbujaAyuda() {
  const { activas } = useAyudas();
  const id = useId();
  const [estado, setEstado] = useState<Estado | null>(null);
  const burbuja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activas) {
      setEstado(null);
      return;
    }
    let reloj: number | undefined;
    let objetivo: HTMLElement | null = null;

    const ocultar = () => {
      window.clearTimeout(reloj);
      if (objetivo?.getAttribute('aria-describedby') === id) {
        objetivo.removeAttribute('aria-describedby');
      }
      objetivo = null;
      setEstado(null);
    };
    const mostrar = (el: HTMLElement) => {
      const texto = el.dataset.ayuda;
      if (!texto) return;
      const r = el.getBoundingClientRect();
      const abajo = r.top < 72;
      setEstado({ texto, x: r.left + r.width / 2, y: abajo ? r.bottom : r.top, abajo });
      // Los lectores de pantalla leen la ayuda como descripción del botón.
      if (!el.hasAttribute('aria-describedby')) el.setAttribute('aria-describedby', id);
    };
    const programar = (el: HTMLElement, inmediato: boolean) => {
      if (el === objetivo) return;
      ocultar();
      objetivo = el;
      reloj = window.setTimeout(() => mostrar(el), inmediato ? 0 : ESPERA_MS);
    };

    const alEntrar = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return; // en pantallas táctiles no hay hover
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ayuda]');
      if (el) programar(el, false);
      else if (objetivo) ocultar();
    };
    const alEnfocar = (e: FocusEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ayuda]');
      // Solo con teclado (no al hacer clic con el mouse).
      if (el?.matches(':focus-visible')) programar(el, true);
    };
    const alSalir = (e: Event) => {
      const hacia = (e as PointerEvent).relatedTarget as Node | null;
      if (objetivo && hacia && objetivo.contains(hacia)) return;
      ocultar();
    };
    const alTecla = (e: KeyboardEvent) => e.key === 'Escape' && ocultar();

    document.addEventListener('pointerover', alEntrar);
    document.addEventListener('focusin', alEnfocar);
    document.addEventListener('pointerout', alSalir);
    document.addEventListener('focusout', ocultar);
    document.addEventListener('pointerdown', ocultar);
    document.addEventListener('keydown', alTecla);
    window.addEventListener('scroll', ocultar, true);
    return () => {
      ocultar();
      document.removeEventListener('pointerover', alEntrar);
      document.removeEventListener('focusin', alEnfocar);
      document.removeEventListener('pointerout', alSalir);
      document.removeEventListener('focusout', ocultar);
      document.removeEventListener('pointerdown', ocultar);
      document.removeEventListener('keydown', alTecla);
      window.removeEventListener('scroll', ocultar, true);
    };
  }, [activas, id]);

  // La burbuja nunca se sale de la pantalla por los lados: se mide ya dibujada
  // (antes del pintado) y se corre lo justo.
  useLayoutEffect(() => {
    const b = burbuja.current;
    if (!b || !estado) return;
    const ancho = b.offsetWidth;
    const min = MARGEN + ancho / 2;
    const max = window.innerWidth - MARGEN - ancho / 2;
    b.style.left = `${Math.min(Math.max(estado.x, min), max)}px`;
  }, [estado]);

  if (!estado) return null;
  // El contenedor exterior posiciona (con transform); el interior anima la
  // entrada, que también usa transform y si no pisaría el centrado.
  return (
    <div
      ref={burbuja}
      className="pointer-events-none fixed z-[60] w-max max-w-64"
      style={{
        left: estado.x,
        top: estado.abajo ? estado.y + MARGEN : estado.y - MARGEN,
        transform: `translate(-50%, ${estado.abajo ? '0' : '-100%'})`,
      }}
    >
      <div
        id={id}
        role="tooltip"
        className="rounded-xl bg-slate-900 px-3 py-2 text-xs leading-snug text-invertido shadow-flotante ring-1 ring-white/20 animate-aparecer"
      >
        {estado.texto}
      </div>
    </div>
  );
}
