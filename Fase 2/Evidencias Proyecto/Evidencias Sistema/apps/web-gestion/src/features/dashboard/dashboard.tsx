import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeDollarSign,
  Car,
  ChevronRight,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
  Wrench,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api, qs } from '../../lib/api';
import { usePeriodo } from '../../lib/persistente';
import { fecha, hoy, num, pesos } from '../../lib/formato';
import type { Pagina } from '../../lib/tipos';
import {
  Avatar,
  BotonLink,
  Chip,
  cx,
  DatoIcono,
  EncabezadoPagina,
  Esqueleto,
  Indicador,
  MensajeError,
  RangoFechas,
  Segmentado,
  Tabla,
  Td,
  Th,
  ListaMovil,
} from '../../ui/componentes';
import { Composicion, LineaAcumulada, type Tramo } from './graficos';

interface Indicadores {
  stock: { propio: number; consignado: number; total: number };
  publicacionesActivas: number;
  reservados: { total: number; porVencer: number };
  vehiculosEstancados: number;
  ventasPeriodo: { cantidad: number; ingresos: number };
  senasRetenidas: number;
  ingresosPeriodo: number;
  // Solo admins (el Vendedor no ve costos ni márgenes):
  costoInventario?: number;
  gananciasProyectadas?: number;
  margenRealPeriodo?: number;
  utilidadPeriodo?: number; // bruta: margen real + señas retenidas
  gastosOperacionalesPeriodo?: number; // incluye los generales (solo en el consolidado)
  gastosGeneralesPeriodo?: number;
  utilidadNetaPeriodo?: number;
  gastosVehiculosPeriodo?: number; // informativo: ya entran en el margen de cada auto
}

interface RespuestaDashboard {
  alcance: { tipo: 'CONSOLIDADO' | 'SUCURSALES'; sucursales: { id: string; nombre: string }[] };
  periodo: { desde: string; hasta: string };
  indicadores: Indicadores;
  porSucursal?: { sucursal: { id: string; nombre: string }; indicadores: Indicadores }[];
}

interface VentaResumen {
  id: string;
  folio: number;
  sucursal: { nombre: string };
  cliente: { nombre: string };
  vehiculo: { descripcion: string; patente: string };
  precioVentaFinal: number;
  fechaVenta: string;
}

const inicioMes = () => `${hoy().slice(0, 8)}01`;

// Atajos de período del inicio (el rango también se elige a mano).
function atajosPeriodo() {
  const h = hoy();
  const [a, m] = h.split('-').map(Number) as [number, number];
  const tres = new Date(a, m - 3, 1);
  return [
    { id: 'mes', texto: 'Este mes', desde: inicioMes(), hasta: h },
    {
      id: '3m',
      texto: 'Últimos 3 meses',
      desde: `${tres.getFullYear()}-${String(tres.getMonth() + 1).padStart(2, '0')}-01`,
      hasta: h,
    },
    { id: 'anio', texto: 'Este año', desde: `${a}-01-01`, hasta: h },
  ];
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Todas las ventas confirmadas del período (el listado pagina de a 100).
async function ventasDelPeriodo(desde: string, hasta: string, sucursalId?: string) {
  const items: VentaResumen[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const p = await api<Pagina<VentaResumen>>(
      'GET',
      `/ventas${qs({ estado: 'CONFIRMADA', desde, hasta, sucursalId, limit: 100, offset })}`,
    );
    items.push(...p.items);
    if (items.length >= p.total || p.items.length === 0) break;
  }
  return items;
}

// Tramos diarios (≤ 45 días) o mensuales, incluyendo los vacíos.
function agrupar(ventas: VentaResumen[], desde: string, hasta: string): Tramo[] {
  const inicio = new Date(`${desde}T12:00:00`);
  const fin = new Date(`${hasta}T12:00:00`);
  const dias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;
  const mensual = dias > 45;
  const tramos = new Map<string, Tramo>();
  const d = new Date(inicio);
  while (d <= fin) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const [a, m, dia] = iso.split('-');
    const mes = MESES[Number(m) - 1];
    const clave = mensual ? iso.slice(0, 7) : iso;
    tramos.set(clave, {
      clave,
      etiqueta: mensual ? mes : `${Number(dia)} ${mes}`,
      titulo: mensual ? `${mes} ${a}` : `${Number(dia)} ${mes} ${a}`,
      monto: 0,
      ventas: 0,
    });
    if (mensual) d.setMonth(d.getMonth() + 1, 1);
    else d.setDate(d.getDate() + 1);
  }
  for (const v of ventas) {
    const t = tramos.get(mensual ? v.fechaVenta.slice(0, 7) : v.fechaVenta.slice(0, 10));
    if (t) {
      t.monto += v.precioVentaFinal;
      t.ventas += 1;
    }
  }
  return [...tramos.values()];
}

