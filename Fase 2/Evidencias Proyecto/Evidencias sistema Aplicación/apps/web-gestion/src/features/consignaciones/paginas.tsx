import {
  BadgePercent,
  CalendarRange,
  Car,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api, qs } from '../../lib/api';
import { fecha, hoy, pesos } from '../../lib/formato';
import { useDemorado } from '../../lib/persistente';
import type { Pagina } from '../../lib/tipos';
import {
  Avatar,
  BarraPlazo,
  Boton,
  BotonLink,
  Buscador,
  Campo,
  Cargando,
  Chip,
  cx,
  DatoIcono,
  EncabezadoPagina,
  Filtros,
  Input,
  Insignia,
  MensajeError,
  Modal,
  Nota,
  Paginacion,
  Segmentado,
  Tabla,
  Tarjeta,
  Td,
  Th,
  ThOrdenable,
  Vacio,
  type Direccion,
  ItemMovil,
  ListaMovil,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { useAviso } from '../../ui/toast';
import { CorreosDocumento } from '../comercial/correos';
import { BotonPdf } from '../comercial/comun';
import { CondicionesTrato, cuerpoTrato, describirTrato, errorTrato, type Trato } from './trato';
import type { TipoTrato } from '@vitriauto/shared-types';

interface Consignacion {
  id: string;
  folio: number;
  clienteId: string;
  // Solo admins (el trato es el margen de la automotora):
  tipoTrato?: TipoTrato;
  porcentajeComision?: number | null;
  montoNeto?: number | null;
  precioMinimo: number;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  cliente: { id: string; nombre: string; rut: string };
  vehiculo: {
    id: string;
    patente: string;
    descripcion: string;
    estado: string;
    precioVenta: number;
    sucursal: { id: string; nombre: string };
  };
  sucursalRegistroId: string;
  diasEnStock: number | null; // solo mientras el auto sigue en inventario
  fechaCreacion: string;
  pdfUrl: string;
}

const LIMITE = 25;

type CampoOrden = 'dias' | 'plazo' | 'minimo';
interface FiltrosConsignacion {
  q: string;
  estado: string;
  orden: { campo: CampoOrden; direccion: Direccion } | null;
}
const FILTROS_INICIALES: FiltrosConsignacion = { q: '', estado: 'ACTIVA', orden: null };
export function ConsignacionesPage() {
  const navegar = useNavigate();
  const { sucursalId } = useSucursalActiva();
  // Búsqueda, estado y orden viven solo en esta pantalla (al salir vuelven al valor por defecto).
  const [filtros, setFiltros] = useState<FiltrosConsignacion>(FILTROS_INICIALES);
  const { q, estado, orden } = filtros;
  const [offset, setOffset] = useState(0);
  const cambiar = (cambios: Partial<FiltrosConsignacion>) => {
    setFiltros({ ...filtros, ...cambios });
    setOffset(0);
  };
  const busqueda = useDemorado(q.trim());
  const consulta = useQuery({
    queryKey: ['consignaciones', { estado, busqueda, orden, sucursalId, offset }],
    queryFn: () =>
      api<Pagina<Consignacion>>(
        'GET',
        `/consignaciones${qs({ estado, q: busqueda, orden: orden?.campo, direccion: orden?.direccion, sucursalId, limit: LIMITE, offset })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const cabecera = (campo: CampoOrden, texto: string, derecha?: boolean) => (
    <ThOrdenable
      derecha={derecha}
      direccion={orden?.campo === campo ? orden.direccion : null}
      onOrdenar={(d) => cambiar({ orden: d ? { campo, direccion: d } : null })}
    >
      {texto}
    </ThOrdenable>
  );
  const hayFiltros = Boolean(q || estado !== 'ACTIVA' || orden);

  return (
    <>
      <EncabezadoPagina
        titulo="Consignaciones"
        descripcion="Vehículos de terceros a la venta. Se registran al dar de alta el vehículo con origen “Consignación”."
        acciones={
          <BotonLink
            ayuda="Ingresa al inventario un vehículo de un tercero, con las condiciones pactadas"
            to="/vehiculos/nuevo?origen=CONSIGNACION"
          >
            <Plus aria-hidden />
            Nueva consignación
          </BotonLink>
        }
      />
      <Filtros>
        <Buscador
          className="sm:w-80"
          valor={q}
          onCambiar={(v) => cambiar({ q: v })}
          placeholder="Buscar por patente, vehículo, consignante, RUT o N°"
        />
        <Segmentado
          className="max-sm:col-span-2 max-sm:justify-self-start"
          etiqueta="Estado"
          opciones={[
            { id: 'ACTIVA', texto: 'Activas' },
            { id: 'VENCIDA', texto: 'Vencidas' },
            { id: 'VENDIDA', texto: 'Vendidas' },
            { id: 'DEVUELTA', texto: 'Devueltas' },
            { id: 'TODAS', texto: 'Todas' },
          ]}
          actual={estado || 'TODAS'}
          onCambiar={(id) => cambiar({ estado: id === 'TODAS' ? '' : id })}
        />
        {hayFiltros && (
          <Boton
            ayuda="Quita todos los filtros"
            variante="fantasma"
            chico
            onClick={() => cambiar(FILTROS_INICIALES)}
          >
            <X aria-hidden />
            Limpiar
          </Boton>
        )}
      </Filtros>
      {consulta.isLoading && <Cargando />}
      {consulta.error && <MensajeError error={consulta.error} />}
      {consulta.data?.items.length === 0 && (
        <Vacio icono={Search} titulo="No hay consignaciones con esos filtros">
          Prueba con otra búsqueda o estado.
        </Vacio>
      )}
      {!!consulta.data?.items.length && (
        <>
          <Tabla
            movil={
              <ListaMovil>
                {consulta.data.items.map((c) => (
                  <ItemMovil
                    key={c.id}
                    a={`/consignaciones/${c.id}`}
                    avatar={<Avatar nombre={c.cliente.nombre} />}
                    titulo={c.vehiculo.descripcion}
                    valor={pesos(c.precioMinimo)}
                    subtitulo={`N° ${c.folio} · ${c.cliente.nombre} · ${c.vehiculo.patente}`}
                    insignia={<Insignia valor={c.estado} />}
                    pie={
                      c.diasEnStock === null
                        ? `Hasta ${fecha(c.fechaFin)}`
                        : `${c.diasEnStock} ${c.diasEnStock === 1 ? 'día' : 'días'} en stock · hasta ${fecha(c.fechaFin)}`
                    }
                  />
                ))}
              </ListaMovil>
            }
          >
            <thead>
              <tr>
                <Th>Vehículo</Th>
                <Th>Consignante</Th>
                <Th>Sucursal</Th>
                {cabecera('dias', 'Días en stock', true)}
                {cabecera('minimo', 'Precio mínimo', true)}
                {cabecera('plazo', 'Plazo')}
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody
              className={cx(
                'divide-y divide-slate-100 transition-opacity',
                consulta.isFetching && 'opacity-60',
              )}
            >
              {consulta.data.items.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer transition-colors duration-100 hover:bg-slate-50"
                  onClick={() => navegar(`/consignaciones/${c.id}`)}
                >
                  <Td className="whitespace-normal">
                    <span className="font-medium text-slate-900">{c.vehiculo.descripcion}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      N° {c.folio} · <span className="font-mono">{c.vehiculo.patente}</span>
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar nombre={c.cliente.nombre} />
                      {c.cliente.nombre}
                    </div>
                  </Td>
                  <Td>{c.vehiculo.sucursal.nombre}</Td>
                  <Td derecha>
                    {c.diasEnStock === null ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <span
                        className={cx(
                          'inline-flex h-6 min-w-10 items-center justify-center rounded-full px-2.5 text-xs font-medium tabular-nums',
                          c.diasEnStock > 45
                            ? 'bg-ambar/20 text-slate-900'
                            : 'bg-slate-100 text-slate-700',
                        )}
                      >
                        {c.diasEnStock}
                      </span>
                    )}
                  </Td>
                  <Td derecha className="font-medium text-slate-900">
                    {pesos(c.precioMinimo)}
                  </Td>
                  <Td>
                    <AvancePlazo c={c} />
                  </Td>
                  <Td>
                    <Insignia valor={c.estado} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <Paginacion
            total={consulta.data.total}
            limite={LIMITE}
            offset={offset}
            onCambiar={setOffset}
          />
        </>
      )}
    </>
  );
}

export function ConsignacionPage() {
  const { id = '' } = useParams();
  const { esAdmin } = useSesion();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [modal, setModal] = useState<'condiciones' | 'extender' | 'devolver' | null>(null);
  const [precioSimulado, setPrecioSimulado] = useState<number | ''>('');

  const {
    data: c,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['consignacion', id],
    queryFn: () => api<Consignacion>('GET', `/consignaciones/${id}`),
  });
  const liquidacion = useQuery({
    queryKey: ['consignacion', id, 'liquidacion', precioSimulado],
    queryFn: () =>
      api<{
        precioVenta: number;
        comision: number;
        montoConsignante: number;
        advertencias: string[];
      }>(
        'GET',
        `/consignaciones/${id}/liquidacion${qs({ precioVenta: precioSimulado || undefined })}`,
      ),
    enabled: esAdmin,
  });
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['consignacion', id] });
    qc.invalidateQueries({ queryKey: ['consignaciones'] });
    qc.invalidateQueries({ queryKey: ['vehiculos'] });
  };

  if (isLoading) return <Cargando />;
  if (!c) return <MensajeError error={error} />;
  const gestionable = c.estado === 'ACTIVA' || c.estado === 'VENCIDA';

  return (
    <>
      <EncabezadoPagina
        volver={{ a: '/consignaciones', texto: 'Consignaciones' }}
        titulo={`Consignación N° ${c.folio}`}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <Insignia valor={c.estado} />
            <Chip icono={MapPin} className="bg-superficie">
              {c.vehiculo.sucursal.nombre}
            </Chip>
          </span>
        }
        acciones={
          <>
            <BotonPdf url={c.pdfUrl} />
            {esAdmin && gestionable && (
              <>
                {c.estado === 'ACTIVA' && (
                  <Boton
                    ayuda="Cambia el precio pactado o la comisión de la consignación"
                    variante="secundario"
                    onClick={() => setModal('condiciones')}
                  >
                    Condiciones
                  </Boton>
                )}
                <Boton
                  ayuda="Alarga la fecha de término de la consignación"
                  variante="secundario"
                  onClick={() => setModal('extender')}
                >
                  Extender plazo
                </Boton>
                <Boton
                  ayuda="Termina la consignación y devuelve el vehículo a su dueño; sale del inventario"
                  variante="fantasmaPeligro"
                  onClick={() => setModal('devolver')}
                >
                  Devolver vehículo
                </Boton>
              </>
            )}
          </>
        }
      />
      {c.estado === 'VENCIDA' && (
        <div className="mb-6">
          <Nota tono="aviso">
            El plazo venció el {fecha(c.fechaFin)}: decide si extenderlo o devolver el vehículo al
            consignante.
          </Nota>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Tarjeta>
            <div className="flex items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Car className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <Link
                  to={`/vehiculos/${c.vehiculo.id}`}
                  className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
                >
                  {c.vehiculo.descripcion}
                </Link>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Chip mono>{c.vehiculo.patente}</Chip>
                  <Chip icono={MapPin}>{c.vehiculo.sucursal.nombre}</Chip>
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6">
              <div>
                <p className="text-sm text-slate-500">Precio de venta</p>
                <p className="mt-2 text-[1.75rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950 sm:text-[2.25rem]">
                  {pesos(c.vehiculo.precioVenta)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Precio mínimo aceptado</p>
                <p className="mt-2 text-[1.75rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-500 sm:text-[2.25rem]">
                  {pesos(c.precioMinimo)}
                </p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar nombre={c.cliente.nombre} className="size-10" />
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500">Consignante</dt>
                  <dd className="truncate text-sm font-medium">
                    <Link
                      to={`/clientes/${c.cliente.id}`}
                      className="text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
                    >
                      {c.cliente.nombre}
                    </Link>
                  </dd>
                </div>
              </div>
              {c.tipoTrato && (
                <DatoIcono icono={BadgePercent} etiqueta="Trato">
                  {describirTrato(c)}
                </DatoIcono>
              )}
              <DatoIcono icono={CalendarRange} etiqueta="Plazo">
                {fecha(c.fechaInicio)} al {fecha(c.fechaFin)}
              </DatoIcono>
              {c.diasEnStock !== null && (
                <DatoIcono icono={ShieldCheck} etiqueta="En stock">
                  {c.diasEnStock} {c.diasEnStock === 1 ? 'día' : 'días'}
                </DatoIcono>
              )}
            </dl>
            <div className="mt-6 border-t border-slate-100 pt-5">
              <AvancePlazo c={c} grande />
            </div>
          </Tarjeta>
          <CorreosDocumento tipo="CONSIGNACION" id={c.id} />
        </div>
        {esAdmin && (
          <div className="self-start">
            <Tarjeta titulo="Liquidación" descripcion="Lo que recibe el dueño al venderse.">
              {liquidacion.data && (
                <>
                  <p className="text-sm text-slate-500">Para el consignante</p>
                  <p className="mt-2 text-[2.25rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950">
                    {pesos(liquidacion.data.montoConsignante)}
                  </p>
                  <Reparto
                    consignante={liquidacion.data.montoConsignante}
                    comision={liquidacion.data.comision}
                  />
                  <dl className="mt-5 divide-y divide-slate-100 border-t border-slate-100 text-sm [&>div]:flex [&>div]:justify-between [&>div]:gap-4 [&>div]:py-3">
                    <div>
                      <dt className="text-slate-500">Precio de venta</dt>
                      <dd className="tabular-nums text-slate-900">
                        {pesos(liquidacion.data.precioVenta)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Comisión de la automotora</dt>
                      <dd className="tabular-nums text-slate-900">
                        {pesos(liquidacion.data.comision)}
                      </dd>
                    </div>
                  </dl>
                  {liquidacion.data.advertencias.map((a) => (
                    <div key={a} className="mt-3">
                      <Nota tono="aviso">{a}</Nota>
                    </div>
                  ))}
                </>
              )}
              <div className="mt-5 rounded-2xl bg-slate-100 p-4">
                <Campo
                  etiqueta="Simular otro precio de venta"
                  ayuda="Vacío: usa el precio de venta actual"
                >
                  <Input
                    type="number"
                    moneda
                    value={precioSimulado}
                    onChange={(e) =>
                      setPrecioSimulado(e.target.value ? Number(e.target.value) : '')
                    }
                  />
                </Campo>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Al consignante se le paga el precio final menos la comisión (los vehículos
                consignados no registran gastos).
              </p>
            </Tarjeta>
          </div>
        )}
      </div>
      {modal === 'condiciones' && (
        <CondicionesModal c={c} onCerrar={() => setModal(null)} onListo={refrescar} />
      )}
      {modal === 'extender' && (
        <ExtenderModal c={c} onCerrar={() => setModal(null)} onListo={refrescar} />
      )}
      {modal === 'devolver' && (
        <DevolverModal
          c={c}
          onCerrar={() => setModal(null)}
          onListo={() => {
            refrescar();
            avisar('Vehículo devuelto al consignante');
          }}
        />
      )}
    </>
  );
}

function CondicionesModal({
  c,
  onCerrar,
  onListo,
}: {
  c: Consignacion;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const avisar = useAviso();
  const [trato, setTrato] = useState<Trato>({
    tipoTrato: c.tipoTrato ?? 'COMISION_VENTA',
    porcentajeComision: c.porcentajeComision ?? null,
    montoNeto: c.montoNeto ?? null,
    precioMinimo: c.tipoTrato === 'PRECIO_NETO' ? null : c.precioMinimo,
  });
  const guardar = useMutation({
    mutationFn: () => api('PATCH', `/consignaciones/${c.id}`, { body: cuerpoTrato(trato) }),
    onSuccess: () => {
      onListo();
      avisar('Condiciones actualizadas');
      onCerrar();
    },
    onError: (e) => avisar(e.message, 'error'),
  });
  return (
    <Modal titulo="Trato con el dueño" onCerrar={onCerrar} ancho="max-w-2xl">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const error = errorTrato(trato, c.vehiculo.precioVenta);
          if (error) return avisar(error, 'error');
          guardar.mutate();
        }}
      >
        <CondicionesTrato
          precio={c.vehiculo.precioVenta}
          valor={trato}
          onCambiar={setTrato}
          mostrarPrecio
        />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

function ExtenderModal({
  c,
  onCerrar,
  onListo,
}: {
  c: Consignacion;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const avisar = useAviso();
  const [nueva, setNueva] = useState('');
  const extender = useMutation({
    mutationFn: () =>
      api('POST', `/consignaciones/${c.id}/extender`, { body: { nuevaFechaFin: nueva } }),
    onSuccess: () => {
      onListo();
      avisar('Plazo extendido');
      onCerrar();
    },
    onError: (e) => avisar(e.message, 'error'),
  });
  return (
    <Modal titulo="Extender plazo" onCerrar={onCerrar}>
      <div className="space-y-4">
        <Campo etiqueta="Nuevo plazo hasta" ayuda={`Actual: ${fecha(c.fechaFin)}`}>
          <Input
            type="date"
            min={c.fechaFin > hoy() ? c.fechaFin : hoy()}
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
        </Campo>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton disabled={!nueva} cargando={extender.isPending} onClick={() => extender.mutate()}>
            Extender
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

function DevolverModal({
  c,
  onCerrar,
  onListo,
}: {
  c: Consignacion;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const avisar = useAviso();
  const devolver = useMutation({
    mutationFn: (motivo: string) =>
      api('POST', `/consignaciones/${c.id}/devolver`, { body: { motivo: motivo || undefined } }),
    onSuccess: () => {
      onListo();
      onCerrar();
    },
    onError: (e) => avisar(e.message, 'error'),
  });
  return (
    <Confirmar
      titulo="Devolver vehículo al consignante"
      mensaje="El vehículo sale del inventario (queda dado de baja) y la consignación queda devuelta. Si el dueño vuelve a consignarlo, se registra como uno nuevo."
      textoConfirmar="Devolver"
      peligro
      pedirMotivo
      motivoOpcional
      cargando={devolver.isPending}
      onConfirmar={(m) => devolver.mutate(m)}
      onCerrar={onCerrar}
    />
  );
}

function AvancePlazo({ c, grande }: { c: Consignacion; grande?: boolean }) {
  return (
    <BarraPlazo
      desde={c.fechaInicio}
      hasta={c.fechaFin}
      abierto={c.estado === 'ACTIVA' || c.estado === 'VENCIDA'}
      vencido={c.estado === 'VENCIDA'}
      grande={grande}
    />
  );
}

// Reparto del precio: lo del dueño en tinta y la comisión en gris, cada parte en su píldora.
function Reparto({ consignante, comision }: { consignante: number; comision: number }) {
  const total = consignante + comision;
  if (total <= 0) return null;
  return (
    <div className="mt-4">
      <div className="flex h-3 gap-1" aria-hidden>
        <span
          className="rounded-full bg-slate-900"
          style={{ width: `${(consignante / total) * 100}%` }}
        />
        {comision > 0 && (
          <span
            className="rounded-full bg-slate-300"
            style={{ width: `${(comision / total) * 100}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-slate-900" aria-hidden />
          Dueño {Math.round((consignante / total) * 100)}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-slate-300" aria-hidden />
          Comisión {Math.round((comision / total) * 100)}%
        </span>
      </div>
    </div>
  );
}
