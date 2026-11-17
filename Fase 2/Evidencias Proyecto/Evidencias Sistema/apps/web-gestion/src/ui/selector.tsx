import { Check, ChevronsUpDown } from 'lucide-react';
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from 'react';
import { emitirCambio, emitirSalida, Flotante, unirRefs } from './flotante';

export interface OpcionLista {
  valor: string;
  texto: string;
  deshabilitada?: boolean;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// Lista desplegable accesible (patrón "select-only combobox" de WAI-ARIA):
// el foco queda en el botón y la opción activa se anuncia con
// aria-activedescendant. Teclado: flechas, Inicio/Fin, Enter/Espacio, Escape,
// Tab y búsqueda escribiendo las primeras letras.
export function ListaDesplegable({
  opciones,
  valor,
  onElegir,
  onSalir,
  gatillo,
  claseGatillo,
  etiqueta,
  deshabilitada,
  anchoMinimo = 180,
  id,
}: {
  opciones: OpcionLista[];
  valor: string;
  onElegir: (valor: string) => void;
  onSalir?: () => void;
  gatillo?: (seleccionada: OpcionLista | undefined, abierto: boolean) => ReactNode;
  claseGatillo?: string;
  etiqueta?: string;
  deshabilitada?: boolean;
  anchoMinimo?: number;
  id?: string;
}) {
  const base = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const busqueda = useRef({ texto: '', hasta: 0 });
  const indiceActual = Math.max(
    0,
    opciones.findIndex((o) => o.valor === valor),
  );
  const seleccionada = opciones.find((o) => o.valor === valor) ?? opciones[0];
  // Sin <label> ni etiqueta explícita, el botón se nombra con la opción elegida
  // (como hacía el <select> nativo en los filtros).
  const [enEtiqueta, setEnEtiqueta] = useState(true);
  useLayoutEffect(() => setEnEtiqueta(!!boton.current?.closest('label')), []);

  const abrir = () => {
    if (deshabilitada) return;
    setActiva(indiceActual);
    setAbierto(true);
  };
  const cerrar = useCallback(
    (devolverFoco = true) => {
      setAbierto(false);
      if (devolverFoco) boton.current?.focus();
      onSalir?.();
    },
    [onSalir],
  );
  const elegir = (i: number) => {
    const o = opciones[i];
    if (!o || o.deshabilitada) return;
    if (o.valor !== valor) onElegir(o.valor);
    cerrar();
  };
  const mover = (desde: number, paso: number) => {
    for (let i = desde + paso; i >= 0 && i < opciones.length; i += paso)
      if (!opciones[i].deshabilitada) return setActiva(i);
  };

  const alTeclear = (e: KeyboardEvent) => {
    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        abrir();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        return mover(activa, 1);
      case 'ArrowUp':
        e.preventDefault();
        return mover(activa, -1);
      case 'Home':
        e.preventDefault();
        return mover(-1, 1);
      case 'End':
        e.preventDefault();
        return mover(opciones.length, -1);
      case 'Enter':
      case ' ':
        e.preventDefault();
        return elegir(activa);
      case 'Escape':
        e.preventDefault();
        e.stopPropagation(); // no cerrar el modal que contiene la lista
        return cerrar();
      case 'Tab':
        return cerrar(false);
    }
    // Búsqueda por teclado: ir a la primera opción que empieza con lo escrito.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const ahora = Date.now();
      const b = busqueda.current;
      b.texto = (ahora > b.hasta ? '' : b.texto) + e.key.toLowerCase();
      b.hasta = ahora + 700;
      const i = opciones.findIndex(
        (o) => !o.deshabilitada && o.texto.toLowerCase().startsWith(b.texto),
      );
      if (i >= 0) setActiva(i);
    }
  };

  return (
    <>
      <button
        ref={boton}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? `${base}-lista` : undefined}
        aria-activedescendant={abierto ? `${base}-${activa}` : undefined}
        aria-label={etiqueta ?? (enEtiqueta ? undefined : seleccionada?.texto)}
        disabled={deshabilitada}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={alTeclear}
        className={claseGatillo}
        data-control
      >
        {gatillo ? (
          gatillo(seleccionada, abierto)
        ) : (
          <>
            <span className={cx('min-w-0 flex-1 truncate text-left', !valor && 'text-slate-500')}>
              {seleccionada?.texto ?? 'Elegir…'}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-slate-400" aria-hidden />
          </>
        )}
      </button>
      <Flotante
        ancla={boton}
        abierto={abierto}
        onCerrar={() => cerrar(false)}
        anchoMinimo={anchoMinimo}
      >
        <ul
          id={`${base}-lista`}
          role="listbox"
          aria-label={etiqueta}
          className="max-h-72 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]"
        >
          {opciones.map((o, i) => (
            <li
              key={`${o.valor}-${i}`}
              id={`${base}-${i}`}
              role="option"
              aria-selected={o.valor === valor}
              aria-disabled={o.deshabilitada || undefined}
              ref={(el) => {
                if (el && i === activa) el.scrollIntoView({ block: 'nearest' });
              }}
              onMouseMove={() => !o.deshabilitada && activa !== i && setActiva(i)}
              onClick={() => elegir(i)}
              className={cx(
                'flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm',
                o.deshabilitada
                  ? 'text-slate-400'
                  : i === activa
                    ? 'bg-slate-100 text-slate-950'
                    : 'text-slate-700',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{o.texto}</span>
              <Check
                className={cx('size-4 shrink-0', o.valor === valor ? 'opacity-100' : 'opacity-0')}
                aria-hidden
              />
            </li>
          ))}
        </ul>
      </Flotante>
    </>
  );
}

