import type { Metadata } from 'next';
import { Cabecera } from '../../components/cabecera';
import { Pie } from '../../components/pie';
import { config } from '../../lib/config';
import { cambiarRecordatorios } from './acciones';

export const metadata: Metadata = {
  title: 'Recordatorios por correo',
  robots: { index: false },
};

interface Estado {
  automotora: string;
  nombre: string;
  aceptaRecordatorios: boolean;
}

async function estado(token: string): Promise<Estado | null> {
  if (!token) return null;
  const res = await fetch(`${config.apiUrl}/publico/recordatorios?t=${encodeURIComponent(token)}`, {
    cache: 'no-store',
  }).catch(() => null);
  return res?.ok ? ((await res.json()) as Estado) : null;
}

// Enlace "No quiero recibir más recordatorios" de los correos de seguimiento.
// Abrir la página no cambia nada (los filtros de correo abren los enlaces): la
// baja se confirma con el botón.
export default async function RecordatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; listo?: string }>;
}) {
  const { t = '', listo } = await searchParams;
  const e = await estado(t);

  return (
    <div className="mk vt mk-mercado">
      <Cabecera />
      <main className="contenedor recordatorios">
        {!e ? (
          <div className="vacio">
            <h1>Este enlace no es válido</h1>
            <p>Revisa que lo hayas copiado completo desde el correo.</p>
          </div>
        ) : (
          <section className="recordatorios-tarjeta" aria-live="polite">
            <p className="recordatorios-automotora">{e.automotora}</p>
            {e.aceptaRecordatorios ? (
              <>
                <h1>¿Dejar de recibir recordatorios?</h1>
                <p>
                  Hola {e.nombre}. Si confirmas, {e.automotora} no te enviará más seguimientos ni
                  avisos de vencimiento de cotizaciones y tasaciones.
                </p>
                <p className="recordatorios-nota">
                  Igual recibirás los documentos que pidas (cotizaciones, comprobantes) y el aviso
                  de una reserva tuya por vencer.
                </p>
              </>
            ) : (
              <>
                <h1>
                  {listo === 'baja'
                    ? 'Listo, no te enviaremos más recordatorios'
                    : 'No recibes recordatorios'}
                </h1>
                <p>
                  {e.automotora} no te enviará seguimientos ni avisos de vencimiento. Si cambias de
                  opinión, puedes volver a activarlos.
                </p>
              </>
            )}
            {listo === 'activado' && e.aceptaRecordatorios && (
              <p className="recordatorios-ok">Listo, volverás a recibir recordatorios.</p>
            )}
            {listo === 'error' && (
              <p className="recordatorios-error">
                No pudimos guardar el cambio. Intenta de nuevo en unos segundos.
              </p>
            )}
            <form action={cambiarRecordatorios}>
              <input type="hidden" name="token" value={t} />
              <input type="hidden" name="acepta" value={e.aceptaRecordatorios ? 'no' : 'si'} />
              <button
                type="submit"
                className={e.aceptaRecordatorios ? 'boton' : 'boton boton-contorno'}
              >
                {e.aceptaRecordatorios ? 'Sí, no quiero recibirlos' : 'Volver a recibirlos'}
              </button>
            </form>
          </section>
        )}
      </main>
      <Pie />
    </div>
  );
}
