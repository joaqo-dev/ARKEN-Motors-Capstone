import { TipoDocumentoLegal } from './vehiculos';

// Qué le falta a un vehículo: lo obligatorio para publicarlo (bloquea) y lo
// recomendado (solo avisa). El filtro "con pendientes" de la API replica este
// criterio en SQL (vehiculos.repository.ts): mantenerlos iguales.

export const FOTOS_RECOMENDADAS = 6;

// Dónde se completa cada cosa en la ficha del panel.
export type SeccionPendiente = 'fotos' | 'ficha' | 'documentos' | 'inspeccion';

export interface Pendiente {
  clave: string;
  texto: string;
  seccion: SeccionPendiente;
  obligatorio: boolean;
}

export interface DatosCompletitud {
  fotos: number;
  version: string | null;
  cilindrada: string | null;
  combustible: string;
  descripcion: string | null;
  // Documentos legales vigentes (no historial) y si ya vencieron.
  documentos: { tipo: string; vencido: boolean }[];
  inspeccionAprobada: boolean;
}

const NOMBRE_DOCUMENTO: Record<TipoDocumentoLegal, string> = {
  PERMISO_CIRCULACION: 'permiso de circulación',
  REVISION_TECNICA: 'revisión técnica',
  SOAP: 'SOAP',
};

const vacio = (texto: string | null) => !texto || texto.trim() === '';

export function pendientesVehiculo(d: DatosCompletitud): Pendiente[] {
  const lista: Pendiente[] = [];
  const agregar = (clave: string, texto: string, seccion: SeccionPendiente, obligatorio = false) =>
    lista.push({ clave, texto, seccion, obligatorio });

  // Obligatorio: el resto de la ficha básica y el precio ya los exige el alta.
  if (d.fotos === 0) agregar('fotos', 'Al menos 1 foto', 'fotos', true);
  else if (d.fotos < FOTOS_RECOMENDADAS) {
    agregar('fotos', `Más fotos (tiene ${d.fotos}, se recomiendan ${FOTOS_RECOMENDADAS})`, 'fotos');
  }

  if (vacio(d.descripcion)) agregar('descripcion', 'Descripción', 'ficha');
  if (vacio(d.version)) agregar('version', 'Versión', 'ficha');
  // Un eléctrico no tiene cilindrada.
  if (vacio(d.cilindrada) && d.combustible !== 'ELECTRICO') {
    agregar('cilindrada', 'Cilindrada', 'ficha');
  }

  for (const tipo of TipoDocumentoLegal.options) {
    const doc = d.documentos.find((x) => x.tipo === tipo);
    if (!doc) agregar(`doc:${tipo}`, `Subir ${NOMBRE_DOCUMENTO[tipo]}`, 'documentos');
    else if (doc.vencido) {
      agregar(`doc:${tipo}`, `Renovar ${NOMBRE_DOCUMENTO[tipo]} (vencido)`, 'documentos');
    }
  }

  if (!d.inspeccionAprobada) agregar('inspeccion', 'Inspección aprobada', 'inspeccion');
  return lista;
}

// Lo que bloquea publicar (y enviar a revisión).
export const faltaParaPublicar = (pendientes: Pendiente[]) =>
  pendientes.filter((p) => p.obligatorio);
