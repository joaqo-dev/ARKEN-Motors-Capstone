import { Module } from '@nestjs/common';
import { ConsignacionesModule } from '../consignaciones/consignaciones.module';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module';
import { DocumentosComercialesModule } from '../documentos-comerciales/documentos-comerciales.module';
import { ReservasModule } from '../reservas/reservas.module';
import { VentasController } from './ventas.controller';
import { VentasRepository } from './ventas.repository';
import { VentasService } from './ventas.service';

@Module({
  imports: [DocumentosComercialesModule, ReservasModule, ConsignacionesModule, CotizacionesModule],
  controllers: [VentasController],
  providers: [VentasRepository, VentasService],
  exports: [VentasRepository],
})
export class VentasModule {}
