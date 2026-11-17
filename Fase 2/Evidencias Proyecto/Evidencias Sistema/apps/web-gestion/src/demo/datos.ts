import {
  SECCIONES_INSPECCION,
  sugerirVencimientoRevisionTecnica,
  type EvaluacionInspeccion,
} from '@vitriauto/shared-types';
import type { SeccionInspeccionDetalle } from '../features/inspecciones/tipos';
import { etiqueta, hoy } from '../lib/formato';
import type { Automotora, Usuario } from '../lib/tipos';
import type {
  Db,
  DocumentoLegalDemo,
  FilaCliente,
  FilaCotizacion,
  FilaSucursal,
  FilaVehiculo,
} from './db';
import { fotosDe } from './fotos';

// Datos de ejemplo de la demo: tres automotoras inventadas. Nombres, RUTs
// (sobre 30 millones, sin asignar a personas), teléfonos (+56 9 5555 xxxx)
// y emails (@example.com) son ficticios. Las fechas son relativas al día en
// que se crean, para que el dashboard siempre muestre un período con movimiento.

const DIA = 86_400_000;

// Fecha 'YYYY-MM-DD' a n días de hoy (negativo = pasado).
export function dia(n: number, base = hoy()): string {
  return new Date(Date.parse(`${base}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
}

// Instante ISO a n días de hoy, a una hora de Chile (UTC-3 aprox.).
export function instante(n: number, hora = 11, minuto = 0): string {
  return `${dia(n)}T${String(hora + 3).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00.000Z`;
}

function dv(cuerpo: number): string {
  let suma = 0;
  let m = 2;
  for (const d of String(cuerpo).split('').reverse()) {
    suma += Number(d) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
const rut = (cuerpo: number) => `${cuerpo}-${dv(cuerpo)}`;

const CORREOS = {
  cotizacion: true,
  reserva: true,
  tasacion: true,
  venta: true,
  consignacion: true,
  diasSeguimientoCotizacion: 3,
  diasAvisoCotizacion: 1,
  diasAvisoReserva: 1,
  diasAvisoTasacion: 1,
};

// Puntos de la lista de chequeo estándar, sin evaluar (cada inspección los copia).
export function plantillaInspeccion(id: () => string): SeccionInspeccionDetalle[] {
  return SECCIONES_INSPECCION.map((s) => ({
    codigo: s.codigo,
    nombre: s.nombre,
    puntos: s.puntos.map((p) => ({
      id: id(),
      nombre: p.nombre,
      personalizado: false,
      evaluacion: null,
      observacion: null,
      notaInterna: null,
      fotos: [],
    })),
  }));
}

interface DefVehiculo {
  foto: string;
  marca: string;
  modelo: string;
  version: string | null;
  anio: number;
  km: number;
  color: string;
  combustible: string;
  transmision: string;
  cilindrada: string | null;
  patente: string;
  categoria: string;
  traccion: string | null;
  precio: number;
  costo: number;
  origen?: string;
  estado?: string;
  sucursal: string;
  ingreso: number; // días atrás
  descripcion?: string;
}

export function crearDatos(): Db {
  let correlativo = 0;
  const id = (prefijo: string) => `${prefijo}-${(++correlativo).toString(36).padStart(4, '0')}`;

  const db: Db = {
    version: 1,
    automotoras: [],
    sucursales: [],
    usuarios: [],
    clientes: [],
    vehiculos: [],
    consignaciones: [],
    cotizaciones: [],
    reservas: [],
    ventas: [],
    tasaciones: [],
    gastos: [],
    bitacora: [],
    notificaciones: [],
    auditoria: [],
    inspecciones: [],
    correos: [],
    folios: {},
  };
  const folio = (automotoraId: string, tipo: string) => {
    const clave = `${automotoraId}:${tipo}`;
    db.folios[clave] = (db.folios[clave] ?? 0) + 1;
    return db.folios[clave];
  };
  const evento = (
    vehiculoId: string,
    tipoEvento: string,
    descripcion: string,
    fecha: string,
    usuarioId: string,
  ) => db.bitacora.push({ id: id('bit'), vehiculoId, tipoEvento, descripcion, fecha, usuarioId });
  const auditar = (
    automotoraId: string,
    fecha: string,
    usuarioId: string,
    sucursalId: string | null,
    accion: string,
    entidad: { tipo: string; id: string },
    valorNuevo: Record<string, unknown> | null = null,
    valorAnterior: Record<string, unknown> | null = null,
  ) =>
    db.auditoria.push({
      id: id('aud'),
      automotoraId,
      fecha,
      usuarioId,
      sucursalId,
      accion,
      entidad,
      valorAnterior,
      valorNuevo,
    });

  // ---------------------------------------------------------------- Automotoras

  const automotora = (
    a: Omit<
      Automotora,
      | 'diasValidezCotizacion'
      | 'diasValidezReserva'
      | 'diasValidezTasacion'
      | 'correos'
      | 'financiamiento'
      | 'logoUrl'
      | 'bannerUrl'
    >,
  ) => {
    db.automotoras.push({
      ...a,
      logoUrl: null,
      bannerUrl: null,
      diasValidezCotizacion: 7,
      diasValidezReserva: 5,
      diasValidezTasacion: 3,
      correos: { ...CORREOS },
      financiamiento: { activo: true, tasaMensual: 1.49, pieMinimo: 20, plazoMaximo: 48 },
    });
    return a.id;
  };
  const sucursal = (s: Omit<FilaSucursal, 'activa' | 'fechaCreacion'>, creada: number) => {
    db.sucursales.push({ ...s, activa: true, fechaCreacion: instante(-creada, 10) });
    return s.id;
  };
  const usuario = (
    u: Omit<Usuario, 'estado' | 'emailVerificado' | 'invitacionPendiente' | 'fechaCreacion'> &
      Partial<Usuario>,
    creado: number,
  ) => {
    db.usuarios.push({
      estado: 'ACTIVO',
      emailVerificado: true,
      invitacionPendiente: false,
      fechaCreacion: instante(-creado, 9, 30),
      ...u,
    });
    return u.id;
  };

  const aromos = automotora({
    id: 'aut-aromos',
    nombre: 'Automotora Los Aromos',
    rut: rut(35412870),
    subdominio: 'losaromos',
    direccion: 'Av. Los Aromos 1450, Las Condes',
    telefono: '+56955550100',
    email: 'contacto@example.com',
    descripcion:
      'Autos seminuevos revisados, con financiamiento y recepción de tu auto en parte de pago. Dos sucursales en Santiago.',
  });
  const pacifico = automotora({
    id: 'aut-pacifico',
    nombre: 'Pacífico Motors',
    rut: rut(36298041),
    subdominio: 'pacificomotors',
    direccion: 'Av. Libertad 980, Viña del Mar',
    telefono: '+56955550200',
    email: 'ventas@example.com',
    descripcion: 'Camionetas y SUV seleccionados en la Quinta Región.',
  });
  const austral = automotora({
    id: 'aut-austral',
    nombre: 'Austral Autos',
    rut: rut(37105526),
    subdominio: 'australautos',
    direccion: 'Av. Alemania 0730, Temuco',
    telefono: '+56955550300',
    email: 'hola@example.com',
    descripcion: 'Autos usados para el sur de Chile, con garantía mecánica.',
  });

  const sLasCondes = sucursal(
    {
      id: 'suc-aromos-lascondes',
      automotoraId: aromos,
      nombre: 'Las Condes',
      direccion: 'Av. Los Aromos 1450',
      region: 'METROPOLITANA',
      comuna: 'Las Condes',
      telefono: '+56955550101',
      encargado: 'Camila Rojas',
      horarioAtencion: 'Lun a vie 9:30–19:00 · Sáb 10:00–14:00',
      whatsapp: '+56955550101',
      esPrincipal: true,
    },
    420,
  );
  const sMaipu = sucursal(
    {
      id: 'suc-aromos-maipu',
      automotoraId: aromos,
      nombre: 'Maipú',
      direccion: 'Av. Pajaritos 2870',
      region: 'METROPOLITANA',
      comuna: 'Maipú',
      telefono: '+56955550102',
      encargado: 'Diego Muñoz',
      horarioAtencion: 'Lun a sáb 10:00–19:00',
      whatsapp: '+56955550102',
      esPrincipal: false,
    },
    300,
  );
  const sVina = sucursal(
    {
      id: 'suc-pacifico-vina',
      automotoraId: pacifico,
      nombre: 'Viña del Mar',
      direccion: 'Av. Libertad 980',
      region: 'VALPARAISO',
      comuna: 'Viña del Mar',
      telefono: '+56955550201',
      encargado: 'Tomás Herrera',
      horarioAtencion: 'Lun a vie 9:00–18:30',
      whatsapp: '+56955550201',
      esPrincipal: true,
    },
    380,
  );
  const sConcon = sucursal(
    {
      id: 'suc-pacifico-concon',
      automotoraId: pacifico,
      nombre: 'Concón',
      direccion: 'Av. Borgoño 15100',
      region: 'VALPARAISO',
      comuna: 'Concón',
      telefono: '+56955550202',
      encargado: null,
      horarioAtencion: 'Sáb y dom 10:00–17:00',
      whatsapp: null,
      esPrincipal: false,
    },
    120,
  );
  const sTemuco = sucursal(
    {
      id: 'suc-austral-temuco',
      automotoraId: austral,
      nombre: 'Temuco',
      direccion: 'Av. Alemania 0730',
      region: 'ARAUCANIA',
      comuna: 'Temuco',
      telefono: '+56955550301',
      encargado: 'Fernanda Vidal',
      horarioAtencion: 'Lun a vie 9:00–18:00 · Sáb 10:00–13:30',
      whatsapp: '+56955550301',
      esPrincipal: true,
    },
    260,
  );

  const camila = usuario(
    {
      id: 'usr-aromos-camila',
      nombre: 'Camila Rojas',
      email: 'camila.rojas@example.com',
      rol: 'ADMIN_GENERAL',
      sucursalId: null,
      automotoraId: aromos,
    },
    420,
  );
  const diego = usuario(
    {
      id: 'usr-aromos-diego',
      nombre: 'Diego Muñoz',
      email: 'diego.munoz@example.com',
      rol: 'ADMIN_SUCURSAL',
      sucursalId: sMaipu,
      automotoraId: aromos,
    },
    300,
  );
  const valentina = usuario(
    {
      id: 'usr-aromos-valentina',
      nombre: 'Valentina Soto',
      email: 'valentina.soto@example.com',
      rol: 'VENDEDOR',
      sucursalId: sLasCondes,
      automotoraId: aromos,
    },
    400,
  );
  const matias = usuario(
    {
      id: 'usr-aromos-matias',
      nombre: 'Matías Fuentes',
      email: 'matias.fuentes@example.com',
      rol: 'VENDEDOR',
      sucursalId: sMaipu,
      automotoraId: aromos,
    },
    250,
  );
  usuario(
    {
      id: 'usr-aromos-ignacio',
      nombre: 'Ignacio Pérez',
      email: 'ignacio.perez@example.com',
      rol: 'VENDEDOR',
      sucursalId: sLasCondes,
      automotoraId: aromos,
      emailVerificado: false,
      invitacionPendiente: true,
    },
    2,
  );
  usuario(
    {
      id: 'usr-aromos-rodrigo',
      nombre: 'Rodrigo Lagos',
      email: 'rodrigo.lagos@example.com',
      rol: 'VENDEDOR',
      sucursalId: sMaipu,
      automotoraId: aromos,
      estado: 'INACTIVO',
    },
    280,
  );
  const tomas = usuario(
    {
      id: 'usr-pacifico-tomas',
      nombre: 'Tomás Herrera',
      email: 'tomas.herrera@example.com',
      rol: 'ADMIN_GENERAL',
      sucursalId: null,
      automotoraId: pacifico,
    },
    380,
  );
  const josefa = usuario(
    {
      id: 'usr-pacifico-josefa',
      nombre: 'Josefa Araya',
      email: 'josefa.araya@example.com',
      rol: 'VENDEDOR',
      sucursalId: sVina,
      automotoraId: pacifico,
    },
    200,
  );
  const fernanda = usuario(
    {
      id: 'usr-austral-fernanda',
      nombre: 'Fernanda Vidal',
      email: 'fernanda.vidal@example.com',
      rol: 'ADMIN_GENERAL',
      sucursalId: null,
      automotoraId: austral,
    },
    260,
  );
  const benjamin = usuario(
    {
      id: 'usr-austral-benjamin',
      nombre: 'Benjamín Castro',
      email: 'benjamin.castro@example.com',
      rol: 'VENDEDOR',
      sucursalId: sTemuco,
      automotoraId: austral,
    },
    150,
  );

  for (const s of db.sucursales) {
    const autor = db.usuarios.find(
      (u) => u.automotoraId === s.automotoraId && u.rol === 'ADMIN_GENERAL',
    )!;
    auditar(
      s.automotoraId,
      s.fechaCreacion,
      autor.id,
      s.id,
      'SUCURSAL_CREADA',
      { tipo: 'SUCURSAL', id: s.id },
      { nombre: s.nombre, comuna: s.comuna },
    );
  }

  // ---------------------------------------------------------------- Clientes

  let rutCliente = 31_204_517;
  let telefono = 10;
  const cliente = (
    automotoraId: string,
    nombre: string,
    direccion: string,
    creado: number,
    extra: Partial<FilaCliente> = {},
  ) => {
    rutCliente += 377_131;
    telefono += 7;
    const [nom, ape] = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(' ');
    const c: FilaCliente = {
      id: id('cli'),
      automotoraId,
      nombre,
      rut: rut(rutCliente),
      telefono: `+5695555${String(telefono).padStart(4, '0')}`,
      email: `${nom}.${ape}@example.com`,
      direccion,
      estado: 'ACTIVO',
      aceptaRecordatorios: true,
      fechaCreacion: instante(-creado, 12, 15),
      ...extra,
    };
    db.clientes.push(c);
    return c.id;
  };

  const cAndres = cliente(aromos, 'Andrés Valenzuela', 'Los Militares 4820, Las Condes', 170);
  const cCarolina = cliente(aromos, 'Carolina Espinoza', 'Av. Tobalaba 1120, Providencia', 160);
  const cFelipe = cliente(aromos, 'Felipe Contreras', 'Pasaje Los Olmos 345, Maipú', 150);
  const cDaniela = cliente(aromos, 'Daniela Morales', 'Av. Grecia 2100, Ñuñoa', 140);
  const cSebastian = cliente(aromos, 'Sebastián Torres', 'Camino El Alba 9600, Las Condes', 128);
  const cJaviera = cliente(aromos, 'Javiera Navarro', 'Av. Américo Vespucio 1501, Maipú', 110);
  const cCristobal = cliente(aromos, 'Cristóbal Reyes', 'San Pablo 4320, Quinta Normal', 96);
  const cAntonia = cliente(aromos, 'Antonia Gutiérrez', 'Av. Vitacura 3560, Vitacura', 80);
  const cNicolas = cliente(aromos, 'Nicolás Sepúlveda', 'Los Pajaritos 210, Maipú', 66);
  const cMartina = cliente(aromos, 'Martina Díaz', 'Av. Irarrázaval 3200, Ñuñoa', 54);
  const cJoaquin = cliente(aromos, 'Joaquín Riquelme', 'El Bosque Norte 0177, Las Condes', 40);
  const cIsidora = cliente(aromos, 'Isidora Castillo', 'Av. Lo Espejo 1430, Cerrillos', 30);
  const cGabriel = cliente(aromos, 'Gabriel Ortiz', 'Av. Macul 3800, Macul', 22);
  const cFrancisca = cliente(aromos, 'Francisca Muñoz', 'Pocuro 2350, Providencia', 15);
  const cVicente = cliente(aromos, 'Vicente Salazar', 'Av. Larraín 6700, La Reina', 8);
  const cAgustina = cliente(aromos, 'Agustina Herrera', 'Av. 5 de Abril 1200, Maipú', 4);
  const cRoberto = cliente(aromos, 'Roberto Fuenzalida', 'Av. Ossa 1820, La Reina', 300);
  const cValeria = cliente(aromos, 'Valeria Cortés', 'Av. Primo de Rivera 870, Maipú', 285);
  const cTomasA = cliente(aromos, 'Tomás Alarcón', 'Los Leones 1240, Providencia', 240);
  cliente(aromos, 'Patricio Olivares', 'Av. Departamental 990, La Florida', 190, {
    estado: 'INACTIVO',
    aceptaRecordatorios: false,
  });
  const cPRaul = cliente(pacifico, 'Raúl Cárdenas', '3 Norte 455, Viña del Mar', 90);
  const cPCamila = cliente(pacifico, 'Camila Figueroa', 'Av. San Martín 870, Viña del Mar', 60);
  const cPHector = cliente(pacifico, 'Héctor Pizarro', 'Av. Concón Reñaca 2100, Concón', 35);
  const cPLaura = cliente(pacifico, 'Laura Bravo', 'Calle Valparaíso 650, Viña del Mar', 12);
  const cASergio = cliente(austral, 'Sergio Henríquez', 'Av. Caupolicán 1450, Temuco', 75);
  const cAPaula = cliente(austral, 'Paula Jara', 'Av. Pedro de Valdivia 870, Temuco', 45);
  const cAMiguel = cliente(austral, 'Miguel Sandoval', 'Camino a Labranza km 3, Temuco', 18);

  // ---------------------------------------------------------------- Vehículos

  const vehiculo = (automotoraId: string, d: DefVehiculo, autor: string) => {
    const vid = id('veh');
    const fechaIngreso = instante(-d.ingreso, 10, 30);
    const v: FilaVehiculo = {
      id: vid,
      automotoraId,
      sucursalId: d.sucursal,
      marca: d.marca,
      modelo: d.modelo,
      anio: d.anio,
      version: d.version,
      kilometraje: d.km,
      color: d.color,
      combustible: d.combustible,
      transmision: d.transmision,
      cilindrada: d.cilindrada,
      patente: d.patente,
      categoria: d.categoria,
      traccion: d.traccion,
      descripcion: d.descripcion ?? null,
      precioVenta: d.precio,
      costoAdquisicion: d.costo,
      origen: d.origen ?? 'COMPRA_DIRECTA',
      estado: d.estado ?? 'DISPONIBLE',
      fechaIngreso,
      fotos: fotosDe(d.foto).map((url, i) => ({ id: id('foto'), url, orden: i })),
      documentos: [],
    };
    // Documentos legales vigentes (Módulo 7.5): permiso y SOAP vencen el 31 de marzo.
    const anio = Number(hoy().slice(0, 4));
    const marzo = hoy().slice(5) > '03-31' ? `${anio + 1}-03-31` : `${anio}-03-31`;
    const docs: [string, string][] = [
      ['PERMISO_CIRCULACION', marzo],
      ['SOAP', marzo],
      ['REVISION_TECNICA', sugerirVencimientoRevisionTecnica(d.patente) ?? marzo],
    ];
    const nombre = (uid: string) => db.usuarios.find((u) => u.id === uid)?.nombre ?? '—';
    for (const [tipo, fechaVencimiento] of docs) {
      v.documentos.push({
        id: id('doc'),
        tipo: tipo as DocumentoLegalDemo['tipo'],
        respaldo:
          tipo === 'SOAP'
            ? 'POLIZA_SOAP'
            : tipo === 'PERMISO_CIRCULACION'
              ? 'PERMISO_PAGO_TOTAL'
              : 'CERTIFICADO_REVISION',
        fechaVencimiento,
        fechaPrimeraInscripcion: null,
        fechaCarga: fechaIngreso,
        cargadoPor: nombre(autor),
        cargadoPorId: autor,
        vigente: true,
        archivoUrl: '/documentos/demo.pdf',
      });
    }
    db.vehiculos.push(v);
    evento(
      vid,
      'ALTA',
      `Ingreso al inventario (${v.origen === 'CONSIGNACION' ? 'consignación' : v.origen === 'PARTE_PAGO' ? 'parte de pago' : 'compra directa'})`,
      fechaIngreso,
      autor,
    );
    return v;
  };

  const base = { combustible: 'BENCINA', transmision: 'AUTOMATICA', traccion: 'X4X2' };

  // Los Aromos: inventario actual.
  const hilux = vehiculo(
    aromos,
    {
      ...base,
      foto: 'hilux',
      marca: 'Toyota',
      modelo: 'Hilux',
      version: '2.4 SRV 4x4 Cab. Doble',
      anio: 2021,
      km: 48_500,
      color: 'Gris oscuro',
      combustible: 'DIESEL',
      cilindrada: '2.4',
      patente: 'PFRT62',
      categoria: 'CAMIONETA',
      traccion: 'X4X4',
      precio: 27_990_000,
      costo: 24_200_000,
      sucursal: sLasCondes,
      ingreso: 38,
      descripcion:
        'Único dueño, mantenciones en concesionario. Pisaderas, barra antivuelco y cobertor de pick-up.',
    },
    camila,
  );
  const swift = vehiculo(
    aromos,
    {
      ...base,
      foto: 'swift',
      marca: 'Suzuki',
      modelo: 'Swift',
      version: '1.2 GL Sport',
      anio: 2022,
      km: 21_300,
      color: 'Gris',
      transmision: 'MANUAL',
      cilindrada: '1.2',
      patente: 'RHKD31',
      categoria: 'HATCHBACK',
      precio: 11_490_000,
      costo: 9_650_000,
      sucursal: sLasCondes,
      ingreso: 12,
      descripcion: 'Bajo kilometraje, pantalla multimedia con Apple CarPlay y cámara de retroceso.',
    },
    valentina,
  );
  const tucson = vehiculo(
    aromos,
    {
      ...base,
      foto: 'tucson',
      marca: 'Hyundai',
      modelo: 'Tucson',
      version: '2.0 GL 4x2',
      anio: 2020,
      km: 62_000,
      color: 'Blanco',
      cilindrada: '2.0',
      patente: 'LXPB48',
      categoria: 'SUV',
      precio: 16_990_000,
      costo: 14_300_000,
      sucursal: sLasCondes,
      ingreso: 51,
      estado: 'RESERVADO',
    },
    camila,
  );
  const sportage = vehiculo(
    aromos,
    {
      ...base,
      foto: 'sportage',
      marca: 'Kia',
      modelo: 'Sportage',
      version: '2.0 EX',
      anio: 2019,
      km: 78_400,
      color: 'Blanco',
      cilindrada: '2.0',
      patente: 'KTWS19',
      categoria: 'SUV',
      precio: 14_490_000,
      costo: 12_100_000,
      sucursal: sMaipu,
      ingreso: 74,
      descripcion: 'Llantas de aleación, sensores de estacionamiento y techo panorámico.',
    },
    diego,
  );
  const cx5 = vehiculo(
    aromos,
    {
      ...base,
      foto: 'cx5',
      marca: 'Mazda',
      modelo: 'CX-5',
      version: '2.0 R 2WD',
      anio: 2021,
      km: 35_900,
      color: 'Gris oscuro',
      cilindrada: '2.0',
      patente: 'PGJK77',
      categoria: 'SUV',
      precio: 21_490_000,
      costo: 18_600_000,
      sucursal: sLasCondes,
      ingreso: 9,
    },
    camila,
  );
  const sail = vehiculo(
    aromos,
    {
      ...base,
      foto: 'sail',
      marca: 'Chevrolet',
      modelo: 'Sail',
      version: '1.5 LT',
      anio: 2019,
      km: 84_200,
      color: 'Rojo',
      transmision: 'MANUAL',
      cilindrada: '1.5',
      patente: 'KKZR55',
      categoria: 'SEDAN',
      precio: 7_290_000,
      costo: 5_900_000,
      sucursal: sMaipu,
      ingreso: 6,
      estado: 'EN_PREPARACION',
      descripcion: 'En preparación: pulido y mantención de 80.000 km.',
    },
    diego,
  );
  const navara = vehiculo(
    aromos,
    {
      ...base,
      foto: 'navara',
      marca: 'Nissan',
      modelo: 'Navara',
      version: '2.3 LE 4x4',
      anio: 2020,
      km: 70_100,
      color: 'Cobre',
      combustible: 'DIESEL',
      cilindrada: '2.3',
      patente: 'LRTD84',
      categoria: 'CAMIONETA',
      traccion: 'X4X4',
      precio: 19_990_000,
      costo: 17_000_000,
      sucursal: sMaipu,
      ingreso: 96,
    },
    diego,
  );
  const mazda3 = vehiculo(
    aromos,
    {
      ...base,
      foto: 'mazda3',
      marca: 'Mazda',
      modelo: '3',
      version: 'Sedán 2.0 V',
      anio: 2022,
      km: 18_700,
      color: 'Rojo',
      cilindrada: '2.0',
      patente: 'RTBG23',
      categoria: 'SEDAN',
      precio: 17_990_000,
      costo: 15_400_000,
      sucursal: sLasCondes,
      ingreso: 27,
    },
    valentina,
  );
  const p208 = vehiculo(
    aromos,
    {
      ...base,
      foto: 'p208',
      marca: 'Peugeot',
      modelo: '208',
      version: '1.2 Allure Pack',
      anio: 2021,
      km: 29_800,
      color: 'Blanco',
      cilindrada: '1.2',
      patente: 'PZLW90',
      categoria: 'HATCHBACK',
      precio: 12_790_000,
      costo: 10_900_000,
      sucursal: sMaipu,
      ingreso: 19,
    },
    matias,
  );
  const rav4 = vehiculo(
    aromos,
    {
      ...base,
      foto: 'rav4',
      marca: 'Toyota',
      modelo: 'RAV4',
      version: '2.5 Hybrid AWD',
      anio: 2022,
      km: 24_600,
      color: 'Plata',
      combustible: 'HIBRIDO',
      cilindrada: '2.5',
      patente: 'RJCV14',
      categoria: 'SUV',
      traccion: 'AWD',
      precio: 29_490_000,
      costo: 26_100_000,
      sucursal: sLasCondes,
      ingreso: 15,
      estado: 'RESERVADO',
    },
    camila,
  );
  const ranger = vehiculo(
    aromos,
    {
      ...base,
      foto: 'ranger',
      marca: 'Ford',
      modelo: 'Ranger',
      version: '2.5 XLT 4x2',
      anio: 2019,
      km: 91_300,
      color: 'Rojo',
      transmision: 'MANUAL',
      cilindrada: '2.5',
      patente: 'KXPT73',
      categoria: 'CAMIONETA',
      precio: 15_990_000,
      costo: 0,
      origen: 'CONSIGNACION',
      sucursal: sMaipu,
      ingreso: 33,
    },
    diego,
  );
  const forester = vehiculo(
    aromos,
    {
      ...base,
      foto: 'forester',
      marca: 'Subaru',
      modelo: 'Forester',
      version: '2.0 Sport AWD',
      anio: 2020,
      km: 55_200,
      color: 'Negro',
      cilindrada: '2.0',
      patente: 'LPWK26',
      categoria: 'SUV',
      traccion: 'AWD',
      precio: 18_490_000,
      costo: 0,
      origen: 'CONSIGNACION',
      sucursal: sLasCondes,
      ingreso: 58,
    },
    camila,
  );
  const moto = vehiculo(
    aromos,
    {
      ...base,
      foto: 'mt03',
      marca: 'Yamaha',
      modelo: 'MT-03',
      version: null,
      anio: 2021,
      km: 9_800,
      color: 'Negro',
      transmision: 'MANUAL',
      cilindrada: '321 cc',
      patente: 'JZK82',
      categoria: 'MOTO',
      traccion: null,
      precio: 4_890_000,
      costo: 4_000_000,
      sucursal: sLasCondes,
      ingreso: 44,
    },
    valentina,
  );
  const tiggoAromos = vehiculo(
    aromos,
    {
      ...base,
      foto: 'tiggo',
      marca: 'Chery',
      modelo: 'Tiggo 3X',
      version: '1.5 GLX',
      anio: 2020,
      km: 46_000,
      color: 'Blanco',
      transmision: 'MANUAL',
      cilindrada: '1.5',
      patente: 'LBSF39',
      categoria: 'SUV',
      precio: 8_790_000,
      costo: 7_200_000,
      origen: 'COMPRA_PARTICULAR',
      sucursal: sMaipu,
      ingreso: 3,
      estado: 'PENDIENTE_REVISION',
    },
    diego,
  );

  // Los Aromos: vendidos en los últimos meses (con su historia comercial).
  const vendidosAromos = [
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'amarok',
        marca: 'Volkswagen',
        modelo: 'Amarok',
        version: '2.0 TDI Comfortline 4Motion',
        anio: 2018,
        km: 98_000,
        color: 'Plata',
        combustible: 'DIESEL',
        cilindrada: '2.0',
        patente: 'JTRW48',
        categoria: 'CAMIONETA',
        traccion: 'X4X4',
        precio: 18_990_000,
        costo: 16_100_000,
        sucursal: sLasCondes,
        ingreso: 190,
      },
      camila,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'rio',
        marca: 'Kia',
        modelo: 'Rio 5',
        version: '1.4 EX',
        anio: 2020,
        km: 41_000,
        color: 'Rojo',
        transmision: 'MANUAL',
        cilindrada: '1.4',
        patente: 'LGPS28',
        categoria: 'HATCHBACK',
        precio: 9_490_000,
        costo: 7_900_000,
        sucursal: sMaipu,
        ingreso: 175,
      },
      diego,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'accent',
        marca: 'Hyundai',
        modelo: 'Accent',
        version: '1.6 GL',
        anio: 2019,
        km: 66_500,
        color: 'Gris',
        cilindrada: '1.6',
        patente: 'KSJB61',
        categoria: 'SEDAN',
        precio: 8_990_000,
        costo: 7_300_000,
        sucursal: sMaipu,
        ingreso: 160,
      },
      matias,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'mgzs',
        marca: 'MG',
        modelo: 'ZS',
        version: '1.5 Comfort',
        anio: 2022,
        km: 15_200,
        color: 'Rojo',
        cilindrada: '1.5',
        patente: 'RBXH54',
        categoria: 'SUV',
        precio: 12_490_000,
        costo: 10_500_000,
        sucursal: sLasCondes,
        ingreso: 130,
      },
      valentina,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'yaris',
        marca: 'Toyota',
        modelo: 'Yaris',
        version: 'Sedán 1.5 GLi',
        anio: 2019,
        km: 59_000,
        color: 'Gris',
        cilindrada: '1.5',
        patente: 'KFPZ37',
        categoria: 'SEDAN',
        precio: 10_290_000,
        costo: 8_600_000,
        sucursal: sLasCondes,
        ingreso: 112,
      },
      valentina,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'crv',
        marca: 'Honda',
        modelo: 'CR-V',
        version: '1.5T EXL AWD',
        anio: 2019,
        km: 72_000,
        color: 'Plata',
        cilindrada: '1.5',
        patente: 'KWLD92',
        categoria: 'SUV',
        traccion: 'AWD',
        precio: 19_490_000,
        costo: 16_900_000,
        sucursal: sLasCondes,
        ingreso: 88,
      },
      camila,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'jimny',
        marca: 'Suzuki',
        modelo: 'Jimny',
        version: '1.5 GLX 4x4',
        anio: 2021,
        km: 22_400,
        color: 'Gris',
        transmision: 'MANUAL',
        cilindrada: '1.5',
        patente: 'PDSW45',
        categoria: 'SUV',
        traccion: 'X4X4',
        precio: 17_490_000,
        costo: 15_300_000,
        sucursal: sMaipu,
        ingreso: 70,
      },
      diego,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'corollacross',
        marca: 'Toyota',
        modelo: 'Corolla Cross',
        version: '1.8 Hybrid XEI',
        anio: 2022,
        km: 19_800,
        color: 'Plata',
        combustible: 'HIBRIDO',
        cilindrada: '1.8',
        patente: 'RLTB16',
        categoria: 'SUV',
        precio: 21_990_000,
        costo: 19_200_000,
        sucursal: sLasCondes,
        ingreso: 44,
      },
      camila,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'p208',
        marca: 'Peugeot',
        modelo: '208',
        version: '1.2 Active',
        anio: 2020,
        km: 44_100,
        color: 'Blanco',
        transmision: 'MANUAL',
        cilindrada: '1.2',
        patente: 'LFZK52',
        categoria: 'HATCHBACK',
        precio: 10_490_000,
        costo: 8_700_000,
        sucursal: sMaipu,
        ingreso: 150,
      },
      matias,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'cx5',
        marca: 'Mazda',
        modelo: 'CX-5',
        version: '2.5 GT AWD',
        anio: 2020,
        km: 52_000,
        color: 'Gris oscuro',
        cilindrada: '2.5',
        patente: 'LJWP81',
        categoria: 'SUV',
        traccion: 'AWD',
        precio: 19_990_000,
        costo: 17_300_000,
        sucursal: sLasCondes,
        ingreso: 82,
      },
      camila,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'hilux',
        marca: 'Toyota',
        modelo: 'Hilux',
        version: '2.4 DX 4x4 Cab. Doble',
        anio: 2019,
        km: 101_000,
        color: 'Gris oscuro',
        combustible: 'DIESEL',
        transmision: 'MANUAL',
        cilindrada: '2.4',
        patente: 'KPLS64',
        categoria: 'CAMIONETA',
        traccion: 'X4X4',
        precio: 21_990_000,
        costo: 19_100_000,
        sucursal: sMaipu,
        ingreso: 77,
      },
      diego,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'swift',
        marca: 'Suzuki',
        modelo: 'Swift',
        version: '1.2 GLX',
        anio: 2021,
        km: 33_500,
        color: 'Gris',
        cilindrada: '1.2',
        patente: 'PCHW27',
        categoria: 'HATCHBACK',
        precio: 10_990_000,
        costo: 9_100_000,
        sucursal: sLasCondes,
        ingreso: 40,
      },
      valentina,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'tucson',
        marca: 'Hyundai',
        modelo: 'Tucson',
        version: '2.0 GL 4x2',
        anio: 2019,
        km: 74_800,
        color: 'Blanco',
        cilindrada: '2.0',
        patente: 'KYRD35',
        categoria: 'SUV',
        precio: 15_490_000,
        costo: 13_200_000,
        sucursal: sMaipu,
        ingreso: 30,
      },
      matias,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'yaris',
        marca: 'Toyota',
        modelo: 'Yaris',
        version: 'Sedán 1.5 GLi',
        anio: 2018,
        km: 71_000,
        color: 'Gris',
        cilindrada: '1.5',
        patente: 'JWKP74',
        categoria: 'SEDAN',
        precio: 9_290_000,
        costo: 7_700_000,
        sucursal: sLasCondes,
        ingreso: 320,
      },
      camila,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'rio',
        marca: 'Kia',
        modelo: 'Rio 5',
        version: '1.4 EX',
        anio: 2019,
        km: 52_300,
        color: 'Rojo',
        transmision: 'MANUAL',
        cilindrada: '1.4',
        patente: 'KHPS17',
        categoria: 'HATCHBACK',
        precio: 8_790_000,
        costo: 7_250_000,
        sucursal: sMaipu,
        ingreso: 300,
      },
      diego,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'amarok',
        marca: 'Volkswagen',
        modelo: 'Amarok',
        version: '2.0 TDI Trendline 4x4',
        anio: 2017,
        km: 112_000,
        color: 'Plata',
        combustible: 'DIESEL',
        transmision: 'MANUAL',
        cilindrada: '2.0',
        patente: 'HXTR29',
        categoria: 'CAMIONETA',
        traccion: 'X4X4',
        precio: 16_990_000,
        costo: 14_500_000,
        sucursal: sLasCondes,
        ingreso: 275,
      },
      camila,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'accent',
        marca: 'Hyundai',
        modelo: 'Accent',
        version: '1.4 GL',
        anio: 2018,
        km: 80_200,
        color: 'Gris',
        transmision: 'MANUAL',
        cilindrada: '1.4',
        patente: 'JRZB66',
        categoria: 'SEDAN',
        precio: 7_890_000,
        costo: 6_400_000,
        sucursal: sMaipu,
        ingreso: 250,
      },
      diego,
    ),
    vehiculo(
      aromos,
      {
        ...base,
        foto: 'mazda3',
        marca: 'Mazda',
        modelo: '3',
        version: 'Sport 2.0 V',
        anio: 2021,
        km: 27_300,
        color: 'Rojo',
        cilindrada: '2.0',
        patente: 'PKTB49',
        categoria: 'HATCHBACK',
        precio: 16_490_000,
        costo: 14_100_000,
        sucursal: sLasCondes,
        ingreso: 21,
      },
      valentina,
    ),
  ];

  // Pacífico Motors y Austral Autos: inventarios más chicos.
  const pAmarok = vehiculo(
    pacifico,
    {
      ...base,
      foto: 'amarok',
      marca: 'Volkswagen',
      modelo: 'Amarok',
      version: '2.0 TDI Highline 4x4',
      anio: 2019,
      km: 88_000,
      color: 'Plata',
      combustible: 'DIESEL',
      cilindrada: '2.0',
      patente: 'KZTP51',
      categoria: 'CAMIONETA',
      traccion: 'X4X4',
      precio: 20_490_000,
      costo: 17_800_000,
      sucursal: sVina,
      ingreso: 41,
    },
    tomas,
  );
  vehiculo(
    pacifico,
    {
      ...base,
      foto: 'mgzs',
      marca: 'MG',
      modelo: 'ZS',
      version: '1.5 Comfort',
      anio: 2022,
      km: 12_900,
      color: 'Rojo',
      cilindrada: '1.5',
      patente: 'RFKW83',
      categoria: 'SUV',
      precio: 12_690_000,
      costo: 10_700_000,
      sucursal: sVina,
      ingreso: 16,
    },
    josefa,
  );
  const pCrv = vehiculo(
    pacifico,
    {
      ...base,
      foto: 'crv',
      marca: 'Honda',
      modelo: 'CR-V',
      version: '1.5T EX',
      anio: 2019,
      km: 69_500,
      color: 'Plata',
      cilindrada: '1.5',
      patente: 'KPDC24',
      categoria: 'SUV',
      precio: 18_990_000,
      costo: 16_400_000,
      sucursal: sConcon,
      ingreso: 63,
    },
    tomas,
  );
  vehiculo(
    pacifico,
    {
      ...base,
      foto: 'rio',
      marca: 'Kia',
      modelo: 'Rio 5',
      version: '1.4 LX',
      anio: 2020,
      km: 38_300,
      color: 'Rojo',
      transmision: 'MANUAL',
      cilindrada: '1.4',
      patente: 'LHWR72',
      categoria: 'HATCHBACK',
      precio: 9_290_000,
      costo: 7_800_000,
      sucursal: sVina,
      ingreso: 8,
    },
    josefa,
  );
  const pYaris = vehiculo(
    pacifico,
    {
      ...base,
      foto: 'yaris',
      marca: 'Toyota',
      modelo: 'Yaris',
      version: 'Sedán 1.5 GLi',
      anio: 2020,
      km: 47_200,
      color: 'Gris',
      cilindrada: '1.5',
      patente: 'LKBT58',
      categoria: 'SEDAN',
      precio: 10_590_000,
      costo: 8_900_000,
      sucursal: sVina,
      ingreso: 95,
    },
    tomas,
  );
  vehiculo(
    austral,
    {
      ...base,
      foto: 'accent',
      marca: 'Hyundai',
      modelo: 'Accent',
      version: '1.6 GLS',
      anio: 2019,
      km: 71_000,
      color: 'Gris',
      cilindrada: '1.6',
      patente: 'KRZD87',
      categoria: 'SEDAN',
      precio: 8_790_000,
      costo: 7_100_000,
      sucursal: sTemuco,
      ingreso: 29,
    },
    fernanda,
  );
  vehiculo(
    austral,
    {
      ...base,
      foto: 'tiggo',
      marca: 'Chery',
      modelo: 'Tiggo 3X',
      version: '1.5 GLS',
      anio: 2021,
      km: 33_000,
      color: 'Blanco',
      transmision: 'MANUAL',
      cilindrada: '1.5',
      patente: 'PBVX41',
      categoria: 'SUV',
      precio: 9_490_000,
      costo: 7_900_000,
      sucursal: sTemuco,
      ingreso: 52,
    },
    benjamin,
  );
  const aJimny = vehiculo(
    austral,
    {
      ...base,
      foto: 'jimny',
      marca: 'Suzuki',
      modelo: 'Jimny',
      version: '1.5 GLX 4x4',
      anio: 2021,
      km: 27_800,
      color: 'Gris',
      transmision: 'MANUAL',
      cilindrada: '1.5',
      patente: 'PHRZ69',
      categoria: 'SUV',
      traccion: 'X4X4',
      precio: 17_290_000,
      costo: 15_000_000,
      sucursal: sTemuco,
      ingreso: 14,
    },
    fernanda,
  );
  const aHilux = vehiculo(
    austral,
    {
      ...base,
      foto: 'hilux',
      marca: 'Toyota',
      modelo: 'Hilux',
      version: '2.4 DX 4x4',
      anio: 2020,
      km: 82_000,
      color: 'Gris oscuro',
      combustible: 'DIESEL',
      transmision: 'MANUAL',
      cilindrada: '2.4',
      patente: 'LTVC32',
      categoria: 'CAMIONETA',
      traccion: 'X4X4',
      precio: 22_990_000,
      costo: 19_800_000,
      sucursal: sTemuco,
      ingreso: 120,
    },
    fernanda,
  );

  // Cambios de precio en la bitácora de algunos autos que llevan tiempo.
  for (const [v, anterior, dias] of [
    [navara, 21_490_000, 40],
    [sportage, 14_990_000, 25],
    [forester, 18_990_000, 20],
  ] as const) {
    evento(
      v.id,
      'CAMBIO_PRECIO',
      `Precio de venta: $${anterior.toLocaleString('es-CL')} → $${v.precioVenta.toLocaleString('es-CL')}`,
      instante(-dias, 16),
      camila,
    );
    auditar(
      aromos,
      instante(-dias, 16),
      camila,
      v.sucursalId,
      'VEHICULO_CAMBIO_PRECIO',
      { tipo: 'VEHICULO', id: v.id },
      { precioVenta: v.precioVenta },
      { precioVenta: anterior },
    );
  }
  evento(sail.id, 'CAMBIO_ESTADO', 'Estado: Disponible → En preparación', instante(-5, 9), diego);

  // ---------------------------------------------------------------- Consignaciones

  const consignar = (
    v: FilaVehiculo,
    clienteId: string,
    trato: 'COMISION_VENTA' | 'PRECIO_NETO',
    valor: number,
    minimo: number,
    dias: number,
    autor: string,
  ) => {
    const cid = id('con');
    db.consignaciones.push({
      id: cid,
      folio: folio(v.automotoraId, 'CONSIGNACION'),
      automotoraId: v.automotoraId,
      vehiculoId: v.id,
      clienteId,
      tipoTrato: trato,
      porcentajeComision: trato === 'COMISION_VENTA' ? valor : null,
      montoNeto: trato === 'PRECIO_NETO' ? valor : null,
      precioMinimo: minimo,
      fechaInicio: v.fechaIngreso.slice(0, 10),
      fechaFin: dia(dias),
      estado: 'ACTIVA',
      sucursalRegistroId: v.sucursalId,
      fechaCreacion: v.fechaIngreso,
    });
    auditar(
      v.automotoraId,
      v.fechaIngreso,
      autor,
      v.sucursalId,
      'CONSIGNACION_EMITIDA',
      { tipo: 'CONSIGNACION', id: cid },
      { patente: v.patente, tipoTrato: trato },
    );
  };
  consignar(ranger, cNicolas, 'COMISION_VENTA', 8, 14_800_000, 27, diego);
  consignar(forester, cAntonia, 'PRECIO_NETO', 16_900_000, 17_500_000, 2, camila);

  // ---------------------------------------------------------------- Gastos

  let numeroGasto: Record<string, number> = {};
  const gasto = (
    automotoraId: string,
    g: {
      tipo: 'VEHICULO' | 'OPERACIONAL';
      vehiculo?: FilaVehiculo;
      sucursalId: string | null;
      categoria: string;
      monto: number;
      dias: number;
      comentario?: string;
    },
    autor: string,
  ) => {
    numeroGasto = { ...numeroGasto, [automotoraId]: (numeroGasto[automotoraId] ?? 0) + 1 };
    const gid = id('gas');
    const fecha = dia(-g.dias);
    db.gastos.push({
      id: gid,
      numero: numeroGasto[automotoraId]!,
      automotoraId,
      tipo: g.tipo,
      vehiculoId: g.vehiculo?.id ?? null,
      sucursalId: g.vehiculo?.sucursalId ?? g.sucursalId,
      categoria: g.categoria,
      monto: g.monto,
      fecha,
      comentario: g.comentario ?? null,
      adjuntoUrl: g.tipo === 'VEHICULO' ? '/gastos/boleta-demo.pdf' : null,
      estado: 'ACTIVO',
      registradoPorId: autor,
      fechaCreacion: instante(-g.dias, 17),
    });
    if (g.vehiculo) {
      evento(
        g.vehiculo.id,
        'GASTO_AGREGADO',
        `Gasto de ${etiqueta(g.categoria).toLowerCase()}: $${g.monto.toLocaleString('es-CL')}${g.comentario ? ` (${g.comentario})` : ''}`,
        instante(-g.dias, 17),
        autor,
      );
    }
    auditar(
      automotoraId,
      instante(-g.dias, 17),
      autor,
      g.vehiculo?.sucursalId ?? g.sucursalId,
      'GASTO_CREADO',
      { tipo: 'GASTO', id: gid },
      { categoria: g.categoria, monto: g.monto },
    );
  };
  const gastosVehiculo: [FilaVehiculo, string, number, number, string][] = [
    [hilux, 'MECANICA', 180_000, 35, 'Cambio de pastillas de freno'],
    [hilux, 'ESTETICA', 95_000, 34, 'Pulido y encerado'],
    [sportage, 'MECANICA', 320_000, 70, 'Mantención 80.000 km'],
    [sportage, 'ESTETICA', 60_000, 68, 'Limpieza de tapiz'],
    [tucson, 'DOCUMENTACION', 45_000, 49, 'Revisión técnica'],
    [navara, 'MECANICA', 410_000, 90, 'Kit de embrague'],
    [navara, 'ESTETICA', 120_000, 60, 'Desabollado puerta trasera'],
    [sail, 'MECANICA', 150_000, 4, 'Cambio de neumáticos delanteros'],
    [mazda3, 'ESTETICA', 70_000, 25, 'Pulido de focos'],
    [p208, 'TRAMITES', 38_000, 18, 'Transferencia'],
    [moto, 'MECANICA', 85_000, 40, 'Kit de arrastre'],
    [vendidosAromos[0]!, 'MECANICA', 260_000, 185, 'Mantención 100.000 km'],
    [vendidosAromos[3]!, 'ESTETICA', 55_000, 128, 'Lavado de motor'],
    [vendidosAromos[5]!, 'MECANICA', 190_000, 85, 'Cambio de amortiguadores'],
  ];
  for (const [v, categoria, monto, dias, comentario] of gastosVehiculo) {
    gasto(
      aromos,
      { tipo: 'VEHICULO', vehiculo: v, sucursalId: null, categoria, monto, dias, comentario },
      v.sucursalId === sMaipu ? diego : camila,
    );
  }
  // Operacionales mensuales de los últimos 6 meses.
  for (let m = 0; m < 10; m++) {
    const d = m * 30 + 3;
    gasto(
      aromos,
      {
        tipo: 'OPERACIONAL',
        sucursalId: sLasCondes,
        categoria: 'ARRIENDO',
        monto: 1_450_000,
        dias: d,
        comentario: 'Arriendo local',
      },
      camila,
    );
    gasto(
      aromos,
      {
        tipo: 'OPERACIONAL',
        sucursalId: sMaipu,
        categoria: 'ARRIENDO',
        monto: 950_000,
        dias: d,
        comentario: 'Arriendo local',
      },
      diego,
    );
    gasto(
      aromos,
      {
        tipo: 'OPERACIONAL',
        sucursalId: sLasCondes,
        categoria: 'SUELDOS_COMISIONES',
        monto: 1_650_000 + (m % 3) * 120_000,
        dias: d + 1,
      },
      camila,
    );
    gasto(
      aromos,
      {
        tipo: 'OPERACIONAL',
        sucursalId: sMaipu,
        categoria: 'SUELDOS_COMISIONES',
        monto: 1_150_000 + (m % 2) * 100_000,
        dias: d + 1,
      },
      diego,
    );
    gasto(
      aromos,
      {
        tipo: 'OPERACIONAL',
        sucursalId: sLasCondes,
        categoria: 'PUBLICIDAD',
        monto: 240_000 + (m % 2) * 50_000,
        dias: d + 8,
        comentario: 'Avisos en portales y redes sociales',
      },
      camila,
    );
    gasto(
      aromos,
      {
        tipo: 'OPERACIONAL',
        sucursalId: sMaipu,
        categoria: 'SERVICIOS_BASICOS',
        monto: 115_000 + m * 4_000,
        dias: d + 10,
      },
      diego,
    );
    gasto(
      aromos,
      {
        tipo: 'OPERACIONAL',
        sucursalId: null,
        categoria: 'CONTABILIDAD_LEGAL',
        monto: 280_000,
        dias: d + 5,
        comentario: 'Honorarios contador',
      },
      camila,
    );
  }
  gasto(
    pacifico,
    {
      tipo: 'VEHICULO',
      vehiculo: pAmarok,
      sucursalId: null,
      categoria: 'MECANICA',
      monto: 240_000,
      dias: 38,
      comentario: 'Mantención',
    },
    tomas,
  );
  gasto(
    pacifico,
    { tipo: 'OPERACIONAL', sucursalId: sVina, categoria: 'ARRIENDO', monto: 1_400_000, dias: 20 },
    tomas,
  );
  gasto(
    austral,
    {
      tipo: 'VEHICULO',
      vehiculo: aHilux,
      sucursalId: null,
      categoria: 'MECANICA',
      monto: 350_000,
      dias: 110,
      comentario: 'Correa de distribución',
    },
    fernanda,
  );
  gasto(
    austral,
    { tipo: 'OPERACIONAL', sucursalId: sTemuco, categoria: 'ARRIENDO', monto: 950_000, dias: 22 },
    fernanda,
  );

  // ---------------------------------------------------------------- Documentos comerciales

  const totalGastos = (vehiculoId: string) =>
    db.gastos
      .filter((g) => g.vehiculoId === vehiculoId && g.estado === 'ACTIVO')
      .reduce((s, g) => s + g.monto, 0);

  const cotizar = (
    v: FilaVehiculo,
    clienteId: string,
    dias: number,
    autor: string,
    opciones: {
      precio?: number;
      estado?: string;
      vigencia?: number;
      costos?: { descripcion: string; monto: number }[];
      sucursalId?: string;
    } = {},
  ) => {
    const vigencia = opciones.vigencia ?? 7;
    const fila: FilaCotizacion = {
      id: id('cot'),
      folio: folio(v.automotoraId, 'COTIZACION'),
      automotoraId: v.automotoraId,
      sucursalId: opciones.sucursalId ?? v.sucursalId,
      clienteId,
      vehiculoId: v.id,
      precioCotizado: opciones.precio ?? v.precioVenta,
      costosAdicionales: opciones.costos ?? [
        { descripcion: 'Transferencia e inscripción', monto: 180_000 },
      ],
      vigenciaDias: vigencia,
      fechaEmision: instante(-dias, 12, 20),
      fechaVencimiento: dia(-dias + vigencia),
      estado: opciones.estado ?? 'VIGENTE',
      ventaId: null,
      emitidaPorId: autor,
      anulacion: null,
    };
    db.cotizaciones.push(fila);
    evento(v.id, 'COTIZACION_GENERADA', `Cotización N° ${fila.folio}`, fila.fechaEmision, autor);
    auditar(
      v.automotoraId,
      fila.fechaEmision,
      autor,
      fila.sucursalId,
      'COTIZACION_EMITIDA',
      { tipo: 'COTIZACION', id: fila.id },
      { folio: fila.folio, precioCotizado: fila.precioCotizado },
    );
    return fila;
  };

  const reservar = (
    v: FilaVehiculo,
    clienteId: string,
    dias: number,
    monto: number,
    autor: string,
    vigencia = 5,
  ) => {
    const fila = {
      id: id('res'),
      folio: folio(v.automotoraId, 'RESERVA'),
      automotoraId: v.automotoraId,
      sucursalId: v.sucursalId,
      clienteId,
      vehiculoId: v.id,
      montoReserva: monto,
      condicionesDevolucion: 'La seña se devuelve íntegra si el financiamiento no es aprobado.',
      fechaEmision: instante(-dias, 13, 10),
      fechaVencimiento: dia(-dias + vigencia),
      estado: 'VIGENTE',
      emitidaPorId: autor,
      cancelacion: null as { motivo: string; fecha: string | null; senaRetenida: boolean } | null,
      estadoVehiculoPrevio: 'DISPONIBLE',
    };
    db.reservas.push(fila);
    evento(
      v.id,
      'RESERVA_GENERADA',
      `Reserva N° ${fila.folio} por $${monto.toLocaleString('es-CL')}`,
      fila.fechaEmision,
      autor,
    );
    auditar(
      v.automotoraId,
      fila.fechaEmision,
      autor,
      v.sucursalId,
      'RESERVA_EMITIDA',
      { tipo: 'RESERVA', id: fila.id },
      { folio: fila.folio, montoReserva: monto },
    );
    return fila;
  };

  const vender = (
    v: FilaVehiculo,
    clienteId: string,
    dias: number,
    autor: string,
    opciones: {
      precio?: number;
      cotizacion?: ReturnType<typeof cotizar>;
      reserva?: ReturnType<typeof reservar>;
      formas?: { tipo: string; monto: number; vehiculoRecibidoId?: string }[];
    } = {},
  ) => {
    const precio = opciones.precio ?? Math.round((v.precioVenta * 0.97) / 10_000) * 10_000;
    const sena = opciones.reserva?.montoReserva ?? 0;
    const costos = [{ descripcion: 'Transferencia e inscripción', monto: 180_000 }];
    const total = precio + 180_000 - sena;
    const formas = opciones.formas ?? [{ tipo: 'TRANSFERENCIA', monto: total }];
    const consignacion = db.consignaciones.find((c) => c.vehiculoId === v.id);
    const comision = consignacion
      ? consignacion.tipoTrato === 'COMISION_VENTA'
        ? Math.round((precio * (consignacion.porcentajeComision ?? 0)) / 100)
        : precio - (consignacion.montoNeto ?? 0)
      : 0;
    const fila = {
      id: id('ven'),
      folio: folio(v.automotoraId, 'VENTA'),
      automotoraId: v.automotoraId,
      sucursalId: v.sucursalId,
      clienteId,
      vehiculoId: v.id,
      precioVentaFinal: precio,
      precioPublicado: v.precioVenta,
      reservaId: opciones.reserva?.id ?? null,
      senaDescontada: sena,
      cotizacionId: opciones.cotizacion?.id ?? null,
      formasPago: formas.map((f) => ({
        tipo: f.tipo,
        monto: f.monto,
        vehiculoRecibidoId: f.vehiculoRecibidoId ?? null,
      })),
      costosAdicionales: costos,
      fechaVenta: instante(-dias, 17, 40),
      estado: 'CONFIRMADA' as const,
      vendidaPorId: autor,
      anulacion: null,
      margen: consignacion ? comision : precio - v.costoAdquisicion - totalGastos(v.id),
      liquidacion: consignacion
        ? { precioVenta: precio, comision, montoConsignante: precio - comision }
        : null,
    };
    db.ventas.push(fila);
    v.estado = 'VENDIDO';
    if (opciones.cotizacion) {
      opciones.cotizacion.estado = 'CONCRETADA';
      opciones.cotizacion.ventaId = fila.id;
    }
    if (opciones.reserva) opciones.reserva.estado = 'CONVERTIDA_EN_VENTA';
    evento(
      v.id,
      'VENTA_CONCRETADA',
      `Venta N° ${fila.folio} por $${precio.toLocaleString('es-CL')}`,
      fila.fechaVenta,
      autor,
    );
    auditar(
      v.automotoraId,
      fila.fechaVenta,
      autor,
      v.sucursalId,
      'VENTA_CONFIRMADA',
      { tipo: 'VENTA', id: fila.id },
      { folio: fila.folio, precioVentaFinal: precio },
    );
    return fila;
  };

  // Ventas de Los Aromos repartidas en ~6 meses.
  const [
    amarok,
    rio,
    accent,
    mgzs,
    yaris,
    crv,
    jimny,
    corollaCross,
    p208Vendido,
    cx5Vendido,
    hiluxVendida,
    swiftVendido,
    tucsonVendido,
    yarisAntiguo,
    rioAntiguo,
    amarokAntigua,
    accentAntiguo,
    mazda3Vendido,
  ] = vendidosAromos as [
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
    FilaVehiculo,
  ];
  const cotAmarok = cotizar(amarok, cAndres, 158, camila);
  vender(amarok, cAndres, 152, camila, {
    cotizacion: cotAmarok,
    formas: [
      { tipo: 'FINANCIAMIENTO', monto: 12_000_000 },
      { tipo: 'TRANSFERENCIA', monto: 6_600_000 },
    ],
  });
  vender(rio, cFelipe, 131, matias, {
    formas: [
      { tipo: 'EFECTIVO', monto: 2_000_000 },
      { tipo: 'TRANSFERENCIA', monto: 7_380_000 },
    ],
  });
  const resAccent = reservar(accent, cJaviera, 104, 300_000, matias);
  vender(accent, cJaviera, 101, matias, { reserva: resAccent });
  cotizar(mgzs, cDaniela, 120, valentina, { estado: 'VENCIDA' });
  const cotMgzs = cotizar(mgzs, cSebastian, 98, valentina);
  vender(mgzs, cSebastian, 93, valentina, { cotizacion: cotMgzs });
  vender(yaris, cCarolina, 64, valentina, {
    formas: [
      { tipo: 'FINANCIAMIENTO', monto: 7_000_000 },
      { tipo: 'CHEQUE', monto: 3_150_000 },
    ],
  });
  // La CR-V se pagó en parte con una Tiggo 3X, que entró al inventario (parte de pago).
  tiggoAromos.origen = 'PARTE_PAGO';
  const cotCrv = cotizar(crv, cMartina, 30, camila);
  vender(crv, cMartina, 26, camila, {
    cotizacion: cotCrv,
    formas: [
      { tipo: 'PARTE_PAGO', monto: 7_200_000, vehiculoRecibidoId: tiggoAromos.id },
      { tipo: 'TRANSFERENCIA', monto: 12_000_000 },
    ],
  });
  tiggoAromos.fechaIngreso = instante(-26, 18);
  const resJimny = reservar(jimny, cIsidora, 14, 500_000, diego);
  vender(jimny, cIsidora, 11, diego, {
    reserva: resJimny,
    formas: [
      { tipo: 'FINANCIAMIENTO', monto: 10_000_000 },
      { tipo: 'TRANSFERENCIA', monto: 6_650_000 },
    ],
  });
  const cotCross = cotizar(corollaCross, cJoaquin, 6, camila, { precio: 21_490_000 });
  vender(corollaCross, cJoaquin, 2, camila, { cotizacion: cotCross, precio: 21_490_000 });
  vender(p208Vendido, cDaniela, 118, matias, {
    formas: [
      { tipo: 'FINANCIAMIENTO', monto: 6_000_000 },
      { tipo: 'TRANSFERENCIA', monto: 4_350_000 },
    ],
  });
  const cotCx5 = cotizar(cx5Vendido, cAntonia, 60, camila);
  vender(cx5Vendido, cAntonia, 55, camila, { cotizacion: cotCx5 });
  vender(hiluxVendida, cCristobal, 44, diego, {
    formas: [
      { tipo: 'FINANCIAMIENTO', monto: 15_000_000 },
      { tipo: 'TRANSFERENCIA', monto: 6_510_000 },
    ],
  });
  const cotSwift = cotizar(swiftVendido, cFrancisca, 22, valentina);
  vender(swiftVendido, cFrancisca, 19, valentina, {
    cotizacion: cotSwift,
    formas: [
      { tipo: 'EFECTIVO', monto: 1_500_000 },
      { tipo: 'TRANSFERENCIA', monto: 9_340_000 },
    ],
  });
  const resTucsonVendido = reservar(tucsonVendido, cNicolas, 10, 300_000, matias);
  vender(tucsonVendido, cNicolas, 7, matias, {
    reserva: resTucsonVendido,
    formas: [
      { tipo: 'FINANCIAMIENTO', monto: 9_000_000 },
      { tipo: 'TRANSFERENCIA', monto: 5_890_000 },
    ],
  });
  vender(mazda3Vendido, cVicente, 4, valentina, { precio: 16_190_000 });
  vender(yarisAntiguo, cRoberto, 288, valentina, {
    formas: [
      { tipo: 'FINANCIAMIENTO', monto: 5_000_000 },
      { tipo: 'TRANSFERENCIA', monto: 4_200_000 },
    ],
  });
  vender(rioAntiguo, cValeria, 262, matias);
  const cotAmarokAntigua = cotizar(amarokAntigua, cTomasA, 236, camila);
  vender(amarokAntigua, cTomasA, 231, camila, {
    cotizacion: cotAmarokAntigua,
    formas: [
      { tipo: 'FINANCIAMIENTO', monto: 10_000_000 },
      { tipo: 'CHEQUE', monto: 6_660_000 },
    ],
  });
  vender(accentAntiguo, cValeria, 212, diego, { precio: 7_690_000 });

  // Embudo vivo: cotizaciones y reservas de lo que sigue en inventario.
  const resTucson = reservar(tucson, cGabriel, 2, 400_000, camila);
  resTucson.estadoVehiculoPrevio = 'DISPONIBLE';
  reservar(rav4, cFrancisca, 1, 800_000, valentina, 4);
  cotizar(tucson, cGabriel, 5, valentina);
  cotizar(hilux, cVicente, 3, camila, {
    costos: [
      { descripcion: 'Transferencia e inscripción', monto: 180_000 },
      { descripcion: 'Cobertor de pick-up', monto: 350_000 },
    ],
  });
  cotizar(cx5, cAgustina, 1, valentina);
  cotizar(sportage, cCristobal, 9, diego, { estado: 'VENCIDA', vigencia: 5 });
  cotizar(navara, cFelipe, 45, matias, { estado: 'VENCIDA' });
  cotizar(mazda3, cDaniela, 4, valentina, { precio: 17_490_000 });
  cotizar(p208, cNicolas, 2, matias);
  const cotAnulada = cotizar(swift, cCarolina, 8, valentina, { estado: 'ANULADA' });
  cotAnulada.anulacion = {
    motivo: 'Error en el precio cotizado; se emitió una nueva.',
    fecha: instante(-8, 15),
  };
  cotizar(swift, cCarolina, 8, valentina, { precio: 11_290_000 });
  // Una reserva cancelada con seña retenida (ingreso del período).
  const resCancelada = reservar(navara, cCristobal, 20, 300_000, matias);
  resCancelada.estado = 'CANCELADA';
  resCancelada.cancelacion = {
    motivo: 'El cliente desistió de la compra.',
    fecha: instante(-16, 11),
    senaRetenida: true,
  };

  // Tasaciones: una aceptada (dio origen a un auto), una vigente y una rechazada.
  const tasar = (
    automotoraId: string,
    sucursalId: string,
    clienteId: string,
    vehiculoTasado: (typeof db.tasaciones)[number]['vehiculoTasado'],
    oferta: number,
    dias: number,
    estado: string,
    autor: string,
  ) => {
    const fila = {
      id: id('tas'),
      folio: folio(automotoraId, 'TASACION'),
      automotoraId,
      sucursalId,
      clienteId,
      vehiculoTasado,
      ofertaMonto: oferta,
      fechaEmision: instante(-dias, 11, 45),
      fechaVencimiento: dia(-dias + 3),
      estado,
      emitidaPorId: autor,
      vehiculoCreadoId: null as string | null,
      anulacion: null,
    };
    db.tasaciones.push(fila);
    auditar(
      automotoraId,
      fila.fechaEmision,
      autor,
      sucursalId,
      'TASACION_EMITIDA',
      { tipo: 'TASACION', id: fila.id },
      { folio: fila.folio, ofertaMonto: oferta },
    );
    return fila;
  };
  tasar(
    aromos,
    sLasCondes,
    cSebastian,
    {
      patente: 'KHTV20',
      marca: 'Volkswagen',
      modelo: 'Gol',
      version: '1.6 Comfortline',
      anio: 2018,
      kilometraje: 92_000,
      estadoGeneral: 'Buen estado general; neumáticos al 50%.',
    },
    5_200_000,
    1,
    'VIGENTE',
    valentina,
  );
  tasar(
    aromos,
    sMaipu,
    cJaviera,
    {
      patente: 'JKWD83',
      marca: 'Nissan',
      modelo: 'Versa',
      version: '1.6 Sense',
      anio: 2017,
      kilometraje: 118_000,
      estadoGeneral: 'Detalles de pintura en parachoques; mecánica sin observaciones.',
    },
    4_100_000,
    12,
    'RECHAZADA',
    diego,
  );
  tasar(
    aromos,
    sLasCondes,
    cAndres,
    {
      patente: 'LDXW11',
      marca: 'Hyundai',
      modelo: 'Creta',
      version: '1.6 GL',
      anio: 2019,
      kilometraje: 64_000,
      estadoGeneral: 'Muy buen estado; mantenciones al día.',
    },
    9_800_000,
    2,
    'VIGENTE',
    camila,
  );

  // Pacífico y Austral: algo de movimiento comercial.
  const cotPYaris = cotizar(pYaris, cPRaul, 40, josefa);
  vender(pYaris, cPRaul, 36, josefa, { cotizacion: cotPYaris });
  cotizar(pAmarok, cPHector, 3, tomas);
  cotizar(pCrv, cPCamila, 2, josefa);
  reservar(pCrv, cPLaura, 1, 500_000, tomas);
  db.vehiculos.find((v) => v.id === pCrv.id)!.estado = 'RESERVADO';
  const cotAHilux = cotizar(aHilux, cASergio, 21, benjamin);
  cotAHilux.estado = 'VENCIDA';
  cotizar(aJimny, cAPaula, 4, fernanda);
  const cotAJimny2 = cotizar(aJimny, cAMiguel, 1, benjamin);
  cotAJimny2.costosAdicionales = [];

  // ---------------------------------------------------------------- Inspecciones

  // Hilux inspeccionada y aprobada con observaciones; CX-5 con una en curso.
  const hiluxSecciones = plantillaInspeccion(() => id('pto'));
  const regulares: Record<string, string> = {
    'Antigüedad de los neumáticos (fecha DOT)':
      'Neumáticos traseros de 2020: cambiar en la próxima mantención.',
    'Pintura (diferencias de tono, repintados)': 'Repintado leve en tapabarro trasero izquierdo.',
  };
  for (const s of hiluxSecciones) {
    for (const p of s.puntos) {
      const obs = regulares[p.nombre];
      p.evaluacion = (obs ? 'REGULAR' : 'BUENO') as EvaluacionInspeccion;
      p.observacion = obs ?? null;
    }
  }
  db.inspecciones.push({
    id: id('ins'),
    vehiculoId: hilux.id,
    estado: 'FINALIZADA',
    resultado: 'APROBADO_CON_OBSERVACIONES',
    kilometraje: hilux.kilometraje,
    observaciones:
      'Camioneta en muy buen estado general. Mantenciones al día según libro de servicio.',
    fechaCreacion: instante(-33, 10),
    fechaFinalizacion: instante(-33, 12, 40),
    iniciadaPorId: camila,
    finalizadaPorId: camila,
    secciones: hiluxSecciones,
  });
  evento(
    hilux.id,
    'INSPECCION_FINALIZADA',
    'Inspección pre-compra: aprobado con observaciones',
    instante(-33, 12, 40),
    camila,
  );
  const cx5Secciones = plantillaInspeccion(() => id('pto'));
  for (const p of cx5Secciones[0]!.puntos) p.evaluacion = 'BUENO';
  db.inspecciones.push({
    id: id('ins'),
    vehiculoId: cx5.id,
    estado: 'BORRADOR',
    resultado: null,
    kilometraje: cx5.kilometraje,
    observaciones: null,
    fechaCreacion: instante(-1, 16),
    fechaFinalizacion: null,
    iniciadaPorId: valentina,
    finalizadaPorId: null,
    secciones: cx5Secciones,
  });

  // ---------------------------------------------------------------- Notificaciones

  const notificar = (
    automotoraId: string,
    sucursalId: string,
    tipo: string,
    mensaje: string,
    dias: number,
    referencias: (typeof db.notificaciones)[number]['referencias'],
  ) =>
    db.notificaciones.push({
      id: id('not'),
      automotoraId,
      tipo,
      mensaje,
      sucursalId,
      fechaGeneracion: instante(-dias, 8),
      estado: 'PENDIENTE',
      fechaResolucion: null,
      referencias,
    });
  const reservaRav4 = db.reservas.find((r) => r.vehiculoId === rav4.id)!;
  notificar(
    aromos,
    sLasCondes,
    'RESERVA_POR_VENCER',
    `La reserva N° ${reservaRav4.folio} del Toyota RAV4 (RJCV14) vence mañana.`,
    0,
    [
      { tipo: 'RESERVA', id: reservaRav4.id },
      { tipo: 'VEHICULO', id: rav4.id },
    ],
  );
  const consForester = db.consignaciones.find((c) => c.vehiculoId === forester.id)!;
  notificar(
    aromos,
    sLasCondes,
    'CONSIGNACION_POR_VENCER',
    `La consignación del Subaru Forester (LPWK26) vence en 2 días.`,
    0,
    [
      { tipo: 'CONSIGNACION', id: consForester.id },
      { tipo: 'VEHICULO', id: forester.id },
    ],
  );
  notificar(
    aromos,
    sMaipu,
    'DOCUMENTO_LEGAL_POR_VENCER',
    'La revisión técnica del Nissan Navara (LRTD84) vence pronto.',
    1,
    [{ tipo: 'VEHICULO', id: navara.id }],
  );
  notificar(
    pacifico,
    sConcon,
    'RESERVA_POR_VENCER',
    'La reserva del Honda CR-V (KPDC24) vence pronto.',
    0,
    [{ tipo: 'VEHICULO', id: pCrv.id }],
  );

  // Auditoría y bitácora en orden cronológico inverso (como las devuelve la API).
  db.auditoria.sort((a, b) => b.fecha.localeCompare(a.fecha));
  db.bitacora.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return db;
}
