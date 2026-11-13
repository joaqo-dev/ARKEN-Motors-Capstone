import { CorreoConBoton } from './correo-con-boton';

export function InvitacionUsuario({
  nombre,
  automotora,
  link,
}: {
  nombre: string;
  automotora: string;
  link: string;
}) {
  return (
    <CorreoConBoton
      preview={`Te invitaron a ${automotora}`}
      titulo="Configura tu contraseña"
      nombre={nombre}
      parrafos={[
        `Te crearon una cuenta en el sistema de gestión de ${automotora}.`,
        'Define tu contraseña para empezar a usarla.',
      ]}
      textoBoton="Configurar contraseña"
      link={link}
      nota="Este enlace expira en 48 horas. Si expira, pide a tu administrador que reenvíe la invitación."
    />
  );
}
