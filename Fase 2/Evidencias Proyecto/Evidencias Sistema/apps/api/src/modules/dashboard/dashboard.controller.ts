import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { DashboardService } from './dashboard.service';
import { ConsultaDashboardDto } from './dto/consulta-dashboard.dto';

// Cálculo al vuelo en cada request (Módulo 14: tiempo real, no batch).
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
