import { Module } from '@nestjs/common';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module';
import { ReservasModule } from '../reservas/reservas.module';
import { TasacionesModule } from '../tasaciones/tasaciones.module';
import { VencimientosTareas } from './vencimientos.tareas';

@Module({
  imports: [CotizacionesModule, ReservasModule, TasacionesModule],
  providers: [VencimientosTareas],
})
export class VencimientosModule {}
