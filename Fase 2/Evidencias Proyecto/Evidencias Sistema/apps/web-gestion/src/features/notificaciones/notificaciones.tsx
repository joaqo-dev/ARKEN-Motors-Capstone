import { Bell, Check, CircleCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, qs } from '../../lib/api';
import {
  ICONO_TIPO,
  RUTA_REFERENCIA,
  TEXTO_REFERENCIA,
  TITULO_TIPO,
  useResolverNotificacion,
  type Notificacion,
} from './comun';
import { etiqueta, fechaHora } from '../../lib/formato';
import {
  Boton,
  BotonLink,
  Cargando,
  cx,
  EncabezadoPagina,
  MensajeError,
  Pestanas,
  Vacio,
} from '../../ui/componentes';

// Alertas del sistema (Módulo 13): se ven las de la propia sucursal (el Admin
// General, todas). Se marcan resueltas al atenderlas.
export function NotificacionesPage() {
  const [estado, setEstado] = useState<'PENDIENTE' | 'RESUELTA'>('PENDIENTE');

  const consulta = useQuery({
    queryKey: ['notificaciones', estado],
    queryFn: () =>
      api<{ items: Notificacion[]; total: number }>(
        'GET',
        `/notificaciones${qs({ estado, limit: 100 })}`,
      ),
  });

  const resolver = useResolverNotificacion();

  return (
    <>
      <EncabezadoPagina
        titulo="Bandeja de entrada"
        descripcion="Avisos de vencimiento de documentos legales, reservas y consignaciones."
      />
      <Pestanas
        pestanas={[
          { id: 'PENDIENTE', texto: 'Pendientes' },
          { id: 'RESUELTA', texto: 'Resueltas' },
        ]}
        actual={estado}
        onCambiar={setEstado}
      />
      {consulta.isLoading && <Cargando />}
      {consulta.error && <MensajeError error={consulta.error} />}
      {consulta.data && consulta.data.items.length === 0 && (
        <Vacio
          icono={estado === 'PENDIENTE' ? CircleCheck : Bell}
          titulo={estado === 'PENDIENTE' ? 'Estás al día' : 'Aún no hay notificaciones resueltas'}
        >
          {estado === 'PENDIENTE' &&
            'Aquí aparecerán los documentos, reservas y consignaciones por vencer.'}
        </Vacio>
      )}
      {!!consulta.data?.items.length && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-superficie dark:ring-1 dark:ring-inset dark:ring-slate-200">
          {consulta.data.items.map((n) => {
            const Icono = ICONO_TIPO[n.tipo] ?? Bell;
            return (
              <li key={n.id} className="flex gap-3.5 px-4 py-4 sm:px-5">
                <span
                  className={cx(
                    'flex size-8 shrink-0 items-center justify-center rounded-full',
                    n.estado === 'PENDIENTE'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-slate-100 text-slate-400',
                  )}
                >
                  <Icono className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900">{n.mensaje}</p>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
                    <span>{TITULO_TIPO[n.tipo] ?? etiqueta(n.tipo)}</span>
                    <span aria-hidden>·</span>
                    <span>{n.sucursal.nombre}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {n.estado === 'PENDIENTE'
                        ? fechaHora(n.fechaGeneracion)
                        : `Resuelta ${fechaHora(n.fechaResolucion)}`}
                    </span>
                  </p>
                  {n.referencias.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {n.referencias.map((r) => (
                        <BotonLink
                          key={r.id}
                          variante="secundario"
                          chico
                          to={`${RUTA_REFERENCIA[r.tipo]}/${r.id}`}
                        >
                          {TEXTO_REFERENCIA[r.tipo]}
                        </BotonLink>
                      ))}
                    </div>
                  )}
                </div>
                {n.estado === 'PENDIENTE' && (
                  <Boton
                    ayuda="La quita de pendientes; queda registrado quién la resolvió"
                    variante="fantasma"
                    chico
                    className="self-start"
                    cargando={resolver.isPending && resolver.variables === n.id}
                    onClick={() => resolver.mutate(n.id)}
                  >
                    <Check aria-hidden />
                    <span className="hidden sm:inline">Marcar resuelta</span>
                  </Boton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
