import { useQuery } from '@tanstack/react-query';
import {
  BadgeDollarSign,
  CircleCheck,
  Download,
  Handshake,
  Lightbulb,
  Percent,
  Receipt,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../../auth/sesion';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api, qs } from '../../lib/api';
import { usePeriodo, usePersistente } from '../../lib/persistente';
import { etiqueta, hoy, num, pesos, pesosCompacto } from '../../lib/formato';
import {
  Boton,
  Chip,
  cx,
  EncabezadoPagina,
  Indicador,
  Esqueleto,
  Insignia,
  MensajeError,
  RangoFechas,
  Segmentado,
  Tabla,
  Tarjeta,
  Td,
  Th,
  Vacio,
  ItemMovil,
  ListaMovil,
} from '../../ui/componentes';
import { BarrasHorizontales, BarrasVerticales, PasoEmbudo, type Barra } from './graficos';

interface Grupo {
  clave: string;
  cantidad: number;
  monto: number;
  diasPromedio: number | null;
  margen?: number;
}
interface GrupoInventario {
  clave: string;
  cantidad: number;
  valorPublicado: number;
  capital?: number;
}
interface Analitica {
  periodo: { desde: string; hasta: string };
  umbralEstancadoDias: number;
  resumen: {
    ventas: number;
    ingresos: number;
    ticketPromedio: number;
    diasPromedioVenta: number | null;
    descuentoPromedio: number | null;
    tasaCierreCotizaciones: number | null;
    margen?: number;
    margenPromedio?: number;
  };
  tendencia: {
    mes: string;
    ventas: number;
    ingresos: number;
    margen?: number;
    gastosOperacionales?: number;
    utilidadNeta?: number;
  }[];
  embudo: {
    cotizaciones: number;
    cotizacionesConcretadas: number;
    cotizacionesVencidas: number;
    reservas: number;
    reservasConvertidas: number;
    reservasCanceladas: number;
    ventas: number;
    ventasDesdeCotizacion: number;
    ventasDesdeReserva: number;
  };
  inventario: {
    antiguedad: { tramo: string; cantidad: number; valorPublicado: number; capital?: number }[];
    porTipo: GrupoInventario[];
    porOrigen: GrupoInventario[];
  };
  ventasPorOrigen: Grupo[];
  ventasPorTipo: Grupo[];
  ventasPorVendedor?: Grupo[];
  formasPago: { clave: string; ventas: number; monto: number }[];
  gastosPorCategoria?: { clave: string; tipo: string; cantidad: number; monto: number }[];
  estancados: {
    id: string;
    patente: string;
    descripcion: string;
    sucursal: { id: string; nombre: string };
    estado: string;
    precioVenta: number;
    diasEnInventario: number;
    sugerencia: string;
  }[];
  porMarcaModelo: {
    marca: string;
    modelo: string;
    ventas: number;
    diasPromedioVenta: number;
    ingresos: number;
    rentabilidadPromedio?: number;
  }[];
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pct = (v: number | null | undefined, decimales = 0) =>
  v === null || v === undefined
    ? '—'
    : `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: decimales, minimumFractionDigits: decimales })}%`;
const dias = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('es-CL')} días`;

// Atajos de período (el rango también se puede elegir a mano).
function periodos() {
  const h = hoy();
  const [a, m] = h.split('-').map(Number) as [number, number];
  const mesesAtras = (n: number) => {
    const d = new Date(a, m - 1 - n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };
  return [
    { id: 'mes', texto: 'Este mes', desde: mesesAtras(0), hasta: h },
    { id: '3m', texto: 'Últimos 3 meses', desde: mesesAtras(2), hasta: h },
    { id: 'anio', texto: 'Este año', desde: `${a}-01-01`, hasta: h },
    { id: '12m', texto: 'Últimos 12 meses', desde: mesesAtras(11), hasta: h },
  ];
}

// Descarga una tabla como CSV (separado por ";" para que Excel en español lo abra bien).
function descargarCsv(nombre: string, encabezados: string[], filas: (string | number)[][]) {
  const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [encabezados, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

type Medida = 'ventas' | 'ingresos' | 'margen' | 'utilidadNeta';

// Analítica: evolución del negocio, dónde se pierden las ventas, qué
// inventario rota, quién vende y cómo pagan los clientes. El Vendedor no ve
// márgenes, capital, gastos ni el ranking del equipo.
export function AnaliticaPage() {
  const { esAdmin, esGeneral } = useSesion();
  const { sucursalId } = useSucursalActiva();
  const atajos = periodos();
  // Período y medida se mantienen al ir a otra página y volver.
  const { desde, hasta, setDesde, setHasta, setPeriodo } = usePeriodo('analitica', () => ({
    desde: atajos[2]!.desde,
    hasta: atajos[2]!.hasta,
  }));
  const [medida, setMedida] = usePersistente<Medida>(
    'analitica.medida',
    () => 'ingresos',
    (v): v is Medida => ['ventas', 'ingresos', 'margen', 'utilidadNeta'].includes(v as string),
  );

  const consulta = useQuery({
    queryKey: ['analitica', sucursalId, desde, hasta],
    queryFn: () =>
      api<Analitica>(
        'GET',
        `/analitica${qs({ desde, hasta, sucursalIds: esGeneral ? (sucursalId ?? undefined) : undefined })}`,
      ),
    placeholderData: (previo) => previo,
  });
  const d = consulta.data;
  const atajoActivo = atajos.find((p) => p.desde === desde && p.hasta === hasta)?.id;

  return (
    <>
      <EncabezadoPagina
        titulo="Analítica"
        descripcion="Cómo evoluciona el negocio, qué inventario rota y dónde se pierden las ventas."
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmentado
          etiqueta="Período"
          opciones={atajos}
          actual={atajoActivo}
          onCambiar={(id) => {
            const p = atajos.find((a) => a.id === id)!;
            setPeriodo({ desde: p.desde, hasta: p.hasta });
          }}
        />
        <RangoFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
      </div>

      {consulta.error && <MensajeError error={consulta.error} />}
      {!d && consulta.isLoading && <Esqueletos />}
      {d && (
        <div className={cx('space-y-6 transition-opacity', consulta.isFetching && 'opacity-60')}>
          <Resumen d={d} esAdmin={esAdmin} />
          <Evolucion d={d} medida={medida} onMedida={setMedida} esAdmin={esAdmin} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Tarjeta
              titulo="Embudo comercial"
              descripcion="Documentos emitidos en el período y cuántos terminaron en venta."
            >
              <div className="space-y-6">
                <PasoEmbudo
                  titulo="Cotizaciones"
                  total={d.embudo.cotizaciones}
                  avanzaron={d.embudo.cotizacionesConcretadas}
                  textoAvance="se concretaron en venta"
                  detalle={`${d.embudo.cotizacionesVencidas} vencidas`}
                />
                <PasoEmbudo
                  titulo="Reservas"
                  total={d.embudo.reservas}
                  avanzaron={d.embudo.reservasConvertidas}
                  textoAvance="terminaron en venta"
                  detalle={`${d.embudo.reservasCanceladas} canceladas`}
                />
                <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                  De las <strong className="text-slate-900">{d.embudo.ventas} ventas</strong> del
                  período, {d.embudo.ventasDesdeCotizacion} partieron de una cotización y{' '}
                  {d.embudo.ventasDesdeReserva} de una reserva.
                </div>
              </div>
            </Tarjeta>

            <Tarjeta
              titulo="Cómo pagan tus clientes"
              descripcion="Monto recibido por forma de pago en las ventas del período."
            >
              {d.formasPago.length === 0 ? (
                <SinDatos>Sin ventas en el período.</SinDatos>
              ) : (
                <BarrasHorizontales
                  conPorcentaje
                  formato={pesos}
                  filas={d.formasPago.map((f) => ({
                    nombre: etiqueta(f.clave),
                    valor: f.monto,
                    nota: `${f.ventas} venta${f.ventas === 1 ? '' : 's'}`,
                  }))}
                />
              )}
            </Tarjeta>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Antiguedad d={d} esAdmin={esAdmin} />
            <Tarjeta
              titulo="Inventario por tipo"
              descripcion="Stock actual y lo que vale a precio de venta."
            >
              {d.inventario.porTipo.length === 0 ? (
                <SinDatos>No hay vehículos en inventario.</SinDatos>
              ) : (
                <BarrasHorizontales
                  formato={(v) => `${num(v)} auto${v === 1 ? '' : 's'}`}
                  filas={d.inventario.porTipo.map((t) => ({
                    nombre: etiqueta(t.clave),
                    valor: t.cantidad,
                    detalle:
                      `Publicado en ${pesos(t.valorPublicado)}` +
                      (t.capital !== undefined && t.capital > 0
                        ? ` · invertido ${pesos(t.capital)}`
                        : ''),
                  }))}
                />
              )}
            </Tarjeta>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Tarjeta
              titulo="Rendimiento por origen"
              descripcion="Ventas del período según cómo llegó el auto."
              sinRelleno
            >
              {d.ventasPorOrigen.length === 0 ? (
                <div className="px-5 pb-5 pt-3">
                  <SinDatos>Sin ventas en el período.</SinDatos>
                </div>
              ) : (
                <TablaGrupos grupos={d.ventasPorOrigen} esAdmin={esAdmin} titulo="Origen" />
              )}
            </Tarjeta>
            {d.ventasPorVendedor ? (
              <Tarjeta
                titulo="Ventas por vendedor"
                descripcion="Quién cerró las ventas del período."
              >
                {d.ventasPorVendedor.length === 0 ? (
                  <SinDatos>Sin ventas en el período.</SinDatos>
                ) : (
                  <BarrasHorizontales
                    formato={(v) => `${v} venta${v === 1 ? '' : 's'}`}
                    filas={d.ventasPorVendedor.map((v) => ({
                      nombre: v.clave,
                      valor: v.cantidad,
                      detalle:
                        `${pesos(v.monto)} vendidos` +
                        (v.margen !== undefined ? ` · margen ${pesos(v.margen)}` : '') +
                        (v.diasPromedio !== null ? ` · ${dias(v.diasPromedio)} promedio` : ''),
                    }))}
                  />
                )}
              </Tarjeta>
            ) : (
              <Tarjeta
                titulo="Ventas por tipo"
                descripcion="Qué tipo de vehículo se vendió en el período."
              >
                {d.ventasPorTipo.length === 0 ? (
                  <SinDatos>Sin ventas en el período.</SinDatos>
                ) : (
                  <BarrasHorizontales
                    formato={(v) => `${v} venta${v === 1 ? '' : 's'}`}
                    filas={d.ventasPorTipo.map((t) => ({
                      nombre: etiqueta(t.clave),
                      valor: t.cantidad,
                      detalle: `${pesos(t.monto)} · ${dias(t.diasPromedio)} promedio`,
                    }))}
                  />
                )}
              </Tarjeta>
            )}
          </div>

          {d.gastosPorCategoria && (
            <Tarjeta
              titulo="Gastos por categoría"
              descripcion="Gastos activos del período (operacionales y de preparación de vehículos)."
            >
              {d.gastosPorCategoria.length === 0 ? (
                <SinDatos>Sin gastos en el período.</SinDatos>
              ) : (
                <div className="lg:columns-2 lg:gap-10 [&_li]:break-inside-avoid">
                  <BarrasHorizontales
                    conPorcentaje
                    formato={pesos}
                    filas={d.gastosPorCategoria.map((g) => ({
                      nombre: etiqueta(g.clave),
                      valor: g.monto,
                      nota: g.tipo === 'OPERACIONAL' ? 'Operacional' : 'De vehículo',
                    }))}
                  />
                </div>
              )}
            </Tarjeta>
          )}

          <Estancados d={d} />
          <MarcaModelo d={d} esAdmin={esAdmin} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Secciones

function Resumen({ d, esAdmin }: { d: Analitica; esAdmin: boolean }) {
  const r = d.resumen;
  const datos: { titulo: string; valor: string; detalle: string; icono: LucideIcon }[] = [
    {
      titulo: 'Ventas',
      valor: num(r.ventas),
      detalle: `Ticket promedio ${pesos(r.ticketPromedio)}`,
      icono: Receipt,
    },
    ...(esAdmin && r.margenPromedio !== undefined
      ? [
          {
            titulo: 'Margen por auto',
            valor: pesos(r.margenPromedio),
            detalle: `${pesos(r.margen)} en total`,
            icono: BadgeDollarSign,
          },
        ]
      : []),
    {
      titulo: 'Días hasta vender',
      valor: r.diasPromedioVenta === null ? '—' : num(r.diasPromedioVenta),
      detalle: 'Promedio desde el ingreso',
      icono: Timer,
    },
    {
      titulo: 'Descuento negociado',
      valor: pct(r.descuentoPromedio, 1),
      detalle: 'Bajo el último precio publicado',
      icono: Percent,
    },
    {
      titulo: 'Cierre de cotizaciones',
      valor: pct(r.tasaCierreCotizaciones),
      detalle: 'Cotizaciones que terminaron en venta',
      icono: Handshake,
    },
  ];
  return (
    <div
      className={cx(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 max-sm:[&>div:last-child:nth-child(odd)]:col-span-2',
        datos.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
      )}
    >
      {datos.map((x) => (
        <Indicador key={x.titulo} {...x} />
      ))}
    </div>
  );
}

function Evolucion({
  d,
  medida,
  onMedida,
  esAdmin,
}: {
  d: Analitica;
  medida: Medida;
  onMedida: (m: Medida) => void;
  esAdmin: boolean;
}) {
  const medidas: { id: Medida; texto: string }[] = [
    { id: 'ingresos', texto: 'Ingresos' },
    { id: 'ventas', texto: 'Ventas' },
    ...(esAdmin
      ? ([
          { id: 'margen', texto: 'Margen' },
          { id: 'utilidadNeta', texto: 'Utilidad neta' },
        ] as { id: Medida; texto: string }[])
      : []),
  ];
  const actual = medidas.find((m) => m.id === medida) ?? medidas[0]!;
  const esMonto = actual.id !== 'ventas';
  const barras: Barra[] = d.tendencia.map((t) => {
    const [a, m] = t.mes.split('-');
    const mes = MESES[Number(m) - 1]!;
    return {
      clave: t.mes,
      etiqueta: d.tendencia.length > 12 ? `${mes} ${a!.slice(2)}` : mes,
      titulo: `${mes} ${a}`,
      valor: t[actual.id] ?? 0,
      detalle:
        actual.id === 'utilidadNeta'
          ? `Margen ${pesos(t.margen)} − gastos ${pesos(t.gastosOperacionales)}`
          : actual.id === 'ingresos'
            ? `${t.ventas} venta${t.ventas === 1 ? '' : 's'}`
            : undefined,
    };
  });
  const total = barras.reduce((s, b) => s + b.valor, 0);
  return (
    <Tarjeta
      titulo="Evolución mensual"
      descripcion={
        actual.id === 'utilidadNeta'
          ? 'Margen de las ventas + señas retenidas − gastos operacionales de cada mes.'
          : actual.id === 'ingresos'
            ? 'Ventas + señas retenidas de cada mes.'
            : undefined
      }
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <p className="text-[2rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950 sm:text-[2.5rem]">
          {esMonto ? pesos(total) : `${num(total)} ventas`}
          <span className="ml-2.5 text-sm font-normal tracking-normal text-slate-500">
            en el período
          </span>
        </p>
        <Segmentado
          chico
          etiqueta="Medida"
          opciones={medidas}
          actual={actual.id}
          onCambiar={onMedida}
        />
      </div>
      <BarrasVerticales
        barras={barras}
        formato={esMonto ? pesos : (v) => `${num(v)} venta${v === 1 ? '' : 's'}`}
        formatoEje={esMonto ? pesosCompacto : num}
        descripcion={`${actual.texto} por mes`}
      />
    </Tarjeta>
  );
}

const TRAMOS: Record<string, string> = {
  '0-15': '0–15 días',
  '16-30': '16–30',
  '31-45': '31–45',
  '46-90': '46–90',
  '90+': '+90',
};

function Antiguedad({ d, esAdmin }: { d: Analitica; esAdmin: boolean }) {
  const estancados = d.inventario.antiguedad.filter(
    (t) => t.tramo === '46-90' || t.tramo === '90+',
  );
  const cantidadEstancados = estancados.reduce((s, t) => s + t.cantidad, 0);
  const capitalEstancado = estancados.reduce((s, t) => s + (t.capital ?? 0), 0);
  return (
    <Tarjeta
      titulo="Antigüedad del inventario"
      descripcion={`Vehículos en stock según los días desde su ingreso. Sobre ${d.umbralEstancadoDias} días se consideran estancados.`}
    >
      <BarrasVerticales
        barras={d.inventario.antiguedad.map((t) => ({
          clave: t.tramo,
          etiqueta: TRAMOS[t.tramo] ?? t.tramo,
          titulo: `${TRAMOS[t.tramo] ?? t.tramo}${t.tramo === '0-15' ? '' : ' días'}`,
          valor: t.cantidad,
          aviso: t.tramo === '46-90' || t.tramo === '90+',
          detalle:
            `Publicados en ${pesos(t.valorPublicado)}` +
            (t.capital ? ` · invertido ${pesos(t.capital)}` : ''),
        }))}
        formato={(v) => `${v} vehículo${v === 1 ? '' : 's'}`}
        formatoEje={num}
        descripcion="Vehículos en inventario por antigüedad"
      />
      <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <span className="size-2.5 shrink-0 rounded-full bg-ambar" aria-hidden />
        {cantidadEstancados === 0
          ? 'Ningún vehículo estancado.'
          : `${cantidadEstancados} estancado${cantidadEstancados === 1 ? '' : 's'}` +
            (esAdmin && capitalEstancado > 0
              ? `, con ${pesos(capitalEstancado)} de capital inmovilizado.`
              : '.')}
      </p>
    </Tarjeta>
  );
}

function TablaGrupos({
  grupos,
  esAdmin,
  titulo,
}: {
  grupos: Grupo[];
  esAdmin: boolean;
  titulo: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-slate-100 text-left text-xs text-slate-500">
            <th className="px-5 py-2 font-medium">{titulo}</th>
            <th className="px-3 py-2 text-right font-medium">Ventas</th>
            <th className="px-3 py-2 text-right font-medium">Días hasta vender</th>
            {esAdmin && <th className="px-5 py-2 text-right font-medium">Margen por auto</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {grupos.map((g) => (
            <tr key={g.clave}>
              <td className="px-5 py-2.5 text-slate-900">{etiqueta(g.clave)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{num(g.cantidad)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{g.diasPromedio ?? '—'}</td>
              {esAdmin && (
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {g.margen !== undefined && g.cantidad
                    ? pesos(Math.round(g.margen / g.cantidad))
                    : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Estancados({ d }: { d: Analitica }) {
  return (
    <Tarjeta
      titulo={`Vehículos estancados (más de ${d.umbralEstancadoDias} días en inventario)`}
      descripcion="Con una sugerencia para moverlos."
    >
      {d.estancados.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <CircleCheck className="size-4 text-lima-fuerte" aria-hidden />
          Ningún vehículo supera el umbral. El inventario está rotando bien.
        </p>
      ) : (
        <ul className="-mx-2 space-y-1">
          {d.estancados.map((v) => (
            <li
              key={v.id}
              className="flex gap-4 rounded-2xl p-3 transition-colors duration-150 hover:bg-slate-50"
            >
              {/* Los días en stock, como el avatar de una fila de correo */}
              <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-full bg-ambar/15 leading-none text-slate-900">
                <span className="text-base font-semibold tabular-nums">{v.diasEnInventario}</span>
                <span className="mt-0.5 text-[0.625rem] text-slate-600">días</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <Link
                    to={`/vehiculos/${v.id}`}
                    className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:decoration-slate-900"
                  >
                    {v.descripcion}
                  </Link>
                  <Insignia valor={v.estado} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip mono>{v.patente}</Chip>
                  <Chip>{v.sucursal.nombre}</Chip>
                  <Chip className="tabular-nums">{pesos(v.precioVenta)}</Chip>
                </div>
                <p className="mt-2.5 flex items-start gap-1.5 text-sm text-slate-600">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
                  {v.sugerencia}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function MarcaModelo({ d, esAdmin }: { d: Analitica; esAdmin: boolean }) {
  const exportar = () =>
    descargarCsv(
      `ventas-por-marca-modelo_${d.periodo.desde}_${d.periodo.hasta}.csv`,
      [
        'Marca',
        'Modelo',
        'Ventas',
        'Días promedio hasta vender',
        'Ingresos',
        ...(esAdmin ? ['Rentabilidad promedio'] : []),
      ],
      d.porMarcaModelo.map((m) => [
        m.marca,
        m.modelo,
        m.ventas,
        m.diasPromedioVenta,
        m.ingresos,
        ...(esAdmin ? [m.rentabilidadPromedio ?? ''] : []),
      ]),
    );
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Ventas por marca y modelo</h2>
        {d.porMarcaModelo.length > 0 && (
          <Boton
            ayuda="Descarga la tabla de ventas por marca y modelo como archivo CSV (se abre en Excel)"
            variante="secundario"
            chico
            onClick={exportar}
          >
            <Download aria-hidden />
            Exportar CSV
          </Boton>
        )}
      </div>
      {d.porMarcaModelo.length === 0 ? (
        <Vacio titulo="Sin ventas confirmadas en el período" />
      ) : (
        <Tabla
          movil={
            <ListaMovil>
              {d.porMarcaModelo.map((m) => (
                <ItemMovil
                  key={`${m.marca}-${m.modelo}`}
                  titulo={`${m.marca} ${m.modelo}`}
                  valor={pesos(m.ingresos)}
                  subtitulo={`${num(m.ventas)} ${m.ventas === 1 ? 'venta' : 'ventas'} · ${m.diasPromedioVenta} días promedio hasta vender`}
                  pie={
                    esAdmin ? `Rentabilidad promedio ${pesos(m.rentabilidadPromedio)}` : undefined
                  }
                />
              ))}
            </ListaMovil>
          }
        >
          <thead>
            <tr>
              <Th>Marca / modelo</Th>
              <Th derecha>Ventas</Th>
              <Th derecha>Días promedio hasta vender</Th>
              <Th derecha>Ingresos</Th>
              {esAdmin && <Th derecha>Rentabilidad promedio</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.porMarcaModelo.map((m) => (
              <tr key={`${m.marca}-${m.modelo}`}>
                <Td className="font-medium">
                  {m.marca} {m.modelo}
                </Td>
                <Td derecha>{num(m.ventas)}</Td>
                <Td derecha>{m.diasPromedioVenta}</Td>
                <Td derecha>{pesos(m.ingresos)}</Td>
                {esAdmin && <Td derecha>{pesos(m.rentabilidadPromedio)}</Td>}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </section>
  );
}

function SinDatos({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

function Esqueletos() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando analítica">
      <Esqueleto className="h-32 rounded-2xl" />
      <Esqueleto className="h-80 rounded-2xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Esqueleto className="h-64 rounded-2xl" />
        <Esqueleto className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
