import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useFormulario } from '../../lib/formulario';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { api } from '../../lib/api';
import { fecha, hoy, pesos } from '../../lib/formato';
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
  Modal,
  Nota,
  Tarjeta,
  Td,
  Textarea,
  ItemMovil,
} from '../../ui/componentes';
import { useAviso } from '../../ui/toast';
import { SelectorCliente } from '../clientes/selector-cliente';
import type { Cliente } from '../clientes/tipos';
import type { VehiculoListado } from '../vehiculos/tipos';
import {
  BotonPdf,
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
} from '../comercial/detalle-comun';
import { CasillaCorreo, useEnvioCorreo } from '../comercial/correos';

export interface Reserva {
  id: string;
  folio: number;
  sucursal: { id: string; nombre: string };
  cliente: { id: string; nombre: string; rut: string };
  vehiculo: {
    id: string;
    patente: string;
    descripcion: string;
    estado: string;
    precioVenta: number;
  };
  montoReserva: number;
  condicionesDevolucion: string | null;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: string;
  emitidaPor: { id: string; nombre: string };
  cancelacion: { motivo: string; fecha: string | null; senaRetenida: boolean } | null;
  pdfUrl: string;
}

export function ReservasPage() {
  const navegar = useNavigate();
  return (
    <ListadoDocumentos<Reserva>
      titulo="Reservas"
      descripcion="Al reservar, el vehículo pasa a “Reservado”. Una reserva vencida mantiene el vehículo reservado hasta que un admin decida."
      ruta="/reservas"
      endpoint="/reservas"
      estados={['VIGENTE', 'VENCIDA', 'CONVERTIDA_EN_VENTA', 'CANCELADA']}
      textoNuevo="+ Nueva reserva"
      encabezados={[
        { texto: 'N°' },
        { texto: 'Emisión' },
        { texto: 'Cliente' },
        { texto: 'Vehículo' },
        { texto: 'Seña', derecha: true },
        { texto: 'Vigencia' },
        { texto: 'Estado' },
      ]}
      itemMovil={(r) => (
        <ItemMovil
          key={r.id}
          a={`/reservas/${r.id}`}
          avatar={<Avatar nombre={r.cliente.nombre} />}
          titulo={r.cliente.nombre}
          valor={pesos(r.montoReserva)}
          subtitulo={`N° ${r.folio} · ${r.vehiculo.descripcion}`}
          insignia={<Insignia valor={r.estado} />}
          pie={`Vence ${fecha(r.fechaVencimiento)}`}
        />
      )}
      fila={(r) => (
        <tr
          key={r.id}
          className="cursor-pointer transition-colors duration-100 hover:bg-slate-50"
          onClick={() => navegar(`/reservas/${r.id}`)}
        >
          <Td>
            <Chip className="tabular-nums">N° {r.folio}</Chip>
            <span className="mt-1 block text-xs text-slate-500">{r.sucursal.nombre}</span>
          </Td>
          <Td className="tabular-nums">{fecha(r.fechaEmision)}</Td>
          <Td>
            <div className="flex items-center gap-3">
              <Avatar nombre={r.cliente.nombre} />
              <span className="font-medium text-slate-900">{r.cliente.nombre}</span>
            </div>
          </Td>
          <Td className="whitespace-normal">
            {r.vehiculo.descripcion}
            <span className="mt-0.5 block font-mono text-xs tracking-wide text-slate-500">
              {r.vehiculo.patente}
            </span>
          </Td>
          <Td derecha className="font-medium text-slate-900">
            {pesos(r.montoReserva)}
          </Td>
          <Td>
            <BarraPlazo
              desde={r.fechaEmision}
              hasta={r.fechaVencimiento}
              abierto={r.estado === 'VIGENTE' || r.estado === 'VENCIDA'}
              vencido={r.estado === 'VENCIDA'}
            />
          </Td>
          <Td>
            <Insignia valor={r.estado} />
          </Td>
        </tr>
      )}
    />
  );
}

