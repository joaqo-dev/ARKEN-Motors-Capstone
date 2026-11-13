import { formatearRut } from '@vitriauto/shared-types';
import { Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api, qs } from '../../lib/api';
import type { Pagina } from '../../lib/tipos';
import { Boton, Input, Modal } from '../../ui/componentes';
import { useAviso } from '../../ui/toast';
import { FormularioCliente } from './formulario-cliente';
import type { Cliente } from './tipos';

// Búsqueda rápida de clientes (nombre o RUT) con alta en el momento, para
// consignaciones, cotizaciones, reservas, tasaciones y ventas.
export function SelectorCliente({
  valor,
  onCambiar,
}: {
  valor: Cliente | null;
  onCambiar: (c: Cliente | null) => void;
}) {
  const [texto, setTexto] = useState('');
  const [creando, setCreando] = useState(false);
  const qc = useQueryClient();
  const avisar = useAviso();

  const { data, isFetching } = useQuery({
    queryKey: ['clientes', 'buscar', texto],
    queryFn: () => api<Pagina<Cliente>>('GET', `/clientes${qs({ q: texto, limit: 8 })}`),
    enabled: texto.trim().length >= 2 && !valor,
  });

  if (valor) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-superficie p-2 pr-3 shadow-[0_0_0_1.5px_var(--color-slate-900)]">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lavanda text-xs font-semibold text-violet-700">
          {valor.nombre
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p.charAt(0).toUpperCase())
            .join('')}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block truncate font-medium text-slate-900">{valor.nombre}</span>
          <span className="block text-xs tabular-nums text-slate-500">
            {formatearRut(valor.rut)}
          </span>
        </span>
        <Boton
          ayuda="Elige otro cliente para este documento"
          variante="fantasma"
          chico
          onClick={() => onCambiar(null)}
        >
          Cambiar
        </Boton>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input
          placeholder="Buscar cliente por nombre o RUT…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <Boton
          ayuda="Registra un cliente nuevo sin salir del formulario"
          variante="secundario"
          onClick={() => setCreando(true)}
        >
          <Plus aria-hidden />
          Nuevo
        </Boton>
      </div>
      {texto.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl bg-superficie p-1 shadow-flotante">
          {isFetching && <li className="px-3 py-2 text-sm text-slate-500">Buscando…</li>}
          {data?.items.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">
              Sin resultados. Créalo con el botón “Nuevo”.
            </li>
          )}
          {data?.items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100"
                onClick={() => onCambiar(c)}
              >
                <span className="font-medium">{c.nombre}</span>{' '}
                <span className="text-slate-500">· {formatearRut(c.rut)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* El selector vive dentro del formulario del documento (cotización, reserva…):
          el modal va al <body> para que su <form> no quede anidado en ese otro. */}
      {creando &&
        createPortal(
          <Modal titulo="Nuevo cliente" onCerrar={() => setCreando(false)}>
            <FormularioCliente
              textoBoton="Crear cliente"
              onCancelar={() => setCreando(false)}
              onGuardar={async (datos) => {
                try {
                  const c = await api<Cliente>('POST', '/clientes', { body: datos });
                  qc.invalidateQueries({ queryKey: ['clientes'] });
                  avisar('Cliente creado');
                  setCreando(false);
                  onCambiar(c);
                } catch (e) {
                  avisar((e as Error).message, 'error');
                }
              }}
            />
          </Modal>,
          document.body,
        )}
    </div>
  );
}
