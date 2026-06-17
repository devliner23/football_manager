// leagueService.js
//
// Generates full 15-man rosters for every team in the league, with talent
// distributed the way real basketball talent is: a normal (bell curve)
// distribution naturally produces a small handful of superstars, a wider
// band of stars/good starters, and a large mass of role players and deep
// bench guys - no special-casing needed, that's just what a bell curve
// looks like when you slice it into tiers.
//
// ASSUMPTIONS - adjust these to match your actual project:
//   - PostgreSQL access via `pg` (node-postgres). If you're on
//     Sequelize/Knex/Prisma instead, swap out section 5 (PERSISTENCE) -
//     everything above it (the actual generation logic) is plain JS and
//     doesn't care how you save it.
//   - A `teams` table already exists with an `id` primary key.
//   - A `players` table exists (or will - see players_schema.sql) with a
//     `team_id` column that's a foreign key to teams.id. That FK is the
//     thing that makes trades trivial: a trade is just one UPDATE.
//   - CommonJS modules (require/module.exports). Say the word if your
//     project uses ESM (import/export) instead.

const { Pool } = require('pg');

// Lazily-created pool so this file doesn't force its own DB connection if
// you'd rather inject a pool/client you already have configured elsewhere
// (e.g. a shared db.js). Every persistence function below accepts an
// optional `db` argument for exactly that reason.
let defaultPool = null;
function getDefaultPool() {
  if (!defaultPool) defaultPool = new Pool(); // reads PG* env vars
  return defaultPool;
}

/* ----------------------------------------------------------------------
 * 1. TALENT DISTRIBUTION
 * ------------------------------------------------------------------- */

// Box-Muller transform: converts Math.random()'s flat 0-1 distribution
// into a normal (bell-curve) one. This is the entire trick - a bell curve
// is "few at the extremes, lots in the middle" by definition, which is
// exactly the shape NBA talent actually takes.
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
// roughly:
//   90+   overall -> a handful of players        (superstars)
//   80-89 overall -> a few dozen                 (stars / all-stars)
//   70-79 overall -> ~80-100                      (good starters)
//   55-69 overall -> ~200                          (role players / rotation)
//   <55   overall -> the rest                      (deep bench / fringe)
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

function generateHeightInches(position) {
  const [min, max] = HEIGHT_RANGES_INCHES[position];
  return Math.round(min + Math.random() * (max - min));
}

function generateWeightLbs(heightInches, position) {
  const base = (heightInches - 60) * 6.5;
  const positionBulk = { PG: 0, SG: 5, SF: 10, PF: 20, C: 30 }[position];
  return clamp(base + positionBulk + randomGaussian(0, 8), 160, 290);
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
 * 4. PLAYER + ROSTER GENERATION
 * ------------------------------------------------------------------- */

function generatePlayer(teamId, position) {
  const baseTalent = generateBaseTalent();
  const attributes = generateAttributes(baseTalent, position);
  const overall = calculateOverall(attributes, position);
  const age = generateAge();
  const heightInches = generateHeightInches(position);

  return {
    teamId,
    name: generateName(),
    position,
    age,
    heightInches,
    weightLbs: generateWeightLbs(heightInches, position),
    overall,
    potential: generatePotential(overall, age),
    ...attributes,
  };
}

// 15 players split into 3 per position by default (PG/SG/SF/PF/C) so every
// team can actually field a full lineup plus bench depth at each spot.
function generateRosterPositions(rosterSize = 15) {
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

function generateRosterForTeam(teamId, rosterSize = 15) {
  return generateRosterPositions(rosterSize).map((position) => generatePlayer(teamId, position));
}

function generateLeague(teamIds, rosterSize = 15) {
  return teamIds.flatMap((teamId) => generateRosterForTeam(teamId, rosterSize));
}

/* ----------------------------------------------------------------------
 * 5. PERSISTENCE (PostgreSQL via `pg`)
 * ------------------------------------------------------------------- */

const PLAYER_COLUMNS = [
  'team_id', 'name', 'position', 'age', 'height_inches', 'weight_lbs',
  'overall', 'potential', 'three_point', 'mid_range', 'inside_scoring',
  'passing', 'ball_handling', 'perimeter_defense', 'post_defense',
  'rebounding', 'speed', 'strength',
];

function playerToRow(player) {
  return [
    player.teamId, player.name, player.position, player.age, player.heightInches,
    player.weightLbs, player.overall, player.potential, player.threePoint,
    player.midRange, player.insideScoring, player.passing, player.ballHandling,
    player.perimeterDefense, player.postDefense, player.rebounding, player.speed,
    player.strength,
  ];
}

// Bulk-inserts an array of generated players in a single statement.
async function insertPlayers(players, db = getDefaultPool()) {
  if (players.length === 0) return [];

  const valuesSql = [];
  const params = [];
  players.forEach((player, i) => {
    const row = playerToRow(player);
    const placeholders = row.map((_, j) => `$${i * row.length + j + 1}`);
    valuesSql.push(`(${placeholders.join(', ')})`);
    params.push(...row);
  });

  const query = `
    INSERT INTO players (${PLAYER_COLUMNS.join(', ')})
    VALUES ${valuesSql.join(', ')}
    RETURNING *;
  `;

  const result = await db.query(query, params);
  return result.rows;
}

// Generates and saves a full roster for every team ID provided, wrapped
// in a transaction so a failure partway through doesn't leave some teams
// rostered and others not.
async function generateAndSaveLeague(teamIds, rosterSize = 15) {
  const pool = getDefaultPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saved = [];
    // Inserted per-team rather than as one giant statement - keeps each
    // query well under Postgres's bound-parameter limit and means one
    // bad team's data doesn't blow up the whole batch's query string.
    for (const teamId of teamIds) {
      const roster = generateRosterForTeam(teamId, rosterSize);
      saved.push(...(await insertPlayers(roster, client)));
    }
    await client.query('COMMIT');
    return saved;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Convenience wrapper for "start a new league": pulls every team ID from
// the teams table, then generates + saves a roster for each one.
async function generateAndSaveFullLeague(rosterSize = 15) {
  const pool = getDefaultPool();
  const { rows } = await pool.query('SELECT id FROM teams ORDER BY id;');
  return generateAndSaveLeague(rows.map((r) => r.id), rosterSize);
}

// Trades are trivial once team_id is a foreign key - it's just an UPDATE.
async function tradePlayer(playerId, newTeamId, db = getDefaultPool()) {
  const { rows } = await db.query(
    'UPDATE players SET team_id = $1 WHERE id = $2 RETURNING *;',
    [newTeamId, playerId]
  );
  return rows[0] || null;
}

async function getRosterForTeam(teamId, db = getDefaultPool()) {
  const { rows } = await db.query(
    'SELECT * FROM players WHERE team_id = $1 ORDER BY overall DESC;',
    [teamId]
  );
  return rows;
}

module.exports = {
  // generation (pure, no DB)
  generatePlayer,
  generateRosterForTeam,
  generateLeague,
  // persistence
  generateAndSaveLeague,
  generateAndSaveFullLeague,
  tradePlayer,
  getRosterForTeam,
  insertPlayers,
};