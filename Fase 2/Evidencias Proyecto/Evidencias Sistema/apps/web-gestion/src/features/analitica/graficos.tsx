import { useEffect, useRef, useState } from 'react';
import { cx, Medidor } from '../../ui/componentes';

export interface Barra {
  clave: string;
  etiqueta: string; // eje X
  titulo: string; // tooltip
  valor: number;
  detalle?: string; // segunda línea del tooltip
  aviso?: boolean; // tono de alerta (ej. inventario estancado)
}

const ALTO = 232;
const MARGEN = { arriba: 14, derecha: 8, abajo: 28, izquierda: 48 };

function escalaRedonda(v: number) {
  const base = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * base >= v) return m * base;
  return 10 * base;
}

function useAncho() {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(600);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { caja, ancho };
}

// Barras verticales de una sola serie (una medida a la vez: nunca dos ejes).
// Admite valores negativos (ej. utilidad neta), con la línea de cero marcada.
// Tooltip al pasar y tabla equivalente para lectores de pantalla.
export function BarrasVerticales({
  barras,
  formato,
  formatoEje,
  descripcion,
}: {
  barras: Barra[];
  formato: (v: number) => string;
  formatoEje: (v: number) => string;
  descripcion: string;
}) {
  const { caja, ancho } = useAncho();
  const [activa, setActiva] = useState<number | null>(null);

  const maximo = Math.max(0, ...barras.map((b) => b.valor));
  const minimo = Math.min(0, ...barras.map((b) => b.valor));
  // El paso sale del lado más grande (positivo o negativo): pocas líneas siempre.
  const pasoArriba = escalaRedonda(Math.max(maximo, -minimo, 1) / 4);
  const lineasArriba = maximo > 0 ? Math.ceil(maximo / pasoArriba) : minimo < 0 ? 0 : 4;
  const lineasAbajo = minimo < 0 ? Math.ceil(-minimo / pasoArriba) : 0;
  const tope = pasoArriba * lineasArriba;
  const piso = -pasoArriba * lineasAbajo;
  const rango = tope - piso || 1;

  const w = ancho - MARGEN.izquierda - MARGEN.derecha;
  const h = ALTO - MARGEN.arriba - MARGEN.abajo;
  const y = (v: number) => MARGEN.arriba + ((tope - v) / rango) * h;
  const banda = w / Math.max(barras.length, 1);
  const anchoBarra = Math.min(28, Math.max(6, banda * 0.62));
  const x = (i: number) => MARGEN.izquierda + banda * i + (banda - anchoBarra) / 2;
  const salto = Math.max(1, Math.ceil(barras.length / Math.max(1, Math.floor(w / 48))));
  const lineas = Array.from(
    { length: lineasArriba + lineasAbajo + 1 },
    (_, i) => tope - i * pasoArriba,
  );
  const b = activa !== null ? barras[activa] : null;

  return (
    <div ref={caja} className="relative">
      <svg
        width={ancho}
        height={ALTO}
        className="block touch-none select-none"
        role="img"
        aria-label={descripcion}
        onPointerLeave={() => setActiva(null)}
      >
        {lineas.map((v) => (
          <g key={v}>
            <line
              x1={MARGEN.izquierda}
              x2={ancho - MARGEN.derecha}
              y1={y(v)}
              y2={y(v)}
              className={v === 0 ? 'stroke-slate-300' : 'stroke-slate-100'}
            />
            <text
              x={MARGEN.izquierda - 10}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-500 text-[11px] tabular-nums"
            >
              {v === 0 ? '0' : formatoEje(v)}
            </text>
          </g>
        ))}
        {barras.map((barra, i) => {
          const arriba = y(Math.max(barra.valor, 0));
          const alto = Math.max(Math.abs(y(barra.valor) - y(0)), barra.valor === 0 ? 0 : 2);
          return (
            <g key={barra.clave} onPointerEnter={() => setActiva(i)}>
              {/* Zona de contacto más grande que la barra */}
              <rect
                x={MARGEN.izquierda + banda * i}
                y={MARGEN.arriba}
                width={banda}
                height={h}
                className={cx('fill-transparent', activa === i && 'fill-slate-100')}
                rx="14"
              />
              {barra.valor !== 0 && (
                <rect
                  x={x(i)}
                  y={barra.valor >= 0 ? arriba : y(0)}
                  width={anchoBarra}
                  height={alto}
                  // Barras en cápsula.
                  rx={Math.min(anchoBarra / 2, alto / 2)}
                  className={cx(
                    'transition-[fill] duration-150',
                    barra.aviso
                      ? 'fill-ambar'
                      : barra.valor < 0
                        ? 'fill-red-500'
                        : activa === i
                          ? 'fill-lima'
                          : 'fill-slate-900',
                  )}
                />
              )}
            </g>
          );
        })}
        {barras.map((barra, i) =>
          i % salto === 0 ? (
            <text
              key={barra.clave}
              x={x(i) + anchoBarra / 2}
              y={ALTO - 8}
              textAnchor="middle"
              className={cx('text-[11px]', activa === i ? 'fill-slate-900' : 'fill-slate-500')}
            >
              {barra.etiqueta}
            </text>
          ) : null,
        )}
      </svg>
      {b && activa !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 w-48 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs text-invertido shadow-flotante"
          style={{
            left: Math.min(Math.max(x(activa) + anchoBarra / 2 - 96, 0), ancho - 192),
          }}
          role="status"
        >
          <p className="opacity-70">{b.titulo}</p>
          <p className="mt-0.5 text-sm font-medium tabular-nums">{formato(b.valor)}</p>
          {b.detalle && <p className="mt-0.5 tabular-nums opacity-70">{b.detalle}</p>}
        </div>
      )}
      <table className="sr-only">
        <caption>{descripcion}</caption>
        <tbody>
          {barras.map((barra) => (
            <tr key={barra.clave}>
              <th scope="row">{barra.titulo}</th>
              <td>{formato(barra.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Filas con barra proporcional al mayor valor: ranking o reparto de un total.
export function BarrasHorizontales({
  filas,
  formato,
  conPorcentaje,
}: {
  filas: { nombre: string; valor: number; detalle?: string; nota?: string }[];
  formato: (v: number) => string;
  conPorcentaje?: boolean;
}) {
  const maximo = Math.max(1, ...filas.map((f) => f.valor));
  const total = filas.reduce((s, f) => s + f.valor, 0);
  return (
    <ul className="space-y-3.5">
      {filas.map((f) => (
        <li key={f.nombre}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-900">
              {f.nombre}
              {f.nota && <span className="ml-1.5 text-xs text-slate-500">{f.nota}</span>}
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium text-slate-900">{formato(f.valor)}</span>
              {conPorcentaje && total > 0 && (
                <span className="ml-2 text-xs text-slate-500">
                  {Math.round((f.valor / total) * 100)}%
                </span>
              )}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div
              className="h-full rounded-full bg-slate-900 transition-[width] duration-500 ease-out"
              style={{ width: `${(f.valor / maximo) * 100}%` }}
            />
          </div>
          {f.detalle && <p className="mt-1 text-xs tabular-nums text-slate-500">{f.detalle}</p>}
        </li>
      ))}
    </ul>
  );
}

// Paso del embudo comercial: cuántos entraron y cuántos avanzaron.
export function PasoEmbudo({
  titulo,
  total,
  avanzaron,
  textoAvance,
  detalle,
}: {
  titulo: string;
  total: number;
  avanzaron: number;
  textoAvance: string;
  detalle?: string;
}) {
  const pct = total ? Math.round((avanzaron / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-slate-900">{titulo}</p>
        <p className="text-[2rem] font-light leading-none tracking-[-0.04em] tabular-nums text-slate-950">
          {total}
        </p>
      </div>
      <div className="mt-3">
        <Medidor valor={total ? avanzaron / total : 0} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        <span className="font-medium tabular-nums text-slate-900">{total ? `${pct}%` : '—'}</span>{' '}
        {textoAvance} ({avanzaron} de {total}){detalle ? ` · ${detalle}` : ''}
      </p>
    </div>
  );
}
