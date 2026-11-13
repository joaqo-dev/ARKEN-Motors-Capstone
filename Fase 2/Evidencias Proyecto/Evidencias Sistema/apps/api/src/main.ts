import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  AlmacenamientoService,
  PREFIJO_FOTOS_PUBLICAS,
} from './common/almacenamiento/almacenamiento.service';
import { CSRF_HEADER } from './common/cookies';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { APP_CONFIG, AppConfig } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  // En producción la API corre detrás de Caddy: req.ip debe venir de X-Forwarded-For.
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);

  // same-site: las fotos (api.*) se muestran desde el sitio público (*.tudominio.cl).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['Content-Type', CSRF_HEADER],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  // Fotos públicas de vehículos (en producción las sirve Caddy directamente).
  // Los documentos legales NO se exponen: se descargan por un endpoint con scope.
  app.useStaticAssets(app.get(AlmacenamientoService).directorioFotos, {
    prefix: PREFIJO_FOTOS_PUBLICAS,
    index: false,
    dotfiles: 'deny',
    // Imágenes públicas: se pueden mostrar desde cualquier origen (sitio público,
    // subdominios de las automotoras).
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  });

  await app.listen(config.PORT);
}

void bootstrap();
