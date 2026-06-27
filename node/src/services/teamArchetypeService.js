// services/teamArchetypeService.js

/**
 * Team Archetype Service - Provides strategic team-building presets
 * that influence player generation and roster composition.
 *
 * Each archetype modifies the talent distribution and position weighting
 * to create distinct team identities (3&D, Post-heavy, Small Ball, etc.)
 *
 * NOTE ON NAMING CONVENTION
 * ─────────────────────────
 * The archetype modifier keys are camelCase (e.g. threePoint, perimeterDefense)
 * because they mirror the DB column names after camelCase → snake_case conversion.
 * `applyAttributeModifiers` converts them automatically, so callers can pass the
 * raw player `traits` object (snake_case keys) directly.
 */

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

const BASE_POSITION_WEIGHTS = {
  PG: 3,
  SG: 3,
  SF: 3,
  PF: 3,
  C:  3,
};

// ── camelCase → snake_case helper ────────────────────────────────────────────
function camelToSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// Explicit map for all modifier keys used in TEAM_ARCHETYPES below
// (covers cases where the automatic conversion matches, listed for clarity)
const MODIFIER_TO_TRAIT = {
  threePoint:       'three_point',
  midRange:         'mid_range',
  insideScoring:    'inside_scoring',
  passing:          'passing',
  ballHandling:     'ball_handling',
  perimeterDefense: 'perimeter_defense',
  postDefense:      'post_defense',
  rebounding:       'rebounding',
  speed:            'speed',
  strength:         'strength',
  // special keys that are NOT trait columns – skip these
  heightBoost:      null,
  maxHeight:        null,
};

function resolveTraitKey(modifierKey) {
  if (modifierKey in MODIFIER_TO_TRAIT) return MODIFIER_TO_TRAIT[modifierKey];
  // Fallback: automatic camelCase → snake_case
  return camelToSnake(modifierKey);
}

// ── Archetype definitions ─────────────────────────────────────────────────────

