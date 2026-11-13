import { ArrowRight } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useFormulario } from '../../lib/formulario';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { api } from '../../lib/api';
import { fecha, pesos } from '../../lib/formato';
import {
  Avatar,
  BarraPlazo,
  Boton,
  BotonLink,
  Campo,
  Cargando,
  Chip,
  EncabezadoPagina,
  Input,
  Insignia,
  MensajeError,
  Nota,
  Tarjeta,
  Td,
  ItemMovil,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { useAviso } from '../../ui/toast';
import { SelectorCliente } from '../clientes/selector-cliente';
import type { Cliente } from '../clientes/tipos';
import type { VehiculoDetalle, VehiculoListado } from '../vehiculos/tipos';
import {
  BotonPdf,
  CostosAdicionales,
  ListadoDocumentos,
  ResumenDocumento,
  SelectorVehiculo,
  useVehiculoInicial,
} from '../comercial/comun';
import {
  CabeceraVehiculo,
  DetalleDocumento,
  Desglose,
  FilaDesglose,
  enlace,
} from '../comercial/detalle-comun';
import { CasillaCorreo, useEnvioCorreo } from '../comercial/correos';

export interface Cotizacion {
  id: string;
  folio: number;
  sucursal: { id: string; nombre: string };
  cliente: { id: string; nombre: string; rut: string };
  vehiculo: { id: string; patente: string; descripcion: string; estado: string };
  precioCotizado: number;
  costosAdicionales: { descripcion: string; monto: number }[];
  vigenciaDias: number;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: 'VIGENTE' | 'VENCIDA' | 'CONCRETADA' | 'ANULADA';
  venta: { id: string; folio: number } | null; // la venta que la concretó
  emitidaPor: { id: string; nombre: string };
  anulacion: { motivo: string; fecha: string | null } | null;
  pdfUrl: string;
}

export function CotizacionesPage() {
  const navegar = useNavigate();
  return (
    <ListadoDocumentos<Cotizacion>
      titulo="Cotizaciones"
      descripcion="Folio correlativo por sucursal. Vencen solas al cumplir su vigencia y quedan concretadas al cerrar la venta."
      ruta="/cotizaciones"
      endpoint="/cotizaciones"
      estados={['VIGENTE', 'VENCIDA', 'CONCRETADA', 'ANULADA']}
      textoNuevo="+ Nueva cotización"
      encabezados={[
        { texto: 'N°' },
        { texto: 'Emisión' },
        { texto: 'Cliente' },
        { texto: 'Vehículo' },
        { texto: 'Precio', derecha: true },
        { texto: 'Vigencia' },
        { texto: 'Estado' },
      ]}
      itemMovil={(c) => (
        <ItemMovil
          key={c.id}
          a={`/cotizaciones/${c.id}`}
          avatar={<Avatar nombre={c.cliente.nombre} />}
          titulo={c.cliente.nombre}
          valor={pesos(c.precioCotizado)}
          subtitulo={`N° ${c.folio} · ${c.vehiculo.descripcion}`}
          insignia={<Insignia valor={c.estado} />}
          pie={`Vence ${fecha(c.fechaVencimiento)}`}
        />
      )}
      fila={(c) => (
        <tr
          key={c.id}
          className="cursor-pointer transition-colors duration-100 hover:bg-slate-50"
          onClick={() => navegar(`/cotizaciones/${c.id}`)}
        >
          <Td>
            <Chip className="tabular-nums">N° {c.folio}</Chip>
            <span className="mt-1 block text-xs text-slate-500">{c.sucursal.nombre}</span>
          </Td>
          <Td className="tabular-nums">{fecha(c.fechaEmision)}</Td>
          <Td>
            <div className="flex items-center gap-3">
              <Avatar nombre={c.cliente.nombre} />
              <span className="font-medium text-slate-900">{c.cliente.nombre}</span>
            </div>
          </Td>
          <Td className="whitespace-normal">
            {c.vehiculo.descripcion}
            <span className="mt-0.5 block font-mono text-xs tracking-wide text-slate-500">
              {c.vehiculo.patente}
            </span>
          </Td>
          <Td derecha className="font-medium text-slate-900">
            {pesos(c.precioCotizado)}
          </Td>
          <Td>
            <BarraPlazo
              desde={c.fechaEmision}
              hasta={c.fechaVencimiento}
              abierto={c.estado === 'VIGENTE' || c.estado === 'VENCIDA'}
              vencido={c.estado === 'VENCIDA'}
            />
          </Td>
          <Td>
            <Insignia valor={c.estado} />
          </Td>
        </tr>
      )}
    />
  );
}

interface DatosCotizacion {
  precioCotizado: number;
  vigenciaDias: number;
  costos: { descripcion: string; monto: number }[];
}

export function NuevaCotizacionPage() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const { automotora } = useSesion();
  const [vehiculo, setVehiculo] = useState<VehiculoListado | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [enviarCorreo, setEnviarCorreo] = useEnvioCorreo('cotizacion');
  const inicial = useVehiculoInicial(params.get('vehiculoId'));
  const { register, handleSubmit, control, setValue, watch, formState } =
    useFormulario<DatosCotizacion>({
      defaultValues: { costos: [] },
    });

  useEffect(() => {
    if (inicial.data && !vehiculo) setVehiculo(inicial.data);
  }, [inicial.data, vehiculo]);
  useEffect(() => {
    if (vehiculo) setValue('precioCotizado', vehiculo.precioVenta);
  }, [vehiculo, setValue]);
  // Consignado: nunca se cotiza bajo el mínimo que aceptó el dueño.
  const { data: detalle } = useQuery({
    queryKey: ['vehiculo', vehiculo?.id, 'detalle'],
    queryFn: () => api<VehiculoDetalle>('GET', `/vehiculos/${vehiculo!.id}`),
    enabled: vehiculo?.origen === 'CONSIGNACION',
  });
  const minimo =
    vehiculo?.origen === 'CONSIGNACION' ? (detalle?.consignacion?.precioMinimo ?? 0) : 0;
  const precioCotizado = Number(watch('precioCotizado')) || 0;
  const adicionales = (watch('costos') ?? []).reduce(
    (s, c) => s + (Number.isFinite(c.monto) ? c.monto : 0),
    0,
  );

  const emitir = useMutation({
    mutationFn: (d: DatosCotizacion) =>
      api<Cotizacion>('POST', '/cotizaciones', {
        body: {
          vehiculoId: vehiculo!.id,
          clienteId: cliente!.id,
          precioCotizado: d.precioCotizado,
          vigenciaDias: Number.isNaN(d.vigenciaDias) ? undefined : d.vigenciaDias,
          costosAdicionales: d.costos.length ? d.costos : undefined,
          enviarCorreo,
        },
      }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['/cotizaciones'] });
      avisar(`Cotización N° ${c.folio} emitida`);
      navegar(`/cotizaciones/${c.id}`);
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  return (
    <>
      <EncabezadoPagina titulo="Nueva cotización" />
      <form
        className="grid grid-cols-1 gap-6 lg:grid-cols-3"
        onSubmit={handleSubmit((d) => {
          if (!vehiculo || !cliente) return avisar('Elige el vehículo y el cliente', 'error');
          emitir.mutate(d);
        })}
      >
        <div className="space-y-6 lg:col-span-2">
          <Tarjeta titulo="Vehículo">
            <SelectorVehiculo valor={vehiculo} onCambiar={setVehiculo} />
          </Tarjeta>
          <Tarjeta titulo="Cliente">
            <SelectorCliente valor={cliente} onCambiar={setCliente} />
          </Tarjeta>
          <Tarjeta titulo="Condiciones">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo
                etiqueta="Precio cotizado (CLP)"
                ayuda={
                  minimo
                    ? `Consignado: no menos de ${pesos(minimo)} (mínimo aceptado por el dueño)`
                    : 'Puede diferir del precio de venta'
                }
                error={
                  formState.errors.precioCotizado?.type === 'min' && minimo
                    ? `No puede ser menor a ${pesos(minimo)}, el mínimo aceptado por el dueño`
                    : undefined
                }
              >
                <Input
                  type="number"
                  moneda
                  {...register('precioCotizado', {
                    required: true,
                    valueAsNumber: true,
                    min: Math.max(1, minimo),
                  })}
                />
              </Campo>
              <Campo
                etiqueta="Vigencia (días)"
                ayuda={`Por defecto: ${automotora?.diasValidezCotizacion ?? 15} días`}
              >
                <Input
                  type="number"
                  min={1}
                  max={365}
                  placeholder={String(automotora?.diasValidezCotizacion ?? '')}
                  {...register('vigenciaDias', { valueAsNumber: true })}
                />
              </Campo>
            </div>
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="text-sm font-medium text-slate-900">Adicionales</p>
              <p className="mb-3 mt-0.5 text-xs text-slate-500">
                Traspaso u otros cobros: se suman al total a pagar. Con $0 queda registrado algo sin
                costo, como un regalo.
              </p>
              <CostosAdicionales control={control} register={register} />
            </div>
          </Tarjeta>
        </div>
        <div>
          <div className="sticky top-20 space-y-4">
            <Tarjeta titulo="Resumen">
              <ResumenDocumento
                cliente={cliente?.nombre}
                vehiculo={
                  vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.anio}` : undefined
                }
                filas={[
                  ['Precio cotizado', precioCotizado],
                  ...(adicionales ? ([['Adicionales', adicionales]] as [string, number][]) : []),
                ]}
                etiquetaTotal="Total a pagar"
                total={precioCotizado + adicionales}
              />
            </Tarjeta>
            <CasillaCorreo
              marcada={enviarCorreo}
              onCambiar={setEnviarCorreo}
              email={cliente?.email}
            />
            <Boton
              ayuda="Emite la cotización con folio y su PDF; según tu configuración, también se envía al cliente"
              type="submit"
              className="w-full"
              cargando={emitir.isPending || formState.isSubmitting}
            >
              Emitir cotización
            </Boton>
            <Boton variante="secundario" className="w-full" onClick={() => navegar(-1)}>
              Cancelar
            </Boton>
          </div>
        </div>
      </form>
    </>
  );
}

// Estados desde los que un vehículo se puede vender.
const VENDIBLES = ['DISPONIBLE', 'EN_PREPARACION', 'PENDIENTE_REVISION', 'RESERVADO'];

export function CotizacionPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [anulando, setAnulando] = useState(false);
  const {
    data: c,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['cotizacion', id],
    queryFn: () => api<Cotizacion>('GET', `/cotizaciones/${id}`),
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['cotizacion', id] });
    qc.invalidateQueries({ queryKey: ['/cotizaciones'] });
  };
  const anular = useMutation({
    mutationFn: (motivo: string) => api('POST', `/cotizaciones/${id}/anular`, { body: { motivo } }),
    onSuccess: () => {
      refrescar();
      setAnulando(false);
      avisar('Cotización anulada');
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  if (isLoading) return <Cargando />;
  if (!c) return <MensajeError error={error} />;
  const total = c.precioCotizado + c.costosAdicionales.reduce((s, x) => s + x.monto, 0);

  return (
    <DetalleDocumento
      volver={{ ruta: '/cotizaciones', texto: 'Cotizaciones' }}
      correos={{ tipo: 'COTIZACION', id: c.id }}
      titulo={`Cotización N° ${c.folio}`}
      estado={c.estado}
      sucursal={c.sucursal.nombre}
      cliente={c.cliente}
      emision={c.fechaEmision}
      vence={c.fechaVencimiento}
      emitidoPor={c.emitidaPor.nombre}
      anulacion={c.anulacion ? { titulo: 'Anulada', ...c.anulacion } : null}
      acciones={
        <>
          <BotonPdf url={c.pdfUrl} />
          {c.estado === 'VIGENTE' &&
            (VENDIBLES.includes(c.vehiculo.estado) ? (
              <BotonLink
                ayuda="Abre el registro de la venta con este vehículo, cliente y precio ya cargados"
                to={`/ventas/nueva?vehiculoId=${c.vehiculo.id}&clienteId=${c.cliente.id}&cotizacionId=${c.id}`}
              >
                Concretar venta
              </BotonLink>
            ) : (
              <Insignia
                valor={c.vehiculo.estado}
                texto={c.vehiculo.estado === 'VENDIDO' ? 'Vehículo vendido' : undefined}
              />
            ))}
          {c.venta && (
            <BotonLink variante="secundario" to={`/ventas/${c.venta.id}`}>
              Ver venta N° {c.venta.folio}
              <ArrowRight aria-hidden />
            </BotonLink>
          )}
          {(c.estado === 'VIGENTE' || c.estado === 'VENCIDA') && (
            <Boton
              ayuda="Anula la cotización: deja de estar vigente y queda en la auditoría"
              variante="fantasmaPeligro"
              onClick={() => setAnulando(true)}
            >
              Anular
            </Boton>
          )}
        </>
      }
    >
      <Tarjeta>
        <CabeceraVehiculo vehiculo={c.vehiculo} />
        <Desglose etiqueta="Total a pagar" monto={total}>
          <FilaDesglose texto="Precio del vehículo" monto={pesos(c.precioCotizado)} />
          {c.costosAdicionales.map((x, i) => (
            <FilaDesglose
              key={i}
              texto={x.descripcion}
              monto={x.monto === 0 ? 'Sin costo' : pesos(x.monto)}
            />
          ))}
        </Desglose>
        <div className="mt-6 border-t border-slate-100 pt-5">
          <BarraPlazo
            grande
            desde={c.fechaEmision}
            hasta={c.fechaVencimiento}
            abierto={c.estado === 'VIGENTE' || c.estado === 'VENCIDA'}
            vencido={c.estado === 'VENCIDA'}
          />
          <p className="mt-2 text-xs text-slate-500">
            Vigencia de {c.vigenciaDias} {c.vigenciaDias === 1 ? 'día' : 'días'}.
          </p>
        </div>
      </Tarjeta>
      {c.estado === 'CONCRETADA' && c.venta && (
        <Nota>
          Concretada en la{' '}
          <Link to={`/ventas/${c.venta.id}`} className={`font-medium ${enlace}`}>
            venta N° {c.venta.folio}
          </Link>
          .
        </Nota>
      )}
      {c.estado === 'VIGENTE' && c.vehiculo.estado === 'VENDIDO' && (
        <Nota tono="aviso">
          El vehículo ya se vendió en otra venta: esta cotización no se puede concretar.
        </Nota>
      )}
      {anulando && (
        <Confirmar
          titulo="Anular cotización"
          mensaje="Un documento emitido no se edita: se anula (con motivo) y se emite uno nuevo."
          textoConfirmar="Anular"
          peligro
          pedirMotivo
          cargando={anular.isPending}
          onConfirmar={(m) => anular.mutate(m)}
          onCerrar={() => setAnulando(false)}
        />
      )}
    </DetalleDocumento>
  );
}
