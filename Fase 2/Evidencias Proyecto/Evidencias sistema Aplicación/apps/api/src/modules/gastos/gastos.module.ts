import { Module } from '@nestjs/common';
import { ConsignacionesModule } from '../consignaciones/consignaciones.module';
import { SucursalesModule } from '../sucursales/sucursales.module';
import { VehiculosModule } from '../vehiculos/vehiculos.module';
import { BalanceService } from './balance.service';
import { GastosController, VehiculoGastosController } from './gastos.controller';
import { GastosRepository } from './gastos.repository';
import { GastosService } from './gastos.service';

@Module({
  imports: [VehiculosModule, ConsignacionesModule, SucursalesModule],
  controllers: [GastosController, VehiculoGastosController],
  providers: [GastosRepository, GastosService, BalanceService],
})
export class GastosModule {}
