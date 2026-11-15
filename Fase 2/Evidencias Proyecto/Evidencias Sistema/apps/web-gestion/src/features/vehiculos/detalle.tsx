import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Cog,
  Fuel,
  Gauge,
  ImagePlus,
  Printer,
  MapPin,
  Palette,
  Car,
  Route,
  Zap,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api } from '../../lib/api';
import { urlApi } from '../../lib/config';
import { etiqueta, fecha, km, pesos } from '../../lib/formato';
import {
  Boton,
  BotonLink,
  Campo,
  Chip,
  cx,
  DatoIcono,
  Nota,
  Cargando,
  EncabezadoPagina,
  Insignia,
  MensajeError,
  Modal,
  Pestanas,
  Select,
  SelectorChip,
  SelectorEstado,
  Tarjeta,
  Textarea,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { Lightbox } from '../../ui/lightbox';
import { useAviso } from '../../ui/toast';
import { formatoPorcentaje } from '../consignaciones/trato';
import { PanelInspecciones } from '../inspecciones/panel';
import { FormularioFicha } from './formulario';
import { ListaPendientes } from './pendientes';
import { PanelBalance, PanelBitacora, PanelDocumentos, PanelFotos, PanelGastos } from './paneles';
import { descripcionVehiculo, diasEnStock, type VehiculoDetalle } from './tipos';

type Pestana =
  'resumen' | 'ficha' | 'fotos' | 'documentos' | 'inspeccion' | 'gastos' | 'bitacora' | 'balance';

export function VehiculoPage() {
  const { id = '' } = useParams();
  const { esAdmin } = useSesion();
  const [params, setParams] = useSearchParams();
  const pestana = (params.get('pestana') as Pestana) ?? 'resumen';

  const {
    data: v,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['vehiculo', id],
    queryFn: () => api<VehiculoDetalle>('GET', `/vehiculos/${id}`),
  });
  if (isLoading) return <Cargando />;
  if (error || !v) return <MensajeError error={error} />;

  const pestanas: { id: Pestana; texto: string }[] = [
    { id: 'resumen', texto: 'Resumen' },
    { id: 'ficha', texto: 'Ficha técnica' },
    { id: 'fotos', texto: `Fotos (${v.fotos.length})` },
    { id: 'documentos', texto: 'Documentos' },
    { id: 'inspeccion', texto: 'Inspección' },
    ...(esAdmin
      ? [
          { id: 'gastos' as const, texto: 'Gastos' },
          { id: 'balance' as const, texto: 'Balance' },
        ]
      : []),
    { id: 'bitacora', texto: 'Bitácora' },
  ];

  return (
    <>
      <EncabezadoPagina
        volver={{ a: '/vehiculos', texto: 'Vehículos' }}
        titulo={descripcionVehiculo(v)}
        descripcion={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <EstadoVehiculo v={v} />
            <Chip mono className="bg-superficie">
              {v.patente}
            </Chip>
            <SucursalVehiculo v={v} />
          </span>
        }
        acciones={<AccionesVehiculo v={v} />}
      />
      <Pestanas
        pestanas={pestanas}
        actual={pestana}
        onCambiar={(p) => setParams({ pestana: p }, { replace: true })}
      />
      {pestana === 'resumen' && <Resumen v={v} />}
      {pestana === 'ficha' && <PanelFicha v={v} />}
      {pestana === 'fotos' && <PanelFotos vehiculo={v} />}
      {pestana === 'documentos' && <PanelDocumentos vehiculo={v} />}
      {pestana === 'inspeccion' && <PanelInspecciones vehiculo={v} />}
      {pestana === 'gastos' && esAdmin && <PanelGastos vehiculo={v} />}
      {pestana === 'balance' && esAdmin && <PanelBalance vehiculoId={v.id} />}
      {pestana === 'bitacora' && <PanelBitacora vehiculoId={v.id} />}
    </>
  );
}

