import { Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesRepository } from './notificaciones.repository';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesTareas } from './notificaciones.tareas';

@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesRepository, NotificacionesService, NotificacionesTareas],
  // Vehículos crea y resuelve el aviso "por revisar" (Módulo 7.6).
  exports: [NotificacionesRepository],
})
export class NotificacionesModule {}
