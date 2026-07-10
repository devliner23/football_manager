// services/freeAgentGenerator.js
//
// Generates realistic free-agent players (team_id = null) for a saved game.
// Stat curves are intentionally softer than team starters (mean ~52 vs ~60)
// to reflect players who went un-drafted or were released by clubs.
//
// Positions are generated in realistic NBA proportions:
//   PG 20% · SG 20% · SF 20% · PF 20% · C 20%  (flat for FA pool)

'use strict';

const { generateTraitCardsForPlayer } = require("./traitCards")



const FIRST_NAMES = [
  'Aaron','Andre','Anthony','Bam','Blake','Bradley','Brian','Carlos',
  'Chris','Cody','Cole','Damion','Darius','David','DeShawn','Devon',
  'Dion','Donovan','Drew','Dylan','Elijah','Eric','Evan','Frank',
  'Gary','Greg','Isaac','Isaiah','Jabari','Jalen','Jamal','James',
  'Javon','Jermaine','Jerome','Jordan','Josh','Justin','Kareem','Keith',
  'Kevin','Lamar','Lance','Leon','Malik','Marcus','Mario','Marquise',
  'Maurice','Michael','Miles','Monte','Nate','Nick','Orlando','Patrick',
  'Quinton','Rasheed','Ray','Reggie','Ricky','Robert','Ron','Ryan',
  'Shawn','Spencer','Terrell','Theo','Tony','Travis','Trevor','Troy',
  'Tyrone','Victor','Will','Xavier','Zach','Zion',
];

const LAST_NAMES = [
  'Adams','Allen','Anderson','Bailey','Baker','Barnes','Bell','Brown',
  'Butler','Carter','Clark','Coleman','Collins','Cook','Cooper','Cox',
  'Cruz','Davis','Diallo','Diop','Edwards','Evans','Foster','Garcia',
  'Gill','Gomez','Gonzalez','Green','Griffin','Hall','Harris','Hayes',
  'Henderson','Hill','Howard','Hughes','Jackson','James','Jenkins',
  'Johnson','Jones','Jordan','King','Lee','Lewis','Long','Lopez',
  'Martin','Martinez','Miller','Mitchell','Moore','Morgan','Morris',
  'Murphy','Nelson','Nguyen','Nichols','Parker','Patterson','Perez',
  'Perry','Phillips','Pierce','Powell','Price','Reed','Richardson',
  'Rivera','Roberts','Robinson','Rogers','Ross','Russell','Sanchez',
  'Sanders','Scott','Smith','Stewart','Taylor','Thomas','Thompson',
  'Torres','Turner','Walker','Ward','Washington','White','Williams',
  'Wilson','Wood','Wright','Young',
];

const POSITIONS = ['PG','SG','SF','PF','C'];

// ── Gaussian helper ───────────────────────────────────────────────────────────

function randNormal(mean, stdDev) {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * stdDev + mean;
}

