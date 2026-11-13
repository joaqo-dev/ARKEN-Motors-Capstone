import { Plus, Search, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useFormulario } from '../../lib/formulario';
import { useSesion, useUsuario } from '../../auth/sesion';
import { useSucursalActiva } from '../../auth/sucursal-activa';
import { api } from '../../lib/api';
import { etiqueta } from '../../lib/formato';
import type { Usuario } from '../../lib/tipos';
import {
  Avatar,
  Boton,
  Buscador,
  Chip,
  cx,
  Campo,
  Cargando,
  EncabezadoPagina,
  Filtros,
  Input,
  Insignia,
  MensajeError,
  Modal,
  Opciones,
  Segmentado,
  Select,
  Tabla,
  Td,
  Th,
  ThOrdenable,
  Vacio,
  type Direccion,
  ItemMovil,
  ListaMovil,
} from '../../ui/componentes';
import { Confirmar } from '../../ui/confirmar';
import { useAviso } from '../../ui/toast';

type CampoOrdenUsuario = 'nombre' | 'rol' | 'sucursal';
interface FiltrosUsuarios {
  q: string;
  rol: string;
  estado: string; // ACTIVO | INACTIVO | PENDIENTE (invitación sin aceptar)
  sucursalId: string;
  orden: { campo: CampoOrdenUsuario; direccion: Direccion } | null;
}
const FILTROS_USUARIOS: FiltrosUsuarios = {
  q: '',
  rol: '',
  estado: '',
  sucursalId: '',
  orden: null,
};
const ORDEN_ROL = ['ADMIN_GENERAL', 'ADMIN_SUCURSAL', 'VENDEDOR'];
const sinTildes = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function filtrarUsuarios(
  usuarios: Usuario[],
  f: FiltrosUsuarios,
  nombreSucursal: (id: string) => string,
): Usuario[] {
  const q = sinTildes(f.q.trim());
  const lista = usuarios.filter(
    (u) =>
      (!q || sinTildes(`${u.nombre} ${u.email}`).includes(q)) &&
      (!f.rol || u.rol === f.rol) &&
      (!f.sucursalId || u.sucursalId === f.sucursalId) &&
      (!f.estado ||
        (f.estado === 'PENDIENTE'
          ? u.invitacionPendiente && u.estado === 'ACTIVO'
          : u.estado === f.estado && !(f.estado === 'ACTIVO' && u.invitacionPendiente))),
  );
  if (!f.orden) return lista;
  const { campo, direccion } = f.orden;
  const valor = (u: Usuario) =>
    campo === 'rol'
      ? String(ORDEN_ROL.indexOf(u.rol))
      : campo === 'sucursal'
        ? u.sucursalId
          ? nombreSucursal(u.sucursalId)
          : ''
        : u.nombre;
  return [...lista].sort(
    (a, b) => valor(a).localeCompare(valor(b), 'es') * (direccion === 'asc' ? 1 : -1),
  );
}

