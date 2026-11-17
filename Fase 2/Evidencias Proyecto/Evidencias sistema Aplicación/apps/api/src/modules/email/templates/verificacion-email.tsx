import { CorreoConBoton } from './correo-con-boton';

export function VerificacionEmail({ nombre, link }: { nombre: string; link: string }) {
  return (
    <CorreoConBoton
      preview="Verifica tu email para activar tu cuenta"
      titulo="Verifica tu email"
      nombre={nombre}
      parrafos={[
        'Gracias por registrar tu automotora. Confirma tu email para poder iniciar sesión.',
      ]}
      textoBoton="Verificar email"
      link={link}
      nota="Este enlace expira en 24 horas. Si no creaste esta cuenta, ignora este correo."
    />
  );
}
