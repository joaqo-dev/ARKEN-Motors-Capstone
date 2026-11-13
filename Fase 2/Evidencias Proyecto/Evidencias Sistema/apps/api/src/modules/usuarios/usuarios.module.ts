import { Module } from '@nestjs/common';
import { AutomotorasModule } from '../automotoras/automotoras.module';
import { SucursalesModule } from '../sucursales/sucursales.module';
import { SesionesRepository } from './sesiones.repository';
import { TokensAccionRepository } from './tokens-accion.repository';
import { UsuariosController } from './usuarios.controller';
import { UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [AutomotorasModule, SucursalesModule],
  controllers: [UsuariosController],
  providers: [UsuariosRepository, TokensAccionRepository, SesionesRepository, UsuariosService],
  exports: [UsuariosRepository, TokensAccionRepository, SesionesRepository],
})
export class UsuariosModule {}
