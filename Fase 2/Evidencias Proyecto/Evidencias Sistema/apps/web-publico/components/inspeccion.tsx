import { ShieldCheck } from 'lucide-react';
import type { InspeccionPublica } from '../lib/api';

const RESULTADO: Record<InspeccionPublica['resultado'], string> = {
  APROBADO: 'Aprobada',
  APROBADO_CON_OBSERVACIONES: 'Aprobada con observaciones',
};

const fecha = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long' }).format(
    new Date(iso),
  );
const miles = new Intl.NumberFormat('es-CL');

// Sello de inspección pre-compra (solo si quedó aprobada, Módulo 7.11): al público
// se le informa que el vehículo fue inspeccionado y con qué resultado. El detalle
// punto por punto queda en el panel de la automotora.
export function Inspeccion({ inspeccion: i }: { inspeccion: InspeccionPublica }) {
  return (
    <section className="panel inspeccion" aria-labelledby="titulo-inspeccion">
      <div className="inspeccion-cabecera">
        <span className="inspeccion-sello ok" aria-hidden>
          <ShieldCheck className="icono" />
        </span>
        <div>
          <h2 id="titulo-inspeccion">
            Inspección pre-compra {RESULTADO[i.resultado].toLowerCase()}
          </h2>
          <p>
            Este vehículo fue inspeccionado por la automotora el {fecha(i.fecha)}, con{' '}
            <span className="num">{miles.format(i.kilometraje)} km</span>.
            {i.resultado === 'APROBADO_CON_OBSERVACIONES' &&
              ' Pide el detalle de las observaciones al contactar a la automotora.'}
          </p>
        </div>
      </div>
    </section>
  );
}
