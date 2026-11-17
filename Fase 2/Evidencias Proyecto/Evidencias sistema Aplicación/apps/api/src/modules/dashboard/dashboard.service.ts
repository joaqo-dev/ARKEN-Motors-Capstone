import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { hoyEnChile, sumarDias } from '../../common/fechas';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import {
  Alcance,
  DashboardRepository,
  EstancadoRow,
  GrupoRow,
  MesRow,
  MontoSucursalRow,
  Periodo,
} from './dashboard.repository';
import { ConsultaDashboardDto } from './dto/consulta-dashboard.dto';

export const DIAS_ESTANCADO = 45; // Módulo 15
const DIAS_RESERVA_POR_VENCER = 1; // misma anticipación que la notificación (Módulo 13)

const n = (valor: string | number | null | undefined) => Number(valor ?? 0);

const TRAMOS_ANTIGUEDAD = ['0-15', '16-30', '31-45', '46-90', '90+'] as const;

// Meses 'YYYY-MM' entre dos fechas 'YYYY-MM-DD' (ambos incluidos).
export function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [a, m] = desde.slice(0, 7).split('-').map(Number) as [number, number];
  const [aFin, mFin] = hasta.slice(0, 7).split('-').map(Number) as [number, number];
  while (a < aFin || (a === aFin && m <= mFin)) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return meses;
}

interface IndicadoresSucursal {
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
  gastosVehiculos: number; // informativo: ya entran en el margen de cada auto
  gastosOperacionales: number;
}