const TEAM_ARCHETYPES = {
  '3-and-D': {
    id:          '3-and-D',
    label:       '3&D Specialists',
    description: 'Elite three-point shooting and perimeter defense. Great spacing, but weak inside.',
    icon:        '🎯',
    positionModifiers: {
      PG: { threePoint: 8,  perimeterDefense: 6,  insideScoring: -5 },
      SG: { threePoint: 10, perimeterDefense: 8,  insideScoring: -6 },
      SF: { threePoint: 8,  perimeterDefense: 8,  insideScoring: -4 },
      PF: { threePoint: 6,  perimeterDefense: 6,  insideScoring: -2 },
      C:  { threePoint: 4,  perimeterDefense: 4,  insideScoring: -2 },
    },
    positionWeights: { PG: 2, SG: 4, SF: 3, PF: 3, C: 3 },
    talentCurve: { mean: 58, stdDev: 10 },
    minThreePoint:       40,
    minPerimeterDefense: 35,
  },

  'post-heavy': {
    id:          'post-heavy',
    label:       'Post Heavy',
    description: 'Dominant inside scoring and rebounding. Old-school basketball with big men.',
    icon:        '🏋️',
    positionModifiers: {
      PG: { insideScoring:  -2, passing: -2, rebounding:  2 },
      SG: { insideScoring:   0, passing: -3, rebounding:  3 },
      SF: { insideScoring:   3, passing: -2, rebounding:  4 },
      PF: { insideScoring:   8, postDefense: 8, rebounding: 10, threePoint: -8 },
      C:  { insideScoring:  10, postDefense: 10, rebounding: 12, threePoint: -10 },
    },
    positionWeights: { PG: 2, SG: 2, SF: 3, PF: 4, C: 4 },
    talentCurve: { mean: 58, stdDev: 12 },
    minInsideScoring: 40,
    minRebounding:    35,
  },

  'small-ball': {
    id:          'small-ball',
    label:       'Small Ball',
    description: 'Small, fast, and skilled. Positionless basketball with elite shooting and speed.',
    icon:        '⚡',
    positionModifiers: {
      PG: { speed: 8,  ballHandling: 6, threePoint: 4 },
      SG: { speed: 10, ballHandling: 5, threePoint: 6 },
      SF: { speed: 8,  ballHandling: 4, threePoint: 6, rebounding: -4 },
      PF: { speed: 6,  ballHandling: 3, threePoint: 4, rebounding: -8, postDefense: -6 },
      C:  { speed: 4,  ballHandling: 2, threePoint: 3, rebounding: -10, postDefense: -8 },
    },
    positionWeights: { PG: 3, SG: 3, SF: 4, PF: 3, C: 2 },
    talentCurve: { mean: 59, stdDev: 11 },
  },

  'defensive-minded': {
    id:          'defensive-minded',
    label:       'Defensive Minded',
    description: 'Lockdown defenders at every position. Wins through defense and grit.',
    icon:        '🔒',
    positionModifiers: {
      PG: { perimeterDefense: 10, postDefense: 2,  threePoint: -4 },
      SG: { perimeterDefense: 12, postDefense: 3,  threePoint: -5 },
      SF: { perimeterDefense: 10, postDefense: 5,  threePoint: -4 },
      PF: { postDefense: 10, perimeterDefense: 4,  insideScoring: -2 },
      C:  { postDefense: 12, perimeterDefense: 2,  insideScoring: -2 },
    },
    positionWeights: { PG: 3, SG: 3, SF: 3, PF: 3, C: 3 },
    talentCurve: { mean: 57, stdDev: 13 },
    minPerimeterDefense: 35,
    minPostDefense:      35,
  },

  'run-and-gun': {
    id:          'run-and-gun',
    label:       'Run & Gun',
    description: 'Fast-paced offense with elite playmaking and shooting. Scores in bunches.',
    icon:        '🏃',
    positionModifiers: {
      PG: { speed: 10, ballHandling: 8, passing: 6, threePoint: 4 },
      SG: { speed: 10, ballHandling: 6, passing: 4, threePoint: 6 },
      SF: { speed: 8,  ballHandling: 4, passing: 3, threePoint: 4 },
      PF: { speed: 6,  ballHandling: 2, passing: 2, threePoint: 2 },
      C:  { speed: 4,  ballHandling: 1, passing: 1 },
    },
    positionWeights: { PG: 4, SG: 3, SF: 3, PF: 3, C: 2 },
    talentCurve: { mean: 58, stdDev: 10 },
    minSpeed: 35,
  },

  'inside-out': {
    id:          'inside-out',
    label:       'Inside-Out',
    description: 'Balanced attack with both post presence and perimeter shooting.',
    icon:        '🔄',
    positionModifiers: {
      PG: { threePoint: 4,  ballHandling: 4,   insideScoring: -2 },
      SG: { threePoint: 4,  midRange: 4,        insideScoring: -2 },
      SF: { threePoint: 3,  midRange: 3,        insideScoring:  2 },
      PF: { threePoint: 2,  midRange: 2,        insideScoring:  6, postDefense: 4 },
      C:  { threePoint: 1,  midRange: 1,        insideScoring:  8, postDefense: 6 },
    },
    positionWeights: { PG: 3, SG: 3, SF: 3, PF: 3, C: 3 },
    talentCurve: { mean: 60, stdDev: 11 },
  },

  'youth-movement': {
    id:          'youth-movement',
    label:       'Youth Movement',
    description: 'Young, athletic team with high potential. Building for the future.',
    icon:        '🌟',
    positionModifiers: {
      PG: { speed: 6,  ballHandling: 4, threePoint: 2 },
      SG: { speed: 6,  ballHandling: 3, threePoint: 3 },
      SF: { speed: 6,  ballHandling: 2, threePoint: 2 },
      PF: { speed: 4,  ballHandling: 2, threePoint: 1 },
      C:  { speed: 3,  ballHandling: 1, threePoint: 1 },
    },
    positionWeights: { PG: 3, SG: 3, SF: 3, PF: 3, C: 3 },
    talentCurve: { mean: 56, stdDev: 14 },
    ageRange:      [19, 24],
    potentialBoost: 8,
  },

  'veteran-leadership': {
    id:          'veteran-leadership',
    label:       'Veteran Leadership',
    description: 'Experienced, high-IQ team. Knows how to win but limited athleticism.',
    icon:        '👴',
    positionModifiers: {
      PG: { passing: 6,  ballHandling: 4, threePoint: 2, speed: -4 },
      SG: { passing: 4,  ballHandling: 3, threePoint: 3, speed: -4 },
      SF: { passing: 3,  ballHandling: 2, threePoint: 2, speed: -4 },
      PF: { passing: 2,  ballHandling: 1, threePoint: 1, speed: -4 },
      C:  { passing: 2,  ballHandling: 1, threePoint: 1, speed: -4 },
    },
    positionWeights: { PG: 3, SG: 3, SF: 3, PF: 3, C: 3 },
    talentCurve: { mean: 61, stdDev: 9 },
    ageRange:      [28, 35],
    potentialBoost: -5,
  },

  'pace-and-space': {
    id:          'pace-and-space',
    label:       'Pace & Space',
    description: 'Modern NBA style. Shooters everywhere, elite ball movement.',
    icon:        '🌌',
    positionModifiers: {
      PG: { threePoint: 6,  passing: 6, ballHandling: 4, insideScoring: -4 },
      SG: { threePoint: 8,  passing: 4, ballHandling: 3, insideScoring: -5 },
      SF: { threePoint: 6,  passing: 3, ballHandling: 2, insideScoring: -3 },
      PF: { threePoint: 5,  passing: 2, ballHandling: 1, insideScoring: -3, rebounding: -3 },
      C:  { threePoint: 4,  passing: 2, ballHandling: 1, insideScoring: -2, rebounding: -3 },
    },
    positionWeights: { PG: 3, SG: 3, SF: 3, PF: 4, C: 2 },
    talentCurve: { mean: 59, stdDev: 10 },
    minThreePoint: 35,
  },

  'grit-and-grind': {
    id:          'grit-and-grind',
    label:       'Grit & Grind',
    description: 'Physical, defensive-minded team. Wins through toughness and rebounding.',
    icon:        '💪',
    positionModifiers: {
      PG: { postDefense: 3,  strength: 4, perimeterDefense: 4,  threePoint: -4 },
      SG: { postDefense: 3,  strength: 4, perimeterDefense: 6,  threePoint: -5 },
      SF: { postDefense: 4,  strength: 5, perimeterDefense: 4,  threePoint: -3 },
      PF: { postDefense: 8,  strength: 8, rebounding: 6,         threePoint: -6 },
      C:  { postDefense: 10, strength: 10, rebounding: 8,        threePoint: -8 },
    },
    positionWeights: { PG: 2, SG: 2, SF: 3, PF: 4, C: 4 },
    talentCurve: { mean: 57, stdDev: 12 },
    minStrength:   35,
    minRebounding: 35,
  },

  'positionless': {
    id:          'positionless',
    label:       'Positionless Basketball',
    description: 'Versatile players who can switch everything. Height and length at every spot.',
    icon:        '♾️',
    positionModifiers: {
      PG: { perimeterDefense: 4, ballHandling: 2, heightBoost: 4 },
      SG: { perimeterDefense: 4, ballHandling: 2, heightBoost: 3 },
      SF: { perimeterDefense: 3, ballHandling: 2, heightBoost: 2 },
      PF: { perimeterDefense: 3, ballHandling: 1, heightBoost: 2 },
      C:  { perimeterDefense: 2, ballHandling: 1, heightBoost: 1 },
    },
    positionWeights: { PG: 2, SG: 3, SF: 4, PF: 3, C: 3 },
    talentCurve: { mean: 59, stdDev: 11 },
    heightModifier: 3,
  },
};

