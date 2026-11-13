import { EstadoVehiculo, OrigenVehiculo } from '@vitriauto/shared-types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Car, ImageOff, Plus } from 'lucide-react';
import { useSesion } from '../../auth/sesion';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api, qs } from '../../lib/api';
import { usePersistente } from '../../lib/persistente';
import { urlApi } from '../../lib/config';
import { km, pesos } from '../../lib/formato';
import type { Pagina } from '../../lib/tipos';
import {
  BotonLink,
  Buscador,
  Chip,
  cx,
  Cargando,
  EncabezadoPagina,
  filaClicable,
  Casilla,
  Filtros,
  Insignia,
  MensajeError,
  Opciones,
  Paginacion,
  Select,
  Tabla,
  Td,
  Th,
  ThOrdenable,
  type Direccion,
  Vacio,
  Pestanas,
} from '../../ui/componentes';
import { MarcaPendientes } from './pendientes';
import { diasEnStock, type VehiculoListado } from './tipos';

const LIMITE = 25;
type CampoOrden = 'estado' | 'precio' | 'costo' | 'dias';
const esOrden = (v: unknown): v is { campo: CampoOrden; direccion: Direccion } | null =>
  v === null ||
  (typeof v === 'object' &&
    ['estado', 'precio', 'costo', 'dias'].includes((v as { campo: string }).campo) &&
    ['asc', 'desc'].includes((v as { direccion: string }).direccion));

// Lo vendido y lo dado de baja van en su propia pestaña (en la URL, así
// "‹ Volver" desde una ficha regresa a la misma).
type Vista = 'inventario' | 'vendidos' | 'baja';
const VISTAS: { id: Vista; texto: string }[] = [
  { id: 'inventario', texto: 'En inventario' },
  { id: 'vendidos', texto: 'Vendidos' },
  { id: 'baja', texto: 'Dados de baja' },
];
const ESTADO_VISTA: Record<Exclude<Vista, 'inventario'>, string> = {
  vendidos: 'VENDIDO',
  baja: 'DADO_DE_BAJA',
};
const ESTADOS_INVENTARIO = EstadoVehiculo.options.filter(
  (e) => e !== 'VENDIDO' && e !== 'DADO_DE_BAJA',
);
const VACIO: Record<Vista, string> = {
  inventario: 'Aún no hay vehículos en inventario',
  vendidos: 'Aún no hay vehículos vendidos',
  baja: 'No hay vehículos dados de baja',
};

