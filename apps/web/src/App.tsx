import { Navigate, Route, Routes } from 'react-router-dom';
import { PERMISSIONS } from '@vendoros/shared';
import { AppLayout } from './layout/AppLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { RequirePermission } from './routes/RequirePermission';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { AcceptInvitationPage } from './features/auth/AcceptInvitationPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ClientsListPage } from './features/clients/ClientsListPage';
import { ProjectsListPage } from './features/projects/ProjectsListPage';
import { UsersListPage } from './features/users/UsersListPage';
import { AuditLogPage } from './features/audit/AuditLogPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { SettingsPage } from './features/settings/SettingsPage';

export function App() {
  return (
    <Routes>
      {/* Signed out. The token-bearing routes are reachable from an email in
          whichever browser the mailbox happens to be open in. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* Every signed-in user, whatever their role. */}
          <Route path="/" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          {/* Permission-gated. The same permission is enforced by the API;
              this only keeps the user from landing on a page that would 403. */}
          <Route element={<RequirePermission anyOf={[PERMISSIONS.CLIENTS_READ]} />}>
            <Route path="/clients" element={<ClientsListPage />} />
          </Route>
          <Route element={<RequirePermission anyOf={[PERMISSIONS.PROJECTS_READ]} />}>
            <Route path="/projects" element={<ProjectsListPage />} />
          </Route>
          <Route element={<RequirePermission anyOf={[PERMISSIONS.USERS_READ]} />}>
            <Route path="/users" element={<UsersListPage />} />
          </Route>
          <Route element={<RequirePermission anyOf={[PERMISSIONS.AUDIT_READ]} />}>
            <Route path="/audit-logs" element={<AuditLogPage />} />
          </Route>
          <Route element={<RequirePermission anyOf={[PERMISSIONS.TENANT_UPDATE]} />}>
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