const vacio = (): IndicadoresSucursal => ({
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

// Regla simple de sugerencia para vehículos estancados (Módulo 15, sin ML).
export function sugerenciaEstancado(v: Pick<EstancadoRow, 'dias' | 'fotos' | 'estado'>): string {
  if (v.fotos === 0) return 'No tiene fotos: agrégalas y publícalo';
  if (v.estado === 'EN_PREPARACION' || v.estado === 'PENDIENTE_REVISION') {
    return 'Sigue en preparación: termínala y publícalo';
  }
  if (v.dias > 90) return 'Más de 90 días en inventario: considera una rebaja de precio';
  return 'Revisa el precio y destaca la publicación';
}

// Dashboard (Módulo 14) y Analítica (Módulo 15). Alcance según rol:
// ADMIN_GENERAL: consolidado o una/varias sucursales, con desglose por sucursal.
// ADMIN_SUCURSAL / VENDEDOR: solo su sucursal, sin selector. El VENDEDOR no ve
// costos, márgenes ni gastos (Módulo 5).
@Injectable()
export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  async dashboard(consulta: ConsultaDashboardDto, actor: UsuarioAutenticado) {
    const { alcance, sucursales } = await this.resolverAlcance(consulta, actor);
    const periodo = this.resolverPeriodo(consulta);
    const hoy = hoyEnChile();

    const [inventario, porVencer, ventas, senas, gastos] = await Promise.all([
      this.repo.inventario(alcance, hoy, DIAS_ESTANCADO),
      this.repo.reservasPorVencer(alcance, sumarDias(hoy, DIAS_RESERVA_POR_VENCER)),
      this.repo.ventas(alcance, periodo),
      this.repo.senasRetenidas(alcance, periodo),
      this.repo.gastos(alcance, periodo),
    ]);

    // Indicadores por sucursal; el consolidado es la suma.
    const porSucursal = new Map(sucursales.map((s) => [s.id, vacio()]));
    const de = (id: string) => porSucursal.get(id) ?? porSucursal.set(id, vacio()).get(id)!;
    for (const r of inventario) {
      Object.assign(de(r.sucursal_id), {
        stockPropio: n(r.stock_propio),
        stockConsignado: n(r.stock_consignado),
        publicacionesActivas: n(r.publicados),
        reservados: n(r.reservados),
        estancados: n(r.estancados),
        costoInventario: n(r.costo_inventario),
        gananciasProyectadas: n(r.ganancia_propios) + n(r.ganancia_consignados),
      });
    }
    const sumar = (filas: MontoSucursalRow[], campo: keyof IndicadoresSucursal) => {
      for (const r of filas)
        de(r.sucursal_id)[campo] = campo === 'reservasPorVencer' ? n(r.cantidad) : n(r.monto);
    };
    sumar(porVencer, 'reservasPorVencer');
    sumar(senas, 'senasRetenidas');
    // Gastos por tipo. Los generales (sin sucursal) no se reparten: van aparte
    // y solo cuentan en el total (vista consolidada).
    let gastosGenerales = 0;
    for (const g of gastos) {
      if (g.sucursal_id === null) {
        gastosGenerales += n(g.monto);
        continue;
      }
      de(g.sucursal_id)[g.tipo === 'VEHICULO' ? 'gastosVehiculos' : 'gastosOperacionales'] += n(
        g.monto,
      );
    }
    for (const r of ventas) {
      Object.assign(de(r.sucursal_id), {
        ventasCantidad: n(r.cantidad),
        ventasIngresos: n(r.ingresos),
        margenReal: n(r.margen),
      });
    }

    const total = vacio();
    for (const ind of porSucursal.values()) {
      for (const k of Object.keys(total) as (keyof IndicadoresSucursal)[]) total[k] += ind[k];
    }
    total.gastosOperacionales += gastosGenerales;

    const nombre = new Map(sucursales.map((s) => [s.id, s.nombre]));
    return {
      alcance: this.describirAlcance(alcance, sucursales),
      periodo,
      indicadores: {
        ...this.formatear(total, actor),
        ...(actor.rol === 'VENDEDOR' ? {} : { gastosGeneralesPeriodo: gastosGenerales }),
      },
      // Desglose por sucursal para comparar: solo ADMIN_GENERAL.
      porSucursal:
        actor.rol === 'ADMIN_GENERAL'
          ? [...porSucursal.entries()].map(([id, ind]) => ({
              sucursal: { id, nombre: nombre.get(id) ?? '' },
              indicadores: this.formatear(ind, actor),
            }))
          : undefined,
    };
  }

  async analitica(consulta: ConsultaDashboardDto, actor: UsuarioAutenticado) {
    const { alcance, sucursales } = await this.resolverAlcance(consulta, actor);
    const periodo = this.resolverPeriodo(consulta);
    const hoy = hoyEnChile();
    const [
      estancados,
      marcas,
      ventasMes,
      senasMes,
      gastosMes,
      resumen,
      embudo,
      antiguedad,
      inventarioTipo,
      inventarioOrigen,
      porOrigen,
      porTipo,
      porVendedor,
      formasPago,
      gastosCategoria,
    ] = await Promise.all([
      this.repo.estancados(alcance, hoy, DIAS_ESTANCADO),
      this.repo.porMarcaModelo(alcance, periodo),
      this.repo.ventasPorMes(alcance, periodo),
      this.repo.senasPorMes(alcance, periodo),
      this.repo.gastosOperacionalesPorMes(alcance, periodo),
      this.repo.resumenVentas(alcance, periodo),
      this.repo.embudo(alcance, periodo),
      this.repo.antiguedad(alcance, hoy),
      this.repo.inventarioPor(alcance, 'categoria'),
      this.repo.inventarioPor(alcance, 'origen'),
      this.repo.ventasPor(alcance, periodo, 'origen'),
      this.repo.ventasPor(alcance, periodo, 'categoria'),
      this.repo.ventasPor(alcance, periodo, 'vendedor'),
      this.repo.formasPago(alcance, periodo),
      this.repo.gastosPorCategoria(alcance, periodo),
    ]);
    const admin = actor.rol !== 'VENDEDOR';
    const redondear = (v: string | null, decimales = 1) =>
      v === null ? null : Math.round(n(v) * 10 ** decimales) / 10 ** decimales;
    const cantidadVentas = n(resumen.cantidad);
    const cotizaciones = n(embudo.cotizaciones);

    // Serie mensual con todos los meses del período (también los vacíos).
    const porMes = (filas: MesRow[]) => new Map(filas.map((f) => [f.mes, f]));
    const [vm, sm, gm] = [porMes(ventasMes), porMes(senasMes), porMes(gastosMes)];
    const meses = mesesEntre(periodo.desde, periodo.hasta);
    if (meses.length > 120) {
      throw new BadRequestException('Elige un período de hasta 10 años');
    }
    const tendencia = meses.map((mes) => {
      const v = vm.get(mes);
      const margen = n(v?.margen);
      const senas = n(sm.get(mes)?.monto);
      const gastos = n(gm.get(mes)?.monto);
      return {
        mes,
        ventas: n(v?.cantidad),
        ingresos: n(v?.monto) + senas,
        ...(admin
          ? { margen, gastosOperacionales: gastos, utilidadNeta: margen + senas - gastos }
          : {}),
      };
    });

    const grupo = (g: GrupoRow, conMargen = admin) => ({
      clave: g.clave,
      cantidad: n(g.cantidad),
      monto: n(g.monto),
      diasPromedio: redondear(g.dias_promedio),
      ...(conMargen ? { margen: n(g.margen) } : {}),
    });

    return {
      alcance: this.describirAlcance(alcance, sucursales),
      periodo,
      umbralEstancadoDias: DIAS_ESTANCADO,
      resumen: {
        ventas: cantidadVentas,
        ingresos: n(resumen.ingresos),
        ticketPromedio: cantidadVentas ? Math.round(n(resumen.ingresos) / cantidadVentas) : 0,
        diasPromedioVenta: redondear(resumen.dias_promedio),
        // Fracción: 0.032 = se vendió 3,2% bajo el último precio publicado.
        descuentoPromedio: redondear(resumen.descuento_promedio, 4),
        tasaCierreCotizaciones: cotizaciones
          ? Math.round((n(embudo.cotizaciones_concretadas) / cotizaciones) * 1000) / 1000
          : null,
        ...(admin
          ? {
              margen: n(resumen.margen),
              margenPromedio: cantidadVentas ? Math.round(n(resumen.margen) / cantidadVentas) : 0,
            }
          : {}),
      },
      tendencia,
      embudo: {
        cotizaciones,
        cotizacionesConcretadas: n(embudo.cotizaciones_concretadas),
        cotizacionesVencidas: n(embudo.cotizaciones_vencidas),
        reservas: n(embudo.reservas),
        reservasConvertidas: n(embudo.reservas_convertidas),
        reservasCanceladas: n(embudo.reservas_canceladas),
        ventas: n(embudo.ventas),
        ventasDesdeCotizacion: n(embudo.ventas_desde_cotizacion),
        ventasDesdeReserva: n(embudo.ventas_desde_reserva),
      },
      inventario: {
        antiguedad: TRAMOS_ANTIGUEDAD.map((tramo) => {
          const f = antiguedad.find((a) => a.tramo === tramo);
          return {
            tramo,
            cantidad: n(f?.cantidad),
            valorPublicado: n(f?.valor_publicado),
            ...(admin ? { capital: n(f?.capital) } : {}),
          };
        }),
        // En inventario, "margen" trae el capital invertido (costo + gastos de los propios).
        porTipo: inventarioTipo.map((g) => ({
          clave: g.clave,
          cantidad: n(g.cantidad),
          valorPublicado: n(g.monto),
          ...(admin ? { capital: n(g.margen) } : {}),
        })),
        porOrigen: inventarioOrigen.map((g) => ({
          clave: g.clave,
          cantidad: n(g.cantidad),
          valorPublicado: n(g.monto),
          ...(admin ? { capital: n(g.margen) } : {}),
        })),
      },
      ventasPorOrigen: porOrigen.map((g) => grupo(g)),
      ventasPorTipo: porTipo.map((g) => grupo(g)),
      // Ranking de vendedores: solo admins.
      ...(admin ? { ventasPorVendedor: porVendedor.map((g) => grupo(g)) } : {}),
      formasPago: formasPago.map((g) => ({
        clave: g.clave,
        ventas: n(g.cantidad),
        monto: n(g.monto),
      })),
      ...(admin
        ? {
            gastosPorCategoria: gastosCategoria.map((g) => ({
              clave: g.clave,
              tipo: g.tipo,
              cantidad: n(g.cantidad),
              monto: n(g.monto),
            })),
          }
        : {}),
      estancados: estancados.map((v) => ({
        id: v.id,
        patente: v.patente,
        descripcion: v.descripcion,
        sucursal: { id: v.sucursal_id, nombre: v.sucursal_nombre },
        estado: v.estado,
        origen: v.origen,
        precioVenta: n(v.precio_venta),
        diasEnInventario: v.dias,
        sugerencia: sugerenciaEstancado(v),
      })),
      porMarcaModelo: marcas.map((m) => ({
        marca: m.marca,
        modelo: m.modelo,
        ventas: n(m.cantidad),
        diasPromedioVenta: Math.round(n(m.dias_promedio) * 10) / 10,
        ingresos: n(m.ingresos),
        ...(admin ? { rentabilidadPromedio: Math.round(n(m.margen_promedio)) } : {}),
      })),
    };
  }

  private formatear(ind: IndicadoresSucursal, actor: UsuarioAutenticado) {
    const base = {
      stock: {
        propio: ind.stockPropio,
        consignado: ind.stockConsignado,
        total: ind.stockPropio + ind.stockConsignado,
      },
      publicacionesActivas: ind.publicacionesActivas,
      reservados: { total: ind.reservados, porVencer: ind.reservasPorVencer },
      vehiculosEstancados: ind.estancados,
      ventasPeriodo: { cantidad: ind.ventasCantidad, ingresos: ind.ventasIngresos },
      senasRetenidas: ind.senasRetenidas,
      ingresosPeriodo: ind.ventasIngresos + ind.senasRetenidas,
    };
    if (actor.rol === 'VENDEDOR') return base;
    return {
      ...base,
      costoInventario: ind.costoInventario,
      gananciasProyectadas: ind.gananciasProyectadas,
      margenRealPeriodo: ind.margenReal,
      // Utilidad bruta = margen real de las ventas (ya descuenta el costo y los
      // gastos de cada auto vendido) + señas retenidas (ingreso sin costo).
      utilidadPeriodo: ind.margenReal + ind.senasRetenidas,
      gastosOperacionalesPeriodo: ind.gastosOperacionales,
      // Utilidad neta = utilidad bruta − gastos operacionales del período.
      utilidadNetaPeriodo: ind.margenReal + ind.senasRetenidas - ind.gastosOperacionales,
      // Informativo: lo invertido en preparar autos en el período (no se resta
      // otra vez: entra en el margen cuando el auto se vende).
      gastosVehiculosPeriodo: ind.gastosVehiculos,
    };
  }

  private async resolverAlcance(consulta: ConsultaDashboardDto, actor: UsuarioAutenticado) {
    const todas = await this.repo.sucursales(actor.automotoraId);
    const pedidas = consulta.sucursalIds?.length ? [...new Set(consulta.sucursalIds)] : null;

    if (actor.rol !== 'ADMIN_GENERAL') {
      // Sin selector: siempre su propia sucursal.
      if (pedidas && (pedidas.length > 1 || pedidas[0] !== actor.sucursalId)) {
        throw new ForbiddenException('Solo puedes ver los indicadores de tu sucursal');
      }
      const propia = todas.filter((s) => s.id === actor.sucursalId);
      return {
        alcance: { automotoraId: actor.automotoraId, sucursalIds: [actor.sucursalId!] } as Alcance,
        sucursales: propia,
      };
    }

    if (!pedidas) {
      // Consolidado: todas (las dadas de baja solo aportan si tienen movimientos).
      return {
        alcance: { automotoraId: actor.automotoraId, sucursalIds: null } as Alcance,
        sucursales: todas.filter((s) => s.activa),
      };
    }
    const elegidas = todas.filter((s) => pedidas.includes(s.id));
    if (elegidas.length !== pedidas.length) {
      throw new BadRequestException('Alguna de las sucursales indicadas no existe');
    }
    return {
      alcance: { automotoraId: actor.automotoraId, sucursalIds: pedidas } as Alcance,
      sucursales: elegidas,
    };
  }

  private resolverPeriodo(consulta: ConsultaDashboardDto): Periodo {
    const hoy = hoyEnChile();
    const desde = consulta.desde ?? `${hoy.slice(0, 8)}01`;
    const hasta = consulta.hasta ?? hoy;
    if (desde > hasta)
      throw new BadRequestException('El inicio del período es posterior al término');
    return { desde, hasta };
  }

  private describirAlcance(alcance: Alcance, sucursales: { id: string; nombre: string }[]) {
    return {
      tipo: alcance.sucursalIds === null ? ('CONSOLIDADO' as const) : ('SUCURSALES' as const),
      sucursales: sucursales.map((s) => ({ id: s.id, nombre: s.nombre })),
    };
  }
}
