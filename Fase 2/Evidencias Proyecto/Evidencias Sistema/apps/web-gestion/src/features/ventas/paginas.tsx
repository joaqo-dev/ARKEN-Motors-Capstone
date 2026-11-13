import { formatearRut } from '@vitriauto/shared-types';
import { Check, Plus, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { useFormulario } from '../../lib/formulario';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { api, qs } from '../../lib/api';
import { etiqueta, fecha, pesos } from '../../lib/formato';
import type { Pagina } from '../../lib/tipos';
import {
  Avatar,
  Boton,
  Campo,
  Cargando,
  Chip,
  cx,
  EncabezadoPagina,
  Input,
  Insignia,
  MensajeError,
  Nota,
  Select,
  Tarjeta,
  Td,
  ItemMovil,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { useAviso } from '../../ui/toast';
import { SelectorCliente } from '../clientes/selector-cliente';
import type { Cliente } from '../clientes/tipos';
import {
  BotonPdf,
  CostosAdicionales,
  ListadoDocumentos,
  SelectorVehiculo,
  useVehiculoInicial,
} from '../comercial/comun';
import { CabeceraVehiculo, DetalleDocumento, enlace } from '../comercial/detalle-comun';
import { CasillaCorreo, useEnvioCorreo } from '../comercial/correos';
import type { Cotizacion } from '../cotizaciones/paginas';
import type { Reserva } from '../reservas/paginas';
import type { VehiculoListado } from '../vehiculos/tipos';

interface Venta {
  id: string;
  folio: number;
  sucursal: { id: string; nombre: string };
  cliente: { id: string; nombre: string; rut: string };
  vehiculo: { id: string; patente: string; descripcion: string; origen: string };
  precioVentaFinal: number;
  reserva: { id: string; folio: number; senaDescontada: number } | null;
  cotizacion: { id: string; folio: number } | null;
  saldoPagado: number;
  formasPago: {
    tipo: string;
    monto: number;
    vehiculoRecibido: { id: string; patente: string } | null;
  }[];
  costosAdicionales: { descripcion: string; monto: number }[];
  fechaVenta: string;
  estado: 'CONFIRMADA' | 'ANULADA';
  vendidaPor: { id: string; nombre: string };
  anulacion: { motivo: string; fecha: string | null } | null;
  pdfUrl: string;
  liquidacionConsignacion?: {
    precioVenta: number;
    comision: number;
    montoConsignante: number;
  } | null;
}

export function VentasPage() {
  const navegar = useNavigate();
  return (
    <ListadoDocumentos<Venta>
      titulo="Ventas"
      descripcion="Folio correlativo por sucursal. Las ventas anuladas quedan en el historial."
      ruta="/ventas"
      endpoint="/ventas"
      estados={['CONFIRMADA', 'ANULADA']}
      textoNuevo="+ Nueva venta"
      encabezados={[
        { texto: 'N°' },
        { texto: 'Fecha' },
        { texto: 'Cliente' },
        { texto: 'Vehículo' },
        { texto: 'Precio final', derecha: true },
        { texto: 'Vendedor' },
        { texto: 'Estado' },
      ]}
      itemMovil={(v) => (
        <ItemMovil
          key={v.id}
          a={`/ventas/${v.id}`}
          avatar={<Avatar nombre={v.cliente.nombre} />}
          titulo={v.cliente.nombre}
          valor={pesos(v.precioVentaFinal)}
          subtitulo={`N° ${v.folio} · ${v.vehiculo.descripcion}`}
          insignia={<Insignia valor={v.estado} />}
          pie={fecha(v.fechaVenta)}
        />
      )}
      fila={(v) => (
        <tr
          key={v.id}
          className="cursor-pointer transition-colors duration-100 hover:bg-slate-50"
          onClick={() => navegar(`/ventas/${v.id}`)}
        >
          <Td>
            <Chip className="tabular-nums">N° {v.folio}</Chip>
            <span className="mt-1 block text-xs text-slate-500">{v.sucursal.nombre}</span>
          </Td>
          <Td className="tabular-nums">{fecha(v.fechaVenta)}</Td>
          <Td>
            <div className="flex items-center gap-3">
              <Avatar nombre={v.cliente.nombre} />
              <span className="font-medium text-slate-900">{v.cliente.nombre}</span>
            </div>
          </Td>
          <Td className="whitespace-normal">
            {v.vehiculo.descripcion}
            <span className="mt-0.5 block font-mono text-xs tracking-wide text-slate-500">
              {v.vehiculo.patente}
            </span>
          </Td>
          <Td derecha className="font-medium text-slate-900">
            {pesos(v.precioVentaFinal)}
          </Td>
          <Td>{v.vendidaPor.nombre}</Td>
          <Td>
            <Insignia valor={v.estado} />
          </Td>
        </tr>
      )}
    />
  );
}

const TIPOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'FINANCIAMIENTO', 'PARTE_PAGO'] as const;

interface FormaPago {
  tipo: (typeof TIPOS_PAGO)[number];
  monto: number;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  kilometraje: number;
  color: string;
}

interface DatosVenta {
  precioVentaFinal: number;
  formas: FormaPago[];
  costos: { descripcion: string; monto: number }[];
}

const aCentavos = (v: number) => Math.round((Number.isNaN(v) ? 0 : v) * 100);

// Cierre de venta: formas de pago combinables que deben cuadrar con el precio
// final menos la seña (si concreta una reserva). Una parte de pago crea el
// vehículo recibido como "Pendiente de revisión".
export function NuevaVentaPage() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [vehiculo, setVehiculo] = useState<VehiculoListado | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [enviarCorreo, setEnviarCorreo] = useEnvioCorreo('venta');
  const inicial = useVehiculoInicial(params.get('vehiculoId'));
  const clienteInicial = params.get('clienteId');
  // Desde una cotización vigente: trae su precio y adicionales, y la venta la concreta.
  const cotizacionId = params.get('cotizacionId');
  const { data: cotizacion } = useQuery({
    queryKey: ['cotizacion', cotizacionId],
    queryFn: () => api<Cotizacion>('GET', `/cotizaciones/${cotizacionId}`),
    enabled: !!cotizacionId,
  });

  const { register, handleSubmit, control, watch, setValue } = useFormulario<DatosVenta>({
    defaultValues: { formas: [{ tipo: 'TRANSFERENCIA' } as FormaPago], costos: [] },
  });
  const formas = useFieldArray({ control, name: 'formas' });

  useEffect(() => {
    if (inicial.data && !vehiculo) setVehiculo(inicial.data);
  }, [inicial.data, vehiculo]);
  // La cotización solo se concreta con su mismo vehículo y cliente.
  const concreta =
    cotizacion?.estado === 'VIGENTE' &&
    cotizacion.vehiculo.id === vehiculo?.id &&
    cotizacion.cliente.id === cliente?.id
      ? cotizacion
      : null;
  const cotizacionDelVehiculo = cotizacion && cotizacion.vehiculo.id === vehiculo?.id;
  useEffect(() => {
    if (!vehiculo) return;
    setValue(
      'precioVentaFinal',
      cotizacionDelVehiculo ? cotizacion.precioCotizado : vehiculo.precioVenta,
    );
    if (cotizacionDelVehiculo) setValue('costos', cotizacion.costosAdicionales);
  }, [vehiculo, cotizacion, cotizacionDelVehiculo, setValue]);
  useEffect(() => {
    if (clienteInicial && !cliente) {
      api<Cliente>('GET', `/clientes/${clienteInicial}`)
        .then(setCliente)
        .catch(() => undefined);
    }
  }, [clienteInicial, cliente]);

  // Reserva activa del vehículo: la venta debe concretarla (mismo cliente).
  const reservas = useQuery({
    queryKey: ['/reservas', 'activa', vehiculo?.id],
    queryFn: () =>
      api<Pagina<Reserva>>('GET', `/reservas${qs({ vehiculoId: vehiculo!.id, limit: 10 })}`),
    enabled: !!vehiculo,
  });
  const reserva =
    reservas.data?.items.find((r) => r.estado === 'VIGENTE' || r.estado === 'VENCIDA') ?? null;
  useEffect(() => {
    if (reserva && cliente?.id !== reserva.cliente.id) {
      api<Cliente>('GET', `/clientes/${reserva.cliente.id}`)
        .then(setCliente)
        .catch(() => undefined);
    }
  }, [reserva, cliente]);

  const precio = watch('precioVentaFinal') ?? 0;
  const sena = reserva?.montoReserva ?? 0;
  // Total que paga el cliente: precio + adicionales (los adicionales no entran al margen).
  const adicionales = (watch('costos') ?? []).reduce(
    (s, c) => s + (Number.isFinite(c.monto) ? aCentavos(c.monto) : 0),
    0,
  );
  const aPagar = aCentavos(precio || 0) + adicionales - aCentavos(sena);
  const pagado = watch('formas').reduce((s, f) => s + aCentavos(f.monto), 0);
  const cuadra = aPagar > 0 && pagado === aPagar;

  const cerrar = useMutation({
    mutationFn: (d: DatosVenta) =>
      api<Venta>('POST', '/ventas', {
        body: {
          vehiculoId: vehiculo!.id,
          clienteId: cliente!.id,
          reservaId: reserva?.id,
          cotizacionId: concreta?.id,
          precioVentaFinal: d.precioVentaFinal,
          formasPago: d.formas.map((f) => ({
            tipo: f.tipo,
            monto: f.monto,
            vehiculoRecibido:
              f.tipo === 'PARTE_PAGO'
                ? {
                    patente: f.patente,
                    marca: f.marca,
                    modelo: f.modelo,
                    anio: f.anio,
                    kilometraje: f.kilometraje,
                    color: f.color,
                  }
                : undefined,
          })),
          costosAdicionales: d.costos.length ? d.costos : undefined,
          enviarCorreo,
        },
      }),
    onSuccess: (v) => {
      qc.invalidateQueries();
      avisar(`Venta N° ${v.folio} confirmada`);
      navegar(`/ventas/${v.id}`);
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  return (
    <>
      <EncabezadoPagina titulo="Nueva venta" />
      <form
        className="grid grid-cols-1 gap-6 lg:grid-cols-3"
        onSubmit={handleSubmit((d) => {
          if (!vehiculo || !cliente) return avisar('Elige el vehículo y el cliente', 'error');
          if (!cuadra) return avisar('Las formas de pago no cuadran con el total a pagar', 'error');
          cerrar.mutate(d);
        })}
      >
        <div className="space-y-6 lg:col-span-2">
          <Tarjeta titulo="1. Vehículo">
            <SelectorVehiculo
              valor={vehiculo}
              onCambiar={setVehiculo}
              filtro={(v) =>
                ['DISPONIBLE', 'EN_PREPARACION', 'PENDIENTE_REVISION', 'RESERVADO'].includes(
                  v.estado,
                )
              }
            />
            {concreta && (
              <div className="mt-3">
                <Nota>
                  Esta venta concreta la <strong>cotización N° {concreta.folio}</strong>: se traen
                  su precio y adicionales.
                </Nota>
              </div>
            )}
            {reserva && (
              <div className="mt-3">
                <Nota tono="aviso">
                  Esta venta concreta la <strong>reserva N° {reserva.folio}</strong> de{' '}
                  {reserva.cliente.nombre}: su seña de {pesos(reserva.montoReserva)} se descuenta
                  del saldo.
                </Nota>
              </div>
            )}
          </Tarjeta>
          <Tarjeta titulo="2. Comprador">
            {reserva ? (
              <p className="text-sm">
                <strong>{reserva.cliente.nombre}</strong> · {formatearRut(reserva.cliente.rut)}{' '}
                <span className="text-slate-500">(titular de la reserva)</span>
              </p>
            ) : (
              <SelectorCliente valor={cliente} onCambiar={setCliente} />
            )}
          </Tarjeta>
          <Tarjeta titulo="3. Precio de venta">
            <Campo etiqueta="Precio final del vehículo" className="max-w-xs">
              <Input
                type="number"
                moneda
                {...register('precioVentaFinal', { required: true, valueAsNumber: true, min: 1 })}
              />
            </Campo>
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="text-sm font-medium text-slate-900">Adicionales</p>
              <p className="mb-3 mt-0.5 text-xs text-slate-500">
                Traspaso u otros cobros: se suman al total a pagar (no al margen). Con $0 queda
                registrado algo sin costo, como un regalo.
              </p>
              <CostosAdicionales control={control} register={register} />
            </div>
          </Tarjeta>
          <Tarjeta
            titulo="4. Formas de pago"
            descripcion={
              aPagar > 0 ? `Deben sumar ${pesos(aPagar / 100)} (total a pagar).` : undefined
            }
          >
            <div className="space-y-3">
              {formas.fields.map((f, i) => {
                const tipo = watch(`formas.${i}.tipo`);
                return (
                  <div
                    key={f.id}
                    className="rounded-2xl bg-slate-100 p-3 transition-[opacity,transform] duration-200 ease-(--ease-out) starting:-translate-y-1 starting:opacity-0"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Select className="w-48" {...register(`formas.${i}.tipo`)}>
                        {TIPOS_PAGO.map((t) => (
                          <option key={t} value={t}>
                            {t === 'PARTE_PAGO' ? 'Vehículo en parte de pago' : etiqueta(t)}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        moneda
                        placeholder="Monto"
                        className="w-44"
                        {...register(`formas.${i}.monto`, {
                          required: true,
                          valueAsNumber: true,
                          min: 1,
                        })}
                      />
                      {formas.fields.length > 1 && (
                        <Boton
                          ayuda="Quita esta forma de pago"
                          variante="fantasma"
                          onClick={() => formas.remove(i)}
                          className="px-2.5"
                          aria-label="Quitar forma de pago"
                        >
                          <X aria-hidden />
                        </Boton>
                      )}
                    </div>
                    {tipo === 'PARTE_PAGO' && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <p className="text-xs text-slate-500 sm:col-span-3">
                          Vehículo recibido (ingresa al inventario “Pendiente de revisión”, con este
                          monto como costo):
                        </p>
                        <Input
                          placeholder="Patente"
                          className="uppercase"
                          {...register(`formas.${i}.patente`, { required: true })}
                        />
                        <Input
                          placeholder="Marca"
                          {...register(`formas.${i}.marca`, { required: true })}
                        />
                        <Input
                          placeholder="Modelo"
                          {...register(`formas.${i}.modelo`, { required: true })}
                        />
                        <Input
                          type="number"
                          placeholder="Año"
                          {...register(`formas.${i}.anio`, { required: true, valueAsNumber: true })}
                        />
                        <Input
                          type="number"
                          miles
                          placeholder="Kilometraje"
                          {...register(`formas.${i}.kilometraje`, {
                            required: true,
                            valueAsNumber: true,
                          })}
                        />
                        <Input
                          placeholder="Color"
                          {...register(`formas.${i}.color`, { required: true })}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <Boton
                ayuda="Divide el pago en varias formas (transferencia, crédito, efectivo…)"
                variante="secundario"
                chico
                onClick={() => formas.append({ tipo: 'EFECTIVO' } as FormaPago)}
              >
                <Plus aria-hidden />
                Agregar forma de pago
              </Boton>
            </div>
          </Tarjeta>
        </div>
        <div>
          <div className="sticky top-20 space-y-4">
            <Tarjeta titulo="Resumen">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Precio de venta</span>
                  <span className="tabular-nums">{pesos(precio || 0)}</span>
                </div>
                {adicionales > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Adicionales</span>
                    <span className="tabular-nums">{pesos(adicionales / 100)}</span>
                  </div>
                )}
                {sena > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Seña de la reserva</span>
                    <span className="tabular-nums">{pesos(-sena)}</span>
                  </div>
                )}
                <div className="border-t border-slate-100 pt-3">
                  <span className="text-slate-500">Total a pagar</span>
                  <span className="mt-1 block text-[2rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950">
                    {pesos(aPagar / 100)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Formas de pago</span>
                  <span className="tabular-nums">{pesos(pagado / 100)}</span>
                </div>
                <div
                  className={cx(
                    'flex h-9 items-center justify-center gap-1.5 rounded-full px-3 font-medium',
                    cuadra ? 'bg-lima text-slate-900' : 'bg-red-50 text-red-700',
                  )}
                >
                  {cuadra ? (
                    <>
                      <Check className="size-4" aria-hidden />
                      Los pagos cuadran
                    </>
                  ) : (
                    `Diferencia: ${pesos((aPagar - pagado) / 100)}`
                  )}
                </div>
              </div>
            </Tarjeta>
            <CasillaCorreo
              marcada={enviarCorreo}
              onCambiar={setEnviarCorreo}
              email={cliente?.email}
            />
            <Boton
              ayuda="Registra la venta con folio: el vehículo queda vendido y sale del inventario"
              type="submit"
              className="w-full"
              disabled={!cuadra || !vehiculo || !cliente}
              cargando={cerrar.isPending}
            >
              Confirmar venta
            </Boton>
          </div>
        </div>
      </form>
    </>
  );
}

export function VentaPage() {
  const { id = '' } = useParams();
  const { esAdmin } = useSesion();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [anulando, setAnulando] = useState(false);
  const {
    data: v,
    isLoading,
    error,
  } = useQuery({ queryKey: ['venta', id], queryFn: () => api<Venta>('GET', `/ventas/${id}`) });
  const anular = useMutation({
    mutationFn: (motivo: string) => api('POST', `/ventas/${id}/anular`, { body: { motivo } }),
    onSuccess: () => {
      qc.invalidateQueries();
      setAnulando(false);
      avisar('Venta anulada');
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  if (isLoading) return <Cargando />;
  if (!v) return <MensajeError error={error} />;

  return (
    <DetalleDocumento
      volver={{ ruta: '/ventas', texto: 'Ventas' }}
      correos={{ tipo: 'VENTA', id: v.id }}
      titulo={`Venta N° ${v.folio}`}
      estado={v.estado}
      sucursal={v.sucursal.nombre}
      cliente={v.cliente}
      emision={v.fechaVenta}
      emitidoPor={v.vendidaPor.nombre}
      anulacion={v.anulacion ? { titulo: 'Anulada', ...v.anulacion } : null}
      acciones={
        <>
          <BotonPdf url={v.pdfUrl} texto="Comprobante" />
          {v.estado === 'CONFIRMADA' && esAdmin && (
            <Boton
              ayuda="Anula la venta y devuelve el vehículo al inventario; queda en la auditoría"
              variante="fantasmaPeligro"
              onClick={() => setAnulando(true)}
            >
              Anular venta
            </Boton>
          )}
        </>
      }
    >
      <Tarjeta>
        <CabeceraVehiculo
          vehiculo={v.vehiculo}
          extra={
            v.cotizacion && (
              <span>
                Concreta la{' '}
                <Link to={`/cotizaciones/${v.cotizacion.id}`} className={enlace}>
                  cotización N° {v.cotizacion.folio}
                </Link>
              </span>
            )
          }
        />
        <p className="mt-6 text-sm text-slate-500">Precio de venta</p>
        <p className="mt-2 text-[2.25rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950">
          {pesos(v.precioVentaFinal)}
        </p>
        <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100 text-sm [&>div]:flex [&>div]:justify-between [&>div]:gap-4 [&>div]:py-3">
          {v.costosAdicionales.map((c, i) => (
            <div key={`a${i}`}>
              <dt className="text-slate-500">{c.descripcion}</dt>
              <dd className="tabular-nums text-slate-900">
                {c.monto === 0 ? 'Sin costo' : pesos(c.monto)}
              </dd>
            </div>
          ))}
          {v.reserva && (
            <div>
              <dt className="text-slate-500">
                Seña (
                <Link
                  to={`/reservas/${v.reserva.id}`}
                  className="text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
                >
                  reserva N° {v.reserva.folio}
                </Link>
                )
              </dt>
              <dd className="tabular-nums text-slate-900">{pesos(-v.reserva.senaDescontada)}</dd>
            </div>
          )}
          {v.formasPago.map((f, i) => (
            <div key={i}>
              <dt className="text-slate-500">
                {f.tipo === 'PARTE_PAGO' ? 'Vehículo en parte de pago' : etiqueta(f.tipo)}
                {f.vehiculoRecibido && (
                  <>
                    {' '}
                    (
                    <Link
                      to={`/vehiculos/${f.vehiculoRecibido.id}`}
                      className="text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
                    >
                      {f.vehiculoRecibido.patente}
                    </Link>
                    )
                  </>
                )}
              </dt>
              <dd className="tabular-nums text-slate-900">{pesos(f.monto)}</dd>
            </div>
          ))}
          <div className="font-medium">
            <dt className="text-slate-900">Pagado en esta venta</dt>
            <dd className="tabular-nums text-slate-950">{pesos(v.saldoPagado)}</dd>
          </div>
        </dl>
      </Tarjeta>
      {v.liquidacionConsignacion && (
        <Tarjeta titulo="Liquidación de la consignación">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Comisión de la automotora</span>
              <span className="tabular-nums">{pesos(v.liquidacionConsignacion.comision)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Para el consignante</span>
              <span className="tabular-nums">
                {pesos(v.liquidacionConsignacion.montoConsignante)}
              </span>
            </div>
          </div>
        </Tarjeta>
      )}
      {anulando && (
        <Confirmar
          titulo="Anular venta"
          mensaje={
            <>
              El vehículo vuelve a estar disponible. Si la venta concretaba una reserva, esta queda
              cancelada y <strong>la seña no se devuelve</strong> (queda como ingreso). El vehículo
              recibido en parte de pago, si lo hay, se mantiene en el inventario.
            </>
          }
          textoConfirmar="Anular venta"
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