// ── Trait columns in the players table ───────────────────────────────────────
const TRAIT_KEYS = [
  'three_point', 'mid_range', 'inside_scoring', 'passing',
  'ball_handling', 'perimeter_defense', 'post_defense',
  'rebounding', 'speed', 'strength',
];

// Weights for overall_rating recalculation (must sum to 1.0)
const OVERALL_WEIGHTS = {
  three_point:       0.08,
  mid_range:         0.07,
  inside_scoring:    0.12,
  passing:           0.10,
  ball_handling:     0.10,
  perimeter_defense: 0.13,
  post_defense:      0.10,
  rebounding:        0.11,
  speed:             0.10,
  strength:          0.09,
};

// ── Service class ─────────────────────────────────────────────────────────────

class TeamArchetypeService {

  /** Return every archetype as an array. */
  static getArchetypes() {
    return Object.values(TEAM_ARCHETYPES);
  }

  /** Return a single archetype by ID, or null. */
  static getArchetype(archetypeId) {
    return TEAM_ARCHETYPES[archetypeId] || null;
  }

  /** Return position weights, merged with defaults so all five positions are always present. */
  static getPositionWeights(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return { ...BASE_POSITION_WEIGHTS };
    return { ...BASE_POSITION_WEIGHTS, ...(archetype.positionWeights || {}) };
  }

