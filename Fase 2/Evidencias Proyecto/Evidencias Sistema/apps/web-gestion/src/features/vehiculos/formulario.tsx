import {
  CategoriaVehiculo,
  CombustibleVehiculo,
  TraccionVehiculo,
  TransmisionVehiculo,
} from '@vitriauto/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useFormulario } from '../../lib/formulario';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { porcentajeDeGanancia } from '@vitriauto/shared-types';
import { useSesion } from '../../auth/sesion';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api, qs } from '../../lib/api';
import { fecha, hoy, pesos } from '../../lib/formato';
import type { Pagina } from '../../lib/tipos';
import {
  Boton,
  Campo,
  cx,
  EncabezadoPagina,
  Input,
  Nota,
  Opciones,
  Select,
  Tarjeta,
  Textarea,
} from '../../ui/componentes';
import { useAviso } from '../../ui/toast';
import {
  CondicionesTrato,
  cuerpoTrato,
  errorTrato,
  tratoInicial,
  type Trato,
} from '../consignaciones/trato';
import { SelectorCliente } from '../clientes/selector-cliente';
import { CasillaCorreo, useEnvioCorreo } from '../comercial/correos';
import type { Cliente } from '../clientes/tipos';
import type { VehiculoDetalle } from './tipos';

export interface DatosGenerales {
  marca: string;
  modelo: string;
  version: string;
  anio: number;
  kilometraje: number;
  color: string;
  combustible: string;
  transmision: string;
  cilindrada: string;
  patente: string;
  categoria: string;
  traccion: string;
  descripcion: string;
  precioVenta: number;
}

// Quita strings vacíos y NaN (la API rechaza '' en campos opcionales como fechas).
export function limpiar<T extends object>(datos: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(datos).filter(
      ([, v]) => v !== '' && v !== undefined && !(typeof v === 'number' && Number.isNaN(v)),
    ),
  ) as Partial<T>;
}

function CamposGenerales({
  register,
  errores,
  onPatente,
  categoria,
}: {
  register: UseFormRegister<DatosGenerales>;
  errores: FieldErrors<DatosGenerales>;
  onPatente?: (patente: string) => void;
  categoria: string; // la tracción no aplica a las motos
}) {
  const moto = categoria === 'MOTO';
  const req = { required: 'Obligatorio' };
  const numero = {
    required: 'Obligatorio',
    valueAsNumber: true,
    min: { value: 0, message: 'Debe ser positivo' },
  };
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Campo etiqueta="Patente" error={errores.patente?.message}>
        <Input
          placeholder="BCDF12"
          className="uppercase"
          {...register('patente', { ...req, onBlur: (e) => onPatente?.(e.target.value) })}
        />
      </Campo>
      <Campo etiqueta="Marca" error={errores.marca?.message}>
        <Input {...register('marca', req)} />
      </Campo>
      <Campo etiqueta="Modelo" error={errores.modelo?.message}>
        <Input {...register('modelo', req)} />
      </Campo>
      <Campo etiqueta="Versión">
        <Input {...register('version')} />
      </Campo>
      <Campo etiqueta="Año" error={errores.anio?.message}>
        <Input
          type="number"
          {...register('anio', { ...numero, min: { value: 1900, message: 'Año inválido' } })}
        />
      </Campo>
      <Campo etiqueta="Kilometraje" error={errores.kilometraje?.message}>
        <Input type="number" miles {...register('kilometraje', numero)} />
      </Campo>
      <Campo etiqueta="Color" error={errores.color?.message}>
        <Input {...register('color', req)} />
      </Campo>
      <Campo etiqueta="Cilindrada">
        <Input placeholder={moto ? '150 cc' : '1.5'} {...register('cilindrada')} />
      </Campo>
      <Campo etiqueta="Tipo">
        <Select {...register('categoria')}>
          <Opciones valores={CategoriaVehiculo.options} />
        </Select>
      </Campo>
      <Campo etiqueta="Combustible">
        <Select {...register('combustible')}>
          <Opciones valores={CombustibleVehiculo.options} />
        </Select>
      </Campo>
      <Campo etiqueta="Transmisión">
        <Select {...register('transmision')}>
          <Opciones valores={TransmisionVehiculo.options} />
        </Select>
      </Campo>
      {!moto && (
        <Campo etiqueta="Tracción">
          <Select {...register('traccion')}>
            <Opciones valores={TraccionVehiculo.options} />
          </Select>
        </Campo>
      )}
      <Campo
        etiqueta="Descripción (se publica en el sitio)"
        className="sm:col-span-2 lg:col-span-3"
      >
        <Textarea {...register('descripcion')} />
      </Campo>
    </div>
  );
}

