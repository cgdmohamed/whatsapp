import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Spinner } from '@wa/ui';
import { AppShell } from './components/app-shell';
import { RequireAuth, RequireRole } from './components/guards';
import { ForbiddenPage, NotFoundPage } from './pages/error-pages';

const AuditLogPage = lazy(() => import('./pages/audit-log-page').then((m) => ({ default: m.AuditLogPage })));
const ChangePasswordPage = lazy(() => import('./pages/change-password-page').then((m) => ({ default: m.ChangePasswordPage })));
const CampaignsPage = lazy(() => import('./pages/campaigns-page').then((m) => ({ default: m.CampaignsPage })));
const ContactsPage = lazy(() => import('./pages/contacts-page').then((m) => ({ default: m.ContactsPage })));
const DashboardPage = lazy(() => import('./pages/dashboard-page').then((m) => ({ default: m.DashboardPage })));
const ForgotPasswordPage = lazy(() => import('./pages/forgot-password-page').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/reset-password-page').then((m) => ({ default: m.ResetPasswordPage })));
const EmailSettingsPage = lazy(() => import('./pages/email-settings-page').then((m) => ({ default: m.EmailSettingsPage })));
const HelpPage = lazy(() => import('./pages/help-page').then((m) => ({ default: m.HelpPage })));
const HelpCategoryPage = lazy(() => import('./pages/help-category-page').then((m) => ({ default: m.HelpCategoryPage })));
const HelpArticlePage = lazy(() => import('./pages/help-article-page').then((m) => ({ default: m.HelpArticlePage })));
const HelpAdminPage = lazy(() => import('./pages/help-admin-page').then((m) => ({ default: m.HelpAdminPage })));
const ImportsPage = lazy(() => import('./pages/imports-page').then((m) => ({ default: m.ImportsPage })));
const InboxPage = lazy(() => import('./pages/inbox-page').then((m) => ({ default: m.InboxPage })));
const IntegrationLogsPage = lazy(() => import('./pages/integration-logs-page').then((m) => ({ default: m.IntegrationLogsPage })));
const ListsPage = lazy(() => import('./pages/lists-page').then((m) => ({ default: m.ListsPage })));
const LoginPage = lazy(() => import('./pages/login-page').then((m) => ({ default: m.LoginPage })));
const OperationsPage = lazy(() => import('./pages/operations-page').then((m) => ({ default: m.OperationsPage })));
const ProfilePage = lazy(() => import('./pages/profile-page').then((m) => ({ default: m.ProfilePage })));
const ReportsPage = lazy(() => import('./pages/reports-page').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/settings-page').then((m) => ({ default: m.SettingsPage })));
const TagsPage = lazy(() => import('./pages/tags-page').then((m) => ({ default: m.TagsPage })));
const TemplatesPage = lazy(() => import('./pages/templates-page').then((m) => ({ default: m.TemplatesPage })));
const UsersPage = lazy(() => import('./pages/users-page').then((m) => ({ default: m.UsersPage })));
const WhatsAppPage = lazy(() => import('./pages/whatsapp-page').then((m) => ({ default: m.WhatsAppPage })));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
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
            path="reports"
            element={
              <RequireRole roles={['ADMIN', 'MANAGER']}>
                <ReportsPage />
              </RequireRole>
            }
          />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="help/:categorySlug/:articleSlug" element={<HelpArticlePage />} />
          <Route path="help/:categorySlug" element={<HelpCategoryPage />} />
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
            path="settings/help-center"
            element={
              <RequireRole roles={['ADMIN']}>
                <HelpAdminPage />
              </RequireRole>
            }
          />
          <Route
            path="settings/email"
            element={
              <RequireRole roles={['ADMIN']}>
                <EmailSettingsPage />
              </RequireRole>
            }
          />
          <Route
            path="audit-log"
            element={
              <RequireRole roles={['ADMIN']}>
                <AuditLogPage />
              </RequireRole>
            }
          />
          <Route
            path="operations"
            element={
              <RequireRole roles={['ADMIN']}>
                <OperationsPage />
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
    </Suspense>
  );
}
