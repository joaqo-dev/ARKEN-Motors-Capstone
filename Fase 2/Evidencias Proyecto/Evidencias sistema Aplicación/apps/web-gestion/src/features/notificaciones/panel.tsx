import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Check, CircleCheck, Inbox } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { haceCuanto } from '../../lib/formato';
import { cx, Esqueleto } from '../../ui/componentes';
import { Flotante } from '../../ui/flotante';
import {
  ICONO_TIPO,
  RUTA_REFERENCIA,
  TEXTO_REFERENCIA,
  TITULO_TIPO,
  useResolverNotificacion,
  type Notificacion,
} from './comun';

const MAXIMO = 6;

// Campana de la barra superior: abre un panel con las pendientes más recientes
// (no navega). Desde ahí se va al registro involucrado, se marca resuelta o se
// abre la bandeja de entrada completa.
export function CampanaNotificaciones() {
  const boton = useRef<HTMLButtonElement>(null);
  const titulo = useId();
  const [abierto, setAbierto] = useState(false);
  const resolver = useResolverNotificacion();

  const pendientes = useQuery({
    queryKey: ['notificaciones', 'PENDIENTE', 'panel'],
    queryFn: () =>
      api<{ items: Notificacion[]; total: number }>(
        'GET',
        `/notificaciones?estado=PENDIENTE&limit=${MAXIMO}`,
      ),
    refetchInterval: 60_000,
  });
  const total = pendientes.data?.total ?? 0;
  const items = pendientes.data?.items ?? [];

  const cerrar = (devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  };

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-label={total ? `Notificaciones: ${total} pendientes` : 'Notificaciones'}
        data-ayuda="Avisos que requieren atención: documentos por vencer, reservas y consignaciones por terminar"
        className={cx(
          'relative flex size-10 items-center justify-center rounded-full bg-superficie shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition-[color,box-shadow] dark:ring-1 dark:ring-inset dark:ring-slate-200',
          abierto
            ? 'text-slate-900 shadow-[0_0_0_1px_var(--color-slate-900)]'
            : 'text-slate-500 hover:text-slate-900 hover:shadow-[0_0_0_1px_var(--color-slate-300)]',
        )}
      >
        <Bell className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
        {total > 0 && (
          <span
            // key: cada vez que cambia la cantidad, el globo vuelve a "aparecer".
            key={total}
            className="animate-insignia absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.625rem] font-semibold text-white tabular-nums ring-2 ring-fondo"
          >
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      <Flotante
        ancla={boton}
        abierto={abierto}
        onCerrar={() => cerrar(false)}
        alinear="fin"
        className="w-[min(24rem,calc(100vw-1rem))]"
      >
        <div
          role="dialog"
          aria-labelledby={titulo}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              cerrar();
            }
          }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 id={titulo} className="text-sm font-medium text-slate-900">
              Notificaciones
            </h2>
            {total > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">
                {total} {total === 1 ? 'pendiente' : 'pendientes'}
              </span>
            )}
          </div>

          <div className="max-h-[min(26rem,60vh)] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
            {pendientes.isLoading ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <Esqueleto key={i} className="h-12" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-lima-suave text-slate-900">
                  <CircleCheck className="size-5" aria-hidden />
                </span>
                <p className="text-sm font-medium text-slate-900">Estás al día</p>
                <p className="mt-1 text-xs text-slate-500">
                  No hay vencimientos pendientes por revisar.
                </p>
              </div>
            ) : (
              <ul className="space-y-0.5 p-1.5">
                {items.map((n) => {
                  const Icono = ICONO_TIPO[n.tipo] ?? Bell;
                  return (
                    <li
                      key={n.id}
                      className="group flex gap-3 rounded-2xl px-2.5 py-3 transition-colors hover:bg-slate-50"
                    >
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-ambar/15 text-amber-700">
                        <Icono className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-slate-900">{n.mensaje}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {TITULO_TIPO[n.tipo] ?? 'Aviso'} · {n.sucursal.nombre} ·{' '}
                          {haceCuanto(n.fechaGeneracion)}
                        </p>
                        {n.referencias.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                            {n.referencias.map((r) => (
                              <Link
                                key={r.id}
                                to={`${RUTA_REFERENCIA[r.tipo]}/${r.id}`}
                                onClick={() => cerrar(false)}
                                className="text-xs font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] hover:decoration-slate-900"
                              >
                                {TEXTO_REFERENCIA[r.tipo]}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => resolver.mutate(n.id)}
                        disabled={resolver.isPending && resolver.variables === n.id}
                        className="flex size-8 shrink-0 items-center justify-center self-start rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                        aria-label="Marcar como resuelta"
                        title="Marcar como resuelta"
                      >
                        <Check className="size-4" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 p-2">
            <Link
              to="/notificaciones"
              onClick={() => cerrar(false)}
              className="flex h-9 items-center justify-center gap-2 rounded-full text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950"
            >
              <Inbox className="size-4" aria-hidden />
              Ver bandeja de entrada
              {total > MAXIMO && <span className="text-slate-500">· {total - MAXIMO} más</span>}
              <ArrowRight className="size-3.5 text-slate-400" aria-hidden />
            </Link>
          </div>
        </div>
      </Flotante>
    </>
  );
}
