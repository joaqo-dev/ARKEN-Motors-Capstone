import {
  calcularLiquidacion,
  comisionBajoMinimo,
  comisionMaxima,
  porcentajeDeGanancia,
  porcentajeExacto,
  type TipoTrato,
} from '@vitriauto/shared-types';
import { useState } from 'react';
import { pesos } from '../../lib/formato';
import { Campo, cx, Input } from '../../ui/componentes';

export interface Trato {
  tipoTrato: TipoTrato;
  porcentajeComision: number | null; // COMISION_VENTA
  montoNeto: number | null; // PRECIO_NETO
  precioMinimo: number | null; // COMISION_VENTA (en PRECIO_NETO es el neto)
}

export const tratoInicial = (): Trato => ({
  tipoTrato: 'COMISION_VENTA',
  porcentajeComision: null,
  montoNeto: null,
  precioMinimo: null,
});

// Error a mostrar antes de enviar (el servidor valida lo mismo).
export function errorTrato(t: Trato, precioPublicacion?: number | null): string | null {
  if (t.tipoTrato === 'PRECIO_NETO') {
    return t.montoNeto && t.montoNeto > 0 ? null : 'Indica cuánto recibirá el dueño';
  }
  if (!t.porcentajeComision || t.porcentajeComision <= 0 || t.porcentajeComision > 100)
    return 'Indica la comisión (entre 0 y 100%)';
  if (!t.precioMinimo || t.precioMinimo <= 0) return 'Indica el precio mínimo aceptado';
  return errorMinimo(t, precioPublicacion);
}

// La comisión no puede dejar al dueño bajo su mínimo (al precio de venta).
function errorMinimo(t: Trato, precio?: number | null): string | null {
  if (t.tipoTrato !== 'COMISION_VENTA' || !precio || !t.precioMinimo) return null;
  if (precio < t.precioMinimo)
    return 'El precio de venta es menor al precio mínimo aceptado por el dueño';
  if (t.porcentajeComision && comisionBajoMinimo(t.porcentajeComision, precio, t.precioMinimo)) {
    const max = comisionMaxima(precio, t.precioMinimo);
    return `Con esta comisión el dueño recibiría menos de su mínimo. Máximo: ${pesos(max.monto)} (${formatoPorcentaje(max.porcentaje)})`;
  }
  return null;
}

// Lo que se envía a la API (sin los campos del otro tipo de trato).
export const cuerpoTrato = (t: Trato) =>
  t.tipoTrato === 'PRECIO_NETO'
    ? { tipoTrato: t.tipoTrato, montoNeto: t.montoNeto ?? undefined }
    : {
        tipoTrato: t.tipoTrato,
        porcentajeComision: t.porcentajeComision ?? undefined,
        precioMinimo: t.precioMinimo ?? undefined,
      };

const TIPOS: { valor: TipoTrato; titulo: string; detalle: string }[] = [
  {
    valor: 'COMISION_VENTA',
    titulo: 'Comisión sobre la venta',
    detalle: 'La automotora cobra un % del precio final de venta.',
  },
  {
    valor: 'PRECIO_NETO',
    titulo: 'Precio neto al dueño',
    detalle: 'El dueño recibe un monto fijo; la automotora se queda con la diferencia.',
  },
];

// Resumen legible del trato, p. ej. "8% del precio final" o "Neto $10.000.000".
export function describirTrato(t: {
  tipoTrato?: TipoTrato;
  porcentajeComision?: number | null;
  montoNeto?: number | null;
}) {
  if (t.tipoTrato === 'PRECIO_NETO') return `Precio neto: el dueño recibe ${pesos(t.montoNeto)}`;
  if (t.tipoTrato === 'COMISION_VENTA')
    return `${formatoPorcentaje(t.porcentajeComision)} del precio final de venta`;
  return '—';
}

// % para mostrar: hasta 2 decimales (se guarda con 6).
export const formatoPorcentaje = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : `${v.toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`;
const textoPorcentaje = (v: number | null) =>
  v === null || Number.isNaN(v) ? '' : String(Math.round(v * 100) / 100);

const num = (v: string) => (v === '' ? null : Number(v));
const texto = (v: number | null) => (v === null || Number.isNaN(v) ? '' : String(v));

