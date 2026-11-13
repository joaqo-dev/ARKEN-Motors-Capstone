import {
  avisoMesRevision,
  RESPALDOS_POR_TIPO,
  sugerirVencimientoRevisionTecnica,
  TipoDocumentoLegal,
  validarDocumentoLegal,
  vencimientosPosibles,
  type RespaldoDocumentoLegal,
} from '@vitriauto/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BadgeDollarSign,
  Ban,
  CalendarClock,
  Circle,
  CirclePlus,
  ClipboardCheck,
  FileText,
  Handshake,
  ImagePlus,
  Paperclip,
  Percent,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Tag,
  Trash,
  TrendingUp,
  Upload,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormulario } from '../../lib/formulario';
import { api } from '../../lib/api';
import { urlApi } from '../../lib/config';
import {
  etiqueta,
  fecha,
  fechaHora,
  hoy,
  pesos,
  ACEPTA_FOTOS,
  ACEPTA_DOCUMENTOS,
} from '../../lib/formato';
import {
  Boton,
  BotonIcono,
  Campo,
  Cargando,
  cx,
  filaClicable,
  Indicador,
  Tarjeta,
  Input,
  Insignia,
  Modal,
  Nota,
  Opciones,
  Segmentado,
  Select,
  Tabla,
  Td,
  Textarea,
  Th,
  Vacio,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { InputArchivo } from '../../ui/input-archivo';
import { Lightbox } from '../../ui/lightbox';
import { useAviso } from '../../ui/toast';
import { SelectorVehiculo } from '../comercial/comun';
import type {
  Balance,
  DocumentoLegal,
  EventoBitacora,
  Gasto,
  VehiculoDetalle,
  VehiculoListado,
} from './tipos';

function useRefrescarVehiculo(id: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['vehiculo', id] });
    qc.invalidateQueries({ queryKey: ['vehiculos'] });
  };
}

// ---------------------------------------------------------------- Fotos

