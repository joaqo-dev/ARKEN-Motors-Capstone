import type { EvaluacionInspeccion, ResultadoInspeccion } from '@vitriauto/shared-types';

export interface InspeccionResumen {
  id: string;
  estado: 'BORRADOR' | 'FINALIZADA';
  resultado: ResultadoInspeccion | null;
  kilometraje: number;
  fechaCreacion: string;
  fechaFinalizacion: string | null;
  iniciadaPor: string;
  finalizadaPor: string | null;
  progreso: { evaluados: number; total: number };
}

export interface FotoInspeccion {
  id: string;
  url: string;
}

export interface PuntoInspeccion {
  id: string;
  nombre: string;
  personalizado: boolean;
  evaluacion: EvaluacionInspeccion | null;
  observacion: string | null;
  notaInterna: string | null;
  fotos: FotoInspeccion[];
}

export interface SeccionInspeccionDetalle {
  codigo: string;
  nombre: string;
  puntos: PuntoInspeccion[];
}

export interface InspeccionDetalle extends InspeccionResumen {
  observaciones: string | null;
  vehiculo: { id: string; descripcion: string; patente: string; estado: string };
  resultadoSugerido: ResultadoInspeccion;
  secciones: SeccionInspeccionDetalle[];
}
