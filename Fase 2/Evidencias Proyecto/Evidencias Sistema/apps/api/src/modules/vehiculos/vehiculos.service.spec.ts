import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { UsuarioAutenticado } from '../../common/usuario-autenticado';
import { toConsignacionResumen, toVehiculoResponse } from './vehiculos.mapper';
import { VehiculosService, traccionSegunCategoria } from './vehiculos.service';

const SUC_A = '11111111-1111-1111-1111-111111111111';
const SUC_B = '22222222-2222-2222-2222-222222222222';
const adminGeneral: UsuarioAutenticado = {
  id: 'ag',
  automotoraId: 'a1',
  sucursalId: null,
  rol: 'ADMIN_GENERAL',
};
const vendedorA: UsuarioAutenticado = {
  id: 'va',
  automotoraId: 'a1',
  sucursalId: SUC_A,
  rol: 'VENDEDOR',
};

const dtoBase = {
  marca: 'Toyota',
  modelo: 'Yaris',
  anio: 2020,
  kilometraje: 40000,
  color: 'Rojo',
  combustible: 'BENCINA',
  transmision: 'MANUAL',
  patente: 'bcdf-12',
  categoria: 'SEDAN',
  traccion: 'X4X2',
  precioVenta: 9_000_000,
  origen: 'COMPRA_DIRECTA' as const,
  costoAdquisicion: 7_000_000,
};

function vehiculoRow(parcial: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    automotora_id: 'a1',
    sucursal_id: SUC_A,
    sucursal_nombre: 'Sucursal A',
    patente: 'BCDF12',
    precio_venta: '9000000.00',
    costo_adquisicion: '7000000.00',
    origen: 'COMPRA_DIRECTA',
    estado: 'EN_PREPARACION',
    foto_portada: null,
    fotos_cantidad: 0,
    documentos_vigentes: [],
    inspeccion_aprobada: false,
    observacion_revision: null,
    marca: 'Toyota',
    modelo: 'Yaris',
    anio: 2020,
    combustible: 'BENCINA',
    ...parcial,
  };
}

function crearServicio() {
  const vehiculos = {
    existePatenteEnInventario: jest.fn().mockResolvedValue(false),
    create: jest.fn().mockResolvedValue({ id: 'v1' }),
    findByIdScoped: jest.fn().mockResolvedValue(vehiculoRow()),
    lockById: jest.fn().mockResolvedValue(vehiculoRow()),
    update: jest.fn(),
    setEstado: jest.fn(),
    setSucursal: jest.fn(),
    setObservacionRevision: jest.fn(),
    findAllScoped: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
  };
  const fotos = {
    contar: jest.fn().mockResolvedValue(0),
    findByVehiculo: jest.fn().mockResolvedValue([]),
  };
  const documentos = { findByVehiculo: jest.fn().mockResolvedValue([]) };
  const notificaciones = { create: jest.fn(), resolverDeVehiculo: jest.fn() };
  const bitacora = { registrar: jest.fn() };
  const consignaciones = {
    create: jest.fn().mockResolvedValue({ id: 'c1' }),
    findByVehiculo: jest.fn(),
  };
  const clientes = { findById: jest.fn().mockResolvedValue({ id: 'c1', estado: 'ACTIVO' }) };
  const sucursales = {
    findByIdScoped: jest
      .fn()
      .mockImplementation(async (id: string) =>
        [SUC_A, SUC_B].includes(id)
          ? { id, nombre: id === SUC_A ? 'Sucursal A' : 'Sucursal B' }
          : null,
      ),
  };
  const folios = { siguiente: jest.fn().mockResolvedValue(1) };
  const auditoria = { registrar: jest.fn() };
  const tasaciones = {
    findByIdScoped: jest.fn().mockResolvedValue({
      id: 't1',
      folio: 7,
      estado: 'ACEPTADA',
      patente: 'BCDF12',
      vehiculo_creado_id: null,
    }),
  };
  const tx = { run: jest.fn().mockImplementation((fn) => fn({})) };
  const service = new VehiculosService(
    vehiculos as never,
    fotos as never,
    documentos as never,
    bitacora as never,
    consignaciones as never,
    clientes as never,
    sucursales as never,
    folios as never,
    auditoria as never,
    tasaciones as never,
    { generarTrasEmitir: jest.fn() } as never,
    { alEmitir: jest.fn() } as never,
    tx as never,
    notificaciones as never,
  );
  return {
    service,
    vehiculos,
    fotos,
    bitacora,
    consignaciones,
    folios,
    auditoria,
    tasaciones,
    notificaciones,
  };
}

