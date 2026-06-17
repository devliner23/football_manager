// services/LeagueService.js
//
// Owns league creation for a single saved game: reading the static NBA
// team list, creating per-save team rows, generating 15-man rosters with
// an NBA-like talent curve, and seeding season standings.
//
// Game simulation (schedules, box scores, win/loss results) is NOT part
// of this file - simulateSeason() is left as a clearly-marked stub. That
// is a separate engine and deserves its own design pass.

const { supabaseAdmin } = require('../config/supabase');
const NBA_TEAMS = require('../data/teams.json');
const TeamArchetypeService = require('./teamArchetypeService'); // NEW

const ROSTER_SIZE = 15;

/* ----------------------------------------------------------------------
 * 1. TALENT DISTRIBUTION
 * ------------------------------------------------------------------- */

// Box-Muller transform: converts Math.random()'s flat 0-1 distribution
// into a normal (bell-curve) one. A bell curve is "few at the extremes,
// lots in the middle" by definition - exactly the shape NBA talent
// actually takes, so this is the entire trick.
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

// Tune these two constants to reshape the entire league's talent curve.
// With mean 60 / stdDev 11, across a 30-team / 450-player league you get
// roughly: a handful of 90+ superstars, a few dozen 80-89 stars, ~80-100
// good 70-79 starters, ~200 role players in the 55-69 range, and the
// rest as deep bench / fringe roster talent below that.
const TALENT_MEAN = 60;
const TALENT_STDDEV = 11;
const TALENT_MIN = 35;
const TALENT_MAX = 99;

function generateBaseTalent() {
  return clamp(randomGaussian(TALENT_MEAN, TALENT_STDDEV), TALENT_MIN, TALENT_MAX);
}

/* ----------------------------------------------------------------------
 * 2. POSITIONS, PHYSICAL TRAITS, NAMES
 * ------------------------------------------------------------------- */

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// Same base talent, different position, different player. A center and a
// point guard generated from the same underlying talent roll end up
// looking nothing alike - the center trades shooting/handling for size,
// rebounding, and post defense, and vice versa.
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

// Weight scales with where this player's height falls within their
// position's normal range, plus some independent noise so a player isn't
// purely a function of height (some are leaner/bulkier than their height
// alone would suggest).
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
 * 3. SKILL ATTRIBUTES & OVERALL RATING
 * ------------------------------------------------------------------- */

const ATTRIBUTE_KEYS = [
  'threePoint', 'midRange', 'insideScoring', 'passing', 'ballHandling',
  'perimeterDefense', 'postDefense', 'rebounding', 'speed', 'strength',
];

// How much each attribute counts toward "overall" for a given position -
// a center's rebounding matters far more to their overall than a point
// guard's does. Weights don't need to sum to anything specific; they're
// normalized inside calculateOverall.
const OVERALL_WEIGHTS = {
  PG: { threePoint: 1, midRange: 1, insideScoring: 0.5, passing: 2, ballHandling: 1.5, perimeterDefense: 1, postDefense: 0.3, rebounding: 0.4, speed: 1.2, strength: 0.5 },
  SG: { threePoint: 1.5, midRange: 1.3, insideScoring: 0.8, passing: 1, ballHandling: 1.2, perimeterDefense: 1, postDefense: 0.4, rebounding: 0.5, speed: 1, strength: 0.6 },
  SF: { threePoint: 1.1, midRange: 1.1, insideScoring: 1.1, passing: 0.9, ballHandling: 0.9, perimeterDefense: 1, postDefense: 0.8, rebounding: 0.9, speed: 0.9, strength: 0.9 },
  PF: { threePoint: 0.6, midRange: 0.9, insideScoring: 1.3, passing: 0.6, ballHandling: 0.5, perimeterDefense: 0.7, postDefense: 1.3, rebounding: 1.4, speed: 0.6, strength: 1.2 },
  C: { threePoint: 0.3, midRange: 0.6, insideScoring: 1.4, passing: 0.5, ballHandling: 0.3, perimeterDefense: 0.5, postDefense: 1.6, rebounding: 1.7, speed: 0.5, strength: 1.4 },
};

// Individual attributes get their own noise on top of base talent + the
// position modifier - this is what makes a 70-overall player a great
// shooter but a poor defender instead of a flat "70 at everything" robot.
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

// Younger players get more potential headroom above their current
// overall; players past their late 20s are generally close to their
// ceiling already.
function generatePotential(overall, age) {
  const yearsOfUpside = Math.max(0, 27 - age);
  const upside = randomGaussian(yearsOfUpside * 1.5, 4);
  return clamp(overall + Math.max(0, upside), overall, 99);
}

/* ----------------------------------------------------------------------
 * 4. PLAYER + ROSTER GENERATION (pure - no DB access)
 * ------------------------------------------------------------------- */

