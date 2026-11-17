import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { REGIONES_CHILE } from '@vitriauto/shared-types';
import { EmailService } from '../email/email.service';
import { InspeccionesRepository } from '../inspecciones/inspecciones.repository';
import { BuscarVehiculosDto, FiltrosDisponiblesDto } from './dto/buscar-vehiculos.dto';
import { ContactoAutomotoraDto } from './dto/contacto.dto';
import { POR_PAGINA, PublicoRepository, VehiculoPublicoRow } from './publico.repository';

const n = (v: string | number | null | undefined) =>
  v === null || v === undefined ? null : Number(v);
const region = (codigo: string) => ({
  codigo,
  nombre: REGIONES_CHILE[codigo as keyof typeof REGIONES_CHILE] ?? codigo,
});
const opciones = (filas: { valor: string; cantidad: string }[]) =>
  filas.map((f) => ({ valor: f.valor, cantidad: Number(f.cantidad) }));

// Enlace wa.me con un mensaje prearmado sobre el vehículo.
export function enlaceWhatsapp(numero: string, texto: string): string {
  return `https://wa.me/${numero.replace(/[^\d]/g, '')}?text=${encodeURIComponent(texto)}`;
}

// La tarjeta del listado NO identifica a la automotora (Módulo 2).
function tarjeta(v: VehiculoPublicoRow) {
  return {
    id: v.id,
    marca: v.marca,
    modelo: v.modelo,
    version: v.version,
    anio: v.anio,
    kilometraje: v.kilometraje,
    precio: Number(v.precio_venta),
    categoria: v.categoria,
    transmision: v.transmision,
    combustible: v.combustible,
    fotoPortada: v.foto_portada,
    ubicacion: { comuna: v.comuna, region: region(v.region) },
  };
}

// Sitio público (Módulos 2 y 3): acceso 100% anónimo, solo datos publicables.
@Injectable()
export class PublicoService {
  constructor(
    private readonly repo: PublicoRepository,
    private readonly email: EmailService,
    private readonly inspecciones: InspeccionesRepository,
  ) {}

  async buscar(filtro: BuscarVehiculosDto) {
    const { rows, total } = await this.repo.buscar(filtro);
    const pagina = filtro.pagina ?? 1;
    return {
      items: rows.map(tarjeta),
      total,
      pagina,
      porPagina: POR_PAGINA,
      paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
    };
  }

  async detalle(id: string) {
    const v = await this.repo.detalle(id);
    if (!v) throw new NotFoundException('Vehículo no disponible');
    const numero = v.sucursal_whatsapp ?? v.sucursal_telefono;
    const titulo = `${v.marca} ${v.modelo}${v.version ? ` ${v.version}` : ''} ${v.anio}`;
    return {
      ...tarjeta(v),
      color: v.color,
      cilindrada: v.cilindrada,
      traccion: v.traccion,
      descripcion: v.descripcion,
      fotos: v.fotos,
      // En el detalle sí se identifica a la automotora y la sucursal donde está el auto.
      automotora: {
        nombre: v.automotora_nombre,
        subdominio: v.automotora_subdominio,
        logoUrl: v.automotora_logo,
      },
      sucursal: {
        nombre: v.sucursal_nombre,
        direccion: v.sucursal_direccion,
        comuna: v.comuna,
        region: region(v.region),
        telefono: v.sucursal_telefono,
        horarioAtencion: v.sucursal_horario,
      },
      whatsapp: enlaceWhatsapp(
        numero,
        `Hola, me interesa el ${titulo} publicado en ${v.automotora_nombre}.`,
      ),
      // Simulador de crédito: solo si la automotora lo activó (con tasa).
      financiamiento:
        v.financiamiento_activo && v.financiamiento_tasa_mensual !== null
          ? {
              tasaMensual: Number(v.financiamiento_tasa_mensual),
              pieMinimo: v.financiamiento_pie_minimo,
              plazoMaximo: v.financiamiento_plazo_maximo,
            }
          : null,
      inspeccion: await this.inspeccionPublica(id),
    };
  }

