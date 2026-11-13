import { Controller, Get, Param, ParseUUIDPipe, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { FichasService } from './fichas.service';

// Ficha imprimible del vehículo: cualquier rol con acceso al vehículo.
@Controller('vehiculos')
export class FichasController {
  constructor(private readonly fichas: FichasService) {}

  @Get(':id/ficha')
  async ficha(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, nombre } = await this.fichas.generar(id, actor);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nombre}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(buffer);
  }
}
