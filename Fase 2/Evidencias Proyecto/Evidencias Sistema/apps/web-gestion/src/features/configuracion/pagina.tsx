import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import {
  descripcionSeoAutomotora,
  esRutValido,
  formatearRut,
  LARGO_DESCRIPCION_SEO,
  PLAZOS_CREDITO,
  simularCredito,
  tituloSeoAutomotora,
} from '@vitriauto/shared-types';
import { useFormulario } from '../../lib/formulario';
import { InputRut } from '../../ui/rut';
import { CLAVE_SESION, useSesion } from '../../auth/sesion';
import { api } from '../../lib/api';
import { DOMINIO_PUBLICO, urlApi, urlVitrina } from '../../lib/config';
import { ACEPTA_FOTOS, esFormatoFoto, pesos } from '../../lib/formato';
import type { Automotora, ConfigCorreos, Sucursal } from '../../lib/tipos';
import {
  Boton,
  Campo,
  Cargando,
  EncabezadoPagina,
  Input,
  Select,
  Tarjeta,
  Textarea,
} from '../../ui/componentes';
import { useAviso } from '../../ui/toast';

// Configuración de la automotora (solo Admin General). El subdominio es fijo.
export function ConfiguracionPage() {
  const { automotora } = useSesion();
  if (!automotora) return <Cargando />;
  return <Formulario automotora={automotora} />;
}

function valoresIniciales(automotora: Automotora) {
  return {
    nombre: automotora.nombre,
    rut: formatearRut(automotora.rut),
    email: automotora.email,
    direccion: automotora.direccion,
    telefono: automotora.telefono,
    descripcion: automotora.descripcion ?? '',
    diasValidezCotizacion: automotora.diasValidezCotizacion,
    diasValidezReserva: automotora.diasValidezReserva,
    diasValidezTasacion: automotora.diasValidezTasacion,
    ...valoresCorreos(automotora.correos),
    financiamientoActivo: automotora.financiamiento.activo,
    financiamientoTasaMensual: automotora.financiamiento.tasaMensual ?? Number.NaN,
    financiamientoPieMinimo: automotora.financiamiento.pieMinimo,
    financiamientoPlazoMaximo: automotora.financiamiento.plazoMaximo,
  };
}
type ValoresFormulario = ReturnType<typeof valoresIniciales>;

