import 'dotenv/config';
import 'reflect-metadata';
import { unlink } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import type { Pool } from 'pg';
import { AppModule } from '../app.module';
import { AlmacenamientoService } from '../common/almacenamiento/almacenamiento.service';
import { hoyEnChile } from '../common/fechas';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { PG_POOL } from '../db/pool';
import { AutomotorasService } from '../modules/automotoras/automotoras.service';
import { ClientesService } from '../modules/clientes/clientes.service';
import { ConsignacionesService } from '../modules/consignaciones/consignaciones.service';
import { ConsignacionesTareas } from '../modules/consignaciones/consignaciones.tareas';
import { CotizacionesService } from '../modules/cotizaciones/cotizaciones.service';
import { GastosService } from '../modules/gastos/gastos.service';
import { ReservasService } from '../modules/reservas/reservas.service';
import { SucursalesService } from '../modules/sucursales/sucursales.service';
import { TasacionesService } from '../modules/tasaciones/tasaciones.service';
import { VehiculoArchivosService } from '../modules/vehiculos/vehiculo-archivos.service';
import { VehiculosService } from '../modules/vehiculos/vehiculos.service';
import { VencimientosTareas } from '../modules/vencimientos/vencimientos.tareas';
import { VentasService } from '../modules/ventas/ventas.service';
import { pngDemo } from './imagen-demo';

// Puebla una automotora YA registrada con datos de demostración y ~6 meses de
// historia: vehículos, clientes, tasaciones, cotizaciones, reservas,
// consignaciones, ventas y gastos, con utilidad neta positiva cada mes.
// Pensado para la cuenta demo de producción.
//
// Usa los Services reales (folios, bitácora, auditoría y reglas de negocio
// intactos). Cada paso se ejecuta "hoy" y después se corre hacia atrás: las
// fechas de lo que ese paso creó se restan en bloque. Los pasos se ordenan por
// fecha antes de ejecutarse, así los folios quedan correlativos en el tiempo.
// La auditoría es inmutable: registra la fecha real de carga.
//
// Salvaguardas: no crea usuarios, no publica vehículos (nada aparece en el
// marketplace), apaga los correos automáticos de la automotora y los clientes
// usan direcciones @example.com (dominio reservado, nunca recibe correo).
// Sin REINICIAR se niega a correr si la automotora ya tiene vehículos.
//
// Uso (en el VPS, desde deploy/):
//   docker compose run --rm -e SUBDOMINIO=demo -e CONFIRMAR=demo api node dist/scripts/poblar-demo.js
// REINICIAR=demo borra antes los datos de negocio de esa automotora (vehículos,
// clientes, documentos, gastos y fotos); conserva usuarios, sucursales y auditoría.

type Color = 'Rojo' | 'Blanco' | 'Negro' | 'Gris' | 'Azul' | 'Plateado' | 'Verde';
const COLORES: Record<Color, [number, number, number]> = {
  Rojo: [200, 40, 45],
  Blanco: [235, 235, 235],
  Negro: [45, 45, 50],
  Gris: [130, 135, 140],
  Azul: [40, 80, 170],
  Plateado: [185, 190, 195],
  Verde: [40, 120, 80],
};

const CLIENTES = [
  'Ana Pérez Soto',
  'Jorge Castillo Rivas',
  'Paula Herrera Díaz',
  'Matías Fuentes Lagos',
  'Camila Reyes Muñoz',
  'Felipe Contreras Vega',
  'Daniela Rojas Pinto',
  'Ignacio Morales Paz',
  'Valentina Silva Núñez',
  'Tomás Araya Bravo',
  'Francisca Torres León',
  'Benjamín Guzmán Ortiz',
  'Josefa Vargas Campos',
  'Sebastián Núñez Flores',
  'Constanza Muñoz Ríos',
  'Cristóbal Espinoza Gil',
  'Antonia Sepúlveda Mora',
  'Vicente Carrasco Leiva',
  'Martina Jara Olivares',
  'Diego Salinas Toro',
  'Catalina Fuentealba Ruiz',
  'Joaquín Méndez Aravena',
];

