import { Module } from '@nestjs/common';
import { PdfService } from '../../common/pdf/pdf.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AutomotorasModule } from '../automotoras/automotoras.module';
import { VehiculosModule } from '../vehiculos/vehiculos.module';
import { InspeccionesController } from './inspecciones.controller';
import { InspeccionesRepository } from './inspecciones.repository';
import { InspeccionesService } from './inspecciones.service';

@Module({
  imports: [VehiculosModule, AutomotorasModule, AuditoriaModule],
  controllers: [InspeccionesController],
  providers: [InspeccionesRepository, InspeccionesService, PdfService],
  exports: [InspeccionesRepository],
})
export class InspeccionesModule {}
