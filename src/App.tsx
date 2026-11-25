import { Navigate, Route, Routes } from 'react-router-dom';
import ApplicationPage from './pages/ApplicationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import ApplicantDetailPage from './pages/manage/ApplicantDetailPage';
import BatchDetailPage from './pages/manage/BatchDetailPage';
import BatchesPage from './pages/manage/BatchesPage';
import ManageLoginPage from './pages/manage/ManageLoginPage';
import CentreDetailPage from './pages/manage/CentreDetailPage';
import CentreFormPage from './pages/manage/CentreFormPage';
import CentresPage from './pages/manage/CentresPage';
import EditFormPage from './pages/manage/EditFormPage';
import ManagePage from './pages/manage/ManagePage';
import DistrictsPage from './pages/manage/masters/DistrictsPage';
import DocumentsMasterPage from './pages/manage/masters/DocumentsMasterPage';
import FormFieldsPage from './pages/manage/masters/FormFieldsPage';
import ListsPage from './pages/manage/masters/ListsPage';
import TechnologiesPage from './pages/manage/masters/TechnologiesPage';
import SettingsPage from './pages/manage/SettingsPage';
import UserFormPage from './pages/manage/UserFormPage';
import UsersPage from './pages/manage/UsersPage';
import RegisterPage from './pages/RegisterPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyPage from './pages/VerifyPage';
import { LangProvider } from './i18n';
import { RequireManage, RequireManageAdmin, RequireStudent, SessionProvider } from './session';

/* edp.sumago.ai: the student portal at /, the tracking panel at /manage. */
export default function App() {
  return (
    <LangProvider>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/application"
            element={
              <RequireStudent>
                <ApplicationPage />
              </RequireStudent>
            }
          />
          <Route path="/manage/login" element={<ManageLoginPage />} />
          <Route
            path="/manage"
            element={
              <RequireManage>
                <ManagePage />
              </RequireManage>
            }
          />
          <Route
            path="/manage/applicants/:id"
            element={
              <RequireManage>
                <ApplicantDetailPage />
              </RequireManage>
            }
          />
          <Route
            path="/manage/applicants/:id/edit"
            element={
              <RequireManageAdmin viewerTo="/manage">
                <EditFormPage />
              </RequireManageAdmin>
            }
          />
          <Route
            path="/manage/batches"
            element={
              <RequireManage>
                <BatchesPage />
              </RequireManage>
            }
          />
          <Route
            path="/manage/batches/:id"
            element={
              <RequireManage>
                <BatchDetailPage />
              </RequireManage>
            }
          />
          <Route path="/manage/masters" element={<Navigate to="/manage/masters/lists" replace />} />
          <Route
            path="/manage/masters/lists/:kind?"
            element={
              <RequireManage>
                <ListsPage />
              </RequireManage>
            }
          />
          <Route
            path="/manage/masters/technologies"
            element={
              <RequireManage>
                <TechnologiesPage />
              </RequireManage>
            }
          />
          <Route
            path="/manage/masters/documents"
            element={
              <RequireManage>
                <DocumentsMasterPage />
              </RequireManage>
            }
          />
          <Route
            path="/manage/masters/fields"
            element={
              <RequireManage>
                <FormFieldsPage />
              </RequireManage>
            }
          />
          <Route
            path="/manage/masters/districts"
            element={
              <RequireManage>
                <DistrictsPage />
              </RequireManage>
            }
          />
          <Route
            path="/manage/centres"
            element={
              <RequireManage>
                <CentresPage />
              </RequireManage>
            }
          />
          <Route
            path="/manage/centres/new"
            element={
              <RequireManageAdmin viewerTo="/manage/centres">
                <CentreFormPage />
              </RequireManageAdmin>
            }
          />
          <Route
            path="/manage/centres/:id"
            element={
              <RequireManage>
                <CentreDetailPage />
              </RequireManage>
            }
          />
          <Route
            path="/manage/centres/:id/edit"
            element={
              <RequireManageAdmin viewerTo="/manage/centres">
                <CentreFormPage />
              </RequireManageAdmin>
            }
          />
          <Route
            path="/manage/users"
            element={
              <RequireManageAdmin viewerTo="/manage">
                <UsersPage />
              </RequireManageAdmin>
            }
          />
          <Route
            path="/manage/users/new"
            element={
              <RequireManageAdmin viewerTo="/manage">
                <UserFormPage />
              </RequireManageAdmin>
            }
          />
          <Route
            path="/manage/settings"
            element={
              <RequireManage>
                <SettingsPage />
              </RequireManage>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </LangProvider>
  );
}
