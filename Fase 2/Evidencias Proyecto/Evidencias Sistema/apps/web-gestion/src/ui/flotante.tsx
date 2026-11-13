import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

// Panel flotante anclado a un control (listas desplegables, calendario).
// Se monta en <body> para que ni tablas ni modales lo recorten, se ubica bajo
// el control (o sobre él si no cabe) y se cierra al hacer clic fuera.
export function Flotante({
  ancla,
  abierto,
  onCerrar,
  children,
  anchoMinimo = 0,
  alinear = 'inicio',
  className,
}: {
  ancla: RefObject<HTMLElement | null>;
  abierto: boolean;
  onCerrar: () => void;
  children: ReactNode;
  anchoMinimo?: number;
  alinear?: 'inicio' | 'fin'; // 'fin': el borde derecho coincide con el del control
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; ancho: number; arriba: boolean }>();

  useLayoutEffect(() => {
    if (!abierto) return;
    const ubicar = () => {
      const a = ancla.current?.getBoundingClientRect();
      if (!a) return;
      const alto = panel.current?.offsetHeight ?? 280;
      const ancho = Math.max(a.width, anchoMinimo);
      const anchoReal = Math.max(ancho, panel.current?.offsetWidth ?? 0);
      const arriba = a.bottom + 6 + alto > window.innerHeight - 8 && a.top - 6 - alto > 8;
      const deseado = alinear === 'fin' ? a.right - anchoReal : a.left;
      const left = Math.min(Math.max(8, deseado), window.innerWidth - anchoReal - 8);
      setPos({ top: arriba ? a.top - 6 - alto : a.bottom + 6, left, ancho, arriba });
    };
    ubicar();
    // Segunda pasada: la altura real del panel ya está medida.
    const raf = requestAnimationFrame(ubicar);
    window.addEventListener('resize', ubicar);
    window.addEventListener('scroll', ubicar, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', ubicar);
      window.removeEventListener('scroll', ubicar, true);
    };
  }, [abierto, ancla, anchoMinimo, alinear]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !ancla.current?.contains(t)) onCerrar();
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto, ancla, onCerrar]);

  if (!abierto) return null;
  return createPortal(
    <div
      ref={panel}
      className={`fixed z-[70] rounded-xl bg-superficie shadow-flotante transition-[opacity,transform] duration-150 ease-(--ease-out) starting:scale-[0.97] starting:opacity-0 ${pos?.arriba ? 'origin-bottom' : 'origin-top'}${alinear === 'fin' ? '-right' : ''} ${className ?? ''}`}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        minWidth: pos?.ancho,
        visibility: pos ? 'visible' : 'hidden',
      }}
      // Los clics dentro no deben cerrar el modal que lo contiene.
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

// Cambia el valor de un control nativo como si lo hubiera hecho la persona:
// React (y react-hook-form) reciben su onChange normal.
export function emitirCambio(el: HTMLInputElement | HTMLSelectElement | null, valor: string) {
  if (!el) return;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set?.call(el, valor);
  el.dispatchEvent(
    new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
  );
}

// Avisa "salí del campo" al control oculto (validación al salir de cada campo).
export function emitirSalida(el: HTMLElement | null) {
  el?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

// Une varias refs (la del formulario y la propia) en una sola.
export function unirRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (nodo: T | null) => {
    for (const r of refs) {
      if (typeof r === 'function') r(nodo);
      else if (r) (r as React.RefObject<T | null>).current = nodo;
    }
  };
}