  /** Return the talent-curve parameters for player generation. */
  static getTalentCurve(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    return archetype?.talentCurve || { mean: 60, stdDev: 11 };
  }

  /**
   * Apply an archetype's per-position modifiers to a player's trait object.
   *
   * @param {string} position   - 'PG' | 'SG' | 'SF' | 'PF' | 'C'
   * @param {Object} traits     - snake_case trait object from the players table
   * @param {string} archetypeId
   * @returns {Object} modified traits (new object, original is not mutated)
   */
  static applyAttributeModifiers(position, traits, archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return { ...traits };

    const modifiers = archetype.positionModifiers?.[position];
    if (!modifiers) return { ...traits };

    const modified = { ...traits };

    for (const [modKey, delta] of Object.entries(modifiers)) {
      const traitKey = resolveTraitKey(modKey);
      // Skip non-trait keys (heightBoost, maxHeight, etc.)
      if (!traitKey || !TRAIT_KEYS.includes(traitKey)) continue;
      modified[traitKey] = Math.max(25, Math.min(99, (modified[traitKey] ?? 50) + delta));
    }

    return modified;
  }

  /**
   * Recalculate overall_rating from a (potentially modified) traits object.
   * Uses position-adjusted weights so big-man traits matter more for C/PF, etc.
   *
   * @param {Object} traits   - snake_case trait object
   * @param {string} position
   * @returns {number} 40–99
   */
  static recalculateOverall(traits, position) {
    // Position-specific weight overrides
    const posOverrides = {
      PG: { ball_handling: 0.14, passing: 0.13, speed: 0.12 },
      SG: { three_point: 0.12,   mid_range: 0.10, perimeter_defense: 0.12 },
      SF: { inside_scoring: 0.12, rebounding: 0.11, perimeter_defense: 0.12 },
      PF: { inside_scoring: 0.13, rebounding: 0.14, post_defense: 0.13, strength: 0.11 },
      C:  { inside_scoring: 0.15, rebounding: 0.16, post_defense: 0.15, strength: 0.12 },
    };

    const weights = { ...OVERALL_WEIGHTS, ...(posOverrides[position] || {}) };

    // Normalise weights so they sum to 1
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let weightedSum = 0;
    for (const key of TRAIT_KEYS) {
      weightedSum += ((traits[key] ?? 50) * (weights[key] ?? 0.1)) / total;
    }

    return Math.round(Math.min(99, Math.max(40, weightedSum)));
  }

  /**
   * Apply archetype modifiers to a player and return an updated player object.
   * This is the main helper called by LeagueService.createRosters().
   *
   * @param {Object} player       - full DB player row (must have .traits and .position)
   * @param {string} archetypeId
   * @returns {Object} updated player
   */
  static applyToPlayer(player, archetypeId) {
    if (!archetypeId) return player;

    const modifiedTraits = this.applyAttributeModifiers(
      player.position,
      player.traits || {},
      archetypeId
    );

    const newOverall = this.recalculateOverall(modifiedTraits, player.position);

    // Age / potential modifiers
    const archetype = this.getArchetype(archetypeId);
    let age              = player.age;
    let potential_rating = player.potential_rating;

    if (archetype?.ageRange) {
      const [minAge, maxAge] = archetype.ageRange;
      age = Math.max(minAge, Math.min(maxAge, age));
    }
    if (archetype?.potentialBoost) {
      potential_rating = Math.max(40, Math.min(99, potential_rating + archetype.potentialBoost));
    }

    return {
      ...player,
      traits:           modifiedTraits,
      overall_rating:   newOverall,
      potential_rating,
      age,
    };
  }

