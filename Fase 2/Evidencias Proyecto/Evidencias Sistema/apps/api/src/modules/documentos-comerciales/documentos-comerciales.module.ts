import { Module } from '@nestjs/common';
import { AutomotorasModule } from '../automotoras/automotoras.module';
import { ClientesModule } from '../clientes/clientes.module';
import { VehiculosModule } from '../vehiculos/vehiculos.module';
import { DocumentosComunesService } from './documentos-comunes.service';

@Module({
  imports: [ClientesModule, AutomotorasModule, VehiculosModule],
  providers: [DocumentosComunesService],
  exports: [DocumentosComunesService, VehiculosModule],
})
export class DocumentosComercialesModule {}
