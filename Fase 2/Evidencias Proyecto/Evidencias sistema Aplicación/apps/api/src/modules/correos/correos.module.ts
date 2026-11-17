import { Global, Module } from '@nestjs/common';
import { CorreosController, RecordatoriosPublicoController } from './correos.controller';
import { CorreosRepository } from './correos.repository';
import { CorreosService } from './correos.service';
import { CorreosTareas } from './correos.tareas';

// Global: los Services que emiten documentos encolan su correo con CorreosService.
@Global()
@Module({
  controllers: [CorreosController, RecordatoriosPublicoController],
  providers: [CorreosRepository, CorreosService, CorreosTareas],
  exports: [CorreosService],
})
export class CorreosModule {}
