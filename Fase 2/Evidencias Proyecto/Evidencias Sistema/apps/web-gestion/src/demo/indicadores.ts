import { hoy } from '../lib/formato';
import { datos, type FilaSucursal, type FilaVehiculo, type FilaVenta } from './db';
import {
  comisionConsignacion,
  consignacionDe,
  descripcion,
  diasDesde,
  EN_INVENTARIO,
  estadoCotizacion,
  estadoReserva,
  fallo,
  fechaChile,
  sucursalDe,
  sumarDias,
  texto,
  totalGastosVehiculo,
  type Contexto,
  type Rutas,
} from './comun';

// Dashboard y analítica calculados sobre los datos en memoria, con las mismas
// reglas que apps/api/src/modules/dashboard.

const DIAS_ESTANCADO = 45;
const DIAS_RESERVA_POR_VENCER = 1;
const TRAMOS_ANTIGUEDAD = ['0-15', '16-30', '31-45', '46-90', '90+'] as const;

interface Alcance {
  ids: string[] | null; // null = consolidado (todas)
  sucursales: FilaSucursal[];
}

function resolverAlcance(c: Contexto): Alcance {
  const todas = datos().sucursales.filter((s) => s.automotoraId === c.automotoraId);
  const pedidas = c.query
    .getAll('sucursalIds')
    .flatMap((v) => v.split(','))
    .filter(Boolean);
  if (!c.esGeneral) {
    if (pedidas.some((p) => p !== c.usuario.sucursalId))
      throw fallo(403, 'Solo puedes ver los indicadores de tu sucursal');
    return {
      ids: [c.usuario.sucursalId!],
      sucursales: todas.filter((s) => s.id === c.usuario.sucursalId),
    };
  }
  if (!pedidas.length) return { ids: null, sucursales: todas.filter((s) => s.activa) };
  return { ids: pedidas, sucursales: todas.filter((s) => pedidas.includes(s.id)) };
}

function resolverPeriodo(c: Contexto) {
  const desde = texto(c, 'desde') ?? `${hoy().slice(0, 8)}01`;
  const hasta = texto(c, 'hasta') ?? hoy();
  if (desde > hasta) throw fallo(400, 'El inicio del período es posterior al término');
  return { desde, hasta };
}

const en = (a: Alcance, sucursalId: string | null) =>
  a.ids === null || (sucursalId !== null && a.ids.includes(sucursalId));
const enPeriodo = (p: { desde: string; hasta: string }, iso: string) => {
  const d = iso.length > 10 ? fechaChile(iso) : iso;
  return d >= p.desde && d <= p.hasta;
};

// Insumos comunes: inventario y movimientos del alcance.
function insumos(c: Contexto, a: Alcance, p: { desde: string; hasta: string }) {
  const db = datos();
  const vehiculos = db.vehiculos.filter(
    (v) => v.automotoraId === c.automotoraId && en(a, v.sucursalId),
  );
  const inventario = vehiculos.filter(EN_INVENTARIO);
  const ventas = db.ventas.filter(
    (v) =>
      v.automotoraId === c.automotoraId &&
      v.estado === 'CONFIRMADA' &&
      en(a, v.sucursalId) &&
      enPeriodo(p, v.fechaVenta),
  );
  const senas = db.reservas.filter(
    (r) =>
      r.automotoraId === c.automotoraId &&
      en(a, r.sucursalId) &&
      r.estado === 'CANCELADA' &&
      r.cancelacion?.senaRetenida &&
      enPeriodo(p, r.cancelacion.fecha ?? r.fechaEmision),
  );
  // Los gastos generales (sin sucursal) solo cuentan en el consolidado.
  const gastos = db.gastos.filter(
    (g) =>
      g.automotoraId === c.automotoraId &&
      g.estado === 'ACTIVO' &&
      (g.sucursalId === null ? a.ids === null : en(a, g.sucursalId)) &&
      enPeriodo(p, g.fecha),
  );
  return { vehiculos, inventario, ventas, senas, gastos };
}

