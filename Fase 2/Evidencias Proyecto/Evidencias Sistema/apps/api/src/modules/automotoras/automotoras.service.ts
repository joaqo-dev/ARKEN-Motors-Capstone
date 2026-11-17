import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { esRutValido, normalizarRut } from '@vitriauto/shared-types';
import { PoolClient } from 'pg';
import { AlmacenamientoService } from '../../common/almacenamiento/almacenamiento.service';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { AutomotoraRow, AutomotorasRepository } from './automotoras.repository';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';

const tasa = (row: AutomotoraRow) =>
  row.financiamiento_tasa_mensual === null ? null : Number(row.financiamiento_tasa_mensual);

export function toAutomotoraResponse(row: AutomotoraRow) {
  return {
    id: row.id,
    nombre: row.nombre,
    rut: row.rut,
    subdominio: row.subdominio,
    direccion: row.direccion,
    telefono: row.telefono,
    email: row.email,
    descripcion: row.descripcion,
    logoUrl: row.logo_url,
    bannerUrl: row.banner_url,
    diasValidezCotizacion: row.dias_validez_cotizacion,
    diasValidezReserva: row.dias_validez_reserva,
    diasValidezTasacion: row.dias_validez_tasacion,
    correos: {
      cotizacion: row.correo_cotizacion,
      reserva: row.correo_reserva,
      tasacion: row.correo_tasacion,
      venta: row.correo_venta,
      consignacion: row.correo_consignacion,
      diasSeguimientoCotizacion: row.dias_seguimiento_cotizacion,
      diasAvisoCotizacion: row.dias_aviso_cotizacion,
      diasAvisoReserva: row.dias_aviso_reserva,
      diasAvisoTasacion: row.dias_aviso_tasacion,
    },
    financiamiento: {
      activo: row.financiamiento_activo,
      tasaMensual: tasa(row),
      pieMinimo: row.financiamiento_pie_minimo,
      plazoMaximo: row.financiamiento_plazo_maximo,
    },
    fechaRegistro: row.fecha_registro,
  };
}

// Campos configurables (para la auditoría): todo menos id, subdominio y fecha de registro.
const configuracion = (row: AutomotoraRow) => ({
  nombre: row.nombre,
  rut: row.rut,
  email: row.email,
  direccion: row.direccion,
  telefono: row.telefono,
  descripcion: row.descripcion,
  diasValidezCotizacion: row.dias_validez_cotizacion,
  diasValidezReserva: row.dias_validez_reserva,
  diasValidezTasacion: row.dias_validez_tasacion,
  correoCotizacion: row.correo_cotizacion,
  correoReserva: row.correo_reserva,
  correoTasacion: row.correo_tasacion,
  correoVenta: row.correo_venta,
  correoConsignacion: row.correo_consignacion,
  diasSeguimientoCotizacion: row.dias_seguimiento_cotizacion,
  diasAvisoCotizacion: row.dias_aviso_cotizacion,
  diasAvisoReserva: row.dias_aviso_reserva,
  diasAvisoTasacion: row.dias_aviso_tasacion,
  financiamientoActivo: row.financiamiento_activo,
  financiamientoTasaMensual: tasa(row),
  financiamientoPieMinimo: row.financiamiento_pie_minimo,
  financiamientoPlazoMaximo: row.financiamiento_plazo_maximo,
});

// Configuración de la automotora (Módulo 17). Cambiar la configuración es solo
// de ADMIN_GENERAL (controller); se audita a nivel de automotora (sucursal NULL).
@Injectable()
export class AutomotorasService {
  constructor(
    private readonly automotoras: AutomotorasRepository,
    private readonly auditoria: AuditoriaRepository,
    private readonly almacenamiento: AlmacenamientoService,
    private readonly tx: TransactionRunner,
  ) {}

  async obtenerPropia(usuario: UsuarioAutenticado) {
    const row = await this.automotoras.findById(usuario.automotoraId);
    if (!row) throw new NotFoundException('Automotora no encontrada');
    return toAutomotoraResponse(row);
  }

