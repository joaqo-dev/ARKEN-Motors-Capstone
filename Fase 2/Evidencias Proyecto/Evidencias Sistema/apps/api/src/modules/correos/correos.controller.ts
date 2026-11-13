import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { CorreosService } from './correos.service';
import { DocumentoCorreoDto, RecordatoriosDto } from './dto/documento-correo.dto';

// Historial y reenvío de los correos de un documento (cualquier rol con acceso a él).
@Controller('correos')
export class CorreosController {
  constructor(private readonly correos: CorreosService) {}

  @Get()
  historial(@Query() dto: DocumentoCorreoDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.correos.historial(dto.documentoTipo, dto.documentoId, actor);
  }

  @Post('reenviar')
  @HttpCode(HttpStatus.OK)
  reenviar(@Body() dto: DocumentoCorreoDto, @CurrentUser() actor: UsuarioAutenticado) {
    return this.correos.reenviar(dto.documentoTipo, dto.documentoId, actor);
  }
}

// Enlace "No quiero recibir más recordatorios" del correo: anónimo, con un token
// firmado por cliente (sin sesión ni cookies, por eso sin CSRF).
@Controller('publico/recordatorios')
@Public()
export class RecordatoriosPublicoController {
  constructor(private readonly correos: CorreosService) {}

  @Get()
  estado(@Query('t') token: string) {
    return this.correos.estadoRecordatorios(token ?? '');
  }

  @Post()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  cambiar(@Body() dto: RecordatoriosDto) {
    return this.correos.cambiarRecordatorios(dto.token, dto.acepta);
  }
}
