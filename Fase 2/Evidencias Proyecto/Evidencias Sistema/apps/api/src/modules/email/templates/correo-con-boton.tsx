import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components';

// Patrón común de las 3 plantillas: saludo, párrafos y un botón con el link.
export interface CorreoConBotonProps {
  preview: string;
  titulo: string;
  nombre: string;
  parrafos: string[];
  textoBoton: string;
  link: string;
  nota: string;
}

export function CorreoConBoton({
  preview,
  titulo,
  nombre,
  parrafos,
  textoBoton,
  link,
  nota,
}: CorreoConBotonProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#f4f4f5', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            padding: '32px',
            margin: '32px auto',
            maxWidth: '520px',
          }}
        >
          <Heading as="h1" style={{ fontSize: '22px', color: '#18181b' }}>
            {titulo}
          </Heading>
          <Text>Hola {nombre},</Text>
          {parrafos.map((p) => (
            <Text key={p}>{p}</Text>
          ))}
          <Button
            href={link}
            style={{
              backgroundColor: '#18181b',
              color: '#ffffff',
              padding: '12px 20px',
              borderRadius: '6px',
              fontWeight: 600,
            }}
          >
            {textoBoton}
          </Button>
          <Text style={{ color: '#71717a', fontSize: '13px', marginTop: '24px' }}>{nota}</Text>
          <Text style={{ color: '#71717a', fontSize: '12px', wordBreak: 'break-all' }}>
            Si el botón no funciona, copia este enlace en tu navegador: {link}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
