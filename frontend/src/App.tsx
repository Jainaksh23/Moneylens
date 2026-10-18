import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ImportPage } from './pages/ImportPage';
import { ForecastPage } from './pages/ForecastPage';
import { GoalsPage } from './pages/GoalsPage';
import { AnomaliesPage } from './pages/AnomaliesPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { ChatPage } from './pages/ChatPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              {/* Public Authentication Routes */}
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />

              {/* Protected Core Application Routes (Require Session Cookie) */}
              <Route element={<ProtectedRoute />}>
                <Route index element={<DashboardPage />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route path="import" element={<ImportPage />} />
                <Route path="forecast" element={<ForecastPage />} />
                <Route path="goals" element={<GoalsPage />} />
                <Route path="anomalies" element={<AnomaliesPage />} />
                <Route path="recommendations" element={<RecommendationsPage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="onboarding" element={<OnboardingPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
