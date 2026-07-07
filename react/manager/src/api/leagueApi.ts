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

export interface LineupData {
  teamId: string;
  savedGameId: string;
  starters: string[];
  rotation: string[];
  minutesTargets: Record<string, number>;
  isAuto: boolean;
  persisted: boolean;
}
 
export interface SetLineupPayload {
  starters: string[];
  rotation?: string[];
  minutesTargets?: Record<string, number>;
}

export interface TeamFinanceSummary {
  id: string;
  name: string;
  city: string;
  abbreviation: string;
  totalPayroll: number;
  salaryCapSpace: number;
  capHitPercent: string;
  luxuryTaxThreshold: number;
  playersUnderContract: number;
  topEarner: {
    playerName: string;
    overall: number;
    salary: number;
  } | null;
}

export interface TeamFinanceDetail {
  team: {
    id: string;
    name: string;
    city: string;
    abbreviation: string;
    conference: string;
    division: string;
  };
  finances: {
    totalPayroll: number;
    salaryCap: number;
    capSpace: number;
    luxuryTaxSpace: number;
    numberOfContracts: number;
    highestPaidPlayer: {
      playerId: string;
      name: string;
      position: string;
      overall: number;
      age: number;
      salary: number;
      yearsRemaining: number;
    } | null;
    expiringContracts: Array<{
      playerId: string;
      name: string;
      position: string;
      overall: number;
      salary: number;
      yearsRemaining: number;
    }>;
  };
  contracts: Array<{
    contractId: string;
    playerId: string;
    playerName: string;
    position: string;
    overall: number;
    age: number;
    salary: number;
    yearsRemaining: number;
    totalYears: number;
  }>;
}

export interface LeagueFinanceSummary {
  totalTeams: number;
  totalLeaguePayroll: number;
  averageTeamPayroll: number;
  highestPayrollTeam: {
    id: string;
    name: string;
    payroll: number;
  } | null;
  lowestPayrollTeam: {
    id: string;
    name: string;
    payroll: number;
  } | null;
  totalPlayersUnderContract: number;
  averagePlayerSalary: number;
  top5HighestPaid: Array<{
    playerName: string;
    overall: number;
    team: string;
    salary: number;
  }>;
}

export interface CoachAttributes {
  offense_rating: number;
  defense_rating: number;
  player_development: number;
  motivation: number;
  discipline: number;
  adaptability: number;
  rotation_iq: number;
  clutch_factor: number;
}

export interface Coach {
  id: string;
  saved_game_id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  age: number;
  overall_rating: number;
  preferred_archetype: string;
  attributes: CoachAttributes;
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
    options: { season?: number; managedClub: string, userArchetype: string }
  ) => {
    const { season = 1, managedClub, userArchetype } = options;

    const response = await api.post<ApiResponse<{ 
      season: number;
      teamsCreated: number;
      playersCreated: number;
      gamesCreated: number;
    }>>(`/api/league/${savedGameId}/initialize`, {
      season,
      managedClubName: managedClub, 
      userArchetype: userArchetype
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

  // Add these three methods to the leagueAPI object in leagueApi.ts
// (alongside getTeams, getPlayers, tradePlayer, etc.)

  getFreeAgents: async (
    savedGameId: string,
    params: { position?: string; minOverall?: number; limit?: number; offset?: number } = {}
  ) => {
    const query = new URLSearchParams();
    if (params.position)   query.set('position',   params.position);
    if (params.minOverall) query.set('minOverall',  String(params.minOverall));
    if (params.limit)      query.set('limit',       String(params.limit));
    if (params.offset)     query.set('offset',      String(params.offset));

    const qs = query.toString();
    const response = await api.get<ApiResponse<Player[]>>(
      `/api/league/${savedGameId}/free-agents${qs ? `?${qs}` : ''}`
    );
    return extractData(response);
  },

  signFreeAgent: async (
    savedGameId: string,
    data: { playerId: string; teamId: string }
  ) => {
    const response = await api.post<ApiResponse<Player>>(
      `/api/league/${savedGameId}/free-agents/sign`,
      data
    );
    return extractData(response);
  },

  releasePlayer: async (savedGameId: string, playerId: string) => {
    const response = await api.post<ApiResponse<Player>>(
      `/api/league/${savedGameId}/players/${playerId}/release`
    );
    return extractData(response);
  },

    getLineup: async (savedGameId: string, teamId: string): Promise<LineupData> => {
    const response = await api.get<ApiResponse<LineupData>>(
      `/api/lineup/${savedGameId}/${teamId}`
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch lineup');
    }
    return response.data.data;
  },

  setLineup: async (
    savedGameId: string,
    teamId: string,
    payload: SetLineupPayload
  ): Promise<LineupData> => {
    const response = await api.put<ApiResponse<LineupData>>(
      `/api/lineup/${savedGameId}/${teamId}`,
      payload
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to save lineup');
    }
    return response.data.data;
  },

  resetLineup: async (savedGameId: string, teamId: string): Promise<LineupData> => {
    const response = await api.post<ApiResponse<LineupData>>(
      `/api/lineup/${savedGameId}/${teamId}/auto`
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to reset lineup');
    }
    return response.data.data;
  },

  getTeamFinances: async (savedGameId: string) => {
    const response = await api.get<ApiResponse<TeamFinanceSummary[]>>(
      `/api/league/${savedGameId}/finance/teams`
    );
    return extractData(response);
  },

  getTeamFinanceDetail: async (savedGameId: string, teamId: string) => {
    const response = await api.get<ApiResponse<TeamFinanceDetail>>(
      `/api/league/${savedGameId}/finance/teams/${teamId}`
    );
    return extractData(response);
  },

  getLeagueFinanceSummary: async (savedGameId: string) => {
    const response = await api.get<ApiResponse<LeagueFinanceSummary>>(
      `/api/league/${savedGameId}/finance/league-summary`
    );
    return extractData(response);
  },

  getCoach: async (savedGameId: string, teamId: string): Promise<Coach | null> => {
    const res = await api.get(`/api/league/${savedGameId}/coach/${teamId}`);
    return res.data.data ?? null;
  },
  
};

export type { Team, Player, StandingsRow, SavedGame, GameResult, PlayerGameStats };