// RUT ficticio con dígito verificador válido.
function rut(n: number) {
  let suma = 0;
  let factor = 2;
  for (const d of String(n).split('').reverse()) {
    suma += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (suma % 11);
  return `${n.toLocaleString('es-CL')}-${dv === 11 ? '0' : dv === 10 ? 'K' : dv}`;
}

async function main() {
  const subdominio = process.env.SUBDOMINIO;
  if (!subdominio || process.env.CONFIRMAR !== subdominio) {
    throw new Error('Indica SUBDOMINIO=<automotora> y CONFIRMAR=<el mismo subdominio>');
  }
  const reiniciar = process.env.REINICIAR === subdominio;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const pool = app.get<Pool>(PG_POOL);
  const almacenamiento = app.get(AlmacenamientoService);
  const automotoras = app.get(AutomotorasService);
  const sucursales = app.get(SucursalesService);
  const clientes = app.get(ClientesService);
  const vehiculos = app.get(VehiculosService);
  const archivos = app.get(VehiculoArchivosService);
  const gastos = app.get(GastosService);
  const tasaciones = app.get(TasacionesService);
  const cotizaciones = app.get(CotizacionesService);
  const reservas = app.get(ReservasService);
  const consignaciones = app.get(ConsignacionesService);
  const ventas = app.get(VentasService);

  const { rows: encontradas } = await pool.query<{ id: string; vehiculos: string }>(
    `SELECT a.id, (SELECT count(*) FROM vehiculo v WHERE v.automotora_id = a.id) AS vehiculos
       FROM automotora a WHERE a.subdominio = $1`,
    [subdominio],
  );
  const automotora = encontradas[0];
  if (!automotora) throw new Error(`No existe la automotora "${subdominio}"`);
  if (Number(automotora.vehiculos) > 0 && !reiniciar) {
    throw new Error(
      `"${subdominio}" ya tiene vehículos: usa REINICIAR=${subdominio} para borrarlos y volver a poblar`,
    );
  }
  if (reiniciar) await borrarDatos(pool, automotora.id, almacenamiento.raiz);

  // Actúa como el primer Admin General (el usuario que registró la automotora).
  const { rows: admins } = await pool.query<{ id: string; sucursal_id: string | null }>(
    `SELECT id, sucursal_id FROM usuario
      WHERE automotora_id = $1 AND rol = 'ADMIN_GENERAL'
      ORDER BY fecha_creacion LIMIT 1`,
    [automotora.id],
  );
  if (!admins[0]) throw new Error('La automotora no tiene un Admin General');
  const ag = {
    id: admins[0].id,
    automotoraId: automotora.id,
    sucursalId: admins[0].sucursal_id,
    rol: 'ADMIN_GENERAL',
  } as UsuarioAutenticado;

  // Ejecuta `paso` hoy y corre `dias` hacia atrás todo lo que creó o fechó.
  const hace = async <T>(dias: number, paso: () => Promise<T>): Promise<T> => {
    const { rows } = await pool.query<{ marca: Date }>('SELECT clock_timestamp() AS marca');
    const marca = rows[0].marca;
    const resultado = await paso();
    if (dias === 0) return resultado;
    const p = [automotora.id, marca, dias];
    const atras = (col: string) => `${col} = ${col} - make_interval(days => $3)`;
    const dia = (col: string) => `${col} = ${col} - $3::int`;
    const sentencias = [
      `UPDATE cliente SET ${atras('fecha_creacion')} WHERE automotora_id = $1 AND fecha_creacion >= $2`,
      `UPDATE vehiculo SET ${atras('fecha_ingreso')} WHERE automotora_id = $1 AND fecha_ingreso >= $2`,
      `UPDATE vehiculo_bitacora b SET ${atras('fecha')}
         FROM vehiculo v WHERE v.id = b.vehiculo_id AND v.automotora_id = $1 AND b.fecha >= $2`,
      `UPDATE tasacion SET ${atras('fecha_emision')}, ${dia('fecha_vencimiento')}
        WHERE automotora_id = $1 AND fecha_emision >= $2`,
      `UPDATE tasacion SET ${atras('fecha_anulacion')} WHERE automotora_id = $1 AND fecha_anulacion >= $2`,
      `UPDATE cotizacion SET ${atras('fecha_emision')}, ${dia('fecha_vencimiento')}
        WHERE automotora_id = $1 AND fecha_emision >= $2`,
      `UPDATE cotizacion SET ${atras('fecha_anulacion')} WHERE automotora_id = $1 AND fecha_anulacion >= $2`,
      `UPDATE reserva SET ${atras('fecha_emision')}, ${dia('fecha_vencimiento')}
        WHERE automotora_id = $1 AND fecha_emision >= $2`,
      `UPDATE reserva SET ${atras('fecha_cancelacion')} WHERE automotora_id = $1 AND fecha_cancelacion >= $2`,
      `UPDATE venta SET ${atras('fecha_venta')} WHERE automotora_id = $1 AND fecha_venta >= $2`,
      `UPDATE consignacion SET ${atras('fecha_creacion')}, ${dia('fecha_inicio')}, ${dia('fecha_fin')}
        WHERE automotora_id = $1 AND fecha_creacion >= $2`,
      `UPDATE gasto SET ${atras('fecha_creacion')}, ${dia('fecha')}
        WHERE automotora_id = $1 AND fecha_creacion >= $2`,
    ];
    for (const sql of sentencias) await pool.query(sql, p);
    return resultado;
  };

  const hoy = hoyEnChile();
  const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  // ------------------------------------------------------------ configuración
  // Sin correos automáticos: los clientes de la demo son ficticios.
  await automotoras.actualizar(
    {
      descripcion:
        'Automotora de demostración: autos seminuevos revisados, con financiamiento y recepción en parte de pago.',
      correoCotizacion: false,
      correoReserva: false,
      correoTasacion: false,
      correoVenta: false,
      correoConsignacion: false,
      diasSeguimientoCotizacion: null,
      diasAvisoCotizacion: null,
      diasAvisoReserva: null,
      diasAvisoTasacion: null,
    },
    ag,
  );

  const lista = await sucursales.listar(ag);
  const matriz = lista[0];
  await sucursales.actualizar(
    matriz.id,
    { horarioAtencion: 'Lun a Vie 9:00–19:00, Sáb 10:00–14:00', whatsapp: '+56912345678' },
    ag,
  );
  // La de Viña se conserva al reiniciar (la auditoría la referencia).
  const vina =
    lista.find((s) => s.nombre === 'Sucursal Viña del Mar') ??
    (await hace(178, () =>
      sucursales.crear(
        {
          nombre: 'Sucursal Viña del Mar',
          direccion: 'Av. Libertad 555',
          region: 'VALPARAISO',
          comuna: 'Viña del Mar',
          telefono: '+56322556677',
          horarioAtencion: 'Lun a Sáb 10:00–19:00',
          whatsapp: '+56987654321',
        },
        ag,
      ),
    ));
  const sucursal = (s: 'matriz' | 'vina') => (s === 'vina' ? vina.id : matriz.id);

  // ------------------------------------------------- línea de tiempo (eventos)
  // Cada evento se registra con sus días atrás; al final se ejecutan en orden
  // cronológico. `ids` guarda lo creado para que eventos posteriores lo usen.
  const eventos: { dias: number; orden: number; paso: () => Promise<unknown> }[] = [];
  const en = (dias: number, paso: () => Promise<unknown>) =>
    eventos.push({ dias, orden: eventos.length, paso });
  const ids: Record<string, string> = {};
  const idDe = (r: unknown) => (r as { id: string }).id;

  // Clientes: se crean la primera vez que aparecen (con la fecha de ese evento).
  const clienteIds: string[] = [];
  const cliente = async (i: number) => {
    if (clienteIds[i]) return clienteIds[i];
    const nombre = CLIENTES[i];
    const correo = nombre
      .split(' ')
      .slice(0, 2)
      .join('.')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    const c = await clientes.crear(
      {
        nombre,
        rut: rut(11_000_000 + i * 437_911),
        telefono: `+569${String(81_000_000 + i * 371_293).slice(0, 8)}`,
        email: `${correo}@example.com`,
        direccion: i % 3 === 0 ? 'Viña del Mar' : 'Santiago',
      },
      ag,
    );
    clienteIds[i] = c.id;
    return c.id;
  };

  type Alta = {
    k: string;
    dias: number;
    suc: 'matriz' | 'vina';
    marca: string;
    modelo: string;
    version: string;
    anio: number;
    km: number;
    color: Color;
    comb: string;
    trans: string;
    cat: string;
    trac?: string;
    patente: string;
    precio: number;
    costo?: number;
    consig?: { cli: number; comision: number; minimo: number };
    tasacion?: string; // clave de una tasación aceptada: auto comprado a un particular
    gastos?: [string, number, string][];
  };
  const GASTOS_TIPICOS: [string, number, string][][] = [
    [
      ['ESTETICA', 160_000, 'Pulido y encerado'],
      ['DOCUMENTACION', 95_000, 'Revisión técnica y SOAP'],
    ],
    [
      ['MECANICA', 280_000, 'Mantención y cambio de aceite'],
      ['ESTETICA', 120_000, 'Lavado de tapiz'],
    ],
    [
      ['MECANICA', 340_000, 'Pastillas y discos de freno'],
      ['TRAMITES', 70_000, 'Certificado de anotaciones y multas'],
    ],
    [
      ['MECANICA', 190_000, 'Neumáticos delanteros'],
      ['ESTETICA', 90_000, 'Detallado de interior'],
    ],
  ];
  const alta = (v: Alta) => {
    en(v.dias, async () => {
      const creado = await vehiculos.crear(
        {
          marca: v.marca,
          modelo: v.modelo,
          version: v.version,
          anio: v.anio,
          kilometraje: v.km,
          color: v.color,
          combustible: v.comb,
          transmision: v.trans,
          categoria: v.cat,
          traccion: v.trac ?? 'X4X2',
          patente: v.patente,
          precioVenta: v.precio,
          origen: v.consig ? 'CONSIGNACION' : v.tasacion ? 'COMPRA_PARTICULAR' : 'COMPRA_DIRECTA',
          costoAdquisicion: v.consig ? undefined : v.costo,
          tasacionId: v.tasacion ? ids[v.tasacion] : undefined,
          sucursalId: sucursal(v.suc),
          descripcion: `${v.marca} ${v.modelo} ${v.version} ${v.anio}, ${v.km.toLocaleString('es-CL')} km. Mantenciones al día y papeles en regla.`,
          consignacion: v.consig
            ? {
                clienteId: await cliente(v.consig.cli),
                tipoTrato: 'COMISION_VENTA',
                porcentajeComision: v.consig.comision,
                precioMinimo: v.consig.minimo,
                fechaFin: enDias(90),
              }
            : undefined,
        } as never,
        ag,
      );
      ids[v.k] = creado.id;
      const base = COLORES[v.color];
      await archivos.subirFotos(
        creado.id,
        Array.from({ length: 4 }, (_, i) => ({
          buffer: pngDemo(base.map((c) => Math.max(0, c - i * 22)) as [number, number, number]),
        })),
        ag,
      );
    });
    // Preparación: dos gastos en la primera semana. Los consignados no llevan:
    // el auto no es de la automotora y su liquidación no descuenta gastos.
    const lista = v.gastos ?? GASTOS_TIPICOS[v.patente.charCodeAt(0) % GASTOS_TIPICOS.length];
    lista
      .slice(0, v.consig ? 0 : 2)
      .forEach(([categoria, monto, comentario], i) =>
        en(v.dias - 2 - i * 3, () =>
          gastos.crear(
            ids[v.k],
            { categoria: categoria as never, monto, fecha: hoy, comentario },
            undefined,
            ag,
          ),
        ),
      );
  };

  const cotizar = (dias: number, k: string, cli: number, precio: number, clave?: string) =>
    en(dias, async () => {
      const c = await cotizaciones.emitir(
        {
          vehiculoId: ids[k],
          clienteId: await cliente(cli),
          precioCotizado: precio,
          costosAdicionales: [{ descripcion: 'Transferencia e inscripción', monto: 190_000 }],
        },
        ag,
      );
      if (clave) ids[clave] = idDe(c);
    });

  // Venta; opcionalmente con cotización previa (concretada) o reserva previa.
  const vender = (
    dias: number,
    k: string,
    cli: number,
    precio: number,
    o: { cotizada?: number; reservada?: number; formas?: unknown[] } = {},
  ) => {
    const sena = 300_000;
    if (o.cotizada) cotizar(o.cotizada, k, cli, precio + 150_000, `cot-${k}`);
    if (o.reservada) {
      en(o.reservada, async () => {
        const r = await reservas.emitir(
          { vehiculoId: ids[k], clienteId: await cliente(cli), montoReserva: sena },
          ag,
        );
        ids[`res-${k}`] = idDe(r);
      });
    }
    en(dias, async () =>
      ventas.cerrar(
        {
          vehiculoId: ids[k],
          clienteId: await cliente(cli),
          precioVentaFinal: precio,
          cotizacionId: o.cotizada ? ids[`cot-${k}`] : undefined,
          reservaId: o.reservada ? ids[`res-${k}`] : undefined,
          formasPago: (o.formas as never) ?? [
            { tipo: 'TRANSFERENCIA', monto: precio - (o.reservada ? sena : 0) },
          ],
        },
        ag,
      ),
    );
  };

  const tasar = (
    dias: number,
    k: string,
    cli: number,
    auto: {
      patente: string;
      marca: string;
      modelo: string;
      version: string;
      anio: number;
      km: number;
    },
    oferta: number,
    estadoGeneral: string,
  ) =>
    en(dias, async () => {
      const t = await tasaciones.emitir(
        {
          clienteId: await cliente(cli),
          sucursalId: matriz.id,
          patente: auto.patente,
          marca: auto.marca,
          modelo: auto.modelo,
          version: auto.version,
          anio: auto.anio,
          kilometraje: auto.km,
          estadoGeneral,
          ofertaMonto: oferta,
        },
        ag,
      );
      ids[k] = idDe(t);
    });

  // ---- Junio: 3 ventas
  alta({
    k: 'sail',
    dias: 178,
    suc: 'matriz',
    marca: 'Chevrolet',
    modelo: 'Sail',
    version: 'LT',
    anio: 2019,
    km: 72000,
    color: 'Gris',
    comb: 'BENCINA',
    trans: 'MANUAL',
    cat: 'SEDAN',
    patente: 'KXBW19',
    precio: 6_990_000,
    costo: 4_900_000,
  });
  alta({
    k: 'tucson',
    dias: 175,
    suc: 'vina',
    marca: 'Hyundai',
    modelo: 'Tucson',
    version: 'GLS',
    anio: 2021,
    km: 33000,
    color: 'Negro',
    comb: 'DIESEL',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    patente: 'PFGH21',
    precio: 21_490_000,
    costo: 18_000_000,
  });
  alta({
    k: 'yaris',
    dias: 172,
    suc: 'matriz',
    marca: 'Toyota',
    modelo: 'Yaris',
    version: 'Sport',
    anio: 2021,
    km: 38000,
    color: 'Rojo',
    comb: 'BENCINA',
    trans: 'MANUAL',
    cat: 'SEDAN',
    patente: 'LKJH21',
    precio: 11_490_000,
    costo: 8_900_000,
  });
  tasar(
    160,
    'tas-cerato',
    14,
    { patente: 'JWKP19', marca: 'Kia', modelo: 'Cerato', version: 'EX', anio: 2019, km: 64000 },
    7_200_000,
    'Buen estado general. Detalle en parachoques trasero; mantenciones en concesionario.',
  );
  en(157, () => tasaciones.resolver(ids['tas-cerato'], 'ACEPTADA', ag));
  vender(158, 'sail', 0, 6_800_000, { cotizada: 164 });
  alta({
    k: 'cerato',
    dias: 155,
    suc: 'matriz',
    tasacion: 'tas-cerato',
    marca: 'Kia',
    modelo: 'Cerato',
    version: 'EX',
    anio: 2019,
    km: 64000,
    color: 'Blanco',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SEDAN',
    patente: 'JWKP19',
    precio: 9_490_000,
    costo: 7_200_000,
  });
  alta({
    k: 'cx5',
    dias: 152,
    suc: 'matriz',
    marca: 'Mazda',
    modelo: 'CX-5',
    version: 'GT',
    anio: 2020,
    km: 54000,
    color: 'Azul',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    trac: 'AWD',
    patente: 'JRTV20',
    precio: 19_990_000,
    consig: { cli: 2, comision: 7, minimo: 18_500_000 },
  });
  vender(150, 'tucson', 3, 21_200_000, { cotizada: 156 });
  alta({
    k: 'rio',
    dias: 148,
    suc: 'matriz',
    marca: 'Kia',
    modelo: 'Rio 5',
    version: 'EX',
    anio: 2018,
    km: 88000,
    color: 'Plateado',
    comb: 'BENCINA',
    trans: 'MANUAL',
    cat: 'HATCHBACK',
    patente: 'HGFD18',
    precio: 7_490_000,
    costo: 5_300_000,
  });
  alta({
    k: 'versa',
    dias: 145,
    suc: 'matriz',
    marca: 'Nissan',
    modelo: 'Versa',
    version: 'Sense',
    anio: 2019,
    km: 70000,
    color: 'Blanco',
    comb: 'BENCINA',
    trans: 'MANUAL',
    cat: 'SEDAN',
    patente: 'KPLM19',
    precio: 7_990_000,
    costo: 5_700_000,
  });
  vender(140, 'yaris', 4, 11_300_000, { reservada: 144 });
  alta({
    k: 'navara',
    dias: 135,
    suc: 'vina',
    marca: 'Nissan',
    modelo: 'Navara',
    version: 'LE 4x4',
    anio: 2019,
    km: 98000,
    color: 'Gris',
    comb: 'DIESEL',
    trans: 'MANUAL',
    cat: 'CAMIONETA',
    trac: 'X4X4',
    patente: 'KRTS19',
    precio: 19_990_000,
    consig: { cli: 5, comision: 7, minimo: 18_500_000 },
  });
  // ---- Julio: 4 ventas (una con parte de pago y una consignada)
  alta({
    k: 'duster',
    dias: 132,
    suc: 'vina',
    marca: 'Renault',
    modelo: 'Duster',
    version: 'Dynamique',
    anio: 2017,
    km: 121000,
    color: 'Verde',
    comb: 'BENCINA',
    trans: 'MANUAL',
    cat: 'SUV',
    patente: 'HXRT17',
    precio: 8_990_000,
    costo: 7_100_000,
  });
  vender(128, 'rio', 6, 7_300_000, { cotizada: 133 });
  alta({
    k: 'accent',
    dias: 125,
    suc: 'vina',
    marca: 'Hyundai',
    modelo: 'Accent',
    version: 'GL',
    anio: 2020,
    km: 60000,
    color: 'Gris',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SEDAN',
    patente: 'JKLP20',
    precio: 9_490_000,
    costo: 7_200_000,
  });
  tasar(
    122,
    'tas-rechazada',
    15,
    {
      patente: 'GHTY16',
      marca: 'Volkswagen',
      modelo: 'Gol',
      version: 'Comfortline',
      anio: 2016,
      km: 132000,
    },
    3_900_000,
    'Desgaste de embrague y choque reparado en puerta trasera.',
  );
  en(119, () => tasaciones.resolver(ids['tas-rechazada'], 'RECHAZADA', ag));
  alta({
    k: 'ranger',
    dias: 120,
    suc: 'vina',
    marca: 'Ford',
    modelo: 'Ranger',
    version: 'XLT',
    anio: 2020,
    km: 80000,
    color: 'Gris',
    comb: 'DIESEL',
    trans: 'AUTOMATICA',
    cat: 'CAMIONETA',
    trac: 'X4X4',
    patente: 'LFGT20',
    precio: 22_990_000,
    costo: 19_500_000,
  });
  vender(118, 'versa', 1, 7_800_000, {
    formas: [
      { tipo: 'EFECTIVO', monto: 4_800_000 },
      {
        tipo: 'PARTE_PAGO',
        monto: 3_000_000,
        vehiculoRecibido: {
          patente: 'DFGH15',
          marca: 'Chevrolet',
          modelo: 'Spark',
          anio: 2015,
          kilometraje: 110000,
          color: 'Rojo',
        },
      },
    ],
  });
  alta({
    k: 'swift',
    dias: 115,
    suc: 'matriz',
    marca: 'Suzuki',
    modelo: 'Swift',
    version: 'GLX',
    anio: 2020,
    km: 41000,
    color: 'Verde',
    comb: 'BENCINA',
    trans: 'MANUAL',
    cat: 'HATCHBACK',
    patente: 'LBCD20',
    precio: 8_990_000,
    costo: 6_600_000,
  });
  vender(112, 'cerato', 7, 9_300_000, { cotizada: 116 });
  alta({
    k: 'mg',
    dias: 110,
    suc: 'matriz',
    marca: 'MG',
    modelo: 'ZS',
    version: 'Comfort',
    anio: 2022,
    km: 18000,
    color: 'Rojo',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    patente: 'RTWS22',
    precio: 13_490_000,
    costo: 10_900_000,
  });
  vender(108, 'cx5', 5, 19_500_000);
  en(106, async () => {
    const r = await reservas.emitir(
      { vehiculoId: ids.swift, clienteId: await cliente(9), montoReserva: 250_000 },
      ag,
    );
    ids['res-cancelada'] = idDe(r);
  });
  en(103, () =>
    reservas.cancelar(ids['res-cancelada'], 'El cliente no consiguió el crédito', false, ag),
  );
  // ---- Agosto: 4 ventas
  alta({
    k: 'rav4',
    dias: 100,
    suc: 'matriz',
    marca: 'Toyota',
    modelo: 'RAV4',
    version: 'Hybrid',
    anio: 2022,
    km: 25000,
    color: 'Blanco',
    comb: 'HIBRIDO',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    trac: 'AWD',
    patente: 'PRST22',
    precio: 27_990_000,
    costo: 24_300_000,
  });
  vender(98, 'accent', 8, 9_300_000, { cotizada: 104 });
  tasar(
    96,
    'tas-vencida',
    16,
    {
      patente: 'FTRW15',
      marca: 'Toyota',
      modelo: 'Corolla',
      version: 'GLi',
      anio: 2015,
      km: 145000,
    },
    6_100_000,
    'Mecánica sana; pintura opaca en techo y capó.',
  );
  alta({
    k: 'forester',
    dias: 95,
    suc: 'vina',
    marca: 'Subaru',
    modelo: 'Forester',
    version: 'XS',
    anio: 2021,
    km: 42000,
    color: 'Verde',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    trac: 'AWD',
    patente: 'PLKJ21',
    precio: 20_990_000,
    costo: 17_900_000,
  });
  vender(90, 'ranger', 10, 22_600_000, { cotizada: 95 });
  alta({
    k: 'corolla',
    dias: 85,
    suc: 'matriz',
    marca: 'Toyota',
    modelo: 'Corolla',
    version: 'XEi',
    anio: 2020,
    km: 62000,
    color: 'Plateado',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SEDAN',
    patente: 'LRTY20',
    precio: 13_990_000,
    consig: { cli: 11, comision: 7, minimo: 13_000_000 },
  });
  cotizar(84, 'rav4', 17, 27_600_000);
  vender(80, 'swift', 12, 8_800_000);
  alta({
    k: 'peugeot',
    dias: 80,
    suc: 'vina',
    marca: 'Peugeot',
    modelo: '208',
    version: 'Active',
    anio: 2021,
    km: 30000,
    color: 'Azul',
    comb: 'BENCINA',
    trans: 'MANUAL',
    cat: 'HATCHBACK',
    patente: 'PZXC21',
    precio: 10_490_000,
    costo: 8_100_000,
  });
  vender(75, 'mg', 13, 13_300_000, { cotizada: 79 });
  tasar(
    72,
    'tas-kicks',
    18,
    {
      patente: 'KKTS20',
      marca: 'Nissan',
      modelo: 'Kicks',
      version: 'Advance',
      anio: 2020,
      km: 47000,
    },
    9_500_000,
    'Muy buen estado, único dueño, mantenciones al día.',
  );
  en(70, () => tasaciones.resolver(ids['tas-kicks'], 'ACEPTADA', ag));
  // ---- Septiembre: 3 ventas
  alta({
    k: 'kicks',
    dias: 69,
    suc: 'matriz',
    tasacion: 'tas-kicks',
    marca: 'Nissan',
    modelo: 'Kicks',
    version: 'Advance',
    anio: 2020,
    km: 47000,
    color: 'Blanco',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    patente: 'KKTS20',
    precio: 12_490_000,
    costo: 9_500_000,
  });
  vender(66, 'rav4', 19, 27_600_000, { cotizada: 71 });
  cotizar(64, 'duster', 9, 8_700_000, 'cot-duster');
  en(62, () => cotizaciones.anular(ids['cot-duster'], 'El cliente encontró otro vehículo', ag));
  alta({
    k: 'sportage',
    dias: 60,
    suc: 'matriz',
    marca: 'Kia',
    modelo: 'Sportage',
    version: 'EX',
    anio: 2021,
    km: 39000,
    color: 'Negro',
    comb: 'DIESEL',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    patente: 'PWER21',
    precio: 18_490_000,
    costo: 15_400_000,
  });
  vender(58, 'forester', 20, 20_700_000);
  en(56, () =>
    vehiculos.cambiarEstado(
      ids.duster,
      { estado: 'DADO_DE_BAJA', motivo: 'Falla de motor: se vende a desarme' } as never,
      ag,
    ),
  );
  alta({
    k: 'creta',
    dias: 55,
    suc: 'vina',
    marca: 'Hyundai',
    modelo: 'Creta',
    version: 'Value',
    anio: 2022,
    km: 28000,
    color: 'Plateado',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    patente: 'RCTA22',
    precio: 14_990_000,
    costo: 12_300_000,
  });
  tasar(
    52,
    'tas-anulada',
    21,
    {
      patente: 'HJYT18',
      marca: 'Chevrolet',
      modelo: 'Cruze',
      version: 'LT',
      anio: 2018,
      km: 91000,
    },
    7_800_000,
    'Buen estado; neumáticos por cambiar.',
  );
  en(50, () =>
    tasaciones.anular(
      ids['tas-anulada'],
      'Tasación duplicada: se emitió otra con la patente correcta',
      ag,
    ),
  );
  en(50, async () => {
    const r = await reservas.emitir(
      { vehiculoId: ids.sportage, clienteId: await cliente(6), montoReserva: 300_000 },
      ag,
    );
    ids['res-retenida'] = idDe(r);
  });
  en(45, () =>
    reservas.cancelar(ids['res-retenida'], 'El cliente se retractó fuera de plazo', true, ag),
  );
  vender(45, 'kicks', 3, 12_200_000, { cotizada: 49 });
  en(42, async () => {
    const [c] = (
      await pool.query<{ id: string }>('SELECT id FROM consignacion WHERE vehiculo_id = $1', [
        ids.navara,
      ])
    ).rows;
    await consignaciones.devolver(
      c.id,
      { motivo: 'El consignante decidió venderlo por su cuenta' } as never,
      ag,
    );
  });
  // ---- Octubre: 4 ventas
  alta({
    k: 'vitara',
    dias: 40,
    suc: 'matriz',
    marca: 'Suzuki',
    modelo: 'Vitara',
    version: 'GLX',
    anio: 2021,
    km: 35000,
    color: 'Azul',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    patente: 'PVTR21',
    precio: 15_490_000,
    costo: 12_800_000,
  });
  vender(36, 'peugeot', 0, 10_300_000, { cotizada: 39 });
  alta({
    k: 'onix',
    dias: 35,
    suc: 'vina',
    marca: 'Chevrolet',
    modelo: 'Onix',
    version: 'LT',
    anio: 2022,
    km: 22000,
    color: 'Blanco',
    comb: 'BENCINA',
    trans: 'MANUAL',
    cat: 'HATCHBACK',
    patente: 'SDFG22',
    precio: 10_990_000,
    costo: 8_600_000,
  });
  vender(30, 'corolla', 14, 13_600_000, { cotizada: 33 });
  alta({
    k: 'renegade',
    dias: 25,
    suc: 'matriz',
    marca: 'Jeep',
    modelo: 'Renegade',
    version: 'Sport',
    anio: 2020,
    km: 51000,
    color: 'Rojo',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    patente: 'LJRN20',
    precio: 16_990_000,
    consig: { cli: 13, comision: 8, minimo: 15_500_000 },
  });
  vender(24, 'sportage', 15, 18_200_000, { cotizada: 28 });
  tasar(
    22,
    'tas-gol',
    17,
    {
      patente: 'JGOL19',
      marca: 'Volkswagen',
      modelo: 'Gol',
      version: 'Trendline',
      anio: 2019,
      km: 76000,
    },
    5_200_000,
    'Correcto estado general; requiere mantención de 80.000 km.',
  );
  en(21, () => tasaciones.resolver(ids['tas-gol'], 'ACEPTADA', ag));
  alta({
    k: 'gol',
    dias: 20,
    suc: 'matriz',
    tasacion: 'tas-gol',
    marca: 'Volkswagen',
    modelo: 'Gol',
    version: 'Trendline',
    anio: 2019,
    km: 76000,
    color: 'Plateado',
    comb: 'BENCINA',
    trans: 'MANUAL',
    cat: 'HATCHBACK',
    patente: 'JGOL19',
    precio: 6_990_000,
    costo: 5_200_000,
  });
  vender(16, 'creta', 16, 14_700_000);
  alta({
    k: 'hilux',
    dias: 15,
    suc: 'vina',
    marca: 'Toyota',
    modelo: 'Hilux',
    version: 'SRV 4x4',
    anio: 2021,
    km: 68000,
    color: 'Blanco',
    comb: 'DIESEL',
    trans: 'AUTOMATICA',
    cat: 'CAMIONETA',
    trac: 'X4X4',
    patente: 'PHLX21',
    precio: 24_990_000,
    consig: { cli: 7, comision: 7, minimo: 23_000_000 },
  });
  alta({
    k: 'tracker',
    dias: 12,
    suc: 'vina',
    marca: 'Chevrolet',
    modelo: 'Tracker',
    version: 'LT',
    anio: 2021,
    km: 31000,
    color: 'Gris',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'SUV',
    patente: 'RTRK21',
    precio: 13_990_000,
    costo: 11_500_000,
  });
  // ---- Noviembre (hasta hoy): 1 venta y el stock actual
  alta({
    k: 'mazda3',
    dias: 8,
    suc: 'matriz',
    marca: 'Mazda',
    modelo: '3',
    version: 'Sport',
    anio: 2020,
    km: 45000,
    color: 'Rojo',
    comb: 'BENCINA',
    trans: 'AUTOMATICA',
    cat: 'HATCHBACK',
    patente: 'LMZD20',
    precio: 12_490_000,
    costo: 10_200_000,
  });
  vender(6, 'onix', 1, 10_800_000, { reservada: 9 });
  cotizar(5, 'vitara', 18, 15_300_000);
  vender(3, 'gol', 8, 6_900_000);
  cotizar(4, 'renegade', 10, 16_700_000);
  tasar(
    4,
    'tas-vigente',
    20,
    { patente: 'KFST18', marca: 'Ford', modelo: 'EcoSport', version: 'SE', anio: 2018, km: 83000 },
    6_400_000,
    'Buen estado; trae historial de mantenciones.',
  );
  en(3, async () => {
    const r = await reservas.emitir(
      { vehiculoId: ids.vitara, clienteId: await cliente(11), montoReserva: 400_000 },
      ag,
    );
    ids['res-vigente'] = idDe(r);
  });
  cotizar(2, 'tracker', 12, 13_800_000);
  cotizar(2, 'hilux', 4, 24_500_000);
  en(1, () => vehiculos.cambiarEstado(ids.tracker, { estado: 'PENDIENTE_REVISION' } as never, ag));

  // Gastos operacionales de los últimos 6 meses (el mes en curso, hasta hoy).
  const operacionales: [string | null, string, number, number, string][] = [
    [matriz.id, 'ARRIENDO', 1_200_000, 5, 'Arriendo local Providencia'],
    [vina.id, 'ARRIENDO', 800_000, 5, 'Arriendo local Viña del Mar'],
    [matriz.id, 'PUBLICIDAD', 300_000, 12, 'Portales y redes sociales'],
    [vina.id, 'SERVICIOS_BASICOS', 150_000, 20, 'Luz, agua e internet'],
    [matriz.id, 'SUELDOS_COMISIONES', 1_800_000, 28, 'Sueldos y comisiones'],
    [null, 'CONTABILIDAD_LEGAL', 300_000, 28, 'Contador (toda la automotora)'],
  ];
  const ahora = new Date(`${hoy}T12:00:00Z`);
  for (let m = 5; m >= 0; m--) {
    const inicio = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - m, 1, 12);
    for (const [sucursalId, categoria, monto, diaMes, comentario] of operacionales) {
      const dias = Math.round(
        (ahora.getTime() - (inicio + (diaMes - 1) * 86_400_000)) / 86_400_000,
      );
      if (dias < 0) continue;
      en(dias, () =>
        gastos.crearOperacional(
          { categoria: categoria as never, monto, fecha: hoy, comentario, sucursalId },
          undefined,
          ag,
        ),
      );
    }
  }

  eventos.sort((a, b) => b.dias - a.dias || a.orden - b.orden);
  for (const e of eventos) await hace(e.dias, e.paso);

  // Los documentos que ya pasaron su plazo quedan VENCIDOS, como en la vida real.
  await app.get(VencimientosTareas).marcarVencidos();
  await app.get(ConsignacionesTareas).marcarVencidas();

  const { rows: resumen } = await pool.query<{ tabla: string; n: string }>(
    `SELECT 'vehículos' AS tabla, count(*) AS n FROM vehiculo WHERE automotora_id = $1
     UNION ALL SELECT 'clientes', count(*) FROM cliente WHERE automotora_id = $1
     UNION ALL SELECT 'tasaciones', count(*) FROM tasacion WHERE automotora_id = $1
     UNION ALL SELECT 'cotizaciones', count(*) FROM cotizacion WHERE automotora_id = $1
     UNION ALL SELECT 'reservas', count(*) FROM reserva WHERE automotora_id = $1
     UNION ALL SELECT 'consignaciones', count(*) FROM consignacion WHERE automotora_id = $1
     UNION ALL SELECT 'ventas', count(*) FROM venta WHERE automotora_id = $1
     UNION ALL SELECT 'gastos', count(*) FROM gasto WHERE automotora_id = $1
     UNION ALL SELECT 'publicados', count(*) FROM vehiculo WHERE automotora_id = $1 AND estado = 'DISPONIBLE'`,
    [automotora.id],
  );
  await app.close();
  console.log(
    `Demo poblada (${subdominio}): ${resumen.map((r) => `${r.n} ${r.tabla}`).join(', ')}`,
  );
}

