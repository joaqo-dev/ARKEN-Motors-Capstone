import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { emitirCambio, emitirSalida, Flotante, unirRefs } from './flotante';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const DIAS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];

// Fechas como 'YYYY-MM-DD' (igual que <input type="date">), sin zonas horarias.
const aIso = (a: number, m: number, d: number) =>
  `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const desdeIso = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return { a, m: m - 1, d };
};
const hoyIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const sumarDias = (iso: string, n: number) => {
  const { a, m, d } = desdeIso(iso);
  const f = new Date(Date.UTC(a, m, d + n));
  return aIso(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
};
const sumarMeses = (iso: string, n: number) => {
  const { a, m, d } = desdeIso(iso);
  const f = new Date(Date.UTC(a, m + n, 1));
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  return aIso(f.getUTCFullYear(), f.getUTCMonth(), Math.min(d, ultimo));
};
const mostrar = (iso: string) => (iso ? iso.split('-').reverse().join('-') : '');

// Calendario mensual (semana de lunes a domingo). Teclado: flechas por día y
// semana, RePág/AvPág por mes (con Mayús, por año), Inicio/Fin de semana,
// Enter para elegir y Escape para cerrar.
export function Calendario({
  valor,
  min,
  max,
  onElegir,
  onCerrar,
  permitirBorrar,
}: {
  valor: string;
  min?: string;
  max?: string;
  onElegir: (iso: string) => void;
  onCerrar: () => void;
  permitirBorrar?: boolean;
}) {
  const hoy = hoyIso();
  const inicial = valor || (max && hoy > max ? max : min && hoy < min ? min : hoy);
  const [foco, setFoco] = useState(inicial);
  const grilla = useRef<HTMLDivElement>(null);
  const { a, m } = desdeIso(foco);
  const fuera = (iso: string) => (!!min && iso < min) || (!!max && iso > max);

  // Primer lunes visible y 6 semanas completas (altura estable al cambiar de mes).
  const primero = new Date(Date.UTC(a, m, 1));
  const desplazamiento = (primero.getUTCDay() + 6) % 7;
  const inicioGrilla = sumarDias(aIso(a, m, 1), -desplazamiento);
  const dias = Array.from({ length: 42 }, (_, i) => sumarDias(inicioGrilla, i));

  useEffect(() => {
    grilla.current?.querySelector<HTMLButtonElement>(`[data-fecha="${foco}"]`)?.focus();
  }, [foco]);

  const alTeclear = (e: KeyboardEvent) => {
    const mov: Record<string, () => string> = {
      ArrowLeft: () => sumarDias(foco, -1),
      ArrowRight: () => sumarDias(foco, 1),
      ArrowUp: () => sumarDias(foco, -7),
      ArrowDown: () => sumarDias(foco, 7),
      PageUp: () => sumarMeses(foco, e.shiftKey ? -12 : -1),
      PageDown: () => sumarMeses(foco, e.shiftKey ? 12 : 1),
      Home: () => sumarDias(foco, -((desdeIso(foco).d + desplazamiento - 1) % 7)),
      End: () => sumarDias(foco, 6 - ((desdeIso(foco).d + desplazamiento - 1) % 7)),
    };
    if (mov[e.key]) {
      e.preventDefault();
      setFoco(mov[e.key]());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // no cerrar el modal que contiene el calendario
      onCerrar();
    }
  };

  const botonNav =
    'flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900';

  return (
    <div className="w-[17.5rem] p-3" onKeyDown={alTeclear}>
      <div className="mb-2 flex items-center gap-0.5">
        <button
          type="button"
          className={botonNav}
          onClick={() => setFoco(sumarMeses(foco, -12))}
          aria-label="Año anterior"
        >
          <ChevronsLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className={botonNav}
          onClick={() => setFoco(sumarMeses(foco, -1))}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <p
          className="flex-1 text-center text-sm font-medium capitalize text-slate-900"
          aria-live="polite"
        >
          {MESES[m]} {a}
        </p>
        <button
          type="button"
          className={botonNav}
          onClick={() => setFoco(sumarMeses(foco, 1))}
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className={botonNav}
          onClick={() => setFoco(sumarMeses(foco, 12))}
          aria-label="Año siguiente"
        >
          <ChevronsRight className="size-4" aria-hidden />
        </button>
      </div>
      <div ref={grilla} role="grid" aria-label={`${MESES[m]} ${a}`}>
        <div role="row" className="grid grid-cols-7">
          {DIAS.map((d) => (
            <span key={d} role="columnheader" className="py-1.5 text-center text-xs text-slate-500">
              {d}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, s) => (
          <div key={s} role="row" className="grid grid-cols-7">
            {dias.slice(s * 7, s * 7 + 7).map((iso) => {
              const f = desdeIso(iso);
              const otroMes = f.m !== m;
              const elegido = iso === valor;
              const bloqueado = fuera(iso);
              return (
                <span key={iso} role="gridcell" aria-selected={elegido} className="p-0.5">
                  <button
                    type="button"
                    data-fecha={iso}
                    tabIndex={iso === foco ? 0 : -1}
                    disabled={bloqueado}
                    onClick={() => onElegir(iso)}
                    aria-label={`${f.d} de ${MESES[f.m]} de ${f.a}`}
                    aria-current={iso === hoy ? 'date' : undefined}
                    className={cx(
                      'relative flex h-8 w-full items-center justify-center rounded-lg text-sm tabular-nums outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-slate-400',
                      elegido
                        ? 'bg-slate-900 font-medium text-invertido'
                        : bloqueado
                          ? 'cursor-not-allowed text-slate-300 line-through decoration-slate-300'
                          : otroMes
                            ? 'text-slate-400 hover:bg-slate-100'
                            : 'text-slate-800 hover:bg-slate-100',
                    )}
                  >
                    {f.d}
                    {iso === hoy && !elegido && (
                      <span
                        className="absolute bottom-1 size-1 rounded-full bg-slate-900"
                        aria-hidden
                      />
                    )}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
        <button
          type="button"
          disabled={fuera(hoy)}
          onClick={() => onElegir(hoy)}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
        >
          Hoy
        </button>
        {permitirBorrar && valor && (
          <button
            type="button"
            onClick={() => onElegir('')}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Borrar
          </button>
        )}
      </div>
    </div>
  );
}

// Reemplazo de <input type="date"> con el mismo contrato (value/onChange,
// defaultValue, min, max, required y {...register()}). Guarda el valor en un
// input oculto y muestra un botón con el calendario propio.
export function CampoFecha({
  className,
  ref,
  min,
  max,
  required,
  disabled,
  id,
  placeholder = 'Elegir fecha',
  'aria-label': etiqueta,
  ...resto
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const nativo = useRef<HTMLInputElement | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const [valor, setValor] = useState('');
  const [abierto, setAbierto] = useState(false);

  const sincronizar = useCallback(() => {
    const v = nativo.current?.value ?? '';
    setValor((a) => (a === v ? a : v));
  }, []);
  useLayoutEffect(sincronizar);

  const cerrar = useCallback((devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
    emitirSalida(nativo.current);
  }, []);

  return (
    <div className={cx('relative min-w-0', className)}>
      <button
        ref={boton}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={etiqueta ? `${etiqueta}${valor ? `: ${mostrar(valor)}` : ''}` : undefined}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !abierto) {
            e.preventDefault();
            setAbierto(true);
          }
        }}
        data-control
        className={cx(
          'flex h-9 w-full min-w-0 items-center gap-2 rounded-lg bg-superficie px-3 text-left text-sm tabular-nums ring-1 ring-inset ring-slate-200 outline-none transition-shadow duration-150',
          'hover:ring-slate-300 focus-visible:shadow-[0_0_0_4px_var(--color-slate-100)] focus-visible:ring-slate-900 aria-expanded:ring-slate-900',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-slate-400" aria-hidden />
        <span
          className={cx('min-w-0 flex-1 truncate', valor ? 'text-slate-900' : 'text-slate-500')}
        >
          {valor ? mostrar(valor) : placeholder}
        </span>
      </button>
      <input
        {...resto}
        ref={unirRefs(nativo, ref)}
        type="text"
        tabIndex={-1}
        aria-hidden
        required={required}
        disabled={disabled}
        onFocus={() => boton.current?.focus()}
        onChange={(e) => {
          resto.onChange?.(e);
          sincronizar();
        }}
        className="sr-only"
      />
      <Flotante ancla={boton} abierto={abierto} onCerrar={() => cerrar(false)}>
        <div role="dialog" aria-label={etiqueta ?? 'Elegir fecha'}>
          <Calendario
            valor={valor}
            min={min as string | undefined}
            max={max as string | undefined}
            permitirBorrar={!required}
            onElegir={(iso) => {
              emitirCambio(nativo.current, iso);
              sincronizar();
              cerrar();
            }}
            onCerrar={() => cerrar()}
          />
        </div>
      </Flotante>
    </div>
  );
}
