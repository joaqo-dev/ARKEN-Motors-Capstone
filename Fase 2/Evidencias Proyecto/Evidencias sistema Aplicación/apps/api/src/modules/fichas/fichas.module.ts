import { Module } from '@nestjs/common';
import { PdfService } from '../../common/pdf/pdf.service';
import { AutomotorasModule } from '../automotoras/automotoras.module';
import { VehiculosModule } from '../vehiculos/vehiculos.module';
import { FichasController } from './fichas.controller';
import { FichasService } from './fichas.service';

@Module({
  imports: [VehiculosModule, AutomotorasModule],
  controllers: [FichasController],
  providers: [FichasService, PdfService],
})
export class FichasModule {}
