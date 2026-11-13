import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { trim, trimLower } from '../../auth/dto/transforms';

// Configuración de la automotora. El subdominio no está: es fijo.
export class UpdateConfiguracionDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  // El dígito verificador se valida en el Service.
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  rut?: string;

  @Transform(trimLower)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  // Datos de contacto de la casa matriz.
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  direccion?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  telefono?: string;

  // Descripción breve del perfil público; null la quita.
  @Transform(trim)
  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string | null;

  // Vigencias por defecto (días). Solo afectan a documentos emitidos después.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  diasValidezCotizacion?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  diasValidezReserva?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  diasValidezTasacion?: number;

  // Correos al cliente: envío del PDF al emitir, por tipo de documento.
  @IsOptional()
  @IsBoolean()
  correoCotizacion?: boolean;

  @IsOptional()
  @IsBoolean()
  correoReserva?: boolean;

  @IsOptional()
  @IsBoolean()
  correoTasacion?: boolean;

  @IsOptional()
  @IsBoolean()
  correoVenta?: boolean;

  @IsOptional()
  @IsBoolean()
  correoConsignacion?: boolean;

  // Recordatorios (días); null = no se envía.
  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  diasSeguimientoCotizacion?: number | null;

  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  diasAvisoCotizacion?: number | null;

  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  diasAvisoReserva?: number | null;

  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  diasAvisoTasacion?: number | null;

  // Simulador de crédito del sitio público. La tasa es % mensual; null la quita.
  @IsOptional()
  @IsBoolean()
  financiamientoActivo?: boolean;

  @ValidateIf((_o, v) => v !== null)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(5)
  financiamientoTasaMensual?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  financiamientoPieMinimo?: number;

  @IsOptional()
  @IsIn([12, 24, 36, 48, 60])
  financiamientoPlazoMaximo?: number;
}