// Condiciones del trato con el consignante:
// - Comisión: un campo que se ingresa en % o en $ (es el mismo dato), más el
//   precio mínimo aceptado. Siempre se guarda el %.
// - Precio neto: solo lo que recibe el dueño.
// El reparto resultante se resume en una frase, sobre el precio de venta.
export function CondicionesTrato({
  precio,
  valor,
  onCambiar,
  mostrarPrecio,
}: {
  precio: number | null; // precio de venta (se ingresa fuera de este bloque)
  valor: Trato;
  onCambiar: (t: Trato) => void;
  mostrarPrecio?: boolean; // muestra el precio como dato (p. ej. al editar)
}) {
  const [unidad, setUnidad] = useState<'porcentaje' | 'monto'>('porcentaje');
  // Monto escrito a mano (unidad $), para no pisarlo con el redondeo del %.
  const [montoManual, setMontoManual] = useState<string | null>(null);
  const neto = valor.tipoTrato === 'PRECIO_NETO';
  const hayPrecio = !!precio && precio > 0;
  const cambiar = (parcial: Partial<Trato>) => onCambiar({ ...valor, ...parcial });

  const comisionEnPesos =
    hayPrecio && valor.porcentajeComision
      ? Math.round((precio * valor.porcentajeComision) / 100)
      : null;

  const alComision = (v: string) => {
    if (unidad === 'porcentaje') return cambiar({ porcentajeComision: num(v) });
    setMontoManual(v);
    const g = num(v);
    cambiar({
      porcentajeComision: g === null || !hayPrecio ? null : porcentajeExacto(g, precio),
    });
  };

  const errorComision = errorMinimo(valor, precio);
  const maximo =
    !neto && hayPrecio && valor.precioMinimo && precio >= valor.precioMinimo
      ? comisionMaxima(precio, valor.precioMinimo)
      : null;
  const liquidacion =
    hayPrecio && !errorTrato({ ...valor, precioMinimo: valor.precioMinimo ?? 1 })
      ? calcularLiquidacion(
          {
            tipoTrato: valor.tipoTrato,
            porcentajeComision: valor.porcentajeComision,
            montoNeto: valor.montoNeto,
          },
          precio,
        )
      : null;

  return (
    <div className="space-y-5">
      {mostrarPrecio && (
        <p className="text-sm text-slate-500">
          Precio de venta:{' '}
          <span className="font-medium tabular-nums text-slate-900">
            {hayPrecio ? pesos(precio) : 'sin definir'}
          </span>
        </p>
      )}

      <div
        role="radiogroup"
        aria-label="Tipo de trato"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {TIPOS.map((t) => (
          <button
            key={t.valor}
            type="button"
            role="radio"
            aria-checked={valor.tipoTrato === t.valor}
            onClick={() => {
              if (t.valor === valor.tipoTrato) return;
              setMontoManual(null);
              // Al cambiar de trato se conserva lo que gana la automotora, si se puede.
              const ganancia = liquidacion?.comision ?? null;
              if (t.valor === 'PRECIO_NETO')
                cambiar({
                  tipoTrato: t.valor,
                  montoNeto: hayPrecio && ganancia !== null ? precio - ganancia : null,
                });
              else
                cambiar({
                  tipoTrato: t.valor,
                  porcentajeComision:
                    hayPrecio && ganancia !== null && ganancia > 0
                      ? porcentajeExacto(ganancia, precio)
                      : null,
                });
            }}
            className={cx(
              'flex flex-col gap-0.5 rounded-2xl px-4 py-3.5 text-left transition-shadow duration-150',
              valor.tipoTrato === t.valor
                ? 'bg-slate-50 shadow-[0_0_0_1.5px_var(--color-slate-900)]'
                : 'bg-superficie ring-1 ring-inset ring-slate-200 hover:ring-slate-300',
            )}
          >
            <span className="text-sm font-medium text-slate-900">{t.titulo}</span>
            <span className="text-xs leading-relaxed text-slate-500">{t.detalle}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {neto ? (
          <Campo etiqueta="El dueño recibe" ayuda="Monto líquido garantizado">
            <Input
              type="number"
              moneda
              value={texto(valor.montoNeto)}
              onChange={(e) => cambiar({ montoNeto: num(e.target.value) })}
            />
          </Campo>
        ) : (
          <>
            <Campo
              etiqueta="Comisión de la automotora"
              error={errorComision ?? undefined}
              ayuda={
                unidad === 'monto' && !hayPrecio
                  ? 'Ingresa el precio de venta para calcular el %'
                  : maximo
                    ? `Máximo ${unidad === 'monto' ? pesos(maximo.monto) : formatoPorcentaje(maximo.porcentaje)} para respetar el mínimo del dueño`
                    : 'Sobre el precio final de venta'
              }
            >
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  {unidad === 'porcentaje' ? (
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      placeholder="%"
                      value={textoPorcentaje(valor.porcentajeComision)}
                      onChange={(e) => alComision(e.target.value)}
                    />
                  ) : (
                    <Input
                      type="number"
                      moneda
                      value={montoManual ?? texto(comisionEnPesos)}
                      onChange={(e) => alComision(e.target.value)}
                      onBlur={() => setMontoManual(null)}
                    />
                  )}
                </div>
                <div
                  role="radiogroup"
                  aria-label="Unidad de la comisión"
                  className="inline-flex shrink-0 gap-0.5 rounded-full bg-slate-100 p-1"
                >
                  {(
                    [
                      ['porcentaje', '%'],
                      ['monto', '$'],
                    ] as const
                  ).map(([u, t]) => (
                    <button
                      key={u}
                      type="button"
                      role="radio"
                      aria-checked={unidad === u}
                      aria-label={u === 'porcentaje' ? 'En porcentaje' : 'En pesos'}
                      onClick={() => {
                        setUnidad(u);
                        setMontoManual(null);
                      }}
                      className={cx(
                        'h-7 w-9 rounded-full text-sm font-medium transition-colors',
                        unidad === u
                          ? 'bg-slate-900 text-invertido'
                          : 'text-slate-500 hover:text-slate-900',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </Campo>
            <Campo etiqueta="Precio mínimo aceptado" ayuda="Lo mínimo que el dueño acepta">
              <Input
                type="number"
                moneda
                value={texto(valor.precioMinimo)}
                onChange={(e) => cambiar({ precioMinimo: num(e.target.value) })}
              />
            </Campo>
          </>
        )}
      </div>

      {liquidacion ? (
        <section aria-label="Resumen del trato">
          <p className="mb-2 text-xs font-medium text-slate-500">Resumen del trato</p>
          <dl className="grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200">
            <div className="px-4 py-3">
              <dt className="text-xs text-slate-500">Precio de venta</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900 sm:text-base">
                {pesos(liquidacion.precioVenta)}
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-xs text-slate-500">Recibe el dueño</dt>
              <dd
                className={cx(
                  'mt-1 text-sm font-semibold tabular-nums sm:text-base',
                  errorComision ? 'text-red-600' : 'text-slate-900',
                )}
              >
                {pesos(liquidacion.montoConsignante)}
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-xs text-slate-500">
                {liquidacion.comision < 0 ? 'Pierde la automotora' : 'Gana la automotora'}
              </dt>
              <dd
                className={cx(
                  'mt-1 text-sm font-semibold tabular-nums sm:text-base',
                  liquidacion.comision < 0 ? 'text-red-600' : 'text-slate-950',
                )}
              >
                {pesos(Math.abs(liquidacion.comision))}
                {liquidacion.comision > 0 && (
                  <span className="ml-1.5 text-xs font-medium text-slate-500">
                    {formatoPorcentaje(
                      porcentajeDeGanancia(liquidacion.comision, liquidacion.precioVenta),
                    )}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </section>
      ) : (
        <p className="text-xs text-slate-500">
          {hayPrecio
            ? 'Completa el trato para ver el resumen.'
            : 'Ingresa el precio de venta para ver el resumen del trato.'}
        </p>
      )}
      {neto && (
        <p className="text-xs text-slate-500">
          En este trato, lo que recibe el dueño es también el precio mínimo de venta: venderlo por
          menos lo tiene que autorizar un admin, y la diferencia la asume la automotora.
        </p>
      )}
    </div>
  );
}
