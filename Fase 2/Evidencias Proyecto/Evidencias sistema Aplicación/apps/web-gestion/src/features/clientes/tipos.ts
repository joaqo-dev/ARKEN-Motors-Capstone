export interface Cliente {
  id: string;
  nombre: string;
  rut: string;
  telefono: string;
  email: string;
  direccion: string;
  estado: 'ACTIVO' | 'INACTIVO';
  aceptaRecordatorios: boolean;
  fechaCreacion: string;
}
