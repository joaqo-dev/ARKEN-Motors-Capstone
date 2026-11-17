import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { Car, Download, FileText, Loader2, Plus, Search, X, ImageOff } from 'lucide-react';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api, qs } from '../../lib/api';
import { urlApi } from '../../lib/config';
import { etiqueta, pesos } from '../../lib/formato';
import { useDemorado } from '../../lib/persistente';
import type { Pagina } from '../../lib/tipos';
import {
  Boton,
  BotonA,
  BotonLink,
  Buscador,
  Cargando,
  cx,
  EncabezadoPagina,
  Filtros,
  Input,
  MensajeError,
  Segmentado,
  Paginacion,
  RangoFechas,
  Select,
  ListaMovil,
  Tabla,
  Th,
  Vacio,
} from '../../ui/componentes';
import type { VehiculoListado } from '../vehiculos/tipos';

// ---------------------------------------------------------------- Selector de vehículo

// Vehículos que admiten documentos comerciales (ni vendidos ni dados de baja).
export function SelectorVehiculo({
  valor,
  onCambiar,
  filtro = (v) => v.estado !== 'VENDIDO' && v.estado !== 'DADO_DE_BAJA',
}: {
  valor: VehiculoListado | null;
  onCambiar: (v: VehiculoListado | null) => void;
  filtro?: (v: VehiculoListado) => boolean;
}) {
  const [texto, setTexto] = useState('');
  const { sucursalId } = useSucursalActiva();
  const { data, isFetching } = useQuery({
    queryKey: ['vehiculos', 'buscar', texto, sucursalId],
    queryFn: () =>
      api<Pagina<VehiculoListado>>('GET', `/vehiculos${qs({ q: texto, sucursalId, limit: 10 })}`),
    enabled: !valor,
  });

  if (valor) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-superficie p-2 pr-3 shadow-[0_0_0_1.5px_var(--color-slate-900)]">
        {valor.fotoPortada ? (
          <img
            src={urlApi(valor.fotoPortada)}
            alt=""
            className="h-11 w-16 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
            <Car className="size-4" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1 text-sm">
          <span className="block truncate font-medium text-slate-900">
            {valor.marca} {valor.modelo} {valor.anio}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {valor.patente} · {valor.sucursal.nombre} ·{' '}
            <span className="tabular-nums">{pesos(valor.precioVenta)}</span>
          </span>
        </span>
        <Boton
          ayuda="Elige otro vehículo para este documento"
          variante="fantasma"
          chico
          onClick={() => onCambiar(null)}
        >
          Cambiar
        </Boton>
      </div>
    );
  }
  const opciones = data?.items.filter(filtro) ?? [];
  return (
    <div className="overflow-hidden rounded-2xl bg-superficie dark:ring-1 dark:ring-inset dark:ring-slate-200">
      <div className="relative border-b border-slate-100">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          aria-label="Buscar vehículo"
          className="h-10 w-full bg-transparent pl-9 pr-3 text-base outline-none placeholder:text-slate-400 sm:text-sm"
          placeholder="Buscar por marca, modelo o patente"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {isFetching && (
          <Loader2
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate-400"
            aria-hidden
          />
        )}
      </div>
      <ul className="max-h-64 overflow-y-auto p-1">
        {!isFetching && opciones.length === 0 && (
          <li className="px-3 py-2.5 text-sm text-slate-500">
            Sin vehículos disponibles con esa búsqueda.
          </li>
        )}
        {opciones.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-100"
              onClick={() => onCambiar(v)}
            >
              {v.fotoPortada ? (
                <img
                  src={urlApi(v.fotoPortada)}
                  alt=""
                  className="h-8 w-12 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  <ImageOff className="size-3.5" aria-label="Sin foto" />
                </span>
              )}
              {/* En teléfonos: nombre arriba y patente/sucursal abajo (no caben en una línea). */}
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-slate-900 max-sm:block max-sm:truncate">
                  {v.marca} {v.modelo} {v.anio}
                </span>{' '}
                <span className="text-slate-500 max-sm:block max-sm:truncate max-sm:text-xs">
                  <span className="max-sm:hidden">· </span>
                  {v.patente} · {v.sucursal.nombre}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-700">{pesos(v.precioVenta)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Carga el vehículo indicado en la URL (?vehiculoId=) para precargar formularios.
export function useVehiculoInicial(id: string | null) {
  return useQuery({
    queryKey: ['vehiculo', id],
    queryFn: () => api<VehiculoListado>('GET', `/vehiculos/${id}`),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------- Adicionales

// Ej. traspaso: aparecen en el documento, nunca en márgenes ni en el cuadre de pagos.
// Adicionales de una cotización o venta (ej. traspaso): suman al total a pagar,
// nunca al margen. Un monto de $0 deja registrado algo sin costo (ej. de regalo).
export function CostosAdicionales<T extends { costos: { descripcion: string; monto: number }[] }>({
  control,
  register,
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
}) {
  const { fields, append, remove } = useFieldArray({
    control: control as unknown as Control<{ costos: { descripcion: string; monto: number }[] }>,
    name: 'costos',
  });
  const reg = register as unknown as UseFormRegister<{
    costos: { descripcion: string; monto: number }[];
  }>;
  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div
          key={f.id}
          className="flex gap-2 transition-[opacity,transform] duration-200 ease-(--ease-out) starting:-translate-y-1 starting:opacity-0"
        >
          <Input
            placeholder="Ej. Transferencia e inscripción, Mantención de regalo"
            aria-label={`Adicional ${i + 1}: descripción`}
            {...reg(`costos.${i}.descripcion`, { required: true })}
          />
          <Input
            type="number"
            moneda
            aria-label={`Adicional ${i + 1}: monto`}
            className="w-40 shrink-0"
            {...reg(`costos.${i}.monto`, { required: true, valueAsNumber: true, min: 0 })}
          />
          <Boton
            ayuda="Quita este costo adicional del documento"
            variante="fantasma"
            className="px-2.5"
            onClick={() => remove(i)}
            aria-label={`Quitar adicional ${i + 1}`}
          >
            <X aria-hidden />
          </Boton>
        </div>
      ))}
      <Boton
        ayuda="Suma un costo adicional al documento (transferencia, accesorios, etc.)"
        variante="secundario"
        chico
        onClick={() => append({ descripcion: '', monto: 0 })}
      >
        <Plus aria-hidden />
        Agregar adicional
      </Boton>
    </div>
  );
}

// ---------------------------------------------------------------- Listado de documentos

type OrdenDocumento = 'recientes' | 'antiguos' | 'monto_desc' | 'monto_asc';
const ORDENES_DOCUMENTO: { valor: OrdenDocumento; texto: string }[] = [
  { valor: 'recientes', texto: 'Más recientes' },
  { valor: 'antiguos', texto: 'Más antiguos' },
  { valor: 'monto_desc', texto: 'Mayor monto' },
  { valor: 'monto_asc', texto: 'Menor monto' },
];
interface FiltrosDocumento {
  estado: string;
  desde: string;
  hasta: string;
  q: string;
  orden: OrdenDocumento;
}
const FILTROS_VACIOS: FiltrosDocumento = {
  estado: '',
  desde: '',
  hasta: '',
  q: '',
  orden: 'recientes',
};
// Estructura común de los listados de cotizaciones, reservas, tasaciones y ventas.
export function ListadoDocumentos<T extends { id: string }>({
  titulo,
  descripcion,
  ruta,
  endpoint,
  estados,
  textoNuevo,
  encabezados,
  fila,
  itemMovil,
}: {
  titulo: string;
  descripcion?: string;
  ruta: string;
  endpoint: string;
  estados: readonly string[];
  textoNuevo?: string;
  encabezados: { texto: string; derecha?: boolean }[];
  fila: (item: T) => ReactNode;
  // Versión de la fila para teléfonos (ItemMovil): sin tabla ni scroll lateral.
  itemMovil: (item: T) => ReactNode;
}) {
  const { sucursalId } = useSucursalActiva();
  // Búsqueda y filtros viven solo en esta pantalla: al salir vuelven a su valor por defecto.
  const [filtros, setFiltros] = useState<FiltrosDocumento>(FILTROS_VACIOS);
  const { estado, desde, hasta, q, orden } = filtros;
  const [offset, setOffset] = useState(0);
  const cambiar = (cambios: Partial<FiltrosDocumento>) => {
    setFiltros({ ...filtros, ...cambios });
    setOffset(0);
  };
  const busqueda = useDemorado(q.trim());
  const hayFiltros = Boolean(estado || desde || hasta || q || orden !== 'recientes');
  const LIMITE = 25;
  const consulta = useQuery({
    queryKey: [endpoint, { estado, desde, hasta, busqueda, orden, sucursalId, offset }],
    queryFn: () =>
      api<Pagina<T>>(
        'GET',
        `${endpoint}${qs({ estado, desde, hasta, q: busqueda, orden: orden === 'recientes' ? undefined : orden, sucursalId, limit: LIMITE, offset })}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        descripcion={descripcion}
        acciones={
          textoNuevo && (
            <BotonLink
              ayuda="Abre el formulario para emitir uno nuevo, con folio y PDF"
              to={`${ruta}/nueva`}
            >
              <Plus aria-hidden />
              {textoNuevo.replace(/^\+\s*/, '')}
            </BotonLink>
          )
        }
      />
      <Filtros>
        <Buscador
          className="sm:w-72"
          valor={q}
          onCambiar={(v) => cambiar({ q: v })}
          placeholder="Buscar por N°, cliente, RUT o patente"
        />
        <Segmentado
          className="max-sm:col-span-2 max-sm:justify-self-start"
          etiqueta="Estado"
          opciones={[
            { id: 'TODOS', texto: 'Todos' },
            ...estados.map((e) => ({ id: e, texto: etiqueta(e) })),
          ]}
          actual={estado || 'TODOS'}
          onCambiar={(id) => cambiar({ estado: id === 'TODOS' ? '' : id })}
        />
        <RangoFechas
          desde={desde}
          hasta={hasta}
          onDesde={(v) => cambiar({ desde: v })}
          onHasta={(v) => cambiar({ hasta: v })}
        />
        <Select
          className="sm:w-44"
          aria-label="Ordenar"
          value={orden}
          onChange={(e) => cambiar({ orden: e.target.value as OrdenDocumento })}
        >
          {ORDENES_DOCUMENTO.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </Select>
        {hayFiltros && (
          <Boton
            ayuda="Quita todos los filtros"
            variante="fantasma"
            chico
            className="max-sm:order-2 max-sm:col-span-2"
            onClick={() => cambiar(FILTROS_VACIOS)}
          >
            <X aria-hidden />
            Limpiar
          </Boton>
        )}
      </Filtros>
      {consulta.isLoading && <Cargando />}
      {consulta.error && <MensajeError error={consulta.error} />}
      {consulta.data?.items.length === 0 &&
        (hayFiltros ? (
          <Vacio icono={Search} titulo="Nada coincide con esos filtros">
            Prueba con otra búsqueda, estado o rango de fechas.
          </Vacio>
        ) : (
          <Vacio
            icono={FileText}
            titulo={`Aún no hay ${titulo.toLowerCase()}`}
            accion={
              textoNuevo && (
                <BotonLink
                  ayuda="Abre el formulario para emitir uno nuevo, con folio y PDF"
                  to={`${ruta}/nueva`}
                >
                  <Plus aria-hidden />
                  {textoNuevo.replace(/^\+\s*/, '')}
                </BotonLink>
              )
            }
          />
        ))}
      {!!consulta.data?.items.length && (
        <>
          <Tabla movil={<ListaMovil>{consulta.data.items.map(itemMovil)}</ListaMovil>}>
            <thead>
              <tr>
                {encabezados.map((e) => (
                  <Th key={e.texto} derecha={e.derecha}>
                    {e.texto}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody
              className={cx(
                'divide-y divide-slate-100 transition-opacity',
                consulta.isFetching && 'opacity-60',
              )}
            >
              {consulta.data.items.map(fila)}
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

export function BotonPdf({ url, texto = 'Descargar PDF' }: { url: string; texto?: string }) {
  return (
    <BotonA
      ayuda="Abre el PDF en otra pestaña, listo para imprimir o enviar"
      href={urlApi(url)}
      target="_blank"
      rel="noreferrer"
    >
      <Download aria-hidden />
      {texto}
    </BotonA>
  );
}

// Resumen lateral de un documento en curso (cotización, reserva): quién y qué, las
// cifras que lo componen y el total en cifra grande.
export function ResumenDocumento({
  cliente,
  vehiculo,
  filas,
  etiquetaTotal,
  total,
}: {
  cliente?: string;
  vehiculo?: string;
  filas: [string, number][];
  etiquetaTotal: string;
  total: number;
}) {
  return (
    <div className="text-sm">
      <dl className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Vehículo</dt>
          <dd className="truncate text-right text-slate-900">{vehiculo || '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Cliente</dt>
          <dd className="truncate text-right text-slate-900">{cliente ?? '—'}</dd>
        </div>
      </dl>
      {filas.length > 0 && (
        <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
          {filas.map(([texto, monto]) => (
            <div key={texto} className="flex justify-between gap-4">
              <dt className="text-slate-500">{texto}</dt>
              <dd className="tabular-nums text-slate-900">{pesos(monto)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <span className="text-slate-500">{etiquetaTotal}</span>
        <span className="mt-1 block text-[2rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950">
          {pesos(total)}
        </span>
      </div>
    </div>
  );
}
