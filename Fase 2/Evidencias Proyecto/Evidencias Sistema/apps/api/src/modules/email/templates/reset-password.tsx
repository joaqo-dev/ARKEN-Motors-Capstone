import { CorreoConBoton } from './correo-con-boton';

export function ResetPassword({ nombre, link }: { nombre: string; link: string }) {
  return (
    <CorreoConBoton
      preview="Restablece tu contraseña"
      titulo="Restablece tu contraseña"
      nombre={nombre}
      parrafos={['Recibimos una solicitud para restablecer tu contraseña.']}
      textoBoton="Restablecer contraseña"
      link={link}
      nota="Este enlace expira en 1 hora. Si no lo solicitaste, ignora este correo: tu contraseña no cambiará."
    />
  );
}
