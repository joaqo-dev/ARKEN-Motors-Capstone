import { Module } from '@nestjs/common';
import { DocumentosComercialesModule } from '../documentos-comerciales/documentos-comerciales.module';
import { ReservasController } from './reservas.controller';
import { ReservasRepository } from './reservas.repository';
import { ReservasService } from './reservas.service';

@Module({
  imports: [DocumentosComercialesModule],
  controllers: [ReservasController],
  providers: [ReservasRepository, ReservasService],
  exports: [ReservasRepository],
})
export class ReservasModule {}
