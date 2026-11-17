import { BadRequestException } from '@nestjs/common';
import { Type, plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
  validate,
} from 'class-validator';
import { erroresDeValidacion } from './mensajes';
import { EsTelefono } from './telefono';

class PagoDto {
  @IsInt()
  @Min(1)
  monto!: number;
}

class PruebaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5)
  nombre!: string;

  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres' })
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @IsString({ message: 'El motivo es obligatorio' })
  motivo!: string;

  @EsTelefono()
  telefono!: string;

  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  formasPago!: PagoDto[];
}

async function mensajes(datos: object): Promise<string[]> {
  const dto = plainToInstance(PruebaDto, datos);
  const errores = await validate(dto, { forbidNonWhitelisted: true, whitelist: true });
  if (!errores.length) return [];
  return (erroresDeValidacion(errores).getResponse() as { message: string[] }).message;
}

const valido = { nombre: 'Ana', motivo: 'ok', telefono: '+56912345678', formasPago: [] };

describe('Errores de validación en español', () => {
  it('traduce los mensajes de class-validator, uno por campo', async () => {
    const r = await mensajes({ ...valido, nombre: 'Demasiado largo' });
    expect(r).toEqual(['Nombre: máximo 5 caracteres']);
  });

  it('respeta los mensajes propios del DTO y no los repite', async () => {
    const r = await mensajes({ ...valido, motivo: null });
    expect(r).toEqual(['El motivo es obligatorio']);
  });

  it('indica la fila en las listas', async () => {
    const r = await mensajes({ ...valido, formasPago: [{ monto: 5 }, { monto: 0 }] });
    expect(r).toEqual(['Monto (formas de pago, fila 2): debe ser al menos 1']);
  });

  it('informa los campos de más en español', async () => {
    const r = await mensajes({ ...valido, intruso: 1 });
    expect(r).toEqual(['El campo "intruso" no está permitido']);
  });

  it('devuelve una BadRequestException', () => {
    expect(erroresDeValidacion([])).toBeInstanceOf(BadRequestException);
  });
});

describe('Teléfono chileno', () => {
  it.each(['+56 9 1234 5678', '912345678', '(2) 2345 6789', '+56-2-2345-6789'])(
    'acepta y normaliza %s',
    async (telefono) => {
      expect(await mensajes({ ...valido, telefono })).toEqual([]);
      const dto = plainToInstance(PruebaDto, { ...valido, telefono });
      expect(dto.telefono).toMatch(/^\+56[29]\d{8}$/);
    },
  );

  it.each(['abc123', 'llámame', 'sin fono', '12345', '+56 1 2345 6789', '9 1234 5678 ext 2'])(
    'rechaza %s',
    async (telefono) => {
      expect(await mensajes({ ...valido, telefono })).toEqual([
        'Teléfono inválido: usa un número chileno (ej. +56 9 1234 5678)',
      ]);
    },
  );
});
