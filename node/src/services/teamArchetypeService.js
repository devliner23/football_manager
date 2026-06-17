// services/teamArchetypeService.js

/**
 * Team Archetype Service - Provides strategic team-building presets
 * that influence player generation and roster composition.
 * 
 * Each archetype modifies the talent distribution and position weighting
 * to create distinct team identities (3&D, Post-heavy, Small Ball, etc.)
 */

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// Base position weights for roster composition (how many of each position)
const BASE_POSITION_WEIGHTS = {
  PG: 3,
  SG: 3,
  SF: 3,
  PF: 3,
  C: 3,
};

// Archetype definitions with their modifiers
const TEAM_ARCHETYPES = {
  '3-and-D': {
    id: '3-and-D',
    label: '3&D Specialists',
    description: 'Elite three-point shooting and perimeter defense. Great spacing, but weak inside.',
    icon: '🎯',
    positionModifiers: {
      PG: { threePoint: 8, perimeterDefense: 6, insideScoring: -5 },
      SG: { threePoint: 10, perimeterDefense: 8, insideScoring: -6 },
      SF: { threePoint: 8, perimeterDefense: 8, insideScoring: -4 },
      PF: { threePoint: 6, perimeterDefense: 6, insideScoring: -2 },
      C: { threePoint: 4, perimeterDefense: 4, insideScoring: -2 },
    },
    positionWeights: {
      PG: 2,
      SG: 4,
      SF: 3,
      PF: 3,
      C: 3,
    },
    talentCurve: { mean: 58, stdDev: 10 }, // Slightly more consistent
    minThreePoint: 40,
    minPerimeterDefense: 35,
  },
  
  'post-heavy': {
    id: 'post-heavy',
    label: 'Post Heavy',
    description: 'Dominant inside scoring and rebounding. Old-school basketball with big men.',
    icon: '🏋️',
    positionModifiers: {
      PG: { insideScoring: -2, passing: -2, rebounding: 2 },
      SG: { insideScoring: 0, passing: -3, rebounding: 3 },
      SF: { insideScoring: 3, passing: -2, rebounding: 4 },
      PF: { insideScoring: 8, postDefense: 8, rebounding: 10, threePoint: -8 },
      C: { insideScoring: 10, postDefense: 10, rebounding: 12, threePoint: -10 },
    },
    positionWeights: {
      PG: 2,
      SG: 2,
      SF: 3,
      PF: 4,
      C: 4,
    },
    talentCurve: { mean: 58, stdDev: 12 },
    minInsideScoring: 40,
    minRebounding: 35,
  },
  
  'small-ball': {
    id: 'small-ball',
    label: 'Small Ball',
    description: 'Small, fast, and skilled. Positionless basketball with elite shooting and speed.',
    icon: '⚡',
    positionModifiers: {
      PG: { speed: 8, ballHandling: 6, threePoint: 4 },
      SG: { speed: 10, ballHandling: 5, threePoint: 6 },
      SF: { speed: 8, ballHandling: 4, threePoint: 6, rebounding: -4 },
      PF: { speed: 6, ballHandling: 3, threePoint: 4, rebounding: -8, postDefense: -6 },
      C: { speed: 4, ballHandling: 2, threePoint: 3, rebounding: -10, postDefense: -8 },
    },
    positionWeights: {
      PG: 3,
      SG: 3,
      SF: 4,
      PF: 3,
      C: 2,
    },
    talentCurve: { mean: 59, stdDev: 11 },
    maxHeightBonus: 0, // Will be handled in generation
  },
  
  'defensive-minded': {
    id: 'defensive-minded',
    label: 'Defensive Minded',
    description: 'Lockdown defenders at every position. Wins through defense and grit.',
    icon: '🔒',
    positionModifiers: {
      PG: { perimeterDefense: 10, postDefense: 2, threePoint: -4 },
      SG: { perimeterDefense: 12, postDefense: 3, threePoint: -5 },
      SF: { perimeterDefense: 10, postDefense: 5, threePoint: -4 },
      PF: { postDefense: 10, perimeterDefense: 4, insideScoring: -2 },
      C: { postDefense: 12, perimeterDefense: 2, insideScoring: -2 },
    },
    positionWeights: {
      PG: 3,
      SG: 3,
      SF: 3,
      PF: 3,
      C: 3,
    },
    talentCurve: { mean: 57, stdDev: 13 }, // More variance
    minPerimeterDefense: 35,
    minPostDefense: 35,
  },
  
  'run-and-gun': {
    id: 'run-and-gun',
    label: 'Run & Gun',
    description: 'Fast-paced offense with elite playmaking and shooting. Scores in bunches.',
    icon: '🏃',
    positionModifiers: {
      PG: { speed: 10, ballHandling: 8, passing: 6, threePoint: 4 },
      SG: { speed: 10, ballHandling: 6, passing: 4, threePoint: 6 },
      SF: { speed: 8, ballHandling: 4, passing: 3, threePoint: 4 },
      PF: { speed: 6, ballHandling: 2, passing: 2, threePoint: 2 },
      C: { speed: 4, ballHandling: 1, passing: 1 },
    },
    positionWeights: {
      PG: 4,
      SG: 3,
      SF: 3,
      PF: 3,
      C: 2,
    },
    talentCurve: { mean: 58, stdDev: 10 },
    minSpeed: 35,
  },
  
  'inside-out': {
    id: 'inside-out',
    label: 'Inside-Out',
    description: 'Balanced attack with both post presence and perimeter shooting.',
    icon: '🔄',
    positionModifiers: {
      PG: { threePoint: 4, ballHandling: 4, insideScoring: -2 },
      SG: { threePoint: 4, midRange: 4, insideScoring: -2 },
      SF: { threePoint: 3, midRange: 3, insideScoring: 2 },
      PF: { threePoint: 2, midRange: 2, insideScoring: 6, postDefense: 4 },
      C: { threePoint: 1, midRange: 1, insideScoring: 8, postDefense: 6 },
    },
    positionWeights: {
      PG: 3,
      SG: 3,
      SF: 3,
      PF: 3,
      C: 3,
    },
    talentCurve: { mean: 60, stdDev: 11 },
  },
  
  'youth-movement': {
    id: 'youth-movement',
    label: 'Youth Movement',
    description: 'Young, athletic team with high potential. Building for the future.',
    icon: '🌟',
    positionModifiers: {
      PG: { speed: 6, ballHandling: 4, threePoint: 2 },
      SG: { speed: 6, ballHandling: 3, threePoint: 3 },
      SF: { speed: 6, ballHandling: 2, threePoint: 2 },
      PF: { speed: 4, ballHandling: 2, threePoint: 1 },
      C: { speed: 3, ballHandling: 1, threePoint: 1 },
    },
    positionWeights: {
      PG: 3,
      SG: 3,
      SF: 3,
      PF: 3,
      C: 3,
    },
    talentCurve: { mean: 56, stdDev: 14 }, // More variance, more upside
    ageRange: [19, 24], // Younger players
    potentialBoost: 8, // Higher potential ratings
  },
  
  'veteran-leadership': {
    id: 'veteran-leadership',
    label: 'Veteran Leadership',
    description: 'Experienced, high-IQ team. Knows how to win but limited athleticism.',
    icon: '👴',
    positionModifiers: {
      PG: { passing: 6, ballHandling: 4, threePoint: 2, speed: -4 },
      SG: { passing: 4, ballHandling: 3, threePoint: 3, speed: -4 },
      SF: { passing: 3, ballHandling: 2, threePoint: 2, speed: -4 },
      PF: { passing: 2, ballHandling: 1, threePoint: 1, speed: -4 },
      C: { passing: 2, ballHandling: 1, threePoint: 1, speed: -4 },
    },
    positionWeights: {
      PG: 3,
      SG: 3,
      SF: 3,
      PF: 3,
      C: 3,
    },
    talentCurve: { mean: 61, stdDev: 9 }, // More consistent, better current ratings
    ageRange: [28, 35], // Older players
    potentialBoost: -5, // Lower potential
  },
  
  'pace-and-space': {
    id: 'pace-and-space',
    label: 'Pace & Space',
    description: 'Modern NBA style. Shooters everywhere, elite ball movement.',
    icon: '🌌',
    positionModifiers: {
      PG: { threePoint: 6, passing: 6, ballHandling: 4, insideScoring: -4 },
      SG: { threePoint: 8, passing: 4, ballHandling: 3, insideScoring: -5 },
      SF: { threePoint: 6, passing: 3, ballHandling: 2, insideScoring: -3 },
      PF: { threePoint: 5, passing: 2, ballHandling: 1, insideScoring: -3, rebounding: -3 },
      C: { threePoint: 4, passing: 2, ballHandling: 1, insideScoring: -2, rebounding: -3 },
    },
    positionWeights: {
      PG: 3,
      SG: 3,
      SF: 3,
      PF: 4,
      C: 2,
    },
    talentCurve: { mean: 59, stdDev: 10 },
    minThreePoint: 35,
  },
  
  'grit-and-grind': {
    id: 'grit-and-grind',
    label: 'Grit & Grind',
    description: 'Physical, defensive-minded team. Wins through toughness and rebounding.',
    icon: '💪',
    positionModifiers: {
      PG: { postDefense: 3, strength: 4, perimeterDefense: 4, threePoint: -4 },
      SG: { postDefense: 3, strength: 4, perimeterDefense: 6, threePoint: -5 },
      SF: { postDefense: 4, strength: 5, perimeterDefense: 4, threePoint: -3 },
      PF: { postDefense: 8, strength: 8, rebounding: 6, threePoint: -6 },
      C: { postDefense: 10, strength: 10, rebounding: 8, threePoint: -8 },
    },
    positionWeights: {
      PG: 2,
      SG: 2,
      SF: 3,
      PF: 4,
      C: 4,
    },
    talentCurve: { mean: 57, stdDev: 12 },
    minStrength: 35,
    minRebounding: 35,
  },
  
  'positionless': {
    id: 'positionless',
    label: 'Positionless Basketball',
    description: 'Versatile players who can switch everything. Height and length at every spot.',
    icon: '🔄',
    positionModifiers: {
      PG: { heightBoost: 4, perimeterDefense: 4, ballHandling: 2 },
      SG: { heightBoost: 3, perimeterDefense: 4, ballHandling: 2 },
      SF: { heightBoost: 2, perimeterDefense: 3, ballHandling: 2 },
      PF: { heightBoost: 2, perimeterDefense: 3, ballHandling: 1 },
      C: { heightBoost: 1, perimeterDefense: 2, ballHandling: 1 },
    },
    positionWeights: {
      PG: 2,
      SG: 3,
      SF: 4,
      PF: 3,
      C: 3,
    },
    talentCurve: { mean: 59, stdDev: 11 },
    heightModifier: 3, // All players slightly taller
  },
};

