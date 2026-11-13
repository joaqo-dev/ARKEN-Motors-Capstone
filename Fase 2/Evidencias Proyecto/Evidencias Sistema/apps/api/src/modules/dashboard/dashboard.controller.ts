import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { DashboardService } from './dashboard.service';
import { ConsultaDashboardDto } from './dto/consulta-dashboard.dto';

// Se calcula en cada request (tiempo real, no batch).
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  obtenerDashboard(
    @Query() consulta: ConsultaDashboardDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.dashboard.dashboard(consulta, actor);
  }

  @Get('analitica')
  obtenerAnalitica(
    @Query() consulta: ConsultaDashboardDto,
    @CurrentUser() actor: UsuarioAutenticado,
  ) {
    return this.dashboard.analitica(consulta, actor);
  }
}
