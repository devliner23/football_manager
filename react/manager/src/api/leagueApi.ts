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
  // initializeLeague, getLeagueLeaders, getPlayerStats... as needed
};