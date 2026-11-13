import { Module } from '@nestjs/common';
import { InspeccionesModule } from '../inspecciones/inspecciones.module';
import { PublicoController } from './publico.controller';
import { PublicoRepository } from './publico.repository';
import { PublicoService } from './publico.service';

@Module({
  imports: [InspeccionesModule],
  controllers: [PublicoController],
  providers: [PublicoRepository, PublicoService],
})
export class PublicoModule {}
