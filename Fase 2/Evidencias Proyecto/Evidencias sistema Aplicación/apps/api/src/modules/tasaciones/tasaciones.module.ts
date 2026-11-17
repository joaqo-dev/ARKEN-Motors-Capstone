import { Module } from '@nestjs/common';
import { DocumentosComercialesModule } from '../documentos-comerciales/documentos-comerciales.module';
import { SucursalesModule } from '../sucursales/sucursales.module';
import { TasacionesController } from './tasaciones.controller';
import { TasacionesRepository } from './tasaciones.repository';
import { TasacionesService } from './tasaciones.service';

@Module({
  imports: [DocumentosComercialesModule, SucursalesModule],
  controllers: [TasacionesController],
  providers: [TasacionesRepository, TasacionesService],
  exports: [TasacionesRepository],
})
export class TasacionesModule {}