// Precio de venta: fuera de la ficha, en la sección de precio.
function CampoPrecioVenta({
  register,
  errores,
  etiqueta = 'Precio de venta',
  ayuda = 'Se publica en el sitio',
  bloqueado,
}: {
  register: UseFormRegister<DatosGenerales>;
  errores: FieldErrors<DatosGenerales>;
  etiqueta?: string;
  ayuda?: string;
  bloqueado?: boolean;
}) {
  return (
    <Campo etiqueta={etiqueta} error={errores.precioVenta?.message} ayuda={ayuda}>
      <Input
        type="number"
        moneda
        disabled={bloqueado}
        {...register('precioVenta', {
          required: 'Obligatorio',
          valueAsNumber: true,
          min: { value: 1, message: 'Obligatorio' },
        })}
      />
    </Campo>
  );
}

interface TasacionAceptada {
  id: string;
  folio: number;
  cliente: { nombre: string };
  vehiculoTasado: {
    patente: string;
    marca: string;
    modelo: string;
    version: string | null;
    anio: number;
    kilometraje: number;
  };
  ofertaMonto: number;
  vehiculoCreadoId: string | null;
}

interface DatosNuevo extends DatosGenerales {
  origen: 'COMPRA_DIRECTA' | 'CONSIGNACION' | 'COMPRA_PARTICULAR';
  costoAdquisicion: number;
  fechaIngreso: string;
  sucursalId: string;
  tasacionId: string;
  fechaFin: string;
}

// Alta de vehículo. La sucursal se autocompleta para Admin de Sucursal y
// Vendedor; el Admin General la elige. Nace EN_PREPARACION.
const ORIGENES = [
  {
    valor: 'COMPRA_DIRECTA',
    titulo: 'Compra directa',
    detalle: 'La automotora lo compró y es dueña del vehículo.',
  },
  {
    valor: 'CONSIGNACION',
    titulo: 'Consignación',
    detalle: 'Un tercero lo deja a la venta a cambio de una comisión.',
  },
  {
    valor: 'COMPRA_PARTICULAR',
    titulo: 'Compra a particular',
    detalle: 'Viene de una tasación aceptada.',
  },
];

