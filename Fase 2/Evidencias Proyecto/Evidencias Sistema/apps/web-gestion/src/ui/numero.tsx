import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type Ref,
} from 'react';
import { emitirCambio, emitirSalida, unirRefs } from './flotante';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const miles = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const MAX_DIGITOS = 12;

const formatear = (digitos: string) => (digitos ? miles.format(Number(digitos)) : '');

// Campo numérico con formato chileno mientras se escribe: "$ 12.500.000"
// (moneda) o "54.000" (miles). Para el formulario sigue siendo un
// <input type="number"> oculto: register({ valueAsNumber }), min/required,
// reset y valores controlados funcionan igual.
export function CampoNumero({
  className,
  ref,
  moneda,
  placeholder,
  disabled,
  id,
  'aria-label': etiqueta,
  ...resto
}: InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
  moneda?: boolean;
}) {
  const nativo = useRef<HTMLInputElement | null>(null);
  const visible = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');

  // Refleja en pantalla el valor del campo oculto (valores iniciales, reset,
  // valores controlados) mientras no se esté escribiendo en él.
  useLayoutEffect(() => {
    if (document.activeElement === visible.current) return;
    const v = nativo.current?.value ?? '';
    const f = formatear(v.replace(/\D/g, '').slice(0, MAX_DIGITOS));
    setTexto((a) => (a === f ? a : f));
  });

  const alEscribir = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    // Cuántos dígitos quedan a la derecha del cursor: se conservan tras formatear.
    const derecha = el.value.slice(el.selectionStart ?? el.value.length).replace(/\D/g, '').length;
    const digitos = el.value
      .replace(/\D/g, '')
      .replace(/^0+(?=\d)/, '')
      .slice(0, MAX_DIGITOS);
    const f = formatear(digitos);
    setTexto(f);
    emitirCambio(nativo.current, digitos);
    requestAnimationFrame(() => {
      if (!visible.current) return;
      let pos = f.length;
      for (let vistos = 0; pos > 0 && vistos < derecha; pos--) if (/\d/.test(f[pos - 1])) vistos++;
      visible.current.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className={cx('relative min-w-0', className)}>
      {moneda && (
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400"
          aria-hidden
        >
          $
        </span>
      )}
      <input
        ref={visible}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={etiqueta}
        placeholder={placeholder ?? '0'}
        disabled={disabled}
        value={texto}
        onChange={alEscribir}
        onBlur={() => emitirSalida(nativo.current)}
        data-control
        className={cx(
          'h-9 w-full min-w-0 rounded-lg border-0 bg-superficie text-base tabular-nums text-slate-900 ring-1 ring-inset ring-slate-200 outline-none transition-shadow duration-150 placeholder:text-slate-400 sm:text-sm',
          'focus:shadow-[0_0_0_4px_var(--color-slate-100)] focus:ring-slate-900',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
          moneda ? 'pl-6 pr-3' : 'px-3',
        )}
      />
      <input
        {...resto}
        ref={unirRefs(nativo, ref)}
        type="number"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onFocus={() => visible.current?.focus()}
        className="sr-only"
      />
    </div>
  );
}
