import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AlmacenamientoModule } from './common/almacenamiento/almacenamiento.module';
import { CsrfGuard } from './common/guards/csrf.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ConfigModule } from './config/config.module';
import { APP_CONFIG, AppConfig } from './config/env';
import { DatabaseModule } from './db/database.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutomotorasModule } from './modules/automotoras/automotoras.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { ConsignacionesModule } from './modules/consignaciones/consignaciones.module';
import { CorreosModule } from './modules/correos/correos.module';
import { CotizacionesModule } from './modules/cotizaciones/cotizaciones.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentosPdfModule } from './modules/documentos-pdf/documentos-pdf.module';
import { EmailModule } from './modules/email/email.module';
import { FichasModule } from './modules/fichas/fichas.module';
import { InspeccionesModule } from './modules/inspecciones/inspecciones.module';
import { FoliosModule } from './modules/folios/folios.module';
import { GastosModule } from './modules/gastos/gastos.module';
import { SucursalesModule } from './modules/sucursales/sucursales.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { PublicoModule } from './modules/publico/publico.module';
import { ReservasModule } from './modules/reservas/reservas.module';
import { TasacionesModule } from './modules/tasaciones/tasaciones.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { VencimientosModule } from './modules/vencimientos/vencimientos.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { VehiculosModule } from './modules/vehiculos/vehiculos.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    EmailModule,
    AuditoriaModule,
    AlmacenamientoModule,
    FoliosModule,
    DocumentosPdfModule,
    CorreosModule,
    JwtModule.registerAsync({
      global: true,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_SECRET,
        signOptions: { algorithm: 'HS256', expiresIn: config.JWT_ACCESS_TTL_SEGUNDOS },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Límite general; /auth/login y /auth/olvide-password tienen uno más estricto.
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AutomotorasModule,
    SucursalesModule,
    UsuariosModule,
    AuthModule,
    ClientesModule,
    VehiculosModule,
    FichasModule,
    InspeccionesModule,
    GastosModule,
    ConsignacionesModule,
    CotizacionesModule,
    ReservasModule,
    TasacionesModule,
    VencimientosModule,
    VentasModule,
    NotificacionesModule,
    DashboardModule,
    PublicoModule,
  ],
  providers: [
    // Orden de ejecución: rate limit → autenticación → CSRF → roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
