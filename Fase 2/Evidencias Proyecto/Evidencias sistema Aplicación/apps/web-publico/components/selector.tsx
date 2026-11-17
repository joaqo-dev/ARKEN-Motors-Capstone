'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface OpcionSelector {
  valor: string;
  texto: string;
}

// Lista desplegable propia (patrón WAI-ARIA "combobox" de solo selección), en
// vez del <select> del sistema operativo. Con `name` envía el valor en el
// formulario mediante un input oculto. Teclado: flechas, Inicio/Fin, Enter o
// espacio para elegir, Escape para cerrar y letras para saltar a una opción.
export function Selector({
  id,
  name,
  opciones,
  valor: valorControlado,
  valorInicial = '',
  onCambiar,
  etiqueta,
  className = '',
}: {
  id?: string;
  name?: string;
  opciones: OpcionSelector[];
  valor?: string;
  valorInicial?: string;
  onCambiar?: (valor: string) => void;
  etiqueta?: string; // aria-label si no hay <label htmlFor>
  className?: string;
}) {
  const idLista = useId();
  const [valorInterno, setValorInterno] = useState(valorInicial);
  const valor = valorControlado ?? valorInterno;
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [haciaArriba, setHaciaArriba] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const busqueda = useRef({ texto: '', hasta: 0 });

  const indiceElegido = Math.max(
    0,
    opciones.findIndex((o) => o.valor === valor),
  );
  const elegida = opciones.find((o) => o.valor === valor) ?? opciones[0];

  const abrir = () => {
    // Se abre hacia arriba si no cabe debajo.
    const r = boton.current?.getBoundingClientRect();
    if (r) setHaciaArriba(window.innerHeight - r.bottom < 260 && r.top > 260);
    setActivo(indiceElegido);
    setAbierto(true);
  };
  const elegir = (i: number) => {
    const opcion = opciones[i];
    if (!opcion) return;
    if (valorControlado === undefined) setValorInterno(opcion.valor);
    onCambiar?.(opcion.valor);
    setAbierto(false);
    boton.current?.focus();
  };

  // Cierra al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  // Mantiene visible la opción activa al navegar con el teclado.
  useEffect(() => {
    if (!abierto) return;
    document.getElementById(`${idLista}-${activo}`)?.scrollIntoView({ block: 'nearest' });
  }, [abierto, activo, idLista]);

  const teclado = (e: KeyboardEvent) => {
    const ultimo = opciones.length - 1;
    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        abrir();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActivo((a) => Math.min(ultimo, a + 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        setActivo((a) => Math.max(0, a - 1));
        return;
      case 'Home':
        e.preventDefault();
        setActivo(0);
        return;
      case 'End':
        e.preventDefault();
        setActivo(ultimo);
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        elegir(activo);
        return;
      case 'Escape':
        e.preventDefault();
        setAbierto(false);
        return;
      case 'Tab':
        setAbierto(false);
        return;
    }
    // Búsqueda por letras: salta a la primera opción que empiece así.
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const ahora = Date.now();
      const b = busqueda.current;
      b.texto = (ahora < b.hasta ? b.texto : '') + e.key.toLowerCase();
      b.hasta = ahora + 700;
      const i = opciones.findIndex((o) => o.texto.toLowerCase().startsWith(b.texto));
      if (i >= 0) setActivo(i);
    }
  };

  return (
    <div className={`selector ${className}`} ref={raiz}>
      {name && <input type="hidden" name={name} value={elegida?.valor ?? ''} />}
      <button
        ref={boton}
        id={id}
        type="button"
        role="combobox"
        className="control selector-boton"
        aria-label={etiqueta}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-activedescendant={abierto ? `${idLista}-${activo}` : undefined}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={teclado}
      >
        <span className="selector-texto">{elegida?.texto}</span>
        <ChevronDown className="icono selector-flecha" aria-hidden />
      </button>
      <ul
        id={idLista}
        role="listbox"
        className="selector-lista"
        data-abierto={abierto}
        data-arriba={haciaArriba}
        aria-label={etiqueta}
        tabIndex={-1}
      >
        {opciones.map((o, i) => (
          <li
            key={o.valor}
            id={`${idLista}-${i}`}
            role="option"
            aria-selected={o.valor === elegida?.valor}
            data-activo={abierto && i === activo}
            onPointerMove={() => setActivo(i)}
            onPointerDown={(e) => e.preventDefault()} // no roba el foco del botón
            onClick={() => elegir(i)}
          >
            <span>{o.texto}</span>
            {o.valor === elegida?.valor && <Check className="icono" aria-hidden />}
          </li>
        ))}
      </ul>
    </div>
  );
}
