import { formatearRut } from '@vitriauto/shared-types';
import type { InputHTMLAttributes, Ref } from 'react';
import { Input } from './componentes';

// Campo de RUT: pone los puntos y el guion mientras se escribe (12.345.678-5).
// Funciona con register() de react-hook-form: corrige el valor antes de
// entregárselo. La validación del dígito verificador va en el register (esRutValido).
export function InputRut({
  onChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <Input
      autoComplete="off"
      maxLength={12}
      placeholder="12.345.678-5"
      {...props}
      onChange={(e) => {
        e.target.value = formatearRut(e.target.value);
        onChange?.(e);
      }}
    />
  );
}
