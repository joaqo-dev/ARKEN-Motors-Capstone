import { EnvioCorreoDto } from '../../documentos-comerciales/dto-comunes';
import {
  CategoriaVehiculo,
  CombustibleVehiculo,
  TipoTrato,
  TraccionVehiculo,
  TransmisionVehiculo,
} from '@vitriauto/shared-types';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MONTO_MAXIMO, nombreVehiculo, trim, trimONull } from './transforms';

// Orígenes que se dan de alta a mano. PARTE_PAGO nace solo desde Ventas.
export const ORIGENES_ALTA_MANUAL = [
  'COMPRA_DIRECTA',
  'CONSIGNACION',
  'COMPRA_PARTICULAR',
] as const;

// Orígenes en que la automotora compra el vehículo (tiene costo de adquisición).
const CON_COSTO = ['COMPRA_DIRECTA', 'COMPRA_PARTICULAR'];

export class DatosConsignacionDto extends EnvioCorreoDto {
  @IsUUID()
  clienteId!: string;

  // COMISION_VENTA: porcentaje + precio mínimo. PRECIO_NETO: monto neto (que
  // además es el precio mínimo). La coherencia la valida normalizarTrato().
  @IsIn(TipoTrato.options)
  tipoTrato!: TipoTrato;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(100)
  porcentajeComision?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  montoNeto?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  precioMinimo?: number;

  // Por defecto, hoy.
  @IsOptional()
  @IsDateString({ strict: true })
  fechaInicio?: string;

  @IsDateString({ strict: true })
  fechaFin!: string;
}

export class DatosGeneralesVehiculoDto {
  @Transform(nombreVehiculo)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  marca!: string;

  @Transform(nombreVehiculo)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  modelo!: string;

  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  anio!: number;

  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string | null;

  @IsInt()
  @Min(0)
  @Max(5_000_000)
  kilometraje!: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  color!: string;

  @IsIn(CombustibleVehiculo.options)
  combustible!: string;

  @IsIn(TransmisionVehiculo.options)
  transmision!: string;

  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cilindrada?: string | null;

  // Formato validado y normalizado en el Service.
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  patente!: string;

  @IsIn(CategoriaVehiculo.options)
  categoria!: string;

  // Obligatoria salvo en motos, donde no aplica (lo valida el Service).
  @IsOptional()
  @IsIn(TraccionVehiculo.options)
  traccion?: string;

  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  descripcion?: string | null;
}

export class CreateVehiculoDto extends DatosGeneralesVehiculoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  precioVenta!: number;

  @IsIn(ORIGENES_ALTA_MANUAL)
  origen!: (typeof ORIGENES_ALTA_MANUAL)[number];

  // Precio de compra. El Vendedor puede ingresarlo, pero nunca lo ve.
  @ValidateIf((o: CreateVehiculoDto) => CON_COSTO.includes(o.origen))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  costoAdquisicion?: number;

  // Fecha de compra/ingreso al inventario; por defecto, ahora.
  @IsOptional()
  @IsDateString({ strict: true })
  fechaIngreso?: string;

  // Obligatoria para ADMIN_GENERAL; para los demás se usa la propia (JWT).
  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  // COMPRA_PARTICULAR: la tasación ACEPTADA que originó la compra.
  @ValidateIf((o: CreateVehiculoDto) => o.origen === 'COMPRA_PARTICULAR')
  @IsDefined({ message: 'tasacionId es obligatoria cuando origen = COMPRA_PARTICULAR' })
  @IsUUID()
  tasacionId?: string;

  @ValidateIf((o: CreateVehiculoDto) => o.origen === 'CONSIGNACION')
  @IsDefined({ message: 'consignacion es obligatoria cuando origen = CONSIGNACION' })
  @ValidateNested()
  @Type(() => DatosConsignacionDto)
  consignacion?: DatosConsignacionDto;
}