const esConsignado = (v: FilaVehiculo) => v.origen === 'CONSIGNACION';
const capital = (v: FilaVehiculo) =>
  esConsignado(v) ? 0 : v.costoAdquisicion + totalGastosVehiculo(v.id);
function gananciaProyectada(v: FilaVehiculo) {
  if (!esConsignado(v)) return v.precioVenta - capital(v);
  const cons = consignacionDe(v.id);
  return cons ? comisionConsignacion(cons, v.precioVenta) : 0;
}
const diasVenta = (venta: FilaVenta) => {
  const v = datos().vehiculos.find((x) => x.id === venta.vehiculoId);
  return v ? diasDesde(v.fechaIngreso, fechaChile(venta.fechaVenta)) : 0;
};
const promedio = (valores: number[]) =>
  valores.length ? valores.reduce((s, x) => s + x, 0) / valores.length : null;
const redondear = (v: number | null, decimales = 1) =>
  v === null ? null : Math.round(v * 10 ** decimales) / 10 ** decimales;

// ---------------------------------------------------------------- Dashboard

interface Indicadores {
  stockPropio: number;
  stockConsignado: number;
  publicacionesActivas: number;
  reservados: number;
  reservasPorVencer: number;
  estancados: number;
  costoInventario: number;
  gananciasProyectadas: number;
  ventasCantidad: number;
  ventasIngresos: number;
  margenReal: number;
  senasRetenidas: number;
  gastosVehiculos: number;
  gastosOperacionales: number;
}
const vacio = (): Indicadores => ({
  stockPropio: 0,
  stockConsignado: 0,
  publicacionesActivas: 0,
  reservados: 0,
  reservasPorVencer: 0,
  estancados: 0,
  costoInventario: 0,
  gananciasProyectadas: 0,
  ventasCantidad: 0,
  ventasIngresos: 0,
  margenReal: 0,
  senasRetenidas: 0,
  gastosVehiculos: 0,
  gastosOperacionales: 0,
});

function formatear(c: Contexto, i: Indicadores) {
  const base = {
    stock: {
      propio: i.stockPropio,
      consignado: i.stockConsignado,
      total: i.stockPropio + i.stockConsignado,
    },
    publicacionesActivas: i.publicacionesActivas,
    reservados: { total: i.reservados, porVencer: i.reservasPorVencer },
    vehiculosEstancados: i.estancados,
    ventasPeriodo: { cantidad: i.ventasCantidad, ingresos: i.ventasIngresos },
    senasRetenidas: i.senasRetenidas,
    ingresosPeriodo: i.ventasIngresos + i.senasRetenidas,
  };
  if (!c.esAdmin) return base;
  return {
    ...base,
    costoInventario: i.costoInventario,
    gananciasProyectadas: i.gananciasProyectadas,
    margenRealPeriodo: i.margenReal,
    utilidadPeriodo: i.margenReal + i.senasRetenidas,
    gastosOperacionalesPeriodo: i.gastosOperacionales,
    utilidadNetaPeriodo: i.margenReal + i.senasRetenidas - i.gastosOperacionales,
    gastosVehiculosPeriodo: i.gastosVehiculos,
  };
}

