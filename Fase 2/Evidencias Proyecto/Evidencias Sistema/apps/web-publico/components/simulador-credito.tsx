'use client';

import {
  PIE_MAXIMO_CREDITO,
  PLAZO_INICIAL_CREDITO,
  plazosHasta,
  simularCredito,
} from '@vitriauto/shared-types';
import { MessageCircle } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { precio } from '../lib/formato';

export interface Financiamiento {
  tasaMensual: number; // % mensual
  pieMinimo: number; // % del precio
  plazoMaximo: number; // meses
}

type Eleccion = { pie: number; plazo: number } | null;

// La simulación que el comprador eligió, para sumarla al mensaje de WhatsApp.
// Mientras no toque el simulador es null: el mensaje no habla de crédito.
const Contexto = createContext<{ eleccion: Eleccion; elegir: (e: Eleccion) => void }>({
  eleccion: null,
  elegir: () => {},
});

export function ProveedorSimulacion({ children }: { children: ReactNode }) {
  const [eleccion, elegir] = useState<Eleccion>(null);
  return <Contexto.Provider value={{ eleccion, elegir }}>{children}</Contexto.Provider>;
}

// Botón de WhatsApp: el enlace prearmado por la API, más la simulación si la hay.
export function BotonWhatsapp({ href, children }: { href: string; children: ReactNode }) {
  const { eleccion } = useContext(Contexto);
  let destino = href;
  if (eleccion) {
    const url = new URL(href);
    url.searchParams.set(
      'text',
      `${url.searchParams.get('text') ?? ''} Lo simulé con un pie de ${precio(eleccion.pie)} en ${eleccion.plazo} cuotas.`.trim(),
    );
    destino = url.toString();
  }
  return (
    <a className="boton-whatsapp" href={destino} target="_blank" rel="noopener noreferrer">
      <MessageCircle className="icono" aria-hidden />
      {children}
    </a>
  );
}

// Barra fija de contacto en teléfonos: se oculta mientras los botones de
// contacto del panel están a la vista, para no mostrar dos WhatsApp juntos.
export function BarraContactoMovil({ children }: { children: ReactNode }) {
  const barra = useRef<HTMLDivElement>(null);
  const [oculta, setOculta] = useState(false);
  useEffect(() => {
    const contacto = document.querySelector('.fx-contacto');
    if (!contacto) return;
    const observador = new IntersectionObserver(([e]) => setOculta(e.isIntersecting));
    observador.observe(contacto);
    return () => observador.disconnect();
  }, []);
  return (
    <div ref={barra} className="cta-movil" data-oculta={oculta} aria-hidden={oculta}>
      {children}
    </div>
  );
}

// Simulador de crédito (Módulo 2): sistema francés, cuota fija, calculado en el
// navegador. Solo referencial: no incluye seguros, gastos ni impuestos. Va en su
// propia tarjeta bajo el escenario: controles a la izquierda, cuota a la derecha.
export function SimuladorCredito({
  precioVehiculo,
  financiamiento,
}: {
  precioVehiculo: number;
  financiamiento: Financiamiento;
}) {
  const { elegir } = useContext(Contexto);
  const plazos = plazosHasta(financiamiento.plazoMaximo);
  const [pie, setPie] = useState(financiamiento.pieMinimo);
  const [plazo, setPlazo] = useState(
    plazos.includes(PLAZO_INICIAL_CREDITO) ? PLAZO_INICIAL_CREDITO : plazos[plazos.length - 1],
  );
  const id = useId();
  const s = simularCredito(precioVehiculo, pie, plazo, financiamiento.tasaMensual);

  const cambiar = (nuevoPie: number, nuevoPlazo: number) => {
    setPie(nuevoPie);
    setPlazo(nuevoPlazo);
    elegir({
      pie: simularCredito(precioVehiculo, nuevoPie, nuevoPlazo, financiamiento.tasaMensual).pie,
      plazo: nuevoPlazo,
    });
  };

  return (
    <div className="mk-simulador">
      <div className="mk-simulador-controles">
        <div className="mk-simulador-campo">
          <div className="mk-simulador-fila">
            <label htmlFor={`${id}-pie`}>Pie</label>
            <output htmlFor={`${id}-pie`} className="num">
              {precio(s.pie)} <span>· {pie}%</span>
            </output>
          </div>
          <input
            id={`${id}-pie`}
            type="range"
            min={financiamiento.pieMinimo}
            max={PIE_MAXIMO_CREDITO}
            step={5}
            value={pie}
            onChange={(e) => cambiar(Number(e.target.value), plazo)}
            aria-valuetext={`${precio(s.pie)}, ${pie}% del precio`}
          />
        </div>

        <fieldset className="mk-simulador-campo">
          <legend>Cuotas</legend>
          <div className="mk-simulador-plazos">
            {plazos.map((p) => (
              <label key={p}>
                <input
                  type="radio"
                  name={`${id}-plazo`}
                  value={p}
                  checked={plazo === p}
                  onChange={() => cambiar(pie, p)}
                />
                <span className="num">{p}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mk-simulador-salida">
        <div className="mk-simulador-resultado" aria-live="polite">
          <span>Cuota mensual estimada</span>
          <strong className="num">{precio(s.cuota)}</strong>
        </div>
        <dl className="mk-simulador-detalle">
          <div>
            <dt>Monto a financiar</dt>
            <dd className="num">{precio(s.montoFinanciado)}</dd>
          </div>
          <div>
            <dt>Costo total del crédito</dt>
            <dd className="num">{precio(s.costoTotal)}</dd>
          </div>
        </dl>
        <p className="mk-simulador-aviso">
          Simulación referencial. La tasa, la CAE y las condiciones finales las informa la
          automotora o la financiera.
        </p>
      </div>
    </div>
  );
}
