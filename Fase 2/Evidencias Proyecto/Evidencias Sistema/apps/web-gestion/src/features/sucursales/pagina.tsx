import { Building, Clock, MapPin, MessageCircle, Phone, Plus, User } from 'lucide-react';
import { REGIONES_CHILE } from '@vitriauto/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useFormulario } from '../../lib/formulario';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api } from '../../lib/api';
import type { Sucursal } from '../../lib/tipos';
import {
  Boton,
  Campo,
  EncabezadoPagina,
  Input,
  Modal,
  Select,
  Tarjeta,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { useAviso } from '../../ui/toast';

// Sucursales (solo Admin General). La baja es lógica y se bloquea si tiene
// vehículos activos o usuarios asignados.
export function SucursalesPage() {
  const { sucursales } = useSucursalActiva();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [modal, setModal] = useState<
    { tipo: 'nueva' } | { tipo: 'editar' | 'baja'; sucursal: Sucursal } | null
  >(null);
  const baja = useMutation({
    mutationFn: (id: string) => api('POST', `/sucursales/${id}/dar-de-baja`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sucursales'] });
      setModal(null);
      avisar('Sucursal dada de baja');
    },
    onError: (e) => avisar(e.message, 'error'),
  });
  return (
    <>
      <EncabezadoPagina
        titulo="Sucursales"
        descripcion="Cada sucursal aparece en el “Encuéntranos” de tu página pública."
        acciones={
          <Boton
            ayuda="Agrega una sucursal de la automotora"
            onClick={() => setModal({ tipo: 'nueva' })}
          >
            <Plus aria-hidden />
            Nueva sucursal
          </Boton>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sucursales.map((s) => (
          <Tarjeta
            key={s.id}
            titulo={
              <span className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <Building className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
                </span>
                {s.nombre}
                {s.esPrincipal && (
                  <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-invertido">
                    Principal
                  </span>
                )}
              </span>
            }
            acciones={
              <>
                <Boton
                  ayuda="Cambia la dirección, el contacto o el horario de la sucursal"
                  variante="fantasma"
                  chico
                  onClick={() => setModal({ tipo: 'editar', sucursal: s })}
                >
                  Editar
                </Boton>
                {!s.esPrincipal && (
                  <Boton
                    ayuda="Da de baja la sucursal; el cambio queda en la auditoría"
                    variante="fantasmaPeligro"
                    chico
                    onClick={() => setModal({ tipo: 'baja', sucursal: s })}
                  >
                    Dar de baja
                  </Boton>
                )}
              </>
            }
          >
            <ul className="mt-1 space-y-2.5 border-t border-slate-100 pt-4 text-sm text-slate-700 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-slate-500">
              <li className="flex gap-2.5">
                <MapPin aria-hidden />
                <span>
                  {s.direccion}, {s.comuna},{' '}
                  {REGIONES_CHILE[s.region as keyof typeof REGIONES_CHILE] ?? s.region}
                </span>
              </li>
              <li className="flex gap-2.5">
                <Phone aria-hidden />
                {s.telefono}
              </li>
              {s.whatsapp && (
                <li className="flex gap-2.5">
                  <MessageCircle aria-hidden />
                  WhatsApp {s.whatsapp}
                </li>
              )}
              {s.horarioAtencion && (
                <li className="flex gap-2.5">
                  <Clock aria-hidden />
                  {s.horarioAtencion}
                </li>
              )}
              {s.encargado && (
                <li className="flex gap-2.5">
                  <User aria-hidden />
                  {s.encargado}
                </li>
              )}
            </ul>
          </Tarjeta>
        ))}
      </div>
      {modal?.tipo === 'nueva' && <FormularioSucursal onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'editar' && (
        <FormularioSucursal sucursal={modal.sucursal} onCerrar={() => setModal(null)} />
      )}
      {modal?.tipo === 'baja' && (
        <Confirmar
          titulo="Dar de baja la sucursal"
          mensaje={`${modal.sucursal.nombre} dejará de aparecer en listados y en tu página pública. Su historial se conserva. Antes debes transferir sus vehículos y reasignar sus usuarios.`}
          textoConfirmar="Dar de baja"
          peligro
          cargando={baja.isPending}
          onConfirmar={() => baja.mutate(modal.sucursal.id)}
          onCerrar={() => setModal(null)}
        />
      )}
    </>
  );
}

function FormularioSucursal({ sucursal, onCerrar }: { sucursal?: Sucursal; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { register, handleSubmit, formState } = useFormulario({
    defaultValues: {
      nombre: sucursal?.nombre ?? '',
      direccion: sucursal?.direccion ?? '',
      region: sucursal?.region ?? 'METROPOLITANA',
      comuna: sucursal?.comuna ?? '',
      telefono: sucursal?.telefono ?? '',
      whatsapp: sucursal?.whatsapp ?? '',
      horarioAtencion: sucursal?.horarioAtencion ?? '',
      encargado: sucursal?.encargado ?? '',
    },
  });
  const e = formState.errors;
  const guardar = handleSubmit(async (d) => {
    const cuerpo = sucursal
      ? {
          ...d,
          whatsapp: d.whatsapp || null,
          horarioAtencion: d.horarioAtencion || null,
          encargado: d.encargado || null,
        }
      : {
          ...d,
          whatsapp: d.whatsapp || undefined,
          horarioAtencion: d.horarioAtencion || undefined,
          encargado: d.encargado || undefined,
        };
    try {
      await api(
        sucursal ? 'PATCH' : 'POST',
        sucursal ? `/sucursales/${sucursal.id}` : '/sucursales',
        { body: cuerpo },
      );
      qc.invalidateQueries({ queryKey: ['sucursales'] });
      avisar(sucursal ? 'Sucursal actualizada' : 'Sucursal creada');
      onCerrar();
    } catch (err) {
      avisar((err as Error).message, 'error');
    }
  });
  return (
    <Modal
      titulo={sucursal ? 'Editar sucursal' : 'Nueva sucursal'}
      onCerrar={onCerrar}
      ancho="max-w-2xl"
    >
      <form onSubmit={guardar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" error={e.nombre?.message}>
          <Input {...register('nombre', { required: 'Obligatorio' })} />
        </Campo>
        <Campo etiqueta="Encargado (opcional)">
          <Input {...register('encargado')} />
        </Campo>
        <Campo etiqueta="Dirección" error={e.direccion?.message} className="sm:col-span-2">
          <Input {...register('direccion', { required: 'Obligatoria' })} />
        </Campo>
        <Campo etiqueta="Región">
          <Select {...register('region')}>
            {Object.entries(REGIONES_CHILE).map(([codigo, nombre]) => (
              <option key={codigo} value={codigo}>
                {nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="Comuna" error={e.comuna?.message}>
          <Input {...register('comuna', { required: 'Obligatoria' })} />
        </Campo>
        <Campo etiqueta="Teléfono" error={e.telefono?.message}>
          <Input {...register('telefono', { required: 'Obligatorio' })} />
        </Campo>
        <Campo
          etiqueta="WhatsApp (celular)"
          ayuda="Para el botón de WhatsApp de sus vehículos. Ej: +56 9 1234 5678"
        >
          <Input {...register('whatsapp')} />
        </Campo>
        <Campo etiqueta="Horario de atención" className="sm:col-span-2">
          <Input
            placeholder="Lun a Vie 9:00–19:00, Sáb 10:00–14:00"
            {...register('horarioAtencion')}
          />
        </Campo>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={formState.isSubmitting}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