/**
 * Apply archetype modifiers to player generation
 */
class TeamArchetypeService {
  
  /**
   * Get all available archetypes
   */
  static getArchetypes() {
    return Object.values(TEAM_ARCHETYPES);
  }
  
  /**
   * Get a specific archetype by ID
   */
  static getArchetype(archetypeId) {
    return TEAM_ARCHETYPES[archetypeId] || null;
  }
  
  /**
   * Get position weights for a given archetype
   * Returns base weights if archetype doesn't specify
   */
  static getPositionWeights(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return { ...BASE_POSITION_WEIGHTS };
    
    // Merge with base weights to ensure we have all positions
    const weights = { ...BASE_POSITION_WEIGHTS };
    for (const [pos, weight] of Object.entries(archetype.positionWeights || {})) {
      weights[pos] = weight;
    }
    return weights;
  }
  
  /**
   * Get talent curve modifiers for a given archetype
   */
  static getTalentCurve(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return { mean: 60, stdDev: 11 };
    return archetype.talentCurve || { mean: 60, stdDev: 11 };
  }
  
  /**
   * Apply position-specific attribute modifiers from archetype
   */
  static applyAttributeModifiers(position, attributes, archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return attributes;
    
    const modifiers = archetype.positionModifiers?.[position];
    if (!modifiers) return attributes;
    
    // Apply modifiers to attributes
    const modified = { ...attributes };
    for (const [key, value] of Object.entries(modifiers)) {
      // Handle special cases like heightBoost
      if (key === 'heightBoost') continue;
      if (key === 'maxHeight') continue;
      
      modified[key] = Math.max(25, Math.min(99, modified[key] + value));
    }
    
    return modified;
  }
  
