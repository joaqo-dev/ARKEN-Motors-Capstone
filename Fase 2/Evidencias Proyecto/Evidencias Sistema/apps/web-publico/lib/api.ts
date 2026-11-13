import { headers } from 'next/headers';
import { cache } from 'react';
import { config } from './config';

// Tipos de la API pública (/publico).
export interface Opcion {
  valor: string;
  cantidad: number;
}

export interface VehiculoTarjeta {
  id: string;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number;
  kilometraje: number;
  precio: number;
  categoria: string;
  transmision: string;
  combustible: string;
  fotoPortada: string | null;
  ubicacion: { comuna: string; region: { codigo: string; nombre: string } };
}

export interface ResultadoBusqueda {
  items: VehiculoTarjeta[];
  total: number;
  pagina: number;
  porPagina: number;
  paginas: number;
}

export interface VehiculoDetalle extends VehiculoTarjeta {
  color: string;
  cilindrada: string | null;
  traccion: string | null; // null en motos
  descripcion: string | null;
  fotos: string[];
  automotora: { nombre: string; subdominio: string; logoUrl: string | null };
  sucursal: {
    nombre: string;
    direccion: string;
    comuna: string;
    region: { codigo: string; nombre: string };
    telefono: string;
    horarioAtencion: string | null;
  };
  whatsapp: string;
  // Simulador de crédito: solo si la automotora lo activó (o null).
  financiamiento: { tasaMensual: number; pieMinimo: number; plazoMaximo: number } | null;
  // Última inspección pre-compra aprobada (o null).
  inspeccion: InspeccionPublica | null;
}

export interface InspeccionPublica {
  resultado: 'APROBADO' | 'APROBADO_CON_OBSERVACIONES';
  fecha: string;
  kilometraje: number;
}

export interface FiltrosDisponibles {
  marcas: Opcion[];
  modelos: Opcion[];
  categorias: Opcion[];
  transmisiones: Opcion[];
  regiones: { codigo: string; nombre: string; cantidad: number }[];
  comunas: Opcion[];
  rangos: {
    anio: { min: number | null; max: number | null };
    precio: { min: number | null; max: number | null };
    kilometraje: { min: number | null; max: number | null };
  };
  sucursales: { id: string; nombre: string; comuna: string; cantidad: number }[];
}

export interface AutomotoraPublica {
  nombre: string;
  subdominio: string;
  email: string;
  descripcion: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  sucursales: {
    id: string;
    nombre: string;
    direccion: string;
    comuna: string;
    region: { codigo: string; nombre: string };
    telefono: string;
    horarioAtencion: string | null;
    whatsapp: string;
    esPrincipal: boolean;
  }[];
}

export interface AutomotoraDirectorio {
  nombre: string;
  subdominio: string;
  descripcion: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  vehiculos: number;
  comunas: string[];
}

export type Busqueda = Record<string, string | undefined>;

// Parámetros de búsqueda aceptados por la API (el resto se ignora).
const PARAMS_BUSQUEDA = [
  'q',
  'marca',
  'modelo',
  'anioMin',
  'anioMax',
  'precioMin',
  'precioMax',
  'kmMin',
  'kmMax',
  'categoria',
  'transmision',
  'region',
  'comuna',
  'sucursalId',
  'orden',
  'pagina',
];

export function paramsBusqueda(busqueda: Busqueda, extra: Busqueda = {}): URLSearchParams {
  const params = new URLSearchParams();
  for (const clave of PARAMS_BUSQUEDA) {
    const valor = busqueda[clave];
    if (valor) params.set(clave, valor);
  }
  for (const [clave, valor] of Object.entries(extra)) if (valor) params.set(clave, valor);
  return params;
}

// La API no respondió (caída o sin conexión): lo muestra app/error.tsx.
export class ApiNoDisponibleError extends Error {
  constructor(causa: unknown) {
    super('El servicio no está disponible en este momento', { cause: causa });
  }
}

// Sin esto la API vería todas las visitas con la IP de este servidor y un solo
// visitante agotaría el límite de todos. Caddy fija la IP real como último
// valor de X-Forwarded-For. Fuera de un request (build) no hay cabeceras.
async function cabeceraIpVisitante(): Promise<Record<string, string>> {
  try {
    const ip = (await headers()).get('x-forwarded-for')?.split(',').pop()?.trim();
    return ip ? { 'X-Forwarded-For': ip } : {};
  } catch {
    return {};
  }
}

// Datos siempre frescos: el inventario publicado cambia en cualquier momento.
async function get<T>(ruta: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${ruta}`, {
      cache: 'no-store',
      headers: await cabeceraIpVisitante(),
    });
  } catch (err) {
    throw new ApiNoDisponibleError(err);
  }
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Error ${res.status} al consultar ${ruta}`);
  return res.json() as Promise<T>;
}

export const api = {
  buscar: (params: URLSearchParams) => get<ResultadoBusqueda>(`/publico/vehiculos?${params}`),
  detalle: (id: string) => get<VehiculoDetalle>(`/publico/vehiculos/${encodeURIComponent(id)}`),
  filtros: (params: URLSearchParams) => get<FiltrosDisponibles>(`/publico/filtros?${params}`),
  directorio: () => get<AutomotoraDirectorio[]>('/publico/automotoras'),
  // cache(): la metadata y la página de la vitrina comparten una sola consulta por request.
  automotora: cache((subdominio: string) =>
    get<AutomotoraPublica>(`/publico/automotoras/${encodeURIComponent(subdominio)}`),
  ),
  vitrinas: () => get<{ subdominio: string }[]>('/publico/vitrinas'),
};
