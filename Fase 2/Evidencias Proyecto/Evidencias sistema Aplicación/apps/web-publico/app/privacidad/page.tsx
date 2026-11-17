import type { Metadata } from 'next';
import Link from 'next/link';
import { DocumentoLegal, Seccion } from '../../components/legal/documento-legal';
import { TITULAR } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Cómo Vitriauto trata los datos personales de automotoras, sus clientes y visitantes.',
};

const SECCIONES = [
  { id: 'responsable', titulo: 'Quién trata tus datos' },
  { id: 'datos', titulo: 'Qué datos tratamos' },
  { id: 'finalidades', titulo: 'Para qué y con qué base legal' },
  { id: 'comparte', titulo: 'Con quién se comparten' },
  { id: 'conservacion', titulo: 'Cuánto tiempo se guardan' },
  { id: 'seguridad', titulo: 'Seguridad' },
  { id: 'derechos', titulo: 'Tus derechos' },
  { id: 'cookies', titulo: 'Cookies' },
  { id: 'otros', titulo: 'Menores, incidentes y cambios' },
];

export default function Privacidad() {
  return (
    <DocumentoLegal
      titulo="Política de privacidad"
      bajada="Qué datos personales se tratan en Vitriauto, para qué, quién responde por ellos y cómo ejercer tus derechos, conforme a la Ley N° 19.628 y a la Ley N° 21.719 sobre protección de datos personales."
      secciones={SECCIONES}
    >
      <Seccion id="responsable" titulo="1. Quién trata tus datos">
        <p>Depende de quién seas, porque en Vitriauto conviven tres situaciones distintas:</p>
        <ul>
          <li>
            <strong>Si usas el panel de una automotora</strong> (dueño, administrador o vendedor), o
            si <strong>visitas el sitio</strong>: el responsable es {TITULAR.razonSocial}, RUT{' '}
            {TITULAR.rut}, domicilio en {TITULAR.domicilio} («Vitriauto»). Contacto:{' '}
            {TITULAR.correo}.
          </li>
          <li>
            <strong>Si eres cliente de una automotora</strong> (cotizaste, reservaste, compraste,
            consignaste o tasaste un vehículo): el responsable de tus datos es{' '}
            <strong>esa automotora</strong>. Vitriauto solo los guarda y procesa por encargo suyo,
            para darle el servicio, como establecen los{' '}
            <Link href="/terminos#datos-clientes">Términos de uso</Link>.
          </li>
          <li>
            <strong>Si escribes por el formulario de una vitrina</strong>: tu mensaje se envía por
            correo a esa automotora, que pasa a ser responsable de responderte. Vitriauto no guarda
            el mensaje.
          </li>
        </ul>
      </Seccion>

      <Seccion id="datos" titulo="2. Qué datos tratamos">
        <h3>Usuarios del panel</h3>
        <ul>
          <li>Nombre, correo, rol, sucursal y contraseña (guardada cifrada, nunca en texto).</li>
          <li>
            Registro de accesos: fecha, resultado del inicio de sesión, dirección IP y navegador.
          </li>
          <li>Auditoría de las acciones hechas en el sistema (qué se cambió, quién y cuándo).</li>
        </ul>
        <h3>Datos de la automotora</h3>
        <ul>
          <li>Razón social, RUT, direcciones, teléfonos, correos, logo y sucursales.</li>
        </ul>
        <h3>Clientes de cada automotora</h3>
        <ul>
          <li>Nombre, RUT, teléfono, correo y dirección.</li>
          <li>
            Sus operaciones con la automotora: cotizaciones, reservas, tasaciones, consignaciones,
            ventas y los correos enviados con esos documentos.
          </li>
          <li>Si acepta o no recibir recordatorios de seguimiento.</li>
        </ul>
        <h3>Visitantes del sitio</h3>
        <ul>
          <li>
            No pedimos registrarse para ver vehículos. Solo tratamos los datos técnicos necesarios
            para servir las páginas y proteger el sitio (como la dirección IP, para limitar abusos)
            y lo que escribas en un formulario de contacto.
          </li>
        </ul>
      </Seccion>

      <Seccion id="finalidades" titulo="3. Para qué y con qué base legal">
        <ul>
          <li>
            <strong>Prestar el servicio</strong> a la automotora y a sus usuarios (cuentas,
            inventario, documentos, correos a clientes): ejecución del contrato que aceptas al
            registrarte.
          </li>
          <li>
            <strong>Seguridad y trazabilidad</strong> (registro de accesos, auditoría, límites de
            uso): interés legítimo en proteger las cuentas y los datos, y prevenir fraudes.
          </li>
          <li>
            <strong>Recordatorios de seguimiento</strong> a clientes de una automotora: los envía la
            automotora; cada correo trae un enlace para dejar de recibirlos.
          </li>
          <li>
            <strong>Cumplir obligaciones legales</strong> y responder requerimientos de autoridad.
          </li>
        </ul>
        <p>
          No vendemos datos personales, no los usamos para publicidad y no tomamos decisiones
          automatizadas que te afecten.
        </p>
      </Seccion>

      <Seccion id="comparte" titulo="4. Con quién se comparten">
        <ul>
          <li>
            <strong>La automotora</strong> que corresponde: ve los datos de sus propios clientes y
            de sus usuarios. Una automotora nunca ve los datos de otra.
          </li>
          <li>
            <strong>Proveedores que nos ayudan a operar</strong>, solo en lo necesario y bajo
            obligación de confidencialidad: servidores (Hetzner), red y DNS (Cloudflare) y envío de
            correos (Resend). Algunos procesan datos fuera de Chile; en ese caso exigimos garantías
            adecuadas de protección, como establece la ley.
          </li>
          <li>
            <strong>Autoridades</strong>, cuando lo exija la ley o una orden judicial.
          </li>
        </ul>
        <p>
          Lo que una automotora publica en su vitrina y en el marketplace (vehículos, fotos,
          sucursales, teléfonos de contacto) es público por decisión suya. Los datos de sus clientes
          nunca se publican.
        </p>
      </Seccion>

      <Seccion id="conservacion" titulo="5. Cuánto tiempo se guardan">
        <ul>
          <li>Datos de la cuenta: mientras la automotora use Vitriauto.</li>
          <li>
            Documentos y operaciones comerciales, auditoría y registro de accesos: por el tiempo
            necesario para cumplir obligaciones legales y resolver eventuales reclamos.
          </li>
          <li>
            Al cerrar una cuenta, eliminamos o anonimizamos los datos cuando ya no exista una
            obligación legal de conservarlos.
          </li>
        </ul>
      </Seccion>

      <Seccion id="seguridad" titulo="6. Seguridad">
        <ul>
          <li>Conexión cifrada (HTTPS) y contraseñas guardadas con cifrado de una vía.</li>
          <li>
            Cada usuario ve solo lo que su rol permite (por ejemplo, un vendedor no ve costos y solo
            trabaja con su sucursal), y cada automotora solo ve lo suyo.
          </li>
          <li>
            Los documentos legales de los vehículos y las boletas de gastos son privados: solo se
            descargan con sesión iniciada.
          </li>
          <li>Auditoría inmutable de las acciones y registro de accesos.</li>
        </ul>
      </Seccion>

      <Seccion id="derechos" titulo="7. Tus derechos">
        <p>Puedes pedir, en cualquier momento y sin costo:</p>
        <ul>
          <li>
            <strong>Acceso</strong>: saber qué datos tuyos tratamos.
          </li>
          <li>
            <strong>Rectificación</strong>: corregir datos inexactos o incompletos.
          </li>
          <li>
            <strong>Supresión</strong>: que se eliminen, cuando no haya razón legal para
            conservarlos.
          </li>
          <li>
            <strong>Oposición</strong> y <strong>bloqueo</strong> temporal del tratamiento.
          </li>
          <li>
            <strong>Portabilidad</strong>: recibir tus datos en un formato de uso común.
          </li>
        </ul>
        <p>
          <strong>Si eres cliente de una automotora</strong>, dirígete primero a ella (es la
          responsable). <strong>En los demás casos</strong>, escríbenos a {TITULAR.correo} indicando
          qué pides y cómo identificarte. Respondemos dentro de los plazos legales (30 días
          corridos, prorrogables una vez por igual período). Si no quedas conforme, puedes reclamar
          ante la Agencia de Protección de Datos Personales.
        </p>
      </Seccion>

      <Seccion id="cookies" titulo="8. Cookies">
        <p>
          El panel de gestión usa solo cookies necesarias para mantener tu sesión iniciada y
          protegerla. El sitio público no usa cookies de publicidad ni de analítica de terceros.
        </p>
      </Seccion>

      <Seccion id="otros" titulo="9. Menores, incidentes y cambios">
        <ul>
          <li>Vitriauto no está dirigido a menores de edad.</li>
          <li>
            Si ocurre un incidente de seguridad que afecte datos personales, lo notificaremos a la
            autoridad y a las personas afectadas cuando la ley lo exija, y a las automotoras cuyos
            datos se vean involucrados.
          </li>
          <li>
            Si cambiamos esta política de forma relevante, lo avisaremos con anticipación. La fecha
            de vigencia está al inicio de esta página.
          </li>
        </ul>
      </Seccion>
    </DocumentoLegal>
  );
}