  /**
   * Apply age range modifier from archetype
   */
  static getAgeRange(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype || !archetype.ageRange) return null;
    return archetype.ageRange;
  }
  
  /**
   * Apply potential boost modifier from archetype
   */
  static getPotentialBoost(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return 0;
    return archetype.potentialBoost || 0;
  }
  
  /**
   * Apply height modifier from archetype
   */
  static getHeightModifier(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return 0;
    return archetype.heightModifier || 0;
  }
  
  /**
   * Get minimum attribute requirements for archetype
   */
  static getMinRequirements(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return {};
    
    const requirements = {};
    const minAttrs = [
      'minThreePoint', 'minPerimeterDefense', 'minInsideScoring',
      'minRebounding', 'minSpeed', 'minStrength', 'minPostDefense'
    ];
    
    for (const attr of minAttrs) {
      if (archetype[attr]) {
        // Convert to attribute name
        const attrName = attr.replace('min', '').toLowerCase();
        requirements[attrName] = archetype[attr];
      }
    }
    
    return requirements;
  }
  
  /**
   * Generate roster positions based on archetype weights
   * @param {string} archetypeId - The archetype to use
   * @param {number} rosterSize - Total roster size
   * @returns {string[]} - Array of positions
   */
  static generatePositionDistribution(archetypeId, rosterSize = 15) {
    const weights = this.getPositionWeights(archetypeId);
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    
    // Calculate number of each position
    const positions = [];
    let remaining = rosterSize;
    
    // First pass: allocate based on weights
    const counts = {};
    for (const pos of POSITIONS) {
      const weight = weights[pos] || 0;
      const count = Math.floor((weight / totalWeight) * rosterSize);
      counts[pos] = count;
      remaining -= count;
    }
    
    // Second pass: distribute remaining players
    // Weighted by fractional remainder
    const fractions = {};
    for (const pos of POSITIONS) {
      const weight = weights[pos] || 0;
      const exact = (weight / totalWeight) * rosterSize;
      fractions[pos] = exact - Math.floor(exact);
    }
    
    // Sort by fractional remainder and assign remaining spots
    const sortedPositions = Object.entries(fractions)
      .sort((a, b) => b[1] - a[1]);
    
    for (let i = 0; i < remaining; i++) {
      if (i < sortedPositions.length) {
        const pos = sortedPositions[i][0];
        counts[pos] = (counts[pos] || 0) + 1;
      }
    }
    
    // Build position array
    for (const pos of POSITIONS) {
      for (let i = 0; i < (counts[pos] || 0); i++) {
        positions.push(pos);
      }
    }
    
    // Ensure we have exactly rosterSize
    while (positions.length < rosterSize) {
      positions.push(POSITIONS[positions.length % POSITIONS.length]);
    }
    
    // Shuffle to mix up positions
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    
    return positions;
  }
  
  /**
   * Get archetype description and metadata for UI
   */
  static getArchetypeMetadata(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return null;
    
    return {
      id: archetype.id,
      label: archetype.label,
      description: archetype.description,
      icon: archetype.icon,
      strengths: this._getArchetypeStrengths(archetype),
      weaknesses: this._getArchetypeWeaknesses(archetype),
    };
  }
  
  /**
   * Helper to get archetype strengths
   */
  static _getArchetypeStrengths(archetype) {
    const strengths = [];
    if (archetype.minThreePoint) strengths.push('Three-Point Shooting');
    if (archetype.minPerimeterDefense) strengths.push('Perimeter Defense');
    if (archetype.minRebounding) strengths.push('Rebounding');
    if (archetype.minInsideScoring) strengths.push('Inside Scoring');
    if (archetype.minStrength) strengths.push('Physicality');
    if (archetype.minSpeed) strengths.push('Speed');
    
    // Check position weights for implicit strengths
    if (archetype.positionWeights) {
      const weights = archetype.positionWeights;
      if (weights.PG > 3) strengths.push('Guard Play');
      if (weights.C > 3) strengths.push('Frontcourt Size');
      if (weights.SG > 3) strengths.push('Wing Depth');
    }
    
    return strengths.length > 0 ? strengths : ['Versatile'];
  }
  
  /**
   * Helper to get archetype weaknesses
   */
  static _getArchetypeWeaknesses(archetype) {
    const weaknesses = [];
    
    // Check for attribute penalties
    const modifiers = archetype.positionModifiers || {};
    for (const pos of Object.keys(modifiers)) {
      const mod = modifiers[pos];
      for (const [key, value] of Object.entries(mod)) {
        if (value < -3) {
          const attr = key.replace(/([A-Z])/g, ' $1').trim();
          if (!weaknesses.includes(attr)) {
            weaknesses.push(attr);
          }
        }
      }
    }
    
    return weaknesses.length > 0 ? weaknesses.slice(0, 3) : ['Balanced Roster'];
  }
  
  /**
   * Validate if an archetype ID is valid
   */
  static isValidArchetype(archetypeId) {
    return !!TEAM_ARCHETYPES[archetypeId];
  }
  
  /**
   * Get random archetype (for CPU teams)
   */
  static getRandomArchetype() {
    const archetypes = Object.keys(TEAM_ARCHETYPES);
    return archetypes[Math.floor(Math.random() * archetypes.length)];
  }
  
  /**
   * Get archetype-specific attribute requirements
   * Used for player generation to ensure archetype identity
   */
  static getAttributeRequirements(archetypeId) {
    const archetype = this.getArchetype(archetypeId);
    if (!archetype) return {};
    
    const requirements = {};
    
    // Convert min attributes to requirements
    const minAttrs = [
      'threePoint', 'perimeterDefense', 'insideScoring',
      'rebounding', 'speed', 'strength', 'postDefense'
    ];
    
    for (const attr of minAttrs) {
      const key = `min${attr.charAt(0).toUpperCase() + attr.slice(1)}`;
      if (archetype[key]) {
        requirements[attr] = archetype[key];
      }
    }
    
    return requirements;
  }
}

module.exports = TeamArchetypeService;