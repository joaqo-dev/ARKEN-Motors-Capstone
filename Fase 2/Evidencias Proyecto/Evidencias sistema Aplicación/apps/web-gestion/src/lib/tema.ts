import { useSyncExternalStore } from 'react';

// Tema del panel: claro, oscuro o el del sistema operativo. Se guarda por
// navegador; index.html lo aplica antes del primer pintado para evitar destellos.
export type Tema = 'claro' | 'oscuro' | 'sistema';
const CLAVE = 'panel.tema';
const oscuroDelSistema = () => window.matchMedia('(prefers-color-scheme: dark)');

function leer(): Tema {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'claro' || t === 'oscuro' ? t : 'sistema';
  } catch {
    return 'sistema';
  }
}

let actual: Tema = leer();
const oyentes = new Set<() => void>();

function aplicar() {
  const oscuro = actual === 'oscuro' || (actual === 'sistema' && oscuroDelSistema().matches);
  const raiz = document.documentElement;
  // Sin transiciones durante el cambio: todo cambia de una vez, sin destellos.
  raiz.classList.add('cambiando-tema');
  raiz.classList.toggle('dark', oscuro);
  requestAnimationFrame(() => requestAnimationFrame(() => raiz.classList.remove('cambiando-tema')));
}

// En "sistema" se sigue en vivo el cambio del sistema operativo.
oscuroDelSistema().addEventListener('change', () => actual === 'sistema' && aplicar());

export function setTema(t: Tema) {
  actual = t;
  try {
    if (t === 'sistema') localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, t);
  } catch {
    /* sin almacenamiento: el tema dura la sesión */
  }
  // Fundido corto entre tema claro y oscuro (View Transitions) en vez de un
  // salto brusco de brillo; donde no hay soporte, el cambio es instantáneo.
  const cambiar = () => {
    aplicar();
    oyentes.forEach((o) => o());
  };
  if (document.startViewTransition) document.startViewTransition(cambiar);
  else cambiar();
}

export function useTema() {
  const tema = useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => actual,
  );
  return { tema, setTema };
}
