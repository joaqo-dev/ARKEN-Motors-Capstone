import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DatabaseError } from 'pg';

// Respuesta de error uniforme. Nunca deja pasar un error de `pg` crudo al cliente.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      // Límite de tamaño de las subidas (multer): mensaje entendible para el usuario.
      if (statusCode === HttpStatus.PAYLOAD_TOO_LARGE) {
        message = 'El archivo es demasiado pesado. Elige uno más liviano.';
      } else if (message === 'Too many files') {
        message = 'Son demasiados archivos a la vez.';
      }
    } else if (exception instanceof DatabaseError && exception.code === '23505') {
      // unique_violation (p. ej. carrera entre dos registros con el mismo subdominio)
      statusCode = HttpStatus.CONFLICT;
      message = 'El recurso ya existe';
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(statusCode).json({
      statusCode,
      message,
      error: HttpStatus[statusCode] ?? 'Error',
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