export function NuevaReservaPage() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const { automotora } = useSesion();
  const [vehiculo, setVehiculo] = useState<VehiculoListado | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [enviarCorreo, setEnviarCorreo] = useEnvioCorreo('reserva');
  const inicial = useVehiculoInicial(params.get('vehiculoId'));
  const { register, handleSubmit, watch } = useFormulario<{
    montoReserva: number;
    condicionesDevolucion: string;
    vigenciaDias: number;
  }>();

  useEffect(() => {
    if (inicial.data && !vehiculo) setVehiculo(inicial.data);
  }, [inicial.data, vehiculo]);
  const sena = Number(watch('montoReserva')) || 0;

  const emitir = useMutation({
    mutationFn: (d: {
      montoReserva: number;
      condicionesDevolucion: string;
      vigenciaDias: number;
    }) =>
      api<Reserva>('POST', '/reservas', {
        body: {
          vehiculoId: vehiculo!.id,
          clienteId: cliente!.id,
          montoReserva: d.montoReserva,
          condicionesDevolucion: d.condicionesDevolucion || undefined,
          vigenciaDias: Number.isNaN(d.vigenciaDias) ? undefined : d.vigenciaDias,
          enviarCorreo,
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['/reservas'] });
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
      qc.invalidateQueries({ queryKey: ['vehiculo', r.vehiculo.id] });
      avisar(`Reserva N° ${r.folio} emitida. El vehículo quedó reservado.`);
      navegar(`/reservas/${r.id}`);
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  return (
    <>
      <EncabezadoPagina titulo="Nueva reserva" />
      <form
        className="grid grid-cols-1 gap-6 lg:grid-cols-3"
        onSubmit={handleSubmit((d) => {
          if (!vehiculo || !cliente) return avisar('Elige el vehículo y el cliente', 'error');
          emitir.mutate(d);
        })}
      >
        <div className="space-y-6 lg:col-span-2">
          <Tarjeta titulo="Vehículo">
            <SelectorVehiculo
              valor={vehiculo}
              onCambiar={setVehiculo}
              filtro={(v) =>
                ['DISPONIBLE', 'EN_PREPARACION', 'PENDIENTE_REVISION'].includes(v.estado)
              }
            />
          </Tarjeta>
          <Tarjeta titulo="Cliente">
            <SelectorCliente valor={cliente} onCambiar={setCliente} />
          </Tarjeta>
          <Tarjeta titulo="Condiciones">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo
                etiqueta="Monto de la reserva / seña (CLP)"
                ayuda="Se descuenta del precio si se concreta la venta"
              >
                <Input
                  type="number"
                  moneda
                  {...register('montoReserva', { required: true, valueAsNumber: true, min: 1 })}
                />
              </Campo>
              <Campo
                etiqueta="Vigencia (días)"
                ayuda={`Por defecto: ${automotora?.diasValidezReserva ?? 3} días`}
              >
                <Input
                  type="number"
                  min={1}
                  max={365}
                  placeholder={String(automotora?.diasValidezReserva ?? '')}
                  {...register('vigenciaDias', { valueAsNumber: true })}
                />
              </Campo>
              <Campo etiqueta="Condiciones de devolución" className="sm:col-span-2">
                <Textarea
                  placeholder="Ej: se devuelve el 100% si el vehículo no pasa la revisión mecánica"
                  {...register('condicionesDevolucion')}
                />
              </Campo>
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
                  ['Precio de venta', vehiculo?.precioVenta ?? 0],
                  ['Seña', -sena],
                ]}
                etiquetaTotal="Saldo al concretar la venta"
                total={Math.max(0, (vehiculo?.precioVenta ?? 0) - sena)}
              />
            </Tarjeta>
            <CasillaCorreo
              marcada={enviarCorreo}
              onCambiar={setEnviarCorreo}
              email={cliente?.email}
            />
            <Boton
              ayuda="Emite la reserva con folio; el vehículo queda reservado y deja de ofrecerse"
              type="submit"
              className="w-full"
              cargando={emitir.isPending}
            >
              Emitir reserva
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

export function ReservaPage() {
  const { id = '' } = useParams();
  const { esAdmin } = useSesion();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'extender' | 'cancelar' | null>(null);
  const {
    data: r,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['reserva', id],
    queryFn: () => api<Reserva>('GET', `/reservas/${id}`),
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['reserva', id] });
    qc.invalidateQueries({ queryKey: ['/reservas'] });
    qc.invalidateQueries({ queryKey: ['vehiculos'] });
    if (r) qc.invalidateQueries({ queryKey: ['vehiculo', r.vehiculo.id] });
  };

  if (isLoading) return <Cargando />;
  if (!r) return <MensajeError error={error} />;
  const activa = r.estado === 'VIGENTE' || r.estado === 'VENCIDA';

  return (
    <DetalleDocumento
      volver={{ ruta: '/reservas', texto: 'Reservas' }}
      correos={{ tipo: 'RESERVA', id: r.id }}
      titulo={`Reserva N° ${r.folio}`}
      estado={r.estado}
      sucursal={r.sucursal.nombre}
      cliente={r.cliente}
      emision={r.fechaEmision}
      vence={r.fechaVencimiento}
      emitidoPor={r.emitidaPor.nombre}
      anulacion={
        r.cancelacion
          ? {
              titulo: 'Cancelada',
              ...r.cancelacion,
              extra: (
                <span>
                  {' '}
                  · Seña {r.cancelacion.senaRetenida ? 'retenida (ingreso)' : 'devuelta al cliente'}
                  .
                </span>
              ),
            }
          : null
      }
      acciones={
        <>
          <BotonPdf url={r.pdfUrl} />
          {activa && (
            <BotonLink
              ayuda="Abre el registro de la venta con este vehículo y cliente ya cargados"
              to={`/ventas/nueva?vehiculoId=${r.vehiculo.id}&clienteId=${r.cliente.id}`}
            >
              Concretar venta
            </BotonLink>
          )}
          {activa && esAdmin && (
            <>
              <Boton
                ayuda="Alarga la fecha de vencimiento de la reserva"
                variante="secundario"
                onClick={() => setModal('extender')}
              >
                Extender
              </Boton>
              <Boton
                ayuda="Cancela la reserva y libera el vehículo; indicas si la seña se retiene"
                variante="fantasmaPeligro"
                onClick={() => setModal('cancelar')}
              >
                Dar de baja
              </Boton>
            </>
          )}
        </>
      }
    >
      <Tarjeta>
        {r.estado === 'VENCIDA' && (
          <div className="mb-4">
            <Nota tono="aviso">
              El plazo venció: el vehículo sigue reservado hasta que un admin la extienda o la dé de
              baja.
            </Nota>
          </div>
        )}
        <CabeceraVehiculo vehiculo={r.vehiculo} extra={<Insignia valor={r.vehiculo.estado} />} />
        <Desglose etiqueta="Seña" monto={r.montoReserva}>
          <FilaDesglose
            texto="Precio de venta del vehículo"
            monto={pesos(r.vehiculo.precioVenta)}
          />
          <FilaDesglose texto="Seña" monto={pesos(-r.montoReserva)} />
          <FilaDesglose
            total
            texto="Saldo al concretar la venta"
            monto={pesos(r.vehiculo.precioVenta - r.montoReserva)}
          />
        </Desglose>
        <div className="mt-6 border-t border-slate-100 pt-5">
          <BarraPlazo
            grande
            desde={r.fechaEmision}
            hasta={r.fechaVencimiento}
            abierto={r.estado === 'VIGENTE' || r.estado === 'VENCIDA'}
            vencido={r.estado === 'VENCIDA'}
          />
        </div>
        {r.condicionesDevolucion && (
          <div className="mt-5 rounded-2xl bg-slate-100 p-4 text-sm">
            <p className="font-medium text-slate-900">Condiciones de devolución</p>
            <p className="mt-1 whitespace-pre-line text-slate-700">{r.condicionesDevolucion}</p>
          </div>
        )}
      </Tarjeta>
      {modal === 'extender' && (
        <ExtenderModal r={r} onCerrar={() => setModal(null)} onListo={refrescar} />
      )}
      {modal === 'cancelar' && (
        <CancelarModal r={r} onCerrar={() => setModal(null)} onListo={refrescar} />
      )}
    </DetalleDocumento>
  );
}

