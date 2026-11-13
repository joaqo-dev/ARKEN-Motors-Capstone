import { Inject, Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/components';
import type { ReactElement } from 'react';
import { Resend } from 'resend';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { ContactoVitrina, ContactoVitrinaProps } from './templates/contacto-vitrina';
import { InvitacionUsuario } from './templates/invitacion-usuario';
import { ResetPassword } from './templates/reset-password';
import { VerificacionEmail } from './templates/verificacion-email';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;
  }

  linkPanel(ruta: string, token: string): string {
    return `${this.config.APP_URL}${ruta}?token=${encodeURIComponent(token)}`;
  }

  async enviarVerificacionEmail(para: string, nombre: string, token: string) {
    const link = this.linkPanel('/verificar-email', token);
    await this.enviar(para, 'Verifica tu email', VerificacionEmail({ nombre, link }), link);
  }

  async enviarInvitacion(para: string, nombre: string, automotora: string, token: string) {
    const link = this.linkPanel('/aceptar-invitacion', token);
    await this.enviar(
      para,
      `Te invitaron a ${automotora}`,
      InvitacionUsuario({ nombre, automotora, link }),
      link,
    );
  }

  async enviarResetPassword(para: string, nombre: string, token: string) {
    const link = this.linkPanel('/restablecer-password', token);
    await this.enviar(para, 'Restablece tu contraseña', ResetPassword({ nombre, link }), link);
  }

  // Formulario de contacto del perfil público: llega al correo de la automotora
  // y se responde directo al visitante. Este sí lanza si falla, para avisarle
  // al visitante que su mensaje no llegó.
  async enviarContactoVitrina(para: string, datos: ContactoVitrinaProps): Promise<boolean> {
    const asunto = `Mensaje de ${datos.nombre} desde tu página`;
    if (!this.resend) {
      this.logger.warn(
        `[sin RESEND_API_KEY] Correo "${asunto}" a ${para} (responder a ${datos.email}): ${datos.mensaje}`,
      );
      return true;
    }
    try {
      const html = await render(ContactoVitrina(datos));
      const { error } = await this.resend.emails.send({
        from: this.config.EMAIL_FROM,
        to: para,
        replyTo: datos.email,
        subject: asunto,
        html,
      });
      if (error) throw new Error(error.message);
      return true;
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      this.logger.error(`No se pudo enviar "${asunto}" a ${para}: ${motivo}`);
      return false;
    }
  }

  // Correos a clientes de una automotora: remitente con su nombre y la
  // dirección de la plataforma; las respuestas van a la automotora. Lanza si el
  // proveedor lo rechaza: la bandeja de salida reintenta.
  async enviarAlCliente(correo: {
    automotora: string;
    responderA: string;
    para: string;
    asunto: string;
    plantilla: ReactElement;
    adjunto?: { nombre: string; contenido: Buffer };
  }): Promise<{ id: string | null }> {
    if (!this.resend) {
      this.logger.warn(
        `[sin RESEND_API_KEY] Correo "${correo.asunto}" a ${correo.para}` +
          ` (responder a ${correo.responderA})` +
          (correo.adjunto ? ` con ${correo.adjunto.nombre}` : ''),
      );
      return { id: null };
    }
    const html = await render(correo.plantilla);
    const { data, error } = await this.resend.emails.send({
      from: remitente(correo.automotora, this.config.EMAIL_FROM),
      to: correo.para,
      replyTo: correo.responderA,
      subject: correo.asunto,
      html,
      attachments: correo.adjunto
        ? [{ filename: correo.adjunto.nombre, content: correo.adjunto.contenido }]
        : undefined,
    });
    if (error) throw new Error(error.message);
    return { id: data?.id ?? null };
  }

  // Nunca lanza: el correo se envía después del COMMIT y su falla no debe
  // revertir la operación (el usuario puede pedir un reenvío).
  private async enviar(para: string, asunto: string, plantilla: ReactElement, link: string) {
    const esProduccion = this.config.NODE_ENV === 'production';

    if (!this.resend) {
      this.logger.warn(`[sin RESEND_API_KEY] Correo "${asunto}" a ${para}: ${link}`);
      return;
    }

    try {
      const html = await render(plantilla);
      const { error } = await this.resend.emails.send({
        from: this.config.EMAIL_FROM,
        to: para,
        subject: asunto,
        html,
      });
      if (error) throw new Error(error.message);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      // Fuera de producción se muestra el link para seguir probando (Resend en
      // modo prueba solo entrega al dueño de la cuenta).
      this.logger.error(
        `No se pudo enviar "${asunto}" a ${para}: ${motivo}` +
          (esProduccion ? '' : ` — link: ${link}`),
      );
    }
  }
}

// "Nombre <direccion>" con el nombre de la automotora y la dirección de EMAIL_FROM.
// Se quitan los caracteres que romperían el encabezado.
export function remitente(nombre: string, emailFrom: string): string {
  const direccion = /<([^>]+)>/.exec(emailFrom)?.[1] ?? emailFrom.trim();
  const limpio = nombre.replace(/["<>\r\n\\]/g, '').trim();
  return limpio ? `"${limpio}" <${direccion}>` : direccion;
}
