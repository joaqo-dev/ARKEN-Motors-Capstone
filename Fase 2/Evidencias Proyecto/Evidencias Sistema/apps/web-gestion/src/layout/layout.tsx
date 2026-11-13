import { HistorialProvider } from '../lib/historial';
import {
  Inbox,
  Check,
  ChevronsUpDown,
  Globe,
  Info,
  LogOut,
  Menu as IconoMenu,
  Monitor,
  Moon,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSesion, useUsuario } from '../auth/sesion';
import { useSucursalActiva } from '../auth/sucursal-activa';
import { urlApi, urlVitrina } from '../lib/config';
import { etiqueta } from '../lib/formato';
import { useAyudas } from '../lib/ayudas';
import { useTema, type Tema } from '../lib/tema';
import { useArrastreCierre } from '../ui/arrastre';
import { BurbujaAyuda } from '../ui/ayuda';
import { cx, iniciales } from '../ui/componentes';
import { ListaDesplegable } from '../ui/selector';
import { CampanaNotificaciones } from '../features/notificaciones/panel';
import { MENU } from './navegacion';

// Cierra un desplegable al hacer clic fuera o presionar Escape.
function useDesplegable() {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
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
  return { abierto, setAbierto, caja };
}

// ---------------------------------------------------------------- Barra lateral

// "Espacio de trabajo": automotora + sucursal. El Admin General cambia de
// sucursal (o ve todas) desde aquí; los demás roles ven siempre la suya.
function Espacio({ pildora = false }: { pildora?: boolean }) {
  const { automotora, esGeneral } = useSesion();
  const { sucursalId, setSucursalId, sucursales, nombre } = useSucursalActiva();
  const nombreAutomotora = automotora?.nombre ?? 'Automotora';
  const contenido = (
    <>
      {automotora?.logoUrl ? (
        <img
          src={urlApi(automotora.logoUrl)}
          alt=""
          className={cx(
            'shrink-0 rounded-full object-cover ring-1 ring-slate-200',
            pildora ? 'size-8' : 'size-9',
          )}
        />
      ) : (
        <span
          className={cx(
            'flex shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-invertido',
            pildora ? 'size-8' : 'size-9',
          )}
        >
          {iniciales(nombreAutomotora)}
        </span>
      )}
      <span className="min-w-0 flex-1 text-left leading-tight">
        <span className="block truncate text-sm font-medium text-slate-900">
          {nombreAutomotora}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {esGeneral && !sucursalId ? 'Todas las sucursales' : nombre(sucursalId)}
        </span>
      </span>
    </>
  );
  const base = pildora
    ? 'relative flex h-10 max-w-64 items-center gap-2 rounded-full bg-superficie py-1 pl-1 pr-3 shadow-[0_1px_2px_rgb(0_0_0/0.05)] dark:ring-1 dark:ring-inset dark:ring-slate-200'
    : 'relative flex w-full items-center gap-2.5 rounded-2xl bg-superficie p-2 dark:ring-1 dark:ring-inset dark:ring-slate-200';
  if (!esGeneral) return <div className={base}>{contenido}</div>;
  return (
    <ListaDesplegable
      etiqueta="Sucursal"
      anchoMinimo={232}
      valor={sucursalId ?? ''}
      opciones={[
        { valor: '', texto: 'Todas las sucursales' },
        ...sucursales.map((s) => ({ valor: s.id, texto: s.nombre })),
      ]}
      onElegir={(v) => setSucursalId(v || null)}
      claseGatillo={cx(
        base,
        'text-left outline-none transition-shadow hover:shadow-[0_0_0_1px_var(--color-slate-300)] focus-visible:shadow-[0_0_0_2px_var(--color-slate-500)] aria-expanded:shadow-[0_0_0_1px_var(--color-slate-300)]',
      )}
      gatillo={() => (
        <>
          {contenido}
          <ChevronsUpDown className="size-4 shrink-0 text-slate-400" aria-hidden />
        </>
      )}
    />
  );
}

// Busca en el inventario; "/" enfoca el campo desde cualquier parte.
function Buscador({ pildora = false }: { pildora?: boolean }) {
  const navegar = useNavigate();
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || t.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      campo.current?.focus();
    };
    window.addEventListener('keydown', atajo);
    return () => window.removeEventListener('keydown', atajo);
  }, []);
  return (
    <form
      role="search"
      className="group relative"
      onSubmit={(e) => {
        e.preventDefault();
        navegar(`/vehiculos?q=${encodeURIComponent(texto.trim())}`);
        setTexto('');
        campo.current?.blur();
      }}
    >
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        ref={campo}
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar vehículo"
        aria-label="Buscar vehículo por marca, modelo o patente"
        className={cx(
          'w-full rounded-full pl-9 pr-8 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-500',
          pildora
            ? 'h-10 bg-superficie shadow-[0_1px_2px_rgb(0_0_0/0.05)] focus:shadow-[0_0_0_1px_var(--color-slate-900)] dark:ring-1 dark:ring-inset dark:ring-slate-200'
            : 'h-10 bg-superficie focus:ring-1 focus:ring-inset focus:ring-slate-900',
        )}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md border border-slate-200 font-sans text-[0.6875rem] text-slate-500 group-focus-within:hidden">
        /
      </kbd>
    </form>
  );
}

