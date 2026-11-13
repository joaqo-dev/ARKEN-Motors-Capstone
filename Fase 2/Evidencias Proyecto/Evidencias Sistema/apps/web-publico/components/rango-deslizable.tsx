'use client';

import { useEffect, useRef, useState } from 'react';

const miles = new Intl.NumberFormat('es-CL');

// Rango con dos manillas (precio, año, kilometraje). Al arrastrar, las celdas
// de mínimo y máximo muestran el valor al instante; también se pueden
// escribir. El filtro se aplica al soltar (tras una breve espera) y un extremo
// en su límite no filtra, para no excluir lo que se publique después.
export function RangoDeslizable({
  titulo,
  limites,
  paso,
  desdeUrl,
  hastaUrl,
  prefijo,
  sufijo,
  conMiles = true,
  onAplicar,
}: {
  titulo: string;
  limites: { min: number; max: number };
  paso: number;
  desdeUrl: string;
  hastaUrl: string;
  prefijo?: string;
  sufijo?: string;
  conMiles?: boolean;
  onAplicar: (desde: number | null, hasta: number | null) => void;
}) {
  // Límites redondeados al paso para que las manillas lleguen justo a los extremos.
  const min = Math.floor(limites.min / paso) * paso;
  const max = Math.ceil(limites.max / paso) * paso;
  const acotar = (v: number) => Math.min(max, Math.max(min, v));
  const desdeInicial = desdeUrl ? acotar(Number(desdeUrl)) : min;
  const hastaInicial = hastaUrl ? acotar(Number(hastaUrl)) : max;

  const [desde, setDesde] = useState(desdeInicial);
  const [hasta, setHasta] = useState(hastaInicial);
  // Si la URL cambia desde afuera (limpiar filtros, volver atrás), se sincroniza.
  const [urlPrevia, setUrlPrevia] = useState(`${desdeUrl}|${hastaUrl}`);
  if (urlPrevia !== `${desdeUrl}|${hastaUrl}`) {
    setUrlPrevia(`${desdeUrl}|${hastaUrl}`);
    setDesde(desdeInicial);
    setHasta(hastaInicial);
  }

  // Aplica el filtro poco después del último movimiento.
  const pendiente = useRef(false);
  useEffect(() => {
    if (!pendiente.current) return;
    const t = setTimeout(() => {
      pendiente.current = false;
      onAplicar(desde > min ? desde : null, hasta < max ? hasta : null);
    }, 450);
    return () => clearTimeout(t);
  }, [desde, hasta, min, max, onAplicar]);

  const mover = (d: number, h: number) => {
    pendiente.current = true;
    setDesde(d);
    setHasta(h);
  };

  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const formato = (v: number) => (conMiles ? miles.format(v) : String(v));
  const nombre = titulo.toLowerCase();

  return (
    <div className="filtro-grupo" role="group" aria-label={titulo}>
      <span className="filtro-titulo">{titulo}</span>
      <div className="deslizador">
        <div className="deslizador-pista" aria-hidden>
          <div
            className="deslizador-relleno"
            style={{ left: `${pct(desde)}%`, right: `${100 - pct(hasta)}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={paso}
          value={desde}
          aria-label={`${titulo} mínimo`}
          aria-valuetext={`${prefijo ?? ''}${formato(desde)}${sufijo ? ` ${sufijo}` : ''}`}
          // Con las dos manillas juntas en el extremo derecho, la de mínimo queda arriba.
          style={{ zIndex: desde > max - (max - min) / 10 ? 2 : 1 }}
          onChange={(e) => mover(Math.min(Number(e.target.value), hasta), hasta)}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={paso}
          value={hasta}
          aria-label={`${titulo} máximo`}
          aria-valuetext={`${prefijo ?? ''}${formato(hasta)}${sufijo ? ` ${sufijo}` : ''}`}
          onChange={(e) => mover(desde, Math.max(Number(e.target.value), desde))}
        />
      </div>
      <div className="rango">
        <Celda
          etiqueta="Mínimo"
          nombre={`${nombre} mínimo`}
          valor={desde}
          prefijo={prefijo}
          sufijo={sufijo}
          formato={formato}
          onFijar={(v) => mover(Math.min(acotar(v), hasta), hasta)}
        />
        <Celda
          etiqueta="Máximo"
          nombre={`${nombre} máximo`}
          valor={hasta}
          prefijo={prefijo}
          sufijo={sufijo}
          formato={formato}
          onFijar={(v) => mover(desde, Math.max(acotar(v), desde))}
        />
      </div>
    </div>
  );
}

// Celda editable: muestra el valor formateado; al escribir se acepta solo el
// número y se aplica al salir del campo o con Enter.
function Celda({
  etiqueta,
  nombre,
  valor,
  prefijo,
  sufijo,
  formato,
  onFijar,
}: {
  etiqueta: string;
  nombre: string;
  valor: number;
  prefijo?: string;
  sufijo?: string;
  formato: (v: number) => string;
  onFijar: (v: number) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const fijar = () => {
    if (texto === null) return;
    const numero = Number(texto.replace(/\D/g, ''));
    setTexto(null);
    if (texto.trim() !== '' && Number.isFinite(numero)) onFijar(numero);
  };
  return (
    <label className="celda-rango">
      <span>{etiqueta}</span>
      <span className="celda-rango-control">
        {prefijo && <span aria-hidden>{prefijo}</span>}
        <input
          inputMode="numeric"
          aria-label={nombre}
          value={texto ?? formato(valor)}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={fijar}
          onKeyDown={(e) => e.key === 'Enter' && fijar()}
        />
        {sufijo && <span aria-hidden>{sufijo}</span>}
      </span>
    </label>
  );
}