function dashboard(c: Contexto) {
  const a = resolverAlcance(c);
  const p = resolverPeriodo(c);
  const { inventario, ventas, senas, gastos } = insumos(c, a, p);
  const limite = sumarDias(hoy(), DIAS_RESERVA_POR_VENCER);
  const porSucursal = new Map(a.sucursales.map((s) => [s.id, vacio()]));
  const de = (id: string) => porSucursal.get(id) ?? porSucursal.set(id, vacio()).get(id)!;

  for (const v of inventario) {
    const i = de(v.sucursalId);
    if (esConsignado(v)) i.stockConsignado++;
    else i.stockPropio++;
    if (v.estado === 'DISPONIBLE') i.publicacionesActivas++;
    if (v.estado === 'RESERVADO') i.reservados++;
    if (diasDesde(v.fechaIngreso) > DIAS_ESTANCADO) i.estancados++;
    i.costoInventario += capital(v);
    i.gananciasProyectadas += gananciaProyectada(v);
  }
  for (const r of datos().reservas) {
    if (
      r.automotoraId === c.automotoraId &&
      en(a, r.sucursalId) &&
      estadoReserva(r) === 'VIGENTE' &&
      r.fechaVencimiento <= limite
    ) {
      de(r.sucursalId).reservasPorVencer++;
    }
  }
  for (const r of senas) de(r.sucursalId).senasRetenidas += r.montoReserva;
  let gastosGenerales = 0;
  for (const g of gastos) {
    if (g.sucursalId === null) gastosGenerales += g.monto;
    else if (g.tipo === 'VEHICULO') de(g.sucursalId).gastosVehiculos += g.monto;
    else de(g.sucursalId).gastosOperacionales += g.monto;
  }
  for (const v of ventas) {
    const i = de(v.sucursalId);
    i.ventasCantidad++;
    i.ventasIngresos += v.precioVentaFinal;
    i.margenReal += v.margen;
  }

  const total = vacio();
  for (const i of porSucursal.values()) {
    for (const k of Object.keys(total) as (keyof Indicadores)[]) total[k] += i[k];
  }
  total.gastosOperacionales += gastosGenerales;

  return {
    alcance: {
      tipo: a.ids === null ? 'CONSOLIDADO' : 'SUCURSALES',
      sucursales: a.sucursales.map((s) => ({ id: s.id, nombre: s.nombre })),
    },
    periodo: p,
    indicadores: {
      ...formatear(c, total),
      ...(c.esAdmin ? { gastosGeneralesPeriodo: gastosGenerales } : {}),
    },
    porSucursal: c.esGeneral
      ? [...porSucursal.entries()].map(([id, i]) => ({
          sucursal: sucursalDe(id),
          indicadores: formatear(c, i),
        }))
      : undefined,
  };
}

// ---------------------------------------------------------------- Analítica

function sugerencia(v: FilaVehiculo, dias: number) {
  if (v.fotos.length === 0) return 'No tiene fotos: agrégalas y publícalo';
  if (v.estado === 'EN_PREPARACION' || v.estado === 'PENDIENTE_REVISION')
    return 'Sigue en preparación: termínala y publícalo';
  if (dias > 90) return 'Más de 90 días en inventario: considera una rebaja de precio';
  return 'Revisa el precio y destaca la publicación';
}

function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [anio, mes] = desde.slice(0, 7).split('-').map(Number) as [number, number];
  const [anioFin, mesFin] = hasta.slice(0, 7).split('-').map(Number) as [number, number];
  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    meses.push(`${anio}-${String(mes).padStart(2, '0')}`);
    mes++;
    if (mes > 12) {
      mes = 1;
      anio++;
    }
  }
  return meses;
}

