import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { authAPI } from '../api/client';

interface User {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  preferred_team_id?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  register: (data: { 
    email: string; 
    password: string; 
    username: string;
    full_name?: string;
  }) => Promise<{ success: boolean; user?: User; error?: string }>;
  login: (credentials: { email: string; password: string }) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        verifyToken();
      } catch (err) {
        console.error('Error restoring session:', err);
        logout();
      }
    }
    setLoading(false);
  }, []);

  const verifyToken = async (): Promise<void> => {
    try {
      const response = await authAPI.verify();
      if (response.data.success && response.data.user) {
        setUser(response.data.user);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
    } catch (err) {
      console.error('Token verification failed:', err);
      logout();
    }
  };

  const register = async (data: { 
    email: string; 
    password: string; 
    username: string;
    full_name?: string;
  }) => {
    try {
      setError(null);
      console.log('📝 Registering with data:', { ...data, password: '***' });
      
      const response = await authAPI.register(data);
      console.log('✅ Registration response:', response.data);
      
      if (response.data.success && response.data.user && response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        return { success: true, user: response.data.user };
      }
      return { success: false, error: 'Registration failed - no user data' };
    } catch (err: any) {
      console.error('❌ Registration error:', err);
      let errorMessage = 'Registration failed';
      
      if (err.response?.data) {
        if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        } else if (err.response.data.error) {
          errorMessage = err.response.data.error;
        } else if (err.response.data.message) {
          errorMessage = err.response.data.message;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const login = async (credentials: { email: string; password: string }) => {
    try {
      setError(null);
      console.log('🔐 Logging in:', credentials.email);
      
      const response = await authAPI.login(credentials);
      console.log('✅ Login response:', response.data);
      
      if (response.data.success && response.data.user && response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        return { success: true, user: response.data.user };
      }
      return { success: false, error: 'Login failed' };
    } catch (err: any) {
      console.error('❌ Login error:', err);
      let errorMessage = 'Login failed';
      
      if (err.response?.data) {
        if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        } else if (err.response.data.error) {
          errorMessage = err.response.data.error;
        } else if (err.response.data.message) {
          errorMessage = err.response.data.message;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await authAPI.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      setUser(null);
    }
  };

  const updateUser = (updatedUser: User): void => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const value: AuthContextType = {
    user,
    loading,
    error,
    register,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};