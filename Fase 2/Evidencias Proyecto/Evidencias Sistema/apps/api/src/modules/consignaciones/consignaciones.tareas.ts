import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { hoyEnChile } from '../../common/fechas';
import { ConsignacionesRepository } from './consignaciones.repository';

// Vence automáticamente el plazo de las consignaciones. Las alertas (7 días
// hábiles antes y el mismo día) las genera Notificaciones.
@Injectable()
export class ConsignacionesTareas implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConsignacionesTareas.name);

  constructor(private readonly consignaciones: ConsignacionesRepository) {}

  // También al arrancar, para cubrir los días en que la API estuvo abajo.
  async onApplicationBootstrap() {
    await this.marcarVencidas();
  }

  @Cron('0 5 0 * * *', { timeZone: 'America/Santiago' })
  async marcarVencidas() {
    const total = await this.consignaciones.marcarVencidas(hoyEnChile());
    if (total > 0) this.logger.log(`${total} consignación(es) marcada(s) como VENCIDA`);
  }
}
