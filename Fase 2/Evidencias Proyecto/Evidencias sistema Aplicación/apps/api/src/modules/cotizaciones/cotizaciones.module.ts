import { Module } from '@nestjs/common';
import { ConsignacionesModule } from '../consignaciones/consignaciones.module';
import { DocumentosComercialesModule } from '../documentos-comerciales/documentos-comerciales.module';
import { CotizacionesController } from './cotizaciones.controller';
import { CotizacionesRepository } from './cotizaciones.repository';
import { CotizacionesService } from './cotizaciones.service';

@Module({
  imports: [DocumentosComercialesModule, ConsignacionesModule],
  controllers: [CotizacionesController],
  providers: [CotizacionesRepository, CotizacionesService],
  exports: [CotizacionesRepository],
})
export class CotizacionesModule {}
