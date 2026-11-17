'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Navegación fija de la vitrina: se esconde al bajar (deja ver los autos) y
// vuelve apenas se sube un poco. Arriba de todo es transparente sobre el hero;
// apenas hay scroll toma fondo nocturno para leerse sobre cualquier sección.
// Escribe atributos en el DOM (sin estado de React): el scroll no re-renderiza.

const TOLERANCIA = 6; // px: ignora el temblor de un trackpad
const ALTO = 76; // px: alto de la barra (--v-nav-alto)

export function NavDesplazable({ children }: { children: ReactNode }) {
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    let ultimo = window.scrollY;

    // El navegador ya emite scroll a lo más una vez por cuadro: se procesa al
    // tiro (solo cambia dos atributos), sin esperar otro cuadro.
    const alScroll = () => {
      const y = Math.max(0, window.scrollY);
      el.toggleAttribute('data-fondo', y > 4);
      const delta = y - ultimo;
      if (Math.abs(delta) < TOLERANCIA) return;
      // Nunca se esconde mientras tenga el foco del teclado ni en la parte alta.
      const conFoco = el.contains(document.activeElement);
      el.toggleAttribute('data-oculta', delta > 0 && y > ALTO && !conFoco);
      ultimo = y;
    };
    // Al tabular hacia la barra escondida, vuelve a aparecer.
    const alFoco = () => el.removeAttribute('data-oculta');

    alScroll();
    window.addEventListener('scroll', alScroll, { passive: true });
    el.addEventListener('focusin', alFoco);
    return () => {
      window.removeEventListener('scroll', alScroll);
      el.removeEventListener('focusin', alFoco);
    };
  }, []);

  return (
    <nav ref={nav} className="v-nav" aria-label="Secciones">
      {children}
    </nav>
  );
}
