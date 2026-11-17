import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Info,
  Loader2,
  MoreHorizontal,
  Search,
  TriangleAlert,
  type LucideIcon,
  X,
} from 'lucide-react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, type LinkProps } from 'react-router-dom';
import { useHistorial } from '../lib/historial';
import { etiqueta, fecha } from '../lib/formato';
import { useArrastreCierre } from './arrastre';
import { CampoFecha } from './fecha';
import { useAyudas } from '../lib/ayudas';
import { CampoNumero } from './numero';

const cx = (...clases: (string | false | null | undefined)[]) => clases.filter(Boolean).join(' ');

// ---------------------------------------------------------------- Botones

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma' | 'fantasmaPeligro';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-slate-900 text-invertido hover:bg-slate-800',
  secundario: 'bg-superficie text-slate-800 ring-1 ring-inset ring-slate-300 hover:ring-slate-900',
  peligro: 'bg-[#dc2626] text-white hover:bg-[#b91c1c]',
  fantasma: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  fantasmaPeligro: 'text-red-700 hover:bg-red-50',
};

const claseBoton = (variante: Variante, chico?: boolean, className?: string) =>
  cx(
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium',
    'transition-[background-color,color,box-shadow,transform] duration-150 ease-(--ease-out) active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
    chico ? 'h-8 px-3 text-[0.8125rem]' : 'h-9 px-4 text-sm',
    VARIANTES[variante],
    className,
  );

