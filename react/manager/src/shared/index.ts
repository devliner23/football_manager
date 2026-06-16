// ============================================================
// @fm/shared — canonical data types for the entire game
// Both engine and client import from here. Never duplicate.
// ============================================================

// ── Player ──────────────────────────────────────────────────

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface PlayerAttributes {
  // Scoring
  threePoint: number;      // 1–100
  midRange: number;        // 1–100
  closeShot: number;       // 1–100
  freeThrow: number;       // 1–100
  layup: number;           // 1–100
  dunk: number;            // 1–100

  // Playmaking
  passing: number;         // 1–100
  ballHandle: number;      // 1–100
  vision: number;          // 1–100

  // Defense
  perimeterDefense: number; // 1–100
  interiorDefense: number;  // 1–100
  steal: number;           // 1–100
  block: number;           // 1–100

  // Athletic
  speed: number;           // 1–100
  agility: number;         // 1–100
  vertical: number;        // 1–100
  strength: number;        // 1–100
  stamina: number;         // 1–100

  // Rebounding
  offensiveRebound: number; // 1–100
  defensiveRebound: number; // 1–100

  // Mental
  composure: number;       // 1–100
  basketballIQ: number;    // 1–100
  leadership: number;      // 1–100
  workEthic: number;       // 1–100 (hidden development)
}

export interface Player {
  id: string;
  name: string;
  age: number;
  nationality: string;
  primaryPosition: Position;
  secondaryPositions: Position[];
  attributes: PlayerAttributes;

  // Hidden / discoverable via scouting
  potential: number;       // 1–100, true ceiling
  potentialKnown: boolean;

  // Form & condition
  morale: number;          // 1–10
  fitness: number;         // 0–100 (100 = fully fit)
  fatigue: number;         // 0–100 (0 = rested, 100 = exhausted)
  injured: boolean;
  injuryType: string | null;     // e.g. "ankle sprain", "ACL tear"
  injuryReturnDate: string | null; // ISO date or null

  // Contract
  weeklyWage: number;      // USD
  contractExpiryDate: string; // ISO date
  marketValue: number;
  yearsInLeague: number;

  // Season stats (reset each season)
  stats: PlayerSeasonStats;
}

export interface PlayerSeasonStats {
  gamesPlayed: number;
  gamesStarted: number;
  minutesPerGame: number;
  
  pointsPerGame: number;
  totalPoints: number;
  
  reboundsPerGame: number;
  totalRebounds: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  
  assistsPerGame: number;
  totalAssists: number;
  
  stealsPerGame: number;
  totalSteals: number;
  
  blocksPerGame: number;
  totalBlocks: number;
  
  turnoversPerGame: number;
  totalTurnovers: number;
  
  fieldGoalPercentage: number;   // 0–100
  threePointPercentage: number;   // 0–100
  freeThrowPercentage: number;    // 0–100
  
  doubleDoubles: number;
  tripleDoubles: number;
  
  playerEfficiencyRating: number; // PER
  plusMinus: number;
}

// ── Club (Team) ────────────────────────────────────────────────────

export type OffensiveSystem = 
  | 'pace_and_space' 
  | 'motion_offense' 
  | 'pick_and_roll' 
  | 'post_centric' 
  | 'isolation'
  | 'triangle'
  | 'seven_seconds_or_less';

export type DefensiveSystem = 
  | 'man_to_man' 
  | 'zone_2_3' 
  | 'zone_3_2' 
  | 'box_and_one' 
  | 'full_court_press'
  | 'switch_everything'
  | 'ice_screens';

export interface Tactics {
  offensiveSystem: OffensiveSystem;
  defensiveSystem: DefensiveSystem;
  
  // Pace & style
  pace: number;               // 1–10 (slower to faster possessions)
  threePointAttempts: number; // 1–10 (frequency)
  ballMovement: number;       // 1–10 (isolation vs movement)
  
  // Defense
  defensivePressure: number;  // 1–10 (intensity)
  helpDefense: number;        // 1–10 (rotation aggressiveness)
  defensiveRebounding: number; // 1–10 (box out priority)
  
  // Substitutions
  rotationDepth: number;      // 1–10 (short or deep bench)
  starterMinutes: number;     // 1–10 (starter vs bench usage)
}

export interface Club {
  id: string;
  name: string;
  shortName: string;           // e.g. "LAL"
  city: string;
  state: string;
  country: string;
  conference: 'Eastern' | 'Western';
  leagueId: string;
  arenaName: string;
  arenaCapacity: number;
  yearFounded: number;
  championships: number;

  // Squad
  playerIds: string[];
  tactics: Tactics;
  startingFive: string[];      // 5 player IDs (PG, SG, SF, PF, C)
  bench: string[];             // up to 10 player IDs
  injuredReserve: string[];    // injured players not active

  // Finances
  balance: number;             // USD
  salaryCap: number;           // USD
  payroll: number;             // USD (current total)
  luxuryTax: number;           // USD if applicable
  
  // Draft & assets
  draftPicks: DraftPick[];
  tradeExceptions: TradeException[];

