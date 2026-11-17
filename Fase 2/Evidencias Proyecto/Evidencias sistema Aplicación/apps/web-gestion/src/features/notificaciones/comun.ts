import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FileWarning, Handshake, ScanEye, type LucideIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { useAviso } from '../../ui/toast';

export interface Notificacion {
  id: string;
  tipo: string;
  mensaje: string;
  sucursal: { id: string; nombre: string };
  fechaGeneracion: string;
  estado: 'PENDIENTE' | 'RESUELTA';
  fechaResolucion: string | null;
  referencias: { tipo: 'VEHICULO' | 'RESERVA' | 'CONSIGNACION'; id: string }[];
}

export const RUTA_REFERENCIA = {
  VEHICULO: '/vehiculos',
  RESERVA: '/reservas',
  CONSIGNACION: '/consignaciones',
} as const;
export const ICONO_TIPO: Record<string, LucideIcon> = {
  DOCUMENTO_LEGAL_POR_VENCER: FileWarning,
  RESERVA_POR_VENCER: CalendarClock,
  CONSIGNACION_POR_VENCER: Handshake,
  VEHICULO_POR_REVISAR: ScanEye,
};
export const TITULO_TIPO: Record<string, string> = {
  DOCUMENTO_LEGAL_POR_VENCER: 'Documento por vencer',
  RESERVA_POR_VENCER: 'Reserva por vencer',
  CONSIGNACION_POR_VENCER: 'Consignación por vencer',
  VEHICULO_POR_REVISAR: 'Vehículo por revisar',
};
export const TEXTO_REFERENCIA = {
  VEHICULO: 'Ver vehículo',
  RESERVA: 'Ver reserva',
  CONSIGNACION: 'Ver consignación',
} as const;

// Marcar una notificación como resuelta (refresca contador, panel y bandeja).
export function useResolverNotificacion() {
  const qc = useQueryClient();
  const avisar = useAviso();
  return useMutation({
    mutationFn: (id: string) => api('POST', `/notificaciones/${id}/resolver`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notificaciones'] });
      avisar('Notificación marcada como resuelta');
    },
    onError: (e) => avisar(e.message, 'error'),
  });
}