function ExtenderModal({
  r,
  onCerrar,
  onListo,
}: {
  r: Reserva;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const avisar = useAviso();
  const [nueva, setNueva] = useState('');
  const extender = useMutation({
    mutationFn: () =>
      api('POST', `/reservas/${r.id}/extender`, { body: { nuevaFechaVencimiento: nueva } }),
    onSuccess: () => {
      onListo();
      avisar('Reserva extendida');
      onCerrar();
    },
    onError: (e) => avisar(e.message, 'error'),
  });
  const minimo = r.fechaVencimiento > hoy() ? r.fechaVencimiento : hoy();
  return (
    <Modal titulo="Extender reserva" onCerrar={onCerrar}>
      <div className="space-y-4">
        <Campo etiqueta="Nueva fecha de vencimiento" ayuda={`Actual: ${fecha(r.fechaVencimiento)}`}>
          <Input
            type="date"
            min={minimo}
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

// Cancelar reserva: motivo obligatorio y decisión sobre la seña.
function CancelarModal({
  r,
  onCerrar,
  onListo,
}: {
  r: Reserva;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const avisar = useAviso();
  const [motivo, setMotivo] = useState('');
  const [senaRetenida, setSenaRetenida] = useState<boolean | null>(null);
  const cancelar = useMutation({
    mutationFn: () => api('POST', `/reservas/${r.id}/cancelar`, { body: { motivo, senaRetenida } }),
    onSuccess: () => {
      onListo();
      avisar('Reserva dada de baja. El vehículo volvió a su estado anterior.');
      onCerrar();
    },
    onError: (e) => avisar(e.message, 'error'),
  });
  return (
    <Modal titulo="Dar de baja la reserva" onCerrar={onCerrar}>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          El vehículo vuelve al estado que tenía antes de reservarse.
        </p>
        <fieldset className="space-y-2">
          <legend className="font-medium text-slate-700">
            ¿Qué pasa con la seña de {pesos(r.montoReserva)}?
          </legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="sena"
              checked={senaRetenida === true}
              onChange={() => setSenaRetenida(true)}
            />{' '}
            Se retiene (queda como ingreso)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="sena"
              checked={senaRetenida === false}
              onChange={() => setSenaRetenida(false)}
            />{' '}
            Se devuelve al cliente
          </label>
        </fieldset>
        <Campo etiqueta="Motivo">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            disabled={!motivo.trim() || senaRetenida === null}
            cargando={cancelar.isPending}
            onClick={() => cancelar.mutate()}
          >
            Dar de baja
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