function AccionesVehiculo({ v }: { v: VehiculoDetalle }) {
  const { esAdmin } = useSesion();
  const [modal, setModal] = useState<'devolver' | null>(null);
  const vendido = v.estado === 'VENDIDO';
  const reservado = v.estado === 'RESERVADO';
  const vendible = !vendido && v.estado !== 'DADO_DE_BAJA';
  const cambiar = useCambiarEstado(v, () => setModal(null));
  // Revisión antes de publicar: el Vendedor envía, un admin publica.
  const bloqueo = v.pendientes.filter((p) => p.obligatorio);
  const motivoBloqueo = bloqueo.length
    ? `Antes: ${bloqueo.map((p) => p.texto.toLowerCase()).join(', ')}`
    : undefined;
  const enRevision = v.estado === 'PENDIENTE_REVISION';
  const puedePublicar = esAdmin && (enRevision || v.estado === 'EN_PREPARACION');
  const puedeEnviar = !esAdmin && v.estado === 'EN_PREPARACION';
  return (
    <>
      {puedeEnviar && (
        <Boton
          ayuda={motivoBloqueo ?? 'Un admin lo revisará y lo publicará en el sitio'}
          disabled={bloqueo.length > 0}
          cargando={cambiar.isPending}
          onClick={() => cambiar.mutate({ estado: 'PENDIENTE_REVISION' })}
        >
          Enviar a revisión
        </Boton>
      )}
      {esAdmin && enRevision && (
        <Boton
          ayuda="Lo deja en preparación y le dice a quien lo envió qué corregir"
          variante="secundario"
          onClick={() => setModal('devolver')}
        >
          Devolver
        </Boton>
      )}
      {puedePublicar && (
        <Boton
          ayuda={motivoBloqueo ?? 'Lo publica en tu vitrina y en el marketplace'}
          disabled={bloqueo.length > 0}
          cargando={cambiar.isPending}
          onClick={() => cambiar.mutate({ estado: 'DISPONIBLE' })}
        >
          Publicar
        </Boton>
      )}
      {vendible && !reservado && (
        <BotonLink
          ayuda="Emite una reserva de este vehículo para un cliente"
          variante="secundario"
          to={`/reservas/nueva?vehiculoId=${v.id}`}
        >
          Reservar
        </BotonLink>
      )}
      {vendible && (
        <>
          <BotonLink
            ayuda="Emite una cotización de este vehículo para un cliente"
            variante="secundario"
            to={`/cotizaciones/nueva?vehiculoId=${v.id}`}
          >
            Cotizar
          </BotonLink>
          <BotonLink
            ayuda="Registra la venta de este vehículo"
            to={`/ventas/nueva?vehiculoId=${v.id}`}
          >
            Vender
          </BotonLink>
        </>
      )}
      {modal === 'devolver' && (
        <Confirmar
          titulo="Devolver a preparación"
          mensaje="Deja el vehículo en preparación (sin publicar). Escribe qué hay que corregir: lo verá quien lo envió en la ficha del vehículo."
          textoConfirmar="Devolver"
          pedirMotivo
          cargando={cambiar.isPending}
          onConfirmar={(motivo) => cambiar.mutate({ estado: 'EN_PREPARACION', motivo })}
          onCerrar={() => setModal(null)}
        />
      )}
    </>
  );
}

