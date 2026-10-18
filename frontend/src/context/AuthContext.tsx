import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import type { ReactNode } from 'react';
import { authService } from '../services/authService';
import type { RegisterPayload, LoginPayload } from '../services/authService';
import { onSessionExpired } from '../services/apiClient';
import type { UserProfile } from '../services/apiClient';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  dismissSessionExpired: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  // Initialize and check current active session via httpOnly cookie
  const refreshUser = useCallback(async () => {
    try {
      const response = await authService.getCurrentUser();
      setUser(response.user);
      setSessionExpired(false);
    } catch {
      // 401 or network error on initial load: not authenticated
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();

    // Listen to session expired signals from apiClient
    const unsubscribe = onSessionExpired(() => {
      setUser(null);
      setSessionExpired(true);
    });

    return () => {
      unsubscribe();
    };
  }, [refreshUser]);

  const login = async (payload: LoginPayload): Promise<void> => {
    const response = await authService.login(payload);
    setUser(response.user);
    setSessionExpired(false);
  };

  const register = async (payload: RegisterPayload): Promise<void> => {
    const response = await authService.register(payload);
    setUser(response.user);
    setSessionExpired(false);
  };

  const logout = async (): Promise<void> => {
    try {
      await authService.logout();
    } catch {
      // Clear local state even if logout request fails
    } finally {
      setUser(null);
      setSessionExpired(false);
    }
  };

  const dismissSessionExpired = () => {
    setSessionExpired(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        sessionExpired,
        login,
        register,
        logout,
        dismissSessionExpired,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
