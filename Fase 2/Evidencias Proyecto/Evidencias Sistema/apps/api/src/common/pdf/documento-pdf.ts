// Modelo común de los documentos comerciales en PDF (cotización, reserva,
// tasación, consignación y, más adelante, comprobante de venta).
export interface FilaDato {
  etiqueta: string;
  valor: string;
}

export interface DocumentoPdf {
  titulo: string;
  folio: number;
  emisor: {
    automotora: string;
    rut: string;
    email: string;
    sucursal: string;
    direccion: string;
    telefono: string;
  };
  fechas: FilaDato[];
  secciones: { titulo: string; filas: FilaDato[] }[];
  montos?: {
    titulo: string;
    filas: { descripcion: string; monto: string }[];
    total?: { etiqueta: string; monto: string };
  };
  notas?: string[];
  firmas?: string[];
  pie: string;
}
