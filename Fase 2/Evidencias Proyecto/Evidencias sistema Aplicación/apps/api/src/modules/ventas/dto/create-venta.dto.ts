import { EnvioCorreoDto } from '../../documentos-comerciales/dto-comunes';
import {
  CategoriaVehiculo,
  CombustibleVehiculo,
  TraccionVehiculo,
  TransmisionVehiculo,
} from '@vitriauto/shared-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { CostoAdicionalDto } from '../../cotizaciones/dto/create-cotizacion.dto';
import { MONTO_MAXIMO, nombreVehiculo, trim, trimONull } from '../../vehiculos/dto/transforms';

export const TIPOS_FORMA_PAGO = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'CHEQUE',
  'FINANCIAMIENTO',
  'PARTE_PAGO',
] as const;
export type TipoFormaPago = (typeof TIPOS_FORMA_PAGO)[number];

// Datos esenciales del auto recibido en parte de pago (nace PENDIENTE_REVISION;
// la ficha se completa después). Lo no indicado queda como OTRO.
export class VehiculoRecibidoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  patente!: string;

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

  @Transform(trimONull)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string | null;

  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  anio!: number;

  @IsInt()
  @Min(0)
  @Max(5_000_000)
  kilometraje!: number;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  color!: string;

  @IsOptional()
  @IsIn(CombustibleVehiculo.options)
  combustible?: string;

  @IsOptional()
  @IsIn(TransmisionVehiculo.options)
  transmision?: string;

  @IsOptional()
  @IsIn(CategoriaVehiculo.options)
  categoria?: string;

  @IsOptional()
  @IsIn(TraccionVehiculo.options)
  traccion?: string;
}

export class FormaPagoDto {
  @IsIn(TIPOS_FORMA_PAGO)
  tipo!: TipoFormaPago;

  // En PARTE_PAGO: el valor en que se recibe el auto (su costo de adquisición).
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  monto!: number;

  // Obligatorio si tipo = PARTE_PAGO (se valida en el Service).
  @IsOptional()
  @ValidateNested()
  @Type(() => VehiculoRecibidoDto)
  vehiculoRecibido?: VehiculoRecibidoDto;
}

export class CreateVentaDto extends EnvioCorreoDto {
  @IsUUID()
  vehiculoId!: string;

  @IsUUID()
  clienteId!: string;

  // Cotización vigente que esta venta concreta (queda CONCRETADA).
  @IsOptional()
  @IsUUID()
  cotizacionId?: string;

  // Obligatoria si el vehículo tiene una reserva activa: la venta la concreta.
  @IsOptional()
  @IsUUID()
  reservaId?: string;

  // Precio completo; si viene de una reserva, la seña se descuenta del saldo a pagar.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MONTO_MAXIMO)
  precioVentaFinal!: number;

  // Combinables; deben sumar precioVentaFinal + adicionales − seña.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FormaPagoDto)
  formasPago!: FormaPagoDto[];

  // Tipo "traspaso": van en el comprobante, pero nunca en márgenes ni en el cuadre.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CostoAdicionalDto)
  costosAdicionales?: CostoAdicionalDto[];
}
