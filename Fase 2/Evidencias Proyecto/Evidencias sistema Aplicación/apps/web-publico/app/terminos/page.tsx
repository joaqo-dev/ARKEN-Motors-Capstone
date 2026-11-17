import type { Metadata } from 'next';
import Link from 'next/link';
import { DocumentoLegal, Seccion } from '../../components/legal/documento-legal';
import { TITULAR } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Términos de uso',
  description: 'Condiciones de uso de Vitriauto para automotoras y visitantes.',
};

const SECCIONES = [
  { id: 'quienes', titulo: 'Quiénes somos' },
  { id: 'servicio', titulo: 'Qué es Vitriauto' },
  { id: 'cuentas', titulo: 'Cuentas y usuarios' },
  { id: 'publicaciones', titulo: 'Publicaciones y compraventas' },
  { id: 'datos-clientes', titulo: 'Datos de los clientes de la automotora' },
  { id: 'documentos', titulo: 'Documentos generados' },
  { id: 'uso', titulo: 'Uso aceptable' },
  { id: 'contenido', titulo: 'Contenido y propiedad intelectual' },
  { id: 'responsabilidad', titulo: 'Disponibilidad y responsabilidad' },
  { id: 'termino', titulo: 'Suspensión y término' },
  { id: 'cambios', titulo: 'Cambios a estos términos' },
  { id: 'ley', titulo: 'Ley aplicable y contacto' },
];