function Resumen({ v }: { v: VehiculoDetalle }) {
  const { esAdmin } = useSesion();
  const [, setParams] = useSearchParams();
  const verFotos = () => setParams({ pestana: 'fotos' }, { replace: true });
  const [fotoAbierta, setFotoAbierta] = useState<number | null>(null);
  const dias = diasEnStock(v.fechaIngreso);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {fotoAbierta !== null && (
        <Lightbox
          fotos={v.fotos.map((f) => ({ url: urlApi(f.url) }))}
          inicial={fotoAbierta}
          titulo={descripcionVehiculo(v)}
          onCerrar={() => setFotoAbierta(null)}
        />
      )}
      <div className="min-w-0 space-y-6">
        {v.estado === 'PENDIENTE_REVISION' && (
          <Nota tono="revision">
            {esAdmin
              ? v.origen === 'PARTE_PAGO' && !v.observacionRevision
                ? 'Recibido en parte de pago con datos esenciales. Completa su ficha, sube fotos, revisa el precio y publícalo.'
                : 'Esperando tu revisión: revisa la ficha, las fotos y el precio, y publícalo o devuélvelo diciendo qué corregir.'
              : 'Enviado a revisión: un admin lo revisará y lo publicará en el sitio.'}
          </Nota>
        )}
        {v.estado === 'EN_PREPARACION' && v.observacionRevision && (
          <Nota tono="aviso">
            Un admin lo devolvió: “{v.observacionRevision}”. Corrígelo y vuelve a enviarlo a
            revisión.
          </Nota>
        )}
        {v.fotos.length > 0 ? (
          <div className="rounded-[22px] bg-superficie p-2 dark:ring-1 dark:ring-inset dark:ring-slate-200">
            <button
              type="button"
              onClick={() => setFotoAbierta(0)}
              className="group relative block w-full cursor-zoom-in overflow-hidden rounded-2xl bg-slate-100"
              aria-label={`Ver las ${v.fotos.length} fotos en grande`}
            >
              <img
                src={urlApi(v.fotos[0].url)}
                alt={`${descripcionVehiculo(v)}, foto de portada`}
                className="aspect-[16/9] w-full object-cover transition-transform duration-500 ease-(--ease-out) group-hover:scale-[1.015]"
              />
              {/* Los datos más consultados, sobre la foto */}
              <span className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
                <ChipFoto>{km(v.kilometraje)}</ChipFoto>
                <ChipFoto>{etiqueta(v.transmision)}</ChipFoto>
                <ChipFoto>{etiqueta(v.combustible)}</ChipFoto>
              </span>
            </button>
            {v.fotos.length > 1 && (
              <div className="grid grid-cols-5 gap-2 pt-2">
                {v.fotos.slice(1, 6).map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFotoAbierta(i + 1)}
                    className="relative cursor-zoom-in overflow-hidden rounded-xl bg-slate-100"
                    aria-label={`Ver la foto ${i + 2} en grande`}
                  >
                    <img src={urlApi(f.url)} alt="" className="aspect-[4/3] w-full object-cover" />
                    {i === 4 && v.fotos.length > 6 && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-medium text-white">
                        +{v.fotos.length - 6}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={verFotos}
            className="flex aspect-[16/7] w-full flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-slate-300 bg-superficie text-sm text-slate-500 transition-colors hover:border-slate-900 hover:text-slate-900"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-slate-100">
              <ImagePlus className="size-5" aria-hidden />
            </span>
            Subir fotos
          </button>
        )}
        <DatosTecnicos v={v} />
      </div>
      <div className="space-y-6">
        {vendible(v) && <ListaPendientes v={v} />}
        <Tarjeta>
          <p className="text-sm text-slate-500">Precio de venta</p>
          <p className="mt-2 text-[2.25rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950">
            {pesos(v.precioVenta)}
          </p>
          <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100 text-sm [&>div]:py-3 [&>div:last-child]:pb-0">
            {esAdmin && v.origen !== 'CONSIGNACION' && (
              <FilaDato etiqueta="Precio de compra">{pesos(v.costoAdquisicion)}</FilaDato>
            )}
            <FilaDato etiqueta="Origen">{etiqueta(v.origen)}</FilaDato>
            <FilaDato etiqueta="Ingreso">{fecha(v.fechaIngreso)}</FilaDato>
            <FilaDato etiqueta="Días en stock">
              <span
                className={cx(
                  'inline-flex h-6 min-w-10 items-center justify-center rounded-full px-2.5 text-xs',
                  dias > 45 && vendible(v) ? 'bg-ambar/20 text-slate-900' : 'bg-slate-100',
                )}
                title={dias > 45 && vendible(v) ? 'Más de 45 días en inventario' : undefined}
              >
                {dias}
              </span>
            </FilaDato>
          </dl>
        </Tarjeta>
        {v.consignacion && (
          <Tarjeta
            titulo={`Consignación N° ${v.consignacion.folio}`}
            acciones={
              <BotonLink variante="fantasma" chico to={`/consignaciones/${v.consignacion.id}`}>
                Ver
              </BotonLink>
            }
          >
            <dl className="divide-y divide-slate-100 text-sm [&>div]:py-3 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">
              <FilaDato etiqueta="Estado">
                <Insignia valor={v.consignacion.estado} />
              </FilaDato>
              <FilaDato etiqueta="Plazo">hasta {fecha(v.consignacion.fechaFin)}</FilaDato>
              <FilaDato etiqueta="Precio mínimo">{pesos(v.consignacion.precioMinimo)}</FilaDato>
              {v.consignacion.tipoTrato && (
                <FilaDato etiqueta="Trato">
                  {v.consignacion.tipoTrato === 'PRECIO_NETO'
                    ? `Neto ${pesos(v.consignacion.montoNeto)}`
                    : `${formatoPorcentaje(v.consignacion.porcentajeComision)} de comisión`}
                </FilaDato>
              )}
            </dl>
          </Tarjeta>
        )}
      </div>
    </div>
  );
}

// Pestaña "Ficha técnica": los datos del vehículo, editables ahí mismo, y la
// ficha imprimible (solo vehículos en inventario).
function PanelFicha({ v }: { v: VehiculoDetalle }) {
  if (v.estado === 'VENDIDO') {
    return (
      <div className="space-y-6">
        <Nota>Este vehículo ya se vendió: su ficha queda como estaba y no se edita.</Nota>
        <DatosTecnicos v={v} />
      </div>
    );
  }
  return (
    <Tarjeta
      titulo="Ficha técnica"
      acciones={
        vendible(v) && (
          <Boton
            chico
            variante="secundario"
            ayuda="Abre la ficha en PDF con sus datos y precio vigente, lista para imprimir"
            onClick={() => window.open(urlApi(`/vehiculos/${v.id}/ficha`), '_blank')}
          >
            <Printer aria-hidden />
            Imprimir ficha
          </Boton>
        )
      }
    >
      <FormularioFicha vehiculo={v} />
    </Tarjeta>
  );
}

function DatosTecnicos({ v }: { v: VehiculoDetalle }) {
  return (
    <Tarjeta titulo="Datos técnicos">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-x-6">
        <DatoIcono icono={Gauge} etiqueta="Kilometraje">
          {km(v.kilometraje)}
        </DatoIcono>
        <DatoIcono icono={Palette} etiqueta="Color">
          {v.color}
        </DatoIcono>
        <DatoIcono icono={Car} etiqueta="Tipo">
          {etiqueta(v.categoria)}
        </DatoIcono>
        <DatoIcono icono={Fuel} etiqueta="Combustible">
          {etiqueta(v.combustible)}
        </DatoIcono>
        <DatoIcono icono={Cog} etiqueta="Transmisión">
          {etiqueta(v.transmision)}
        </DatoIcono>
        {v.traccion && (
          <DatoIcono icono={Route} etiqueta="Tracción">
            {etiqueta(v.traccion)}
          </DatoIcono>
        )}
        <DatoIcono icono={Zap} etiqueta="Cilindrada">
          {v.cilindrada}
        </DatoIcono>
        <DatoIcono icono={CalendarDays} etiqueta="Año">
          {v.anio}
        </DatoIcono>
      </dl>
      {v.descripcion && (
        <p className="mt-6 max-w-[70ch] whitespace-pre-line border-t border-slate-100 pt-5 text-sm leading-relaxed text-slate-700">
          {v.descripcion}
        </p>
      )}
    </Tarjeta>
  );
}

const vendible = (v: VehiculoDetalle) => v.estado !== 'VENDIDO' && v.estado !== 'DADO_DE_BAJA';

// Dato sobre la foto de portada: píldora blanca opaca para leerse sobre cualquier imagen.
function ChipFoto({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full bg-white px-3 text-xs font-medium text-[#18181b] shadow-[0_1px_3px_rgb(0_0_0/0.18)]">
      {children}
    </span>
  );
}

function FilaDato({ etiqueta: texto, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{texto}</dt>
      <dd className="text-right font-medium tabular-nums text-slate-900">{children}</dd>
    </div>
  );
}

// Cambiar estado a mano (RESERVADO y VENDIDO los fijan Reservas y Ventas).
// Solo un admin publica (DISPONIBLE); el Vendedor lo envía a revisión.
function useCambiarEstado(v: VehiculoDetalle, alTerminar: () => void) {
  const qc = useQueryClient();
  const avisar = useAviso();
  return useMutation({
    mutationFn: (cuerpo: { estado: string; motivo?: string }) =>
      api('POST', `/vehiculos/${v.id}/estado`, { body: cuerpo }),
    onSuccess: (_r, { estado, motivo }) => {
      qc.invalidateQueries({ queryKey: ['vehiculo', v.id] });
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
      qc.invalidateQueries({ queryKey: ['notificaciones'] });
      avisar(
        estado === 'DISPONIBLE'
          ? 'Vehículo publicado'
          : estado === 'PENDIENTE_REVISION'
            ? 'Enviado a revisión: avisamos a los admins'
            : v.estado === 'PENDIENTE_REVISION' && estado === 'EN_PREPARACION' && motivo
              ? 'Devuelto a preparación con tus observaciones'
              : 'Estado actualizado',
      );
      alTerminar();
    },
    onError: (e) => avisar(e.message, 'error'),
  });
}

// Estados que se fijan a mano según el rol. RESERVADO y VENDIDO no cambian a
// mano: se cancela la reserva o se anula la venta.
function estadosManuales(v: VehiculoDetalle, esAdmin: boolean) {
  if (v.estado === 'RESERVADO' || v.estado === 'VENDIDO') return [];
  // Dar de baja y reactivar es de admins: el Vendedor no toca un vehículo dado de baja.
  if (!esAdmin && v.estado === 'DADO_DE_BAJA') return [];
  return (
    esAdmin
      ? ['DISPONIBLE', 'EN_PREPARACION', 'DADO_DE_BAJA']
      : ['EN_PREPARACION', 'PENDIENTE_REVISION']
  ).filter((x) => x !== v.estado);
}

const textoEstado = (x: string) => (x === 'PENDIENTE_REVISION' ? 'Enviar a revisión' : etiqueta(x));

// El estado actual, bajo el título: al hacer clic se elige a cuál pasa y se
// confirma (con motivo opcional, que queda en la bitácora).
function EstadoVehiculo({ v }: { v: VehiculoDetalle }) {
  const { esAdmin } = useSesion();
  const [elegido, setElegido] = useState<string | null>(null);
  const opciones = estadosManuales(v, esAdmin);
  const ayuda = esAdmin
    ? 'Cambia el estado: publícalo, déjalo en preparación o dalo de baja'
    : 'Cambia el estado: envíalo a revisión, déjalo en preparación o dalo de baja';
  return (
    <>
      <SelectorEstado
        valor={v.estado}
        ayuda={ayuda}
        opciones={opciones.map((x) => ({ valor: x, texto: textoEstado(x) }))}
        onElegir={setElegido}
      />
      {elegido && <CambiarEstadoModal v={v} inicial={elegido} onCerrar={() => setElegido(null)} />}
    </>
  );
}

function CambiarEstadoModal({
  v,
  inicial,
  onCerrar,
}: {
  v: VehiculoDetalle;
  inicial: string;
  onCerrar: () => void;
}) {
  const { esAdmin } = useSesion();
  const opciones = estadosManuales(v, esAdmin);
  const [estado, setEstado] = useState(inicial);
  const [motivo, setMotivo] = useState('');
  const cambiar = useCambiarEstado(v, onCerrar);
  // Devolver de revisión a preparación exige decir qué corregir.
  const devolviendo = esAdmin && v.estado === 'PENDIENTE_REVISION' && estado === 'EN_PREPARACION';
  const falta = devolviendo && motivo.trim() === '';
  return (
    <Modal titulo="Cambiar estado" onCerrar={onCerrar}>
      <div className="space-y-4">
        <Campo
          etiqueta="Nuevo estado"
          ayuda={
            esAdmin
              ? '“Disponible” = publicado en el sitio (requiere al menos 1 foto).'
              : 'Para publicarlo, envíalo a revisión: un admin lo revisa y lo publica.'
          }
        >
          <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
            {opciones.map((x) => (
              <option key={x} value={x}>
                {textoEstado(x)}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo
          etiqueta={
            devolviendo ? 'Qué hay que corregir' : 'Motivo (opcional, queda en la bitácora)'
          }
        >
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            cargando={cambiar.isPending}
            disabled={falta}
            onClick={() => cambiar.mutate({ estado, motivo: motivo.trim() || undefined })}
          >
            Guardar
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

// La sucursal, bajo el título. El Admin General la cambia ahí mismo
// (transferencia); un vehículo vendido no se transfiere.
function SucursalVehiculo({ v }: { v: VehiculoDetalle }) {
  const { esGeneral } = useSesion();
  const { sucursales } = useSucursalActiva();
  const [destino, setDestino] = useState<string | null>(null);
  const destinos =
    esGeneral && v.estado !== 'VENDIDO' ? sucursales.filter((s) => s.id !== v.sucursal.id) : [];
  return (
    <>
      <SelectorChip
        icono={MapPin}
        etiqueta={`Sucursal: ${v.sucursal.nombre}. Transferir a otra sucursal`}
        ayuda="Transfiere el vehículo a otra sucursal; queda en su bitácora y en la auditoría"
        titulo="Transferir a"
        opciones={destinos.map((s) => ({ valor: s.id, texto: s.nombre }))}
        onElegir={setDestino}
      >
        {v.sucursal.nombre}
      </SelectorChip>
      {destino && <TransferirModal v={v} inicial={destino} onCerrar={() => setDestino(null)} />}
    </>
  );
}

// Transferencia entre sucursales (solo Admin General).
function TransferirModal({
  v,
  inicial,
  onCerrar,
}: {
  v: VehiculoDetalle;
  inicial: string;
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { sucursales } = useSucursalActiva();
  const destinos = sucursales.filter((s) => s.id !== v.sucursal.id);
  const [destino, setDestino] = useState(inicial);
  const transferir = useMutation({
    mutationFn: () =>
      api('POST', `/vehiculos/${v.id}/transferir`, { body: { sucursalDestinoId: destino } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehiculo', v.id] });
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
      avisar('Vehículo transferido');
      onCerrar();
    },
    onError: (e) => avisar(e.message, 'error'),
  });
  return (
    <Modal titulo="Transferir a otra sucursal" onCerrar={onCerrar}>
      {destinos.length === 0 ? (
        <p className="text-sm text-slate-600">No hay otras sucursales activas.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Las ventas, gastos, cotizaciones y reservas ya generadas se mantienen atribuidas a{' '}
            <strong>{v.sucursal.nombre}</strong>.
          </p>
          <Campo etiqueta="Sucursal de destino">
            <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
              {destinos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Campo>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton cargando={transferir.isPending} onClick={() => transferir.mutate()}>
              Transferir
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