export function VehiculosPage() {
  const { esAdmin } = useSesion();
  const { sucursalId } = useSucursalActiva();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const qUrl = params.get('q') ?? '';
  const vistaUrl = params.get('vista');
  const vista: Vista = vistaUrl === 'vendidos' || vistaUrl === 'baja' ? vistaUrl : 'inventario';
  const [q, setQ] = useState(qUrl);
  // El buscador de la barra superior llega por la URL (?q=).
  useEffect(() => {
    setQ(qUrl);
    setOffset(0);
  }, [qUrl]);
  const [estado, setEstado] = useState('');
  const [origen, setOrigen] = useState('');
  const [pendientes, setPendientes] = useState(false);
  const [offset, setOffset] = useState(0);
  // El orden de la tabla se recuerda al ir a otra página y volver (durante la sesión).
  const [orden, setOrden] = usePersistente<{ campo: CampoOrden; direccion: Direccion } | null>(
    'vehiculos.orden',
    () => null,
    esOrden,
  );
  // Cabecera ordenable (el orden lo aplica el servidor: el listado va paginado).
  const cabecera = (campo: CampoOrden, texto: string, derecha?: boolean) => (
    <ThOrdenable
      derecha={derecha}
      direccion={orden?.campo === campo ? orden.direccion : null}
      onOrdenar={(d) => {
        setOrden(d ? { campo, direccion: d } : null);
        setOffset(0);
      }}
    >
      {texto}
    </ThOrdenable>
  );

  const consulta = useQuery({
    queryKey: ['vehiculos', { vista, q, estado, origen, pendientes, sucursalId, offset, orden }],
    queryFn: () =>
      api<Pagina<VehiculoListado>>(
        'GET',
        `/vehiculos${qs({
          q,
          ...(vista === 'inventario'
            ? { inventario: 'true', estado, pendientes: pendientes ? 'true' : undefined }
            : { estado: ESTADO_VISTA[vista] }),
          origen,
          sucursalId,
          limit: LIMITE,
          offset,
          orden: orden?.campo,
          direccion: orden?.direccion,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const filtrar = (fn: () => void) => {
    fn();
    setOffset(0);
  };
  const cambiarVista = (v: Vista) => {
    const nuevos = new URLSearchParams(params);
    if (v === 'inventario') nuevos.delete('vista');
    else nuevos.set('vista', v);
    setParams(nuevos);
    setEstado('');
    setPendientes(false);
    setOffset(0);
  };
  const filtrado = Boolean(q || estado || origen || (vista === 'inventario' && pendientes));

  return (
    <>
      <EncabezadoPagina
        titulo="Vehículos"
        descripcion={
          consulta.data
            ? `${consulta.data.total} ${consulta.data.total === 1 ? 'vehículo' : 'vehículos'}${
                vista === 'inventario'
                  ? ' en inventario'
                  : vista === 'vendidos'
                    ? consulta.data.total === 1
                      ? ' vendido'
                      : ' vendidos'
                    : consulta.data.total === 1
                      ? ' dado de baja'
                      : ' dados de baja'
              }`
            : '\u00a0'
        }
        acciones={
          <BotonLink
            ayuda="Ingresa un vehículo al inventario: compra, consignación o parte de pago"
            to="/vehiculos/nuevo"
          >
            <Plus aria-hidden />
            Nuevo vehículo
          </BotonLink>
        }
      />
      <Pestanas pestanas={VISTAS} actual={vista} onCambiar={cambiarVista} />
      <Filtros>
        <Buscador
          className="sm:w-72"
          placeholder="Marca, modelo o patente"
          valor={q}
          onCambiar={(t) => filtrar(() => setQ(t))}
        />
        {vista === 'inventario' && (
          <Select
            className="sm:w-48"
            value={estado}
            onChange={(e) => filtrar(() => setEstado(e.target.value))}
          >
            <Opciones valores={ESTADOS_INVENTARIO} vacia="Estado: todos" />
          </Select>
        )}
        <Select
          className="sm:w-48"
          value={origen}
          onChange={(e) => filtrar(() => setOrigen(e.target.value))}
        >
          <Opciones valores={OrigenVehiculo.options} vacia="Origen: todos" />
        </Select>
        {vista === 'inventario' && (
          <Casilla marcada={pendientes} onCambiar={(m) => filtrar(() => setPendientes(m))}>
            Con algo por completar
          </Casilla>
        )}
        {/* En móvil no hay encabezados de tabla: el orden se elige aquí. */}
        <Select
          className="col-span-2 sm:hidden"
          aria-label="Ordenar por"
          value={orden ? `${orden.campo}-${orden.direccion}` : ''}
          onChange={(e) => {
            const [campo, direccion] = e.target.value.split('-') as [CampoOrden, Direccion];
            setOrden(e.target.value ? { campo, direccion } : null);
            setOffset(0);
          }}
        >
          <option value="">Orden: más recientes</option>
          <option value="precio-asc">Precio: menor a mayor</option>
          <option value="precio-desc">Precio: mayor a menor</option>
          <option value="dias-desc">Más días en stock</option>
          <option value="estado-asc">Estado</option>
          {esAdmin && <option value="costo-asc">Costo: menor a mayor</option>}
          {esAdmin && <option value="costo-desc">Costo: mayor a menor</option>}
        </Select>
      </Filtros>
      {consulta.isLoading && <Cargando />}
      {consulta.error && <MensajeError error={consulta.error} />}
      {consulta.data && consulta.data.items.length === 0 && (
        <Vacio
          icono={Car}
          titulo={filtrado ? 'Ningún vehículo coincide' : VACIO[vista]}
          accion={
            !filtrado &&
            vista === 'inventario' && (
              <BotonLink to="/vehiculos/nuevo">
                <Plus aria-hidden />
                Ingresar uno
              </BotonLink>
            )
          }
        >
          {filtrado
            ? vista === 'inventario'
              ? 'Prueba con otra búsqueda o quita algún filtro. Si ya se vendió o se dio de baja, búscalo en esas pestañas.'
              : 'Prueba con otra búsqueda o quita algún filtro.'
            : vista === 'inventario'
              ? 'Ingresa un vehículo para empezar a publicarlo y venderlo.'
              : undefined}
        </Vacio>
      )}
      {consulta.data && consulta.data.items.length > 0 && (
        <>
          {/* Móvil: lista compacta; desde sm: tabla completa */}
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-superficie dark:ring-1 dark:ring-inset dark:ring-slate-200 sm:hidden">
            {consulta.data.items.map((v) => (
              <li key={v.id}>
                <Link
                  to={`/vehiculos/${v.id}`}
                  className="flex items-center gap-3 px-3 py-3 active:bg-slate-50"
                >
                  {v.fotoPortada ? (
                    <img
                      src={urlApi(v.fotoPortada)}
                      alt=""
                      className="h-14 w-[4.5rem] shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <ImageOff className="size-4" aria-label="Sin foto" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {v.marca} {v.modelo} {v.anio}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      <span className="font-mono">{v.patente}</span> · {km(v.kilometraje)}
                    </span>
                    <span className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-wrap items-center gap-1">
                        <Insignia valor={v.estado} />
                        {vista === 'inventario' && <MarcaPendientes pendientes={v.pendientes} />}
                      </span>
                      <span className="text-sm font-medium tabular-nums text-slate-900">
                        {pesos(v.precioVenta)}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
            <Tabla>
              <thead>
                <tr>
                  <Th>Vehículo</Th>
                  <Th>Patente</Th>
                  <Th>Sucursal</Th>
                  {cabecera('estado', 'Estado')}
                  {cabecera('precio', 'Precio', true)}
                  {esAdmin && cabecera('costo', 'Costo', true)}
                  {cabecera('dias', 'Días', true)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {consulta.data.items.map((v) => (
                  <tr
                    key={v.id}
                    className={filaClicable}
                    onClick={() => navegar(`/vehiculos/${v.id}`)}
                  >
                    <Td>
                      <div className="flex items-center gap-3">
                        {v.fotoPortada ? (
                          <img
                            src={urlApi(v.fotoPortada)}
                            alt=""
                            className="h-12 w-[4.5rem] shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <span className="flex h-12 w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                            <ImageOff className="size-4" aria-label="Sin foto" />
                          </span>
                        )}
                        <div>
                          <p className="font-medium text-slate-900">
                            {v.marca} {v.modelo} {v.anio}
                          </p>
                          <p className="text-xs text-slate-500">
                            {v.version ?? ''} {km(v.kilometraje)}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Chip mono>{v.patente}</Chip>
                    </Td>
                    <Td>{v.sucursal.nombre}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Insignia valor={v.estado} />
                        {vista === 'inventario' && <MarcaPendientes pendientes={v.pendientes} />}
                      </div>
                    </Td>
                    <Td derecha className="font-medium text-slate-900">
                      {pesos(v.precioVenta)}
                    </Td>
                    {esAdmin && (
                      <Td derecha>
                        {v.origen === 'CONSIGNACION' ? (
                          <span className="text-xs text-slate-500">Consignado</span>
                        ) : (
                          pesos(v.costoAdquisicion)
                        )}
                      </Td>
                    )}
                    <Td derecha>
                      <DiasEnStock dias={diasEnStock(v.fechaIngreso)} vista={vista} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </div>
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

// Días en stock en píldora: sobre 45 días (estancado) se tiñe de ámbar.
// En vendidos y dados de baja es solo un dato, sin alerta.
function DiasEnStock({ dias, vista }: { dias: number; vista: Vista }) {
  const estancado = vista === 'inventario' && dias > 45;
  return (
    <span
      className={cx(
        'inline-flex h-6 min-w-10 items-center justify-center rounded-full px-2.5 text-xs font-medium tabular-nums',
        estancado ? 'bg-ambar/20 text-slate-900' : 'bg-slate-100 text-slate-700',
      )}
      title={estancado ? 'Más de 45 días en inventario' : undefined}
    >
      {dias}
    </span>
  );
}