  // ── Position distribution ──────────────────────────────────────────────────

  /** Generate an array of positions for a full roster, respecting archetype weights. */
  static generatePositionDistribution(archetypeId, rosterSize = 15) {
    const weights = this.getPositionWeights(archetypeId);
    const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);

    const counts = {};
    let remaining = rosterSize;

    // First pass: floor counts
    for (const pos of POSITIONS) {
      const exact = ((weights[pos] || 0) / totalWeight) * rosterSize;
      counts[pos] = Math.floor(exact);
      remaining  -= counts[pos];
    }

    // Second pass: distribute leftover slots by fractional remainder
    const fractions = POSITIONS
      .map(pos => {
        const exact = ((weights[pos] || 0) / totalWeight) * rosterSize;
        return { pos, frac: exact - Math.floor(exact) };
      })
      .sort((a, b) => b.frac - a.frac);

    for (let i = 0; i < remaining; i++) {
      counts[fractions[i % fractions.length].pos]++;
    }

    // Build & shuffle
    const positions = [];
    for (const pos of POSITIONS) {
      for (let i = 0; i < (counts[pos] || 0); i++) positions.push(pos);
    }
    while (positions.length < rosterSize) {
      positions.push(POSITIONS[positions.length % POSITIONS.length]);
    }

    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    return positions;
  }

  // ── Metadata helpers ───────────────────────────────────────────────────────

  static getAgeRange(archetypeId)      { return this.getArchetype(archetypeId)?.ageRange      || null; }
  static getPotentialBoost(archetypeId){ return this.getArchetype(archetypeId)?.potentialBoost || 0;    }
  static getHeightModifier(archetypeId){ return this.getArchetype(archetypeId)?.heightModifier || 0;    }
  static isValidArchetype(archetypeId) { return !!TEAM_ARCHETYPES[archetypeId]; }

  static getRandomArchetype() {
    const keys = Object.keys(TEAM_ARCHETYPES);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  /** Returns the full metadata block used by the frontend + leagueController. */
  static getArchetypeMetadata(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return null;
    return {
      id:          archetype.id,
      label:       archetype.label,
      description: archetype.description,
      icon:        archetype.icon,
      strengths:   this._getArchetypeStrengths(archetype),
      weaknesses:  this._getArchetypeWeaknesses(archetype),
    };
  }

  static _getArchetypeStrengths(archetype) {
    const strengths = [];
    if (archetype.minThreePoint)       strengths.push('Three-Point Shooting');
    if (archetype.minPerimeterDefense) strengths.push('Perimeter Defense');
    if (archetype.minRebounding)       strengths.push('Rebounding');
    if (archetype.minInsideScoring)    strengths.push('Inside Scoring');
    if (archetype.minStrength)         strengths.push('Physicality');
    if (archetype.minSpeed)            strengths.push('Speed');
    if (archetype.minPostDefense)      strengths.push('Post Defense');

    const w = archetype.positionWeights || {};
    if ((w.PG || 0) > 3)  strengths.push('Guard Play');
    if ((w.C  || 0) > 3)  strengths.push('Frontcourt Size');
    if ((w.SG || 0) > 3)  strengths.push('Wing Depth');

    return strengths.length > 0 ? strengths : ['Versatile'];
  }

  static _getArchetypeWeaknesses(archetype) {
    const weaknesses = [];
    const modifiers  = archetype.positionModifiers || {};

    for (const pos of Object.keys(modifiers)) {
      for (const [key, value] of Object.entries(modifiers[pos])) {
        if (value < -3) {
          const label = key.replace(/([A-Z])/g, ' $1').trim();
          if (!weaknesses.includes(label)) weaknesses.push(label);
        }
      }
    }

    return weaknesses.length > 0 ? weaknesses.slice(0, 3) : ['Balanced Roster'];
  }
}

module.exports = TeamArchetypeService;