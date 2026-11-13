import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { hoyEnChile } from '../../common/fechas';
import { CotizacionesRepository } from '../cotizaciones/cotizaciones.repository';
import { ReservasRepository } from '../reservas/reservas.repository';
import { TasacionesRepository } from '../tasaciones/tasaciones.repository';

// Pasa a VENCIDA al cumplirse el plazo. Una reserva vencida mantiene el
// vehículo RESERVADO hasta que un admin la extienda o la cancele.
@Injectable()
export class VencimientosTareas implements OnApplicationBootstrap {
  private readonly logger = new Logger(VencimientosTareas.name);

  constructor(
    private readonly cotizaciones: CotizacionesRepository,
    private readonly reservas: ReservasRepository,
    private readonly tasaciones: TasacionesRepository,
  ) {}

  // También al arrancar, para cubrir los días en que la API estuvo abajo.
  async onApplicationBootstrap() {
    await this.marcarVencidos();
  }

  @Cron('0 5 0 * * *', { timeZone: 'America/Santiago' })
  async marcarVencidos() {
    const hoy = hoyEnChile();
    const [cotizaciones, reservas, tasaciones] = await Promise.all([
      this.cotizaciones.marcarVencidas(hoy),
      this.reservas.marcarVencidas(hoy),
      this.tasaciones.marcarVencidas(hoy),
    ]);
    if (cotizaciones + reservas + tasaciones > 0) {
      this.logger.log(
        `Vencidos: ${cotizaciones} cotización(es), ${reservas} reserva(s), ${tasaciones} tasación(es)`,
      );
    }
  }
}
