import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Building2,
  CalendarDays,
  Car,
  FileText,
  MapPin,
  Paperclip,
  Pencil,
  Tag,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { urlApi } from '../../lib/config';
import { etiqueta, fecha, fechaHora, pesos } from '../../lib/formato';
import {
  Boton,
  Cargando,
  cx,
  Chip,
  DatoIcono,
  EncabezadoPagina,
  Insignia,
  MensajeError,
  Tarjeta,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { useAviso } from '../../ui/toast';
import { FormularioGasto } from '../vehiculos/paneles';
import { FormularioOperacional, type GastoListado } from './pagina';

interface GastoDetalle extends GastoListado {
  registradoPor: { id: string; nombre: string };
  fechaCreacion: string;
}

const enlace =
  'text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900';

// Detalle de un gasto (Módulo 8), identificado por su número correlativo. Desde
// aquí se edita o anula, y es el destino de los enlaces de la auditoría.
export function GastoPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [modal, setModal] = useState<'editar' | 'anular' | null>(null);

  const consulta = useQuery({
    queryKey: ['gastos', id],
    queryFn: () => api<GastoDetalle>('GET', `/gastos/${id}`),
  });
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['gastos'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    if (consulta.data?.vehiculo) {
      qc.invalidateQueries({ queryKey: ['vehiculo', consulta.data.vehiculo.id] });
    }
  };
  const anular = useMutation({
    mutationFn: (motivo: string) =>
      api('POST', `/gastos/${id}/anular`, { body: { motivo: motivo || undefined } }),
    onSuccess: () => {
      refrescar();
      setModal(null);
      avisar('Gasto anulado');
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  if (consulta.isLoading) return <Cargando />;
  if (!consulta.data) return <MensajeError error={consulta.error} />;
  const g = consulta.data;
  const activo = g.estado === 'ACTIVO';

  return (
    <>
      <EncabezadoPagina
        volver={{ a: '/gastos', texto: 'Gastos' }}
        titulo={`Gasto N° ${g.numero}`}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <Insignia valor={g.estado} />
            <Chip icono={g.tipo === 'VEHICULO' ? Car : Building2} className="bg-superficie">
              {g.tipo === 'VEHICULO' ? 'De vehículo' : 'Operacional'}
            </Chip>
            <Chip icono={MapPin} className="bg-superficie">
              {g.sucursal?.nombre ?? 'General de la automotora'}
            </Chip>
          </span>
        }
        acciones={
          activo && (
            <>
              <Boton
                ayuda="Corrige el monto, la categoría, la fecha o el comentario del gasto"
                variante="secundario"
                onClick={() => setModal('editar')}
              >
                <Pencil aria-hidden />
                Editar
              </Boton>
              <Boton
                ayuda="Anula el gasto: deja de sumar en los costos y queda en la auditoría"
                variante="fantasmaPeligro"
                onClick={() => setModal('anular')}
              >
                <Ban aria-hidden />
                Anular
              </Boton>
            </>
          )
        }
      />
      <Tarjeta className="max-w-3xl">
        <p className="text-sm text-slate-500">Monto</p>
        <p
          className={cx(
            'mt-2 text-[2.25rem] font-light leading-none tracking-[-0.04em] tabular-nums',
            activo ? 'text-slate-950' : 'text-slate-500 line-through',
          )}
        >
          {pesos(g.monto)}
        </p>
        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
          <DatoIcono icono={CalendarDays} etiqueta="Fecha del gasto">
            {fecha(g.fecha)}
          </DatoIcono>
          <DatoIcono icono={Tag} etiqueta="Categoría">
            {etiqueta(g.categoria)}
          </DatoIcono>
          {g.vehiculo ? (
            <DatoIcono icono={Car} etiqueta="Vehículo">
              <Link to={`/vehiculos/${g.vehiculo.id}?pestana=gastos`} className={enlace}>
                {g.vehiculo.descripcion}
              </Link>
              <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                {g.vehiculo.patente}
              </span>
            </DatoIcono>
          ) : (
            <DatoIcono icono={MapPin} etiqueta="Sucursal">
              {g.sucursal?.nombre ?? 'General de la automotora'}
            </DatoIcono>
          )}
          <DatoIcono icono={Paperclip} etiqueta="Boleta">
            {g.adjuntoUrl ? (
              <a href={urlApi(g.adjuntoUrl)} target="_blank" rel="noreferrer" className={enlace}>
                Ver boleta
              </a>
            ) : (
              <span className="font-normal text-slate-500">Sin boleta</span>
            )}
          </DatoIcono>
          <DatoIcono icono={UserRound} etiqueta="Registrado por">
            {g.registradoPor.nombre}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {fechaHora(g.fechaCreacion)}
            </span>
          </DatoIcono>
        </dl>
        <div className="mt-6 flex gap-3 rounded-2xl bg-slate-100 p-4 text-sm">
          <FileText className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
          <p className="whitespace-pre-line text-slate-700">
            {g.comentario || <span className="text-slate-500">Sin comentario</span>}
          </p>
        </div>
      </Tarjeta>

      {modal === 'editar' &&
        (g.tipo === 'VEHICULO' ? (
          <FormularioGasto
            vehiculoId={g.vehiculo!.id}
            gasto={g}
            onCerrar={() => setModal(null)}
            onGuardado={refrescar}
          />
        ) : (
          <FormularioOperacional gasto={g} onCerrar={() => setModal(null)} onGuardado={refrescar} />
        ))}
      {modal === 'anular' && (
        <Confirmar
          titulo="Anular gasto"
          mensaje={`¿Anular el gasto N° ${g.numero} por ${pesos(g.monto)}? Queda en el historial como anulado.`}
          textoConfirmar="Anular gasto"
          peligro
          pedirMotivo
          motivoOpcional
          cargando={anular.isPending}
          onConfirmar={(motivo) => anular.mutate(motivo)}
          onCerrar={() => setModal(null)}
        />
      )}
    </>
  );
}
