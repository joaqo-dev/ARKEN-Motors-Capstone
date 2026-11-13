import { useEffect, useRef, useState } from 'react';
import { pesos, pesosCompacto } from '../../lib/formato';
import { cx } from '../../ui/componentes';

export interface Tramo {
  clave: string; // YYYY-MM-DD o YYYY-MM
  etiqueta: string; // eje X
  titulo: string; // tooltip
  monto: number;
  ventas: number;
}

const ALTO = 220;
const MARGEN = { arriba: 12, derecha: 8, abajo: 28, izquierda: 44 };

function escalaRedonda(v: number) {
  const base = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * base >= v) return m * base;
  return 10 * base;
}

// Curva monótona (Fritsch–Carlson): suave y sin sobrepasar los datos.
function curva(p: [number, number][]) {
  if (p.length === 1) return `M${p[0][0] - 1},${p[0][1]} L${p[0][0] + 1},${p[0][1]}`;
  const n = p.length;
  const d = p.slice(0, -1).map((a, i) => (p[i + 1][1] - a[1]) / (p[i + 1][0] - a[0]));
  const m = p.map((_, i) =>
    i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2,
  );
  let s = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1][0] - p[i][0]) / 3;
    s += ` C${p[i][0] + h},${p[i][1] + m[i] * h} ${p[i + 1][0] - h},${p[i + 1][1] - m[i + 1] * h} ${p[i + 1][0]},${p[i + 1][1]}`;
  }
  return s;
}

// Ingresos acumulados del período: una sola serie (sin leyenda), relleno rayado,
// cruz y tooltip al pasar, y tabla equivalente para lectores de pantalla.
export function LineaAcumulada({ tramos }: { tramos: Tramo[] }) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(600);
  const [activo, setActivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let suma = 0;
  const acumulado = tramos.map((t) => (suma += t.monto));
  const paso = escalaRedonda(Math.max(suma, 1) / 4);
  const tope = paso * 4;
  const w = ancho - MARGEN.izquierda - MARGEN.derecha;
  const h = ALTO - MARGEN.arriba - MARGEN.abajo;
  const x = (i: number) =>
    MARGEN.izquierda + (tramos.length === 1 ? w / 2 : (i / (tramos.length - 1)) * w);
  const y = (v: number) => MARGEN.arriba + h - (v / tope) * h;
  const puntos = acumulado.map((v, i) => [x(i), y(v)] as [number, number]);
  const linea = curva(puntos);
  const area = `${linea} L${x(tramos.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const salto = Math.max(1, Math.ceil(tramos.length / Math.max(1, Math.floor(w / 56))));

  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - MARGEN.izquierda;
    const i = Math.round((px / w) * (tramos.length - 1));
    setActivo(Math.max(0, Math.min(tramos.length - 1, i)));
  };
  const t = activo !== null ? tramos[activo] : null;

  return (
    <div ref={caja} className="relative text-slate-900">
      <svg
        width={ancho}
        height={ALTO}
        className="block touch-none select-none"
        onPointerMove={alMover}
        onPointerLeave={() => setActivo(null)}
        role="img"
        aria-label={`Ingresos acumulados: ${pesos(suma)}`}
      >
        <defs>
          {/* Relleno lima que se desvanece hacia el eje: lo acumulado es avance */}
          <linearGradient id="relleno-lima" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-lima)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--color-lima)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grilla y eje Y (recesivos) */}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1={MARGEN.izquierda}
              x2={ancho - MARGEN.derecha}
              y1={y(paso * i)}
              y2={y(paso * i)}
              className={i === 0 ? 'stroke-slate-300' : 'stroke-slate-100'}
            />
            <text
              x={MARGEN.izquierda - 10}
              y={y(paso * i)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-500 text-[11px] tabular-nums"
            >
              {i === 0 ? '0' : pesosCompacto(paso * i)}
            </text>
          </g>
        ))}
        {/* Eje X */}
        {tramos.map((tr, i) =>
          i % salto === 0 ? (
            <text
              key={tr.clave}
              x={x(i)}
              y={ALTO - 8}
              textAnchor="middle"
              className="fill-slate-500 text-[11px] tabular-nums"
            >
              {tr.etiqueta}
            </text>
          ) : null,
        )}
        <path d={area} fill="url(#relleno-lima)" />
        <path
          d={linea}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {activo !== null && (
          <g>
            <line
              x1={x(activo)}
              x2={x(activo)}
              y1={MARGEN.arriba}
              y2={y(0)}
              className="stroke-slate-300"
            />
            <circle
              cx={x(activo)}
              cy={y(acumulado[activo])}
              r="6"
              className="fill-lima"
              stroke="currentColor"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
      {t && activo !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-48 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs text-invertido shadow-flotante"
          style={{ left: Math.min(Math.max(x(activo) - 96, 0), ancho - 192) }}
          role="status"
        >
          <p className="opacity-70">{t.titulo}</p>
          <p className="mt-0.5 text-sm font-medium tabular-nums">{pesos(acumulado[activo])}</p>
          <p className="mt-0.5 flex justify-between gap-4 tabular-nums opacity-70">
            <span>{t.ventas === 1 ? '1 venta' : `${t.ventas} ventas`}</span>
            <span>{pesos(t.monto)}</span>
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>Ingresos por tramo y acumulado</caption>
        <tbody>
          {tramos.map((tr, i) => (
            <tr key={tr.clave}>
              <th scope="row">{tr.titulo}</th>
              <td>{pesos(tr.monto)}</td>
              <td>{pesos(acumulado[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Composición de un total en pocas partes: barra segmentada (2px de separación)
// y filas con nombre, cantidad y porcentaje; la identidad nunca depende solo del tono.
export function Composicion({
  partes,
}: {
  partes: { nombre: string; valor: number; tono: string; detalle?: string }[];
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <div>
      <div className="flex h-3 gap-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {partes
          .filter((p) => p.valor > 0)
          .map((p) => (
            <span
              key={p.nombre}
              className={cx('h-full rounded-full', p.tono)}
              style={{ width: `${(p.valor / total) * 100}%` }}
            />
          ))}
      </div>
      <ul className="mt-5 divide-y divide-slate-100">
        {partes.map((p) => (
          <li key={p.nombre} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className={cx('size-2.5 shrink-0 rounded-full', p.tono)} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-slate-900">{p.nombre}</span>
              {p.detalle && <span className="block text-xs text-slate-500">{p.detalle}</span>}
            </span>
            <span className="text-right tabular-nums">
              <span className="block text-sm font-medium text-slate-900">{p.valor}</span>
              <span className="block text-xs text-slate-500">{pct(p.valor)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
