// api/leagueApi.ts
import api from "./client";

export interface Team {
  id: string;
  saved_game_id: string;
  team_id: string;
  city: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
  wins?: number;
  losses?: number;
}

export interface Player {
  id: string;
  saved_game_id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  position: string;
  age: number;
  height: number;
  weight: number;
  overall_rating: number;
  potential_rating: number;
  traits?: Record<string, number>;
  points?: number;
  rebounds?: number;
  assists?: number;
}

export interface StandingsRow {
  team_id: string;
  season: number;
  wins: number;
  losses: number;
}

export interface GameResult {
  id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  status: 'scheduled' | 'final' | 'in_progress';
  played_at: string;
  week: number;
  home_team?: Team;
  away_team?: Team;
}

export const leagueAPI = {
  getTeams: (savedGameId: string) =>
    api.get<{ success: boolean; data: Team[] }>(`/api/league/${savedGameId}/teams`),

  getPlayers: (savedGameId: string) =>
    api.get<{ success: boolean; data: Player[] }>(`/api/league/${savedGameId}/players`),

  getStandings: (savedGameId: string) =>
    api.get<{ success: boolean; data: StandingsRow[] }>(`/api/league/${savedGameId}/standings`),

  simulateSeason: (savedGameId: string) =>
    api.post<{ success: boolean; data: any }>(`/api/league/${savedGameId}/simulate-season`),

  tradePlayer: (savedGameId: string, playerId: string, newTeamId: string) =>
    api.post<{ success: boolean; data: Player }>(`/api/league/${savedGameId}/trade`, {
      playerId,
      newTeamId,
    }),

  initializeLeague: (savedGameId: string, season: number = 1) =>
    api.post<{ success: boolean; data: any }>(`/api/league/${savedGameId}/initialize`, { season }),

  simulateWeek: (savedGameId: string) =>
    api.post(`/api/league/${savedGameId}/simulate-week`),

  getGames: (savedGameId: string, limit?: number) => 
  api.get(`/league/${savedGameId}/games${limit ? `?limit=${limit}` : ''}`),

  getRecentGames: (savedGameId: string, limit: number = 10) =>
    api.get(`/league/${savedGameId}/games/recent?limit=${limit}`),

  getGameDetails: (gameId: string) =>
    api.get(`/league/games/${gameId}`),
};