// `ayuda`: breve descripción de lo que hace, en la burbuja al pasar el mouse
// (ui/ayuda.tsx; se puede apagar desde el menú de la cuenta).
export function Boton({
  variante = 'primario',
  cargando,
  chico,
  ayuda,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  cargando?: boolean;
  chico?: boolean;
  ayuda?: string;
}) {
  return (
    <button
      type="button"
      data-ayuda={ayuda}
      {...props}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={claseBoton(variante, chico, className)}
    >
      {cargando && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// Acción de fila con ícono (nombre accesible y tooltip).
export function BotonIcono({
  etiqueta,
  ayuda,
  peligro,
  onClick,
  a,
  href,
  children,
}: {
  etiqueta: string;
  ayuda?: string; // si no viene, la burbuja muestra la etiqueta
  peligro?: boolean;
  onClick?: () => void;
  a?: string; // ruta interna (navegación)
  href?: string; // archivo en otra pestaña
  children: ReactNode;
}) {
  // Dentro de una fila clicable, la acción no debe abrir además el detalle.
  const detener = (e: React.MouseEvent) => e.stopPropagation();
  // Un botón solo con ícono siempre necesita su nombre a la vista: con las
  // ayudas activas va en la burbuja; apagadas, en el tooltip del navegador.
  const { activas } = useAyudas();
  const nombre = activas
    ? { 'data-ayuda': ayuda ?? etiqueta }
    : { title: ayuda ? `${etiqueta}: ${ayuda}` : etiqueta };
  const clase = `flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors [&_svg]:size-4 ${peligro ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-100 hover:text-slate-900'}`;
  if (a) {
    return (
      <Link to={a} aria-label={etiqueta} {...nombre} className={clase} onClick={detener}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={detener}
        aria-label={etiqueta}
        {...nombre}
        className={clase}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        detener(e);
        onClick?.();
      }}
      aria-label={etiqueta}
      {...nombre}
      className={clase}
    >
      {children}
    </button>
  );
}

// Enlace con apariencia de botón (navegación, no acción).
export function BotonLink({
  variante = 'primario',
  chico,
  ayuda,
  className,
  ...props
}: LinkProps & { variante?: Variante; chico?: boolean; ayuda?: string }) {
  return <Link data-ayuda={ayuda} {...props} className={claseBoton(variante, chico, className)} />;
}

// Enlace externo (archivo, PDF) con apariencia de botón.
export function BotonA({
  variante = 'secundario',
  chico,
  ayuda,
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variante?: Variante;
  chico?: boolean;
  ayuda?: string;
}) {
  return <a data-ayuda={ayuda} {...props} className={claseBoton(variante, chico, className)} />;
}

export function Spinner({ chico }: { chico?: boolean }) {
  return (
    <Loader2
      className={cx('animate-spin text-slate-400', chico ? 'size-3.5' : 'size-5')}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------- Formularios

export function Campo({
  etiqueta: texto,
  error,
  ayuda,
  children,
  className,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cx(
        'flex min-w-0 flex-col gap-1.5',
        error &&
          '[&_input,&_textarea,&_[data-control]]:shadow-[0_0_0_4px_var(--color-red-50)] [&_input,&_textarea,&_[data-control]]:ring-red-400',
        className,
      )}
    >
      <span className="text-[0.8125rem] font-medium text-slate-700">{texto}</span>
      {children}
      {error ? (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </span>
      ) : ayuda ? (
        <span className="text-xs leading-relaxed text-slate-500">{ayuda}</span>
      ) : null}
    </label>
  );
}

// 16px en móvil para que iOS no haga zoom al enfocar; 14px desde sm.
const controlBase = cx(
  'w-full min-w-0 rounded-lg border-0 bg-superficie px-3 text-base text-slate-900 ring-1 ring-inset ring-slate-200 outline-none sm:text-sm',
  'placeholder:text-slate-500 transition-shadow duration-150',
  'focus:ring-slate-900 focus:shadow-[0_0_0_4px_var(--color-slate-100)] focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
  'aria-invalid:ring-red-400 aria-invalid:shadow-[0_0_0_4px_var(--color-red-50)]',
);

export function Input({
  className,
  moneda,
  miles,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>;
  moneda?: boolean; // "$ 12.500.000" (montos en CLP)
  miles?: boolean; // "54.000" (kilometraje)
}) {
  if (props.type === 'date') return <CampoFecha className={className} {...props} />;
  if (props.type === 'number' && (moneda || miles))
    return <CampoNumero className={className} moneda={moneda} {...props} />;
  return (
    <input
      {...props}
      className={cx(
        controlBase,
        props.type === 'file'
          ? 'h-auto cursor-pointer py-1.5 pl-1.5 text-slate-600 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-[0.8125rem] file:font-medium file:text-slate-800 hover:file:bg-slate-200'
          : 'h-9',
        className,
      )}
    />
  );
}

// Listas y fechas: componentes propios (no los del sistema operativo), con el
// mismo contrato que <select> e <input type="date">.
export { Select } from './selector';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(controlBase, 'resize-y py-2', className)} />;
}

// Opciones de un <Select> a partir de valores de enum (con etiqueta en español).
export function Opciones({ valores, vacia }: { valores: readonly string[]; vacia?: string }) {
  return (
    <>
      {vacia !== undefined && <option value="">{vacia}</option>}
      {valores.map((v) => (
        <option key={v} value={v}>
          {etiqueta(v)}
        </option>
      ))}
    </>
  );
}

// Fila de filtros sobre un listado.
export function Filtros({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center [&>*]:min-w-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Buscador({
  valor,
  onCambiar,
  placeholder,
  className,
}: {
  valor: string;
  onCambiar: (texto: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cx('relative col-span-2', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <Input
        type="search"
        aria-label={placeholder}
        className="pl-9"
        placeholder={placeholder}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
      />
    </div>
  );
}

export function RangoFechas({
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
}) {
  return (
    // En teléfonos va al final de los filtros (los selectores quedan de a pares) y
    // cada fecha ocupa la mitad del ancho.
    <div className="col-span-2 flex items-center gap-2 max-sm:order-1">
      <Input
        type="date"
        aria-label="Desde"
        className="flex-1 sm:w-auto sm:flex-none"
        value={desde}
        max={hasta || undefined}
        onChange={(e) => onDesde(e.target.value)}
      />
      <span className="text-slate-400" aria-hidden>
        –
      </span>
      <Input
        type="date"
        aria-label="Hasta"
        className="flex-1 sm:w-auto sm:flex-none"
        value={hasta}
        min={desde || undefined}
        onChange={(e) => onHasta(e.target.value)}
      />
    </div>
  );
}

export function Casilla({
  marcada,
  onCambiar,
  children,
}: {
  marcada: boolean;
  onCambiar: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="inline-flex h-9 cursor-pointer select-none items-center gap-2 px-1 text-sm text-slate-600">
      <input
        type="checkbox"
        className="size-4 cursor-pointer rounded"
        checked={marcada}
        onChange={(e) => onCambiar(e.target.checked)}
      />
      {children}
    </label>
  );
}

// ---------------------------------------------------------------- Estructura

const claseVolver =
  '-ml-1 mb-3 inline-flex max-w-full items-center gap-0.5 rounded-md px-1 py-0.5 text-[0.8125rem] font-medium text-slate-500 transition-colors hover:text-slate-900';

// "‹ Volver": a la pantalla de la que se vino dentro del panel (con su título,
// ej. "‹ Gasto N° 15"); si se entró directo (enlace, recarga), a la sección padre.
function VolverInteligente({ a, texto }: { a: string; texto: string }) {
  const { anterior } = useHistorial();
  const navegar = useNavigate();
  if (!anterior) return <Volver a={a}>{texto}</Volver>;
  return (
    <button type="button" onClick={() => navegar(-1)} className={claseVolver}>
      <ChevronLeft className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{anterior}</span>
    </button>
  );
}

export function Volver({ a, children }: { a: string; children: ReactNode }) {
  return (
    <Link to={a} className={claseVolver}>
      <ChevronLeft className="size-4 shrink-0" aria-hidden />
      {children}
    </Link>
  );
}

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  volver,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  volver?: { a: string; texto: string };
}) {
  // El título también nombra esta pantalla en el "‹ Volver" de la siguiente.
  const { registrarTitulo } = useHistorial();
  useEffect(() => {
    if (typeof titulo === 'string') registrarTitulo(titulo);
  }, [titulo, registrarTitulo]);
  // ¿Dónde estoy?: el título de la pestaña sigue a la página.
  useEffect(() => {
    if (typeof titulo !== 'string') return;
    const anterior = document.title;
    document.title = `${titulo} · Panel de gestión`;
    return () => {
      document.title = anterior;
    };
  }, [titulo]);
  return (
    <header className="mb-7">
      {volver && (
        <div className="flex">
          <VolverInteligente a={volver.a} texto={volver.texto} />
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="display text-2xl leading-tight text-slate-950 sm:text-[1.75rem]">
            {titulo}
          </h1>
          {descripcion && <div className="mt-1 text-sm text-slate-500">{descripcion}</div>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
    </header>
  );
}

export function Tarjeta({
  titulo,
  descripcion,
  acciones,
  children,
  className,
  sinRelleno,
}: {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
  sinRelleno?: boolean;
}) {
  return (
    <section
      className={cx(
        'rounded-2xl bg-superficie dark:ring-1 dark:ring-inset dark:ring-slate-200',
        className,
      )}
    >
      {(titulo || acciones) && (
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {titulo && (
              <h2 className="text-[0.9375rem] font-medium tracking-[-0.01em] text-slate-900">
                {titulo}
              </h2>
            )}
            {descripcion && <p className="mt-0.5 text-[0.8125rem] text-slate-500">{descripcion}</p>}
          </div>
          {acciones && <div className="-mr-1.5 -mt-1 flex shrink-0 gap-1">{acciones}</div>}
        </div>
      )}
      <div className={sinRelleno ? '' : 'px-5 pb-5 pt-3'}>{children}</div>
    </section>
  );
}

// Cifra principal de una pantalla: rótulo, ícono en círculo y número grande liviano.
export function Indicador({
  titulo,
  valor,
  detalle,
  icono: Icono,
}: {
  titulo: string;
  valor: string;
  detalle?: ReactNode;
  icono: LucideIcon;
}) {
  return (
    <div
      className={cx(
        // En teléfonos, dos por fila: más compactos y sin ícono.
        'flex min-w-0 flex-col rounded-2xl bg-superficie p-4 sm:p-5 dark:ring-1 dark:ring-inset dark:ring-slate-200',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500 max-sm:text-xs">{titulo}</p>
        <span
          className={cx(
            'flex size-9 shrink-0 items-center justify-center rounded-full max-sm:hidden',
            'text-slate-500 ring-1 ring-inset ring-slate-200',
          )}
        >
          <Icono className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <p className="mt-3 truncate text-xl font-light leading-none tracking-[-0.03em] tabular-nums sm:text-[2rem] sm:tracking-[-0.04em] xl:text-[2.25rem]">
        {valor}
      </p>
      {detalle && (
        <p
          className="mt-2.5 truncate text-xs text-slate-500"
          title={typeof detalle === 'string' ? detalle : undefined}
        >
          {detalle}
        </p>
      )}
    </div>
  );
}

// Selector de una opción entre pocas (período, medida): píldora blanca con la
// opción activa en tinta, como las pestañas de las referencias.
export function Segmentado<T extends string>({
  opciones,
  actual,
  onCambiar,
  etiqueta: nombre,
  chico,
  className,
}: {
  opciones: { id: T; texto: string }[];
  actual: T | undefined;
  onCambiar: (id: T) => void;
  etiqueta: string;
  chico?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-superficie p-1 [scrollbar-width:none] dark:ring-1 dark:ring-inset dark:ring-slate-200',
        className,
      )}
      role="group"
      aria-label={nombre}
    >
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === actual}
          onClick={() => onCambiar(o.id)}
          className={cx(
            'shrink-0 whitespace-nowrap rounded-full font-medium transition-[background-color,color] duration-150',
            chico ? 'h-7 px-3 text-xs' : 'h-8 px-3.5 text-[0.8125rem]',
            o.id === actual
              ? 'bg-slate-900 text-invertido'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

// Cuánto de un plazo ya corrió (vigencia de una cotización o reserva, plazo de una
// consignación): barra en píldora en tinta que se tiñe de ámbar en la última semana
// (o la última décima parte) y al vencer. Solo se dibuja mientras sigue abierto.
export function BarraPlazo({
  desde,
  hasta,
  abierto,
  vencido,
  grande,
}: {
  desde: string;
  hasta: string;
  abierto: boolean;
  vencido?: boolean;
  grande?: boolean;
}) {
  const inicio = new Date(`${desde.slice(0, 10)}T00:00:00`).getTime();
  const fin = new Date(`${hasta.slice(0, 10)}T23:59:59`).getTime();
  const avance = Math.min(1, Math.max(0, (Date.now() - inicio) / Math.max(1, fin - inicio)));
  const quedan = Math.ceil((fin - Date.now()) / 86_400_000);
  const terminado = vencido || quedan < 0;
  const alerta = abierto && (terminado || quedan <= 7 || avance >= 0.9);
  const texto = !abierto
    ? `Hasta ${fecha(hasta)}`
    : terminado
      ? `Venció el ${fecha(hasta)}`
      : quedan === 0
        ? 'Vence hoy'
        : `${quedan} ${quedan === 1 ? 'día' : 'días'} de plazo`;
  return (
    <div className={grande ? '' : 'w-36'}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={grande ? 'text-sm text-slate-900' : 'text-slate-700'}>{texto}</span>
        {grande && abierto && !terminado && (
          <span className="tabular-nums text-slate-500">hasta {fecha(hasta)}</span>
        )}
      </div>
      {abierto && (
        <div
          className={cx(
            'mt-1.5 overflow-hidden rounded-full bg-slate-100',
            grande ? 'h-2.5' : 'h-1.5',
          )}
          aria-hidden
        >
          <div
            className={cx('h-full rounded-full', alerta ? 'bg-ambar' : 'bg-slate-900')}
            style={{ width: `${Math.max(terminado ? 100 : avance * 100, 3)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Iniciales de un nombre (dos como máximo) para avatares.
export const iniciales = (texto: string) =>
  texto
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

// Persona en un círculo con sus iniciales, como en la lista de un cliente de correo.
export function Avatar({
  nombre,
  grande,
  className,
}: {
  nombre: string;
  grande?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-700',
        grande ? 'size-16 text-lg' : 'size-9 text-xs',
        className,
      )}
      aria-hidden
    >
      {iniciales(nombre)}
    </span>
  );
}

// Dato con su ícono en un círculo (ficha técnica, contacto, documento).
export function DatoIcono({
  icono: Icono,
  etiqueta: texto,
  children,
}: {
  icono: LucideIcon;
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <Icono className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{texto}</dt>
        <dd className="truncate text-sm font-medium text-slate-900">{children ?? '—'}</dd>
      </div>
    </div>
  );
}

// Dato corto en píldora (patente, sucursal, kilometraje).
export function Chip({
  children,
  icono: Icono,
  mono,
  className,
}: {
  children: ReactNode;
  icono?: LucideIcon;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-3 text-xs font-medium text-slate-700',
        mono && 'font-mono tracking-wide',
        className,
      )}
    >
      {Icono && <Icono className="size-3.5 shrink-0 text-slate-500" aria-hidden />}
      {children}
    </span>
  );
}

// Medidor de avance en marcas verticales: las cumplidas en lima, el resto en gris.
// Lee la proporción de un vistazo (cuántos avanzaron de cuántos).
export function Medidor({ valor, marcas = 40 }: { valor: number; marcas?: number }) {
  const llenas = Math.round(Math.min(Math.max(valor, 0), 1) * marcas);
  return (
    <div className="flex h-8 items-stretch gap-[3px]" aria-hidden>
      {Array.from({ length: marcas }, (_, i) => (
        <span
          key={i}
          className={cx(
            'min-w-0 flex-1 rounded-full',
            i < llenas ? 'bg-lima-fuerte' : 'bg-slate-200',
          )}
        />
      ))}
    </div>
  );
}

export function Dato({ etiqueta: texto, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{texto}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children ?? '—'}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- Estados

type Tono = 'exito' | 'aviso' | 'info' | 'revision' | 'neutro' | 'peligro' | 'marca';
const TONOS: Record<Tono, { punto: string; fondo?: string }> = {
  // Lo positivo va en lima (el único acento del panel), con texto oscuro.
  exito: { punto: 'bg-lima-fuerte', fondo: 'bg-lima-suave text-slate-900' },
  aviso: { punto: 'bg-ambar' },
  info: { punto: 'bg-violeta' },
  revision: { punto: 'bg-rosa' },
  neutro: { punto: 'bg-slate-400' },
  peligro: { punto: 'bg-red-500' },
  marca: { punto: 'bg-slate-900' },
};

const TONO_ESTADO: Record<string, Tono> = {
  DISPONIBLE: 'exito',
  VIGENTE: 'exito',
  ACTIVA: 'exito',
  ACTIVO: 'exito',
  CONFIRMADA: 'exito',
  ACEPTADA: 'exito',
  RESERVADO: 'aviso',
  PENDIENTE: 'aviso',
  ENVIADO: 'exito',
  FALLIDO: 'peligro',
  DESCARTADO: 'neutro',
  VENCIDA: 'aviso',
  EN_PREPARACION: 'info',
  PENDIENTE_REVISION: 'revision',
  VENDIDO: 'neutro',
  VENDIDA: 'neutro',
  CONVERTIDA_EN_VENTA: 'neutro',
  CONCRETADA: 'neutro',
  RESUELTA: 'neutro',
  DEVUELTA: 'neutro',
  DADO_DE_BAJA: 'peligro',
  ANULADA: 'peligro',
  ANULADO: 'peligro',
  CANCELADA: 'peligro',
  RECHAZADA: 'peligro',
  BORRADOR: 'info',
  APROBADO: 'exito',
  // Aprobado igual: verde (el ámbar daría a entender que está mal).
  APROBADO_CON_OBSERVACIONES: 'exito',
  NO_APROBADO: 'peligro',
  INACTIVO: 'peligro',
};

export function Insignia({ valor, texto, tono }: { valor: string; texto?: string; tono?: Tono }) {
  const t = TONOS[tono ?? TONO_ESTADO[valor] ?? 'neutro'];
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium',
        t.fondo ?? 'bg-slate-100 text-slate-700',
      )}
    >
      <span className={cx('size-1.5 rounded-full', t.punto)} aria-hidden />
      {texto ?? etiqueta(valor)}
    </span>
  );
}

// Estado que se cambia ahí mismo: la insignia es un botón que despliega los
// estados a los que puede pasar. Sin opciones, es una insignia común.
export function SelectorEstado({
  valor,
  opciones,
  onElegir,
  ayuda,
}: {
  valor: string;
  opciones: { valor: string; texto?: string; ayuda?: string }[];
  onElegir: (valor: string) => void;
  ayuda?: string;
}) {
  const { caja, abierto, setAbierto, alternar, claseMenu } = useMenuFlotante('izquierda');
  if (opciones.length === 0) return <Insignia valor={valor} />;
  const t = TONOS[TONO_ESTADO[valor] ?? 'neutro'];
  return (
    <div ref={caja} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Estado: ${etiqueta(valor)}. Cambiar estado`}
        data-ayuda={abierto ? undefined : ayuda}
        onClick={alternar}
        className={cx(
          'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full pl-3 pr-2 text-xs font-medium',
          'ring-1 ring-inset ring-slate-300 transition-[box-shadow,transform] duration-150 ease-(--ease-out)',
          'hover:ring-slate-900 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
          abierto && 'ring-slate-900',
          t.fondo ?? 'bg-superficie text-slate-800',
        )}
      >
        <span className={cx('size-1.5 rounded-full', t.punto)} aria-hidden />
        {etiqueta(valor)}
        <ChevronDown
          className={cx(
            'size-3.5 text-slate-500 transition-transform duration-150',
            abierto && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {abierto && (
        <div role="menu" className={claseMenu}>
          <p className="px-3 pb-1 pt-2 text-xs text-slate-500">Cambiar a</p>
          {opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="menuitem"
              data-ayuda={o.ayuda}
              onClick={() => {
                setAbierto(false);
                onElegir(o.valor);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
            >
              <span
                className={cx(
                  'size-1.5 rounded-full',
                  TONOS[TONO_ESTADO[o.valor] ?? 'neutro'].punto,
                )}
                aria-hidden
              />
              {o.texto ?? etiqueta(o.valor)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Chip (como `Chip`) que despliega opciones al hacer clic: ej. la sucursal de
// un vehículo, para transferirlo. Sin opciones, es un chip común.
export function SelectorChip({
  children,
  icono: Icono,
  opciones,
  onElegir,
  titulo,
  etiqueta: texto,
  ayuda,
}: {
  children: ReactNode;
  icono?: LucideIcon;
  opciones: { valor: string; texto: string }[];
  onElegir: (valor: string) => void;
  titulo?: string; // encabezado del menú
  etiqueta: string; // nombre accesible del botón
  ayuda?: string;
}) {
  const { caja, abierto, setAbierto, alternar, claseMenu } = useMenuFlotante('izquierda');
  if (opciones.length === 0) {
    return (
      <Chip icono={Icono} className="bg-superficie">
        {children}
      </Chip>
    );
  }
  return (
    <div ref={caja} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={texto}
        data-ayuda={abierto ? undefined : ayuda}
        onClick={alternar}
        className={cx(
          'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-superficie pl-3 pr-2 text-xs font-medium text-slate-700',
          'ring-1 ring-inset ring-slate-300 transition-[box-shadow,transform] duration-150 ease-(--ease-out)',
          'hover:ring-slate-900 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
          abierto && 'ring-slate-900',
        )}
      >
        {Icono && <Icono className="size-3.5 shrink-0 text-slate-500" aria-hidden />}
        {children}
        <ChevronDown
          className={cx(
            'size-3.5 text-slate-500 transition-transform duration-150',
            abierto && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {abierto && (
        <div role="menu" className={claseMenu}>
          {titulo && <p className="px-3 pb-1 pt-2 text-xs text-slate-500">{titulo}</p>}
          {opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                onElegir(o.valor);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
            >
              {o.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cx('animate-pulso rounded-md bg-slate-200/70', className)} aria-hidden />;
}

// Carga de una página o sección: esqueleto con la forma del contenido.
export function Cargando({
  texto = 'Cargando…',
  variante = 'filas',
}: {
  texto?: string;
  variante?: 'filas' | 'centro';
}) {
  if (variante === 'centro') {
    return (
      <div className="flex h-full min-h-40 items-center justify-center" role="status">
        <Spinner />
        <span className="sr-only">{texto}</span>
      </div>
    );
  }
  return (
    <div
      className="overflow-hidden rounded-2xl bg-superficie dark:ring-1 dark:ring-inset dark:ring-slate-200"
      role="status"
    >
      <span className="sr-only">{texto}</span>
      <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <Esqueleto className="h-3 w-1/4" />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-0"
        >
          <Esqueleto className="h-3.5 w-2/5" />
          <Esqueleto className="h-3.5 w-1/6" />
          <Esqueleto className="ml-auto h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function MensajeError({ error }: { error: unknown }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
      <span>{error instanceof Error ? error.message : 'Ocurrió un error inesperado.'}</span>
    </div>
  );
}

export function Vacio({
  titulo,
  children,
  icono: Icono = Inbox,
  accion,
}: {
  titulo: string;
  children?: ReactNode;
  icono?: LucideIcon;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-superficie px-6 py-14 text-center dark:ring-1 dark:ring-inset dark:ring-slate-200">
      <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200">
        <Icono className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="font-medium text-slate-900">{titulo}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Tablas

// `movil`: en teléfonos (< sm) se muestra eso (una ListaMovil) en vez de la
// tabla, que obligaría a desplazarse a lo ancho. Desde sm, la tabla de siempre.
export function Tabla({ children, movil }: { children: ReactNode; movil?: ReactNode }) {
  const tabla = (
    <div className="overflow-x-auto rounded-2xl bg-superficie dark:ring-1 dark:ring-inset dark:ring-slate-200 [scrollbar-width:thin]">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  );
  if (!movil) return tabla;
  return (
    <>
      {movil}
      <div className="hidden sm:block">{tabla}</div>
    </>
  );
}

// Lista compacta para teléfonos (mismo estilo que la de Vehículos).
export function ListaMovil({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-superficie dark:ring-1 dark:ring-inset dark:ring-slate-200 sm:hidden">
      {children}
    </ul>
  );
}

// Un ítem: título y valor arriba, subtítulo, y una línea con insignia y detalle.
export function ItemMovil({
  a,
  titulo,
  valor,
  subtitulo,
  insignia,
  pie,
  tenue,
  acciones,
  avatar,
}: {
  a?: string;
  titulo: ReactNode;
  valor?: ReactNode;
  subtitulo?: ReactNode;
  insignia?: ReactNode;
  pie?: ReactNode;
  tenue?: boolean; // anulado / inactivo
  acciones?: ReactNode; // botones (solo en ítems sin enlace)
  avatar?: ReactNode; // círculo a la izquierda (iniciales o ícono)
}) {
  const texto = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-slate-900">{titulo}</span>
        {valor !== undefined && (
          <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900">{valor}</span>
        )}
      </span>
      {subtitulo && (
        <span className="mt-0.5 block truncate text-xs text-slate-500">{subtitulo}</span>
      )}
      {(insignia || pie) && (
        <span className="mt-1.5 flex items-center justify-between gap-3">
          {insignia ?? <span />}
          {pie && <span className="min-w-0 truncate text-xs text-slate-500">{pie}</span>}
        </span>
      )}
    </>
  );
  const contenido = avatar ? (
    <span className="flex items-center gap-3">
      {avatar}
      <span className="min-w-0 flex-1">{texto}</span>
    </span>
  ) : (
    texto
  );
  const clase = cx('block px-4 py-3', tenue && 'opacity-60');
  return (
    <li>
      {a ? (
        <Link to={a} className={cx(clase, 'transition-colors active:bg-slate-50')}>
          {contenido}
        </Link>
      ) : (
        <div className={clase}>
          {contenido}
          {acciones && <span className="-ml-2.5 mt-1.5 flex flex-wrap gap-1">{acciones}</span>}
        </div>
      )}
    </li>
  );
}

export function Th({ children, derecha }: { children?: ReactNode; derecha?: boolean }) {
  return (
    <th
      className={cx(
        'whitespace-nowrap border-b border-slate-100 px-3.5 py-3 text-xs font-medium text-slate-500 first:pl-5 last:pr-5',
        derecha ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

export type Direccion = 'asc' | 'desc';

// Encabezado ordenable: clic alterna ascendente → descendente → sin orden.
// aria-sort anuncia el estado a lectores de pantalla.
export function ThOrdenable({
  children,
  derecha,
  direccion,
  onOrdenar,
}: {
  children: ReactNode;
  derecha?: boolean;
  direccion: Direccion | null;
  onOrdenar: (d: Direccion | null) => void;
}) {
  const Icono = direccion === 'asc' ? ArrowUp : direccion === 'desc' ? ArrowDown : ArrowUpDown;
  const siguiente = direccion === null ? 'asc' : direccion === 'asc' ? 'desc' : null;
  return (
    <th
      aria-sort={direccion === 'asc' ? 'ascending' : direccion === 'desc' ? 'descending' : 'none'}
      className={cx(
        'whitespace-nowrap border-b border-slate-100 px-2 py-1.5 text-xs font-medium first:pl-3.5 last:pr-3.5',
        derecha ? 'text-right' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={() => onOrdenar(siguiente)}
        className={cx(
          'group inline-flex h-7 items-center gap-1 rounded-full px-2 transition-colors hover:bg-slate-100',
          derecha && 'flex-row-reverse',
          direccion ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900',
        )}
        title={
          siguiente === 'asc'
            ? 'Ordenar ascendente'
            : siguiente === 'desc'
              ? 'Ordenar descendente'
              : 'Quitar orden'
        }
      >
        {children}
        <Icono
          className={cx(
            'size-3.5 shrink-0',
            direccion ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-600',
          )}
          aria-hidden
        />
      </button>
    </th>
  );
}

export function Td({
  children,
  derecha,
  className,
}: {
  children?: ReactNode;
  derecha?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cx(
        'whitespace-nowrap px-3.5 py-3 text-slate-700 first:pl-5 last:pr-5',
        derecha && 'text-right tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  );
}

// Clase para filas navegables de una tabla.
export const filaClicable =
  'cursor-pointer transition-colors duration-100 hover:bg-slate-50 [&>td:first-child]:text-slate-900';

export function Paginacion({
  total,
  limite,
  offset,
  onCambiar,
}: {
  total: number;
  limite: number;
  offset: number;
  onCambiar: (offset: number) => void;
}) {
  if (total <= limite) return null;
  const pagina = Math.floor(offset / limite) + 1;
  const paginas = Math.ceil(total / limite);
  return (
    <nav
      className="mt-4 flex items-center justify-between gap-3 text-[0.8125rem] text-slate-500"
      aria-label="Paginación"
    >
      <span className="tabular-nums">
        {offset + 1}–{Math.min(offset + limite, total)} de {total}
      </span>
      <div className="flex items-center gap-1.5">
        <Boton
          variante="secundario"
          chico
          disabled={pagina <= 1}
          onClick={() => onCambiar(offset - limite)}
          aria-label="Página anterior"
        >
          <ChevronLeft aria-hidden />
        </Boton>
        <span className="px-1 tabular-nums">
          {pagina} / {paginas}
        </span>
        <Boton
          variante="secundario"
          chico
          disabled={pagina >= paginas}
          onClick={() => onCambiar(offset + limite)}
          aria-label="Página siguiente"
        >
          <ChevronRight aria-hidden />
        </Boton>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- Modales y pestañas

export function Modal({
  titulo,
  descripcion,
  children,
  onCerrar,
  ancho = 'max-w-lg',
}: {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  onCerrar: () => void;
  ancho?: string;
}) {
  const [saliendo, setSaliendo] = useState(false);
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  // Sale por el mismo camino por el que entró (abajo en móvil, en su lugar en escritorio).
  const cerrar = useRef(() => {
    setSaliendo(true);
    window.setTimeout(() => cerrarRef.current(), 180);
  }).current;
  const { ref: panel, manejadores } = useArrastreCierre<HTMLDivElement>({
    eje: 'y',
    onCerrar: () => cerrarRef.current(),
  });

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    window.addEventListener('keydown', alPresionar);
    // Foco al diálogo (si nada dentro pidió autoFocus) y bloqueo del scroll de fondo.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', alPresionar);
      document.body.style.overflow = overflow;
    };
  }, [cerrar, panel]);

  return (
    <div
      className={cx(
        'fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 transition-opacity duration-200 starting:opacity-0 sm:items-start sm:p-4 sm:pt-[10vh]',
        saliendo && 'opacity-0',
      )}
      onMouseDown={cerrar}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal
        aria-label={titulo}
        tabIndex={-1}
        className={cx(
          'w-full rounded-t-2xl bg-superficie shadow-flotante outline-none sm:rounded-2xl',
          'transition-[opacity,transform] duration-300 ease-(--ease-drawer) starting:translate-y-full sm:duration-200 sm:ease-(--ease-out) sm:starting:translate-y-2 sm:starting:scale-[0.98] sm:starting:opacity-0',
          saliendo && 'translate-y-full sm:translate-y-1 sm:scale-[0.98] sm:opacity-0',
          ancho,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Cabecera: en móvil es también el asa para arrastrar la hoja hacia abajo */}
        <div className="touch-none select-none sm:touch-auto" {...manejadores}>
          <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
            <span className="h-1 w-9 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-3 sm:pt-5">
            <div>
              <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">
                {titulo}
              </h2>
              {descripcion && <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>}
            </div>
            <button
              type="button"
              onClick={cerrar}
              className="-mr-1.5 -mt-0.5 flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
              aria-label="Cerrar"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <div
          data-desplazable
          className="max-h-[80vh] overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:max-h-none sm:pb-5"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// Pie de acciones de un formulario dentro de un Modal o Tarjeta.
export function Acciones({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end', className)}>
      {children}
    </div>
  );
}

export function Pestanas<T extends string>({
  pestanas,
  actual,
  onCambiar,
}: {
  pestanas: { id: T; texto: string }[];
  actual: T;
  onCambiar: (id: T) => void;
}) {
  // En pantallas angostas la tira se desplaza: la pestaña activa queda a la vista
  // (ej. al abrir directo ?pestana=bitacora). Sin desborde no hace nada.
  const tira = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = tira.current;
    const activa = t?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!t || !activa || t.scrollWidth <= t.clientWidth) return;
    t.scrollTo({ left: activa.offsetLeft - (t.clientWidth - activa.offsetWidth) / 2 });
  }, [actual]);
  return (
    <div ref={tira} className="relative mb-6 max-w-full overflow-x-auto [scrollbar-width:none]">
      <div
        className="inline-flex gap-0.5 rounded-full bg-superficie p-1 dark:ring-1 dark:ring-inset dark:ring-slate-200"
        role="tablist"
      >
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === actual}
            onClick={() => onCambiar(p.id)}
            className={cx(
              'h-8 whitespace-nowrap rounded-full px-4 text-[0.8125rem] font-medium transition-[background-color,color] duration-150',
              p.id === actual
                ? 'bg-slate-900 text-invertido'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            {p.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

// Nota contextual dentro de una página (qué falta, qué significa un estado).
export function Nota({
  tono = 'info',
  children,
  accion,
}: {
  tono?: 'info' | 'aviso' | 'revision';
  children: ReactNode;
  accion?: ReactNode;
}) {
  const estilos = {
    info: 'bg-slate-50 text-slate-800 ring-1 ring-inset ring-slate-200 [&_svg]:text-slate-500',
    aviso: 'bg-crema text-amber-900 ring-1 ring-inset ring-amber-200/70 [&_svg]:text-ambar',
    revision: 'bg-rubor text-pink-900 ring-1 ring-inset ring-pink-200/70 [&_svg]:text-rosa',
  }[tono];
  const Icono = tono === 'aviso' ? TriangleAlert : Info;
  return (
    <div className={cx('flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm', estilos)}>
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1 leading-relaxed">{children}</div>
      {accion}
    </div>
  );
}

// Menú desplegable de acciones secundarias ("Más").
// Menú desplegable bajo un botón: se cierra al hacer clic fuera o con Escape.
// `alineado` es el borde del botón al que se alinea el menú; si no cabe hacia
// ese lado (en teléfonos el botón puede quedar en un borde), se abre al otro.
function useMenuFlotante(alineado: 'izquierda' | 'derecha') {
  const [abierto, setAbierto] = useState(false);
  const [haciaDerecha, setHaciaDerecha] = useState(alineado === 'izquierda');
  const caja = useRef<HTMLDivElement>(null);
  const alternar = () => {
    const b = caja.current?.getBoundingClientRect();
    setHaciaDerecha(
      alineado === 'derecha' ? !!b && b.right < 220 : !b || b.left + 220 < window.innerWidth,
    );
    setAbierto(!abierto);
  };
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);
  const claseMenu = cx(
    'absolute top-full z-30 mt-1.5 min-w-48 rounded-xl',
    haciaDerecha ? 'left-0 origin-top-left' : 'right-0 origin-top-right',
    'bg-superficie p-1 shadow-flotante transition-[opacity,transform] duration-150 ease-(--ease-out) starting:scale-[0.97] starting:opacity-0',
  );
  return { caja, abierto, setAbierto, alternar, claseMenu };
}

export function MenuAcciones({
  items,
  etiqueta: texto = 'Más acciones',
}: {
  items: {
    texto: string;
    onClick: () => void;
    peligro?: boolean;
    oculto?: boolean;
    ayuda?: string;
  }[];
  etiqueta?: string;
}) {
  const { caja, abierto, setAbierto, alternar, claseMenu } = useMenuFlotante('derecha');
  const visibles = items.filter((i) => !i.oculto);
  if (visibles.length === 0) return null;
  return (
    <div ref={caja} className="relative">
      <Boton
        variante="secundario"
        className="px-2.5"
        aria-label={texto}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={alternar}
        ayuda={abierto ? undefined : texto}
      >
        <MoreHorizontal aria-hidden />
      </Boton>
      {abierto && (
        <div role="menu" className={claseMenu}>
          {visibles.map((i) => (
            <button
              key={i.texto}
              type="button"
              role="menuitem"
              data-ayuda={i.ayuda}
              onClick={() => {
                setAbierto(false);
                i.onClick();
              }}
              className={cx(
                'block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                i.peligro ? 'text-red-700 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100',
              )}
            >
              {i.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { cx };
