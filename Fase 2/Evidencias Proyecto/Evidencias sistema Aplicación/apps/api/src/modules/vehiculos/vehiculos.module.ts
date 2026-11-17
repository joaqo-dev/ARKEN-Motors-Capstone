import { forwardRef, Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module';
import { ConsignacionesModule } from '../consignaciones/consignaciones.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { SucursalesModule } from '../sucursales/sucursales.module';
import { TasacionesRepository } from '../tasaciones/tasaciones.repository';
import { DocumentosLegalesRepository } from './documentos-legales.repository';
import { VehiculoArchivosService } from './vehiculo-archivos.service';
import { VehiculoBitacoraRepository } from './vehiculo-bitacora.repository';
import { VehiculoFotosRepository } from './vehiculo-fotos.repository';
import { VehiculosController } from './vehiculos.controller';
import { VehiculosRepository } from './vehiculos.repository';
import { VehiculosService } from './vehiculos.service';

@Module({
  imports: [
    ClientesModule,
    forwardRef(() => ConsignacionesModule),
    SucursalesModule,
    NotificacionesModule,
  ],
  controllers: [VehiculosController],
  providers: [
    VehiculosRepository,
    VehiculoFotosRepository,
    DocumentosLegalesRepository,
    VehiculoBitacoraRepository,
    // Repositorio sin estado, registrado aquí para validar la compra a particular
    // sin crear un ciclo de módulos con Tasaciones.
    TasacionesRepository,
    VehiculosService,
    VehiculoArchivosService,
  ],
  exports: [VehiculosRepository, VehiculoBitacoraRepository, VehiculoFotosRepository],
})
export class VehiculosModule {}