describe('VehiculosService.crear', () => {
  it('autocompleta la sucursal del VENDEDOR y normaliza la patente', async () => {
    const { service, vehiculos, bitacora } = crearServicio();
    await service.crear({ ...dtoBase }, vendedorA);
    expect(vehiculos.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sucursalId: SUC_A,
        patente: 'BCDF12',
        costoAdquisicion: 7_000_000,
      }),
      expect.anything(),
    );
    expect(bitacora.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: 'ALTA' }),
      expect.anything(),
    );
  });

  it('el VENDEDOR no puede dar de alta en otra sucursal', async () => {
    const { service } = crearServicio();
    await expect(service.crear({ ...dtoBase, sucursalId: SUC_B }, vendedorA)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('el ADMIN_GENERAL debe elegir la sucursal explícitamente', async () => {
    const { service } = crearServicio();
    await expect(service.crear({ ...dtoBase }, adminGeneral)).rejects.toThrow(BadRequestException);
  });

  it('rechaza una patente ya presente en el inventario', async () => {
    const { service, vehiculos } = crearServicio();
    vehiculos.existePatenteEnInventario.mockResolvedValue(true);
    await expect(service.crear({ ...dtoBase }, vendedorA)).rejects.toThrow(ConflictException);
  });

  it('consignación: costo 0 y consignación con folio de la sucursal del vehículo', async () => {
    const { service, vehiculos, consignaciones, folios } = crearServicio();
    await service.crear(
      {
        ...dtoBase,
        origen: 'CONSIGNACION',
        costoAdquisicion: undefined,
        sucursalId: SUC_B,
        consignacion: {
          clienteId: 'c1',
          tipoTrato: 'COMISION_VENTA',
          porcentajeComision: 8,
          precioMinimo: 8_000_000,
          fechaInicio: '2026-01-01',
          fechaFin: '2026-03-01',
        },
      },
      adminGeneral,
    );
    expect(vehiculos.create).toHaveBeenCalledWith(
      expect.objectContaining({ costoAdquisicion: 0, origen: 'CONSIGNACION' }),
      expect.anything(),
    );
    expect(folios.siguiente).toHaveBeenCalledWith('consignacion', 'a1', expect.anything());
    expect(consignaciones.create).toHaveBeenCalledWith(
      expect.objectContaining({
        folio: 1,
        sucursalId: SUC_B,
        vehiculoId: 'v1',
        trato: {
          tipoTrato: 'COMISION_VENTA',
          porcentajeComision: 8,
          montoNeto: null,
          precioMinimo: 8_000_000,
        },
      }),
      expect.anything(),
    );
  });

  it('consignación a precio neto: el neto es el precio mínimo', async () => {
    const { service, consignaciones } = crearServicio();
    await service.crear(
      {
        ...dtoBase,
        origen: 'CONSIGNACION',
        costoAdquisicion: undefined,
        sucursalId: SUC_A,
        consignacion: {
          clienteId: 'c1',
          tipoTrato: 'PRECIO_NETO',
          montoNeto: 10_000_000,
          fechaFin: '2099-01-01',
        },
      },
      adminGeneral,
    );
    expect(consignaciones.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trato: {
          tipoTrato: 'PRECIO_NETO',
          porcentajeComision: null,
          montoNeto: 10_000_000,
          precioMinimo: 10_000_000,
        },
      }),
      expect.anything(),
    );
  });

  it('consignación a comisión sin porcentaje: se rechaza', async () => {
    const { service } = crearServicio();
    await expect(
      service.crear(
        {
          ...dtoBase,
          origen: 'CONSIGNACION',
          costoAdquisicion: undefined,
          sucursalId: SUC_A,
          consignacion: {
            clienteId: 'c1',
            tipoTrato: 'COMISION_VENTA',
            precioMinimo: 8_000_000,
            fechaFin: '2099-01-01',
          },
        },
        adminGeneral,
      ),
    ).rejects.toThrow('La comisión debe ser un porcentaje');
  });

  it('consignación: rechaza costo de adquisición', async () => {
    const { service } = crearServicio();
    await expect(
      service.crear(
        {
          ...dtoBase,
          origen: 'CONSIGNACION',
          consignacion: {
            clienteId: 'c1',
            tipoTrato: 'PRECIO_NETO',
            montoNeto: 8_000_000,
            fechaFin: '2099-01-01',
          },
        },
        vendedorA,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('VehiculosService.crear (compra a particular)', () => {
  const dtoParticular = { ...dtoBase, origen: 'COMPRA_PARTICULAR' as const, tasacionId: 't1' };

  it('referencia la tasación aceptada y usa el costo ingresado', async () => {
    const { service, vehiculos } = crearServicio();
    await service.crear(dtoParticular, vendedorA);
    expect(vehiculos.create).toHaveBeenCalledWith(
      expect.objectContaining({
        origen: 'COMPRA_PARTICULAR',
        tasacionOrigenId: 't1',
        costoAdquisicion: 7_000_000,
      }),
      expect.anything(),
    );
  });

  it.each([
    ['no aceptada', { estado: 'VIGENTE' }, BadRequestException],
    ['ya usada', { vehiculo_creado_id: 'v9' }, ConflictException],
    ['de otra patente', { patente: 'ZZZZ99' }, BadRequestException],
  ])('rechaza una tasación %s', async (_caso, cambios, error) => {
    const { service, tasaciones } = crearServicio();
    tasaciones.findByIdScoped.mockResolvedValue({
      id: 't1',
      folio: 7,
      estado: 'ACEPTADA',
      patente: 'BCDF12',
      vehiculo_creado_id: null,
      ...cambios,
    });
    await expect(service.crear(dtoParticular, vendedorA)).rejects.toThrow(error);
  });
});

describe('VehiculosService.actualizar', () => {
  it('el VENDEDOR no puede modificar el costo', async () => {
    const { service } = crearServicio();
    await expect(service.actualizar('v1', { costoAdquisicion: 1 }, vendedorA)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('un cambio de precio queda en bitácora y auditoría con la sucursal del vehículo', async () => {
    const { service, bitacora, auditoria } = crearServicio();
    await service.actualizar('v1', { precioVenta: 8_500_000 }, vendedorA);
    expect(bitacora.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: 'CAMBIO_PRECIO' }),
      expect.anything(),
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'VEHICULO_CAMBIO_PRECIO',
        sucursalId: SUC_A,
        valorAnterior: { precioVenta: 9_000_000 },
        valorNuevo: { precioVenta: 8_500_000 },
      }),
      expect.anything(),
    );
  });

  it('editar datos generales audita solo lo que cambió (VEHICULO_EDITADO)', async () => {
    const { service, vehiculos, auditoria } = crearServicio();
    vehiculos.lockById.mockResolvedValue(
      vehiculoRow({ kilometraje: 40000, color: 'Rojo', descripcion: null }),
    );
    await service.actualizar(
      'v1',
      { kilometraje: 41_000, descripcion: 'Único dueño', color: 'Rojo' },
      vendedorA,
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'VEHICULO_EDITADO',
        sucursalId: SUC_A,
        valorAnterior: { kilometraje: 40000, descripcion: null },
        valorNuevo: { kilometraje: 41_000, descripcion: 'Único dueño' },
      }),
      expect.anything(),
    );
  });

  it('guardar los mismos datos no audita una edición', async () => {
    const { service, vehiculos, auditoria } = crearServicio();
    vehiculos.lockById.mockResolvedValue(vehiculoRow({ color: 'Rojo' }));
    await service.actualizar('v1', { color: 'Rojo' }, vendedorA);
    expect(auditoria.registrar).not.toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'VEHICULO_EDITADO' }),
      expect.anything(),
    );
  });

  it('un vehículo vendido no se edita', async () => {
    const { service, vehiculos } = crearServicio();
    vehiculos.lockById.mockResolvedValue(vehiculoRow({ estado: 'VENDIDO' }));
    await expect(service.actualizar('v1', { color: 'Azul' }, vendedorA)).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('VehiculosService.cambiarEstado', () => {
  it('no se publica (DISPONIBLE) sin fotos', async () => {
    const { service } = crearServicio();
    await expect(
      service.cambiarEstado('v1', { estado: 'DISPONIBLE' }, adminGeneral),
    ).rejects.toThrow(ConflictException);
  });

  it('con fotos se publica y queda en bitácora', async () => {
    const { service, fotos, vehiculos, bitacora } = crearServicio();
    fotos.contar.mockResolvedValue(3);
    await service.cambiarEstado('v1', { estado: 'DISPONIBLE' }, adminGeneral);
    expect(vehiculos.setEstado).toHaveBeenCalledWith('v1', 'DISPONIBLE', expect.anything());
    expect(bitacora.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoEvento: 'CAMBIO_ESTADO' }),
      expect.anything(),
    );
  });

  it.each(['RESERVADO', 'VENDIDO'])('no cambia a mano un vehículo %s', async (estado) => {
    const { service, vehiculos } = crearServicio();
    vehiculos.lockById.mockResolvedValue(vehiculoRow({ estado }));
    await expect(
      service.cambiarEstado('v1', { estado: 'DADO_DE_BAJA' }, vendedorA),
    ).rejects.toThrow(ConflictException);
  });

  it('revalida el scope dentro de la transacción (vehículo transferido entre medio)', async () => {
    const { service, vehiculos } = crearServicio();
    vehiculos.lockById.mockResolvedValue(vehiculoRow({ sucursal_id: SUC_B }));
    await expect(
      service.cambiarEstado('v1', { estado: 'DADO_DE_BAJA' }, vendedorA),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('VehiculosService.transferir', () => {
  it('actualiza la sucursal y registra origen → destino', async () => {
    const { service, vehiculos, bitacora } = crearServicio();
    await service.transferir('v1', { sucursalDestinoId: SUC_B }, adminGeneral);
    expect(vehiculos.setSucursal).toHaveBeenCalledWith('v1', SUC_B, expect.anything());
    expect(bitacora.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: 'TRANSFERENCIA_SUCURSAL',
        descripcion: 'Transferencia: Sucursal A → Sucursal B',
      }),
      expect.anything(),
    );
  });

  it('rechaza transferir a la misma sucursal', async () => {
    const { service } = crearServicio();
    await expect(
      service.transferir('v1', { sucursalDestinoId: SUC_A }, adminGeneral),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('VehiculosService.listar (orden)', () => {
  it('pasa el criterio y la dirección al repositorio', async () => {
    const { service, vehiculos } = crearServicio();
    await service.listar({ orden: 'precio', direccion: 'desc' }, adminGeneral);
    expect(vehiculos.findAllScoped).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orden: 'precio', direccion: 'desc' }),
    );
  });

  it('el Vendedor no puede ordenar por costo (revelaría costos)', async () => {
    const { service, vehiculos } = crearServicio();
    await expect(service.listar({ orden: 'costo' }, vendedorA)).rejects.toThrow(
      'No tienes permiso para ordenar por costo',
    );
    expect(vehiculos.findAllScoped).not.toHaveBeenCalled();
  });

  it('el Vendedor sí puede ordenar por precio, estado o días', async () => {
    const { service, vehiculos } = crearServicio();
    await service.listar({ orden: 'dias', direccion: 'asc' }, vendedorA);
    expect(vehiculos.findAllScoped).toHaveBeenCalled();
  });
});

describe('toVehiculoResponse', () => {
  it('oculta el costo de adquisición al VENDEDOR', () => {
    const row = vehiculoRow() as never;
    expect(toVehiculoResponse(row, 'VENDEDOR')).not.toHaveProperty('costoAdquisicion');
    expect(toVehiculoResponse(row, 'ADMIN_SUCURSAL')).toHaveProperty('costoAdquisicion', 7_000_000);
  });
});

describe('toConsignacionResumen', () => {
  const row = {
    id: 'c1',
    folio: 3,
    cliente_id: 'cl1',
    tipo_trato: 'COMISION_VENTA',
    porcentaje_comision: '8.00',
    monto_neto: null,
    precio_minimo: '11000000.00',
    fecha_inicio: '2026-01-01',
    fecha_fin: '2026-03-01',
    estado: 'ACTIVA',
  } as never;

  it('oculta la comisión al VENDEDOR pero le muestra el precio mínimo', () => {
    const vendedor = toConsignacionResumen(row, 'VENDEDOR');
    expect(vendedor).not.toHaveProperty('porcentajeComision');
    expect(vendedor).not.toHaveProperty('tipoTrato');
    expect(vendedor).toHaveProperty('precioMinimo', 11_000_000);
    expect(toConsignacionResumen(row, 'ADMIN_GENERAL')).toHaveProperty('porcentajeComision', 8);
  });
});

describe('traccionSegunCategoria (motos)', () => {
  it('una moto queda sin tracción aunque se envíe una', () => {
    expect(traccionSegunCategoria('MOTO', 'X4X2')).toBeNull();
    expect(traccionSegunCategoria('MOTO')).toBeNull();
  });

  it('el resto de las categorías exige tracción', () => {
    expect(traccionSegunCategoria('SUV', 'AWD')).toBe('AWD');
    expect(() => traccionSegunCategoria('SEDAN')).toThrow('Indica la tracción');
    expect(() => traccionSegunCategoria('CAMIONETA', null)).toThrow('Indica la tracción');
  });
});

describe('VehiculosService: revisión antes de publicar', () => {
  const vendedor: UsuarioAutenticado = {
    id: 'va',
    automotoraId: 'a1',
    sucursalId: '11111111-1111-1111-1111-111111111111',
    rol: 'VENDEDOR',
  };
  const admin: UsuarioAutenticado = {
    id: 'ag',
    automotoraId: 'a1',
    sucursalId: null,
    rol: 'ADMIN_GENERAL',
  };

  it('el Vendedor no publica: lo envía a revisión', async () => {
    const { service, fotos } = crearServicio();
    fotos.contar = jest.fn().mockResolvedValue(3);
    await expect(service.cambiarEstado('v1', { estado: 'DISPONIBLE' }, vendedor)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('enviar a revisión exige 1 foto y avisa a los admins de la sucursal', async () => {
    const sinFotos = crearServicio();
    sinFotos.fotos.contar = jest.fn().mockResolvedValue(0);
    await expect(
      sinFotos.service.cambiarEstado('v1', { estado: 'PENDIENTE_REVISION' }, vendedor),
    ).rejects.toThrow(ConflictException);

    const { service, fotos, notificaciones, vehiculos } = crearServicio();
    fotos.contar = jest.fn().mockResolvedValue(2);
    await service.cambiarEstado('v1', { estado: 'PENDIENTE_REVISION' }, vendedor);
    expect(vehiculos.setEstado).toHaveBeenCalledWith('v1', 'PENDIENTE_REVISION', expect.anything());
    expect(notificaciones.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'VEHICULO_POR_REVISAR',
        sucursalId: vehiculoRow().sucursal_id,
      }),
      expect.anything(),
    );
  });

  it('el admin lo devuelve con lo que hay que corregir, y se resuelve el aviso', async () => {
    const { service, vehiculos, notificaciones } = crearServicio();
    vehiculos.lockById = jest.fn().mockResolvedValue(vehiculoRow({ estado: 'PENDIENTE_REVISION' }));
    await expect(service.cambiarEstado('v1', { estado: 'EN_PREPARACION' }, admin)).rejects.toThrow(
      BadRequestException,
    );
    await service.cambiarEstado(
      'v1',
      { estado: 'EN_PREPARACION', motivo: 'Faltan fotos del interior' },
      admin,
    );
    expect(vehiculos.setObservacionRevision).toHaveBeenCalledWith(
      'v1',
      'Faltan fotos del interior',
      expect.anything(),
    );
    expect(notificaciones.resolverDeVehiculo).toHaveBeenCalledWith(
      'VEHICULO_POR_REVISAR',
      'v1',
      'ag',
      expect.anything(),
    );
  });

  it('al publicarlo se borra la observación de una devolución anterior', async () => {
    const { service, vehiculos, fotos } = crearServicio();
    fotos.contar = jest.fn().mockResolvedValue(4);
    vehiculos.lockById = jest
      .fn()
      .mockResolvedValue(
        vehiculoRow({ estado: 'PENDIENTE_REVISION', observacion_revision: 'Faltan fotos' }),
      );
    await service.cambiarEstado('v1', { estado: 'DISPONIBLE' }, admin);
    expect(vehiculos.setObservacionRevision).toHaveBeenCalledWith('v1', null, expect.anything());
  });

  it('el Vendedor no cambia el precio de un auto publicado, pero sí el resto', async () => {
    const { service, vehiculos } = crearServicio();
    vehiculos.lockById = jest.fn().mockResolvedValue(vehiculoRow({ estado: 'DISPONIBLE' }));
    await expect(service.actualizar('v1', { precioVenta: 8_000_000 }, vendedor)).rejects.toThrow(
      ForbiddenException,
    );
    await service.actualizar('v1', { descripcion: 'Único dueño' }, vendedor);
    expect(vehiculos.update).toHaveBeenCalled();
  });

  it('en preparación el Vendedor sí ajusta el precio', async () => {
    const { service, vehiculos } = crearServicio();
    await service.actualizar('v1', { precioVenta: 8_000_000 }, vendedor);
    expect(vehiculos.update).toHaveBeenCalled();
  });
});
