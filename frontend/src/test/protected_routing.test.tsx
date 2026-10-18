import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { authService } from '../services/authService';

vi.mock('../services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('../services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    checkHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
  },
  onSessionExpired: vi.fn(() => () => {}),
}));

describe('Protected Routing Authentication Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when user is unauthenticated', async () => {
    (authService.getCurrentUser as any).mockRejectedValue(new Error('Unauthorized'));

    render(
      <MemoryRouter initialEntries={['/transactions']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Public Login Screen</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/transactions" element={<div>Protected Transactions Ledger</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Public Login Screen')).toBeInTheDocument();
      expect(screen.queryByText('Protected Transactions Ledger')).not.toBeInTheDocument();
    });
  });

  it('renders protected screen when user has an active authenticated session', async () => {
    (authService.getCurrentUser as any).mockResolvedValue({
      user: {
        id: 'usr_123',
        email: 'user@example.com',
        name: 'Arjun Sen',
        preferences: { currency: 'INR', dateFormat: 'DD/MM/YYYY' },
      },
    });

    render(
      <MemoryRouter initialEntries={['/transactions']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Public Login Screen</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/transactions" element={<div>Protected Transactions Ledger</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Transactions Ledger')).toBeInTheDocument();
      expect(screen.queryByText('Public Login Screen')).not.toBeInTheDocument();
    });
  });
});
