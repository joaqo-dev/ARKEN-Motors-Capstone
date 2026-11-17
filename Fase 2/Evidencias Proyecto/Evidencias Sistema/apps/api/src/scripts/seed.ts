import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as argon2 from 'argon2';
import { AppModule } from '../app.module';
import type { UsuarioAutenticado } from '../common/usuario-autenticado';
import { APP_CONFIG, AppConfig } from '../config/env';
import { AuthService } from '../modules/auth/auth.service';
import { AutomotorasRepository } from '../modules/automotoras/automotoras.repository';
import { AutomotorasService } from '../modules/automotoras/automotoras.service';
import { ClientesService } from '../modules/clientes/clientes.service';
import { CotizacionesService } from '../modules/cotizaciones/cotizaciones.service';
import { hoyEnChile } from '../common/fechas';
import { GastosService } from '../modules/gastos/gastos.service';
import { ReservasService } from '../modules/reservas/reservas.service';
import { SucursalesService } from '../modules/sucursales/sucursales.service';
import { UsuariosRepository } from '../modules/usuarios/usuarios.repository';
import { UsuariosService } from '../modules/usuarios/usuarios.service';
import { VehiculoArchivosService } from '../modules/vehiculos/vehiculo-archivos.service';
import { VehiculosService } from '../modules/vehiculos/vehiculos.service';
import { VentasService } from '../modules/ventas/ventas.service';
import { pngDemo } from './imagen-demo';

// Seed de desarrollo (doc 03): 2 automotoras, varias sucursales, un usuario de
// cada rol y vehículos en distintos estados y orígenes. Usa los Services reales,
// así respeta todas las reglas (folios, bitácora, auditoría, validaciones).
// Uso: pnpm --filter @vitriauto/api seed   (sobre una base vacía)

