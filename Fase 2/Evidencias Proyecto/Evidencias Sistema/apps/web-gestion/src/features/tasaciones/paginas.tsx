import { CalendarDays, Check, Gauge, Tag, X } from 'lucide-react';
import { esPatenteValida } from '@vitriauto/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useFormulario } from '../../lib/formulario';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api } from '../../lib/api';
import { fecha, km, pesos } from '../../lib/formato';
import {
  Avatar,
  BarraPlazo,
  Boton,
  BotonLink,
  Campo,
  Cargando,
  Chip,
  DatoIcono,
  EncabezadoPagina,
  Input,
  Insignia,
  MensajeError,
  Nota,
  Select,
  Tarjeta,
  Td,
  Textarea,
  ItemMovil,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { useAviso } from '../../ui/toast';
import { SelectorCliente } from '../clientes/selector-cliente';
import type { Cliente } from '../clientes/tipos';
import { BotonPdf, ListadoDocumentos, ResumenDocumento } from '../comercial/comun';
import { CabeceraVehiculo, DetalleDocumento, Desglose, enlace } from '../comercial/detalle-comun';
import { CasillaCorreo, useEnvioCorreo } from '../comercial/correos';

interface Tasacion {
  id: string;
  folio: number;
  sucursal: { id: string; nombre: string };
  cliente: { id: string; nombre: string; rut: string };
  vehiculoTasado: {
    patente: string;
    marca: string;
    modelo: string;
    version: string | null;
    anio: number;
    kilometraje: number;
    estadoGeneral: string;
  };
  ofertaMonto: number;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: string;
  emitidaPor: { id: string; nombre: string };
  vehiculoCreadoId: string | null;
  anulacion: { motivo: string; fecha: string | null } | null;
  pdfUrl: string;
}

export function TasacionesPage() {
  const navegar = useNavigate();
  return (
    <ListadoDocumentos<Tasacion>
      titulo="Tasaciones"
      descripcion="Ofertas de compra a clientes que quieren vender su auto. Si se acepta, se registra la compra como un vehículo nuevo."
      ruta="/tasaciones"
      endpoint="/tasaciones"
      estados={['VIGENTE', 'ACEPTADA', 'RECHAZADA', 'VENCIDA', 'ANULADA']}
      textoNuevo="+ Nueva tasación"
      encabezados={[
        { texto: 'N°' },
        { texto: 'Emisión' },
        { texto: 'Cliente' },
        { texto: 'Vehículo tasado' },
        { texto: 'Oferta', derecha: true },
        { texto: 'Vigencia' },
        { texto: 'Estado' },
      ]}
      itemMovil={(t) => (
        <ItemMovil
          key={t.id}
          a={`/tasaciones/${t.id}`}
          avatar={<Avatar nombre={t.cliente.nombre} />}
          titulo={t.cliente.nombre}
          valor={pesos(t.ofertaMonto)}
          subtitulo={`N° ${t.folio} · ${t.vehiculoTasado.marca} ${t.vehiculoTasado.modelo} ${t.vehiculoTasado.anio} · ${t.vehiculoTasado.patente}`}
          insignia={<Insignia valor={t.estado} />}
          pie={`Vence ${fecha(t.fechaVencimiento)}`}
        />
      )}
      fila={(t) => (
        <tr
          key={t.id}
          className="cursor-pointer transition-colors duration-100 hover:bg-slate-50"
          onClick={() => navegar(`/tasaciones/${t.id}`)}
        >
          <Td>
            <Chip className="tabular-nums">N° {t.folio}</Chip>
            <span className="mt-1 block text-xs text-slate-500">{t.sucursal.nombre}</span>
          </Td>
          <Td className="tabular-nums">{fecha(t.fechaEmision)}</Td>
          <Td>
            <div className="flex items-center gap-3">
              <Avatar nombre={t.cliente.nombre} />
              <span className="font-medium text-slate-900">{t.cliente.nombre}</span>
            </div>
          </Td>
          <Td className="whitespace-normal">
            {t.vehiculoTasado.marca} {t.vehiculoTasado.modelo} {t.vehiculoTasado.anio}
            <span className="mt-0.5 block font-mono text-xs tracking-wide text-slate-500">
              {t.vehiculoTasado.patente}
            </span>
          </Td>
          <Td derecha className="font-medium text-slate-900">
            {pesos(t.ofertaMonto)}
          </Td>
          <Td>
            <BarraPlazo
              desde={t.fechaEmision}
              hasta={t.fechaVencimiento}
              abierto={t.estado === 'VIGENTE'}
            />
          </Td>
          <Td>
            <Insignia valor={t.estado} />
          </Td>
        </tr>
      )}
    />
  );
}

interface DatosTasacion {
  patente: string;
  marca: string;
  modelo: string;
  version: string;
  anio: number;
  kilometraje: number;
  estadoGeneral: string;
  ofertaMonto: number;
  vigenciaDias: number;
  sucursalId: string;
}

export function NuevaTasacionPage() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const { automotora, esGeneral } = useSesion();
  const { sucursales, sucursalId } = useSucursalActiva();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [enviarCorreo, setEnviarCorreo] = useEnvioCorreo('tasacion');
  const { register, handleSubmit, watch, formState } = useFormulario<DatosTasacion>({
    defaultValues: { sucursalId: sucursalId ?? '' },
  });
  const e = formState.errors;
  const [marca, modelo, anio] = [watch('marca'), watch('modelo'), watch('anio')];
  const tasado = [marca, modelo, Number.isFinite(anio) ? anio : ''].filter(Boolean).join(' ');

  const emitir = useMutation({
    mutationFn: (d: DatosTasacion) =>
      api<Tasacion>('POST', '/tasaciones', {
        body: {
          clienteId: cliente!.id,
          sucursalId: esGeneral ? d.sucursalId : undefined,
          patente: d.patente,
          marca: d.marca,
          modelo: d.modelo,
          version: d.version || undefined,
          anio: d.anio,
          kilometraje: d.kilometraje,
          estadoGeneral: d.estadoGeneral,
          ofertaMonto: d.ofertaMonto,
          vigenciaDias: Number.isNaN(d.vigenciaDias) ? undefined : d.vigenciaDias,
          enviarCorreo,
        },
      }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['/tasaciones'] });
      avisar(`Tasación N° ${t.folio} emitida`);
      navegar(`/tasaciones/${t.id}`);
    },
    onError: (err) => avisar(err.message, 'error'),
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Nueva tasación"
        descripcion="El auto del cliente no entra al inventario hasta que se registre la compra."
      />
      <form
        className="grid grid-cols-1 gap-6 lg:grid-cols-3"
        onSubmit={handleSubmit((d) => {
          if (!cliente) return avisar('Elige el cliente', 'error');
          emitir.mutate(d);
        })}
      >
        <div className="space-y-6 lg:col-span-2">
          <Tarjeta titulo="Cliente">
            <SelectorCliente valor={cliente} onCambiar={setCliente} />
          </Tarjeta>
          <Tarjeta titulo="Vehículo del cliente">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo etiqueta="Patente" error={e.patente?.message}>
                <Input
                  className="uppercase"
                  {...register('patente', {
                    required: 'Obligatoria',
                    validate: (v) => esPatenteValida(v) || 'Patente inválida',
                  })}
                />
              </Campo>
              <Campo etiqueta="Marca" error={e.marca?.message}>
                <Input {...register('marca', { required: 'Obligatoria' })} />
              </Campo>
              <Campo etiqueta="Modelo" error={e.modelo?.message}>
                <Input {...register('modelo', { required: 'Obligatorio' })} />
              </Campo>
              <Campo etiqueta="Versión">
                <Input {...register('version')} />
              </Campo>
              <Campo etiqueta="Año" error={e.anio?.message}>
                <Input
                  type="number"
                  {...register('anio', {
                    required: 'Obligatorio',
                    valueAsNumber: true,
                    min: { value: 1900, message: 'Año inválido' },
                  })}
                />
              </Campo>
              <Campo etiqueta="Kilometraje" error={e.kilometraje?.message}>
                <Input
                  type="number"
                  miles
                  {...register('kilometraje', {
                    required: 'Obligatorio',
                    valueAsNumber: true,
                    min: 0,
                  })}
                />
              </Campo>
              <Campo
                etiqueta="Estado general"
                error={e.estadoGeneral?.message}
                className="sm:col-span-2 lg:col-span-3"
              >
                <Textarea
                  placeholder="Estado mecánico, carrocería, neumáticos, mantenciones…"
                  {...register('estadoGeneral', { required: 'Obligatorio' })}
                />
              </Campo>
            </div>
          </Tarjeta>
          <Tarjeta titulo="Oferta">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Campo etiqueta="Monto ofrecido (CLP)" error={e.ofertaMonto?.message}>
                <Input
                  type="number"
                  moneda
                  {...register('ofertaMonto', {
                    required: 'Obligatorio',
                    valueAsNumber: true,
                    min: 1,
                  })}
                />
              </Campo>
              <Campo
                etiqueta="Vigencia (días)"
                ayuda={`Por defecto: ${automotora?.diasValidezTasacion ?? 15} días`}
              >
                <Input
                  type="number"
                  min={1}
                  max={365}
                  placeholder={String(automotora?.diasValidezTasacion ?? '')}
                  {...register('vigenciaDias', { valueAsNumber: true })}
                />
              </Campo>
              {esGeneral && (
                <Campo etiqueta="Sucursal que emite" error={e.sucursalId?.message}>
                  <Select {...register('sucursalId', { required: 'Elige la sucursal' })}>
                    <option value="">Elige…</option>
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </Select>
                </Campo>
              )}
            </div>
          </Tarjeta>
        </div>
        <div>
          <div className="sticky top-20 space-y-4">
            <Tarjeta titulo="Resumen">
              <ResumenDocumento
                cliente={cliente?.nombre}
                vehiculo={tasado || undefined}
                filas={[]}
                etiquetaTotal="Oferta de compra"
                total={Number(watch('ofertaMonto')) || 0}
              />
            </Tarjeta>
            <CasillaCorreo
              marcada={enviarCorreo}
              onCambiar={setEnviarCorreo}
              email={cliente?.email}
            />
            <Boton
              ayuda="Emite la tasación con folio y su PDF para el cliente"
              type="submit"
              className="w-full"
              cargando={emitir.isPending}
            >
              Emitir tasación
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

export function TasacionPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [anulando, setAnulando] = useState(false);
  const {
    data: t,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tasacion', id],
    queryFn: () => api<Tasacion>('GET', `/tasaciones/${id}`),
  });
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['tasacion', id] });
    qc.invalidateQueries({ queryKey: ['/tasaciones'] });
    qc.invalidateQueries({ queryKey: ['tasaciones'] });
  };
  const resolver = useMutation({
    mutationFn: (estado: 'ACEPTADA' | 'RECHAZADA') =>
      api('POST', `/tasaciones/${id}/resolver`, { body: { estado } }),
    onSuccess: () => {
      refrescar();
      avisar('Tasación actualizada');
    },
    onError: (e) => avisar(e.message, 'error'),
  });
  const anular = useMutation({
    mutationFn: (motivo: string) => api('POST', `/tasaciones/${id}/anular`, { body: { motivo } }),
    onSuccess: () => {
      refrescar();
      setAnulando(false);
      avisar('Tasación anulada');
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  if (isLoading) return <Cargando />;
  if (!t) return <MensajeError error={error} />;
  const v = t.vehiculoTasado;

  return (
    <DetalleDocumento
      volver={{ ruta: '/tasaciones', texto: 'Tasaciones' }}
      correos={{ tipo: 'TASACION', id: t.id }}
      titulo={`Tasación N° ${t.folio}`}
      estado={t.estado}
      sucursal={t.sucursal.nombre}
      cliente={t.cliente}
      emision={t.fechaEmision}
      vence={t.fechaVencimiento}
      emitidoPor={t.emitidaPor.nombre}
      anulacion={t.anulacion ? { titulo: 'Anulada', ...t.anulacion } : null}
      acciones={
        <>
          <BotonPdf url={t.pdfUrl} />
          {t.estado === 'VIGENTE' && (
            <>
              <Boton
                ayuda="El cliente aceptó la oferta: podrás registrar la compra del vehículo"
                variante="secundario"
                cargando={resolver.isPending}
                onClick={() => resolver.mutate('ACEPTADA')}
              >
                <Check aria-hidden />
                Marcar aceptada
              </Boton>
              <Boton
                ayuda="El cliente no aceptó la oferta"
                variante="secundario"
                cargando={resolver.isPending}
                onClick={() => resolver.mutate('RECHAZADA')}
              >
                <X aria-hidden />
                Marcar rechazada
              </Boton>
            </>
          )}
          {t.estado === 'ACEPTADA' && !t.vehiculoCreadoId && (
            <BotonLink
              ayuda="Ingresa el vehículo tasado al inventario como compra a particular"
              to={`/vehiculos/nuevo?tasacionId=${t.id}`}
            >
              Registrar compra
            </BotonLink>
          )}
          {t.estado !== 'ANULADA' && !t.vehiculoCreadoId && (
            <Boton
              ayuda="Anula la tasación; queda en la auditoría"
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
        <CabeceraVehiculo
          vehiculo={{
            id: t.vehiculoCreadoId,
            descripcion: `${v.marca} ${v.modelo}${v.version ? ` ${v.version}` : ''}`,
            patente: v.patente,
          }}
          extra={!t.vehiculoCreadoId && <span>Aún no está en el inventario</span>}
        />
        <Desglose etiqueta="Oferta de compra" monto={t.ofertaMonto} />
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-slate-100 pt-6 sm:grid-cols-3">
          <DatoIcono icono={CalendarDays} etiqueta="Año">
            {v.anio}
          </DatoIcono>
          <DatoIcono icono={Gauge} etiqueta="Kilometraje">
            {km(v.kilometraje)}
          </DatoIcono>
          <DatoIcono icono={Tag} etiqueta="Versión">
            {v.version}
          </DatoIcono>
        </dl>
        <div className="mt-6 rounded-2xl bg-slate-100 p-4 text-sm">
          <p className="font-medium text-slate-900">Estado general</p>
          <p className="mt-1 whitespace-pre-line text-slate-700">{v.estadoGeneral}</p>
        </div>
        <div className="mt-6 border-t border-slate-100 pt-5">
          <BarraPlazo
            grande
            desde={t.fechaEmision}
            hasta={t.fechaVencimiento}
            abierto={t.estado === 'VIGENTE'}
          />
        </div>
        {t.vehiculoCreadoId && (
          <div className="mt-5">
            <Nota>
              Compra registrada:{' '}
              <Link to={`/vehiculos/${t.vehiculoCreadoId}`} className={`font-medium ${enlace}`}>
                ver vehículo en el inventario
              </Link>
            </Nota>
          </div>
        )}
      </Tarjeta>
      {anulando && (
        <Confirmar
          titulo="Anular tasación"
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
