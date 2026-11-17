import { useRef, type PointerEvent as EventoPuntero } from 'react';

// Cierre por arrastre (hojas inferiores y cajones), según Apple "Designing Fluid
// Interfaces": seguimiento 1:1 desde donde se tomó, resistencia progresiva al
// pasarse del borde, y decisión al soltar según la posición *proyectada* por la
// velocidad (no solo la distancia recorrida).

const DESACELERACION = 0.998;
const UMBRAL_INICIO = 6; // px antes de asumir que es un arrastre (histéresis)

// Distancia que recorrería el elemento si siguiera con la inercia del dedo
// (velocidad en px/ms; misma función de decaimiento que el scroll de iOS).
const proyectar = (velocidad: number) => (velocidad * DESACELERACION) / (1 - DESACELERACION);

// Resistencia tipo "rubber band": cuanto más se pasa, menos sigue al dedo.
const elastico = (exceso: number, dimension: number, c = 0.55) =>
  (exceso * dimension * c) / (dimension + c * Math.abs(exceso));

export function useArrastreCierre<T extends HTMLElement>({
  eje,
  onCerrar,
  activo = true,
}: {
  eje: 'y' | 'x-'; // y: hacia abajo cierra; x-: hacia la izquierda cierra
  onCerrar: () => void;
  activo?: boolean;
}) {
  const ref = useRef<T>(null);
  const estado = useRef<{
    id: number;
    origen: number;
    arrastrando: boolean;
    historial: { v: number; t: number }[];
  } | null>(null);

  const posicion = (e: EventoPuntero) => (eje === 'y' ? e.clientY : -e.clientX);
  const limpiar = () => {
    if (!ref.current) return;
    ref.current.style.transform = '';
    ref.current.style.transition = '';
  };
  const aplicar = (d: number, transicion?: string) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = transicion ?? 'none';
    el.style.transform = eje === 'y' ? `translate3d(0, ${d}px, 0)` : `translate3d(${-d}px, 0, 0)`;
  };

  const onPointerDown = (e: EventoPuntero<T>) => {
    if (!activo || e.button !== 0) return;
    // No robar el gesto a controles ni a contenido que se desplaza.
    const objetivo = e.target as HTMLElement;
    if (objetivo.closest('input, textarea, select, [data-sin-arrastre]')) return;
    estado.current = {
      id: e.pointerId,
      origen: posicion(e),
      arrastrando: false,
      historial: [{ v: 0, t: e.timeStamp }],
    };
  };

  const onPointerMove = (e: EventoPuntero<T>) => {
    const s = estado.current;
    if (!s || s.id !== e.pointerId) return;
    const d = posicion(e) - s.origen;
    if (!s.arrastrando) {
      if (Math.abs(d) < UMBRAL_INICIO) return;
      // Solo si el contenido está arriba del todo, para no pelear con el scroll.
      if (eje === 'y' && (ref.current?.querySelector('[data-desplazable]')?.scrollTop ?? 0) > 0)
        return (estado.current = null);
      s.arrastrando = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const dimension =
      eje === 'y' ? (ref.current?.offsetHeight ?? 1) : (ref.current?.offsetWidth ?? 1);
    aplicar(d >= 0 ? d : elastico(d, dimension));
    s.historial = [...s.historial.slice(-4), { v: d, t: e.timeStamp }];
  };

  const soltar = (e: EventoPuntero<T>) => {
    const s = estado.current;
    estado.current = null;
    if (!s?.arrastrando || s.id !== e.pointerId) return;
    const d = posicion(e) - s.origen;
    const [a, b] = [s.historial[0], s.historial[s.historial.length - 1]];
    const velocidad = b.t > a.t ? (b.v - a.v) / (b.t - a.t) : 0; // px/ms
    const dimension =
      eje === 'y' ? (ref.current?.offsetHeight ?? 1) : (ref.current?.offsetWidth ?? 1);
    const proyectado = d + proyectar(velocidad);
    if (proyectado > dimension * 0.5 && velocidad >= 0) {
      aplicar(dimension, 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)');
      window.setTimeout(() => {
        onCerrar();
        limpiar();
      }, 210);
    } else {
      // Vuelve a su lugar desde donde está, sin rebote (amortiguamiento crítico).
      aplicar(0, 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)');
      window.setTimeout(limpiar, 330);
    }
  };

  return {
    ref,
    manejadores: { onPointerDown, onPointerMove, onPointerUp: soltar, onPointerCancel: soltar },
  };
}
