import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { AutomotorasService } from './automotoras.service';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';

enum Imagen {
  logo = 'LOGO',
  banner = 'BANNER',
}

@Controller('automotora')
export class AutomotorasController {
  constructor(private readonly automotoras: AutomotorasService) {}

  // La automotora del usuario autenticado (derivada del JWT, nunca de un id del cliente).
  @Get()
  obtenerPropia(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.automotoras.obtenerPropia(usuario);
  }

  // Configuración: solo ADMIN_GENERAL.
  @Patch()
  @Roles('ADMIN_GENERAL')
  actualizar(@Body() dto: UpdateConfiguracionDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.automotoras.actualizar(dto, usuario);
  }

  // POST /automotora/logo | /automotora/banner (multipart, campo "imagen")
  @Post(':imagen')
  @Roles('ADMIN_GENERAL')
  @UseInterceptors(FileInterceptor('imagen', { limits: { fileSize: 10 * 1024 * 1024 } }))
  subirImagen(
    @Param('imagen', new ParseEnumPipe(['logo', 'banner'])) imagen: 'logo' | 'banner',
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.automotoras.subirImagen(Imagen[imagen], archivo, usuario);
  }

  @Delete(':imagen')
  @Roles('ADMIN_GENERAL')
  quitarImagen(
    @Param('imagen', new ParseEnumPipe(['logo', 'banner'])) imagen: 'logo' | 'banner',
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.automotoras.quitarImagen(Imagen[imagen], usuario);
  }
}