// 1 a 30 fotos; la primera es la portada.
export function PanelFotos({ vehiculo }: { vehiculo: VehiculoDetalle }) {
  const refrescar = useRefrescarVehiculo(vehiculo.id);
  const avisar = useAviso();
  const input = useRef<HTMLInputElement>(null);
  const vendido = vehiculo.estado === 'VENDIDO';
  const [fotoAbierta, setFotoAbierta] = useState<number | null>(null);

  const subir = useMutation({
    mutationFn: (archivos: FileList) => {
      const form = new FormData();
      Array.from(archivos).forEach((a) => form.append('fotos', a));
      return api('POST', `/vehiculos/${vehiculo.id}/fotos`, { body: form });
    },
    onSuccess: () => {
      refrescar();
      avisar('Fotos subidas');
    },
    onError: (e) => avisar(e.message, 'error'),
    onSettled: () => {
      if (input.current) input.current.value = '';
    },
  });
  const [borrando, setBorrando] = useState<{ id: string; indice: number } | null>(null);
  const eliminar = useMutation({
    mutationFn: (fotoId: string) => api('DELETE', `/vehiculos/${vehiculo.id}/fotos/${fotoId}`),
    onSuccess: () => {
      refrescar();
      setBorrando(null);
      avisar('Foto eliminada');
    },
    onError: (e) => avisar(e.message, 'error'),
  });
  const reordenar = useMutation({
    mutationFn: (ids: string[]) =>
      api('PUT', `/vehiculos/${vehiculo.id}/fotos/orden`, { body: { fotoIds: ids } }),
    onSuccess: refrescar,
    onError: (e) => avisar(e.message, 'error'),
  });

  const mover = (indice: number, destino: number) => {
    const ids = vehiculo.fotos.map((f) => f.id);
    const [id] = ids.splice(indice, 1);
    ids.splice(destino, 0, id);
    reordenar.mutate(ids);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {vehiculo.fotos.length}/30 fotos · JPG, PNG, WEBP o HEIC (iPhone) de hasta 12 MB; se
          optimizan solas. La primera es la portada.
        </p>
        {!vendido && (
          <>
            <input
              ref={input}
              type="file"
              accept={ACEPTA_FOTOS}
              multiple
              hidden
              onChange={(e) => e.target.files?.length && subir.mutate(e.target.files)}
            />
            <Boton
              ayuda="Agrega fotos (hasta 30); la primera es la portada en tu página pública"
              cargando={subir.isPending}
              onClick={() => input.current?.click()}
              disabled={vehiculo.fotos.length >= 30}
            >
              <Upload aria-hidden />
              Subir fotos
            </Boton>
          </>
        )}
      </div>
      {vehiculo.fotos.length === 0 ? (
        <Vacio icono={ImagePlus} titulo="Sin fotos">
          Sube al menos una foto para poder publicar el vehículo.
        </Vacio>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotoAbierta !== null && (
            <Lightbox
              fotos={vehiculo.fotos.map((f) => ({ url: urlApi(f.url) }))}
              inicial={fotoAbierta}
              titulo={`${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.anio}`}
              onCerrar={() => setFotoAbierta(null)}
            />
          )}
          {vehiculo.fotos.map((f, i) => (
            <figure
              key={f.id}
              className="group overflow-hidden rounded-2xl bg-superficie dark:ring-1 dark:ring-inset dark:ring-slate-200"
            >
              <button
                type="button"
                onClick={() => setFotoAbierta(i)}
                className="relative block w-full cursor-zoom-in"
                aria-label={`Ver la foto ${i + 1} en grande`}
              >
                <img
                  src={urlApi(f.url)}
                  alt={`Foto ${i + 1}`}
                  className="aspect-[4/3] w-full object-cover"
                />
                {i === 0 && (
                  <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-xs font-medium text-slate-900 shadow-sm">
                    Portada
                  </span>
                )}
              </button>
              {!vendido && (
                <figcaption className="flex flex-wrap items-center justify-between gap-1 px-2 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    <Boton
                      ayuda="Mueve la foto un lugar a la izquierda"
                      variante="fantasma"
                      chico
                      disabled={i === 0 || reordenar.isPending}
                      onClick={() => mover(i, i - 1)}
                      aria-label="Mover a la izquierda"
                    >
                      <ArrowLeft aria-hidden />
                    </Boton>
                    <Boton
                      ayuda="Mueve la foto un lugar a la derecha"
                      variante="fantasma"
                      chico
                      disabled={i === vehiculo.fotos.length - 1 || reordenar.isPending}
                      onClick={() => mover(i, i + 1)}
                      aria-label="Mover a la derecha"
                    >
                      <ArrowRight aria-hidden />
                    </Boton>
                    {i > 0 && (
                      <Boton
                        ayuda="La deja primera: es la que se ve en los listados y en tu página pública"
                        variante="fantasma"
                        chico
                        disabled={reordenar.isPending}
                        onClick={() => mover(i, 0)}
                      >
                        Usar de portada
                      </Boton>
                    )}
                  </div>
                  <Boton
                    ayuda="Elimina la foto del vehículo"
                    variante="fantasma"
                    chico
                    className="text-slate-500 hover:bg-red-50 hover:text-red-600"
                    onClick={() => setBorrando({ id: f.id, indice: i })}
                    aria-label="Eliminar foto"
                  >
                    <Trash aria-hidden />
                  </Boton>
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
      {borrando && (
        <Confirmar
          titulo="Eliminar foto"
          mensaje={
            borrando.indice === 0
              ? 'Es la portada: la siguiente foto pasará a ser la portada. Esta acción no se puede deshacer.'
              : 'La foto se elimina del vehículo y de la página pública. Esta acción no se puede deshacer.'
          }
          textoConfirmar="Eliminar foto"
          peligro
          cargando={eliminar.isPending}
          onConfirmar={() => eliminar.mutate(borrando.id)}
          onCerrar={() => setBorrando(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Documentos legales

interface DatosDocumento {
  respaldo: RespaldoDocumentoLegal;
  fechaVencimiento: string;
  fechaPrimeraInscripcion: string;
  archivo: FileList;
}

const enlaceArchivo =
  'text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900';

// Permiso de circulación, revisión técnica y SOAP. Al renovar, el anterior pasa
// a historial. Las fechas se validan según el tipo (reglas en
// @vitriauto/shared-types).
export function PanelDocumentos({ vehiculo }: { vehiculo: VehiculoDetalle }) {
  const refrescar = useRefrescarVehiculo(vehiculo.id);
  const avisar = useAviso();
  const [subiendo, setSubiendo] = useState<TipoDocumentoLegal | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  // Vigentes e historial en una sola consulta.
  const documentos = useQuery({
    queryKey: ['vehiculo', vehiculo.id, 'documentos', 'historial'],
    queryFn: () =>
      api<DocumentoLegal[]>('GET', `/vehiculos/${vehiculo.id}/documentos?incluirHistorial=true`),
  });
  const todos = documentos.data ?? vehiculo.documentosLegales;
  const despues = () => {
    refrescar();
    documentos.refetch();
  };

  const vigente = (tipo: string) => todos.find((d) => d.tipo === tipo && d.vigente);
  const vence = (f: string) => {
    const dias = Math.floor((new Date(`${f}T12:00:00`).getTime() - Date.now()) / 86_400_000);
    if (dias < 0) return <Insignia valor="ANULADA" texto="Vencido" />;
    if (dias <= 10) return <Insignia valor="VENCIDA" texto={`Vence en ${dias} día(s)`} />;
    return <Insignia valor="VIGENTE" texto="Vigente" />;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {TipoDocumentoLegal.options.map((tipo) => {
          const doc = vigente(tipo);
          const avisoMes =
            doc?.respaldo === 'CERTIFICADO_REVISION'
              ? avisoMesRevision(vehiculo.patente, doc.fechaVencimiento)
              : null;
          return (
            <div
              key={tipo}
              className="flex flex-col rounded-2xl bg-superficie p-5 dark:ring-1 dark:ring-inset dark:ring-slate-200"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-2 font-medium text-slate-900">
                  <FileText className="size-4 text-slate-400" aria-hidden />
                  {etiqueta(tipo)}
                </p>
                {doc && vence(doc.fechaVencimiento)}
              </div>
              {doc ? (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Vence el <strong>{fecha(doc.fechaVencimiento)}</strong> ·{' '}
                    <a
                      href={urlApi(doc.archivoUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className={enlaceArchivo}
                    >
                      Ver archivo
                    </a>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {etiqueta(doc.respaldo)}
                    {doc.fechaPrimeraInscripcion &&
                      ` · inscrito el ${fecha(doc.fechaPrimeraInscripcion)}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Lo subió {doc.cargadoPor} el {fecha(doc.fechaCarga.slice(0, 10))}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Sin documento</p>
              )}
              {avisoMes && (
                <div className="mt-3">
                  <Nota tono="aviso">{avisoMes}. Revísalo contra el archivo.</Nota>
                </div>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Boton
                  ayuda={
                    doc
                      ? 'Sube la versión nueva; la anterior queda en el historial'
                      : 'Sube el documento: te avisaremos antes de que venza'
                  }
                  variante="secundario"
                  chico
                  onClick={() => setSubiendo(tipo)}
                >
                  {doc ? 'Renovar' : 'Subir'}
                </Boton>
              </div>
            </div>
          );
        })}
      </div>
      <Boton variante="fantasma" chico onClick={() => setVerHistorial(!verHistorial)}>
        {verHistorial ? 'Ocultar historial' : 'Ver historial de documentos'}
      </Boton>
      {verHistorial && documentos.data && (
        <Tabla>
          <thead>
            <tr>
              <Th>Documento</Th>
              <Th>Vencimiento</Th>
              <Th>Cargado</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documentos.data.map((d) => (
              <tr key={d.id}>
                <Td>
                  {etiqueta(d.tipo)}
                  <span className="block text-xs text-slate-500">{etiqueta(d.respaldo)}</span>
                </Td>
                <Td>{fecha(d.fechaVencimiento)}</Td>
                <Td>
                  {fechaHora(d.fechaCarga)}
                  <span className="block text-xs text-slate-500">{d.cargadoPor}</span>
                </Td>
                <Td>
                  {d.vigente ? (
                    <Insignia valor="VIGENTE" />
                  ) : (
                    <Insignia valor="RESUELTA" texto="Historial" />
                  )}
                </Td>
                <Td>
                  <a
                    href={urlApi(d.archivoUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className={enlaceArchivo}
                  >
                    Ver
                  </a>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {subiendo && (
        <ModalDocumento
          vehiculo={vehiculo}
          tipo={subiendo}
          renovando={!!vigente(subiendo)}
          onCerrar={() => setSubiendo(null)}
          onGuardado={() => {
            despues();
            avisar('Documento guardado');
            setSubiendo(null);
          }}
        />
      )}
    </div>
  );
}

// Qué revisar en el archivo antes de guardarlo (vista previa).
const QUE_ES: Record<RespaldoDocumentoLegal, string> = {
  CERTIFICADO_REVISION: 'el certificado de revisión técnica',
  CERTIFICADO_HOMOLOGACION: 'el certificado de homologación',
  POLIZA_SOAP: 'la póliza del SOAP',
  PERMISO_PAGO_TOTAL: 'el permiso de circulación pagado completo',
  PERMISO_PRIMERA_CUOTA: 'el permiso de circulación (primera cuota)',
};

// Subir o renovar un documento: se elige qué es el archivo y, cuando la regla
// fija el vencimiento (SOAP, permiso, homologación), la fecha no se escribe.
function ModalDocumento({
  vehiculo,
  tipo,
  renovando,
  onCerrar,
  onGuardado,
}: {
  vehiculo: VehiculoDetalle;
  tipo: TipoDocumentoLegal;
  renovando: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const avisar = useAviso();
  const respaldos = RESPALDOS_POR_TIPO[tipo];
  const hoyChile = hoy();
  const { register, handleSubmit, watch, setValue, formState } = useFormulario<DatosDocumento>({
    defaultValues: {
      respaldo: respaldos[0],
      fechaVencimiento:
        tipo === 'REVISION_TECNICA'
          ? (sugerirVencimientoRevisionTecnica(vehiculo.patente) ?? '')
          : (vencimientosPosibles(respaldos[0], hoyChile)[0] ?? ''),
      fechaPrimeraInscripcion: '',
    },
  });
  const respaldo = watch('respaldo');
  const fechaVencimiento = watch('fechaVencimiento');
  const fechaPrimeraInscripcion = watch('fechaPrimeraInscripcion');
  const opcionesFecha = vencimientosPosibles(respaldo, hoyChile);
  const regla = validarDocumentoLegal(
    { tipo, respaldo, fechaVencimiento, fechaPrimeraInscripcion },
    vehiculo,
    hoyChile,
  );
  const avisoMes =
    respaldo === 'CERTIFICADO_REVISION' && fechaVencimiento
      ? avisoMesRevision(vehiculo.patente, fechaVencimiento)
      : null;
  const cambiarRespaldo = (r: RespaldoDocumentoLegal) => {
    setValue('respaldo', r);
    const opciones = vencimientosPosibles(r, hoyChile);
    if (opciones.length) setValue('fechaVencimiento', opciones[0]);
  };

  const subir = handleSubmit(async (datos) => {
    if (!regla.ok) return;
    const form = new FormData();
    form.append('tipo', tipo);
    form.append('respaldo', datos.respaldo);
    if (datos.respaldo === 'CERTIFICADO_HOMOLOGACION') {
      form.append('fechaPrimeraInscripcion', datos.fechaPrimeraInscripcion);
    } else {
      form.append('fechaVencimiento', datos.fechaVencimiento);
    }
    form.append('archivo', datos.archivo[0]);
    try {
      await api('POST', `/vehiculos/${vehiculo.id}/documentos`, { body: form });
      onGuardado();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  });

  // Solo se muestra el error de la regla cuando ya hay algo que validar.
  const hayDato =
    respaldo === 'CERTIFICADO_HOMOLOGACION' ? !!fechaPrimeraInscripcion : !!fechaVencimiento;

  return (
    <Modal titulo={`${renovando ? 'Renovar' : 'Subir'} ${etiqueta(tipo)}`} onCerrar={onCerrar}>
      <form onSubmit={subir} className="space-y-4">
        {respaldos.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-slate-700">
              {tipo === 'PERMISO_CIRCULACION' ? '¿Cómo se pagó?' : '¿Qué documento es?'}
            </p>
            <Segmentado
              etiqueta={tipo === 'PERMISO_CIRCULACION' ? 'Forma de pago' : 'Tipo de certificado'}
              opciones={respaldos.map((r) => ({
                id: r,
                texto:
                  r === 'CERTIFICADO_HOMOLOGACION'
                    ? 'Homologación'
                    : r === 'CERTIFICADO_REVISION'
                      ? 'Revisión técnica'
                      : etiqueta(r),
              }))}
              actual={respaldo}
              onCambiar={cambiarRespaldo}
              className="self-start"
            />
            {tipo === 'REVISION_TECNICA' && (
              <p className="text-xs text-slate-500">
                Homologación: vehículo nuevo, aún exento de revisión técnica.
              </p>
            )}
          </div>
        )}

        {respaldo === 'CERTIFICADO_HOMOLOGACION' ? (
          <>
            <Campo
              etiqueta="Fecha de primera inscripción"
              ayuda="Está en el padrón o en el certificado de anotaciones vigentes"
            >
              <Input
                type="date"
                max={hoyChile}
                {...register('fechaPrimeraInscripcion', { required: 'Obligatoria' })}
              />
            </Campo>
            {regla.ok && (
              <Nota>
                Exento de revisión técnica hasta el <strong>{fecha(regla.fechaVencimiento)}</strong>
                : ese mes le toca su primera revisión según su patente.
              </Nota>
            )}
          </>
        ) : opcionesFecha.length ? (
          <Campo
            etiqueta="Vence el"
            ayuda={
              respaldo === 'PERMISO_PRIMERA_CUOTA'
                ? 'Con solo la primera cuota, vale hasta el 31 de agosto. Al pagar la segunda, renuévalo'
                : 'Siempre vence el 31 de marzo: elige de qué año'
            }
          >
            <Select {...register('fechaVencimiento', { required: 'Obligatoria' })}>
              {opcionesFecha.map((f) => (
                <option key={f} value={f}>
                  {fecha(f)}
                  {f < hoyChile ? ' (ya vencido)' : ''}
                </option>
              ))}
            </Select>
          </Campo>
        ) : (
          <Campo
            etiqueta="Fecha de vencimiento"
            ayuda="La que dice el certificado. Por su patente, vence cada año en el mismo mes"
          >
            <Input type="date" {...register('fechaVencimiento', { required: 'Obligatoria' })} />
          </Campo>
        )}

        {avisoMes && <Nota tono="aviso">{avisoMes}. Revisa la fecha del certificado.</Nota>}
        {!regla.ok && hayDato && <Nota tono="aviso">{regla.error}</Nota>}

        <Campo
          etiqueta="Archivo (PDF, JPG, PNG o HEIC, hasta 10 MB)"
          error={formState.errors.archivo?.message}
        >
          <InputArchivo
            accept={ACEPTA_DOCUMENTOS}
            maxMb={10}
            aviso={
              regla.ok
                ? respaldo === 'CERTIFICADO_HOMOLOGACION'
                  ? `Revisa que sea el certificado de homologación de la patente ${vehiculo.patente}.`
                  : `Revisa que sea ${QUE_ES[respaldo]} de la patente ${vehiculo.patente} y que diga que vence el ${fecha(regla.fechaVencimiento)}.`
                : undefined
            }
            {...register('archivo', { required: 'Adjunta el archivo' })}
          />
        </Campo>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={formState.isSubmitting} disabled={!regla.ok}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Gastos

interface DatosGasto {
  categoria: string;
  monto: number;
  fecha: string;
  comentario: string;
  adjunto: FileList;
}

// Solo admins; nunca en vehículos consignados.
export function PanelGastos({ vehiculo }: { vehiculo: VehiculoDetalle }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const avisar = useAviso();
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<Gasto | null>(null);
  const [anulando, setAnulando] = useState<Gasto | null>(null);

  const gastos = useQuery({
    queryKey: ['vehiculo', vehiculo.id, 'gastos'],
    queryFn: () => api<Gasto[]>('GET', `/vehiculos/${vehiculo.id}/gastos`),
  });
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['vehiculo', vehiculo.id] });
    qc.invalidateQueries({ queryKey: ['gastos'] });
  };

  const anular = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api('POST', `/gastos/${id}/anular`, { body: { motivo: motivo || undefined } }),
    onSuccess: () => {
      refrescar();
      setAnulando(null);
      avisar('Gasto anulado');
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  if (vehiculo.origen === 'CONSIGNACION') {
    return (
      <Vacio icono={Handshake} titulo="Los vehículos en consignación no admiten gastos">
        El vehículo no es de la automotora y su liquidación no descuenta gastos.
      </Vacio>
    );
  }
  const activos = gastos.data?.filter((g) => g.estado === 'ACTIVO') ?? [];
  const total = activos.reduce((s, g) => s + g.monto, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Total de gastos activos: <strong className="text-slate-900">{pesos(total)}</strong>
        </p>
        <Boton
          ayuda="Registra un gasto de este vehículo; suma a su costo y a su balance"
          onClick={() => setNuevo(true)}
        >
          <Plus aria-hidden />
          Registrar gasto
        </Boton>
      </div>
      {gastos.isLoading && <Cargando />}
      {gastos.data?.length === 0 && (
        <Vacio icono={Receipt} titulo="Sin gastos registrados">
          Mecánica, estética, documentación o trámites: todo lo que registres entra en el margen.
        </Vacio>
      )}
      {!!gastos.data?.length && (
        <Tabla>
          <thead>
            <tr>
              <Th>N°</Th>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th derecha>Monto</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {gastos.data.map((g) => (
              <tr
                key={g.id}
                className={cx(filaClicable, g.estado === 'ANULADO' && 'text-slate-500')}
                onClick={() => navegar(`/gastos/${g.id}`)}
              >
                <Td className="w-px">
                  <span className="tabular-nums text-slate-500">{g.numero}</span>
                </Td>
                <Td>{fecha(g.fecha)}</Td>
                <Td className="w-full max-w-0">
                  <span className="block truncate">{etiqueta(g.categoria)}</span>
                  <span
                    className="block truncate text-xs text-slate-500"
                    title={g.comentario ?? undefined}
                  >
                    {g.sucursal.nombre}
                    {g.comentario ? ` · ${g.comentario}` : ''}
                  </span>
                </Td>
                <Td derecha className={g.estado === 'ANULADO' ? 'line-through' : undefined}>
                  {g.estado === 'ANULADO' && <span className="sr-only">Anulado: </span>}
                  {pesos(g.monto)}
                </Td>
                <Td className="w-px">
                  {/* Ranuras fijas: los íconos quedan alineados entre filas aunque falte alguno. */}
                  <div className="flex justify-end gap-0.5">
                    {g.adjuntoUrl ? (
                      <BotonIcono etiqueta="Ver boleta" href={urlApi(g.adjuntoUrl)}>
                        <Paperclip aria-hidden />
                      </BotonIcono>
                    ) : (
                      <span className="size-8" aria-hidden />
                    )}
                    {g.estado === 'ACTIVO' && vehiculo.estado !== 'VENDIDO' ? (
                      <BotonIcono etiqueta="Editar gasto" onClick={() => setEditando(g)}>
                        <Pencil aria-hidden />
                      </BotonIcono>
                    ) : (
                      <span className="size-8" aria-hidden />
                    )}
                    {g.estado === 'ACTIVO' ? (
                      <BotonIcono
                        ayuda="Deja el gasto sin efecto en el costo del vehículo; queda en la auditoría"
                        etiqueta="Anular gasto"
                        peligro
                        onClick={() => setAnulando(g)}
                      >
                        <Ban aria-hidden />
                      </BotonIcono>
                    ) : (
                      <span className="size-8" aria-hidden />
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {vehiculo.estado === 'VENDIDO' && (
        <p className="text-xs text-slate-500">
          Vehículo vendido: los gastos quedan fijos. Para corregir uno, anúlalo y registra otro.
        </p>
      )}
      {(nuevo || editando) && (
        <FormularioGasto
          vehiculoId={vehiculo.id}
          gasto={editando}
          onCerrar={() => {
            setNuevo(false);
            setEditando(null);
          }}
          onGuardado={refrescar}
        />
      )}
      {anulando && (
        <Confirmar
          titulo="Anular gasto"
          mensaje={`¿Anular el gasto de ${pesos(anulando.monto)} (${etiqueta(anulando.categoria)})? Queda en el historial como anulado.`}
          textoConfirmar="Anular gasto"
          peligro
          pedirMotivo
          motivoOpcional
          cargando={anular.isPending}
          onConfirmar={(motivo) => anular.mutate({ id: anulando.id, motivo })}
          onCerrar={() => setAnulando(null)}
        />
      )}
    </div>
  );
}

// Alta o edición de un gasto de vehículo. Sin vehiculoId (acceso directo desde
// Gastos), primero se elige el vehículo: solo propios (un consignado no admite
// gastos) y que no estén dados de baja; un vendido sí (ajusta su margen real).
export function FormularioGasto({
  vehiculoId,
  gasto,
  onCerrar,
  onGuardado,
}: {
  vehiculoId?: string;
  gasto: Pick<Gasto, 'id' | 'categoria' | 'monto' | 'fecha' | 'comentario'> | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const avisar = useAviso();
  const [elegido, setElegido] = useState<VehiculoListado | null>(null);
  const idVehiculo = vehiculoId ?? elegido?.id;
  const { register, handleSubmit, formState } = useFormulario<DatosGasto>({
    defaultValues: gasto
      ? {
          categoria: gasto.categoria,
          monto: gasto.monto,
          fecha: gasto.fecha,
          comentario: gasto.comentario ?? '',
        }
      : { categoria: 'MECANICA', fecha: hoy() },
  });
  const guardar = handleSubmit(async (d) => {
    try {
      if (gasto) {
        await api('PATCH', `/gastos/${gasto.id}`, {
          body: {
            categoria: d.categoria,
            monto: d.monto,
            fecha: d.fecha,
            comentario: d.comentario || null,
          },
        });
      } else {
        const form = new FormData();
        form.append('categoria', d.categoria);
        form.append('monto', String(d.monto));
        form.append('fecha', d.fecha);
        if (d.comentario) form.append('comentario', d.comentario);
        if (d.adjunto?.[0]) form.append('adjunto', d.adjunto[0]);
        if (!idVehiculo) return avisar('Elige el vehículo', 'error');
        await api('POST', `/vehiculos/${idVehiculo}/gastos`, { body: form });
      }
      onGuardado();
      avisar(gasto ? 'Gasto actualizado' : 'Gasto registrado');
      onCerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  });
  return (
    <Modal
      titulo={gasto ? 'Editar gasto de vehículo' : 'Gasto de vehículo'}
      descripcion={gasto ? undefined : 'Entra en el margen del vehículo al venderse.'}
      onCerrar={onCerrar}
      ancho={!vehiculoId && !gasto ? 'max-w-xl' : undefined}
    >
      <form onSubmit={guardar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!vehiculoId && !gasto && (
          <Campo etiqueta="Vehículo" className="sm:col-span-2">
            <SelectorVehiculo
              valor={elegido}
              onCambiar={setElegido}
              filtro={(v) => v.origen !== 'CONSIGNACION' && v.estado !== 'DADO_DE_BAJA'}
            />
          </Campo>
        )}
        <Campo etiqueta="Categoría">
          <Select {...register('categoria')}>
            <Opciones valores={['MECANICA', 'ESTETICA', 'DOCUMENTACION', 'TRAMITES']} />
          </Select>
        </Campo>
        <Campo etiqueta="Monto (CLP)" error={formState.errors.monto?.message}>
          <Input
            type="number"
            moneda
            {...register('monto', {
              required: 'Obligatorio',
              valueAsNumber: true,
              min: { value: 1, message: 'Debe ser mayor a 0' },
            })}
          />
        </Campo>
        <Campo etiqueta="Fecha">
          <Input type="date" max={hoy()} {...register('fecha', { required: true })} />
        </Campo>
        {!gasto && (
          <Campo etiqueta="Boleta (opcional)">
            <InputArchivo accept={ACEPTA_DOCUMENTOS} maxMb={10} {...register('adjunto')} />
          </Campo>
        )}
        <Campo etiqueta="Comentario" className="sm:col-span-2">
          <Textarea {...register('comentario')} />
        </Campo>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={formState.isSubmitting} disabled={!gasto && !idVehiculo}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Bitácora y balance

const ICONO_EVENTO: Record<string, LucideIcon> = {
  ALTA: CirclePlus,
  CAMBIO_PRECIO: Tag,
  CAMBIO_ESTADO: RefreshCw,
  GASTO_AGREGADO: Receipt,
  COTIZACION_GENERADA: FileText,
  RESERVA_GENERADA: CalendarClock,
  VENTA_CONCRETADA: BadgeDollarSign,
  ANULACION: Ban,
  TRANSFERENCIA_SUCURSAL: ArrowRightLeft,
  INSPECCION_FINALIZADA: ClipboardCheck,
};

export function PanelBitacora({ vehiculoId }: { vehiculoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['vehiculo', vehiculoId, 'bitacora'],
    queryFn: () => api<EventoBitacora[]>('GET', `/vehiculos/${vehiculoId}/bitacora`),
  });
  if (isLoading) return <Cargando />;
  return (
    <Tarjeta className="max-w-3xl">
      <ol>
        {data?.map((e, i) => {
          const Icono = ICONO_EVENTO[e.tipoEvento] ?? Circle;
          const ultimo = i === data.length - 1;
          return (
            <li key={e.id} className="relative flex gap-3.5 pb-5 last:pb-0">
              {!ultimo && (
                <span
                  className="absolute left-[0.9375rem] top-8 bottom-0 w-px bg-slate-200"
                  aria-hidden
                />
              )}
              <span
                className={cx(
                  'relative flex size-[1.875rem] shrink-0 items-center justify-center rounded-full ring-1',
                  e.tipoEvento === 'ANULACION'
                    ? 'bg-red-50 text-red-600 ring-red-200'
                    : e.tipoEvento === 'VENTA_CONCRETADA'
                      ? 'bg-lima text-[#18181b] ring-transparent'
                      : 'bg-slate-50 text-slate-500 ring-slate-200',
                )}
              >
                <Icono className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-sm text-slate-800">
                  {e.descripcion.replace(/\b[A-Z]{2,}(?:_[A-Z]+)*\b/g, (t) => etiqueta(t))}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {fechaHora(e.fecha)} · {e.usuario.nombre}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Tarjeta>
  );
}

// Balance del vehículo: cifras clave arriba y, debajo, cómo se reparte el
// precio entre lo que costó el auto y el margen.
export function PanelBalance({ vehiculoId }: { vehiculoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['vehiculo', vehiculoId, 'balance'],
    queryFn: () => api<Balance>('GET', `/vehiculos/${vehiculoId}/balance`),
  });
  if (isLoading || !data) return <Cargando />;
  const real = data.margenTipo === 'REAL';
  const consignado = data.tipo === 'CONSIGNACION';
  const precio = data.precioVenta;
  const margen = data.margen;
  const porcentaje = precio > 0 ? margen / precio : 0;
  // Partes del precio, de lo que se va a lo que queda.
  const partes: { nombre: string; valor: number; tono: string; detalle: string }[] = consignado
    ? [
        {
          nombre: 'Para el consignante',
          valor: data.montoConsignante,
          tono: 'bg-slate-900',
          detalle: 'Se paga al dueño al vender',
        },
      ]
    : [
        {
          nombre: 'Costo de adquisición',
          valor: data.costoAdquisicion,
          tono: 'bg-slate-900',
          detalle: 'Lo que se pagó por el auto',
        },
        {
          nombre: 'Gastos de preparación',
          valor: data.totalGastos,
          tono: 'bg-slate-400',
          detalle: 'Mecánica, estética, trámites…',
        },
      ];
  const costo = partes.reduce((t, p) => t + p.valor, 0);
  // Con pérdida, la barra se mide contra el costo y el exceso se marca en rojo.
  const base = Math.max(precio, costo, 1);
  const textoMargen = consignado
    ? real
      ? 'Comisión (margen real)'
      : 'Comisión proyectada'
    : real
      ? 'Margen real'
      : 'Margen proyectado';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Indicador
          icono={Tag}
          titulo={real ? 'Precio final de venta' : 'Precio de venta actual'}
          valor={pesos(precio)}
          detalle={real ? 'Venta confirmada' : 'Si se vende a este precio'}
        />
        <Indicador
          icono={consignado ? Handshake : Wallet}
          titulo={consignado ? 'Para el consignante' : 'Costo total'}
          valor={pesos(costo)}
          detalle={consignado ? 'Según el trato pactado' : 'Adquisición + gastos'}
        />
        <Indicador
          icono={TrendingUp}
          titulo={textoMargen}
          valor={pesos(margen)}
          detalle={
            <span
              className={cx(
                'inline-flex h-5 items-center rounded-full px-2 font-medium',
                margen < 0 ? 'bg-red-50 text-red-700' : 'bg-lima text-[#18181b]',
              )}
            >
              {margen < 0 ? 'Pérdida' : real ? 'Real' : 'Proyectado'}
            </span>
          }
        />
        <Indicador
          icono={Percent}
          titulo="Margen sobre el precio"
          valor={`${(porcentaje * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`}
          detalle={consignado ? 'Comisión / precio' : 'Margen / precio'}
        />
      </div>

      <Tarjeta
        titulo="Cómo se reparte el precio"
        descripcion={
          consignado
            ? 'Vehículo consignado: el margen es la comisión pactada, sin gastos.'
            : 'Los costos de traspaso de la venta no entran en el margen.'
        }
      >
        <div className="flex h-12 gap-1.5" aria-hidden>
          {partes
            .filter((p) => p.valor > 0)
            .map((p) => (
              <span
                key={p.nombre}
                className={cx('min-w-2 rounded-full', p.tono)}
                style={{ width: `${(p.valor / base) * 100}%` }}
              />
            ))}
          {margen !== 0 && (
            <span
              className={cx(
                'min-w-2 rounded-full',
                margen < 0
                  ? 'bg-[repeating-linear-gradient(135deg,var(--color-red-500)_0_6px,var(--color-red-300)_6px_12px)]'
                  : 'bg-lima',
              )}
              style={{ width: `${(Math.abs(margen) / base) * 100}%` }}
            />
          )}
        </div>
        <ul className="mt-6 divide-y divide-slate-100 border-t border-slate-100">
          {partes.map((p) => (
            <FilaReparto
              key={p.nombre}
              tono={p.tono}
              nombre={p.nombre}
              detalle={p.detalle}
              valor={-p.valor}
              porcentaje={precio > 0 ? p.valor / precio : 0}
            />
          ))}
          <FilaReparto
            tono={margen < 0 ? 'bg-red-500' : 'bg-lima'}
            nombre={textoMargen}
            detalle={margen < 0 ? 'Los costos superan el precio' : 'Lo que gana la automotora'}
            valor={margen}
            porcentaje={porcentaje}
            total
          />
        </ul>
      </Tarjeta>
    </div>
  );
}

function FilaReparto({
  tono,
  nombre,
  detalle,
  valor,
  porcentaje,
  total,
}: {
  tono: string;
  nombre: string;
  detalle: string;
  valor: number;
  porcentaje: number;
  total?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 py-3.5">
      <span className={cx('size-3 shrink-0 rounded-full', tono)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span
          className={cx('block text-sm', total ? 'font-medium text-slate-950' : 'text-slate-900')}
        >
          {nombre}
        </span>
        <span className="block text-xs text-slate-500">{detalle}</span>
      </span>
      <span className="text-right tabular-nums">
        <span
          className={cx(
            'block',
            total ? 'text-xl font-light tracking-[-0.03em]' : 'text-sm font-medium',
            total && valor < 0 ? 'text-red-600' : 'text-slate-950',
          )}
        >
          {pesos(valor)}
        </span>
        <span className="block text-xs text-slate-500">
          {(Math.abs(porcentaje) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}% del
          precio
        </span>
      </span>
    </li>
  );
}