function Formulario({ automotora }: { automotora: Automotora }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { register, handleSubmit, formState, watch } = useFormulario({
    defaultValues: valoresIniciales(automotora),
  });
  const guardar = handleSubmit(async (d) => {
    try {
      const { recordatorios, ...resto } = d;
      await api('PATCH', '/automotora', {
        body: {
          ...resto,
          descripcion: d.descripcion || null,
          // Tasa vacía = sin tasa (el simulador no puede quedar activo).
          financiamientoTasaMensual: Number.isNaN(d.financiamientoTasaMensual)
            ? null
            : d.financiamientoTasaMensual,
          // Recordatorio apagado = null (no se envía).
          ...Object.fromEntries(
            RECORDATORIOS.map((r) => [
              r.campo,
              recordatorios[r.campo] ? (resto[r.campo] ?? r.defecto) : null,
            ]),
          ),
        },
      });
      await qc.invalidateQueries({ queryKey: CLAVE_SESION });
      avisar('Configuración guardada');
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Configuración"
        descripcion={
          <>
            Tu página pública:{' '}
            <a
              href={urlVitrina(automotora.subdominio)}
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:text-slate-900 hover:decoration-slate-900"
            >
              {automotora.subdominio}.{DOMINIO_PUBLICO}
            </a>{' '}
            (el subdominio no se puede cambiar).
          </>
        }
      />
      <form onSubmit={guardar} className="space-y-6">
        <Tarjeta titulo="Datos de la empresa">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre">
              <Input {...register('nombre', { required: true })} />
            </Campo>
            <Campo etiqueta="RUT" error={formState.errors.rut?.message}>
              <InputRut
                {...register('rut', {
                  required: 'Obligatorio',
                  validate: (v) => esRutValido(v) || 'RUT inválido: revisa el dígito verificador',
                })}
              />
            </Campo>
            <Campo etiqueta="Email">
              <Input type="email" {...register('email', { required: true })} />
            </Campo>
            <Campo etiqueta="Teléfono (casa matriz)">
              <Input {...register('telefono', { required: true })} />
            </Campo>
            <Campo
              etiqueta="Dirección (casa matriz)"
              className="sm:col-span-2"
              ayuda="Las direcciones de cada sucursal se editan en Sucursales."
            >
              <Input {...register('direccion', { required: true })} />
            </Campo>
            <Campo
              etiqueta="Descripción breve (página pública y Google)"
              className="sm:col-span-2"
              ayuda={`Cuenta qué te diferencia y dónde estás. Google muestra los primeros ${LARGO_DESCRIPCION_SEO} caracteres.`}
            >
              <Textarea maxLength={1000} {...register('descripcion')} />
            </Campo>
            <VistaGoogle
              className="sm:col-span-2"
              nombre={watch('nombre') || automotora.nombre}
              descripcion={watch('descripcion')}
              subdominio={automotora.subdominio}
              logoUrl={automotora.logoUrl}
            />
          </div>
        </Tarjeta>
        <Tarjeta titulo="Vigencia por defecto de los documentos (días)">
          <p className="mb-4 text-sm text-slate-500">
            Se pueden ajustar al emitir cada documento. Los ya emitidos no cambian.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Campo etiqueta="Cotización">
              <Input
                type="number"
                min={1}
                max={365}
                {...register('diasValidezCotizacion', { valueAsNumber: true, min: 1, max: 365 })}
              />
            </Campo>
            <Campo etiqueta="Reserva">
              <Input
                type="number"
                min={1}
                max={365}
                {...register('diasValidezReserva', { valueAsNumber: true, min: 1, max: 365 })}
              />
            </Campo>
            <Campo etiqueta="Tasación">
              <Input
                type="number"
                min={1}
                max={365}
                {...register('diasValidezTasacion', { valueAsNumber: true, min: 1, max: 365 })}
              />
            </Campo>
          </div>
        </Tarjeta>
        <Financiamiento
          activo={watch('financiamientoActivo')}
          tasa={watch('financiamientoTasaMensual')}
          pieMinimo={watch('financiamientoPieMinimo')}
          plazoMaximo={watch('financiamientoPlazoMaximo')}
          errorTasa={formState.errors.financiamientoTasaMensual?.message}
          register={register}
        />
        <Tarjeta
          titulo="Correos a clientes"
          descripcion={`Se envían con el nombre de tu automotora y las respuestas llegan a ${automotora.email}.`}
        >
          <fieldset>
            <legend className="text-sm font-medium text-slate-900">Enviar el PDF al emitir</legend>
            <p className="mt-0.5 text-xs text-slate-500">
              Por defecto en cada documento; al emitirlo se puede desmarcar caso a caso.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5">
              {DOCUMENTOS.map((d) => (
                <label
                  key={d.campo}
                  className="inline-flex h-9 cursor-pointer select-none items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer rounded"
                    {...register(d.campo)}
                  />
                  {d.texto}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 border-t border-slate-100 pt-5">
            <fieldset>
              <legend className="text-sm font-medium text-slate-900">
                Recordatorios automáticos
              </legend>
              <p className="mt-0.5 text-xs text-slate-500">
                Se revisan cada mañana. Nunca se envían si el documento se anuló, se concretó o el
                auto ya se vendió, ni a clientes que pidieron no recibirlos.
              </p>
              <div className="mt-3 divide-y divide-slate-100">
                {RECORDATORIOS.map((r) => {
                  const activo = watch(`recordatorios.${r.campo}`);
                  return (
                    <div
                      key={r.campo}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <label className="flex cursor-pointer select-none items-start gap-2.5">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded"
                          {...register(`recordatorios.${r.campo}`)}
                        />
                        <span>
                          <span className="block text-sm text-slate-800">{r.texto}</span>
                          <span className="block text-xs text-slate-500">{r.detalle}</span>
                        </span>
                      </label>
                      <div className="flex items-center gap-2 pl-6.5 sm:pl-0">
                        <Input
                          type="number"
                          min={1}
                          max={r.maximo}
                          disabled={!activo}
                          aria-label={`${r.texto}: días`}
                          className="w-20"
                          {...register(r.campo, {
                            valueAsNumber: true,
                            min: 1,
                            max: r.maximo,
                            validate: (v) => !activo || !Number.isNaN(v),
                          })}
                        />
                        <span className="w-24 whitespace-nowrap text-sm text-slate-500">
                          {r.unidad}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </Tarjeta>
        <div className="flex justify-end">
          <Boton type="submit" cargando={formState.isSubmitting}>
            Guardar cambios
          </Boton>
        </div>
      </form>
      <Tarjeta titulo="Imagen de tu página pública" className="mt-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Imagen tipo="logo" titulo="Logo" url={automotora.logoUrl} />
          <Imagen tipo="banner" titulo="Banner" url={automotora.bannerUrl} />
        </div>
      </Tarjeta>
    </>
  );
}

// Precio de ejemplo para mostrar cómo queda la cuota con la configuración elegida.
const PRECIO_EJEMPLO = 10_000_000;

// Simulador de crédito de la ficha pública. Solo referencial: la tasa la
// define la automotora y sin tasa no se puede activar.
function Financiamiento({
  activo,
  tasa,
  pieMinimo,
  plazoMaximo,
  errorTasa,
  register,
}: {
  activo: boolean;
  tasa: number;
  pieMinimo: number;
  plazoMaximo: number;
  errorTasa?: string;
  register: UseFormRegister<ValoresFormulario>;
}) {
  const plazo = Math.min(36, plazoMaximo);
  const ejemplo =
    tasa > 0 && pieMinimo >= 0 ? simularCredito(PRECIO_EJEMPLO, pieMinimo, plazo, tasa) : null;
  return (
    <Tarjeta
      titulo="Simulador de crédito"
      descripcion="Muestra una cuota mensual referencial en la ficha de tus vehículos publicados."
    >
      <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          className="size-4 cursor-pointer rounded"
          {...register('financiamientoActivo')}
        />
        Mostrar el simulador en mi página pública y en el marketplace
      </label>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo
          etiqueta="Tasa mensual (%)"
          error={errorTasa}
          ayuda="Referencial, por ejemplo 1,49. Entre 0,01 y 5."
        >
          <Input
            type="number"
            inputMode="decimal"
            step={0.01}
            min={0.01}
            max={5}
            {...register('financiamientoTasaMensual', {
              valueAsNumber: true,
              validate: (v) =>
                Number.isNaN(v)
                  ? !activo || 'Indica la tasa para activar el simulador'
                  : (v >= 0.01 && v <= 5) || 'Debe estar entre 0,01 y 5',
            })}
          />
        </Campo>
        <Campo etiqueta="Pie mínimo (%)" ayuda="Del precio del vehículo, entre 0 y 80.">
          <Input
            type="number"
            min={0}
            max={80}
            step={5}
            {...register('financiamientoPieMinimo', { valueAsNumber: true, min: 0, max: 80 })}
          />
        </Campo>
        <Campo etiqueta="Plazo máximo">
          <Select {...register('financiamientoPlazoMaximo', { setValueAs: Number })}>
            {PLAZOS_CREDITO.map((p) => (
              <option key={p} value={p}>
                {p} meses
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      {ejemplo && (
        <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Ejemplo: un auto de {pesos(PRECIO_EJEMPLO)} con {pieMinimo}% de pie a {plazo} meses queda
          en <span className="font-medium tabular-nums text-slate-900">{pesos(ejemplo.cuota)}</span>{' '}
          al mes.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        El comprador ve el aviso “Simulación referencial. La tasa, la CAE y las condiciones finales
        las informa la automotora o la financiera.”
      </p>
    </Tarjeta>
  );
}

// Cómo aparece la vitrina en Google: mismo título y descripción que genera el
// sitio público, con las comunas de las sucursales.
function VistaGoogle({
  nombre,
  descripcion,
  subdominio,
  logoUrl,
  className,
}: {
  nombre: string;
  descripcion: string;
  subdominio: string;
  logoUrl: string | null;
  className?: string;
}) {
  const { data: sucursales = [] } = useQuery({
    queryKey: ['sucursales'],
    queryFn: () => api<Sucursal[]>('GET', '/sucursales'),
  });
  const comunas = sucursales.map((s) => s.comuna);
  return (
    <div className={className}>
      <p className="mb-2 text-xs font-medium text-slate-500">Así se verá tu página en Google</p>
      <div className="rounded-2xl bg-slate-100 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-superficie ring-1 ring-slate-200">
            {logoUrl ? (
              <img src={urlApi(logoUrl)} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-xs font-semibold text-slate-500">{nombre.charAt(0)}</span>
            )}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[0.8125rem] text-slate-800">{nombre}</span>
            <span className="block truncate text-xs text-slate-500">
              https://{subdominio}.{DOMINIO_PUBLICO}
            </span>
          </span>
        </div>
        <p className="mt-2 truncate text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
          {tituloSeoAutomotora(nombre, comunas)}
        </p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-slate-600">
          {descripcionSeoAutomotora(nombre, descripcion || null, comunas)}
        </p>
      </div>
      {!descripcion.trim() && (
        <p className="mt-1.5 text-xs text-slate-500">
          Sin descripción, se usa un texto genérico. Escribe una propia para destacar.
        </p>
      )}
    </div>
  );
}

const DOCUMENTOS = [
  { campo: 'correoCotizacion', texto: 'Cotización' },
  { campo: 'correoReserva', texto: 'Reserva' },
  { campo: 'correoTasacion', texto: 'Tasación' },
  { campo: 'correoVenta', texto: 'Venta' },
  { campo: 'correoConsignacion', texto: 'Consignación' },
] as const;

const RECORDATORIOS = [
  {
    campo: 'diasSeguimientoCotizacion',
    texto: 'Seguimiento de cotización',
    detalle: '"El auto sigue disponible", solo si no se ha vendido ni reservado.',
    unidad: 'días después',
    maximo: 60,
    defecto: 3,
  },
  {
    campo: 'diasAvisoCotizacion',
    texto: 'Cotización por vencer',
    detalle: 'Aviso al cliente antes de que venza el precio.',
    unidad: 'días antes',
    maximo: 30,
    defecto: 2,
  },
  {
    campo: 'diasAvisoReserva',
    texto: 'Reserva por vencer',
    detalle: 'Se envía aunque el cliente se haya dado de baja (pagó una seña).',
    unidad: 'días antes',
    maximo: 30,
    defecto: 1,
  },
  {
    campo: 'diasAvisoTasacion',
    texto: 'Oferta de tasación por vencer',
    detalle: 'Aviso antes de que venza la oferta por su auto.',
    unidad: 'días antes',
    maximo: 30,
    defecto: 2,
  },
] as const;

function valoresCorreos(c: ConfigCorreos) {
  return {
    correoCotizacion: c.cotizacion,
    correoReserva: c.reserva,
    correoTasacion: c.tasacion,
    correoVenta: c.venta,
    correoConsignacion: c.consignacion,
    // Apagado: se muestra el valor por defecto (deshabilitado) para encenderlo fácil.
    diasSeguimientoCotizacion: c.diasSeguimientoCotizacion ?? 3,
    diasAvisoCotizacion: c.diasAvisoCotizacion ?? 2,
    diasAvisoReserva: c.diasAvisoReserva ?? 1,
    diasAvisoTasacion: c.diasAvisoTasacion ?? 2,
    recordatorios: {
      diasSeguimientoCotizacion: c.diasSeguimientoCotizacion !== null,
      diasAvisoCotizacion: c.diasAvisoCotizacion !== null,
      diasAvisoReserva: c.diasAvisoReserva !== null,
      diasAvisoTasacion: c.diasAvisoTasacion !== null,
    },
  };
}

const MAXIMO_MB = 10;
const AYUDA_IMAGEN = {
  logo: 'Cuadrado, idealmente de 400 × 400 px. JPG, PNG, WEBP o HEIC de hasta 10 MB.',
  banner:
    'Horizontal, idealmente de 1920 × 800 px (se recorta a lo ancho). JPG, PNG, WEBP o HEIC de hasta 10 MB.',
};

// Logo o banner de la página pública. Muestra al instante la imagen elegida y,
// al terminar, la respuesta de la API actualiza la sesión sin recargar.
function Imagen({
  tipo,
  titulo,
  url,
}: {
  tipo: 'logo' | 'banner';
  titulo: string;
  url: string | null;
}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const input = useRef<HTMLInputElement>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cambiar = async (archivo: File | null) => {
    if (input.current) input.current.value = '';
    if (archivo && !esFormatoFoto(archivo)) {
      return avisar('Ese formato no sirve: usa una imagen JPG, PNG, WEBP o HEIC.', 'error');
    }
    if (archivo && archivo.size > MAXIMO_MB * 1024 * 1024) {
      const mb = (archivo.size / 1024 / 1024).toLocaleString('es-CL', { maximumFractionDigits: 1 });
      return avisar(
        `La imagen es muy pesada (${mb} MB). El máximo es ${MAXIMO_MB} MB: prueba con una más liviana o redúcela.`,
        'error',
      );
    }
    const previa = archivo ? URL.createObjectURL(archivo) : null;
    setVistaPrevia(previa);
    setOcupado(true);
    try {
      let actualizada: Automotora;
      if (archivo) {
        const form = new FormData();
        form.append('imagen', archivo);
        actualizada = await api<Automotora>('POST', `/automotora/${tipo}`, { body: form });
      } else {
        actualizada = await api<Automotora>('DELETE', `/automotora/${tipo}`);
      }
      qc.setQueryData(CLAVE_SESION, (sesion: { automotora: Automotora } | null | undefined) =>
        sesion ? { ...sesion, automotora: actualizada } : sesion,
      );
      avisar(archivo ? `${titulo} actualizado` : `${titulo} quitado`);
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setOcupado(false);
      setVistaPrevia(null);
      if (previa) URL.revokeObjectURL(previa);
    }
  };

  const imagen = vistaPrevia ?? (url ? urlApi(url) : null);
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      <p className="mb-3 mt-0.5 text-xs text-slate-500">{AYUDA_IMAGEN[tipo]}</p>
      <div
        className={`relative flex items-center justify-center overflow-hidden border border-dashed border-slate-300 bg-slate-100 ${tipo === 'logo' ? 'size-32 rounded-full' : 'aspect-[12/5] w-full rounded-2xl'}`}
      >
        {imagen ? (
          <img
            src={imagen}
            alt={titulo}
            className={`size-full object-cover transition-opacity ${ocupado ? 'opacity-60' : ''}`}
          />
        ) : (
          <span className="text-xs text-slate-500">Sin imagen</span>
        )}
        {ocupado && (
          <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-1 text-center text-xs font-medium text-white">
            {vistaPrevia ? 'Subiendo…' : 'Quitando…'}
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={ACEPTA_FOTOS}
        onChange={(e) => cambiar(e.target.files?.[0] ?? null)}
      />
      <div className="mt-2 flex gap-2">
        <Boton
          ayuda="Sube una imagen JPG, PNG o WebP; se ve en tu página pública"
          variante="secundario"
          chico
          disabled={ocupado}
          onClick={() => input.current?.click()}
        >
          {url ? 'Cambiar' : 'Subir'}
        </Boton>
        {url && (
          <Boton
            ayuda="Quita la imagen de tu página pública"
            variante="fantasmaPeligro"
            chico
            disabled={ocupado}
            onClick={() => cambiar(null)}
          >
            Quitar
          </Boton>
        )}
      </div>
    </div>
  );
}
