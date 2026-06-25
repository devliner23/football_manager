// src/api/leagueApi.ts
import axios from 'axios';
import { 
  Team, 
  Player, 
  StandingsRow, 
  SavedGame, 
  GameResult, 
  PlayerGameStats,
  ApiResponse 
} from '../shared';
import api from './client';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

export interface UserGameInfo {
  id: string;
  game_date: string; // "2026-06-24 14:20:38.475+00"
  week: number;
  isHome: boolean;
  home_team_id: string;
  away_team_id: string;
  home_team: { id: string; name: string; abbreviation: string; city: string };
  away_team: { id: string; name: string; abbreviation: string; city: string };
}
 
export interface NextUserGameResponse {
  seasonComplete: boolean;
  leagueGamesBeforeCount: number; // games that will auto-sim before the user's game
  nextUserGame: UserGameInfo | null;
}
 
export interface SimulateToNextGameResponse {
  seasonComplete: boolean;
  gamesSimulated: number;
  results: Array<{
    gameId: string;
    game_date: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    overtime: boolean;
  }>;
  nextUserGame: UserGameInfo | null;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Helper to extract data from ApiResponse
function extractData<T>(response: { data: ApiResponse<T> }): T {
  if (!response.data.success) {
    throw new Error(response.data.error || 'API request failed');
  }
  return response.data.data;
}

export const leagueAPI = {
  // ── Teams ──────────────────────────────────────────────────
  getTeams: async (savedGameId: string) => {
    const response = await api.get<ApiResponse<Team[]>>(`/api/league/${savedGameId}/teams`);
    return extractData(response);
  },

  // ── Players ────────────────────────────────────────────────
  getPlayers: async (savedGameId: string) => {
    const response = await api.get<ApiResponse<Player[]>>(`/api/league/${savedGameId}/players`);
    return extractData(response);
  },

  // ── Standings ──────────────────────────────────────────────
  getStandings: async (savedGameId: string) => {
    const response = await api.get<ApiResponse<StandingsRow[]>>(`/api/league/${savedGameId}/standings`);
    return extractData(response);
  },

  // ── Games ──────────────────────────────────────────────────
  getGames: async (savedGameId: string, limit?: number) => {
    const response = await api.get<ApiResponse<GameResult[]>>(
      `/api/league/${savedGameId}/games${limit ? `?limit=${limit}` : ''}`
    );
    return extractData(response);
  },

  getRecentGames: async (savedGameId: string, limit: number = 10) => {
    const response = await api.get<ApiResponse<GameResult[]>>(
      `/api/league/${savedGameId}/games/recent?limit=${limit}`
    );
    return extractData(response);
  },

  getGameDetails: async (gameId: string) => {
    const response = await api.get<ApiResponse<GameResult & { boxScores: PlayerGameStats[] }>>(
      `/api/league/games/${gameId}`
    );
    return extractData(response);
  },

  // ── Simulation ─────────────────────────────────────────────
  simulateWeek: async (savedGameId: string) => {
    const response = await api.post<ApiResponse<{ 
      seasonComplete: boolean; 
      week?: number; 
      games?: GameResult[] 
    }>>(`/api/league/${savedGameId}/simulate-week`);
    return extractData(response);
  },

  simulateSeason: async (savedGameId: string) => {
    const response = await api.post<ApiResponse<{ message: string }>>(`/api/league/${savedGameId}/simulate-season`);
    return extractData(response);
  },

  // ── League Management ──────────────────────────────────────
  initializeLeague: async (
    savedGameId: string, 
    options: { season?: number; managedClub: string }
  ) => {
    const { season = 1, managedClub } = options;

    const response = await api.post<ApiResponse<{ 
      season: number;
      teamsCreated: number;
      playersCreated: number;
      gamesCreated: number;
    }>>(`/api/league/${savedGameId}/initialize`, {
      season,
      managedClubName: managedClub   // ← Correct payload key
    });

    return extractData(response);
  },

  // ── Trades ──────────────────────────────────────────────────
  tradePlayer: async (savedGameId: string, data: { playerId: string; newTeamId: string }) => {
    const response = await api.post<ApiResponse<Player>>(`/api/league/${savedGameId}/trade`, data);
    return extractData(response);
  },

  // ── League Leaders ─────────────────────────────────────────
  getLeagueLeaders: async (savedGameId: string, stat: string) => {
    const response = await api.get<ApiResponse<Player[]>>(`/api/league/${savedGameId}/leaders/${stat}`);
    return extractData(response);
  },

  // src/api/leagueApi.ts
  getSchedule: async (savedGameId: string) => {
    const response = await api.get<ApiResponse<Record<number, GameResult[]>>>(`/api/league/${savedGameId}/schedule`);
    return extractData(response);
  },

  getNextUserGame: async (savedGameId: string): Promise<NextUserGameResponse> => {
    const response = await api.get<ApiResponse<NextUserGameResponse>>(
      `/api/league/${savedGameId}/next-user-game`
    );
    return extractData(response);
  },
 
  simulateToNextGame: async (savedGameId: string): Promise<SimulateToNextGameResponse> => {
    const response = await api.post<ApiResponse<SimulateToNextGameResponse>>(
      `/api/league/${savedGameId}/simulate-to-next-game`
    );
    return extractData(response);
  },

  simulateToDate: async (savedGameId: string, targetDate: string) => {
    const { data } = await api.post(`/api/league/${savedGameId}/simulate-to-date`, { targetDate });
    return data.data; // { seasonComplete, gamesSimulated, results }
  },
};

export type { Team, Player, StandingsRow, SavedGame, GameResult, PlayerGameStats };