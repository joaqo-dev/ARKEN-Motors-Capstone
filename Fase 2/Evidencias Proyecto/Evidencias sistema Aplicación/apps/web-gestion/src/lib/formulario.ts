import { useForm, type FieldValues, type UseFormProps } from 'react-hook-form';

// Formularios del panel: validan cada campo al salir de él (y luego al escribir),
// para que el error aparezca junto al campo y no recién al enviar.
export function useFormulario<T extends FieldValues = FieldValues>(opciones?: UseFormProps<T>) {
  return useForm<T>({ mode: 'onTouched', ...opciones });
}
