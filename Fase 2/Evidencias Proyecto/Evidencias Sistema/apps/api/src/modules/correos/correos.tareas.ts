import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CorreosService } from './correos.service';

const ZONA = 'America/Santiago';

// Hora actual en Chile (0-23).
function horaEnChile(ahora = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hour: 'numeric', hourCycle: 'h23' }).format(
      ahora,
    ),
  );
}

// La bandeja de salida se revisa cada minuto (reintentos y pendientes) y los
// recordatorios se planifican una vez al día, después de los vencimientos
// automáticos (00:05).
@Injectable()
export class CorreosTareas implements OnApplicationBootstrap {
  constructor(private readonly correos: CorreosService) {}

  // También al arrancar, para cubrir los días en que la API estuvo abajo, pero
  // nunca de noche: no se envían recordatorios a las 3 AM.
  async onApplicationBootstrap() {
    const hora = horaEnChile();
    if (hora >= 7 && hora < 21) await this.correos.planificarRecordatorios();
  }

  @Cron('0 0 7 * * *', { timeZone: ZONA })
  async planificar() {
    await this.correos.planificarRecordatorios();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async procesar() {
    await this.correos.procesarBandeja();
  }
}
