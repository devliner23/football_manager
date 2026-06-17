// User types
export interface User {
  id: string;
  email: string;
  username: string;
  avatar_url?: string;
  preferred_team_id?: string;
  created_at: string;
  updated_at: string;
}

// Game types
export interface SavedGame {
  id: string;
  user_id: string;
  name: string;
  game_state: GameState;
  current_season: number;
  current_game_date: string;
  managed_club_id: string;
  difficulty: 'rookie' | 'pro' | 'all_star' | 'hall_of_fame';
  is_auto_save: boolean;
  created_at: string;
  updated_at: string;
  last_played: string;
}

export interface GameState {
  season: number;
  clubs: Club[];
  players: Player[];
  standings: Standings;
  settings: GameSettings;
  simulations?: Simulation[];
}

export interface Club {
  id: string;
  name: string;
  city: string;
  arena: string;
  players: string[]; // Player IDs
  stats: TeamStats;
  rating: number;
}

export interface Player {
  id: string;
  name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  stats: PlayerStats;
  contract: Contract;
}

export interface PlayerStats {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  games_played: number;
}

export interface TeamStats {
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
}

export interface Contract {
  years: number;
  salary: number;
  team_id: string;
}

export interface Standings {
  [teamId: string]: {
    wins: number;
    losses: number;
    points_for: number;
    points_against: number;
    streak: number;
  };
}

export interface GameSettings {
  difficulty: string;
  quarters: number;
  quarter_length: number;
}

export interface Simulation {
  game_log_id: string;
  timestamp: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  competition: string;
}

// Game Log types
export interface GameLog {
  id: string;
  saved_game_id: string;
  game_result: GameResult;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  game_date: string;
  competition: string;
  is_playoff: boolean;
  playoff_round?: number;
  simulated_at: string;
}

export interface GameResult {
  home_score: number;
  away_score: number;
  winner: string;
  home_stats: TeamGameStats;
  away_stats: TeamGameStats;
}

export interface TeamGameStats {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
}

// League History types
export interface LeagueHistory {
  id: string;
  saved_game_id: string;
  season: number;
  champion_id: string;
  champion_name: string;
  mvp_id?: string;
  mvp_name?: string;
  scoring_leader_id?: string;
  scoring_leader_name?: string;
  assists_leader_id?: string;
  assists_leader_name?: string;
  rebounds_leader_id?: string;
  rebounds_leader_name?: string;
  rookie_of_year_id?: string;
  rookie_of_year_name?: string;
  season_data: SeasonData;
  created_at: string;
}

export interface SeasonData {
  initial?: boolean;
  created_at?: string;
  champion?: string;
  standings?: Standings;
  awards?: Awards;
}

export interface Awards {
  mvp: string;
  rookie_of_year: string;
  scoring_leader: string;
  assists_leader: string;
  rebounds_leader: string;
  defensive_player: string;
  sixth_man: string;
  most_improved: string;
}

// Auth types
export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: User;
  token?: string;
  error?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  username: string;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  count?: number;
}

// Component Props types
export interface AuthProps {
  onSwitchToRegister?: () => void;
  onSwitchToLogin?: () => void;
}

export interface GameCardProps {
  game: SavedGame;
  onSelect: (game: SavedGame) => void;
  onDelete: (id: string) => void;
  isSelected: boolean;
}

export interface NewGameFormProps {
  onClose: () => void;
  onGameCreated: (game: SavedGame) => void;
}