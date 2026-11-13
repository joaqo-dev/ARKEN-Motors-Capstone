import { esRutValido, formatearRut } from '@vitriauto/shared-types';
import { InputRut } from '../../ui/rut';
import { useFormulario } from '../../lib/formulario';
import { Boton, Campo, Input } from '../../ui/componentes';
import type { Cliente } from './tipos';

export type DatosCliente = Pick<Cliente, 'nombre' | 'rut' | 'telefono' | 'email' | 'direccion'>;

export function FormularioCliente({
  inicial,
  textoBoton,
  onGuardar,
  onCancelar,
}: {
  inicial?: Partial<DatosCliente>;
  textoBoton: string;
  onGuardar: (datos: DatosCliente) => Promise<unknown>;
  onCancelar?: () => void;
}) {
  const { register, handleSubmit, formState } = useFormulario<DatosCliente>({
    // El RUT guardado (12345678-5) se muestra con puntos en el campo.
    defaultValues: { ...inicial, rut: inicial?.rut ? formatearRut(inicial.rut) : '' },
  });
  const e = formState.errors;
  return (
    <form
      onSubmit={(evento) => {
        // Desde un portal el evento igual sube por el árbol de React hasta el
        // formulario que abrió el modal: no debe enviarlo.
        evento.stopPropagation();
        // Solo los datos editables: `inicial` puede ser el cliente completo
        // (id, estado, fechaCreacion…) y la API rechaza campos de más.
        return handleSubmit(({ nombre, rut, telefono, email, direccion }) =>
          onGuardar({ nombre, rut, telefono, email, direccion }),
        )(evento);
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <Campo etiqueta="Nombre completo" error={e.nombre?.message} className="sm:col-span-2">
        <Input autoFocus {...register('nombre', { required: 'Obligatorio' })} />
      </Campo>
      <Campo etiqueta="RUT" error={e.rut?.message}>
        <InputRut
          {...register('rut', {
            required: 'Obligatorio',
            validate: (v) => esRutValido(v) || 'RUT inválido: revisa el dígito verificador',
          })}
        />
      </Campo>
      <Campo etiqueta="Teléfono" error={e.telefono?.message}>
        <Input {...register('telefono', { required: 'Obligatorio' })} />
      </Campo>
      <Campo etiqueta="Email" error={e.email?.message}>
        <Input type="email" {...register('email', { required: 'Obligatorio' })} />
      </Campo>
      <Campo etiqueta="Dirección" error={e.direccion?.message}>
        <Input {...register('direccion', { required: 'Obligatorio' })} />
      </Campo>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
        {onCancelar && (
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        )}
        <Boton type="submit" cargando={formState.isSubmitting}>
          {textoBoton}
        </Boton>
      </div>
    </form>
  );
}
