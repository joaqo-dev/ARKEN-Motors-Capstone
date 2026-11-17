import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { igualesTiempoConstante } from '../../common/crypto';
import { hoyEnChile } from '../../common/fechas';
import { getScope } from '../../common/scope';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { TransactionRunner } from '../../db/transaction';
import { AuditoriaRepository } from '../auditoria/auditoria.repository';
import { DocumentosPdfService } from '../documentos-pdf/documentos-pdf.service';
import { EmailService } from '../email/email.service';
import { CorreoCliente } from '../email/templates/correo-cliente';
import {
  CorreoHistorialRow,
  CorreoRow,
  CorreosRepository,
  DocumentoCorreoRow,
  TipoDocumentoCorreo,
} from './correos.repository';
import {
  contenidoCorreo,
  motivoDescarte,
  primerNombre,
  telefonoSucursal,
  whatsappSucursal,
} from './reglas';

// Intentos antes de dar un correo por FALLIDO; entre uno y otro se espera
// 2, 4, 8 y 16 minutos.
export const MAX_INTENTOS = 5;
const LOTE = 10;

const NOMBRE_DOCUMENTO: Record<TipoDocumentoCorreo, string> = {
  COTIZACION: 'cotización',
  RESERVA: 'reserva',
  TASACION: 'tasación',
  VENTA: 'compra',
  CONSIGNACION: 'consignación',
};

const ARCHIVO: Record<TipoDocumentoCorreo, string> = {
  COTIZACION: 'cotizacion',
  RESERVA: 'reserva',
  TASACION: 'tasacion',
  VENTA: 'comprobante-venta',
  CONSIGNACION: 'consignacion',
};

export function toCorreoResponse(row: CorreoHistorialRow) {
  return {
    id: row.id,
    tipo: row.tipo,
    destinatario: row.destinatario,
    estado: row.estado,
    intentos: row.intentos,
    error: row.ultimo_error,
    fechaCreacion: row.fecha_creacion,
    fechaEnvio: row.fecha_envio,
    pedidoPor: row.usuario_nombre,
  };
}

// Correos al cliente (Módulo 18). Todo pasa por la bandeja de salida (tabla
// `correo`): el documento ya está guardado cuando se encola, y el envío ocurre
// aparte, con reintentos, sin revertir ni bloquear la operación.
@Injectable()
export class CorreosService {
  private readonly logger = new Logger(CorreosService.name);
  private procesando = false;

