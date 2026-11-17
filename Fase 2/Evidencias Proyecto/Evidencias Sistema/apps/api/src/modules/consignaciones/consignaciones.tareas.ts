import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { hoyEnChile } from '../../common/fechas';
import { ConsignacionesRepository } from './consignaciones.repository';

// Vencimiento automático del plazo de consignación. Las alertas (7 días hábiles
// antes + el mismo día) se agregan en el Paso 7 con el módulo de Notificaciones.
@Injectable()
export class ConsignacionesTareas implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConsignacionesTareas.name);

  constructor(private readonly consignaciones: ConsignacionesRepository) {}

  // Al arrancar también: cubre los días en que la API estuvo abajo.
  async onApplicationBootstrap() {
    await this.marcarVencidas();
  }

  @Cron('0 5 0 * * *', { timeZone: 'America/Santiago' })
  async marcarVencidas() {
    const total = await this.consignaciones.marcarVencidas(hoyEnChile());
    if (total > 0) this.logger.log(`${total} consignación(es) marcada(s) como VENCIDA`);
  }
}