function clamp(val, min = 25, max = 99) {
  return Math.round(Math.min(max, Math.max(min, val)));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Position-based trait profiles ─────────────────────────────────────────────
// mean / stdDev for each trait, per position.
// FA players sit ~8 pts below team starters on average.

const TRAIT_PROFILES = {
  PG: {
    three_point:       { mean: 54, sd: 12 },
    mid_range:         { mean: 52, sd: 11 },
    inside_scoring:    { mean: 44, sd: 10 },
    passing:           { mean: 62, sd: 10 },
    ball_handling:     { mean: 64, sd: 10 },
    perimeter_defense: { mean: 52, sd: 11 },
    post_defense:      { mean: 38, sd:  9 },
    rebounding:        { mean: 40, sd:  9 },
    speed:             { mean: 62, sd: 10 },
    strength:          { mean: 44, sd:  9 },
  },
  SG: {
    three_point:       { mean: 58, sd: 12 },
    mid_range:         { mean: 56, sd: 11 },
    inside_scoring:    { mean: 48, sd: 10 },
    passing:           { mean: 50, sd: 10 },
    ball_handling:     { mean: 56, sd: 10 },
    perimeter_defense: { mean: 54, sd: 11 },
    post_defense:      { mean: 40, sd:  9 },
    rebounding:        { mean: 43, sd:  9 },
    speed:             { mean: 58, sd: 10 },
    strength:          { mean: 46, sd:  9 },
  },
  SF: {
    three_point:       { mean: 52, sd: 12 },
    mid_range:         { mean: 54, sd: 11 },
    inside_scoring:    { mean: 52, sd: 11 },
    passing:           { mean: 48, sd: 10 },
    ball_handling:     { mean: 50, sd: 10 },
    perimeter_defense: { mean: 54, sd: 11 },
    post_defense:      { mean: 46, sd: 10 },
    rebounding:        { mean: 50, sd: 10 },
    speed:             { mean: 56, sd: 10 },
    strength:          { mean: 52, sd: 10 },
  },
  PF: {
    three_point:       { mean: 42, sd: 12 },
    mid_range:         { mean: 50, sd: 11 },
    inside_scoring:    { mean: 58, sd: 11 },
    passing:           { mean: 44, sd:  9 },
    ball_handling:     { mean: 42, sd:  9 },
    perimeter_defense: { mean: 46, sd: 10 },
    post_defense:      { mean: 56, sd: 11 },
    rebounding:        { mean: 60, sd: 10 },
    speed:             { mean: 48, sd:  9 },
    strength:          { mean: 60, sd: 10 },
  },
  C: {
    three_point:       { mean: 34, sd: 10 },
    mid_range:         { mean: 44, sd: 10 },
    inside_scoring:    { mean: 62, sd: 11 },
    passing:           { mean: 40, sd:  9 },
    ball_handling:     { mean: 36, sd:  8 },
    perimeter_defense: { mean: 40, sd:  9 },
    post_defense:      { mean: 62, sd: 11 },
    rebounding:        { mean: 66, sd: 10 },
    speed:             { mean: 42, sd:  9 },
    strength:          { mean: 66, sd: 10 },
  },
};

// Overall weights (mirrors TeamArchetypeService)
const OVERALL_WEIGHTS = {
  three_point: 0.08, mid_range: 0.07, inside_scoring: 0.12,
  passing: 0.10, ball_handling: 0.10, perimeter_defense: 0.13,
  post_defense: 0.10, rebounding: 0.11, speed: 0.10, strength: 0.09,
};

const POS_OVERRIDES = {
  PG: { ball_handling: 0.14, passing: 0.13, speed: 0.12 },
  SG: { three_point: 0.12, mid_range: 0.10, perimeter_defense: 0.12 },
  SF: { inside_scoring: 0.12, rebounding: 0.11, perimeter_defense: 0.12 },
  PF: { inside_scoring: 0.13, rebounding: 0.14, post_defense: 0.13, strength: 0.11 },
  C:  { inside_scoring: 0.15, rebounding: 0.16, post_defense: 0.15, strength: 0.12 },
};

function calcOverall(traits, position) {
  const weights = { ...OVERALL_WEIGHTS, ...(POS_OVERRIDES[position] || {}) };
  const total   = Object.values(weights).reduce((a, b) => a + b, 0);
  let sum = 0;
  for (const key of Object.keys(traits)) {
    sum += (traits[key] ?? 50) * ((weights[key] ?? 0.1) / total);
  }
  return clamp(Math.round(sum), 40, 99);
}

// ── Physical attributes by position ──────────────────────────────────────────

const PHYSICALS = {
  PG: { height: { mean: 74, sd: 1.5 }, weight: { mean: 185, sd: 12 } },
  SG: { height: { mean: 77, sd: 1.5 }, weight: { mean: 200, sd: 12 } },
  SF: { height: { mean: 79, sd: 1.5 }, weight: { mean: 215, sd: 12 } },
  PF: { height: { mean: 81, sd: 1.5 }, weight: { mean: 230, sd: 12 } },
  C:  { height: { mean: 83, sd: 1.5 }, weight: { mean: 245, sd: 14 } },
};

// ── Single-player generator ───────────────────────────────────────────────────

function generateFreeAgentPlayer(savedGameId, position = null) {
  const pos = position || pick(POSITIONS);
  const profile = TRAIT_PROFILES[pos];
  const phys    = PHYSICALS[pos];

  const traits = {};
  for (const [key, { mean, sd }] of Object.entries(profile)) {
    traits[key] = clamp(randNormal(mean, sd));
  }

  const overall   = calcOverall(traits, pos);
  // Potential: FAs skew older with lower ceiling, but occasionally a hidden gem
  const ageBase   = Math.random() < 0.15 ? randNormal(21, 1.5) : randNormal(27, 3.5);
  const age       = clamp(Math.round(ageBase), 19, 38);
  const potential = clamp(overall + clamp(randNormal(2, 6), -8, 18));
  const traitCards = generateTraitCardsForPlayer({ overall, potential, age });


  return {
    saved_game_id:    savedGameId,
    team_id:          null,          // ← free agent — no team
    first_name:       pick(FIRST_NAMES),
    last_name:        pick(LAST_NAMES),
    position:         pos,
    age,
    height:           clamp(Math.round(randNormal(phys.height.mean, phys.height.sd)), 68, 90),
    weight:           clamp(Math.round(randNormal(phys.weight.mean, phys.weight.sd)), 160, 290),
    overall_rating:   overall,
    potential_rating: potential,
    traits,
  };
}

// ── Batch generator ───────────────────────────────────────────────────────────

/**
 * Generate `count` free-agent players for a saved game.
 * Positions are distributed evenly (count / 5 per slot, remainder spread randomly).
 *
 * @param {string} savedGameId
 * @param {number} count        - total free agents to create (default 75)
 * @returns {Array}             - array of player row objects ready for DB insert
 */
function generateFreeAgentPool(savedGameId, count = 75) {
  const perPos = Math.floor(count / POSITIONS.length);
  const extras = count % POSITIONS.length;

  const players = [];

  for (const pos of POSITIONS) {
    for (let i = 0; i < perPos; i++) {
      players.push(generateFreeAgentPlayer(savedGameId, pos));
    }
  }

  // Fill remainder with random positions
  for (let i = 0; i < extras; i++) {
    players.push(generateFreeAgentPlayer(savedGameId));
  }

  // Shuffle so positions aren't in a predictable block order
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }

  return players;
}

module.exports = { generateFreeAgentPool, generateFreeAgentPlayer };