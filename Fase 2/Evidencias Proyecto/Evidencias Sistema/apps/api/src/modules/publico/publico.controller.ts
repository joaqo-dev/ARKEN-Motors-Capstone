import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator';
import { BuscarVehiculosDto, FiltrosDisponiblesDto } from './dto/buscar-vehiculos.dto';
import { ContactoAutomotoraDto } from './dto/contacto.dto';
import { PublicoService } from './publico.service';

// API del sitio público, anónima. Solo lectura, salvo el formulario de
// contacto (sin sesión ni cookies, por eso sin CSRF; con límite por IP).
@Controller('publico')
@Public()
export class PublicoController {
  constructor(private readonly publico: PublicoService) {}

  @Get('vehiculos')
  buscar(@Query() filtro: BuscarVehiculosDto) {
    return this.publico.buscar(filtro);
  }

  @Get('vehiculos/:id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.publico.detalle(id);
  }

  @Get('filtros')
  filtros(@Query() consulta: FiltrosDisponiblesDto) {
    return this.publico.filtros(consulta);
  }

  @Get('automotoras')
  directorio() {
    return this.publico.directorio();
  }

  // Subdominios de todas las vitrinas (sitemap.xml del sitio público).
  @Get('vitrinas')
  vitrinas() {
    return this.publico.vitrinas();
  }

  @Get('automotoras/:subdominio')
  automotora(@Param('subdominio') subdominio: string) {
    return this.publico.automotora(subdominio.toLowerCase());
  }

  @Post('automotoras/:subdominio/contacto')
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  contactar(@Param('subdominio') subdominio: string, @Body() dto: ContactoAutomotoraDto) {
    return this.publico.contactar(subdominio.toLowerCase(), dto);
  }
}