  constructor(
    private readonly correos: CorreosRepository,
    private readonly email: EmailService,
    private readonly pdf: DocumentosPdfService,
    private readonly auditoria: AuditoriaRepository,
    private readonly tx: TransactionRunner,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // Tras emitir un documento (después del COMMIT). `enviar` es la casilla del
  // formulario; si no viene, decide la configuración de la automotora. Nunca
  // lanza: un correo no debe hacer fallar la emisión.
  async alEmitir(
    tipo: TipoDocumentoCorreo,
    id: string,
    actor: UsuarioAutenticado,
    enviar?: boolean,
  ): Promise<void> {
    try {
      const d = await this.correos.documento(tipo, id);
      if (!d || !(enviar ?? d.envio_automatico)) return;
      await this.correos.encolar({
        automotoraId: d.automotora_id,
        documentoTipo: tipo,
        documentoId: id,
        tipo: 'DOCUMENTO',
        destinatario: d.cliente_email,
        claveEvento: `DOCUMENTO:${id}`,
        usuarioId: actor.id,
      });
      void this.procesarBandeja();
    } catch (err) {
      this.logger.error(`No se pudo encolar el correo de ${tipo} ${id}: ${(err as Error).message}`);
    }
  }

  async historial(tipo: TipoDocumentoCorreo, id: string, actor: UsuarioAutenticado) {
    await this.documentoConAcceso(tipo, id, actor);
    return (await this.correos.historial(tipo, id)).map(toCorreoResponse);
  }

  // Reenvío manual: al email actual del cliente, siempre con el PDF.
  async reenviar(tipo: TipoDocumentoCorreo, id: string, actor: UsuarioAutenticado) {
    const d = await this.documentoConAcceso(tipo, id, actor);
    const motivo = motivoDescarte('DOCUMENTO', d);
    if (motivo) throw new ConflictException(`No se puede reenviar: ${motivo.toLowerCase()}`);
    await this.tx.run(async (client) => {
      await this.correos.encolar(
        {
          automotoraId: d.automotora_id,
          documentoTipo: tipo,
          documentoId: id,
          tipo: 'DOCUMENTO',
          destinatario: d.cliente_email,
          claveEvento: null,
          usuarioId: actor.id,
        },
        client,
      );
      // Queda en la ficha del documento, con su sucursal congelada.
      await this.auditoria.registrar(
        {
          automotoraId: d.automotora_id,
          usuarioId: actor.id,
          sucursalId: d.scope_sucursal_id,
          accion: 'DOCUMENTO_REENVIADO',
          entidadTipo: tipo,
          entidadId: id,
          valorAnterior: null,
          valorNuevo: { destinatario: d.cliente_email },
        },
        client,
      );
    });
    await this.procesarBandeja();
    return this.historial(tipo, id, actor);
  }

  // Cron diario: encola los seguimientos y avisos que tocan hoy.
  async planificarRecordatorios(): Promise<void> {
    const hoy = hoyEnChile();
    try {
      const [seguimientos, cotizaciones, reservas, tasaciones] = [
        await this.correos.encolarSeguimientosCotizacion(hoy),
        await this.correos.encolarAvisosCotizacion(hoy),
        await this.correos.encolarAvisosReserva(hoy),
        await this.correos.encolarAvisosTasacion(hoy),
      ];
      const total = seguimientos + cotizaciones + reservas + tasaciones;
      if (total > 0) {
        this.logger.log(
          `Recordatorios encolados: ${seguimientos} seguimiento(s), ${cotizaciones} cotización(es), ` +
            `${reservas} reserva(s), ${tasaciones} tasación(es)`,
        );
      }
    } catch (err) {
      this.logger.error(`No se pudieron planificar los recordatorios: ${(err as Error).message}`);
    }
    await this.procesarBandeja();
  }

  // Envía lo pendiente. Una sola ejecución a la vez en este proceso; entre
  // procesos, tomarPendientes reparte sin repetir (SKIP LOCKED).
  async procesarBandeja(): Promise<void> {
    if (this.procesando) return;
    this.procesando = true;
    try {
      for (;;) {
        const lote = await this.correos.tomarPendientes(LOTE);
        for (const correo of lote) await this.enviar(correo);
        if (lote.length < LOTE) break;
      }
    } catch (err) {
      this.logger.error(`Error al procesar la bandeja de correos: ${(err as Error).message}`);
    } finally {
      this.procesando = false;
    }
  }

  private async enviar(c: CorreoRow): Promise<void> {
    try {
      const d = await this.correos.documento(c.documento_tipo, c.documento_id);
      if (!d) return this.correos.cerrar(c.id, 'DESCARTADO', 'El documento ya no existe');
      const motivo = motivoDescarte(c.tipo, d);
      if (motivo) return this.correos.cerrar(c.id, 'DESCARTADO', motivo);

      const contenido = contenidoCorreo(c.tipo, c.documento_tipo, d, hoyEnChile());
      const { ruta } = await this.pdf.ruta(c.documento_tipo, c.documento_id);
      const whatsapp = whatsappSucursal(d);
      const mensaje = `Hola, les escribo por la ${NOMBRE_DOCUMENTO[c.documento_tipo]} N° ${d.folio} (${d.vehiculo}).`;

      const { id } = await this.email.enviarAlCliente({
        automotora: d.automotora_nombre,
        responderA: d.automotora_email,
        para: c.destinatario,
        asunto: contenido.asunto,
        plantilla: CorreoCliente({
          automotora: d.automotora_nombre,
          nombre: primerNombre(d.cliente_nombre),
          titulo: contenido.titulo,
          parrafos: contenido.parrafos,
          resumen: contenido.resumen,
          adjunto: true,
          whatsappUrl: whatsapp
            ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensaje)}`
            : null,
          contacto: {
            sucursal: d.sucursal_nombre,
            direccion: `${d.sucursal_direccion}, ${d.sucursal_comuna}`,
            telefono: telefonoSucursal(d),
          },
          bajaUrl: contenido.permiteBaja ? this.urlBaja(d) : null,
        }),
        adjunto: {
          nombre: `${ARCHIVO[c.documento_tipo]}-${d.folio}.pdf`,
          contenido: await readFile(ruta),
        },
      });
      await this.correos.marcarEnviado(c.id, id);
    } catch (err) {
      const motivo = ((err as Error).message || 'Error desconocido').slice(0, 500);
      if (c.intentos >= MAX_INTENTOS) {
        this.logger.error(`Correo ${c.id} a ${c.destinatario} FALLIDO: ${motivo}`);
        await this.correos.cerrar(c.id, 'FALLIDO', motivo);
      } else {
        await this.correos.reprogramar(c.id, motivo, 2 ** c.intentos);
      }
    }
  }

  private async documentoConAcceso(
    tipo: TipoDocumentoCorreo,
    id: string,
    actor: UsuarioAutenticado,
  ): Promise<DocumentoCorreoRow> {
    const d = await this.correos.documento(tipo, id);
    const scope = getScope(actor);
    if (
      !d ||
      d.automotora_id !== scope.automotoraId ||
      (scope.sucursalId !== null && d.scope_sucursal_id !== scope.sucursalId)
    ) {
      throw new NotFoundException('Documento no encontrado');
    }
    return d;
  }

  // ---- Baja de recordatorios (enlace público del correo)

  tokenBaja(clienteId: string): string {
    return `${clienteId}.${this.firmar(clienteId)}`;
  }

  async estadoRecordatorios(token: string) {
    const clienteId = this.clienteDelToken(token);
    const cliente = await this.correos.cliente(clienteId);
    if (!cliente) throw new BadRequestException('El enlace no es válido');
    return {
      automotora: cliente.automotora,
      nombre: primerNombre(cliente.nombre),
      aceptaRecordatorios: cliente.acepta_recordatorios,
    };
  }

  async cambiarRecordatorios(token: string, acepta: boolean) {
    const clienteId = this.clienteDelToken(token);
    await this.correos.fijarRecordatorios(clienteId, acepta);
    return this.estadoRecordatorios(token);
  }

  private urlBaja(d: DocumentoCorreoRow): string {
    return `${this.config.SITIO_URL}/recordatorios?t=${encodeURIComponent(this.tokenBaja(d.cliente_id))}`;
  }

  private firmar(clienteId: string): string {
    return createHmac('sha256', this.config.JWT_SECRET)
      .update(`recordatorios:${clienteId}`)
      .digest('base64url');
  }

  private clienteDelToken(token: string): string {
    const [clienteId, firma] = token.split('.');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!clienteId || !firma || !uuid.test(clienteId)) {
      throw new BadRequestException('El enlace no es válido');
    }
    if (!igualesTiempoConstante(firma, this.firmar(clienteId))) {
      throw new BadRequestException('El enlace no es válido');
    }
    return clienteId;
  }
}