  async actualizar(dto: UpdateConfiguracionDto, usuario: UsuarioAutenticado) {
    let rut: string | undefined;
    if (dto.rut !== undefined) {
      if (!esRutValido(dto.rut))
        throw new BadRequestException('El RUT de la automotora no es válido');
      rut = normalizarRut(dto.rut);
    }
    const row = await this.tx.run(async (client) => {
      const actual = await this.bloquear(usuario, client);
      // El simulador de crédito no se activa sin una tasa (Módulo 17).
      const activo = dto.financiamientoActivo ?? actual.financiamiento_activo;
      const tasaFinal =
        dto.financiamientoTasaMensual !== undefined ? dto.financiamientoTasaMensual : tasa(actual);
      if (activo && tasaFinal === null)
        throw new BadRequestException(
          'Indica la tasa mensual para activar el simulador de crédito',
        );
      const actualizada = await this.automotoras.update(
        usuario.automotoraId,
        { ...dto, rut, descripcion: dto.descripcion === '' ? null : dto.descripcion },
        client,
      );
      await this.auditar(
        usuario,
        'CONFIGURACION_EDITADA',
        client,
        configuracion(actual),
        configuracion(actualizada),
      );
      return actualizada;
    });
    return toAutomotoraResponse(row);
  }

  // Logo y banner: imágenes públicas (se muestran en el perfil y el marketplace).
  async subirImagen(
    tipo: 'LOGO' | 'BANNER',
    archivo: { buffer: Buffer } | undefined,
    usuario: UsuarioAutenticado,
  ) {
    if (!archivo) throw new BadRequestException('Adjunta la imagen');
    // Logo: se muestra chico (hasta 512 px). Banner: ocupa el ancho del hero.
    const url = await this.almacenamiento.guardarFoto(
      this.almacenamiento.validarFoto(archivo.buffer),
      tipo === 'LOGO' ? 512 : 2400,
    );
    let anterior: string | null = null;
    try {
      await this.tx.run(async (client) => {
        const actual = await this.bloquear(usuario, client);
        anterior = tipo === 'LOGO' ? actual.logo_url : actual.banner_url;
        await this.automotoras.setImagen(usuario.automotoraId, tipo, url, client);
        await this.auditar(usuario, `${tipo}_ACTUALIZADO`, client, { url: anterior }, { url });
      });
    } catch (err) {
      await this.almacenamiento.eliminar(url);
      throw err;
    }
    if (anterior) await this.almacenamiento.eliminar(anterior);
    return this.obtenerPropia(usuario);
  }

  async quitarImagen(tipo: 'LOGO' | 'BANNER', usuario: UsuarioAutenticado) {
    let anterior: string | null = null;
    await this.tx.run(async (client) => {
      const actual = await this.bloquear(usuario, client);
      anterior = tipo === 'LOGO' ? actual.logo_url : actual.banner_url;
      if (!anterior) return;
      await this.automotoras.setImagen(usuario.automotoraId, tipo, null, client);
      await this.auditar(usuario, `${tipo}_ELIMINADO`, client, { url: anterior }, { url: null });
    });
    if (anterior) await this.almacenamiento.eliminar(anterior);
    return this.obtenerPropia(usuario);
  }

  private async bloquear(usuario: UsuarioAutenticado, client: PoolClient): Promise<AutomotoraRow> {
    const row = await this.automotoras.lockById(usuario.automotoraId, client);
    if (!row) throw new NotFoundException('Automotora no encontrada');
    return row;
  }

  private async auditar(
    usuario: UsuarioAutenticado,
    accion: string,
    client: PoolClient,
    anterior: Record<string, unknown>,
    nuevo: Record<string, unknown>,
  ) {
    await this.auditoria.registrar(
      {
        automotoraId: usuario.automotoraId,
        usuarioId: usuario.id,
        sucursalId: null,
        accion,
        entidadTipo: 'AUTOMOTORA',
        entidadId: usuario.automotoraId,
        valorAnterior: anterior,
        valorNuevo: nuevo,
      },
      client,
    );
  }
}
