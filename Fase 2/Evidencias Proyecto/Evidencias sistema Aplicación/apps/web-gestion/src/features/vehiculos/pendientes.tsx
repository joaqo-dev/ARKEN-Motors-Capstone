import type { Pendiente } from '@vitriauto/shared-types';
import { CircleAlert, CircleCheck, ChevronRight, CircleDashed } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { cx, Tarjeta } from '../../ui/componentes';
import type { VehiculoDetalle } from './tipos';

// Qué le falta a un vehículo (Módulo 7.6): lo obligatorio bloquea publicarlo;
// lo recomendado solo avisa.

// Marca compacta para el listado: el detalle va en la burbuja de ayuda.
export function MarcaPendientes({ pendientes }: { pendientes: Pendiente[] }) {
  if (pendientes.length === 0) return null;
  const bloquea = pendientes.some((p) => p.obligatorio);
  const detalle = `Falta: ${pendientes.map((p) => p.texto.toLowerCase()).join(', ')}`;
  return (
    <span
      data-ayuda={detalle}
      aria-label={detalle}
      className={cx(
        'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium',
        bloquea ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600',
      )}
    >
      {bloquea ? (
        <CircleAlert className="size-3.5" aria-hidden />
      ) : (
        <CircleDashed className="size-3.5" aria-hidden />
      )}
      {bloquea ? 'No se puede publicar' : `Faltan ${pendientes.length}`}
    </span>
  );
}

// Lista de chequeo en el resumen del vehículo: cada punto lleva a donde se completa.
export function ListaPendientes({ v }: { v: VehiculoDetalle }) {
  const [, setParams] = useSearchParams();
  const obligatorios = v.pendientes.filter((p) => p.obligatorio);
  const recomendados = v.pendientes.filter((p) => !p.obligatorio);
  // Cada sección tiene su pestaña con el mismo nombre (la ficha, en "Ficha técnica").
  const ir = (p: Pendiente) => setParams({ pestana: p.seccion }, { replace: true });

  if (v.pendientes.length === 0) {
    return (
      <Tarjeta>
        <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <CircleCheck className="size-4 text-lima-fuerte" aria-hidden />
          Ficha completa
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Tiene fotos, ficha, documentos al día e inspección aprobada.
        </p>
      </Tarjeta>
    );
  }
  return (
    <Tarjeta titulo="Qué le falta">
      <ul className="-mx-2 space-y-0.5">
        {[...obligatorios, ...recomendados].map((p) => (
          <li key={p.clave}>
            <button
              type="button"
              onClick={() => ir(p)}
              className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-slate-50"
            >
              {p.obligatorio ? (
                <CircleAlert className="size-4 shrink-0 text-red-500" aria-hidden />
              ) : (
                <CircleDashed className="size-4 shrink-0 text-slate-400" aria-hidden />
              )}
              <span className="min-w-0 flex-1 text-slate-700">
                {p.texto}
                {p.obligatorio && (
                  <span className="block text-xs text-red-600">Necesario para publicar</span>
                )}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-900"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
      {obligatorios.length === 0 && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
          Nada de esto impide publicarlo, pero ayuda a venderlo.
        </p>
      )}
    </Tarjeta>
  );
}