export default function Terminos() {
  return (
    <DocumentoLegal
      titulo="Términos de uso"
      bajada="Las reglas para usar Vitriauto: el panel de gestión de las automotoras, sus vitrinas y el marketplace de vehículos."
      secciones={SECCIONES}
    >
      <Seccion id="quienes" titulo="1. Quiénes somos">
        <p>
          Vitriauto es un servicio de {TITULAR.razonSocial}, RUT {TITULAR.rut}, con domicilio en{' '}
          {TITULAR.domicilio} (en adelante, «Vitriauto»).
        </p>
        <p>
          Estos términos se aplican a dos tipos de personas: las <strong>automotoras</strong> que se
          registran y sus usuarios (quienes usan el panel de gestión), y los{' '}
          <strong>visitantes</strong> que navegan el marketplace o la vitrina de una automotora. Al
          registrar una automotora, quien la registra declara tener facultades para obligarla y
          acepta estos términos en su nombre. Al navegar el sitio, el visitante acepta las reglas
          que le corresponden.
        </p>
      </Seccion>

      <Seccion id="servicio" titulo="2. Qué es Vitriauto">
        <p>Vitriauto es una plataforma de software que ofrece:</p>
        <ul>
          <li>
            Un <strong>panel de gestión</strong> para que cada automotora administre su inventario,
            clientes, documentos comerciales, gastos, consignaciones y ventas en una o varias
            sucursales.
          </li>
          <li>
            Una <strong>vitrina</strong> pública con subdominio propio, donde se muestran los
            vehículos que la automotora publica.
          </li>
          <li>
            Un <strong>marketplace</strong> de acceso libre que reúne los vehículos publicados por
            todas las automotoras.
          </li>
        </ul>
        <p>
          Vitriauto <strong>no compra, no vende, no intermedia ni financia</strong> vehículos, y no
          es parte de los negocios entre una automotora y sus clientes. El simulador de crédito
          entrega solo una referencia: no es una oferta de financiamiento.
        </p>
      </Seccion>

      <Seccion id="cuentas" titulo="3. Cuentas y usuarios">
        <ul>
          <li>
            Los datos del registro (razón social, RUT, dirección, contacto) deben ser verdaderos y
            mantenerse al día.
          </li>
          <li>
            La automotora decide quién usa su cuenta: invita a sus usuarios, les asigna un rol
            (Admin General, Admin de Sucursal o Vendedor) y responde por lo que hacen en el sistema.
          </li>
          <li>
            Cada usuario es responsable de su contraseña. Si sospechas que alguien entró a tu
            cuenta, cambia la contraseña y avísanos.
          </li>
          <li>
            Las acciones dentro del panel quedan registradas en una auditoría que no se puede
            modificar, junto con un registro de los accesos. Esto protege a la automotora y a sus
            clientes.
          </li>
        </ul>
      </Seccion>

      <Seccion id="publicaciones" titulo="4. Publicaciones y compraventas">
        <ul>
          <li>
            Cada automotora es la <strong>única responsable</strong> de lo que publica: precio,
            kilometraje, estado, fotos, documentos e inspecciones. Debe ser información veraz y
            actualizada, y los vehículos deben estar disponibles para la venta.
          </li>
          <li>
            Las condiciones de cada compraventa (precio final, garantías, entrega, transferencia) se
            acuerdan directamente entre la automotora y su cliente. Las obligaciones de la Ley N°
            19.496 sobre Protección de los Derechos de los Consumidores corresponden a quien vende.
          </li>
          <li>
            Vitriauto puede retirar u ocultar una publicación que sea falsa, engañosa, ilegal o que
            afecte derechos de terceros, y avisará a la automotora.
          </li>
        </ul>
      </Seccion>

      <Seccion id="datos-clientes" titulo="5. Datos de los clientes de la automotora">
        <p>
          La automotora registra en Vitriauto datos personales de sus clientes (nombre, RUT,
          teléfono, correo, dirección). Respecto de esos datos:
        </p>
        <ul>
          <li>
            La automotora es la <strong>responsable</strong> del tratamiento: decide para qué los
            usa y debe contar con una base legal para hacerlo (por ejemplo, el contrato con su
            cliente o su consentimiento), conforme a la Ley N° 19.628 y a la Ley N° 21.719.
          </li>
          <li>
            Vitriauto actúa como <strong>encargado</strong>: trata esos datos solo para prestar el
            servicio a la automotora, siguiendo sus instrucciones, con medidas de seguridad y sin
            usarlos para fines propios ni venderlos.
          </li>
          <li>
            Si un cliente pide acceder, corregir o eliminar sus datos, la automotora le responde.
            Vitriauto la ayudará con lo que esté a su alcance.
          </li>
        </ul>
        <p>
          Más detalle en la <Link href="/privacidad">Política de privacidad</Link>.
        </p>
      </Seccion>

      <Seccion id="documentos" titulo="6. Documentos generados">
        <p>
          Las cotizaciones, reservas, tasaciones, consignaciones y comprobantes de venta que se
          generan en Vitriauto son documentos comerciales de la automotora, con sus datos y bajo su
          responsabilidad. <strong>No son documentos tributarios</strong> (boletas o facturas): la
          emisión de esos documentos ante el Servicio de Impuestos Internos sigue siendo obligación
          de la automotora.
        </p>
      </Seccion>

      <Seccion id="uso" titulo="7. Uso aceptable">
        <p>No está permitido:</p>
        <ul>
          <li>Publicar vehículos inexistentes, robados o con información falsa.</li>
          <li>Usar los datos de contacto del sitio para enviar publicidad no solicitada.</li>
          <li>
            Copiar de forma masiva el contenido del sitio con programas automáticos, intentar
            acceder a cuentas o datos ajenos, o afectar el funcionamiento del servicio.
          </li>
          <li>Usar Vitriauto para actividades ilegales.</li>
        </ul>
      </Seccion>

      <Seccion id="contenido" titulo="8. Contenido y propiedad intelectual">
        <p>
          El software, el diseño y la marca Vitriauto pertenecen a su titular. Las fotos,
          descripciones, logos y demás contenido que sube cada automotora siguen siendo suyos; la
          automotora autoriza a Vitriauto a mostrarlos en su vitrina y en el marketplace mientras
          estén publicados, y declara tener derecho a usarlos.
        </p>
      </Seccion>

      <Seccion id="responsabilidad" titulo="9. Disponibilidad y responsabilidad">
        <ul>
          <li>
            Trabajamos para que Vitriauto esté disponible y sin errores, pero puede haber
            interrupciones por mantención o fallas. Avisaremos con anticipación las mantenciones
            programadas cuando sea posible.
          </li>
          <li>
            Vitriauto no responde por la veracidad de las publicaciones ni por el resultado de los
            negocios entre automotoras y clientes.
          </li>
          <li>
            En lo que la ley permita, la responsabilidad de Vitriauto se limita a los daños directos
            causados por su culpa o dolo en la prestación del servicio.
          </li>
        </ul>
      </Seccion>

      <Seccion id="termino" titulo="10. Suspensión y término">
        <p>
          La automotora puede dejar de usar Vitriauto cuando quiera y pedir una copia de sus datos
          antes de cerrar su cuenta. Vitriauto puede suspender o cerrar una cuenta que incumpla
          gravemente estos términos, avisando a la automotora salvo que la urgencia o la ley lo
          impidan. Las condiciones comerciales (planes y precios), si las hay, se informan por
          separado antes de cobrarse.
        </p>
      </Seccion>

      <Seccion id="cambios" titulo="11. Cambios a estos términos">
        <p>
          Si cambiamos estos términos de forma relevante, lo avisaremos con anticipación dentro del
          panel y por correo, y podremos pedir que se acepten de nuevo. La fecha de vigencia está al
          inicio de esta página.
        </p>
      </Seccion>

      <Seccion id="ley" titulo="12. Ley aplicable y contacto">
        <p>
          Estos términos se rigen por las leyes de la República de Chile. Cualquier controversia se
          someterá a los tribunales ordinarios de justicia de {TITULAR.ciudad}, sin perjuicio de los
          derechos que la ley reconoce a los consumidores.
        </p>
        <p>Para consultas sobre estos términos, escríbenos a {TITULAR.correo}.</p>
      </Seccion>
    </DocumentoLegal>
  );
}