// Borra los datos de negocio de una automotora (para volver a poblarla): todo
// en una transacción y en orden de dependencias. Conserva usuarios, sucursales
// y auditoría (inmutable). Las fotos y los PDF de los documentos se borran del
// disco después del COMMIT.
async function borrarDatos(pool: Pool, automotoraId: string, raizUploads: string) {
  const client = await pool.connect();
  let fotos: string[] = [];
  let pdfs: string[] = [];
  try {
    await client.query('BEGIN');
    fotos = (
      await client.query<{ url: string }>(
        `SELECT f.url FROM vehiculo_foto f JOIN vehiculo v ON v.id = f.vehiculo_id
          WHERE v.automotora_id = $1`,
        [automotoraId],
      )
    ).rows.map((r) => r.url);
    pdfs = (
      await client.query<{ pdf_url: string }>(
        `SELECT pdf_url FROM (
           SELECT pdf_url FROM venta WHERE automotora_id = $1
           UNION ALL SELECT pdf_url FROM reserva WHERE automotora_id = $1
           UNION ALL SELECT pdf_url FROM cotizacion WHERE automotora_id = $1
           UNION ALL SELECT pdf_url FROM consignacion WHERE automotora_id = $1
           UNION ALL SELECT pdf_url FROM tasacion WHERE automotora_id = $1
         ) d WHERE pdf_url IS NOT NULL`,
        [automotoraId],
      )
    ).rows.map((r) => r.pdf_url);
    const deVehiculos = 'SELECT id FROM vehiculo WHERE automotora_id = $1';
    const sentencias = [
      `UPDATE vehiculo SET origen = 'COMPRA_DIRECTA', venta_origen_id = NULL, tasacion_origen_id = NULL
        WHERE automotora_id = $1`,
      'DELETE FROM venta WHERE automotora_id = $1',
      'DELETE FROM reserva WHERE automotora_id = $1',
      'DELETE FROM cotizacion WHERE automotora_id = $1',
      'DELETE FROM consignacion WHERE automotora_id = $1',
      'DELETE FROM gasto WHERE automotora_id = $1',
      'DELETE FROM inspeccion WHERE automotora_id = $1',
      'DELETE FROM notificacion WHERE automotora_id = $1',
      'DELETE FROM correo WHERE automotora_id = $1',
      `DELETE FROM vehiculo_bitacora WHERE vehiculo_id IN (${deVehiculos})`,
      'DELETE FROM vehiculo WHERE automotora_id = $1',
      'DELETE FROM tasacion WHERE automotora_id = $1',
      'DELETE FROM cliente WHERE automotora_id = $1',
    ];
    for (const sql of sentencias) await client.query(sql, [automotoraId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  for (const url of fotos) {
    // url: /archivos/fotos/<archivo>
    await unlink(`${raizUploads}/fotos/${url.split('/').pop()}`).catch(() => undefined);
  }
  for (const pdf of pdfs) {
    // pdf_url: documentos/<archivo>.pdf
    await unlink(`${raizUploads}/documentos/${pdf.split('/').pop()}`).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