// ---------------------------------------------------------------- Piezas

function Panel({
  titulo,
  descripcion,
  accion,
  cifra,
  children,
  className,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  cifra?: ReactNode; // número grande bajo el título
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        'min-w-0 rounded-2xl bg-superficie p-5 dark:ring-1 dark:ring-inset dark:ring-slate-200',
        className,
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-medium text-slate-900">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>}
          {cifra && (
            <p className="mt-3 text-[2rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950 sm:text-[2.5rem]">
              {cifra}
            </p>
          )}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

// Estado de resultados simple del período. Los gastos de vehículos ya están
// dentro del costo de lo vendido (no se restan dos veces).
function EstadoResultados({ d }: { d: Indicadores }) {
  const ventas = d.ventasPeriodo.ingresos;
  const margen = d.margenRealPeriodo ?? 0;
  const generales = d.gastosGeneralesPeriodo ?? 0;
  const filas: { texto: string; detalle?: string; monto: number; tipo?: 'resta' | 'total' }[] = [
    { texto: 'Ventas', detalle: `${d.ventasPeriodo.cantidad} en el período`, monto: ventas },
    {
      texto: 'Costo de lo vendido',
      detalle: 'Compra + gastos de esos autos (o pago al dueño si es consignado)',
      monto: ventas - margen,
      tipo: 'resta',
    },
    { texto: 'Margen bruto', monto: margen, tipo: 'total' },
    { texto: 'Señas retenidas', detalle: 'Reservas canceladas', monto: d.senasRetenidas },
    {
      texto: 'Gastos operacionales',
      detalle:
        generales > 0
          ? `Incluye ${pesos(generales)} de gastos generales`
          : 'Arriendo, sueldos, publicidad…',
      monto: d.gastosOperacionalesPeriodo ?? 0,
      tipo: 'resta',
    },
  ];
  const neta = d.utilidadNetaPeriodo ?? 0;
  return (
    <div>
      <dl className="divide-y divide-slate-100 text-sm">
        {filas.map((f) => (
          <div
            key={f.texto}
            className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0"
          >
            <dt className="min-w-0">
              <span
                className={cx(f.tipo === 'total' ? 'font-medium text-slate-900' : 'text-slate-700')}
              >
                {f.tipo === 'resta' ? '− ' : ''}
                {f.texto}
              </span>
              {f.detalle && <span className="block text-xs text-slate-500">{f.detalle}</span>}
            </dt>
            <dd
              className={cx(
                'shrink-0 tabular-nums',
                f.tipo === 'total' ? 'font-medium text-slate-900' : 'text-slate-700',
              )}
            >
              {pesos(f.tipo === 'resta' && f.monto !== 0 ? -f.monto : f.monto)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 rounded-2xl bg-slate-100 px-5 py-4">
        <span>
          <span className="block text-sm font-medium text-slate-900">Utilidad neta</span>
          {neta !== 0 && (
            <span
              className={cx(
                'mt-1.5 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
                neta < 0 ? 'bg-red-50 text-red-700' : 'bg-lima text-slate-900',
              )}
            >
              {neta < 0 ? 'Pérdida' : 'Ganancia'}
            </span>
          )}
        </span>
        <span
          className={cx(
            'text-[2rem] font-light leading-none tracking-[-0.04em] tabular-nums',
            neta < 0 ? 'text-red-600' : 'text-slate-950',
          )}
        >
          {pesos(neta)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Página

// Dashboard del negocio, calculado al vuelo. El ADMIN_GENERAL ve el
// consolidado o la sucursal elegida en la barra lateral; los demás, su sucursal.
export function DashboardPage() {
  const { usuario, esAdmin, esGeneral } = useSesion();
  const { sucursalId, nombre } = useSucursalActiva();
  // El período elegido se mantiene al ir a otra página y volver.
  const { desde, hasta, setDesde, setHasta, setPeriodo } = usePeriodo('dashboard', () => ({
    desde: inicioMes(),
    hasta: hoy(),
  }));
  const atajos = atajosPeriodo();
  const atajoActivo = atajos.find((a) => a.desde === desde && a.hasta === hasta)?.id;
  const filtroSucursal = esGeneral ? (sucursalId ?? undefined) : undefined;

  const consulta = useQuery({
    queryKey: ['dashboard', sucursalId, desde, hasta],
    queryFn: () =>
      api<RespuestaDashboard>(
        'GET',
        `/dashboard${qs({ desde, hasta, sucursalIds: filtroSucursal })}`,
      ),
  });
  const ventas = useQuery({
    queryKey: ['ventas', 'dashboard', sucursalId, desde, hasta],
    queryFn: () => ventasDelPeriodo(desde, hasta, filtroSucursal),
  });

  const d = consulta.data?.indicadores;
  const alcance = esGeneral
    ? sucursalId
      ? nombre(sucursalId)
      : 'todas las sucursales'
    : nombre(usuario?.sucursalId);
  const tramos = ventas.data ? agrupar(ventas.data, desde, hasta) : [];
  const ultimas = [...(ventas.data ?? [])]
    .sort((a, b) => b.fechaVenta.localeCompare(a.fechaVenta) || b.folio - a.folio)
    .slice(0, 6);

  return (
    <>
      <EncabezadoPagina
        titulo={`Hola de nuevo, ${usuario?.nombre.split(' ')[0]}`}
        descripcion={`Resumen de ${alcance} en el período seleccionado.`}
      />
      <div className="-mt-2 mb-6 flex flex-wrap items-center gap-3">
        <Segmentado
          etiqueta="Período"
          opciones={atajos}
          actual={atajoActivo}
          onCambiar={(id) => {
            const a = atajos.find((x) => x.id === id)!;
            setPeriodo({ desde: a.desde, hasta: a.hasta });
          }}
        />
        <RangoFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
      </div>
      {consulta.error && <MensajeError error={consulta.error} />}
      {consulta.isLoading && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
          <Esqueleto className="h-80 rounded-2xl" />
        </div>
      )}
      {d && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Indicador
              icono={Wallet}
              titulo="Ingresos del período"
              valor={pesos(d.ingresosPeriodo)}
              detalle={
                d.senasRetenidas > 0
                  ? `Incluye ${pesos(d.senasRetenidas)} en señas retenidas`
                  : 'Ventas confirmadas y señas retenidas'
              }
            />
            <Indicador
              icono={BadgeDollarSign}
              titulo="Ventas"
              valor={num(d.ventasPeriodo.cantidad)}
              detalle={pesos(d.ventasPeriodo.ingresos)}
            />
            <Indicador
              icono={Car}
              titulo="En stock"
              valor={num(d.stock.total)}
              detalle={`${d.publicacionesActivas} publicados · ${d.stock.consignado} consignados`}
            />
            {esAdmin ? (
              <Indicador
                icono={TrendingUp}
                titulo="Utilidad neta"
                valor={pesos(d.utilidadNetaPeriodo)}
                detalle={`Bruta ${pesos(d.utilidadPeriodo)} − gastos ${pesos(d.gastosOperacionalesPeriodo)}`}
              />
            ) : (
              <Indicador
                icono={Receipt}
                titulo="Reservados"
                valor={num(d.reservados.total)}
                detalle={
                  d.reservados.porVencer
                    ? `${d.reservados.porVencer} por vencer`
                    : 'Ninguna por vencer'
                }
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <Panel
              titulo="Ingresos acumulados"
              descripcion={`Ventas confirmadas, ${tramos[0]?.clave.length === 7 ? 'por mes' : 'por día'}`}
              cifra={ventas.data?.length ? pesos(d.ventasPeriodo.ingresos) : undefined}
            >
              {ventas.isLoading ? (
                <Esqueleto className="h-[13.75rem] w-full rounded-xl" />
              ) : ventas.data?.length ? (
                <LineaAcumulada tramos={tramos} />
              ) : (
                <p className="flex h-[13.75rem] items-center justify-center text-sm text-slate-500">
                  Sin ventas confirmadas en este período.
                </p>
              )}
            </Panel>

            <Panel
              titulo="Inventario"
              descripcion="Vehículos en stock hoy"
              cifra={num(d.stock.total)}
              accion={
                <BotonLink to="/vehiculos" variante="secundario" chico>
                  Ver todo
                </BotonLink>
              }
            >
              <Composicion
                partes={[
                  {
                    nombre: 'Publicados',
                    valor: d.publicacionesActivas,
                    tono: 'bg-lima',
                    detalle: 'Visibles en el sitio',
                  },
                  {
                    nombre: 'Reservados',
                    valor: d.reservados.total,
                    tono: 'bg-slate-900',
                    detalle: d.reservados.porVencer
                      ? `${d.reservados.porVencer} por vencer`
                      : undefined,
                  },
                  {
                    nombre: 'Sin publicar',
                    valor: Math.max(0, d.stock.total - d.publicacionesActivas - d.reservados.total),
                    tono: 'bg-slate-300',
                    detalle: 'En preparación o revisión',
                  },
                ]}
              />
              {d.vehiculosEstancados > 0 && (
                <Link
                  to="/analitica"
                  className="group mt-5 flex items-center gap-3 rounded-2xl bg-ambar/15 p-2 pr-3 text-sm text-slate-900 transition-colors hover:bg-ambar/25"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ambar/30 text-sm font-semibold tabular-nums">
                    {d.vehiculosEstancados}
                  </span>
                  <span className="min-w-0 flex-1">
                    {d.vehiculosEstancados === 1 ? 'Lleva' : 'Llevan'} más de 45 días en stock
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-label="Ver sugerencias"
                  />
                </Link>
              )}
            </Panel>
          </div>

          {esAdmin && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <Panel
                titulo="Resultado del período"
                descripcion="Solo visible para administradores"
                accion={
                  <BotonLink to="/gastos" variante="secundario" chico>
                    Ver gastos
                  </BotonLink>
                }
              >
                <EstadoResultados d={d} />
              </Panel>
              <Panel titulo="Inventario y preparación" descripcion="Foto actual del stock propio">
                <dl className="divide-y divide-slate-100">
                  {(
                    [
                      [
                        PiggyBank,
                        'Costo del inventario',
                        d.costoInventario,
                        'Adquisición + gastos de los autos en stock',
                      ],
                      [
                        TrendingUp,
                        'Ganancia proyectada',
                        d.gananciasProyectadas,
                        'Si se venden al precio actual',
                      ],
                      [
                        Wrench,
                        'Invertido en preparación',
                        d.gastosVehiculosPeriodo,
                        'Gastos de vehículos del período (entran en su margen al venderse)',
                      ],
                    ] as const
                  ).map(([icono, titulo, valor, detalle]) => (
                    <div key={titulo} className="py-4 first:pt-0 last:pb-0">
                      <DatoIcono icono={icono} etiqueta={titulo}>
                        <span className="text-xl font-light tracking-[-0.03em] tabular-nums text-slate-950">
                          {pesos(valor)}
                        </span>
                      </DatoIcono>
                      <p className="ml-[3.25rem] mt-1 text-xs text-slate-500">{detalle}</p>
                    </div>
                  ))}
                </dl>
              </Panel>
            </div>
          )}

          <Panel
            titulo="Últimas ventas"
            descripcion="Las seis más recientes del período."
            accion={
              <BotonLink to="/ventas" variante="secundario" chico>
                Ver todas
              </BotonLink>
            }
          >
            {ventas.isLoading ? (
              <Esqueleto className="h-40 rounded-2xl" />
            ) : ultimas.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Aún no hay ventas en el período.
              </p>
            ) : (
              <ul className="-mx-3 -mb-3 grid grid-cols-1 gap-0.5 lg:grid-cols-2">
                {ultimas.map((v) => (
                  <li key={v.id}>
                    <Link
                      to={`/ventas/${v.id}`}
                      className="group flex items-center gap-3 rounded-2xl p-3 transition-colors duration-150 hover:bg-slate-50"
                    >
                      <Avatar nombre={v.cliente.nombre} className="size-10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {v.vehiculo.descripcion}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {v.cliente.nombre} · {fecha(v.fechaVenta)}
                          {esGeneral && !sucursalId ? ` · ${v.sucursal.nombre}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-medium tabular-nums text-slate-900">
                          {pesos(v.precioVentaFinal)}
                        </span>
                        <Chip className="mt-1 h-5 px-2 text-[0.6875rem] tabular-nums">
                          N° {v.folio}
                        </Chip>
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 max-sm:hidden"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {consulta.data?.porSucursal && consulta.data.porSucursal.length > 1 && (
            <section>
              <h2 className="mb-3 text-[0.9375rem] font-medium text-slate-900">Por sucursal</h2>
              <Tabla
                movil={
                  <ListaMovil>
                    {consulta.data.porSucursal.map(({ sucursal, indicadores: i }) => (
                      <li key={sucursal.id} className="px-4 py-3.5">
                        <p className="text-sm font-medium text-slate-900">{sucursal.nombre}</p>
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                          {(
                            [
                              ['Stock', i.stock.total],
                              ['Publicados', i.publicacionesActivas],
                              ['Ventas', i.ventasPeriodo.cantidad],
                              ['Ingresos', pesos(i.ingresosPeriodo)],
                              ['Gastos operacionales', pesos(i.gastosOperacionalesPeriodo)],
                              ['Utilidad neta', pesos(i.utilidadNetaPeriodo)],
                              ['Ganancia proyectada', pesos(i.gananciasProyectadas)],
                            ] as const
                          ).map(([etiqueta, valor]) => (
                            <div key={etiqueta} className="min-w-0">
                              <dt className="truncate text-slate-500">{etiqueta}</dt>
                              <dd className="font-medium tabular-nums text-slate-900">{valor}</dd>
                            </div>
                          ))}
                        </dl>
                      </li>
                    ))}
                  </ListaMovil>
                }
              >
                <thead>
                  <tr>
                    <Th>Sucursal</Th>
                    <Th derecha>Stock</Th>
                    <Th derecha>Publicados</Th>
                    <Th derecha>Ventas</Th>
                    <Th derecha>Ingresos</Th>
                    <Th derecha>Gastos operacionales</Th>
                    <Th derecha>Utilidad neta</Th>
                    <Th derecha>Ganancia proyectada</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {consulta.data.porSucursal.map(({ sucursal, indicadores: i }) => (
                    <tr key={sucursal.id}>
                      <Td className="font-medium text-slate-900">{sucursal.nombre}</Td>
                      <Td derecha>{i.stock.total}</Td>
                      <Td derecha>{i.publicacionesActivas}</Td>
                      <Td derecha>{i.ventasPeriodo.cantidad}</Td>
                      <Td derecha>{pesos(i.ingresosPeriodo)}</Td>
                      <Td derecha>{pesos(i.gastosOperacionalesPeriodo)}</Td>
                      <Td derecha>{pesos(i.utilidadNetaPeriodo)}</Td>
                      <Td derecha>{pesos(i.gananciasProyectadas)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </section>
          )}
        </div>
      )}
    </>
  );
}