// Reemplazo de <select> con el mismo contrato: acepta <option> como hijos,
// value/onChange, defaultValue y {...register()} de react-hook-form. Por dentro
// mantiene un <select> oculto (la fuente de verdad para el formulario) y
// muestra la lista propia del sistema.
export function Select({
  className,
  children,
  ref,
  disabled,
  id,
  'aria-label': etiqueta,
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  const nativo = useRef<HTMLSelectElement | null>(null);
  const [estado, setEstado] = useState({ firma: '', valor: '' });

  // Lee opciones y valor desde el <select> oculto (cubre register, reset y
  // valores controlados sin duplicar la lógica).
  const sincronizar = useCallback(() => {
    const s = nativo.current;
    if (!s) return;
    const firma = JSON.stringify(Array.from(s.options).map((o) => [o.value, o.text, o.disabled]));
    setEstado((e) => (e.firma === firma && e.valor === s.value ? e : { firma, valor: s.value }));
  }, []);
  useLayoutEffect(sincronizar);

  const opciones: OpcionLista[] = estado.firma
    ? (JSON.parse(estado.firma) as [string, string, boolean][]).map(([valor, texto, d]) => ({
        valor,
        texto,
        deshabilitada: d,
      }))
    : [];

  return (
    <div className={cx('relative min-w-0', className)}>
      <ListaDesplegable
        id={id}
        opciones={opciones}
        valor={estado.valor}
        etiqueta={etiqueta}
        deshabilitada={disabled}
        onElegir={(v) => {
          emitirCambio(nativo.current, v);
          sincronizar();
        }}
        onSalir={() => emitirSalida(nativo.current)}
        claseGatillo={cx(
          'flex h-9 w-full min-w-0 items-center gap-2 rounded-lg bg-superficie px-3 text-left text-base text-slate-900 ring-1 ring-inset ring-slate-200 outline-none transition-shadow duration-150 sm:text-sm',
          'hover:ring-slate-300 focus-visible:shadow-[0_0_0_4px_var(--color-slate-100)] focus-visible:ring-slate-900 aria-expanded:ring-slate-900',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        )}
      />
      <select
        {...resto}
        ref={unirRefs(nativo, ref)}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        // Si el formulario pide foco (p. ej. al validar), se lo pasa al botón.
        onFocus={(e) => (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus()}
        onChange={(e) => {
          resto.onChange?.(e);
          sincronizar();
        }}
        className="sr-only"
      >
        {children}
      </select>
    </div>
  );
}
