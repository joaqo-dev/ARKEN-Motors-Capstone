import { Global, Module } from '@nestjs/common';
import { AuditoriaController } from './auditoria.controller';
import { AccesosRepository } from './accesos.repository';
import { AuditoriaRepository } from './auditoria.repository';
import { AuditoriaService } from './auditoria.service';

// Global: todos los módulos de negocio registran auditoría (y auth, los accesos).
@Global()
@Module({
  controllers: [AuditoriaController],
  providers: [AuditoriaRepository, AccesosRepository, AuditoriaService],
  exports: [AuditoriaRepository, AccesosRepository],
})
export class AuditoriaModule {}
