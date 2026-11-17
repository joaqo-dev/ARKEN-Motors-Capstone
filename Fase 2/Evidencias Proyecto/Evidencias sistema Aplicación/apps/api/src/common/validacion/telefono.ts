import { applyDecorators } from '@nestjs/common';
import { esTelefonoValido, MENSAJE_TELEFONO, normalizarTelefono } from '@vitriauto/shared-types';
import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';

// Teléfono chileno (celular o fijo): lo valida y lo deja normalizado ('+56XXXXXXXXX').
export function EsTelefono() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' && esTelefonoValido(value) ? normalizarTelefono(value) : value,
    ),
    ValidateBy({
      name: 'esTelefono',
      validator: {
        validate: (valor: unknown) => typeof valor === 'string' && esTelefonoValido(valor),
        defaultMessage: () => MENSAJE_TELEFONO,
      },
    }),
  );
}