// Usuarios: alta por invitación (quien crea nunca conoce la contraseña). El
// Admin de Sucursal gestiona solo los de su sucursal.
export function UsuariosPage() {
  const yo = useUsuario();
  const { esGeneral } = useSesion();
  const { nombre, sucursales } = useSucursalActiva();
  // Búsqueda y filtros (la lista es corta: se filtra aquí). Viven solo en esta pantalla.
  const [filtros, setFiltros] = useState<FiltrosUsuarios>(FILTROS_USUARIOS);
  const qc = useQueryClient();
  const avisar = useAviso();
  const [modal, setModal] = useState<
    { tipo: 'nuevo' } | { tipo: 'editar' | 'estado'; usuario: Usuario } | null
  >(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api<Usuario[]>('GET', '/usuarios'),
  });
  const cambiar = (c: Partial<FiltrosUsuarios>) => setFiltros({ ...filtros, ...c });
  const hayFiltros = Boolean(
    filtros.q || filtros.rol || filtros.estado || filtros.sucursalId || filtros.orden,
  );
  const visibles = filtrarUsuarios(data ?? [], filtros, nombre);

  const reenviar = useMutation({
    mutationFn: (id: string) => api('POST', `/usuarios/${id}/reenviar-invitacion`),
    onSuccess: () => avisar('Invitación reenviada'),
    onError: (e) => avisar(e.message, 'error'),
  });
  const cambiarEstado = useMutation({
    mutationFn: (u: Usuario) =>
      api('POST', `/usuarios/${u.id}/${u.estado === 'ACTIVO' ? 'desactivar' : 'activar'}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      setModal(null);
      avisar('Usuario actualizado');
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion={
          esGeneral
            ? 'Todos los usuarios de la automotora.'
            : `Usuarios de ${nombre(yo.sucursalId)}.`
        }
        acciones={
          <Boton
            ayuda="Envía una invitación por correo para que la persona cree su contraseña"
            onClick={() => setModal({ tipo: 'nuevo' })}
          >
            <Plus aria-hidden />
            Invitar usuario
          </Boton>
        }
      />
      <Filtros>
        <Buscador
          className="sm:w-72"
          valor={filtros.q}
          onCambiar={(q) => cambiar({ q })}
          placeholder="Buscar por nombre o correo"
        />
        <Select
          className="sm:w-48"
          aria-label="Rol"
          value={filtros.rol}
          onChange={(e) => cambiar({ rol: e.target.value })}
        >
          <Opciones
            valores={['ADMIN_GENERAL', 'ADMIN_SUCURSAL', 'VENDEDOR']}
            vacia="Todos los roles"
          />
        </Select>
        <Segmentado
          className="max-sm:col-span-2 max-sm:justify-self-start"
          etiqueta="Estado"
          opciones={[
            { id: 'TODOS', texto: 'Todos' },
            { id: 'ACTIVO', texto: 'Activos' },
            { id: 'PENDIENTE', texto: 'Invitación pendiente' },
            { id: 'INACTIVO', texto: 'Inactivos' },
          ]}
          actual={filtros.estado || 'TODOS'}
          onCambiar={(id) => cambiar({ estado: id === 'TODOS' ? '' : id })}
        />
        {esGeneral && sucursales.length > 1 && (
          <Select
            className="sm:w-52"
            aria-label="Sucursal"
            value={filtros.sucursalId}
            onChange={(e) => cambiar({ sucursalId: e.target.value })}
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        )}
        {hayFiltros && (
          <Boton
            ayuda="Quita todos los filtros"
            variante="fantasma"
            chico
            onClick={() => setFiltros(FILTROS_USUARIOS)}
          >
            <X aria-hidden />
            Limpiar
          </Boton>
        )}
      </Filtros>
      {isLoading && <Cargando />}
      {error && <MensajeError error={error} />}
      {data && visibles.length === 0 && (
        <Vacio icono={Search} titulo="Ningún usuario coincide con esos filtros">
          Prueba con otra búsqueda, rol o estado.
        </Vacio>
      )}
      {data && visibles.length > 0 && (
        <Tabla
          movil={
            <ListaMovil>
              {visibles.map((u) => (
                <ItemMovil
                  key={u.id}
                  avatar={<Avatar nombre={u.nombre} />}
                  titulo={
                    <>
                      {u.nombre}{' '}
                      {u.id === yo.id && (
                        <span className="text-xs font-normal text-slate-500">(tú)</span>
                      )}
                    </>
                  }
                  subtitulo={u.email}
                  insignia={
                    u.invitacionPendiente ? (
                      <Insignia valor="PENDIENTE" texto="Invitación pendiente" />
                    ) : (
                      <Insignia valor={u.estado} />
                    )
                  }
                  pie={`${etiqueta(u.rol)} · ${u.sucursalId ? nombre(u.sucursalId) : 'Todas'}`}
                  tenue={u.estado === 'INACTIVO'}
                  acciones={
                    <>
                      {u.invitacionPendiente && u.estado === 'ACTIVO' && (
                        <Boton
                          ayuda="Vuelve a enviar el correo de invitación; el enlace anterior deja de servir"
                          variante="fantasma"
                          chico
                          cargando={reenviar.isPending && reenviar.variables === u.id}
                          onClick={() => reenviar.mutate(u.id)}
                        >
                          Reenviar invitación
                        </Boton>
                      )}
                      {u.id !== yo.id && (
                        <>
                          <Boton
                            ayuda="Cambia el nombre, el rol o la sucursal del usuario"
                            variante="fantasma"
                            chico
                            onClick={() => setModal({ tipo: 'editar', usuario: u })}
                          >
                            Editar
                          </Boton>
                          <Boton
                            ayuda={
                              u.estado === 'ACTIVO'
                                ? 'Le quita el acceso al panel; su historial se conserva'
                                : 'Le devuelve el acceso al panel'
                            }
                            variante={u.estado === 'ACTIVO' ? 'fantasmaPeligro' : 'fantasma'}
                            chico
                            onClick={() => setModal({ tipo: 'estado', usuario: u })}
                          >
                            {u.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                          </Boton>
                        </>
                      )}
                    </>
                  }
                />
              ))}
            </ListaMovil>
          }
        >
          <thead>
            <tr>
              <ThOrdenable
                direccion={filtros.orden?.campo === 'nombre' ? filtros.orden.direccion : null}
                onOrdenar={(d) => cambiar({ orden: d ? { campo: 'nombre', direccion: d } : null })}
              >
                Usuario
              </ThOrdenable>
              <ThOrdenable
                direccion={filtros.orden?.campo === 'rol' ? filtros.orden.direccion : null}
                onOrdenar={(d) => cambiar({ orden: d ? { campo: 'rol', direccion: d } : null })}
              >
                Rol
              </ThOrdenable>
              <ThOrdenable
                direccion={filtros.orden?.campo === 'sucursal' ? filtros.orden.direccion : null}
                onOrdenar={(d) =>
                  cambiar({ orden: d ? { campo: 'sucursal', direccion: d } : null })
                }
              >
                Sucursal
              </ThOrdenable>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((u) => (
              <tr key={u.id}>
                <Td>
                  <div
                    className={cx(
                      'flex items-center gap-3',
                      u.estado === 'INACTIVO' && 'opacity-60',
                    )}
                  >
                    <Avatar nombre={u.nombre} />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        {u.nombre}{' '}
                        {u.id === yo.id && (
                          <span className="text-xs font-normal text-slate-500">(tú)</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  {/* El administrador general, en tinta: el único rol que ve toda la automotora */}
                  {u.rol === 'ADMIN_GENERAL' ? (
                    <span className="inline-flex h-7 items-center rounded-full bg-slate-900 px-3 text-xs font-medium text-invertido">
                      {etiqueta(u.rol)}
                    </span>
                  ) : (
                    <Chip>{etiqueta(u.rol)}</Chip>
                  )}
                </Td>
                <Td>{u.sucursalId ? nombre(u.sucursalId) : 'Todas'}</Td>
                <Td>
                  {u.invitacionPendiente ? (
                    <Insignia valor="PENDIENTE" texto="Invitación pendiente" />
                  ) : (
                    <Insignia valor={u.estado} />
                  )}
                </Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    {u.invitacionPendiente && u.estado === 'ACTIVO' && (
                      <Boton
                        ayuda="Vuelve a enviar el correo de invitación; el enlace anterior deja de servir"
                        variante="fantasma"
                        chico
                        cargando={reenviar.isPending && reenviar.variables === u.id}
                        onClick={() => reenviar.mutate(u.id)}
                      >
                        Reenviar invitación
                      </Boton>
                    )}
                    {u.id !== yo.id && (
                      <>
                        <Boton
                          ayuda="Cambia el nombre, el rol o la sucursal del usuario"
                          variante="fantasma"
                          chico
                          onClick={() => setModal({ tipo: 'editar', usuario: u })}
                        >
                          Editar
                        </Boton>
                        <Boton
                          ayuda={
                            u.estado === 'ACTIVO'
                              ? 'Le quita el acceso al panel; su historial se conserva'
                              : 'Le devuelve el acceso al panel'
                          }
                          variante={u.estado === 'ACTIVO' ? 'fantasmaPeligro' : 'fantasma'}
                          chico
                          onClick={() => setModal({ tipo: 'estado', usuario: u })}
                        >
                          {u.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                        </Boton>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {modal?.tipo === 'nuevo' && <FormularioUsuario onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'editar' && (
        <FormularioUsuario usuario={modal.usuario} onCerrar={() => setModal(null)} />
      )}
      {modal?.tipo === 'estado' && (
        <Confirmar
          titulo={modal.usuario.estado === 'ACTIVO' ? 'Desactivar usuario' : 'Activar usuario'}
          mensaje={
            modal.usuario.estado === 'ACTIVO'
              ? `${modal.usuario.nombre} no podrá iniciar sesión y se cerrarán sus sesiones abiertas. Su historial se conserva.`
              : `${modal.usuario.nombre} podrá volver a iniciar sesión.`
          }
          textoConfirmar={modal.usuario.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
          peligro={modal.usuario.estado === 'ACTIVO'}
          cargando={cambiarEstado.isPending}
          onConfirmar={() => cambiarEstado.mutate(modal.usuario)}
          onCerrar={() => setModal(null)}
        />
      )}
    </>
  );
}

function FormularioUsuario({ usuario, onCerrar }: { usuario?: Usuario; onCerrar: () => void }) {
  const yo = useUsuario();
  const { esGeneral } = useSesion();
  const { sucursales } = useSucursalActiva();
  const qc = useQueryClient();
  const avisar = useAviso();
  const { register, handleSubmit, watch, formState } = useFormulario({
    defaultValues: {
      nombre: usuario?.nombre ?? '',
      email: usuario?.email ?? '',
      rol: usuario?.rol ?? 'VENDEDOR',
      sucursalId: usuario?.sucursalId ?? yo.sucursalId ?? sucursales[0]?.id ?? '',
    },
  });
  const rol = watch('rol');
  const guardar = handleSubmit(async (d) => {
    const sucursalId = d.rol === 'ADMIN_GENERAL' ? null : esGeneral ? d.sucursalId : yo.sucursalId;
    try {
      if (usuario) {
        await api('PATCH', `/usuarios/${usuario.id}`, {
          body: { nombre: d.nombre, rol: d.rol, sucursalId },
        });
        avisar('Usuario actualizado');
      } else {
        await api('POST', '/usuarios', {
          body: {
            nombre: d.nombre,
            email: d.email,
            rol: d.rol,
            sucursalId: sucursalId ?? undefined,
          },
        });
        avisar(`Invitación enviada a ${d.email}`);
      }
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      onCerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  });
  return (
    <Modal titulo={usuario ? 'Editar usuario' : 'Invitar usuario'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        {!usuario && (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
            Le enviaremos un correo para que defina su propia contraseña. Nunca conocerás su
            contraseña.
          </p>
        )}
        <Campo etiqueta="Nombre" error={formState.errors.nombre?.message}>
          <Input {...register('nombre', { required: 'Obligatorio' })} />
        </Campo>
        {!usuario && (
          <Campo etiqueta="Email" error={formState.errors.email?.message}>
            <Input type="email" {...register('email', { required: 'Obligatorio' })} />
          </Campo>
        )}
        <Campo
          etiqueta="Rol"
          ayuda={
            rol === 'VENDEDOR'
              ? 'No ve costos ni márgenes, no administra usuarios ni registra gastos.'
              : undefined
          }
        >
          <Select {...register('rol')}>
            {esGeneral && (
              <option value="ADMIN_GENERAL">Admin General (todas las sucursales)</option>
            )}
            <option value="ADMIN_SUCURSAL">Admin de Sucursal</option>
            <option value="VENDEDOR">Vendedor</option>
          </Select>
        </Campo>
        {esGeneral && rol !== 'ADMIN_GENERAL' && (
          <Campo etiqueta="Sucursal">
            <Select {...register('sucursalId', { required: true })}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={formState.isSubmitting}>
            {usuario ? 'Guardar' : 'Enviar invitación'}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
