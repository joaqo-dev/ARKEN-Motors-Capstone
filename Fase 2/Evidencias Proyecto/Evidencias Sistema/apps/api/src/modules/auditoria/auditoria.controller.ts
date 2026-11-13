import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { AuditoriaService } from './auditoria.service';
import { ListarAccesosDto } from './dto/listar-accesos.dto';
import { ListarAuditoriaDto } from './dto/listar-auditoria.dto';

// Solo lectura: la auditoría nunca se modifica ni se borra (trigger en la BD).
@Controller('auditoria')
@Roles('ADMIN_GENERAL', 'ADMIN_SUCURSAL')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  listar(@Query() filtro: ListarAuditoriaDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.auditoria.listar(filtro, actor);
  }

  // Registro de accesos: la seguridad de las cuentas de toda la automotora.
  @Get('accesos')
  @Roles('ADMIN_GENERAL')
  accesos(@Query() filtro: ListarAccesosDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.auditoria.accesos(filtro, actor);
  }
}
