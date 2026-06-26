// src/types/index.ts

// ============================================================
// Backend-aligned types - matches the database schema
// ============================================================

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

// ── Player (matches backend players table) ──────────────────

export interface Player {
  id: string;
  player_id: string;
  team_id: string;
  saved_game_id: string;
  first_name: string;
  last_name: string;
  position: Position;
  age: number;
  height: number;           // in inches
  weight: number;           // in lbs
  overall_rating: number;
  potential_rating: number;
  
  // Traits stored as JSON in backend
  traits: {
    three_point: number;
    mid_range: number;
    inside_scoring: number;
    passing: number;
    ball_handling: number;
    perimeter_defense: number;
    post_defense: number;
    rebounding: number;
    speed: number;
    strength: number;
  };

  games_played?: number;
  points?:       number;   // PPG
  rebounds?:     number;   // RPG
  assists?:      number;   // APG
  steals?:       number;   // SPG
  blocks?:       number;   // BPG
  turnovers?:    number;   // TOPG
  minutes_pg?:   number;   // MPG
  fg_pct?:       number;   // FG %
  fg3_pct?:      number;   // 3P %
  ft_pct?:       number;   // FT %
  
  created_at?: string;
  updated_at?: string;
}

// ── Team (matches backend teams table) ─────────────────────

export interface Team {
  id: string;
  team_id: string;
  saved_game_id: string;
  city: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
  
  // Season stats (from team_season_stats)
  wins?: number;
  losses?: number;
  points_for?: number;
  points_against?: number;
  
  created_at?: string;
  updated_at?: string;
}

// ── Standings (matches backend team_season_stats) ──────────

export interface StandingsRow {
  team_id:        string;
  saved_game_id?: string;
  wins:           number;
  losses:         number;
  win_pct?:       number;
  points_for?:    number;
  points_against?: number;
  home_wins?:     number;
  home_losses?:   number;
  away_wins?:     number;
  away_losses?:   number;
}
 

// ── Saved Game ──────────────────────────────────────────────

export interface SavedGame {
  id: string;
  user_id: string;
  name: string;
  managed_club_id: string;
  current_game_date: string;
  current_season: number;
  game_state: {
    season_id?: string;
    team_archetypes?: Record<string, string>;
    initialized_at?: string;
    last_simulated_week?: number;
    last_simulated_at?: string;
    total_games?: number;
  };
  created_at: string;
  updated_at: string;
}

// ── Game Results ────────────────────────────────────────────

export interface GameResult {
  id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  status: 'scheduled' | 'completed' | 'in_progress';
  played_at: string;
  week: number;
  home_team?: Team;
  away_team?: Team;
  game_date?: string | null; 
}

// ── Player Game Stats (box scores) ─────────────────────────

export interface PlayerGameStats {
  id: string;
  game_id: string;
  player_id: string;
  team_id: string;
  minutes_played: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fga: number;
  fgm: number;
  fga_3: number;
  fgm_3: number;
  fta: number;
  ftm: number;
  player?: Player;
}

// ── Player Season Stats ─────────────────────────────────────

export interface PlayerSeasonStats {
  id: string;
  player_id: string;
  season_id: string;
  saved_game_id: string;
  team_id: string;
  games_played: number;
  total_points: number;
  total_rebounds: number;
  total_assists: number;
  total_steals: number;
  total_blocks: number;
  total_turnovers: number;
  total_fga: number;
  total_fgm: number;
  total_fga_3: number;
  total_fgm_3: number;
  total_fta: number;
  total_ftm: number;
}

// ── Season ──────────────────────────────────────────────────

export interface Season {
  id: string;
  saved_game_id: string;
  season_number: number;
  status: 'regular_season' | 'finished' | 'playoffs';
  start_date: string;
  end_date?: string;
  created_at?: string;
  updated_at?: string;
}

// ── League Leaders ──────────────────────────────────────────

export interface LeagueLeader {
  player: Player;
  stat_value: number;
  stat_type: string;
}

// ── API Response Wrappers ──────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

// ── Extended types for frontend use ────────────────────────

export interface PlayerWithStats extends Player {
  // Computed averages
  ppg: number;
  rpg: number;
  apg: number;
}

export interface TeamWithStats extends Team {
  wins: number;
  losses: number;
  win_pct: number;
  games_behind: number;
  streak?: number;
}