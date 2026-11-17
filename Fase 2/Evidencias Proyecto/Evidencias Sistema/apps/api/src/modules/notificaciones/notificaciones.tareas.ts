import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificacionesService } from './notificaciones.service';

// Cron diario (Módulo 13). Corre después de los vencimientos automáticos (00:05),
// y también al arrancar, para cubrir los días en que la API estuvo abajo.
@Injectable()
export class NotificacionesTareas implements OnApplicationBootstrap {
  constructor(private readonly notificaciones: NotificacionesService) {}

  async onApplicationBootstrap() {
    await this.notificaciones.generar();
  }

  @Cron('0 30 6 * * *', { timeZone: 'America/Santiago' })
  async generar() {
    await this.notificaciones.generar();
  }
}
