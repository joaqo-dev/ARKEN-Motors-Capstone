import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface CorreoClienteProps {
  automotora: string;
  nombre: string; // primer nombre del cliente
  titulo: string;
  parrafos: string[];
  resumen: { etiqueta: string; valor: string }[];
  adjunto: boolean;
  whatsappUrl: string | null;
  contacto: { sucursal: string; direccion: string; telefono: string };
  bajaUrl: string | null;
}

const tinta = '#18181b';
const secundario = '#52525b';
const tenue = '#71717a';
const borde = '#e4e4e7';

// Correo de una automotora a su cliente (Módulo 18): documento emitido,
// seguimiento o recordatorio. Responder el correo le escribe a la automotora.
export function CorreoCliente({
  automotora,
  nombre,
  titulo,
  parrafos,
  resumen,
  adjunto,
  whatsappUrl,
  contacto,
  bajaUrl,
}: CorreoClienteProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{parrafos[0] ?? titulo}</Preview>
      <Body
        style={{
          backgroundColor: '#f4f4f5',
          fontFamily: 'Helvetica, Arial, sans-serif',
          margin: 0,
          padding: '24px 12px',
        }}
      >
        <Container style={{ maxWidth: '540px', margin: '0 auto' }}>
          <Text
            style={{
              color: tinta,
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              margin: '0 0 14px 4px',
            }}
          >
            {automotora}
          </Text>
          <Section style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '32px' }}>
            <Text
              style={{
                color: tinta,
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: '1.25',
                margin: '0 0 18px',
              }}
            >
              {titulo}
            </Text>
            <Text style={{ color: tinta, fontSize: '15px', lineHeight: '1.6', margin: '0 0 12px' }}>
              Hola {nombre},
            </Text>
            {parrafos.map((p) => (
              <Text
                key={p}
                style={{
                  color: secundario,
                  fontSize: '15px',
                  lineHeight: '1.6',
                  margin: '0 0 12px',
                }}
              >
                {p}
              </Text>
            ))}

            {resumen.length > 0 && (
              <Section
                style={{
                  border: `1px solid ${borde}`,
                  borderRadius: '10px',
                  padding: '6px 18px',
                  margin: '20px 0 4px',
                }}
              >
                {resumen.map((r, i) => (
                  <table
                    key={r.etiqueta}
                    width="100%"
                    cellPadding={0}
                    cellSpacing={0}
                    role="presentation"
                    style={{ borderTop: i === 0 ? 'none' : `1px solid ${borde}` }}
                  >
                    <tbody>
                      <tr>
                        <td style={{ color: tenue, fontSize: '13px', padding: '11px 0' }}>
                          {r.etiqueta}
                        </td>
                        <td
                          align="right"
                          style={{
                            color: tinta,
                            fontSize: '14px',
                            fontWeight: 600,
                            padding: '11px 0',
                          }}
                        >
                          {r.valor}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ))}
              </Section>
            )}
            {adjunto && (
              <Text style={{ color: tenue, fontSize: '13px', margin: '10px 0 0' }}>
                El documento va adjunto en PDF.
              </Text>
            )}

            {whatsappUrl && (
              <Section style={{ margin: '26px 0 6px' }}>
                <Button
                  href={whatsappUrl}
                  style={{
                    backgroundColor: tinta,
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: 600,
                    padding: '13px 22px',
                  }}
                >
                  Escribir por WhatsApp
                </Button>
              </Section>
            )}

            <Hr style={{ borderColor: borde, margin: '26px 0 18px' }} />
            <Text style={{ color: tinta, fontSize: '14px', fontWeight: 600, margin: '0 0 2px' }}>
              {automotora} · {contacto.sucursal}
            </Text>
            <Text style={{ color: secundario, fontSize: '13px', lineHeight: '1.6', margin: 0 }}>
              {contacto.direccion}
              <br />
              {contacto.telefono}
            </Text>
            <Text style={{ color: tenue, fontSize: '13px', lineHeight: '1.6', margin: '14px 0 0' }}>
              ¿Tienes dudas? Responde este correo y te contestamos.
            </Text>
          </Section>

          {bajaUrl && (
            <Text
              style={{
                color: tenue,
                fontSize: '12px',
                lineHeight: '1.6',
                margin: '16px 4px 0',
                textAlign: 'center',
              }}
            >
              Recibes este recordatorio porque {automotora} te envió una cotización o tasación.{' '}
              <Link href={bajaUrl} style={{ color: tenue, textDecoration: 'underline' }}>
                No quiero recibir más recordatorios
              </Link>
            </Text>
          )}
        </Container>
      </Body>
    </Html>
  );
}