  // Team reputation & fan support
  reputation: number;          // 1–100
  fanSupport: number;          // 1–100
  marketSize: 'small' | 'medium' | 'large' | 'major';
  ticketPrice: number;         // USD

  // Front office
  coachQuality: number;        // 1–100
  trainerQuality: number;      // 1–100
  scoutQuality: number;        // 1–100
  facilityQuality: number;     // 1–100

  // Season targets set by front office
  seasonTarget: SeasonTarget;
}

export interface DraftPick {
  year: number;
  round: 1 | 2;
  originalTeamId: string;      // which team originally owned the pick
  protectedCondition?: string;  // e.g. "top 5 protected"
}

export interface TradeException {
  amount: number;              // USD trade exception amount
  expiryDate: string;         // ISO date
}

export type SeasonTarget =
  | { type: 'win_championship' }
  | { type: 'reach_conference_finals' }
  | { type: 'make_playoffs' }
  | { type: 'play_in_tournament' }
  | { type: 'develop_young_core' }
  | { type: 'rebuild' }
  | { type: 'avoid_last_place' };

// ── Game (Match) ───────────────────────────────────────────────────

export interface QuarterStats {
  homeScore: number;
  awayScore: number;
}

export interface GameEvent {
  quarter: 1 | 2 | 3 | 4 | 'OT1' | 'OT2' | 'OT3';
  gameClock: string;          // format "MM:SS"
  shotClock: number | null;   // seconds remaining or null if not applicable
  type: 'made_two' | 'made_three' | 'missed_two' | 'missed_three' | 'free_throw_made' | 'free_throw_missed' | 
        'assist' | 'rebound' | 'steal' | 'block' | 'turnover' | 'foul' | 
        'substitution' | 'timeout' | 'end_of_quarter' | 'injury';
  playerId: string;
  teamId: string;
  
  // Additional context
  assistPlayerId?: string;
  foulType?: 'shooting' | 'personal' | 'technical' | 'flagrant';
  turnoverType?: 'bad_pass' | 'lost_ball' | 'offensive_foul' | 'shot_clock_violation' | 'backcourt_violation';
  reboundType?: 'offensive' | 'defensive';
  blockType?: 'jump_shot' | 'layup' | 'dunk';
}

export interface PlayerGameStats {
  playerId: string;
  minutesPlayed: number;      // in seconds
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  totalRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  personalFouls: number;
  plusMinus: number;
  
  // Advanced
  gameScore: number;          // John Hollinger's Game Score
  usageRate: number;          // 0–100
  effectiveFgPercentage: number;
}

export interface TeamGameStats {
  teamId: string;
  
  // Scoring
  points: number;
  pointsInPaint: number;
  secondChancePoints: number;
  fastBreakPoints: number;
  benchPoints: number;
  
  // Shooting
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalPercentage: number;
  
  threePointersMade: number;
  threePointersAttempted: number;
  threePointPercentage: number;
  
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  freeThrowPercentage: number;
  
  effectiveFgPercentage: number;
  trueShootingPercentage: number;
  
  // Rebounding
  offensiveRebounds: number;
  defensiveRebounds: number;
  totalRebounds: number;
  
  // Other
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  
  // Pace stats
  possessions: number;
  pace: number;               // possessions per 48 minutes
  offensiveRating: number;    // points per 100 possessions
  defensiveRating: number;    // points allowed per 100 possessions
  netRating: number;
  
  // Biggest leads
  largestLead: number;
  leadChanges: number;
  timesTied: number;
}

export interface GameResult {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number[];
  awayScore: number[];
  finalScore: { home: number; away: number };
  overtimePeriods: number;
  events: GameEvent[];
  playerStats: PlayerGameStats[];
  teamStats: TeamGameStats[];
  date: string;               // ISO date
  competition: string;
  attendance: number;
  arena: string;
  refereeNames: string[];
}

// ── League & Standings ──────────────────────────────────────────────────

export interface ConferenceStandingsEntry {
  clubId: string;
  wins: number;
  losses: number;
  winPercentage: number;
  gamesBehind: number;        // games behind division leader
  streak: number;             // positive = winning, negative = losing
  streakType: 'W' | 'L';
  
  // Home/road splits
  homeRecord: string;         // e.g. "15-5"
  roadRecord: string;         // e.g. "10-10"
  last10Record: string;       // e.g. "7-3"
  
  // Tiebreakers
  headToHeadWins: string[];   // clubIds beaten in tiebreak scenarios
  conferenceWins: number;
  
  pointsScored: number;
  pointsAllowed: number;
  pointDifference: number;
}

export interface DivisionStandingsEntry extends ConferenceStandingsEntry {
  division: string;
  divisionWins: number;
  divisionLosses: number;
}

export interface GameSchedule {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  date: string;               // ISO date
  time: string;               // local time
  competition: string;
  played: boolean;
  result?: GameResult;
  nationallyTelevised: boolean;
}

export interface League {
  id: string;
  name: string;               // e.g. "NBA"
  conferences: string[];      // ["Eastern", "Western"]
  divisions: Record<string, string[]>; // conference -> division names
  teams: string[];            // clubIds
  currentSeason: number;      // e.g. 2025
  regularSeasonGames: number; // e.g. 82
  startDate: string;          // ISO date
  endDate: string;            // ISO date
  allStarWeekendDate: string; // ISO date
  tradeDeadline: string;      // ISO date
  
