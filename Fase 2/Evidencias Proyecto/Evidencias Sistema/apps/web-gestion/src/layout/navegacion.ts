import {
  BadgeDollarSign,
  Building,
  CalendarClock,
  Car,
  ClipboardCheck,
  FileText,
  Handshake,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

// Menú lateral. `admin`: solo ADMIN_GENERAL / ADMIN_SUCURSAL; `general`: solo ADMIN_GENERAL.
export interface ItemMenu {
  ruta: string;
  texto: string;
  icono: LucideIcon;
  admin?: boolean;
  general?: boolean;
}

export const MENU: { seccion: string; items: ItemMenu[] }[] = [
  {
    seccion: 'General',
    items: [
      { ruta: '/', texto: 'Inicio', icono: LayoutDashboard },
      { ruta: '/analitica', texto: 'Analítica', icono: TrendingUp },
    ],
  },
  {
    seccion: 'Inventario',
    items: [
      { ruta: '/vehiculos', texto: 'Vehículos', icono: Car },
      { ruta: '/consignaciones', texto: 'Consignaciones', icono: Handshake },
      { ruta: '/gastos', texto: 'Gastos', icono: Receipt, admin: true },
    ],
  },
  {
    seccion: 'Comercial',
    items: [
      { ruta: '/clientes', texto: 'Clientes', icono: Users },
      { ruta: '/cotizaciones', texto: 'Cotizaciones', icono: FileText },
      { ruta: '/reservas', texto: 'Reservas', icono: CalendarClock },
      { ruta: '/tasaciones', texto: 'Tasaciones', icono: ClipboardCheck },
      { ruta: '/ventas', texto: 'Ventas', icono: BadgeDollarSign },
    ],
  },
  {
    seccion: 'Administración',
    items: [
      { ruta: '/usuarios', texto: 'Usuarios', icono: UserCog, admin: true },
      { ruta: '/sucursales', texto: 'Sucursales', icono: Building, general: true },
      { ruta: '/auditoria', texto: 'Auditoría', icono: ShieldCheck, admin: true },
      { ruta: '/configuracion', texto: 'Configuración', icono: Settings, general: true },
    ],
  },
];