const PASSWORD = 'Demo12345';
const COLORES: Record<string, [number, number, number]> = {
  Rojo: [200, 40, 45],
  Blanco: [235, 235, 235],
  Negro: [45, 45, 50],
  Gris: [130, 135, 140],
  Azul: [40, 80, 170],
  Plateado: [185, 190, 195],
  Verde: [40, 120, 80],
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.NODE_ENV === 'production') throw new Error('El seed no se ejecuta en producción');

  const auth = app.get(AuthService);
  const automotorasRepo = app.get(AutomotorasRepository);
  const automotoras = app.get(AutomotorasService);
  const usuariosRepo = app.get(UsuariosRepository);
  const usuarios = app.get(UsuariosService);
  const sucursales = app.get(SucursalesService);
  const clientes = app.get(ClientesService);
  const vehiculos = app.get(VehiculosService);
  const archivos = app.get(VehiculoArchivosService);
  const gastos = app.get(GastosService);
  const cotizaciones = app.get(CotizacionesService);
  const reservas = app.get(ReservasService);
  const ventas = app.get(VentasService);

  if (await automotorasRepo.existeSubdominio('autos-demo')) {
    throw new Error('La base ya tiene datos del seed (subdominio autos-demo). Usa una base vacía.');
  }

  const hash = await argon2.hash(PASSWORD);
  // Deja al usuario verificado y con la contraseña de demo (sin pasar por el correo).
  const activar = async (email: string) => {
    const u = (await usuariosRepo.findByEmail(email))!;
    await usuariosRepo.setPassword(u.id, hash);
    await usuariosRepo.marcarEmailVerificado(u.id);
    return u;
  };
  const actor = (u: {
    id: string;
    automotora_id: string;
    sucursal_id: string | null;
    rol: UsuarioAutenticado['rol'];
  }) =>
    ({
      id: u.id,
      automotoraId: u.automotora_id,
      sucursalId: u.sucursal_id,
      rol: u.rol,
    }) as UsuarioAutenticado;

  const diasAtras = (dias: number) => {
    const d = new Date(Date.now() - dias * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  // Accesos del registro sembrado: sin IP ni navegador reales.
  const SEMILLA = { ip: null, userAgent: 'seed' };

  // ------------------------------------------------------------------ Autos Demo
  await auth.registrarAutomotora(
    {
      automotora: {
        nombre: 'Autos Demo',
        rut: '76.086.428-5',
        direccion: 'Av. Providencia 1234',
        region: 'METROPOLITANA',
        comuna: 'Providencia',
        telefono: '+56222334455',
        email: 'contacto@autosdemo.cl',
        subdominio: 'autos-demo',
      },
      admin: { nombre: 'Carolina Rojas', email: 'admin@demo.cl', password: PASSWORD },
      aceptaTerminos: true,
    },
    SEMILLA,
  );
  const agDemo = actor(await activar('admin@demo.cl'));
  await automotoras.actualizar(
    {
      descripcion:
        'Autos seminuevos revisados, con garantía y financiamiento. Más de 10 años en Santiago y la V Región.',
    },
    agDemo,
  );
  await automotoras.subirImagen('LOGO', { buffer: pngDemo([28, 28, 32], 200, 200) }, agDemo);
  await automotoras.subirImagen('BANNER', { buffer: pngDemo([28, 28, 32], 1200, 300) }, agDemo);

  const [matriz] = await sucursales.listar(agDemo);
  await sucursales.actualizar(
    matriz.id,
    { horarioAtencion: 'Lun a Vie 9:00–19:00, Sáb 10:00–14:00', whatsapp: '+56911112222' },
    agDemo,
  );
  const vina = await sucursales.crear(
    {
      nombre: 'Sucursal Viña del Mar',
      direccion: 'Av. Libertad 555',
      region: 'VALPARAISO',
      comuna: 'Viña del Mar',
      telefono: '+56322556677',
      horarioAtencion: 'Lun a Sáb 10:00–19:00',
      whatsapp: '+56933334444',
    },
    agDemo,
  );

  await usuarios.invitar(
    {
      nombre: 'Diego Muñoz',
      email: 'admin.vina@demo.cl',
      rol: 'ADMIN_SUCURSAL',
      sucursalId: vina.id,
    },
    agDemo,
  );
  await usuarios.invitar(
    { nombre: 'Valentina Soto', email: 'vendedor@demo.cl', rol: 'VENDEDOR', sucursalId: matriz.id },
    agDemo,
  );
  const adminVina = actor(await activar('admin.vina@demo.cl'));
  const vendedor = actor(await activar('vendedor@demo.cl'));

  const cliente = async (a: UsuarioAutenticado, nombre: string, rut: string, email: string) =>
    (
      await clientes.crear(
        { nombre, rut, telefono: '+56987654321', email, direccion: 'Santiago' },
        a,
      )
    ).id;
  const c1 = await cliente(agDemo, 'Ana Pérez', '12.345.678-5', 'ana.perez@correo.cl');
  const c2 = await cliente(agDemo, 'Jorge Castillo', '15.678.901-1', 'jorge.castillo@correo.cl');
  const c3 = await cliente(agDemo, 'Paula Herrera', '18.765.432-7', 'paula.herrera@correo.cl');

  type Alta = {
    a: UsuarioAutenticado;
    sucursalId?: string;
    marca: string;
    modelo: string;
    version?: string;
    anio: number;
    km: number;
    color: keyof typeof COLORES;
    combustible: string;
    transmision: string;
    categoria: string;
    traccion?: string;
    patente: string;
    precio: number;
    costo?: number;
    diasEnStock?: number;
    fotos?: number;
    publicar?: boolean;
    consignacion?: { clienteId: string; comision: number; minimo: number };
  };
  const alta = async (v: Alta) => {
    const creado = await vehiculos.crear(
      {
        marca: v.marca,
        modelo: v.modelo,
        version: v.version,
        anio: v.anio,
        kilometraje: v.km,
        color: v.color,
        combustible: v.combustible,
        transmision: v.transmision,
        categoria: v.categoria,
        traccion: v.traccion ?? 'X4X2',
        patente: v.patente,
        precioVenta: v.precio,
        origen: v.consignacion ? 'CONSIGNACION' : 'COMPRA_DIRECTA',
        costoAdquisicion: v.consignacion ? undefined : v.costo,
        fechaIngreso: v.diasEnStock ? diasAtras(v.diasEnStock) : undefined,
        sucursalId: v.sucursalId,
        descripcion: `${v.marca} ${v.modelo} ${v.anio} en excelente estado. Mantenciones al día.`,
        consignacion: v.consignacion
          ? {
              clienteId: v.consignacion.clienteId,
              tipoTrato: 'COMISION_VENTA',
              porcentajeComision: v.consignacion.comision,
              precioMinimo: v.consignacion.minimo,
              fechaFin: diasAtras(-60),
            }
          : undefined,
      },
      v.a,
    );
    const fotos = v.fotos ?? 3;
    if (fotos > 0) {
      const base = COLORES[v.color];
      await archivos.subirFotos(
        creado.id,
        Array.from({ length: fotos }, (_, i) => ({
          buffer: pngDemo(base.map((c) => Math.max(0, c - i * 25)) as [number, number, number]),
        })),
        v.a,
      );
    }
    // Solo un admin publica: lo que carga el Vendedor lo publica el Admin General.
    if (v.publicar !== false && fotos > 0) {
      const publicador = v.a.rol === 'VENDEDOR' ? agDemo : v.a;
      await vehiculos.cambiarEstado(creado.id, { estado: 'DISPONIBLE' }, publicador);
    }
    return creado.id;
  };

  // Casa Matriz (Providencia)
  const yaris = await alta({
    a: vendedor,
    marca: 'Toyota',
    modelo: 'Yaris',
    version: 'Sport',
    anio: 2021,
    km: 38000,
    color: 'Rojo',
    combustible: 'BENCINA',
    transmision: 'MANUAL',
    categoria: 'SEDAN',
    patente: 'LKJH21',
    precio: 11_490_000,
    costo: 9_200_000,
    diasEnStock: 20,
  });
  await alta({
    a: vendedor,
    marca: 'Toyota',
    modelo: 'RAV4',
    version: 'Hybrid',
    anio: 2022,
    km: 25000,
    color: 'Blanco',
    combustible: 'HIBRIDO',
    transmision: 'AUTOMATICA',
    categoria: 'SUV',
    traccion: 'AWD',
    patente: 'PRST22',
    precio: 27_990_000,
    costo: 24_000_000,
    diasEnStock: 10,
  });
  await alta({
    a: vendedor,
    marca: 'Chevrolet',
    modelo: 'Sail',
    anio: 2019,
    km: 72000,
    color: 'Gris',
    combustible: 'BENCINA',
    transmision: 'MANUAL',
    categoria: 'SEDAN',
    patente: 'KXBW19',
    precio: 6_990_000,
    costo: 5_300_000,
    diasEnStock: 70,
  });
  await alta({
    a: agDemo,
    sucursalId: matriz.id,
    marca: 'Mazda',
    modelo: 'CX-5',
    version: 'GT',
    anio: 2020,
    km: 54000,
    color: 'Azul',
    combustible: 'BENCINA',
    transmision: 'AUTOMATICA',
    categoria: 'SUV',
    traccion: 'AWD',
    patente: 'JRTV20',
    precio: 19_990_000,
    consignacion: { clienteId: c3, comision: 7, minimo: 18_500_000 },
  });
  const rio = await alta({
    a: vendedor,
    marca: 'Kia',
    modelo: 'Rio 5',
    anio: 2018,
    km: 88000,
    color: 'Plateado',
    combustible: 'BENCINA',
    transmision: 'MANUAL',
    categoria: 'HATCHBACK',
    patente: 'HGFD18',
    precio: 7_490_000,
    costo: 5_800_000,
    diasEnStock: 35,
  });
  await alta({
    a: vendedor,
    marca: 'Suzuki',
    modelo: 'Swift',
    anio: 2020,
    km: 41000,
    color: 'Verde',
    combustible: 'BENCINA',
    transmision: 'MANUAL',
    categoria: 'HATCHBACK',
    patente: 'LBCD20',
    precio: 8_990_000,
    costo: 7_100_000,
    fotos: 0,
    publicar: false,
  });
  // Viña del Mar
  await alta({
    a: adminVina,
    marca: 'Hyundai',
    modelo: 'Tucson',
    version: 'GLS',
    anio: 2021,
    km: 33000,
    color: 'Negro',
    combustible: 'DIESEL',
    transmision: 'AUTOMATICA',
    categoria: 'SUV',
    patente: 'PFGH21',
    precio: 21_490_000,
    costo: 18_200_000,
    diasEnStock: 15,
  });
  await alta({
    a: adminVina,
    marca: 'Toyota',
    modelo: 'Hilux',
    version: 'SRV 4x4',
    anio: 2019,
    km: 96000,
    color: 'Blanco',
    combustible: 'DIESEL',
    transmision: 'MANUAL',
    categoria: 'CAMIONETA',
    traccion: 'X4X4',
    patente: 'KLMN19',
    precio: 23_990_000,
    costo: 20_500_000,
    diasEnStock: 55,
  });
  const accent = await alta({
    a: adminVina,
    marca: 'Hyundai',
    modelo: 'Accent',
    anio: 2020,
    km: 60000,
    color: 'Gris',
    combustible: 'BENCINA',
    transmision: 'AUTOMATICA',
    categoria: 'SEDAN',
    patente: 'JKLP20',
    precio: 9_490_000,
    costo: 7_600_000,
    diasEnStock: 40,
  });

  // Movimientos: gasto, cotizaciones, una reserva y dos ventas (una con parte de pago)
  await gastos.crear(
    yaris,
    { categoria: 'ESTETICA', monto: 180_000, fecha: diasAtras(5), comentario: 'Pulido y encerado' },
    undefined,
    agDemo,
  );

  // Gastos operacionales (Módulo 8) del mes pasado y de este; uno general sin
  // sucursal (el contador de toda la automotora).
  const mesPasado = (dia: number) => {
    const [a, m] = hoyEnChile().split('-').map(Number);
    const anio = m === 1 ? a - 1 : a;
    const mes = m === 1 ? 12 : m - 1;
    const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
  };
  const operacionales: [string | null, string, number, number, string][] = [
    [matriz.id, 'ARRIENDO', 1_800_000, 5, 'Arriendo local Providencia'],
    [vina.id, 'ARRIENDO', 1_200_000, 5, 'Arriendo local Viña'],
    [matriz.id, 'SUELDOS_COMISIONES', 2_500_000, 30, 'Sueldos y comisiones'],
    [matriz.id, 'PUBLICIDAD', 350_000, 12, 'Portales y redes sociales'],
    [vina.id, 'SERVICIOS_BASICOS', 180_000, 20, 'Luz, agua e internet'],
    [null, 'CONTABILIDAD_LEGAL', 400_000, 28, 'Contador (toda la automotora)'],
  ];
  for (const [sucursalId, categoria, monto, dia, comentario] of operacionales) {
    await gastos.crearOperacional(
      { categoria: categoria as never, monto, fecha: mesPasado(dia), comentario, sucursalId },
      undefined,
      agDemo,
    );
  }
  // Este mes, por ahora, solo el arriendo de Casa Matriz.
  await gastos.crearOperacional(
    {
      categoria: 'ARRIENDO',
      monto: 1_800_000,
      fecha: `${hoyEnChile().slice(0, 8)}01`,
      comentario: 'Arriendo local Providencia',
      sucursalId: matriz.id,
    },
    undefined,
    agDemo,
  );
  await cotizaciones.emitir(
    {
      vehiculoId: yaris,
      clienteId: c1,
      precioCotizado: 11_200_000,
      costosAdicionales: [{ descripcion: 'Transferencia e inscripción', monto: 180_000 }],
    },
    vendedor,
  );
  await reservas.emitir({ vehiculoId: rio, clienteId: c2, montoReserva: 300_000 }, vendedor);
  await ventas.cerrar(
    {
      vehiculoId: accent,
      clienteId: c1,
      precioVentaFinal: 9_300_000,
      formasPago: [{ tipo: 'TRANSFERENCIA', monto: 9_300_000 }],
    },
    adminVina,
  );
  const vendidoParte = await alta({
    a: vendedor,
    marca: 'Nissan',
    modelo: 'Versa',
    anio: 2019,
    km: 70000,
    color: 'Blanco',
    combustible: 'BENCINA',
    transmision: 'MANUAL',
    categoria: 'SEDAN',
    patente: 'KPLM19',
    precio: 7_990_000,
    costo: 6_200_000,
    diasEnStock: 30,
  });
  await ventas.cerrar(
    {
      vehiculoId: vendidoParte,
      clienteId: c2,
      precioVentaFinal: 7_800_000,
      formasPago: [
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
    },
    vendedor,
  );

  // ------------------------------------------------------------------ Motor Sur
  await auth.registrarAutomotora(
    {
      automotora: {
        nombre: 'Motor Sur',
        rut: '77.123.456-9',
        direccion: "Av. O'Higgins 890",
        region: 'BIOBIO',
        comuna: 'Concepción',
        telefono: '+56412223344',
        email: 'ventas@motorsur.cl',
        subdominio: 'motor-sur',
      },
      admin: { nombre: 'Rodrigo Fuentes', email: 'admin@motorsur.cl', password: PASSWORD },
      aceptaTerminos: true,
    },
    SEMILLA,
  );
  const agSur = actor(await activar('admin@motorsur.cl'));
  const [surMatriz] = await sucursales.listar(agSur);
  await sucursales.actualizar(
    surMatriz.id,
    { horarioAtencion: 'Lun a Vie 9:30–18:30', whatsapp: '+56955556666' },
    agSur,
  );
  await automotoras.actualizar(
    { descripcion: 'Especialistas en camionetas y SUV en la Región del Biobío.' },
    agSur,
  );
  await alta({
    a: agSur,
    sucursalId: surMatriz.id,
    marca: 'Ford',
    modelo: 'Ranger',
    version: 'XLT',
    anio: 2020,
    km: 80000,
    color: 'Gris',
    combustible: 'DIESEL',
    transmision: 'AUTOMATICA',
    categoria: 'CAMIONETA',
    traccion: 'X4X4',
    patente: 'LFGT20',
    precio: 22_990_000,
    costo: 19_800_000,
  });
  await alta({
    a: agSur,
    sucursalId: surMatriz.id,
    marca: 'Toyota',
    modelo: 'Yaris',
    anio: 2019,
    km: 65000,
    color: 'Plateado',
    combustible: 'BENCINA',
    transmision: 'MANUAL',
    categoria: 'SEDAN',
    patente: 'KTRE19',
    precio: 9_290_000,
    costo: 7_500_000,
  });
  await alta({
    a: agSur,
    sucursalId: surMatriz.id,
    marca: 'Subaru',
    modelo: 'Forester',
    anio: 2021,
    km: 42000,
    color: 'Verde',
    combustible: 'BENCINA',
    transmision: 'AUTOMATICA',
    categoria: 'SUV',
    traccion: 'AWD',
    patente: 'PLKJ21',
    precio: 20_990_000,
    costo: 18_000_000,
  });

  await app.close();
  console.log(`
Seed listo. Contraseña de todos los usuarios: ${PASSWORD}
  Autos Demo (autos-demo): admin@demo.cl (Admin General), admin.vina@demo.cl (Admin Sucursal Viña),
                           vendedor@demo.cl (Vendedor Casa Matriz)
  Motor Sur  (motor-sur):  admin@motorsur.cl (Admin General)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
