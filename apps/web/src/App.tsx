import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/app-shell';
import { RequireAuth, RequireRole } from './components/guards';
import { ChangePasswordPage } from './pages/change-password-page';
import { CampaignsPage } from './pages/campaigns-page';
import { ContactsPage } from './pages/contacts-page';
import { DashboardPage } from './pages/dashboard-page';
import { ForbiddenPage, NotFoundPage } from './pages/error-pages';
import { ImportsPage } from './pages/imports-page';
import { IntegrationLogsPage } from './pages/integration-logs-page';
import { ListsPage } from './pages/lists-page';
import { LoginPage } from './pages/login-page';
import { PlaceholderPage } from './pages/placeholder-page';
import { ProfilePage } from './pages/profile-page';
import { SettingsPage } from './pages/settings-page';
import { TagsPage } from './pages/tags-page';
import { UsersPage } from './pages/users-page';
import { WhatsAppPage } from './pages/whatsapp-page';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="lists" element={<ListsPage />} />
        <Route
          path="imports"
          element={
            <RequireRole roles={['ADMIN', 'MANAGER']}>
              <ImportsPage />
            </RequireRole>
          }
        />
        <Route
          path="campaigns"
          element={
            <RequireRole roles={['ADMIN', 'MANAGER']}>
              <CampaignsPage />
            </RequireRole>
          }
        />
        <Route
          path="users"
          element={
            <RequireRole roles={['ADMIN', 'MANAGER']}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="settings"
          element={
            <RequireRole roles={['ADMIN']}>
              <SettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="audit-log"
          element={
            <RequireRole roles={['ADMIN']}>
              <PlaceholderPage />
            </RequireRole>
          }
        />
        <Route
          path="whatsapp"
          element={
            <RequireRole roles={['ADMIN']}>
              <WhatsAppPage />
            </RequireRole>
          }
        />
        <Route
          path="integration-logs"
          element={
            <RequireRole roles={['ADMIN']}>
              <IntegrationLogsPage />
            </RequireRole>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="change-password" element={<ChangePasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