function Menu() {
  const { esAdmin, esGeneral } = useSesion();
  const grupos = MENU.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.admin || esAdmin) && (!i.general || esGeneral)),
  })).filter((g) => g.items.length > 0);
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:none]">
      {grupos.map((grupo, gi) => (
        <div key={grupo.seccion} className={cx(gi > 0 && 'mt-4')}>
          <p className="px-2.5 pb-1 text-xs text-slate-500">{grupo.seccion}</p>
          <ul className="space-y-px">
            {grupo.items.map(({ ruta, texto, icono: Icono }) => (
              <li key={ruta}>
                <NavLink
                  to={ruta}
                  end={ruta === '/'}
                  className={({ isActive }) =>
                    cx(
                      'flex h-10 items-center gap-2.5 rounded-full px-3.5 text-sm transition-colors duration-100',
                      isActive
                        ? 'bg-slate-900 font-medium text-invertido'
                        : 'text-slate-600 hover:bg-superficie hover:text-slate-900',
                    )
                  }
                >
                  <Icono className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  {texto}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// Tema del panel: claro, oscuro o el del sistema operativo (sigue el cambio en vivo).
const TEMAS: { valor: Tema; texto: string; icono: typeof Sun }[] = [
  { valor: 'claro', texto: 'Claro', icono: Sun },
  { valor: 'oscuro', texto: 'Oscuro', icono: Moon },
  { valor: 'sistema', texto: 'Según el sistema', icono: Monitor },
];

function SelectorTema() {
  const { tema, setTema } = useTema();
  return (
    <div role="group" aria-labelledby="titulo-tema">
      <p className="px-2.5 pb-1 pt-0.5 text-xs text-slate-500" id="titulo-tema">
        Tema
      </p>
      {TEMAS.map(({ valor, texto, icono: Icono }) => (
        <button
          key={valor}
          type="button"
          role="menuitemradio"
          aria-checked={tema === valor}
          onClick={() => setTema(valor)}
          className={cx(
            'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-100',
            tema === valor ? 'font-medium text-slate-950' : 'text-slate-700',
          )}
        >
          <Icono className="size-4 text-slate-400" aria-hidden />
          {texto}
          {tema === valor && <Check className="ml-auto size-4 text-slate-900" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

// Activa o apaga las descripciones de los botones (preferencia del navegador).
function InterruptorAyudas() {
  const { activas, setAyudas } = useAyudas();
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={activas}
      onClick={() => setAyudas(!activas)}
      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
    >
      <Info className="size-4 text-slate-400" aria-hidden />
      <span className="flex-1 leading-tight">
        Ayudas en botones
        <span className="block text-xs text-slate-500">Qué hace cada botón al pasar el mouse</span>
      </span>
      <span
        aria-hidden
        className={cx(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          activas ? 'bg-slate-900' : 'bg-slate-300',
        )}
      >
        <span
          className={cx(
            'absolute left-0.5 top-0.5 size-4 rounded-full bg-superficie shadow-sm transition-transform duration-200 ease-(--ease-out)',
            activas && 'translate-x-4',
          )}
        />
      </span>
    </button>
  );
}

// Menú de la cuenta (tema, ayudas y cerrar sesión). `redonda`: avatar del riel, el menú
// se abre hacia la derecha.
function Cuenta({ redonda = false }: { redonda?: boolean }) {
  const usuario = useUsuario();
  const { cerrarSesion } = useSesion();
  const navegar = useNavigate();
  const { abierto, setAbierto, caja } = useDesplegable();
  return (
    <div ref={caja} className={cx('relative', !redonda && 'p-3')}>
      {abierto && (
        <div
          role="menu"
          className={cx(
            'absolute z-50 rounded-2xl bg-superficie p-1.5 shadow-flotante transition-[opacity,transform] duration-150 ease-(--ease-out) starting:scale-[0.97] starting:opacity-0',
            redonda
              ? 'bottom-0 left-full ml-3 w-60 origin-bottom-left'
              : 'inset-x-3 bottom-full mb-1 origin-bottom',
          )}
        >
          <p className="truncate px-2.5 pt-1.5 text-sm font-medium text-slate-900">
            {usuario.nombre}
          </p>
          <p className="truncate px-2.5 pb-2 text-xs text-slate-500">
            {etiqueta(usuario.rol)} · {usuario.email}
          </p>
          <div className="mx-1 mb-1.5 border-t border-slate-200" />
          <SelectorTema />
          <div className="mx-1 my-1.5 border-t border-slate-200" />
          <InterruptorAyudas />
          <div className="mx-1 my-1.5 border-t border-slate-200" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
            onClick={async () => {
              await cerrarSesion();
              navegar('/login', { replace: true });
            }}
          >
            <LogOut className="size-4 text-slate-400" aria-hidden />
            Cerrar sesión
          </button>
        </div>
      )}
      {redonda ? (
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          aria-expanded={abierto}
          aria-haspopup="menu"
          aria-label={`Cuenta de ${usuario.nombre}`}
          title={usuario.nombre}
          className="flex size-11 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-800 transition-shadow hover:shadow-[0_0_0_2px_var(--color-slate-300)] aria-expanded:shadow-[0_0_0_2px_var(--color-slate-900)]"
        >
          {iniciales(usuario.nombre)}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          aria-expanded={abierto}
          aria-haspopup="menu"
          className="flex w-full items-center gap-2.5 rounded-full p-1.5 pr-3 text-left transition-colors hover:bg-superficie"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-800">
            {iniciales(usuario.nombre)}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-slate-900">
              {usuario.nombre}
            </span>
            <span className="block truncate text-xs text-slate-500">{etiqueta(usuario.rol)}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      )}
    </div>
  );
}

// Cajón del celular: el menú con nombres (en escritorio se usa el riel).
function BarraLateral() {
  return (
    <div className="flex h-full flex-col rounded-r-[28px] bg-lateral">
      <div className="space-y-2 p-3 pb-4">
        <Espacio />
        <Buscador />
      </div>
      <Menu />
      <Cuenta />
    </div>
  );
}

// Riel de escritorio: un círculo por módulo; el activo, negro. El nombre
// aparece al pasar el mouse o enfocar, en una etiqueta flotante fuera del
// riel para que no quede recortada.
function Riel() {
  const { esAdmin, esGeneral } = useSesion();
  const [etiquetaRiel, setEtiquetaRiel] = useState<{ texto: string; top: number } | null>(null);
  const grupos = MENU.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.admin || esAdmin) && (!i.general || esGeneral)),
  })).filter((g) => g.items.length > 0);
  const mostrar = (texto: string) => (e: { currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    setEtiquetaRiel({ texto, top: r.top + r.height / 2 });
  };
  const ocultar = () => setEtiquetaRiel(null);
  // Sin logo arriba: la automotora ya se ve en la esquina superior derecha.
  return (
    <div className="flex h-full flex-col items-center py-4">
      <nav
        aria-label="Principal"
        className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-2 py-1 [scrollbar-width:none] [@media(max-height:860px)]:gap-2.5 [@media(max-height:700px)]:[mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-12px),transparent)]"
        onScroll={ocultar}
      >
        {grupos.map((grupo) => (
          <ul
            key={grupo.seccion}
            aria-label={grupo.seccion}
            className="flex flex-col gap-1.5 [@media(max-height:860px)]:gap-1"
          >
            {grupo.items.map(({ ruta, texto, icono: Icono }) => (
              <li key={ruta}>
                <NavLink
                  to={ruta}
                  end={ruta === '/'}
                  aria-label={texto}
                  onMouseEnter={mostrar(texto)}
                  onMouseLeave={ocultar}
                  onFocus={mostrar(texto)}
                  onBlur={ocultar}
                  className={({ isActive }) =>
                    cx(
                      'flex size-11 items-center justify-center rounded-full transition-[background-color,color,box-shadow,transform] [@media(max-height:860px)]:size-10 duration-150 ease-(--ease-out) active:scale-[0.94]',
                      isActive
                        ? 'bg-slate-900 text-invertido'
                        : 'bg-superficie text-slate-600 shadow-[0_1px_2px_rgb(0_0_0/0.05)] hover:text-slate-950 hover:shadow-[0_0_0_1px_var(--color-slate-300)] dark:ring-1 dark:ring-inset dark:ring-slate-200',
                    )
                  }
                >
                  <Icono className="size-[18px]" strokeWidth={1.75} aria-hidden />
                </NavLink>
              </li>
            ))}
          </ul>
        ))}
      </nav>
      <div className="mt-4 shrink-0 [@media(max-height:860px)]:mt-2">
        <Cuenta redonda />
      </div>
      {etiquetaRiel && (
        <span
          role="tooltip"
          className="pointer-events-none fixed left-[84px] z-50 flex h-7 -translate-y-1/2 items-center whitespace-nowrap rounded-full bg-slate-900 px-3 text-xs font-medium text-invertido shadow-flotante ring-1 ring-white/20 animate-aparecer"
          style={{ top: etiquetaRiel.top }}
        >
          {etiquetaRiel.texto}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Barra superior

// Sección actual (ícono + nombre), a partir del menú.
function useSeccion() {
  const { pathname } = useLocation();
  const items = MENU.flatMap((g) => g.items);
  // Rutas fuera del menú lateral (a la bandeja se entra desde la campana).
  const extra = [{ ruta: '/notificaciones', texto: 'Bandeja de entrada', icono: Inbox }];
  return (
    [...items, ...extra].find((i) => i.ruta !== '/' && pathname.startsWith(i.ruta)) ??
    items.find((i) => i.ruta === '/')!
  );
}

// Abre la vitrina pública de la automotora en otra pestaña (mismo círculo que la campana).
function VerPaginaPublica() {
  const { automotora } = useSesion();
  const { activas } = useAyudas();
  if (!automotora) return null;
  const ayuda = 'Abre tu página pública (la vitrina que ven tus clientes) en otra pestaña';
  return (
    <a
      href={urlVitrina(automotora.subdominio)}
      target="_blank"
      rel="noreferrer"
      aria-label="Ver tu página pública (se abre en otra pestaña)"
      {...(activas ? { 'data-ayuda': ayuda } : { title: 'Ver página pública' })}
      className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-superficie text-slate-500 shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition-[color,box-shadow] hover:text-slate-900 hover:shadow-[0_0_0_1px_var(--color-slate-300)] dark:ring-1 dark:ring-inset dark:ring-slate-200"
    >
      <Globe className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
    </a>
  );
}

function BarraSuperior({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { icono: Icono, texto } = useSeccion();
  return (
    <header className="material sticky top-0 z-20 flex h-16 items-center gap-3 px-3 sm:px-6 lg:px-8">
      <button
        type="button"
        className="flex size-10 items-center justify-center rounded-full bg-superficie text-slate-700 shadow-[0_1px_2px_rgb(0_0_0/0.05)] active:scale-[0.94] lg:hidden"
        onClick={onAbrirMenu}
        aria-label="Abrir menú"
      >
        <IconoMenu className="size-5" aria-hidden />
      </button>
      <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
        <Icono className="size-4 shrink-0 text-slate-500" strokeWidth={1.75} aria-hidden />
        <span className="truncate">{texto}</span>
      </p>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden w-72 md:block">
          <Buscador pildora />
        </div>
        <div className="hidden lg:block">
          <Espacio pildora />
        </div>
        <VerPaginaPublica />
        <CampanaNotificaciones />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- Layout

export function Layout() {
  const [menuMovil, setMenuMovil] = useState(false);
  const { pathname } = useLocation();
  const principal = useRef<HTMLElement>(null);
  const cajon = useArrastreCierre<HTMLElement>({
    eje: 'x-',
    onCerrar: () => setMenuMovil(false),
    activo: menuMovil,
  });

  // Al navegar: cerrar el menú móvil y volver arriba.
  useEffect(() => {
    setMenuMovil(false);
    principal.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    if (!menuMovil) return;
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setMenuMovil(false);
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [menuMovil]);

  return (
    <div className="flex h-full bg-fondo">
      <BurbujaAyuda />
      <aside className="hidden w-[88px] shrink-0 lg:block">
        <Riel />
      </aside>

      {/* Menú móvil (cajón): se cierra también deslizándolo a la izquierda */}
      <div
        className={cx(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden',
          menuMovil ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMenuMovil(false)}
        aria-hidden
      />
      <aside
        ref={cajon.ref}
        {...cajon.manejadores}
        className={cx(
          'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] touch-pan-y rounded-r-[28px] shadow-2xl transition-transform duration-300 ease-(--ease-drawer) lg:hidden',
          menuMovil ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!menuMovil}
        inert={!menuMovil}
      >
        <BarraLateral />
        {menuMovil && (
          <button
            type="button"
            onClick={() => setMenuMovil(false)}
            className="absolute -right-12 top-3 flex size-10 items-center justify-center rounded-full bg-superficie text-slate-600 shadow-flotante"
            aria-label="Cerrar menú"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </aside>

      <main ref={principal} className="min-w-0 flex-1 overflow-y-auto">
        <BarraSuperior onAbrirMenu={() => setMenuMovil(true)} />
        <div className="mx-auto max-w-[84rem] px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
          <HistorialProvider>
            <Outlet />
          </HistorialProvider>
        </div>
      </main>
    </div>
  );
}