function agrupar<T>(filas: T[], clave: (f: T) => string) {
  const grupos = new Map<string, T[]>();
  for (const f of filas) {
    const k = clave(f);
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return [...grupos.entries()];
}

function analitica(c: Contexto) {
  const db = datos();
  const a = resolverAlcance(c);
  const p = resolverPeriodo(c);
  const admin = c.esAdmin;
  const { inventario, ventas, senas, gastos } = insumos(c, a, p);
  const vehiculoDe = (id: string) => db.vehiculos.find((v) => v.id === id)!;

  const meses = mesesEntre(p.desde, p.hasta);
  if (meses.length > 120) throw fallo(400, 'Elige un período de hasta 10 años');
  const mesDe = (iso: string) => (iso.length > 10 ? fechaChile(iso) : iso).slice(0, 7);
  const tendencia = meses.map((mes) => {
    const delMes = ventas.filter((v) => mesDe(v.fechaVenta) === mes);
    const margen = delMes.reduce((s, v) => s + v.margen, 0);
    const senasMes = senas
      .filter((r) => mesDe(r.cancelacion?.fecha ?? r.fechaEmision) === mes)
      .reduce((s, r) => s + r.montoReserva, 0);
    const gastosMes = gastos
      .filter((g) => g.tipo === 'OPERACIONAL' && mesDe(g.fecha) === mes)
      .reduce((s, g) => s + g.monto, 0);
    return {
      mes,
      ventas: delMes.length,
      ingresos: delMes.reduce((s, v) => s + v.precioVentaFinal, 0) + senasMes,
      ...(admin
        ? { margen, gastosOperacionales: gastosMes, utilidadNeta: margen + senasMes - gastosMes }
        : {}),
    };
  });

  const ingresos = ventas.reduce((s, v) => s + v.precioVentaFinal, 0);
  const margen = ventas.reduce((s, v) => s + v.margen, 0);
  const cotizaciones = db.cotizaciones.filter(
    (x) => x.automotoraId === c.automotoraId && en(a, x.sucursalId) && enPeriodo(p, x.fechaEmision),
  );
  const reservas = db.reservas.filter(
    (x) => x.automotoraId === c.automotoraId && en(a, x.sucursalId) && enPeriodo(p, x.fechaEmision),
  );
  const concretadas = cotizaciones.filter((x) => x.estado === 'CONCRETADA').length;

  const grupo = ([clave, filas]: [string, FilaVenta[]]) => ({
    clave,
    cantidad: filas.length,
    monto: filas.reduce((s, v) => s + v.precioVentaFinal, 0),
    diasPromedio: redondear(promedio(filas.map(diasVenta))),
    ...(admin ? { margen: filas.reduce((s, v) => s + v.margen, 0) } : {}),
  });
  const porCantidad = <T extends { cantidad: number }>(g: T[]) =>
    g.sort((x, y) => y.cantidad - x.cantidad);
  const inventarioPor = (clave: (v: FilaVehiculo) => string) =>
    porCantidad(
      agrupar(inventario, clave).map(([k, vs]) => ({
        clave: k,
        cantidad: vs.length,
        valorPublicado: vs.reduce((s, v) => s + v.precioVenta, 0),
        ...(admin ? { capital: vs.reduce((s, v) => s + capital(v), 0) } : {}),
      })),
    );
  const tramo = (dias: number) =>
    dias <= 15
      ? '0-15'
      : dias <= 30
        ? '16-30'
        : dias <= 45
          ? '31-45'
          : dias <= 90
            ? '46-90'
            : '90+';

  const formas = new Map<string, { ventas: number; monto: number }>();
  for (const v of ventas) {
    for (const tipo of new Set(v.formasPago.map((f) => f.tipo))) {
      const f = formas.get(tipo) ?? { ventas: 0, monto: 0 };
      f.ventas++;
      f.monto += v.formasPago.filter((x) => x.tipo === tipo).reduce((s, x) => s + x.monto, 0);
      formas.set(tipo, f);
    }
  }

  return {
    alcance: {
      tipo: a.ids === null ? 'CONSOLIDADO' : 'SUCURSALES',
      sucursales: a.sucursales.map((s) => ({ id: s.id, nombre: s.nombre })),
    },
    periodo: p,
    umbralEstancadoDias: DIAS_ESTANCADO,
    resumen: {
      ventas: ventas.length,
      ingresos,
      ticketPromedio: ventas.length ? Math.round(ingresos / ventas.length) : 0,
      diasPromedioVenta: redondear(promedio(ventas.map(diasVenta))),
      descuentoPromedio: redondear(
        promedio(ventas.map((v) => (v.precioPublicado - v.precioVentaFinal) / v.precioPublicado)),
        4,
      ),
      tasaCierreCotizaciones: cotizaciones.length
        ? Math.round((concretadas / cotizaciones.length) * 1000) / 1000
        : null,
      ...(admin
        ? { margen, margenPromedio: ventas.length ? Math.round(margen / ventas.length) : 0 }
        : {}),
    },
    tendencia,
    embudo: {
      cotizaciones: cotizaciones.length,
      cotizacionesConcretadas: concretadas,
      cotizacionesVencidas: cotizaciones.filter((x) => estadoCotizacion(x) === 'VENCIDA').length,
      reservas: reservas.length,
      reservasConvertidas: reservas.filter((x) => x.estado === 'CONVERTIDA_EN_VENTA').length,
      reservasCanceladas: reservas.filter((x) => x.estado === 'CANCELADA').length,
      ventas: ventas.length,
      ventasDesdeCotizacion: ventas.filter((v) => v.cotizacionId).length,
      ventasDesdeReserva: ventas.filter((v) => v.reservaId).length,
    },
    inventario: {
      antiguedad: TRAMOS_ANTIGUEDAD.map((t) => {
        const vs = inventario.filter((v) => tramo(diasDesde(v.fechaIngreso)) === t);
        return {
          tramo: t,
          cantidad: vs.length,
          valorPublicado: vs.reduce((s, v) => s + v.precioVenta, 0),
          ...(admin ? { capital: vs.reduce((s, v) => s + capital(v), 0) } : {}),
        };
      }),
      porTipo: inventarioPor((v) => v.categoria),
      porOrigen: inventarioPor((v) => v.origen),
    },
    ventasPorOrigen: porCantidad(
      agrupar(ventas, (v) => vehiculoDe(v.vehiculoId).origen).map(grupo),
    ),
    ventasPorTipo: porCantidad(
      agrupar(ventas, (v) => vehiculoDe(v.vehiculoId).categoria).map(grupo),
    ),
    ...(admin
      ? {
          ventasPorVendedor: porCantidad(
            agrupar(
              ventas,
              (v) => db.usuarios.find((u) => u.id === v.vendidaPorId)?.nombre ?? '—',
            ).map(grupo),
          ),
        }
      : {}),
    formasPago: [...formas.entries()]
      .map(([clave, f]) => ({ clave, ...f }))
      .sort((x, y) => y.monto - x.monto),
    ...(admin
      ? {
          gastosPorCategoria: agrupar(gastos, (g) => `${g.tipo}:${g.categoria}`)
            .map(([, gs]) => ({
              clave: gs[0]!.categoria,
              tipo: gs[0]!.tipo,
              cantidad: gs.length,
              monto: gs.reduce((s, g) => s + g.monto, 0),
            }))
            .sort((x, y) => y.monto - x.monto),
        }
      : {}),
    estancados: inventario
      .map((v) => ({ v, dias: diasDesde(v.fechaIngreso) }))
      .filter(({ dias }) => dias > DIAS_ESTANCADO)
      .sort((x, y) => y.dias - x.dias)
      .map(({ v, dias }) => ({
        id: v.id,
        patente: v.patente,
        descripcion: descripcion(v),
        sucursal: sucursalDe(v.sucursalId),
        estado: v.estado,
        origen: v.origen,
        precioVenta: v.precioVenta,
        diasEnInventario: dias,
        sugerencia: sugerencia(v, dias),
      })),
    porMarcaModelo: agrupar(ventas, (v) => {
      const veh = vehiculoDe(v.vehiculoId);
      return `${veh.marca}\u0000${veh.modelo}`;
    })
      .map(([k, vs]) => {
        const [marca, modelo] = k.split('\u0000') as [string, string];
        return {
          marca,
          modelo,
          ventas: vs.length,
          diasPromedioVenta: redondear(promedio(vs.map(diasVenta))) ?? 0,
          ingresos: vs.reduce((s, v) => s + v.precioVentaFinal, 0),
          ...(admin
            ? { rentabilidadPromedio: Math.round(vs.reduce((s, v) => s + v.margen, 0) / vs.length) }
            : {}),
        };
      })
      .sort((x, y) => y.ventas - x.ventas || y.ingresos - x.ingresos),
  };
}

export const rutasIndicadores: Rutas = {
  'GET /dashboard': dashboard,
  'GET /analitica': analitica,
};
