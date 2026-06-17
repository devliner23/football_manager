import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { 
  AuthResponse, 
  LoginCredentials, 
  RegisterData, 
  SavedGame, 
  User,
  GameLog,
  TeamStats,
  ApiResponse
} from '../types';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Add token to requests if it exists
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API calls
export const authAPI = {
  register: (data: any) => {
    console.log('📝 Registering user:', data.email);
    return api.post('/api/auth/register', data);
  },
  login: (data: any) => {
    console.log('🔐 Logging in user:', data.email);
    return api.post('/api/auth/login', data);
  },
  logout: () => {
    console.log('🚪 Logging out user');
    return api.post('/api/auth/logout');
  },
  verify: () => {
    console.log('✅ Verifying token');
    return api.get('/api/auth/verify');
  },
};

// User API calls
export const userAPI = {
  getProfile: () => {
    console.log('👤 Getting user profile');
    return api.get('/api/users/profile');
  },
  updateProfile: (data: any) => {
    console.log('📝 Updating user profile');
    return api.put('/api/users/profile', data);
  },
  getSavedGames: () => {
    console.log('🎮 Getting saved games');
    return api.get('/api/users/saved-games');
  },
};

// Game API calls
export const gameAPI = {
  createGame: (data: any) => {
    console.log('🏀 Creating new game');
    return api.post('/api/games', data);
  },
  getGame: (id: string) => {
    console.log('🏀 Getting game:', id);
    return api.get(`/api/games/${id}`);
  },
  updateGame: (id: string, data: any) => {
    console.log('🏀 Updating game:', id);
    return api.put(`/api/games/${id}`, data);
  },
  deleteGame: (id: string) => {
    console.log('🗑️ Deleting game:', id);
    return api.delete(`/api/games/${id}`);
  },
};
// Team API calls
export const teamAPI = {
  getTeamStats: (savedGameId: string, teamId: string): Promise<AxiosResponse<ApiResponse<TeamStats>>> => 
    api.get(`/api/teams/${savedGameId}/${teamId}/stats`),
  
  getTeamGames: (savedGameId: string, teamId: string, params?: { 
    limit?: number 
  }): Promise<AxiosResponse<ApiResponse<GameLog[]>>> => 
    api.get(`/api/teams/${savedGameId}/${teamId}/games`, { params }),
};

export default api;