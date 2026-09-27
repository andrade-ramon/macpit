import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { useHealth } from './hooks/useHealth';
import { ApiError } from './lib/api';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/placeholders';
import { PortsPage } from './pages/PortsPage';
import { ProcessesPage } from './pages/ProcessesPage';
import { ServerDownPage } from './pages/ServerDownPage';
import { SettingsPage } from './pages/SettingsPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';

// Carregadas sob demanda (menos código na primeira abertura). O xterm.js é carregado pelo terminal do rodapé.
const DiskPage = lazy(() => import('./pages/DiskPage'));
const ActionsPage = lazy(() => import('./pages/ActionsPage'));
const ReposPage = lazy(() => import('./pages/ReposPage'));

const Lazy = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<p className="p-6 text-text3">Carregando…</p>}>{children}</Suspense>
);

export function App() {
  const { data, error, isPending, refetch, isFetching } = useHealth();

  if (error instanceof ApiError && error.status === 401) return <UnauthorizedPage />;
  if (isPending) return <div className="p-6 text-text3">Carregando…</div>;
  // Sem nenhuma resposta ainda nesta sessão. (Se cair depois, o layout mostra a faixa "sem conexão".)
  if (error && !data) {
    return <ServerDownPage message={error.message} onRetry={() => void refetch()} retrying={isFetching} />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="processes" element={<ProcessesPage />} />
        <Route path="ports" element={<PortsPage />} />
        <Route
          path="disk"
          element={
            <Lazy>
              <DiskPage />
            </Lazy>
          }
        />
        <Route
          path="actions"
          element={
            <Lazy>
              <ActionsPage />
            </Lazy>
          }
        />
        <Route
          path="repos"
          element={
            <Lazy>
              <ReposPage />
            </Lazy>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
