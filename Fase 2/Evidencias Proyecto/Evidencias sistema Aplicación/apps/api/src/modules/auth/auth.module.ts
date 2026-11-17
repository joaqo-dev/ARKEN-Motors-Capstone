import { Module } from '@nestjs/common';
import { AutomotorasModule } from '../automotoras/automotoras.module';
import { SucursalesModule } from '../sucursales/sucursales.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [AutomotorasModule, SucursalesModule, UsuariosModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