  // Schedules
  regularSeason: GameSchedule[];
  playoffSchedule?: GameSchedule[];
  
  // Standings
  conferenceStandings: Record<string, ConferenceStandingsEntry[]>; // conference -> standings
  divisionStandings: Record<string, DivisionStandingsEntry[]>;
  
  // Playoff tracking
  playoffTeams: string[];     // clubIds in playoff bracket
  playoffBracket: PlayoffBracket | null;
}

export interface PlayoffSeries {
  seriesId: string;
  round: 1 | 2 | 3 | 4;      // 1=First Round, 2=Conf Semis, 3=Conf Finals, 4=Finals
  conference: 'Eastern' | 'Western' | 'Finals';
  team1Id: string;
  team2Id: string;
  team1Wins: number;
  team2Wins: number;
  games: GameResult[];
  winner?: string;            // clubId
}

export interface PlayoffBracket {
  easternConference: PlayoffSeries[];
  westernConference: PlayoffSeries[];
  finals: PlayoffSeries;
}

// ── Game State ──────────────────────────────────────────────

export interface GameState {
  id: string;
  managedClubId: string;
  currentDate: string;        // ISO date — the in-game clock
  currentSeason: number;
  offSeason: boolean;
  
  // Game data stores
  players: Record<string, Player>;
  clubs: Record<string, Club>;
  league: League;
  
  // Progression tracking
  completedGames: string[];    // gameResultIds
  upcomingGames: string[];     // gameScheduleIds
  
  // Front office
  inbox: GeneralManagerMessage[];
  
  // Season progress
  tradeRequests: TradeRequest[];
  freeAgentOffers: FreeAgentOffer[];
  
  // Historical tracking
  seasonHistory: SeasonHistoryEntry[];
  draftHistory: DraftHistoryEntry[];
  
  createdAt: string;
  lastSaved: string;
}

export interface GeneralManagerMessage {
  id: string;
  from: string;
  fromId: string;              // playerId, clubId, agentId, etc.
  subject: string;
  body: string;
  date: string;
  read: boolean;
  type: 'owner' | 'player_agent' | 'trade_offer' | 'media' | 'injury_report' | 'scouting' | 'league_office';
  requiresAction: boolean;
  actionTaken?: boolean;
}

export interface TradeRequest {
  id: string;
  fromClubId: string;
  toClubId: string;
  fromOffers: TradeAsset[];
  toOffers: TradeAsset[];
  status: 'pending' | 'accepted' | 'rejected' | 'countered';
  expiryDate: string;
}

export interface TradeAsset {
  type: 'player' | 'draft_pick' | 'cash';
  playerId?: string;
  draftPick?: DraftPick;
  cashAmount?: number;
}

export interface FreeAgentOffer {
  playerId: string;
  clubId: string;
  weeklyWage: number;         // USD
  years: number;
  playerOption: boolean;
  teamOption: boolean;
  status: 'pending' | 'accepted' | 'rejected';
  deadlineDate: string;
}

export interface SeasonHistoryEntry {
  season: number;
  clubId: string;
  record: { wins: number; losses: number };
  finish: string;              // e.g. "2nd in East", "NBA Champions"
  pointsScored: number;
  pointsAllowed: number;
  attendanceAvg: number;
  playoffs: boolean;
  playoffResult?: string;
  awardsWon: string[];
}

export interface DraftHistoryEntry {
  year: number;
  round: 1 | 2;
  pick: number;
  playerId: string;
  draftedByClubId: string;
  originalOwnerClubId?: string; // if pick was traded
}

// ── API contract ─────────────────────────────────────────────
// Request / response shapes shared by engine and client

export interface SimulateGameRequest {
  gameId: string;
  gameStateId: string;
  quarterLength?: number;      // minutes per quarter (default 12)
}

export interface SimulateGameResponse {
  result: GameResult;
  updatedStandings: ConferenceStandingsEntry[];
  playerStatsUpdated: Record<string, {
    pointsPerGame: number;
    reboundsPerGame: number;
    assistsPerGame: number;
    playerEfficiencyRating: number;
  }>;
  fatigueImpacted: string[];   // playerIds who got fatigued
  injuriesOccurred: {
    playerId: string;
    injuryType: string;
    gamesRemaining: number;
  }[];
}

export interface NewGameRequest {
  gmName: string;
  clubId: string;
  difficulty: 'rookie' | 'pro' | 'all_star' | 'hall_of_fame';
  seasonStartYear: number;
}

export interface NewGameResponse {
  gameStateId: string;
  gameState: GameState;
}

export interface AdvanceDayRequest {
  gameStateId: string;
  daysToAdvance?: number;      // default 1
}

export interface AdvanceDayResponse {
  gameState: GameState;
  gamesSimulated: string[];
  messagesReceived: GeneralManagerMessage[];
  injuriesOccurred: any[];
  tradeDeadlinePassed: boolean;
  allStarGameHappened: boolean;
}