  // Última inspección finalizada, solo si está aprobada (Módulo 7.11). Al público
  // solo se le informa que existe, con su resultado: el detalle punto por punto
  // (evaluaciones, observaciones, fotos) queda en el panel.
  private async inspeccionPublica(vehiculoId: string) {
    const i = await this.inspecciones.publicaDeVehiculo(vehiculoId);
    if (!i) return null;
    return {
      resultado: i.resultado,
      fecha: i.fecha_finalizacion,
      kilometraje: i.kilometraje,
    };
  }

  async filtros(consulta: FiltrosDisponiblesDto) {
    const f = await this.repo.filtros(consulta);
    return {
      marcas: opciones(f.marcas),
      modelos: opciones(f.modelos),
      categorias: opciones(f.categorias),
      transmisiones: opciones(f.transmisiones),
      regiones: f.regiones.map((r) => ({ ...region(r.valor), cantidad: Number(r.cantidad) })),
      comunas: opciones(f.comunas),
      rangos: {
        anio: { min: n(f.rangos.anio_min), max: n(f.rangos.anio_max) },
        precio: { min: n(f.rangos.precio_min), max: n(f.rangos.precio_max) },
        kilometraje: { min: n(f.rangos.km_min), max: n(f.rangos.km_max) },
      },
      sucursales: f.sucursales.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        comuna: s.comuna,
        cantidad: Number(s.cantidad),
      })),
    };
  }

  async automotora(subdominio: string) {
    const a = await this.repo.automotora(subdominio);
    if (!a) throw new NotFoundException('Automotora no encontrada');
    return {
      nombre: a.nombre,
      subdominio: a.subdominio,
      email: a.email,
      descripcion: a.descripcion,
      logoUrl: a.logo_url,
      bannerUrl: a.banner_url,
      // "Encuéntranos": una dirección por sucursal.
      sucursales: a.sucursales.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        direccion: s.direccion,
        comuna: s.comuna,
        region: region(s.region),
        telefono: s.telefono,
        horarioAtencion: s.horario_atencion,
        whatsapp: enlaceWhatsapp(
          s.whatsapp ?? s.telefono,
          `Hola, los contacto desde su página en la plataforma.`,
        ),
        esPrincipal: s.es_principal,
      })),
    };
  }

  // SEO (Módulo 3): las vitrinas son lo único que se indexa del sitio público.
  async vitrinas() {
    return this.repo.vitrinas();
  }

  async directorio() {
    const filas = await this.repo.directorio();
    return filas.map((a) => ({
      nombre: a.nombre,
      subdominio: a.subdominio,
      descripcion: a.descripcion,
      logoUrl: a.logo_url,
      bannerUrl: a.banner_url,
      vehiculos: Number(a.vehiculos),
      comunas: a.comunas,
    }));
  }

  // Formulario de contacto (Módulo 3): no guarda nada, solo reenvía el mensaje
  // al correo de la automotora con reply-to al visitante.
  async contactar(subdominio: string, dto: ContactoAutomotoraDto) {
    const a = await this.repo.automotora(subdominio);
    if (!a) throw new NotFoundException('Automotora no encontrada');
    // Bot (llenó el campo oculto): se responde como si nada para no darle pistas.
    if (dto.sitioWeb) return { enviado: true };

    let sucursal: string | null = null;
    if (dto.sucursalId) {
      const s = a.sucursales.find((x) => x.id === dto.sucursalId);
      if (!s) throw new BadRequestException('La sucursal no existe');
      sucursal = `${s.nombre} (${s.comuna})`;
    }
    const enviado = await this.email.enviarContactoVitrina(a.email, {
      automotora: a.nombre,
      nombre: dto.nombre,
      email: dto.email,
      telefono: dto.telefono ?? null,
      sucursal,
      mensaje: dto.mensaje,
    });
    if (!enviado) {
      throw new ServiceUnavailableException(
        'No pudimos enviar tu mensaje. Intenta de nuevo o escríbenos por WhatsApp.',
      );
    }
    return { enviado: true };
  }
}
