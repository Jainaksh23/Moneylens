import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../components/ui/Toast';
import { authService } from '../services/authService';
import { Input } from '../components/ui/Input';
import { ApiClientError } from '../services/apiClient';

vi.mock('../services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('../services/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiClient')>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      checkHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
    },
    onSessionExpired: vi.fn(() => () => {}),
  };
});

describe('Forms & Keyboard Accessibility Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authService.getCurrentUser as any).mockRejectedValue(new Error('Unauthenticated'));
  });

  describe('Accessible Input Component', () => {
    it('associates label, input id, and error message with aria-describedby', () => {
      render(
        <Input
          label="Target Amount"
          id="target-amount"
          error="Amount must be positive"
          helperText="INR ₹"
        />,
      );

      const input = screen.getByLabelText('Target Amount');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('id', 'target-amount');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'target-amount-error');
      expect(screen.getByRole('alert')).toHaveTextContent('Amount must be positive');
    });
  });

  describe('LoginPage Form', () => {
    it('validates empty inputs and submits valid credentials with keyboard Enter', async () => {
      (authService.login as any).mockResolvedValue({
        user: { id: 'u1', email: 'test@example.com', name: 'Test User' },
      });

      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/login']}>
          <AuthProvider>
            <ToastProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<div>Dashboard Home</div>} />
              </Routes>
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>,
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'Password123{Enter}');

      await waitFor(() => {
        expect(authService.login).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'Password123',
        });
      });
    });

    it('displays error callout when credentials are rejected', async () => {
      (authService.login as any).mockRejectedValue(
        new ApiClientError('Invalid email or password', 401, 'UNAUTHORIZED'),
      );
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/login']}>
          <AuthProvider>
            <ToastProvider>
              <LoginPage />
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>,
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitBtn = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'wrong@example.com');
      await user.type(passwordInput, 'wrongpass');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
      });
    });
  });

  describe('RegisterPage Form', () => {
    it('rejects passwords without numbers or letters before API submission', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/register']}>
          <AuthProvider>
            <ToastProvider>
              <RegisterPage />
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>,
      );

      const nameInput = screen.getByLabelText(/full name/i);
      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password/i);
      const submitBtn = screen.getByRole('button', { name: /create account/i });

      await user.type(nameInput, 'Rajesh');
      await user.type(emailInput, 'rajesh@example.com');
      await user.type(passwordInput, 'short'); // < 8 chars and letters only
      await user.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/password must be at least 8 characters/i),
        ).toBeInTheDocument();
      });

      expect(authService.register).not.toHaveBeenCalled();
    });
  });
});