function generatePlayer(teamId, position, archetypeId = null) {
  const talentCurve = TeamArchetypeService.getTalentCurve(archetypeId);
  const baseTalent = clamp(
    randomGaussian(talentCurve.mean, talentCurve.stdDev),
    TALENT_MIN,
    TALENT_MAX
  );
  
  // Generate initial attributes
  let attributes = generateAttributes(baseTalent, position);
  
  // Apply archetype modifiers if present
  if (archetypeId) {
    attributes = TeamArchetypeService.applyAttributeModifiers(position, attributes, archetypeId);
  }
  
  const overall = calculateOverall(attributes, position);
  
  // Handle archetype age range
  let age = generateAge();
  const ageRange = TeamArchetypeService.getAgeRange(archetypeId);
  if (ageRange) {
    age = Math.round(ageRange[0] + Math.random() * (ageRange[1] - ageRange[0]));
  }
  
  const heightInches = generateHeightInches(position);
  
  // Handle archetype height modifier
  const heightMod = TeamArchetypeService.getHeightModifier(archetypeId);
  const finalHeight = Math.min(90, heightInches + heightMod);
  
  // Calculate potential with archetype boost
  const potentialBoost = TeamArchetypeService.getPotentialBoost(archetypeId);
  let potential = generatePotential(overall, age);
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

// Modified to use archetype-based position distribution
function generateRosterForTeam(teamId, rosterSize = ROSTER_SIZE, archetypeId = null) {
  const positions = TeamArchetypeService.generatePositionDistribution(archetypeId, rosterSize);
  return positions.map((position) => generatePlayer(teamId, position, archetypeId));
}

// Modified to accept archetype in player row mapping
function toPlayerRow(player, team, index, season) {
  const nameParts = player.name.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || firstName;

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

// 15 players split into 3 per position by default (PG/SG/SF/PF/C) so every
// team can field a full lineup plus bench depth at each spot.
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

// Maps generated player data to the live `players` table shape. Skill
// attributes are stored in `traits` JSON because the DB uses the older
// playerGenerator column layout (first_name, overall_rating, etc.).
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
 * 5. LEAGUE SERVICE - scoped to one saved game
 * ------------------------------------------------------------------- */

class LeagueService {
  constructor(savedGameId) {
    if (!savedGameId) throw new Error('LeagueService requires a savedGameId');
    this.savedGameId = savedGameId;
  }

  // Returns the teams already created for this saved game (empty array if
  // the league hasn't been initialized yet).
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
    return data;
  }

  // Inserts one row per NBA_TEAMS entry, scoped to this saved game.
  async createTeams() {
    const rows = NBA_TEAMS.map((team) => ({
      saved_game_id: this.savedGameId,
      // Stable franchise key; matches saved_games.managed_club_id from the UI.
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

  // Generates and inserts a full roster for every team passed in.
  async createRosters(teams, season = 1, rosterSize = ROSTER_SIZE, teamArchetypes = {}) {
    const rows = teams.flatMap((team) => {
      // Get archetype for this team (if specified)
      const archetypeId = teamArchetypes[team.team_id] || null;
      
      return generateRosterForTeam(team.id, rosterSize, archetypeId).map((player, index) =>
        toPlayerRow({ ...player, savedGameId: this.savedGameId }, team, index, season)
      );
    });

    const { data, error } = await supabaseAdmin.from('players').insert(rows).select();
    if (error) throw new Error(`Failed to create players: ${error.message}`);
    return data;
  }


  // Seeds a 0-0 standings row per team so the standings endpoint has
  // something to return as soon as the league exists.
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

  // Deletes the teams created for this saved game. teams.id cascades to
  // players and team_season_stats (ON DELETE CASCADE in the schema), so
  // this one call cleans up everything from a failed initialization.
  async rollbackLeague() {
    await supabaseAdmin.from('teams').delete().eq('saved_game_id', this.savedGameId);
  }

  // Creates the 30 teams, generates a 15-man roster for each, and seeds
  // season standings. Throws if this saved game already has a league, and
  // rolls back partial writes if any step fails partway through.
  async initializeLeague(season = 1, teamArchetypes = {}) {
    const existingTeams = await this.getTeams();
    if (existingTeams.length > 0) {
      throw new Error(`League already initialized for saved game ${this.savedGameId}`);
    }

    let teams;
    try {
      teams = await this.createTeams();
      const players = await this.createRosters(teams, season, ROSTER_SIZE, teamArchetypes);
      await this.createSeasonStats(teams, season);

      // Store archetype choices in saved_game metadata
      await supabaseAdmin
        .from('saved_games')
        .update({
          game_state: {
            team_archetypes: teamArchetypes,
            initialized_at: new Date().toISOString(),
          }
        })
        .eq('id', this.savedGameId);

      return {
        season,
        teamsCreated: teams.length,
        playersCreated: players.length,
        archetypesUsed: Object.keys(teamArchetypes).length,
      };
    } catch (err) {
      if (teams) await this.rollbackLeague();
      throw err;
    }
  }

  // Trades are simple once team_id is a foreign key - just repoint it.
  // Validates the destination team belongs to this same saved game so a
  // bad call can't reassign a player into a different save's league.
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

  // Not implemented here - schedules, game results, and stat tracking are
  // a separate system from league/roster generation.
  async simulateSeason() {
    throw new Error(
      'simulateSeason() is not implemented yet. Game simulation (schedules, results, stat tracking) is a separate feature from league initialization.'
    );
  }
}

// Pure generation helpers exposed as static properties for unit testing
// without touching the database.
LeagueService.generatePlayer = generatePlayer;
LeagueService.generateRosterForTeam = generateRosterForTeam;

module.exports = LeagueService;