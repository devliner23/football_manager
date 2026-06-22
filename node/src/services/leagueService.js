// services/leagueService.js
const { supabaseAdmin } = require('../config/supabase');
const NBA_TEAMS = require('../data/teams.json');
const TeamArchetypeService = require('./teamArchetypeService');
const GameSimulationEngine = require('./gameSimulationEngine');

const ROSTER_SIZE = 15;

// ----------------------------------------------------------------------
// 1. TALENT DISTRIBUTION
// ----------------------------------------------------------------------
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

const TALENT_MEAN   = 60;
const TALENT_STDDEV = 11;
const TALENT_MIN    = 35;
const TALENT_MAX    = 99;

function generateBaseTalent() {
  return clamp(randomGaussian(TALENT_MEAN, TALENT_STDDEV), TALENT_MIN, TALENT_MAX);
}

// ----------------------------------------------------------------------
// 2. POSITIONS, PHYSICAL TRAITS, NAMES
// ----------------------------------------------------------------------
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

const POSITION_MODIFIERS = {
  PG: { threePoint:  6, midRange:  3, insideScoring: -8, passing: 10, ballHandling: 12, perimeterDefense:  4, postDefense: -10, rebounding: -12, speed:  8, strength:  -6 },
  SG: { threePoint:  8, midRange:  5, insideScoring: -4, passing:  2, ballHandling:  6, perimeterDefense:  4, postDefense:  -8, rebounding:  -8, speed:  5, strength:  -3 },
  SF: { threePoint:  2, midRange:  2, insideScoring:  2, passing:  0, ballHandling:  0, perimeterDefense:  2, postDefense:   0, rebounding:   0, speed:  2, strength:   0 },
  PF: { threePoint: -4, midRange: -2, insideScoring:  6, passing: -4, ballHandling: -6, perimeterDefense: -2, postDefense:   6, rebounding:   8, speed: -3, strength:   6 },
  C:  { threePoint:-10, midRange: -6, insideScoring:  8, passing: -8, ballHandling:-10, perimeterDefense: -6, postDefense:  10, rebounding:  14, speed: -8, strength:  10 },
};

const HEIGHT_RANGES_INCHES = { PG:[72,76], SG:[75,79], SF:[77,81], PF:[80,83], C:[82,87] };
const WEIGHT_RANGES_LBS    = { PG:[175,205], SG:[195,222], SF:[212,240], PF:[228,258], C:[245,290] };

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
  'James','Michael','Marcus','Anthony','Brandon','Tyler','Jordan','Isaiah',
  'Malik','Andre','Devin','Carlos','Xavier','Elijah','Caleb','Dominic',
  'Jalen','Trevor','Aaron','Nathaniel','Cameron','Julian','Mason','Eli',
  'Tristan','Marco','Damon','Reggie','Theo','Quentin',
];

const LAST_NAMES = [
  'Carter','Bennett','Walker','Reed','Foster','Coleman','Hayes','Sullivan',
  'Mercer','Whitfield','Donovan','Pierce','Hawkins','Lawson','Vance','Mosley',
  'Whitaker','Sterling','Marsh','Calloway','Beckett','Hollis','Sandoval',
  'Pruitt','Thatcher','Galloway','Brewer','Stone','Nakamura','Okafor',
];

function generateName() {
  return `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`;
}

function generateAge() {
  return clamp(randomGaussian(26, 4), 19, 39);
}

// ----------------------------------------------------------------------
// 3. SKILL ATTRIBUTES & OVERALL RATING
// ----------------------------------------------------------------------
const ATTRIBUTE_KEYS = [
  'threePoint','midRange','insideScoring','passing','ballHandling',
  'perimeterDefense','postDefense','rebounding','speed','strength',
];

