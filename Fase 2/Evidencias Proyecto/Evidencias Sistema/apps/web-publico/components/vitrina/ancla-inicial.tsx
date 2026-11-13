'use client';

import { useEffect } from 'react';

// Al llegar a la vitrina con un ancla (p. ej. /?marca=Toyota#vehiculos), baja a
// esa sección. El navegador no lo hace solo porque la página llega en
// streaming, después de leer el ancla.
export function AnclaInicial() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return null;
}
