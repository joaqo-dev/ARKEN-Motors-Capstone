import {
  EVALUACIONES_INSPECCION,
  MAX_FOTOS_POR_PUNTO,
  RESULTADOS_INSPECCION,
  sugerirResultado,
  type EvaluacionInspeccion,
  type ResultadoInspeccion,
} from '@vitriauto/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { urlApi } from '../../lib/config';
import { ACEPTA_FOTOS, etiqueta, fechaHora, km } from '../../lib/formato';
import {
  Boton,
  BotonA,
  Campo,
  Cargando,
  Chip,
  cx,
  EncabezadoPagina,
  Input,
  Insignia,
  Medidor,
  MensajeError,
  Modal,
  Tarjeta,
  Textarea,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { Lightbox } from '../../ui/lightbox';
import { useAviso } from '../../ui/toast';
import type { InspeccionDetalle, PuntoInspeccion, SeccionInspeccionDetalle } from './tipos';

// Color de cada evaluación: verde, ámbar, rojo y neutro (mismos tonos de estado del panel).
// Lo bueno en lima (el acento de lo positivo), lo regular en ámbar, lo malo en rojo.
const ESTILO: Record<EvaluacionInspeccion, { activo: string; punto: string; corto: string }> = {
  BUENO: {
    activo: 'bg-lima text-[#18181b] font-semibold',
    punto: 'bg-lima-fuerte',
    corto: 'Bueno',
  },
  REGULAR: {
    activo: 'bg-ambar text-[#18181b] font-semibold',
    punto: 'bg-ambar',
    corto: 'Regular',
  },
  MALO: {
    activo: 'bg-red-600 text-white font-semibold',
    punto: 'bg-red-500',
    corto: 'Malo',
  },
  NO_APLICA: {
    activo: 'bg-slate-900 text-invertido font-semibold',
    punto: 'bg-slate-300',
    corto: 'N/A',
  },
};

// Informe de inspección pre-compra (Módulo 7.11). En borrador cada cambio se
// guarda al instante (pensado para llenarlo en el patio, desde el celular).
export function InspeccionPage() {
  const { id: vehiculoId = '', inspeccionId = '' } = useParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const clave = ['inspeccion', inspeccionId];
  const [modal, setModal] = useState<'finalizar' | 'descartar' | null>(null);

  const consulta = useQuery({
    queryKey: clave,
    queryFn: () => api<InspeccionDetalle>('GET', `/inspecciones/${inspeccionId}`),
  });
  const refrescarListas = () => {
    qc.invalidateQueries({ queryKey: ['vehiculo', vehiculoId] });
  };

  const descartar = useMutation({
    mutationFn: () => api('DELETE', `/inspecciones/${inspeccionId}`),
    onSuccess: () => {
      refrescarListas();
      avisar('Borrador descartado');
      navegar(`/vehiculos/${vehiculoId}?pestana=inspeccion`, { replace: true });
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  if (consulta.isLoading) return <Cargando />;
  if (!consulta.data) return <MensajeError error={consulta.error} />;
  const ins = consulta.data;
  const borrador = ins.estado === 'BORRADOR';
  const puntos = ins.secciones.flatMap((s) => s.puntos);
  const pendientes = puntos.filter((p) => !p.evaluacion).length;

  return (
    <>
      <EncabezadoPagina
        volver={{
          a: `/vehiculos/${vehiculoId}?pestana=inspeccion`,
          texto: ins.vehiculo.descripcion,
        }}
        titulo="Inspección pre-compra"
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <Insignia valor={ins.resultado ?? ins.estado} />
            <span>{ins.vehiculo.descripcion}</span>
            <Chip mono className="bg-superficie">
              {ins.vehiculo.patente}
            </Chip>
          </span>
        }
        acciones={
          <>
            <BotonA
              ayuda="Abre el informe de la inspección en PDF"
              href={urlApi(`/inspecciones/${ins.id}/pdf`)}
              target="_blank"
              rel="noreferrer"
            >
              <Download aria-hidden />
              PDF
            </BotonA>
            {borrador && (
              <>
                <Boton
                  ayuda="Borra este borrador de inspección; queda en la auditoría"
                  variante="fantasmaPeligro"
                  onClick={() => setModal('descartar')}
                >
                  Descartar
                </Boton>
                <Boton
                  ayuda="Cierra la inspección con su resultado; después ya no se puede editar"
                  onClick={() => setModal('finalizar')}
                >
                  Finalizar
                </Boton>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-5">
          {ins.secciones.map((s) => (
            <Seccion key={s.codigo} seccion={s} inspeccionId={ins.id} editable={borrador} />
          ))}
        </div>
        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Resumen ins={ins} pendientes={pendientes} />
          <Datos ins={ins} editable={borrador} />
        </div>
      </div>

      {modal === 'finalizar' && (
        <FinalizarModal ins={ins} pendientes={pendientes} onCerrar={() => setModal(null)} />
      )}
      {modal === 'descartar' && (
        <Confirmar
          titulo="Descartar borrador"
          mensaje="Se borran las evaluaciones, observaciones y fotos de este borrador. No se puede deshacer."
          textoConfirmar="Descartar"
          peligro
          cargando={descartar.isPending}
          onConfirmar={() => descartar.mutate()}
          onCerrar={() => setModal(null)}
        />
      )}
    </>
  );
}

function Resumen({ ins, pendientes }: { ins: InspeccionDetalle; pendientes: number }) {
  const puntos = ins.secciones.flatMap((s) => s.puntos);
  const total = puntos.length;
  const conteo = (e: EvaluacionInspeccion) => puntos.filter((p) => p.evaluacion === e).length;
  return (
    <Tarjeta titulo={ins.estado === 'BORRADOR' ? 'Avance' : 'Resultado'}>
      {ins.estado === 'BORRADOR' ? (
        <>
          <p className="text-[2.25rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950">
            {total - pendientes}
            <span className="text-slate-400">/{total}</span>
          </p>
          <p className="mt-1.5 text-xs text-slate-500">puntos evaluados</p>
          <div className="mt-4">
            <Medidor valor={total ? (total - pendientes) / total : 0} marcas={30} />
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <Insignia valor={ins.resultado!} />
          <p className="pt-1 text-xs text-slate-500">
            Finalizada el {fechaHora(ins.fechaFinalizacion)} por {ins.finalizadaPor}
          </p>
        </div>
      )}
      {/* Reparto de las evaluaciones: cada tramo en su píldora, en el orden de la escala */}
      <div className="mt-5 flex h-2.5 gap-1" aria-hidden>
        {EVALUACIONES_INSPECCION.filter((e) => conteo(e) > 0).map((e) => (
          <span
            key={e}
            className={cx('rounded-full', ESTILO[e].punto)}
            style={{ width: `${(conteo(e) / Math.max(total, 1)) * 100}%` }}
          />
        ))}
        {pendientes > 0 && (
          <span
            className="rounded-full bg-slate-100"
            style={{ width: `${(pendientes / Math.max(total, 1)) * 100}%` }}
          />
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {EVALUACIONES_INSPECCION.map((e) => (
          <div key={e} className="flex items-center gap-2">
            <span className={cx('size-2 rounded-full', ESTILO[e].punto)} aria-hidden />
            <dt className="text-slate-500">{ESTILO[e].corto}</dt>
            <dd className="ml-auto font-medium tabular-nums text-slate-900">{conteo(e)}</dd>
          </div>
        ))}
      </dl>
    </Tarjeta>
  );
}

// Kilometraje al inspeccionar y observaciones generales (públicas).
function Datos({ ins, editable }: { ins: InspeccionDetalle; editable: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const guardar = useMutation({
    mutationFn: (cambios: { kilometraje?: number; observaciones?: string | null }) =>
      api<InspeccionDetalle>('PATCH', `/inspecciones/${ins.id}`, { body: cambios }),
    onSuccess: (d) => qc.setQueryData(['inspeccion', ins.id], d),
    onError: (e) => avisar(e.message, 'error'),
  });
  if (!editable) {
    return (
      <Tarjeta titulo="Datos">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Kilometraje</dt>
            <dd className="font-medium">{km(ins.kilometraje)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Observaciones generales</dt>
            <dd className="whitespace-pre-line text-slate-700">
              {ins.observaciones || <span className="text-slate-500">Sin observaciones</span>}
            </dd>
          </div>
        </dl>
      </Tarjeta>
    );
  }
  return (
    <Tarjeta titulo="Datos">
      <div className="space-y-4">
        <Campo etiqueta="Kilometraje al inspeccionar">
          <Input
            type="number"
            miles
            defaultValue={ins.kilometraje}
            onBlur={(e) => {
              const valor = Number(e.target.value);
              if (Number.isFinite(valor) && valor >= 0 && valor !== ins.kilometraje) {
                guardar.mutate({ kilometraje: valor });
              }
            }}
          />
        </Campo>
        <Campo etiqueta="Observaciones generales" ayuda="Se publican junto al informe.">
          <Textarea
            maxLength={2000}
            defaultValue={ins.observaciones ?? ''}
            onBlur={(e) => {
              if (e.target.value.trim() !== (ins.observaciones ?? '')) {
                guardar.mutate({ observaciones: e.target.value.trim() || null });
              }
            }}
          />
        </Campo>
      </div>
    </Tarjeta>
  );
}

function Seccion({
  seccion,
  inspeccionId,
  editable,
}: {
  seccion: SeccionInspeccionDetalle;
  inspeccionId: string;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState('');
  const evaluados = seccion.puntos.filter((p) => p.evaluacion).length;

  const agregar = useMutation({
    mutationFn: () =>
      api<InspeccionDetalle>('POST', `/inspecciones/${inspeccionId}/puntos`, {
        body: { seccion: seccion.codigo, nombre },
      }),
    onSuccess: (d) => {
      qc.setQueryData(['inspeccion', inspeccionId], d);
      setNombre('');
      setAgregando(false);
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  return (
    <Tarjeta
      titulo={seccion.nombre}
      acciones={
        <Chip
          className={cx(
            'mr-1.5 mt-1 tabular-nums',
            evaluados === seccion.puntos.length && 'bg-lima-suave text-slate-900',
          )}
        >
          {evaluados}/{seccion.puntos.length}
        </Chip>
      }
      sinRelleno
    >
      {/* Contenedor: cada punto decide su disposición por el ancho de la tarjeta, no de la ventana. */}
      <ul className="@container divide-y divide-slate-100 border-t border-slate-100">
        {seccion.puntos.map((p) => (
          <Punto key={p.id} punto={p} inspeccionId={inspeccionId} editable={editable} />
        ))}
      </ul>
      {editable && (
        <div className="border-t border-slate-100 px-5 py-3">
          {agregando ? (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (nombre.trim()) agregar.mutate();
              }}
            >
              <Input
                autoFocus
                placeholder="Qué se revisa (ej. Cámara de retroceso)"
                maxLength={160}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <div className="flex gap-2">
                <Boton type="submit" chico cargando={agregar.isPending} disabled={!nombre.trim()}>
                  Agregar
                </Boton>
                <Boton variante="fantasma" chico onClick={() => setAgregando(false)}>
                  Cancelar
                </Boton>
              </div>
            </form>
          ) : (
            <Boton
              ayuda="Agrega un punto propio a esta sección de la lista"
              variante="fantasma"
              chico
              className="-ml-2.5"
              onClick={() => setAgregando(true)}
            >
              <Plus aria-hidden />
              Agregar punto
            </Boton>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

function Punto({
  punto,
  inspeccionId,
  editable,
}: {
  punto: PuntoInspeccion;
  inspeccionId: string;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const clave = ['inspeccion', inspeccionId];
  const tieneDetalle = Boolean(punto.observacion || punto.notaInterna || punto.fotos.length);
  const [abierto, setAbierto] = useState(tieneDetalle);
  const [visor, setVisor] = useState<number | null>(null);
  const archivos = useRef<HTMLInputElement>(null);

  // Reemplaza el punto en la caché sin recargar toda la inspección.
  const reemplazar = (nuevo: PuntoInspeccion) =>
    qc.setQueryData<InspeccionDetalle>(
      clave,
      (d) =>
        d && {
          ...d,
          secciones: d.secciones.map((s) => ({
            ...s,
            puntos: s.puntos.map((p) => (p.id === nuevo.id ? nuevo : p)),
          })),
        },
    );

  const actualizar = useMutation({
    mutationFn: (
      cambios: Partial<Pick<PuntoInspeccion, 'evaluacion' | 'observacion' | 'notaInterna'>>,
    ) =>
      api<PuntoInspeccion>('PATCH', `/inspecciones/${inspeccionId}/puntos/${punto.id}`, {
        body: cambios,
      }),
    // Optimista: la evaluación se marca al instante.
    onMutate: (cambios) => reemplazar({ ...punto, ...cambios }),
    onSuccess: reemplazar,
    onError: (e) => {
      reemplazar(punto);
      avisar(e.message, 'error');
    },
  });
  const eliminar = useMutation({
    mutationFn: () =>
      api<InspeccionDetalle>('DELETE', `/inspecciones/${inspeccionId}/puntos/${punto.id}`),
    onSuccess: (d) => qc.setQueryData(clave, d),
    onError: (e) => avisar(e.message, 'error'),
  });
  const subir = useMutation({
    mutationFn: (lista: FileList) => {
      const form = new FormData();
      for (const f of Array.from(lista)) form.append('fotos', f);
      return api<PuntoInspeccion>(
        'POST',
        `/inspecciones/${inspeccionId}/puntos/${punto.id}/fotos`,
        { body: form },
      );
    },
    onSuccess: reemplazar,
    onError: (e) => avisar(e.message, 'error'),
    onSettled: () => {
      if (archivos.current) archivos.current.value = '';
    },
  });
  const quitarFoto = useMutation({
    mutationFn: (fotoId: string) => api('DELETE', `/inspecciones/${inspeccionId}/fotos/${fotoId}`),
    onSuccess: (_r, fotoId) =>
      reemplazar({ ...punto, fotos: punto.fotos.filter((f) => f.id !== fotoId) }),
    onError: (e) => avisar(e.message, 'error'),
  });

  const evaluar = (e: EvaluacionInspeccion) => {
    actualizar.mutate({ evaluacion: punto.evaluacion === e ? null : e });
    // Regular o Malo: se abre el detalle para dejar la observación.
    if (e === 'REGULAR' || e === 'MALO') setAbierto(true);
  };

  return (
    <li className="px-5 py-3">
      <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span className="text-sm text-slate-800">{punto.nombre}</span>
          {punto.personalizado && (
            <Chip className="h-5 shrink-0 px-2 text-[0.6875rem]">Agregado</Chip>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {editable ? (
            <div
              role="radiogroup"
              aria-label={`Evaluación de ${punto.nombre}`}
              className="grid grid-cols-4 gap-0.5 rounded-full bg-slate-100 p-1"
            >
              {EVALUACIONES_INSPECCION.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={punto.evaluacion === e}
                  onClick={() => evaluar(e)}
                  className={cx(
                    'h-8 min-w-[3.75rem] rounded-full px-2.5 text-xs font-medium transition-[background-color,color,transform] duration-150 ease-(--ease-out) active:scale-[0.97]',
                    punto.evaluacion === e
                      ? ESTILO[e].activo
                      : 'text-slate-600 hover:bg-superficie hover:text-slate-900',
                  )}
                >
                  {ESTILO[e].corto}
                </button>
              ))}
            </div>
          ) : (
            <Insignia
              valor={punto.evaluacion ?? 'PENDIENTE'}
              texto={punto.evaluacion ? etiqueta(punto.evaluacion) : 'Sin evaluar'}
              tono={
                punto.evaluacion === 'BUENO'
                  ? 'exito'
                  : punto.evaluacion === 'REGULAR'
                    ? 'aviso'
                    : punto.evaluacion === 'MALO'
                      ? 'peligro'
                      : 'neutro'
              }
            />
          )}
          {(editable || tieneDetalle) && (
            <button
              type="button"
              onClick={() => setAbierto(!abierto)}
              aria-expanded={abierto}
              aria-label={abierto ? 'Ocultar detalle' : 'Agregar detalle'}
              title={abierto ? 'Ocultar detalle' : 'Observación y fotos'}
              className="flex size-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ChevronDown
                className={cx('size-4 transition-transform duration-200', abierto && 'rotate-180')}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>

      {abierto && (
        <div className="mt-3 space-y-3">
          {editable ? (
            <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
              <Campo etiqueta="Observación" ayuda="Se publica con el informe.">
                <Textarea
                  rows={2}
                  maxLength={1000}
                  defaultValue={punto.observacion ?? ''}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (punto.observacion ?? '')) {
                      actualizar.mutate({ observacion: e.target.value.trim() || null });
                    }
                  }}
                />
              </Campo>
              <Campo etiqueta="Nota interna" ayuda="Solo la ve el equipo; nunca se publica.">
                <Textarea
                  rows={2}
                  maxLength={1000}
                  defaultValue={punto.notaInterna ?? ''}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (punto.notaInterna ?? '')) {
                      actualizar.mutate({ notaInterna: e.target.value.trim() || null });
                    }
                  }}
                />
              </Campo>
            </div>
          ) : (
            <>
              {punto.observacion && <p className="text-sm text-slate-700">{punto.observacion}</p>}
              {punto.notaInterna && (
                <p className="text-sm text-slate-500">
                  <span className="font-medium">Nota interna:</span> {punto.notaInterna}
                </p>
              )}
            </>
          )}

          {(editable || punto.fotos.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {punto.fotos.map((f, i) => (
                <div key={f.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => setVisor(i)}
                    className="block overflow-hidden rounded-xl"
                    aria-label={`Ver foto ${i + 1}`}
                  >
                    <img src={urlApi(f.url)} alt="" className="h-16 w-20 object-cover" />
                  </button>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => quitarFoto.mutate(f.id)}
                      aria-label="Quitar foto"
                      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-slate-900 text-invertido opacity-90 shadow-sm transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              {editable && punto.fotos.length < MAX_FOTOS_POR_PUNTO && (
                <>
                  <input
                    ref={archivos}
                    type="file"
                    accept={ACEPTA_FOTOS}
                    multiple
                    hidden
                    onChange={(e) => e.target.files?.length && subir.mutate(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => archivos.current?.click()}
                    disabled={subir.isPending}
                    className="flex h-16 w-20 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-slate-300 text-[0.6875rem] text-slate-500 transition-colors hover:border-slate-900 hover:text-slate-900 disabled:opacity-60"
                  >
                    <ImagePlus className="size-4" aria-hidden />
                    {subir.isPending ? 'Subiendo…' : 'Foto'}
                  </button>
                </>
              )}
              {editable && punto.personalizado && (
                <Boton
                  ayuda="Quita este punto agregado (los de la lista estándar se marcan “No aplica”)"
                  variante="fantasmaPeligro"
                  chico
                  className="ml-auto self-end"
                  cargando={eliminar.isPending}
                  onClick={() => eliminar.mutate()}
                >
                  <Trash2 aria-hidden />
                  Quitar punto
                </Boton>
              )}
            </div>
          )}
        </div>
      )}

      {visor !== null && (
        <Lightbox
          fotos={punto.fotos.map((f) => ({ url: urlApi(f.url) }))}
          inicial={visor}
          titulo={punto.nombre}
          onCerrar={() => setVisor(null)}
        />
      )}
    </li>
  );
}

function FinalizarModal({
  ins,
  pendientes,
  onCerrar,
}: {
  ins: InspeccionDetalle;
  pendientes: number;
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  // Se calcula con los puntos de la caché, que se actualizan al evaluar cada uno; el
  // resultadoSugerido que trae la API queda desfasado hasta recargar la página.
  const sugerido = sugerirResultado(
    ins.secciones.flatMap((s) => s.puntos.map((p) => p.evaluacion)),
  );
  const [resultado, setResultado] = useState<ResultadoInspeccion>(sugerido);
  const finalizar = useMutation({
    mutationFn: () =>
      api<InspeccionDetalle>('POST', `/inspecciones/${ins.id}/finalizar`, { body: { resultado } }),
    onSuccess: (d) => {
      qc.setQueryData(['inspeccion', ins.id], d);
      qc.invalidateQueries({ queryKey: ['vehiculo', ins.vehiculo.id] });
      avisar('Inspección finalizada');
      onCerrar();
    },
    onError: (e) => avisar(e.message, 'error'),
  });
  return (
    <Modal titulo="Finalizar inspección" onCerrar={onCerrar}>
      {pendientes > 0 ? (
        <p className="text-sm text-slate-600">
          Faltan <strong className="text-slate-900">{pendientes}</strong>{' '}
          {pendientes === 1 ? 'punto' : 'puntos'} por evaluar. Márcalos (o como "N/A" si no
          corresponden) antes de finalizar.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-600">
            Una vez finalizada no se puede modificar. Si queda aprobada (con o sin observaciones),
            se publica en la página del vehículo.
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Resultado</legend>
            {RESULTADOS_INSPECCION.map((r) => (
              <label
                key={r}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 ring-1 ring-inset transition-colors',
                  resultado === r
                    ? 'bg-slate-50 ring-2 ring-slate-900'
                    : 'ring-slate-200 hover:bg-slate-50',
                )}
              >
                <input
                  type="radio"
                  name="resultado"
                  className="size-4"
                  checked={resultado === r}
                  onChange={() => setResultado(r)}
                />
                <span className="text-sm font-medium text-slate-900">{etiqueta(r)}</span>
                {r === sugerido && (
                  <span className="ml-auto text-xs text-slate-500">Sugerido</span>
                )}
              </label>
            ))}
          </fieldset>
        </>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar}>
          {pendientes > 0 ? 'Volver' : 'Cancelar'}
        </Boton>
        {pendientes === 0 && (
          <Boton
            ayuda="Cierra la inspección: queda en la bitácora del vehículo y, si se aprueba, su sello se ve en la página pública"
            cargando={finalizar.isPending}
            onClick={() => finalizar.mutate()}
          >
            Finalizar inspección
          </Boton>
        )}
      </div>
    </Modal>
  );
}
