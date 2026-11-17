import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider, RequiereRol, RequiereSesion } from './auth/sesion';
import { SucursalActivaProvider } from './auth/sucursal-activa';
import { LoginPage } from './features/auth/login';
import { RegistroPage } from './features/auth/registro';
import {
  AceptarInvitacionPage,
  OlvidePasswordPage,
  RestablecerPasswordPage,
  VerificarEmailPage,
} from './features/auth/tokens';
import { AnaliticaPage } from './features/analitica/pagina';
import { AuditoriaPage } from './features/auditoria/pagina';
import { ClientePage, ClientesPage } from './features/clientes/paginas';
import { ConfiguracionPage } from './features/configuracion/pagina';
import { ConsignacionesPage, ConsignacionPage } from './features/consignaciones/paginas';
import { InspeccionPage } from './features/inspecciones/pagina';
import { GastoPage } from './features/gastos/detalle';
import { GastosPage } from './features/gastos/pagina';
import { SucursalesPage } from './features/sucursales/pagina';
import { UsuariosPage } from './features/usuarios/pagina';
import {
  CotizacionesPage,
  CotizacionPage,
  NuevaCotizacionPage,
} from './features/cotizaciones/paginas';
import { DashboardPage } from './features/dashboard/dashboard';
import { NuevaReservaPage, ReservaPage, ReservasPage } from './features/reservas/paginas';
import { NuevaTasacionPage, TasacionesPage, TasacionPage } from './features/tasaciones/paginas';
import { NuevaVentaPage, VentaPage, VentasPage } from './features/ventas/paginas';
import { NotificacionesPage } from './features/notificaciones/notificaciones';
import { VehiculoPage } from './features/vehiculos/detalle';
import { NuevoVehiculoPage } from './features/vehiculos/formulario';
import { VehiculosPage } from './features/vehiculos/lista';
import { Layout } from './layout/layout';
import { ApiError } from './lib/api';
import { Vacio } from './ui/componentes';
import { ToastProvider } from './ui/toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // No reintentar errores de negocio o de permisos (4xx).
      retry: (fallos, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && fallos < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function NoEncontrada() {
  return <Vacio titulo="Página no encontrada">La dirección no existe.</Vacio>;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/registro', element: <RegistroPage /> },
  { path: '/verificar-email', element: <VerificarEmailPage /> },
  { path: '/aceptar-invitacion', element: <AceptarInvitacionPage /> },
  { path: '/olvide-password', element: <OlvidePasswordPage /> },
  { path: '/restablecer-password', element: <RestablecerPasswordPage /> },
  {
    element: <RequiereSesion />,
    children: [
      {
        element: (
          <SucursalActivaProvider>
            <Layout />
          </SucursalActivaProvider>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'notificaciones', element: <NotificacionesPage /> },
          { path: 'analitica', element: <AnaliticaPage /> },
          { path: 'vehiculos', element: <VehiculosPage /> },
          { path: 'vehiculos/nuevo', element: <NuevoVehiculoPage /> },
          { path: 'vehiculos/:id', element: <VehiculoPage /> },
          { path: 'vehiculos/:id/inspecciones/:inspeccionId', element: <InspeccionPage /> },
          { path: 'consignaciones', element: <ConsignacionesPage /> },
          { path: 'consignaciones/:id', element: <ConsignacionPage /> },
          { path: 'clientes', element: <ClientesPage /> },
          { path: 'clientes/:id', element: <ClientePage /> },
          { path: 'cotizaciones', element: <CotizacionesPage /> },
          { path: 'cotizaciones/nueva', element: <NuevaCotizacionPage /> },
          { path: 'cotizaciones/:id', element: <CotizacionPage /> },
          { path: 'reservas', element: <ReservasPage /> },
          { path: 'reservas/nueva', element: <NuevaReservaPage /> },
          { path: 'reservas/:id', element: <ReservaPage /> },
          { path: 'tasaciones', element: <TasacionesPage /> },
          { path: 'tasaciones/nueva', element: <NuevaTasacionPage /> },
          { path: 'tasaciones/:id', element: <TasacionPage /> },
          { path: 'ventas', element: <VentasPage /> },
          { path: 'ventas/nueva', element: <NuevaVentaPage /> },
          { path: 'ventas/:id', element: <VentaPage /> },
          {
            element: <RequiereRol admin />,
            children: [
              { path: 'gastos', element: <GastosPage /> },
              { path: 'gastos/:id', element: <GastoPage /> },
              { path: 'usuarios', element: <UsuariosPage /> },
              { path: 'auditoria', element: <AuditoriaPage /> },
            ],
          },
          {
            element: <RequiereRol general />,
            children: [
              { path: 'sucursales', element: <SucursalesPage /> },
              { path: 'configuracion', element: <ConfiguracionPage /> },
            ],
          },
          { path: '*', element: <NoEncontrada /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
