import { Navigate, Route, Routes } from 'react-router-dom';
import ApplicationPage from './pages/ApplicationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import ManageLoginPage from './pages/manage/ManageLoginPage';
import ManagePage from './pages/manage/ManagePage';
import RegisterPage from './pages/RegisterPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyPage from './pages/VerifyPage';
import { LangProvider } from './i18n';
import { RequireManage, RequireStudent, SessionProvider } from './session';

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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </LangProvider>
  );
}
