// services/LeagueService.js
//
// Owns league creation for a single saved game: reading the static NBA
// team list, creating per-save team rows, generating 15-man rosters with
// an NBA-like talent curve, and seeding season standings.
//
// Game simulation (schedules, box scores, win/loss results) is NOT part
// of this file - simulateSeason() is left as a clearly-marked stub.

const { supabaseAdmin } = require('../config/supabase');
const NBA_TEAMS = require('../data/teams.json');
const TeamArchetypeService = require('./teamArchetypeService'); // NEW
const GameSimulationEngine = require('./gameSimulationEngine');

const ROSTER_SIZE = 15;

/* ----------------------------------------------------------------------
 * 1. TALENT DISTRIBUTION (UNCHANGED)
 * ------------------------------------------------------------------- */

function randomGaussian(mean = 0, stdDev = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdDev + mean;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

const TALENT_MEAN = 60;
const TALENT_STDDEV = 11;
const TALENT_MIN = 35;
const TALENT_MAX = 99;

function generateBaseTalent() {
  return clamp(randomGaussian(TALENT_MEAN, TALENT_STDDEV), TALENT_MIN, TALENT_MAX);
}

/* ----------------------------------------------------------------------
 * 2. POSITIONS, PHYSICAL TRAITS, NAMES (UNCHANGED)
 * ------------------------------------------------------------------- */

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

const POSITION_MODIFIERS = {
  PG: { threePoint: 6, midRange: 3, insideScoring: -8, passing: 10, ballHandling: 12, perimeterDefense: 4, postDefense: -10, rebounding: -12, speed: 8, strength: -6 },
  SG: { threePoint: 8, midRange: 5, insideScoring: -4, passing: 2, ballHandling: 6, perimeterDefense: 4, postDefense: -8, rebounding: -8, speed: 5, strength: -3 },
  SF: { threePoint: 2, midRange: 2, insideScoring: 2, passing: 0, ballHandling: 0, perimeterDefense: 2, postDefense: 0, rebounding: 0, speed: 2, strength: 0 },
  PF: { threePoint: -4, midRange: -2, insideScoring: 6, passing: -4, ballHandling: -6, perimeterDefense: -2, postDefense: 6, rebounding: 8, speed: -3, strength: 6 },
  C: { threePoint: -10, midRange: -6, insideScoring: 8, passing: -8, ballHandling: -10, perimeterDefense: -6, postDefense: 10, rebounding: 14, speed: -8, strength: 10 },
};

const HEIGHT_RANGES_INCHES = { PG: [72, 76], SG: [75, 79], SF: [77, 81], PF: [80, 83], C: [82, 87] };
const WEIGHT_RANGES_LBS = { PG: [175, 205], SG: [195, 222], SF: [212, 240], PF: [228, 258], C: [245, 290] };

function generateHeightInches(position) {
  const [min, max] = HEIGHT_RANGES_INCHES[position];
  return Math.round(min + Math.random() * (max - min));
}

function generateWeightLbs(heightInches, position) {
  const [hMin, hMax] = HEIGHT_RANGES_INCHES[position];
  const [wMin, wMax] = WEIGHT_RANGES_LBS[position];
  const heightFraction = (heightInches - hMin) / (hMax - hMin);
  const base = wMin + heightFraction * (wMax - wMin);
  return clamp(base + randomGaussian(0, 8), wMin - 15, wMax + 15);
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const FIRST_NAMES = [
  'James', 'Michael', 'Marcus', 'Anthony', 'Brandon', 'Tyler', 'Jordan', 'Isaiah',
  'Malik', 'Andre', 'Devin', 'Carlos', 'Xavier', 'Elijah', 'Caleb', 'Dominic',
  'Jalen', 'Trevor', 'Aaron', 'Nathaniel', 'Cameron', 'Julian', 'Mason', 'Eli',
  'Tristan', 'Marco', 'Damon', 'Reggie', 'Theo', 'Quentin',
];

const LAST_NAMES = [
  'Carter', 'Bennett', 'Walker', 'Reed', 'Foster', 'Coleman', 'Hayes', 'Sullivan',
  'Mercer', 'Whitfield', 'Donovan', 'Pierce', 'Hawkins', 'Lawson', 'Vance', 'Mosley',
  'Whitaker', 'Sterling', 'Marsh', 'Calloway', 'Beckett', 'Hollis', 'Sandoval',
  'Pruitt', 'Thatcher', 'Galloway', 'Brewer', 'Stone', 'Nakamura', 'Okafor',
];

function generateName() {
  return `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`;
}

function generateAge() {
  return clamp(randomGaussian(26, 4), 19, 39);
}

/* ----------------------------------------------------------------------
 * 3. SKILL ATTRIBUTES & OVERALL RATING (UNCHANGED)
 * ------------------------------------------------------------------- */

const ATTRIBUTE_KEYS = [
  'threePoint', 'midRange', 'insideScoring', 'passing', 'ballHandling',
  'perimeterDefense', 'postDefense', 'rebounding', 'speed', 'strength',
];

const OVERALL_WEIGHTS = {
  PG: { threePoint: 1, midRange: 1, insideScoring: 0.5, passing: 2, ballHandling: 1.5, perimeterDefense: 1, postDefense: 0.3, rebounding: 0.4, speed: 1.2, strength: 0.5 },
  SG: { threePoint: 1.5, midRange: 1.3, insideScoring: 0.8, passing: 1, ballHandling: 1.2, perimeterDefense: 1, postDefense: 0.4, rebounding: 0.5, speed: 1, strength: 0.6 },
  SF: { threePoint: 1.1, midRange: 1.1, insideScoring: 1.1, passing: 0.9, ballHandling: 0.9, perimeterDefense: 1, postDefense: 0.8, rebounding: 0.9, speed: 0.9, strength: 0.9 },
  PF: { threePoint: 0.6, midRange: 0.9, insideScoring: 1.3, passing: 0.6, ballHandling: 0.5, perimeterDefense: 0.7, postDefense: 1.3, rebounding: 1.4, speed: 0.6, strength: 1.2 },
  C: { threePoint: 0.3, midRange: 0.6, insideScoring: 1.4, passing: 0.5, ballHandling: 0.3, perimeterDefense: 0.5, postDefense: 1.6, rebounding: 1.7, speed: 0.5, strength: 1.4 },
};

function generateAttributes(baseTalent, position) {
  const modifiers = POSITION_MODIFIERS[position];
  const attributes = {};
  for (const key of ATTRIBUTE_KEYS) {
    const noise = randomGaussian(0, 9);
    attributes[key] = clamp(baseTalent + modifiers[key] + noise, 25, 99);
  }
  return attributes;
}

function calculateOverall(attributes, position) {
  const weights = OVERALL_WEIGHTS[position];
  let weightedSum = 0;
  let weightTotal = 0;
  for (const key of ATTRIBUTE_KEYS) {
    weightedSum += attributes[key] * weights[key];
    weightTotal += weights[key];
  }
  return clamp(weightedSum / weightTotal, 25, 99);
}

function generatePotential(overall, age) {
  const yearsOfUpside = Math.max(0, 27 - age);
  const upside = randomGaussian(yearsOfUpside * 1.5, 4);
  return clamp(overall + Math.max(0, upside), overall, 99);
}

/* ----------------------------------------------------------------------
 * 4. PLAYER + ROSTER GENERATION (MODIFIED to support archetypes)
 * ------------------------------------------------------------------- */

// [UNCHANGED] – still used as fallback
function generateRosterPositions(rosterSize = ROSTER_SIZE) {
  const perPosition = Math.floor(rosterSize / POSITIONS.length);
  let remainder = rosterSize - perPosition * POSITIONS.length;
  const positions = [];
  for (const pos of POSITIONS) {
    let count = perPosition;
    if (remainder > 0) {
      count += 1;
      remainder -= 1;
    }
    for (let i = 0; i < count; i++) positions.push(pos);
  }
  return positions;
}

// [MODIFIED] now accepts optional archetypeId
function generatePlayer(teamId, position, archetypeId = null) {
  // Use archetype talent curve if provided, else fallback to original mean/std
  const talentCurve = archetypeId
    ? TeamArchetypeService.getTalentCurve(archetypeId)
    : { mean: TALENT_MEAN, stdDev: TALENT_STDDEV };

  const baseTalent = clamp(
    randomGaussian(talentCurve.mean, talentCurve.stdDev),
    TALENT_MIN,
    TALENT_MAX
  );

  let attributes = generateAttributes(baseTalent, position);
  if (archetypeId) {
    attributes = TeamArchetypeService.applyAttributeModifiers(position, attributes, archetypeId);
  }

  const overall = calculateOverall(attributes, position);

  let age = generateAge();
  const ageRange = archetypeId ? TeamArchetypeService.getAgeRange(archetypeId) : null;
  if (ageRange) {
    age = Math.round(ageRange[0] + Math.random() * (ageRange[1] - ageRange[0]));
  }

  const heightInches = generateHeightInches(position);
  const heightMod = archetypeId ? TeamArchetypeService.getHeightModifier(archetypeId) : 0;
  const finalHeight = Math.min(90, heightInches + heightMod);

  let potential = generatePotential(overall, age);
  const potentialBoost = archetypeId ? TeamArchetypeService.getPotentialBoost(archetypeId) : null;
  if (potentialBoost) {
    potential = clamp(potential + potentialBoost, overall, 99);
  }

  return {
    teamId,
    name: generateName(),
    position,
    age,
    heightInches: finalHeight,
    weightLbs: generateWeightLbs(finalHeight, position),
    overall,
    potential,
    ...attributes,
  };
}

// [MODIFIED] now accepts optional archetypeId
function generateRosterForTeam(teamId, rosterSize = ROSTER_SIZE, archetypeId = null) {
  // If archetype is provided, use its position distribution; else use the original balanced distribution
  const positions = archetypeId
    ? TeamArchetypeService.generatePositionDistribution(archetypeId, rosterSize)
    : generateRosterPositions(rosterSize);

  return positions.map((position) => generatePlayer(teamId, position, archetypeId));
}

// [UNCHANGED] – mapping to DB columns
function toPlayerRow(player, team, index, season) {
  const nameParts = player.name.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || firstName;
  const isStarter = index < 5;
  const isStar = index < 2;

  return {
    saved_game_id: player.savedGameId,
    player_id: `${team.team_id}_${season}_${index + 1}`,
    team_id: player.teamId,
    first_name: firstName,
    last_name: lastName,
    position: player.position,
    age: player.age,
    height: player.heightInches,
    weight: player.weightLbs,
    overall_rating: player.overall,
    potential_rating: player.potential,
    traits: {
      three_point: player.threePoint,
      mid_range: player.midRange,
      inside_scoring: player.insideScoring,
      passing: player.passing,
      ball_handling: player.ballHandling,
      perimeter_defense: player.perimeterDefense,
      post_defense: player.postDefense,
      rebounding: player.rebounding,
      speed: player.speed,
      strength: player.strength,
    },
    games_played: 0,
    points: 0,
    rebounds: 0,
    assists: 0,
    season,
  };
}

/* ----------------------------------------------------------------------
 * 5. LEAGUE SERVICE – scoped to one saved game
 * ------------------------------------------------------------------- */

class LeagueService {
  constructor(savedGameId) {
    if (!savedGameId) throw new Error('LeagueService requires a savedGameId');
    this.savedGameId = savedGameId;
  }

  // [UNCHANGED]
  async getTeams() {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('saved_game_id', this.savedGameId);

    if (error) throw new Error(`Failed to load teams: ${error.message}`);
    return data;
  }

  // [UNCHANGED]
  async getRosterForTeam(teamId) {
    const { data, error } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('saved_game_id', this.savedGameId)
      .eq('team_id', teamId)
      .order('overall_rating', { ascending: false });

    if (error) throw new Error(`Failed to load roster: ${error.message}`);
    return data;
  }

  // [UNCHANGED]
  async createTeams() {
    const rows = NBA_TEAMS.map((team) => ({
      saved_game_id: this.savedGameId,
      team_id: team.name,
      city: team.city,
      name: team.name,
      abbreviation: team.abbreviation,
      conference: team.conference,
      division: team.division,
    }));

    const { data, error } = await supabaseAdmin.from('teams').insert(rows).select();
    if (error) throw new Error(`Failed to create teams: ${error.message}`);
    return data;
  }

  // [MODIFIED] now accepts optional teamArchetypes (fourth parameter)
  async createRosters(teams, season = 1, rosterSize = ROSTER_SIZE, teamArchetypes = {}) {
    const rows = teams.flatMap((team) => {
      const archetypeId = teamArchetypes[team.team_id] || null;
      return generateRosterForTeam(team.id, rosterSize, archetypeId).map((player, index) =>
        toPlayerRow({ ...player, savedGameId: this.savedGameId }, team, index, season)
      );
    });

    const { data, error } = await supabaseAdmin.from('players').insert(rows).select();
    if (error) throw new Error(`Failed to create players: ${error.message}`);
    return data;
  }

  // [UNCHANGED]
  async createSeasonStats(teams, season) {
    const rows = teams.map((team) => ({
      saved_game_id: this.savedGameId,
      team_id: team.id,
      season,
      wins: 0,
      losses: 0,
    }));

    const { data, error } = await supabaseAdmin.from('team_season_stats').insert(rows).select();
    if (error) throw new Error(`Failed to create season stats: ${error.message}`);
    return data;
  }

  // [UNCHANGED]
  async rollbackLeague() {
    await supabaseAdmin.from('teams').delete().eq('saved_game_id', this.savedGameId);
  }

  // [NEW] create a season record
  async createSeason(seasonNumber) {
    const { data, error } = await supabaseAdmin
      .from('seasons')
      .insert({
        saved_game_id: this.savedGameId,
        season_number: seasonNumber,
        status: 'regular_season',
        start_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create season: ${error.message}`);
    return data;
  }

  // [NEW] generate a round‑robin schedule
  async generateSchedule(teams, seasonId) {
    const teamIds = teams.map(t => t.id);
    const games = [];

    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        const home = teamIds[i];
        const away = teamIds[j];

        games.push({
          season_id: seasonId,
          home_team_id: home,
          away_team_id: away,
          status: 'scheduled',
          week: games.length + 1,
        });

        games.push({
          season_id: seasonId,
          home_team_id: away,
          away_team_id: home,
          status: 'scheduled',
          week: games.length + 1,
        });
      }
    }

    const BATCH_SIZE = 100;
    for (let i = 0; i < games.length; i += BATCH_SIZE) {
      const batch = games.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin.from('games').insert(batch);
      if (error) throw new Error(`Failed to create schedule: ${error.message}`);
    }

    return games.length;
  }

  // [MODIFIED] now also creates season and schedule, with rollback
  async initializeLeague(season = 1, teamArchetypes = {}) {
    const existingTeams = await this.getTeams();
    if (existingTeams.length > 0) {
      throw new Error(`League already initialized for saved game ${this.savedGameId}`);
    }

    let teams;
    let seasonRecord;
    try {
      // 1. Create teams, rosters, standings (original)
      teams = await this.createTeams();
      const players = await this.createRosters(teams, season, ROSTER_SIZE, teamArchetypes);
      await this.createSeasonStats(teams, season);

      // 2. Create season record
      seasonRecord = await this.createSeason(season);

      // 3. Generate schedule
      const gamesCount = await this.generateSchedule(teams, seasonRecord.id);

      // 4. Update saved_games with season info
      const currentState = (await this._getGameState()) || {};
      await supabaseAdmin
        .from('saved_games')
        .update({
          current_season: season,
          game_state: {
            ...currentState,
            team_archetypes: teamArchetypes,
            initialized_at: new Date().toISOString(),
            season_id: seasonRecord.id,
            total_games: gamesCount,
          }
        })
        .eq('id', this.savedGameId);

      return {
        season,
        teamsCreated: teams.length,
        playersCreated: players.length,
        gamesCreated: gamesCount,
        archetypesUsed: Object.keys(teamArchetypes).length,
      };
    } catch (err) {
      if (teams) await this.rollbackLeague();
      if (seasonRecord) {
        await supabaseAdmin.from('seasons').delete().eq('id', seasonRecord.id);
      }
      throw err;
    }
  }

  // [UNCHANGED] stub
  async simulateSeason() {
    throw new Error(
      'simulateSeason() is not implemented yet. Game simulation (schedules, results, stat tracking) is a separate feature from league initialization.'
    );
  }

  // [UNCHANGED]
  async tradePlayer(playerId, newTeamId) {
    const { data: destTeam, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('id', newTeamId)
      .eq('saved_game_id', this.savedGameId)
      .single();

    if (teamError || !destTeam) {
      throw new Error('Destination team not found in this saved game');
    }

    const { data, error } = await supabaseAdmin
      .from('players')
      .update({ team_id: newTeamId })
      .eq('id', playerId)
      .eq('saved_game_id', this.savedGameId)
      .select()
      .single();

    if (error) throw new Error(`Failed to trade player: ${error.message}`);
    return data;
  }

  // [NEW] helper to fetch current game_state without overwriting
  async _getGameState() {
    const { data, error } = await supabaseAdmin
      .from('saved_games')
      .select('game_state')
      .eq('id', this.savedGameId)
      .single();
    if (error || !data) return {};
    return data.game_state || {};
  }

  // services/LeagueService.js

/**
 * Simulate a single game and persist all results.
 * @param {string} gameId - UUID of the game to simulate.
 * @returns {Object} - game result summary.
 */
async simulateGame(gameId) {
  // Fetch the game with home/away team details
  const { data: game, error: gameError } = await supabaseAdmin
    .from('games')
    .select(`
      *,
      home_team:home_team_id(*),
      away_team:away_team_id(*)
    `)
    .eq('id', gameId)
    .single();

  if (gameError) throw new Error(`Game not found: ${gameError.message}`);
  if (game.status !== 'scheduled') {
    throw new Error(`Game ${gameId} is already ${game.status}`);
  }

  const seasonId = game.season_id;
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;

  // Fetch rosters
  const homePlayers = await this.getRosterForTeam(homeTeam.id);
  const awayPlayers = await this.getRosterForTeam(awayTeam.id);

  // Use the simulation engine
  const result = GameSimulationEngine.simulateGame(homePlayers, awayPlayers, {
    homeCourtAdvantage: 1.03,
  });

  // Extract box scores
  const homeBoxScores = result.homeBoxScores.map(b => ({
    ...b,
    game_id: gameId,
    team_id: homeTeam.id,
  }));
  
  const awayBoxScores = result.awayBoxScores.map(b => ({
    ...b,
    game_id: gameId,
    team_id: awayTeam.id,
  }));

  const allStats = [...homeBoxScores, ...awayBoxScores];

  try {
    // Insert player_game_stats
    const { error: statsError } = await supabaseAdmin
      .from('player_game_stats')
      .insert(allStats);
    if (statsError) throw new Error(`Failed to insert player stats: ${statsError.message}`);

    // Update game record
    const { error: updateGameError } = await supabaseAdmin
      .from('games')
      .update({
        home_score: result.homeScore,
        away_score: result.awayScore,
        status: 'final',
        played_at: new Date().toISOString(),
      })
      .eq('id', gameId);
    if (updateGameError) throw new Error(`Failed to update game: ${updateGameError.message}`);

    // Update team stats
    await this._updateTeamStats(seasonId, homeTeam.id, result.homeScore, result.awayScore, true);
    await this._updateTeamStats(seasonId, awayTeam.id, result.awayScore, result.homeScore, false);

    // Update player season stats
    await this._updatePlayerSeasonStats(seasonId, allStats, this.savedGameId);

    return {
      gameId,
      homeTeam: homeTeam.name,
      awayTeam: awayTeam.name,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      overtime: result.overtime,
      overtimeCount: result.overtimeCount,
    };
  } catch (error) {
    throw error;
  }
}/**
 * Generate box scores for a team's players based on ratings.
 * Each player gets minutes and stats proportional to their overall rating.
 */
_generateBoxScores(players, teamId, gameId) {
  const sorted = [...players].sort((a, b) => b.overall_rating - a.overall_rating);
  const totalMinutes = 48 * 5;
  let remaining = totalMinutes;
  const boxScores = [];

  sorted.forEach((player, index) => {
    let minutes;
    if (index < 5) {
      minutes = Math.round(30 + Math.random() * 8);
    } else {
      minutes = Math.round(4 + Math.random() * 14);
    }
    minutes = Math.min(minutes, remaining);
    remaining -= minutes;
    if (remaining < 0) minutes += remaining;

    const rating = player.overall_rating;
    const points = Math.round((rating / 10) * (minutes / 36) * (0.8 + 0.4 * Math.random()));
    const rebounds = Math.round((rating / 20) * (minutes / 36) * (0.8 + 0.4 * Math.random()));
    const assists = Math.round((rating / 25) * (minutes / 36) * (0.8 + 0.4 * Math.random()));
    const steals = Math.round((rating / 40) * (minutes / 36) * (0.8 + 0.4 * Math.random()));
    const blocks = Math.round((rating / 50) * (minutes / 36) * (0.8 + 0.4 * Math.random()));
    const turnovers = Math.round((rating / 60) * (minutes / 36) * (0.8 + 0.4 * Math.random()));

    const fga = Math.round(points / 2 + Math.random() * 4);
    const fgm = Math.round(fga * (0.42 + 0.08 * Math.random()));
    const fga3 = Math.round(fga * (0.2 + 0.2 * Math.random()));
    const fgm3 = Math.round(fga3 * (0.35 + 0.05 * Math.random()));
    const fta = Math.round((fga / 2) * (0.3 + 0.2 * Math.random()));
    const ftm = Math.round(fta * (0.75 + 0.1 * Math.random()));

    boxScores.push({
      player_id: player.id,
      game_id: gameId,
      team_id: teamId,
      minutes_played: minutes,
      points,
      rebounds,
      assists,
      steals,
      blocks,
      turnovers,
      fga,
      fgm,
      fga_3: fga3,
      fgm_3: fgm3,
      fta,
      ftm,
    });
  });

  return boxScores;
}

_sumBoxScores(boxScores) {
  const totals = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0 };
  boxScores.forEach(b => {
    totals.points += b.points;
    totals.rebounds += b.rebounds;
    totals.assists += b.assists;
    totals.steals += b.steals;
    totals.blocks += b.blocks;
    totals.turnovers += b.turnovers;
  });
  return totals;
}

async _updateTeamStats(seasonId, teamId, pointsFor, pointsAgainst, isHome) {
  // We need to determine win/loss
  const win = pointsFor > pointsAgainst;
  const { data: current, error } = await supabaseAdmin
    .from('team_season_stats')
    .select('wins, losses, points_for, points_against')
    .eq('team_id', teamId)
    .eq('season', (await this._getSeasonNumber(seasonId)))
    .single();

  if (error) throw new Error(`Failed to fetch team stats: ${error.message}`);

  const newWins = current.wins + (win ? 1 : 0);
  const newLosses = current.losses + (win ? 0 : 1);
  const newPointsFor = (current.points_for || 0) + pointsFor;
  const newPointsAgainst = (current.points_against || 0) + pointsAgainst;

  const { error: updateError } = await supabaseAdmin
    .from('team_season_stats')
    .update({
      wins: newWins,
      losses: newLosses,
      points_for: newPointsFor,
      points_against: newPointsAgainst,
    })
    .eq('team_id', teamId)
    .eq('season', (await this._getSeasonNumber(seasonId)));

  if (updateError) throw new Error(`Failed to update team stats: ${updateError.message}`);
}

async _updatePlayerSeasonStats(seasonId, boxScores, savedGameId) {
  for (const box of boxScores) {
    const { data: existing, error: findError } = await supabaseAdmin
      .from('player_season_stats')
      .select('*')
      .eq('player_id', box.player_id)
      .eq('season_id', seasonId)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      throw new Error(`Failed to find player season stats: ${findError.message}`);
    }

    const newStats = {
      games_played: (existing?.games_played || 0) + 1,
      total_points: (existing?.total_points || 0) + box.points,
      total_rebounds: (existing?.total_rebounds || 0) + box.rebounds,
      total_assists: (existing?.total_assists || 0) + box.assists,
      total_steals: (existing?.total_steals || 0) + box.steals,
      total_blocks: (existing?.total_blocks || 0) + box.blocks,
      total_turnovers: (existing?.total_turnovers || 0) + box.turnovers,
      total_fga: (existing?.total_fga || 0) + box.fga,
      total_fgm: (existing?.total_fgm || 0) + box.fgm,
      total_fga_3: (existing?.total_fga_3 || 0) + box.fga_3,
      total_fgm_3: (existing?.total_fgm_3 || 0) + box.fgm_3,
      total_fta: (existing?.total_fta || 0) + box.fta,
      total_ftm: (existing?.total_ftm || 0) + box.ftm,
    };

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('player_season_stats')
        .update(newStats)
        .eq('id', existing.id);
      if (updateError) throw new Error(`Failed to update player stats: ${updateError.message}`);
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('player_season_stats')
        .insert({
          player_id: box.player_id,
          season_id: seasonId,
          saved_game_id: savedGameId,
          team_id: box.team_id,  
          ...newStats,
        });
      if (insertError) throw new Error(`Failed to insert player stats: ${insertError.message}`);
    }
  }
}

async _getSeasonNumber(seasonId) {
  const { data, error } = await supabaseAdmin
    .from('seasons')
    .select('season_number')
    .eq('id', seasonId)
    .single();
  if (error) throw new Error(`Failed to get season number: ${error.message}`);
  return data.season_number;
}

// services/LeagueService.js

async getCurrentSeasonId() {
  // Fetch from saved_games.game_state or the most recent season
  const { data: game, error } = await supabaseAdmin
    .from('saved_games')
    .select('game_state')
    .eq('id', this.savedGameId)
    .single();
  if (error) throw new Error(`Failed to get saved game: ${error.message}`);
  
  const seasonId = game.game_state?.season_id;
  if (!seasonId) {
    // Fallback: get the latest season for this saved game
    const { data: seasons, error: sError } = await supabaseAdmin
      .from('seasons')
      .select('id')
      .eq('saved_game_id', this.savedGameId)
      .order('season_number', { ascending: false })
      .limit(1);
    if (sError || seasons.length === 0) {
      throw new Error('No season found for this saved game');
    }
    return seasons[0].id;
  }
  return seasonId;
}

// services/LeagueService.js

async simulateWeek() {
  const seasonId = await this.getCurrentSeasonId();

  // 1. Find the next week with scheduled games
  const { data: nextWeekData, error: weekError } = await supabaseAdmin
    .from('games')
    .select('week')
    .eq('season_id', seasonId)
    .eq('status', 'scheduled')
    .order('week', { ascending: true })
    .limit(1);

  if (weekError) throw new Error(`Failed to find next week: ${weekError.message}`);
  if (!nextWeekData || nextWeekData.length === 0) {
    // No more games – season is complete
    await supabaseAdmin
      .from('seasons')
      .update({ status: 'finished', end_date: new Date().toISOString() })
      .eq('id', seasonId);
    return { seasonComplete: true };
  }

  const weekNumber = nextWeekData[0].week;

  // 2. Fetch all scheduled games for that week
  const { data: weekGames, error: gamesError } = await supabaseAdmin
    .from('games')
    .select('*')
    .eq('season_id', seasonId)
    .eq('status', 'scheduled')
    .eq('week', weekNumber);

  if (gamesError) throw new Error(`Failed to fetch week games: ${gamesError.message}`);

  // 3. Simulate each game sequentially
  const results = [];
  for (const game of weekGames) {
    const result = await this.simulateGame(game.id);
    results.push(result);
  }

  // 4. Update saved_game state (optional)
  await supabaseAdmin
    .from('saved_games')
    .update({
      game_state: {
        ...(await this._getGameState()),
        last_simulated_week: weekNumber,
        last_simulated_at: new Date().toISOString(),
      }
    })
    .eq('id', this.savedGameId);

  return {
    seasonComplete: false,
    week: weekNumber,
    games: results,
  };
}
}

// Pure generation helpers exposed for testing (unchanged)
LeagueService.generatePlayer = generatePlayer;
LeagueService.generateRosterForTeam = generateRosterForTeam;

module.exports = LeagueService;