import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useSesion } from '../../auth/sesion';
import { api } from '../../lib/api';
import { fechaHora } from '../../lib/formato';
import type { ConfigCorreos, Correo, TipoDocumentoCorreo } from '../../lib/tipos';
import { Boton, Casilla, Insignia, Tarjeta } from '../../ui/componentes';
import { useAviso } from '../../ui/toast';

type TipoConfig = keyof Pick<
  ConfigCorreos,
  'cotizacion' | 'reserva' | 'tasacion' | 'venta' | 'consignacion'
>;

// Casilla "Enviar por correo al cliente" al emitir: parte con lo que diga la
// configuración de la automotora (Módulo 18).
export function useEnvioCorreo(tipo: TipoConfig) {
  const { automotora } = useSesion();
  return useState(automotora?.correos?.[tipo] ?? true);
}

export function CasillaCorreo({
  marcada,
  onCambiar,
  email,
}: {
  marcada: boolean;
  onCambiar: (v: boolean) => void;
  email?: string | null;
}) {
  return (
    <Casilla marcada={marcada} onCambiar={onCambiar}>
      <span>
        Enviar el PDF por correo al cliente
        {email && <span className="text-slate-500"> ({email})</span>}
      </span>
    </Casilla>
  );
}

const TIPO: Record<Correo['tipo'], string> = {
  DOCUMENTO: 'Documento en PDF',
  SEGUIMIENTO_COTIZACION: 'Seguimiento: sigue disponible',
  COTIZACION_POR_VENCER: 'Aviso: la cotización vence',
  RESERVA_POR_VENCER: 'Aviso: la reserva vence',
  TASACION_POR_VENCER: 'Aviso: la oferta vence',
};

const ESTADO: Record<Correo['estado'], string> = {
  PENDIENTE: 'Enviando',
  ENVIADO: 'Enviado',
  FALLIDO: 'Falló',
  DESCARTADO: 'No enviado',
};

// Historial de correos del documento, con reenvío del PDF al email actual del
// cliente. Mientras haya uno en curso, se actualiza solo.
export function CorreosDocumento({
  tipo,
  id,
  anulado,
}: {
  tipo: TipoDocumentoCorreo;
  id: string;
  anulado?: boolean;
}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const clave = ['correos', tipo, id];
  const { data, isPending } = useQuery({
    queryKey: clave,
    queryFn: () =>
      api<Correo[]>('GET', `/correos?documentoTipo=${tipo}&documentoId=${encodeURIComponent(id)}`),
    refetchInterval: (q) => (q.state.data?.some((c) => c.estado === 'PENDIENTE') ? 3000 : false),
  });
  const reenviar = useMutation({
    mutationFn: () =>
      api<Correo[]>('POST', '/correos/reenviar', {
        body: { documentoTipo: tipo, documentoId: id },
      }),
    onSuccess: (lista) => {
      qc.setQueryData(clave, lista);
      const ultimo = lista[0];
      avisar(
        ultimo?.estado === 'ENVIADO'
          ? `Correo enviado a ${ultimo.destinatario}`
          : 'Correo en camino',
      );
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  return (
    <Tarjeta
      titulo="Correos al cliente"
      acciones={
        !anulado && (
          <Boton
            ayuda="Envía el PDF al correo del cliente; queda en el historial de correos y en la auditoría"
            variante="fantasma"
            chico
            cargando={reenviar.isPending}
            onClick={() => reenviar.mutate()}
          >
            {!reenviar.isPending && <Send aria-hidden />}
            {data?.length ? 'Reenviar' : 'Enviar'}
          </Boton>
        )
      }
    >
      {isPending ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : !data?.length ? (
        <p className="text-sm text-slate-500">Aún no se le ha enviado ningún correo.</p>
      ) : (
        <ol className="space-y-3.5">
          {data.map((c) => (
            <li key={c.id} className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{TIPO[c.tipo]}</span>
                <Insignia valor={c.estado} texto={ESTADO[c.estado]} />
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500" title={c.destinatario}>
                {c.destinatario}
              </p>
              <p className="text-xs text-slate-500">
                {fechaHora(c.fechaEnvio ?? c.fechaCreacion)}
                {c.pedidoPor ? ` · por ${c.pedidoPor}` : ' · automático'}
              </p>
              {c.error && c.estado !== 'ENVIADO' && (
                <p className="mt-1 text-xs text-slate-500">
                  {c.estado === 'PENDIENTE' ? 'Reintentando: ' : ''}
                  {c.error}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Tarjeta>
  );
}
