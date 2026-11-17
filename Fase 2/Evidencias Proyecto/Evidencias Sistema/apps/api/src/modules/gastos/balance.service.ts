import { Injectable, NotFoundException } from '@nestjs/common';
import { calcularLiquidacion } from '@vitriauto/shared-types';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { ConsignacionesRepository, tratoDeFila } from '../consignaciones/consignaciones.repository';
import { VehiculosRepository } from '../vehiculos/vehiculos.repository';
import { GastosRepository } from './gastos.repository';

// Balance financiero de un vehículo (Módulo 7.7), solo para admins. Si está
// vendido, es el margen REAL (precio final de su venta); si no, el PROYECTADO
// al precio de venta actual. Los costos de traspaso nunca entran.
@Injectable()
export class BalanceService {
  constructor(
    private readonly vehiculos: VehiculosRepository,
    private readonly gastos: GastosRepository,
    private readonly consignaciones: ConsignacionesRepository,
  ) {}

  async balanceVehiculo(vehiculoId: string, actor: UsuarioAutenticado) {
    const vehiculo = await this.vehiculos.findByIdScoped(vehiculoId, getScope(actor));
    if (!vehiculo) throw new NotFoundException('Vehículo no encontrado');
    const precioReal = await this.vehiculos.precioVentaConfirmada(vehiculoId);
    const precioVenta = precioReal ?? Number(vehiculo.precio_venta);
    const margenTipo = precioReal !== null ? ('REAL' as const) : ('PROYECTADO' as const);

    if (vehiculo.origen === 'CONSIGNACION') {
      // El vehículo no es de la automotora: su margen es la comisión pactada, sin gastos.
      const consignacion = await this.consignaciones.findByVehiculo(vehiculoId);
      const liquidacion = consignacion
        ? calcularLiquidacion(tratoDeFila(consignacion), precioVenta)
        : null;
      return {
        tipo: 'CONSIGNACION' as const,
        margenTipo,
        precioVenta,
        comision: liquidacion?.comision ?? 0,
        montoConsignante: liquidacion?.montoConsignante ?? 0,
        margen: liquidacion?.comision ?? 0,
      };
    }

    const costoAdquisicion = Number(vehiculo.costo_adquisicion);
    const totalGastos = await this.gastos.sumaActivosPorVehiculo(vehiculoId);
    const costoTotal = costoAdquisicion + totalGastos;
    return {
      tipo: 'PROPIO' as const,
      margenTipo,
      precioVenta,
      costoAdquisicion,
      totalGastos,
      costoTotal,
      margen: precioVenta - costoTotal,
    };
  }
}
