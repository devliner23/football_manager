import api from './client';

export interface Team {
  id: string;
  team_id: string;
  name: string;
  city: string;
  abbreviation: string;
  conference: string;
  division: string;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
}

export interface Player {
  id: string;
  player_id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  position: string;
  overall_rating: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  // ... other stats
}

export interface LeagueData {
  teams: Team[];
  players: Player[];
  standings: any[];
  season: number;
}

export const leagueAPI = {
  // Initialize a new league season
  initializeLeague: (savedGameId: string, season: number = 1) =>
    api.post(`/api/league/${savedGameId}/initialize`, { season }),

  // Get full league data
  getLeagueData: (savedGameId: string, season: number = 1) =>
    api.get<{ success: boolean; data: LeagueData }>(
      `/api/league/${savedGameId}/data?season=${season}`
    ),

  // Get team roster
  getTeamRoster: (savedGameId: string, teamId: string, season: number = 1) =>
    api.get(`/api/league/${savedGameId}/roster/${teamId}?season=${season}`),

  // Get player stats
  getPlayerStats: (savedGameId: string, playerId: string, season: number = 1) =>
    api.get(`/api/league/${savedGameId}/player/${playerId}?season=${season}`),

  // Simulate season
  simulateSeason: (savedGameId: string) =>
    api.post(`/api/league/${savedGameId}/simulate-season`),

  // Get standings
  getStandings: (savedGameId: string) =>
    api.get(`/api/league/${savedGameId}/standings`),
};