export function NuevoVehiculoPage() {
  const { esGeneral, esAdmin } = useSesion();
  const { sucursales, sucursalId } = useSucursalActiva();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [consignante, setConsignante] = useState<Cliente | null>(null);
  const [enviarCorreo, setEnviarCorreo] = useEnvioCorreo('consignacion');
  const [trato, setTrato] = useState<Trato>(tratoInicial);
  const [revision, setRevision] = useState<string | null>(null);
  // Desde el detalle de una tasación aceptada: /vehiculos/nuevo?tasacionId=...
  // Desde Consignaciones ("Nueva consignación"): /vehiculos/nuevo?origen=CONSIGNACION
  const [params] = useSearchParams();
  const tasacionInicial = params.get('tasacionId');
  const origenInicial = params.get('origen') === 'CONSIGNACION' ? 'CONSIGNACION' : null;
  const precargada = useRef(false);

  const { register, handleSubmit, watch, setValue, formState } = useFormulario<DatosNuevo>({
    defaultValues: {
      origen: tasacionInicial ? 'COMPRA_PARTICULAR' : (origenInicial ?? 'COMPRA_DIRECTA'),
      categoria: 'SEDAN',
      combustible: 'BENCINA',
      transmision: 'MANUAL',
      traccion: 'X4X2',
      sucursalId: sucursalId ?? '',
      fechaIngreso: hoy(),
    },
  });
  const origen = watch('origen');
  const precioPublicado = watch('precioVenta');
  const costoCompra = watch('costoAdquisicion');
  const e = formState.errors;

  const tasaciones = useQuery({
    queryKey: ['tasaciones', 'aceptadas'],
    queryFn: () =>
      api<Pagina<TasacionAceptada>>('GET', `/tasaciones${qs({ estado: 'ACEPTADA', limit: 100 })}`),
    enabled: origen === 'COMPRA_PARTICULAR',
  });
  const disponibles = tasaciones.data?.items.filter((t) => !t.vehiculoCreadoId) ?? [];

  const sugerirRevision = async (patente: string) => {
    if (patente.trim().length < 5) return;
    const r = await api<{ fechaVencimientoSugerida: string | null }>(
      'GET',
      `/vehiculos/sugerencia-revision-tecnica${qs({ patente })}`,
    ).catch(() => null);
    setRevision(r?.fechaVencimientoSugerida ?? null);
  };

  const crear = useMutation({
    mutationFn: (d: DatosNuevo) =>
      api<VehiculoDetalle>('POST', '/vehiculos', {
        body: {
          ...limpiar({
            marca: d.marca,
            modelo: d.modelo,
            version: d.version,
            anio: d.anio,
            kilometraje: d.kilometraje,
            color: d.color,
            combustible: d.combustible,
            transmision: d.transmision,
            cilindrada: d.cilindrada,
            patente: d.patente,
            categoria: d.categoria,
            traccion: d.categoria === 'MOTO' ? undefined : d.traccion,
            descripcion: d.descripcion,
            precioVenta: d.precioVenta,
          }),
          origen: d.origen,
          sucursalId: esGeneral ? d.sucursalId : undefined,
          fechaIngreso: d.origen !== 'CONSIGNACION' && d.fechaIngreso ? d.fechaIngreso : undefined,
          costoAdquisicion: d.origen !== 'CONSIGNACION' ? d.costoAdquisicion : undefined,
          tasacionId: d.origen === 'COMPRA_PARTICULAR' ? d.tasacionId : undefined,
          consignacion:
            d.origen === 'CONSIGNACION'
              ? {
                  clienteId: consignante?.id,
                  ...cuerpoTrato(trato),
                  fechaFin: d.fechaFin,
                  enviarCorreo,
                }
              : undefined,
        },
      }),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
      avisar('Vehículo creado. Sube sus fotos para poder publicarlo.');
      navegar(`/vehiculos/${v.id}?pestana=fotos`);
    },
    onError: (err) => avisar(err.message, 'error'),
  });

  // Compra a particular: precarga los datos del auto tasado y la oferta como costo.
  const elegirTasacion = (id: string) => {
    setValue('tasacionId', id, { shouldValidate: true });
    const t = disponibles.find((x) => x.id === id);
    if (!t) return;
    const v = t.vehiculoTasado;
    setValue('patente', v.patente);
    setValue('marca', v.marca);
    setValue('modelo', v.modelo);
    setValue('version', v.version ?? '');
    setValue('anio', v.anio);
    setValue('kilometraje', v.kilometraje);
    setValue('costoAdquisicion', t.ofertaMonto);
    void sugerirRevision(v.patente);
  };

  useEffect(() => {
    if (
      tasacionInicial &&
      !precargada.current &&
      disponibles.some((t) => t.id === tasacionInicial)
    ) {
      precargada.current = true;
      elegirTasacion(tasacionInicial);
    }
  });

  return (
    <>
      <EncabezadoPagina
        volver={{ a: '/vehiculos', texto: 'Vehículos' }}
        titulo="Nuevo vehículo"
        descripcion="Nace “En preparación”: podrás publicarlo cuando tenga al menos una foto."
      />
      <form
        onSubmit={handleSubmit((d) => {
          if (d.origen === 'CONSIGNACION' && !consignante)
            return avisar('Elige el consignante', 'error');
          const errorDelTrato =
            d.origen === 'CONSIGNACION' ? errorTrato(trato, d.precioVenta) : null;
          if (errorDelTrato) return avisar(errorDelTrato, 'error');
          crear.mutate(d);
        })}
        className="max-w-5xl space-y-6"
      >
        <Tarjeta titulo="¿Cómo ingresa el vehículo?">
          <div
            role="radiogroup"
            aria-label="Origen"
            className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            {ORIGENES.map((o) => (
              <label
                key={o.valor}
                className={cx(
                  'flex cursor-pointer flex-col gap-0.5 rounded-2xl px-4 py-3.5 transition-shadow duration-150',
                  origen === o.valor
                    ? 'bg-slate-50 shadow-[0_0_0_1.5px_var(--color-slate-900)]'
                    : 'bg-superficie ring-1 ring-inset ring-slate-200 hover:ring-slate-300',
                )}
              >
                <input type="radio" value={o.valor} className="sr-only" {...register('origen')} />
                <span className="text-sm font-medium text-slate-900">{o.titulo}</span>
                <span className="text-xs leading-relaxed text-slate-500">{o.detalle}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {esGeneral && (
              <Campo etiqueta="Sucursal" error={e.sucursalId?.message}>
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
            {origen === 'COMPRA_PARTICULAR' && (
              <Campo
                etiqueta="Tasación aceptada"
                error={e.tasacionId?.message}
                className="sm:col-span-3"
              >
                <Select
                  {...register('tasacionId', { required: 'Elige la tasación' })}
                  onChange={(ev) => elegirTasacion(ev.target.value)}
                >
                  <option value="">
                    {tasaciones.isSuccess && disponibles.length === 0
                      ? 'No hay tasaciones aceptadas disponibles'
                      : 'Elige…'}
                  </option>
                  {disponibles.map((t) => (
                    <option key={t.id} value={t.id}>
                      N° {t.folio} · {t.vehiculoTasado.patente} {t.vehiculoTasado.marca}{' '}
                      {t.vehiculoTasado.modelo} · {t.cliente.nombre} · oferta {pesos(t.ofertaMonto)}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}
            {origen === 'CONSIGNACION' && (
              <>
                <Campo etiqueta="Consignante (dueño del vehículo)" className="sm:col-span-2">
                  <SelectorCliente valor={consignante} onCambiar={setConsignante} />
                </Campo>
                <Campo etiqueta="Plazo hasta" error={e.fechaFin?.message}>
                  <Input
                    type="date"
                    min={hoy()}
                    {...register('fechaFin', { required: 'Obligatorio' })}
                  />
                </Campo>
              </>
            )}
          </div>
        </Tarjeta>
        <Tarjeta titulo="Datos del vehículo">
          <CamposGenerales
            register={register as unknown as UseFormRegister<DatosGenerales>}
            errores={e}
            onPatente={sugerirRevision}
            categoria={watch('categoria')}
          />
          {revision && (
            <div className="mt-5">
              <Nota>
                Revisión técnica sugerida según el último dígito de la patente: vence el{' '}
                <strong>{fecha(revision)}</strong>. Súbela en “Documentos” una vez creado.
              </Nota>
            </div>
          )}
        </Tarjeta>
        {origen === 'CONSIGNACION' ? (
          <Tarjeta
            titulo="Precio y trato con el dueño"
            descripcion="Cómo se reparte el precio de venta entre el dueño y la automotora."
          >
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CampoPrecioVenta
                register={register as unknown as UseFormRegister<DatosGenerales>}
                errores={e}
              />
            </div>
            <CondicionesTrato
              precio={Number.isFinite(precioPublicado) ? precioPublicado : null}
              valor={trato}
              onCambiar={setTrato}
            />
          </Tarjeta>
        ) : (
          <Tarjeta titulo="Compra y venta">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Campo
                etiqueta="Precio de compra"
                error={e.costoAdquisicion?.message}
                ayuda={
                  origen === 'COMPRA_PARTICULAR'
                    ? 'La oferta aceptada de la tasación'
                    : 'No se muestra a los vendedores'
                }
              >
                <Input
                  type="number"
                  moneda
                  {...register('costoAdquisicion', {
                    required: 'Obligatorio',
                    valueAsNumber: true,
                    min: { value: 1, message: 'Obligatorio' },
                  })}
                />
              </Campo>
              <Campo etiqueta="Fecha de compra">
                <Input type="date" max={hoy()} {...register('fechaIngreso')} />
              </Campo>
              <CampoPrecioVenta
                register={register as unknown as UseFormRegister<DatosGenerales>}
                errores={e}
              />
            </div>
            {esAdmin && costoCompra > 0 && precioPublicado > 0 && (
              <p
                className={cx(
                  'mt-5 rounded-xl px-4 py-3 text-sm ring-1 ring-inset',
                  precioPublicado - costoCompra < 0
                    ? 'bg-red-50 text-red-800 ring-red-200'
                    : 'bg-slate-50 text-slate-700 ring-slate-200',
                )}
              >
                Margen proyectado antes de gastos:{' '}
                <strong className="tabular-nums">{pesos(precioPublicado - costoCompra)}</strong> (
                {porcentajeDeGanancia(
                  precioPublicado - costoCompra,
                  precioPublicado,
                ).toLocaleString('es-CL')}
                % del precio de venta).
              </p>
            )}
          </Tarjeta>
        )}
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          {origen === 'CONSIGNACION' ? (
            <CasillaCorreo
              marcada={enviarCorreo}
              onCambiar={setEnviarCorreo}
              email={consignante?.email}
            />
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Boton variante="secundario" onClick={() => navegar(-1)}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={crear.isPending}>
              Crear vehículo
            </Boton>
          </div>
        </div>
      </form>
    </>
  );
}

// Edición de datos generales y precio, en la pestaña "Ficha técnica" del
// vehículo (el costo solo lo editan admins, y nunca en consignados).
export function FormularioFicha({ vehiculo }: { vehiculo: VehiculoDetalle }) {
  const { esAdmin } = useSesion();
  const qc = useQueryClient();
  const avisar = useAviso();
  const puedeCosto = esAdmin && vehiculo.origen !== 'CONSIGNACION';
  // El precio de un auto publicado lo cambia un admin.
  const precioBloqueado = !esAdmin && vehiculo.estado === 'DISPONIBLE';
  const { register, handleSubmit, formState, watch, reset } = useFormulario<
    DatosGenerales & { costoAdquisicion: number }
  >({
    defaultValues: {
      ...vehiculo,
      // Una moto no tiene tracción: si se cambia a otra categoría, parte en 4x2.
      traccion: vehiculo.traccion ?? 'X4X2',
      version: vehiculo.version ?? '',
      cilindrada: vehiculo.cilindrada ?? '',
      descripcion: vehiculo.descripcion ?? '',
      costoAdquisicion: vehiculo.costoAdquisicion,
    },
  });
  const guardar = useMutation({
    mutationFn: (d: DatosGenerales & { costoAdquisicion: number }) => {
      const { costoAdquisicion, ...g } = d;
      return api('PATCH', `/vehiculos/${vehiculo.id}`, {
        body: {
          marca: g.marca,
          modelo: g.modelo,
          version: g.version || null,
          anio: g.anio,
          kilometraje: g.kilometraje,
          color: g.color,
          combustible: g.combustible,
          transmision: g.transmision,
          cilindrada: g.cilindrada || null,
          patente: g.patente,
          categoria: g.categoria,
          traccion: g.categoria === 'MOTO' ? undefined : g.traccion,
          descripcion: g.descripcion || null,
          ...(precioBloqueado ? {} : { precioVenta: g.precioVenta }),
          ...(puedeCosto ? { costoAdquisicion } : {}),
        },
      });
    },
    onSuccess: (_r, d) => {
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
      qc.invalidateQueries({ queryKey: ['vehiculo', vehiculo.id] });
      avisar('Cambios guardados');
      // Lo guardado pasa a ser el punto de partida (sin cambios pendientes).
      reset(d);
    },
    onError: (err) => avisar(err.message, 'error'),
  });
  return (
    <form onSubmit={handleSubmit((d) => guardar.mutate(d))} className="space-y-4">
      <CamposGenerales
        register={register as unknown as UseFormRegister<DatosGenerales>}
        errores={formState.errors}
        categoria={watch('categoria')}
      />
      <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <CampoPrecioVenta
          register={register as unknown as UseFormRegister<DatosGenerales>}
          errores={formState.errors}
          bloqueado={precioBloqueado}
          ayuda={
            precioBloqueado
              ? 'Está publicado: solo un admin cambia su precio'
              : 'Se publica en el sitio'
          }
        />
        {puedeCosto && (
          <Campo etiqueta="Precio de compra" ayuda="No se muestra a los vendedores">
            <Input
              type="number"
              moneda
              {...register('costoAdquisicion', { valueAsNumber: true })}
            />
          </Campo>
        )}
      </div>
      <div className="flex flex-col-reverse items-center gap-2 pt-2 sm:flex-row sm:justify-end">
        {formState.isDirty && (
          <span className="text-xs text-slate-500 sm:mr-auto">Tienes cambios sin guardar</span>
        )}
        {formState.isDirty && (
          <Boton variante="secundario" onClick={() => reset()}>
            Descartar cambios
          </Boton>
        )}
        <Boton type="submit" disabled={!formState.isDirty} cargando={guardar.isPending}>
          Guardar cambios
        </Boton>
      </div>
    </form>
  );
}
