import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from '@react-email/components';

export interface ContactoVitrinaProps {
  automotora: string;
  nombre: string;
  email: string;
  telefono: string | null;
  sucursal: string | null;
  mensaje: string;
}

const etiqueta = { color: '#71717a', fontSize: '12px', margin: '0' };
const valor = { color: '#18181b', fontSize: '15px', margin: '2px 0 14px' };

// Mensaje enviado desde el formulario de contacto del perfil público.
// Responder el correo le escribe directo al visitante (reply-to).
export function ContactoVitrina({
  automotora,
  nombre,
  email,
  telefono,
  sucursal,
  mensaje,
}: ContactoVitrinaProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{`${nombre} te escribió desde la página de ${automotora}`}</Preview>
      <Body style={{ backgroundColor: '#f4f4f5', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            padding: '32px',
            margin: '32px auto',
            maxWidth: '520px',
          }}
        >
          <Heading as="h1" style={{ fontSize: '22px', color: '#18181b', margin: '0 0 6px' }}>
            Nuevo mensaje de contacto
          </Heading>
          <Text style={{ color: '#52525b', margin: '0 0 24px' }}>
            Llegó desde la página pública de {automotora}. Responde este correo para escribirle
            directamente.
          </Text>
          <Text style={etiqueta}>Nombre</Text>
          <Text style={valor}>{nombre}</Text>
          <Text style={etiqueta}>Correo</Text>
          <Text style={valor}>{email}</Text>
          {telefono && (
            <>
              <Text style={etiqueta}>Teléfono</Text>
              <Text style={valor}>{telefono}</Text>
            </>
          )}
          {sucursal && (
            <>
              <Text style={etiqueta}>Sucursal de interés</Text>
              <Text style={valor}>{sucursal}</Text>
            </>
          )}
          <Hr style={{ borderColor: '#e4e4e7', margin: '8px 0 20px' }} />
          <Text style={{ ...valor, whiteSpace: 'pre-line', lineHeight: '1.6' }}>{mensaje}</Text>
        </Container>
      </Body>
    </Html>
  );
}
