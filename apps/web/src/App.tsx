import { createHashRouter, createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import type { Repository } from './data/repository';
import { RepoProvider } from './lib/repo';
import { ToastProvider } from './components/ui';
import { PublicLayout, RequireRole, NotFound } from './components/layout';
import { ProviderLayout } from './components/ProviderLayout';
import { Home } from './pages/public/Home';
import { SearchPage } from './pages/public/Search';
import { ProviderPage } from './pages/public/ProviderPage';
import { BookingWizard } from './pages/public/BookingWizard';
import { LoginPage } from './pages/public/Login';
import { Onboarding } from './pages/public/Onboarding';
import { LegalPage } from './pages/public/Legal';
import { ClubePage, ClubeSaldo } from './pages/public/Clube';
import { TutorLayout, MyBookings, BookingDetail, MyPets, Favorites, MyPackages } from './pages/tutor/Tutor';
import { Dashboard } from './pages/provider/Dashboard';
import { Agenda } from './pages/provider/Agenda';
import { WhatsAppCRM } from './pages/provider/WhatsAppCRM';
import { ServicesPage, PackagesPage } from './pages/provider/Catalog';
import { CustomersPage } from './pages/provider/Customers';
import { ReviewsPage } from './pages/provider/Reviews';
import { ProfileSettings, WhatsAppSettings } from './pages/provider/Settings';

const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'buscar', element: <SearchPage /> },
      { path: 'p/:slug', element: <ProviderPage /> },
      { path: 'agendar/:slug', element: <BookingWizard /> },
      { path: 'entrar', element: <LoginPage /> },
      { path: 'anunciar', element: <Onboarding /> },
      { path: 'privacidade', element: <LegalPage kind="privacidade" /> },
      { path: 'termos', element: <LegalPage kind="termos" /> },
      { path: 'clube', element: <ClubePage /> },
      {
        path: 'conta', element: <RequireRole role="tutor"><TutorLayout /></RequireRole>,
        children: [
          { index: true, element: <MyBookings /> },
          { path: 'agendamento/:id', element: <BookingDetail /> },
          { path: 'pets', element: <MyPets /> },
          { path: 'favoritos', element: <Favorites /> },
          { path: 'pacotes', element: <MyPackages /> },
          { path: 'clube', element: <ClubeSaldo /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: 'painel', element: <RequireRole role="prestador"><ProviderLayout /></RequireRole>,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'agenda', element: <Agenda /> },
      { path: 'whatsapp', element: <WhatsAppCRM /> },
      { path: 'servicos', element: <ServicesPage /> },
      { path: 'pacotes', element: <PackagesPage /> },
      { path: 'clientes', element: <CustomersPage /> },
      { path: 'avaliacoes', element: <ReviewsPage /> },
      { path: 'perfil', element: <ProfileSettings /> },
      { path: 'config', element: <WhatsAppSettings /> },
    ],
  },
];

// Link de demonstração hospedado (build "single") roda dentro de um quadro: rotas em memória.
const router = import.meta.env.MODE === 'single' ? createMemoryRouter(routes) : createHashRouter(routes);

export function App({ repo }: { repo: Repository }) {
  return (
    <RepoProvider repo={repo}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </RepoProvider>
  );
}