const OVERALL_WEIGHTS = {
  PG: { threePoint:1,   midRange:1,   insideScoring:0.5, passing:2,   ballHandling:1.5, perimeterDefense:1,   postDefense:0.3, rebounding:0.4, speed:1.2, strength:0.5 },
  SG: { threePoint:1.5, midRange:1.3, insideScoring:0.8, passing:1,   ballHandling:1.2, perimeterDefense:1,   postDefense:0.4, rebounding:0.5, speed:1,   strength:0.6 },
  SF: { threePoint:1.1, midRange:1.1, insideScoring:1.1, passing:0.9, ballHandling:0.9, perimeterDefense:1,   postDefense:0.8, rebounding:0.9, speed:0.9, strength:0.9 },
  PF: { threePoint:0.6, midRange:0.9, insideScoring:1.3, passing:0.6, ballHandling:0.5, perimeterDefense:0.7, postDefense:1.3, rebounding:1.4, speed:0.6, strength:1.2 },
  C:  { threePoint:0.3, midRange:0.6, insideScoring:1.4, passing:0.5, ballHandling:0.3, perimeterDefense:0.5, postDefense:1.6, rebounding:1.7, speed:0.5, strength:1.4 },
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

// ----------------------------------------------------------------------
// 4. PLAYER + ROSTER GENERATION
// ----------------------------------------------------------------------
function generateRosterPositions(rosterSize = ROSTER_SIZE) {
  const perPosition = Math.floor(rosterSize / POSITIONS.length);
  let remainder = rosterSize - perPosition * POSITIONS.length;
  const positions = [];
  for (const pos of POSITIONS) {
    let count = perPosition;
    if (remainder > 0) { count += 1; remainder -= 1; }
    for (let i = 0; i < count; i++) positions.push(pos);
  }
  return positions;
}

function generatePlayer(teamId, position, archetypeId = null, savedGameId) {
  const talentCurve = archetypeId
    ? TeamArchetypeService.getTalentCurve(archetypeId)
    : { mean: TALENT_MEAN, stdDev: TALENT_STDDEV };

  const baseTalent = clamp(
    randomGaussian(talentCurve.mean, talentCurve.stdDev),
    TALENT_MIN, TALENT_MAX
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
  const heightMod    = archetypeId ? TeamArchetypeService.getHeightModifier(archetypeId) : 0;
  const finalHeight  = Math.min(90, heightInches + heightMod);

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
    height: finalHeight,
    weight: generateWeightLbs(finalHeight, position),
    overall,
    potential,
    ...attributes,
    savedGameId,
  };
}

function generateRosterForTeam(teamId, rosterSize = ROSTER_SIZE, archetypeId = null, savedGameId) {
  const positions = archetypeId
    ? TeamArchetypeService.generatePositionDistribution(archetypeId, rosterSize)
    : generateRosterPositions(rosterSize);
  return positions.map(position => generatePlayer(teamId, position, archetypeId, savedGameId));
}

function toPlayerRow(player) {
  const nameParts  = player.name.split(' ');
  const firstName  = nameParts[0];
  const lastName   = nameParts.slice(1).join(' ') || firstName;

  return {
    saved_game_id:    player.savedGameId,
    team_id:          player.teamId,
    first_name:       firstName,
    last_name:        lastName,
    position:         player.position,
    age:              player.age,
    height:           player.height,
    weight:           player.weight,
    overall_rating:   player.overall,
    potential_rating: player.potential,
    traits: {
      three_point:        player.threePoint,
      mid_range:          player.midRange,
      inside_scoring:     player.insideScoring,
      passing:            player.passing,
      ball_handling:      player.ballHandling,
      perimeter_defense:  player.perimeterDefense,
      post_defense:       player.postDefense,
      rebounding:         player.rebounding,
      speed:              player.speed,
      strength:           player.strength,
    },
  };
}

// ----------------------------------------------------------------------
// 5. LEAGUE SERVICE
// ----------------------------------------------------------------------
class LeagueService {
  constructor(savedGameId) {
    if (!savedGameId) throw new Error('LeagueService requires a savedGameId');
    this.savedGameId = savedGameId;
  }

  // ── Public data helpers ───────────────────────────────────────────────

  async getTeams() {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('saved_game_id', this.savedGameId);
    if (error) throw new Error(`Failed to load teams: ${error.message}`);
    return data;
  }

  async getRosterForTeam(teamId) {
    const { data, error } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('saved_game_id', this.savedGameId)
      .eq('team_id', teamId)
      .order('overall_rating', { ascending: false });
    if (error) throw new Error(`Failed to load roster: ${error.message}`);
    // Flatten traits into top-level for simulation engine
    return data.map(player => ({ ...player, ...player.traits }));
  }

  // ── League creation ───────────────────────────────────────────────────

  async createTeams() {
    const rows = NBA_TEAMS.map(team => ({
      saved_game_id: this.savedGameId,
      name:          team.name,
      city:          team.city,
      abbreviation:  team.abbreviation,
      conference:    team.conference,
      division:      team.division,
    }));
    const { data, error } = await supabaseAdmin.from('teams').insert(rows).select();
    if (error) throw new Error(`Failed to create teams: ${error.message}`);
    return data;
  }

  async createRosters(teams, season = 1, rosterSize = ROSTER_SIZE, teamArchetypes = {}) {
    const rows = teams.flatMap(team => {
      const archetypeId = teamArchetypes[team.name] || null;
      return generateRosterForTeam(team.id, rosterSize, archetypeId, this.savedGameId)
        .map(player => toPlayerRow(player));
    });
    const { data, error } = await supabaseAdmin.from('players').insert(rows).select();
    if (error) throw new Error(`Failed to create players: ${error.message}`);
    return data;
  }

  async createSeason(seasonNumber) {
    const { data, error } = await supabaseAdmin
      .from('seasons')
      .insert({
        saved_game_id: this.savedGameId,
        season_number: seasonNumber,
        status:        'regular_season',
        start_date:    new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create season: ${error.message}`);
    return data;
  }

  async createSeasonStats(teams, seasonId) {
    const rows = teams.map(team => ({
      saved_game_id:  this.savedGameId,
      team_id:        team.id,
      season_id:      seasonId,
      wins:           0,
      losses:         0,
      points_for:     0,
      points_against: 0,
    }));
    const { data, error } = await supabaseAdmin.from('team_season_stats').insert(rows).select();
    if (error) throw new Error(`Failed to create season stats: ${error.message}`);
    return data;
  }

  async generateSchedule(teams, seasonId) {
    const teamIds = teams.map(t => t.id);
    const games   = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);

    // Double round-robin
    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        const home = teamIds[i];
        const away = teamIds[j];
        games.push({ season_id: seasonId, home_team_id: home, away_team_id: away, status: 'scheduled', game_date: startDate, saved_game_id: this.savedGameId });
        games.push({ season_id: seasonId, home_team_id: away, away_team_id: home, status: 'scheduled', game_date: startDate, saved_game_id: this.savedGameId });
      }
    }

    // Shuffle
    for (let i = games.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [games[i], games[j]] = [games[j], games[i]];
    }

    // Spread across ~180 days and assign week numbers
    const daysRange    = 180;
    const GAMES_PER_WEEK = 15;
    games.forEach((game, idx) => {
      const daysOffset = Math.floor((idx / games.length) * daysRange);
      const gameDate   = new Date(startDate);
      gameDate.setDate(gameDate.getDate() + daysOffset);
      game.game_date = gameDate;
      game.week      = Math.floor(idx / GAMES_PER_WEEK) + 1;
    });

    // Batch insert
    const BATCH_SIZE = 100;
    for (let i = 0; i < games.length; i += BATCH_SIZE) {
      const { error } = await supabaseAdmin.from('games').insert(games.slice(i, i + BATCH_SIZE));
      if (error) throw new Error(`Failed to create schedule: ${error.message}`);
    }

    return games.length;
  }

  async rollbackLeague() {
    await supabaseAdmin.from('teams').delete().eq('saved_game_id', this.savedGameId);
  }

  async initializeLeague(season = 1, teamArchetypes = {}) {
    const existingTeams = await this.getTeams();
    if (existingTeams.length > 0) {
      throw new Error(`League already initialized for saved game ${this.savedGameId}`);
    }

    let teams, seasonRecord;
    try {
      teams        = await this.createTeams();
      const players = await this.createRosters(teams, season, ROSTER_SIZE, teamArchetypes);
      seasonRecord  = await this.createSeason(season);
      await this.createSeasonStats(teams, seasonRecord.id);
      const gamesCount = await this.generateSchedule(teams, seasonRecord.id);

      const currentState = (await this._getGameState()) || {};
      await supabaseAdmin
        .from('saved_games')
        .update({
          current_season: season,
          game_state: {
            ...currentState,
            team_archetypes:  teamArchetypes,
            initialized_at:   new Date().toISOString(),
            season_id:        seasonRecord.id,
            total_games:      gamesCount,
          },
        })
        .eq('id', this.savedGameId);

      return {
        season,
        teamsCreated:     teams.length,
        playersCreated:   players.length,
        gamesCreated:     gamesCount,
        archetypesUsed:   Object.keys(teamArchetypes).length,
      };
    } catch (err) {
      if (teams)        await this.rollbackLeague();
      if (seasonRecord) await supabaseAdmin.from('seasons').delete().eq('id', seasonRecord.id);
      throw err;
    }
  }

  // ── Single-game simulation ────────────────────────────────────────────

  async simulateGame(gameId) {
    const { data: game, error: gameError } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (gameError) throw new Error(`Game not found: ${gameError.message}`);
    if (game.status !== 'scheduled') {
      throw new Error(`Game ${gameId} is already ${game.status}`);
    }

    const { season_id: seasonId, home_team_id: homeTeamId, away_team_id: awayTeamId } = game;
    if (!seasonId || !homeTeamId || !awayTeamId) {
      throw new Error(`Game ${gameId} is missing required IDs (season, home, or away)`);
    }

    const [{ data: homeTeam }, { data: awayTeam }] = await Promise.all([
      supabaseAdmin.from('teams').select('name').eq('id', homeTeamId).single(),
      supabaseAdmin.from('teams').select('name').eq('id', awayTeamId).single(),
    ]);

    const [homePlayers, awayPlayers] = await Promise.all([
      this.getRosterForTeam(homeTeamId),
      this.getRosterForTeam(awayTeamId),
    ]);

    const result = GameSimulationEngine.simulateGame(homePlayers, awayPlayers, {
      homeCourtAdvantage: 1.03,
    });

    const mapBoxScore = (b, teamId) => ({
      game_id:            gameId,
      team_id:            teamId,
      saved_game_id:      this.savedGameId,
      player_id:          b.player_id,
      minutes_played:     b.minutes_played     || 0,
      points:             b.points             || 0,
      fgm:                b.fgm                || 0,
      fga:                b.fga                || 0,
      fgm_3:              b.fgm_3              || 0,
      fga_3:              b.fga_3              || 0,
      ftm:                b.ftm                || 0,
      fta:                b.fta                || 0,
      offensive_rebounds: b.offensive_rebounds || 0,
      defensive_rebounds: b.defensive_rebounds || 0,
      rebounds:          (b.offensive_rebounds || 0) + (b.defensive_rebounds || 0),
      assists:            b.assists            || 0,
      steals:             b.steals             || 0,
      blocks:             b.blocks             || 0,
      turnovers:          b.turnovers          || 0,
      personal_fouls:     b.personal_fouls     || 0,
      plus_minus:         b.plus_minus         || 0,
    });

    const allStats = [
      ...result.homeBoxScores.map(b => mapBoxScore(b, homeTeamId)),
      ...result.awayBoxScores.map(b => mapBoxScore(b, awayTeamId)),
    ];

    const { error: statsError } = await supabaseAdmin.from('player_game_stats').insert(allStats);
    if (statsError) throw new Error(`Failed to insert player stats: ${statsError.message}`);

    const { error: updateGameError } = await supabaseAdmin
      .from('games')
      .update({ home_score: result.homeScore, away_score: result.awayScore, status: 'completed', played_at: new Date().toISOString() })
      .eq('id', gameId);
    if (updateGameError) throw new Error(`Failed to update game: ${updateGameError.message}`);

    await this._updateTeamStats(seasonId, homeTeamId, result.homeScore, result.awayScore, true);
    await this._updateTeamStats(seasonId, awayTeamId, result.awayScore, result.homeScore, false);
    await this._updatePlayerSeasonStats(seasonId, allStats);

    return {
      gameId,
      homeTeam:      homeTeam?.name || 'Home',
      awayTeam:      awayTeam?.name || 'Away',
      homeScore:     result.homeScore,
      awayScore:     result.awayScore,
      overtime:      result.overtime,
      overtimeCount: result.overtimeCount,
    };
  }

  // ── Bulk week simulation ──────────────────────────────────────────────

  async simulateWeek() {
    const seasonId = await this.getCurrentSeasonId();

    // Find the lowest week number that still has scheduled games
    const { data: nextWeekData, error: weekError } = await supabaseAdmin
      .from('games')
      .select('week')
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .order('week', { ascending: true })
      .limit(1);

    if (weekError) throw new Error(`Failed to find next week: ${weekError.message}`);
    if (!nextWeekData || nextWeekData.length === 0) {
      await supabaseAdmin
        .from('seasons')
        .update({ status: 'finished', end_date: new Date().toISOString() })
        .eq('id', seasonId);
      return { seasonComplete: true };
    }

    const weekNumber = nextWeekData[0].week;

    const { data: weekGames, error: gamesError } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('season_id', seasonId)
      .eq('status', 'scheduled')
      .eq('week', weekNumber);
    if (gamesError) throw new Error(`Failed to fetch week games: ${gamesError.message}`);

    // ── 1. Fetch all rosters in parallel ─────────────────────────────────
    const teamIds = [...new Set(weekGames.flatMap(g => [g.home_team_id, g.away_team_id]))];
    const rosterEntries = await Promise.all(
      teamIds.map(async teamId => [teamId, await this.getRosterForTeam(teamId)])
    );
    const rosterMap = Object.fromEntries(rosterEntries);

    // ── 2. Run all simulations in memory ─────────────────────────────────
    const mapBoxScore = (b, teamId, gameId) => ({
      game_id:            gameId,
      team_id:            teamId,
      saved_game_id:      this.savedGameId,
      player_id:          b.player_id,
      minutes_played:     b.minutes_played     || 0,
      points:             b.points             || 0,
      fgm:                b.fgm                || 0,
      fga:                b.fga                || 0,
      fgm_3:              b.fgm_3              || 0,
      fga_3:              b.fga_3              || 0,
      ftm:                b.ftm                || 0,
      fta:                b.fta                || 0,
      offensive_rebounds: b.offensive_rebounds || 0,
      defensive_rebounds: b.defensive_rebounds || 0,
      rebounds:          (b.offensive_rebounds || 0) + (b.defensive_rebounds || 0),
      assists:            b.assists            || 0,
      steals:             b.steals             || 0,
      blocks:             b.blocks             || 0,
      turnovers:          b.turnovers          || 0,
      personal_fouls:     b.personal_fouls     || 0,
      plus_minus:         b.plus_minus         || 0,
    });

    const simResults = weekGames.map(game => {
      const result = GameSimulationEngine.simulateGame(
        rosterMap[game.home_team_id],
        rosterMap[game.away_team_id],
        { homeCourtAdvantage: 1.03 }
      );
      return {
        game,
        result,
        allBoxScores: [
          ...result.homeBoxScores.map(b => mapBoxScore(b, game.home_team_id, game.id)),
          ...result.awayBoxScores.map(b => mapBoxScore(b, game.away_team_id, game.id)),
        ],
      };
    });

    // ── 3. Batch-insert all player_game_stats ────────────────────────────
    const allBoxScores = simResults.flatMap(s => s.allBoxScores);
    const { error: statsError } = await supabaseAdmin.from('player_game_stats').insert(allBoxScores);
    if (statsError) throw new Error(`Failed to insert player stats: ${statsError.message}`);

    // ── 4. Batch-update game records ──────────────────────────────────────
    await Promise.all(
      simResults.map(({ game, result }) =>
        supabaseAdmin
          .from('games')
          .update({ home_score: result.homeScore, away_score: result.awayScore, status: 'completed', played_at: new Date().toISOString() })
          .eq('id', game.id)
      )
    );

    // ── 5. Upsert team season stats ───────────────────────────────────────
    // Accumulate deltas in memory first
    const teamStatDeltas = {};
    for (const { game, result } of simResults) {
      const applyDelta = (teamId, pf, pa, isHome) => {
        if (!teamStatDeltas[teamId]) {
          teamStatDeltas[teamId] = { wins:0, losses:0, points_for:0, points_against:0, home_wins:0, home_losses:0, away_wins:0, away_losses:0 };
        }
        const win = pf > pa;
        const d   = teamStatDeltas[teamId];
        d.wins           += win ? 1 : 0;
        d.losses         += win ? 0 : 1;
        d.points_for     += pf;
        d.points_against += pa;
        if (isHome) { d.home_wins += win ? 1 : 0; d.home_losses += win ? 0 : 1; }
        else        { d.away_wins += win ? 1 : 0; d.away_losses += win ? 0 : 1; }
      };
      applyDelta(game.home_team_id, result.homeScore, result.awayScore, true);
      applyDelta(game.away_team_id, result.awayScore, result.homeScore, false);
    }

    // Fetch current rows once, apply deltas, upsert
    const { data: currentTeamStats } = await supabaseAdmin
      .from('team_season_stats')
      .select('*')
      .eq('season_id', seasonId)
      .in('team_id', Object.keys(teamStatDeltas));

    const teamStatsById = Object.fromEntries((currentTeamStats || []).map(s => [s.team_id, s]));

    // FIX: use onConflict: 'team_id,season_id' (matches the UNIQUE constraint in schema).
    // Do NOT include `id` in the payload — the DB generates it on insert and Supabase
    // uses the unique constraint columns to detect the conflict on updates.
    const teamStatUpserts = Object.entries(teamStatDeltas).map(([teamId, delta]) => {
      const existing = teamStatsById[teamId] || {};
      return {
        team_id:        teamId,
        season_id:      seasonId,
        saved_game_id:  this.savedGameId,
        wins:           (existing.wins           || 0) + delta.wins,
        losses:         (existing.losses         || 0) + delta.losses,
        points_for:     (existing.points_for     || 0) + delta.points_for,
        points_against: (existing.points_against || 0) + delta.points_against,
        home_wins:      (existing.home_wins      || 0) + delta.home_wins,
        home_losses:    (existing.home_losses    || 0) + delta.home_losses,
        away_wins:      (existing.away_wins      || 0) + delta.away_wins,
        away_losses:    (existing.away_losses    || 0) + delta.away_losses,
      };
    });

    const { error: teamUpsertError } = await supabaseAdmin
      .from('team_season_stats')
      .upsert(teamStatUpserts, { onConflict: 'team_id,season_id' });
    if (teamUpsertError) throw new Error(`Failed to upsert team stats: ${teamUpsertError.message}`);

    // ── 6. Upsert player season stats ────────────────────────────────────
    // Accumulate deltas in memory first
    const playerDeltas = {};
    for (const box of allBoxScores) {
      if (!playerDeltas[box.player_id]) {
        playerDeltas[box.player_id] = {
          team_id: box.team_id,
          games_played:0, total_points:0, total_rebounds:0, total_assists:0,
          total_steals:0, total_blocks:0, total_turnovers:0,
          total_fga:0, total_fgm:0, total_fga_3:0, total_fgm_3:0,
          total_fta:0, total_ftm:0, offensive_rebounds:0, defensive_rebounds:0, minutes:0,
        };
      }
      const d = playerDeltas[box.player_id];
      d.games_played       += 1;
      d.total_points       += box.points;
      d.total_rebounds     += box.rebounds;
      d.total_assists      += box.assists;
      d.total_steals       += box.steals;
      d.total_blocks       += box.blocks;
      d.total_turnovers    += box.turnovers;
      d.total_fga          += box.fga;
      d.total_fgm          += box.fgm;
      d.total_fga_3        += box.fga_3;
      d.total_fgm_3        += box.fgm_3;
      d.total_fta          += box.fta;
      d.total_ftm          += box.ftm;
      d.offensive_rebounds += box.offensive_rebounds;
      d.defensive_rebounds += box.defensive_rebounds;
      d.minutes            += box.minutes_played;
    }

    const playerIds = Object.keys(playerDeltas);
    const { data: currentPlayerStats } = await supabaseAdmin
      .from('player_season_stats')
      .select('*')
      .eq('season_id', seasonId)
      .in('player_id', playerIds);

    const playerStatsById = Object.fromEntries((currentPlayerStats || []).map(s => [s.player_id, s]));

    // FIX: use onConflict: 'player_id,season_id' (matches the UNIQUE constraint in schema).
    // Do NOT include `id` — omitting it lets the DB generate a UUID on insert and the
    // unique constraint handles conflict detection on update.
    const playerStatUpserts = playerIds.map(playerId => {
      const delta    = playerDeltas[playerId];
      const existing = playerStatsById[playerId] || {};
      return {
        player_id:          playerId,
        season_id:          seasonId,
        team_id:            delta.team_id,
        saved_game_id:      this.savedGameId,
        games_played:       (existing.games_played       || 0) + delta.games_played,
        total_points:       (existing.total_points       || 0) + delta.total_points,
        total_rebounds:     (existing.total_rebounds     || 0) + delta.total_rebounds,
        total_assists:      (existing.total_assists      || 0) + delta.total_assists,
        total_steals:       (existing.total_steals       || 0) + delta.total_steals,
        total_blocks:       (existing.total_blocks       || 0) + delta.total_blocks,
        total_turnovers:    (existing.total_turnovers    || 0) + delta.total_turnovers,
        total_fga:          (existing.total_fga          || 0) + delta.total_fga,
        total_fgm:          (existing.total_fgm          || 0) + delta.total_fgm,
        total_fga_3:        (existing.total_fga_3        || 0) + delta.total_fga_3,
        total_fgm_3:        (existing.total_fgm_3        || 0) + delta.total_fgm_3,
        total_fta:          (existing.total_fta          || 0) + delta.total_fta,
        total_ftm:          (existing.total_ftm          || 0) + delta.total_ftm,
        offensive_rebounds: (existing.offensive_rebounds || 0) + delta.offensive_rebounds,
        defensive_rebounds: (existing.defensive_rebounds || 0) + delta.defensive_rebounds,
        minutes:            (existing.minutes            || 0) + delta.minutes,
      };
    });

    const BATCH_SIZE = 200;
    for (let i = 0; i < playerStatUpserts.length; i += BATCH_SIZE) {
      const { error: playerUpsertError } = await supabaseAdmin
        .from('player_season_stats')
        .upsert(playerStatUpserts.slice(i, i + BATCH_SIZE), { onConflict: 'player_id,season_id' });
      if (playerUpsertError) throw new Error(`Failed to upsert player season stats: ${playerUpsertError.message}`);
    }

    // ── 7. Update saved_games state ───────────────────────────────────────
    const currentState = await this._getGameState();
    await supabaseAdmin
      .from('saved_games')
      .update({
        game_state: {
          ...currentState,
          last_simulated_week: weekNumber,
          last_simulated_at:   new Date().toISOString(),
        },
      })
      .eq('id', this.savedGameId);

    return {
      seasonComplete: false,
      week: weekNumber,
      games: simResults.map(({ game, result }) => ({
        gameId:        game.id,
        homeScore:     result.homeScore,
        awayScore:     result.awayScore,
        overtime:      result.overtime,
        overtimeCount: result.overtimeCount,
      })),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────

  async _getGameState() {
    const { data, error } = await supabaseAdmin
      .from('saved_games')
      .select('game_state')
      .eq('id', this.savedGameId)
      .single();
    if (error || !data) return {};
    return data.game_state || {};
  }

  async getCurrentSeasonId() {
    const { data: game, error } = await supabaseAdmin
      .from('saved_games')
      .select('game_state')
      .eq('id', this.savedGameId)
      .single();
    if (error) throw new Error(`Failed to get saved game: ${error.message}`);

    const seasonId = game.game_state?.season_id;
    if (seasonId) return seasonId;

    // Fallback: look up the most recent season directly
    const { data: seasons, error: sError } = await supabaseAdmin
      .from('seasons')
      .select('id')
      .eq('saved_game_id', this.savedGameId)
      .order('season_number', { ascending: false })
      .limit(1);
    if (sError || !seasons || seasons.length === 0) {
      throw new Error('No season found for this saved game');
    }
    return seasons[0].id;
  }

  // FIX: was missing `id` in the select, making current.id undefined
  // and causing the subsequent .eq('id', current.id) update to no-op silently.
  async _updateTeamStats(seasonId, teamId, pointsFor, pointsAgainst, isHome) {
    const win = pointsFor > pointsAgainst;

    const { data: current, error } = await supabaseAdmin
      .from('team_season_stats')
      .select('id, wins, losses, points_for, points_against, home_wins, home_losses, away_wins, away_losses')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch team stats: ${error.message}`);
    }

    const stats  = current || { wins:0, losses:0, points_for:0, points_against:0, home_wins:0, home_losses:0, away_wins:0, away_losses:0 };
    const update = {
      wins:           stats.wins           + (win ? 1 : 0),
      losses:         stats.losses         + (win ? 0 : 1),
      points_for:    (stats.points_for     || 0) + pointsFor,
      points_against:(stats.points_against || 0) + pointsAgainst,
    };
    if (isHome) {
      update.home_wins   = (stats.home_wins   || 0) + (win ? 1 : 0);
      update.home_losses = (stats.home_losses || 0) + (win ? 0 : 1);
    } else {
      update.away_wins   = (stats.away_wins   || 0) + (win ? 1 : 0);
      update.away_losses = (stats.away_losses || 0) + (win ? 0 : 1);
    }

    if (current) {
      const { error: updateError } = await supabaseAdmin
        .from('team_season_stats')
        .update(update)
        .eq('id', current.id);  // current.id is now defined (was missing from select before)
      if (updateError) throw new Error(`Failed to update team stats: ${updateError.message}`);
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('team_season_stats')
        .insert({ team_id: teamId, season_id: seasonId, saved_game_id: this.savedGameId, ...update });
      if (insertError) throw new Error(`Failed to insert team stats: ${insertError.message}`);
    }
  }

  async _updatePlayerSeasonStats(seasonId, boxScores) {
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
        games_played:       (existing?.games_played       || 0) + 1,
        total_points:       (existing?.total_points       || 0) + box.points,
        total_rebounds:     (existing?.total_rebounds     || 0) + box.rebounds,
        total_assists:      (existing?.total_assists      || 0) + box.assists,
        total_steals:       (existing?.total_steals       || 0) + box.steals,
        total_blocks:       (existing?.total_blocks       || 0) + box.blocks,
        total_turnovers:    (existing?.total_turnovers    || 0) + box.turnovers,
        total_fga:          (existing?.total_fga          || 0) + box.fga,
        total_fgm:          (existing?.total_fgm          || 0) + box.fgm,
        total_fga_3:        (existing?.total_fga_3        || 0) + box.fga_3,
        total_fgm_3:        (existing?.total_fgm_3        || 0) + box.fgm_3,
        total_fta:          (existing?.total_fta          || 0) + box.fta,
        total_ftm:          (existing?.total_ftm          || 0) + box.ftm,
        offensive_rebounds: (existing?.offensive_rebounds || 0) + (box.offensive_rebounds || 0),
        defensive_rebounds: (existing?.defensive_rebounds || 0) + (box.defensive_rebounds || 0),
        minutes:            (existing?.minutes            || 0) + (box.minutes_played     || 0),
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
            player_id:    box.player_id,
            season_id:    seasonId,
            team_id:      box.team_id,
            saved_game_id: this.savedGameId,
            ...newStats,
          });
        if (insertError) throw new Error(`Failed to insert player stats: ${insertError.message}`);
      }
    }
  }

  // ── Trade ─────────────────────────────────────────────────────────────

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

  // Stub for full season simulation
  async simulateSeason() {
    throw new Error('simulateSeason() is not implemented. Use simulateWeek() instead.');
  }
}

// Expose helpers for testing
LeagueService.generatePlayer          = generatePlayer;
LeagueService.generateRosterForTeam   = generateRosterForTeam;

module.exports = LeagueService;