import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { fechaHora, km } from '../../lib/formato';
import { Boton, Cargando, Insignia, ItemMovil, MensajeError, Vacio } from '../../ui/componentes';
import { useAviso } from '../../ui/toast';
import type { VehiculoDetalle } from '../vehiculos/tipos';
import type { InspeccionDetalle, InspeccionResumen } from './tipos';

// Pestaña "Inspección" del vehículo: historial de informes y acceso para
// iniciar uno nuevo o continuar el borrador.
export function PanelInspecciones({ vehiculo }: { vehiculo: VehiculoDetalle }) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const enInventario = vehiculo.estado !== 'VENDIDO' && vehiculo.estado !== 'DADO_DE_BAJA';

  const lista = useQuery({
    queryKey: ['vehiculo', vehiculo.id, 'inspecciones'],
    queryFn: () => api<InspeccionResumen[]>('GET', `/vehiculos/${vehiculo.id}/inspecciones`),
  });
  const iniciar = useMutation({
    mutationFn: () => api<InspeccionDetalle>('POST', `/vehiculos/${vehiculo.id}/inspecciones`),
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ['vehiculo', vehiculo.id, 'inspecciones'] });
      navegar(`/vehiculos/${vehiculo.id}/inspecciones/${i.id}`);
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  if (lista.isLoading) return <Cargando />;
  if (lista.error) return <MensajeError error={lista.error} />;
  const items = lista.data ?? [];
  const borrador = items.find((i) => i.estado === 'BORRADOR');
  const abrir = (i: InspeccionResumen) => navegar(`/vehiculos/${vehiculo.id}/inspecciones/${i.id}`);

  const accion =
    enInventario &&
    (borrador ? (
      <Boton ayuda="Retoma la inspección en curso de este vehículo" onClick={() => abrir(borrador)}>
        Continuar borrador
      </Boton>
    ) : (
      <Boton
        ayuda="Inicia una inspección pre-compra con la lista estándar de puntos"
        cargando={iniciar.isPending}
        onClick={() => iniciar.mutate()}
      >
        <Plus aria-hidden />
        Nueva inspección
      </Boton>
    ));

  if (items.length === 0) {
    return (
      <Vacio icono={ClipboardCheck} titulo="Aún no hay inspecciones" accion={accion}>
        Revisión pre-compra con lista de chequeo y fotos. Si queda aprobada, se muestra en la página
        pública del vehículo y genera confianza en el comprador.
      </Vacio>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          La última inspección finalizada se publica en la página del vehículo si está aprobada.
        </p>
        {accion}
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-superficie dark:ring-1 dark:ring-inset dark:ring-slate-200">
        {items.map((i) => (
          <ItemMovil
            key={i.id}
            a={`/vehiculos/${vehiculo.id}/inspecciones/${i.id}`}
            avatar={
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <ClipboardCheck className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
              </span>
            }
            titulo={
              i.estado === 'BORRADOR'
                ? `Borrador · ${i.progreso.evaluados} de ${i.progreso.total} puntos`
                : `Inspección del ${fechaHora(i.fechaFinalizacion)}`
            }
            valor={km(i.kilometraje)}
            subtitulo={
              i.estado === 'BORRADOR'
                ? `Iniciada por ${i.iniciadaPor} el ${fechaHora(i.fechaCreacion)}`
                : `Por ${i.finalizadaPor}`
            }
            insignia={<Insignia valor={i.resultado ?? i.estado} />}
          />
        ))}
      </ul>
    </div>
  );
}
