import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
} from '../../common/cookies';
import { generarToken } from '../../common/crypto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OrigenPanelGuard } from '../../common/guards/origen-panel.guard';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { AuthService, InfoCliente, SesionEmitida } from './auth.service';
import { DefinirPasswordDto } from './dto/definir-password.dto';
import { EmailDto } from './dto/email.dto';
import { LoginDto } from './dto/login.dto';
import { RegistroAutomotoraDto } from './dto/registro-automotora.dto';
import { SubdominioQueryDto } from './dto/subdominio.dto';
import { TokenDto } from './dto/token.dto';

const UN_MINUTO = 60_000;
const UNA_HORA = 60 * UN_MINUTO;

@Controller('auth')
@UseGuards(OrigenPanelGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('subdominio-disponible')
  @Public()
  subdominioDisponible(@Query() query: SubdominioQueryDto) {
    return this.auth.subdominioDisponible(query.subdominio);
  }

  @Post('registro-automotora')
  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: UNA_HORA } })
  registrarAutomotora(@Body() dto: RegistroAutomotoraDto, @Req() req: Request) {
    return this.auth.registrarAutomotora(dto, infoCliente(req));
  }

  @Post('verificar-email')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  verificarEmail(@Body() dto: TokenDto, @Req() req: Request) {
    return this.auth.verificarEmail(dto.token, infoCliente(req));
  }

  @Post('reenviar-verificacion')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: UN_MINUTO } })
  reenviarVerificacion(@Body() dto: EmailDto) {
    return this.auth.reenviarVerificacion(dto.email);
  }

  @Post('aceptar-invitacion')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  aceptarInvitacion(@Body() dto: DefinirPasswordDto, @Req() req: Request) {
    return this.auth.aceptarInvitacion(dto.token, dto.password, infoCliente(req));
  }

  @Post('login')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: UN_MINUTO } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sesion = await this.auth.login(dto.email, dto.password, infoCliente(req));
    this.setCookiesSesion(res, sesion);
    return { usuario: sesion.usuario };
  }

  // Público respecto del access token (puede haber expirado), pero exige CSRF.
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sesion = await this.auth.refresh(cookie(req, REFRESH_COOKIE), infoCliente(req));
    this.setCookiesSesion(res, sesion);
    return { usuario: sesion.usuario };
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(cookie(req, REFRESH_COOKIE), infoCliente(req));
    const base = this.cookieBase();
    res.clearCookie(ACCESS_COOKIE, base);
    res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
    res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
  }

  @Post('olvide-password')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: UN_MINUTO } })
  olvidePassword(@Body() dto: EmailDto, @Req() req: Request) {
    return this.auth.olvidePassword(dto.email, infoCliente(req));
  }

  @Post('restablecer-password')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: UN_MINUTO } })
  restablecerPassword(@Body() dto: DefinirPasswordDto, @Req() req: Request) {
    return this.auth.restablecerPassword(dto.token, dto.password, infoCliente(req));
  }

  @Get('me')
  me(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.auth.perfil(usuario.id);
  }

  private cookieBase(): CookieOptions {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      domain: this.config.COOKIE_DOMAIN,
    };
  }

  private setCookiesSesion(res: Response, sesion: SesionEmitida) {
    const base = this.cookieBase();
    const refreshMaxAge = this.config.REFRESH_TTL_DIAS * 24 * 60 * 60 * 1000;
    res.cookie(ACCESS_COOKIE, sesion.accessToken, {
      ...base,
      maxAge: this.config.JWT_ACCESS_TTL_SEGUNDOS * 1000,
    });
    res.cookie(REFRESH_COOKIE, sesion.refreshToken, {
      ...base,
      path: REFRESH_COOKIE_PATH,
      maxAge: refreshMaxAge,
    });
    // Legible por el frontend (no httpOnly) para reenviarlo en el header X-CSRF-Token.
    res.cookie(CSRF_COOKIE, generarToken(), { ...base, httpOnly: false, maxAge: refreshMaxAge });
  }
}

function cookie(req: Request, nombre: string): string | undefined {
  const valor: unknown = req.cookies?.[nombre];
  return typeof valor === 'string' && valor ? valor : undefined;
}

function infoCliente(req: Request): InfoCliente {
  return { userAgent: req.header('user-agent') ?? null, ip: req.ip ?? null };
}
