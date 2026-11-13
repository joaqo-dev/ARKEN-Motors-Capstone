import { forwardRef, Module } from '@nestjs/common';
import { VehiculosModule } from '../vehiculos/vehiculos.module';
import { ConsignacionesController } from './consignaciones.controller';
import { ConsignacionesRepository } from './consignaciones.repository';
import { ConsignacionesService } from './consignaciones.service';
import { ConsignacionesTareas } from './consignaciones.tareas';

// Referencia circular con Vehículos: el alta de un vehículo consignado crea la
// consignación, y devolver una consignación da de baja el vehículo.
@Module({
  imports: [forwardRef(() => VehiculosModule)],
  controllers: [ConsignacionesController],
  providers: [ConsignacionesRepository, ConsignacionesService, ConsignacionesTareas],
  exports: [ConsignacionesRepository],
})
export class ConsignacionesModule {}
