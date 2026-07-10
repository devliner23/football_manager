// services/utils/traitCards.js
//
// "Trait cards" are the mechanical layer on top of the old cosmetic
// trait_tags (Clutch, Leader, etc). Each card has real numeric effects:
//   - situational stat boosts (clutch, transition, home/away, back-to-back)
//   - progression modifiers (faster/slower development, injury risk)
//
// Players get 0-3 cards on generation, weighted by overall/potential/age.
// Cards persist on the player row as `trait_cards` (JSON array of ids) and
// are read by gameSimulationEngine (situational effects) and
// playerProgression (development effects).

'use strict';

const TRAIT_CARD_CATALOG = {
  // ── Situational — offense ──────────────────────────────────────────
  clutch_gene: {
    id: 'clutch_gene',
    name: 'Clutch Gene',
    description: 'Elevates in the final minutes of close games.',
    tier: 'gold',
    category: 'situational',
    effects: { situational: { clutch: { shotMakeBonus: 0.05, usageBonus: 0.10 } } },
  },
  ice_in_veins: {
    id: 'ice_in_veins',
    name: 'Ice in Veins',
    description: 'Free throw and clutch three-point specialist.',
    tier: 'silver',
    category: 'situational',
    effects: { situational: { clutch: { ftBonus: 0.06, threePointBonus: 0.04 } } },
  },
  homebody: {
    id: 'homebody',
    name: 'Homebody',
    description: 'Notably better production at home.',
    tier: 'bronze',
    category: 'situational',
    effects: { situational: { home: { shotMakeBonus: 0.02 } } },
  },
  road_warrior: {
    id: 'road_warrior',
    name: 'Road Warrior',
    description: 'Unaffected by hostile crowds; plays even away from home.',
    tier: 'bronze',
    category: 'situational',
    effects: { situational: { away: { shotMakeBonus: 0.02 } } },
  },
  fast_break_threat: {
    id: 'fast_break_threat',
    name: 'Fast Break Threat',
    description: 'Thrives in transition opportunities.',
    tier: 'silver',
    category: 'situational',
    effects: { situational: { transition: { shotMakeBonus: 0.04, usageBonus: 0.08 } } },
  },
  microwave: {
    id: 'microwave',
    name: 'Microwave',
    description: 'Scores in bunches off the bench; strong second/fourth quarters.',
    tier: 'silver',
    category: 'situational',
    effects: { situational: { bench: { shotMakeBonus: 0.03, usageBonus: 0.10 } } },
  },

  // ── Durability / progression ─────────────────────────────────────
  iron_man: {
    id: 'iron_man',
    name: 'Iron Man',
    description: 'Rarely fatigues, resists injury-driven regression.',
    tier: 'gold',
    category: 'durability',
    effects: { fatigueResist: 0.20, progression: { regressionResist: 0.35 } },
  },
  injury_prone: {
    id: 'injury_prone',
    name: 'Injury Prone',
    description: 'History of injuries; higher chance of setbacks in development.',
    tier: 'bronze',
    category: 'durability',
    effects: { fatigueResist: -0.15, progression: { regressionRisk: 0.35 } },
  },
  gym_rat: {
    id: 'gym_rat',
    name: 'Gym Rat',
    description: 'Obsessive work ethic accelerates skill development.',
    tier: 'silver',
    category: 'progression',
    effects: { progression: { learnRateMultiplier: 1.35 } },
  },
  quick_study: {
    id: 'quick_study',
    name: 'Quick Study',
    description: 'Picks up NBA-level concepts faster than peers.',
    tier: 'gold',
    category: 'progression',
    effects: { progression: { learnRateMultiplier: 1.55, potentialPullMultiplier: 1.25 } },
  },
  late_bloomer: {
    id: 'late_bloomer',
    name: 'Late Bloomer',
    description: 'Slower start, but development window extends further into the late 20s.',
    tier: 'silver',
    category: 'progression',
    effects: { progression: { primeAgeShift: 3, learnRateMultiplier: 1.10 } },
  },
  plateaued: {
    id: 'plateaued',
    name: 'Plateaued',
    description: 'Has largely settled into their current level of play.',
    tier: 'bronze',
    category: 'progression',
    effects: { progression: { learnRateMultiplier: 0.55 } },
  },
  aging_gracefully: {
    id: 'aging_gracefully',
    name: 'Aging Gracefully',
    description: 'Veteran whose skills decline slower than typical.',
    tier: 'silver',
    category: 'progression',
    effects: { progression: { declineMultiplier: 0.5 } },
  },
  fading_fast: {
    id: 'fading_fast',
    name: 'Fading Fast',
    description: 'Athleticism-dependent game that erodes quickly with age.',
    tier: 'bronze',
    category: 'progression',
    effects: { progression: { declineMultiplier: 1.6 } },
  },

  // ── Team / intangible ───────────────────────────────────────────
  floor_general: {
    id: 'floor_general',
    name: 'Floor General',
    description: 'Boosts teammate chemistry growth.',
    tier: 'silver',
    category: 'team',
    effects: { chemistryBonus: 0.01 },
  },
  high_motor: {
    id: 'high_motor',
    name: 'High Motor',
    description: 'Extra hustle stats — rebounds, loose balls, deflections.',
    tier: 'bronze',
    category: 'team',
    effects: { situational: { always: { reboundBonus: 0.03, stealBonus: 0.02 } } },
  },
};

const CARD_IDS = Object.keys(TRAIT_CARD_CATALOG);

function getCardDefinition(id) {
  return TRAIT_CARD_CATALOG[id] || null;
}

function getAllCards() {
  return Object.values(TRAIT_CARD_CATALOG);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Tier weighting — better players are more likely to pull gold cards,
// mirroring the "rating gates trait count" logic that used to live in
// playerGenerator's numTraitsByRating.
function tierWeightsForOverall(overall) {
  if (overall >= 85) return { gold: 0.35, silver: 0.40, bronze: 0.25 };
  if (overall >= 75) return { gold: 0.15, silver: 0.45, bronze: 0.40 };
  if (overall >= 65) return { gold: 0.05, silver: 0.35, bronze: 0.60 };
  return { gold: 0.02, silver: 0.20, bronze: 0.78 };
}

function pickTier(weights) {
  const r = Math.random();
  if (r < weights.gold) return 'gold';
  if (r < weights.gold + weights.silver) return 'silver';
  return 'bronze';
}

function cardCountForOverall(overall) {
  if (overall >= 88) return 2 + (Math.random() < 0.35 ? 1 : 0); // stars: 2-3
  if (overall >= 78) return 1 + (Math.random() < 0.45 ? 1 : 0); // starters: 1-2
  if (overall >= 65) return Math.random() < 0.55 ? 1 : 0;       // rotation: 0-1
  return Math.random() < 0.20 ? 1 : 0;                          // fringe: rare
}

/**
 * Assign a set of trait cards to a newly generated player.
 * Age biases toward durability/progression cards that make sense narratively
 * (young players skew toward gym_rat/late_bloomer/injury_prone, veterans
 * skew toward aging_gracefully/fading_fast/plateaued).
 *
 * @returns {string[]} array of card ids
 */
function generateTraitCardsForPlayer({ overall, potential = overall, age = 24 }) {
  const weights = tierWeightsForOverall(overall);
  const count = cardCountForOverall(overall);
  const chosen = new Set();

  const ageBucket = age <= 23 ? 'young' : age >= 31 ? 'veteran' : 'prime';
  const ageAffinity = {
    young: ['gym_rat', 'quick_study', 'late_bloomer', 'injury_prone', 'high_motor'],
    prime: ['clutch_gene', 'ice_in_veins', 'iron_man', 'floor_general', 'fast_break_threat', 'microwave'],
    veteran: ['aging_gracefully', 'fading_fast', 'plateaued', 'floor_general', 'ice_in_veins'],
  }[ageBucket];

  let attempts = 0;
  while (chosen.size < count && attempts < 20) {
    attempts++;
    const tier = pickTier(weights);
    // 60% chance to bias toward age-appropriate flavor, otherwise fully random
    const pool = Math.random() < 0.6
      ? ageAffinity.filter(id => TRAIT_CARD_CATALOG[id]?.tier === tier)
      : CARD_IDS.filter(id => TRAIT_CARD_CATALOG[id].tier === tier);
    const candidates = pool.length ? pool : CARD_IDS.filter(id => TRAIT_CARD_CATALOG[id].tier === tier);
    if (!candidates.length) continue;

    const pick = pickRandom(candidates);
    // Don't let contradictory cards stack (e.g. iron_man + injury_prone)
    const conflicts = {
      iron_man: ['injury_prone'],
      injury_prone: ['iron_man'],
      aging_gracefully: ['fading_fast'],
      fading_fast: ['aging_gracefully'],
      gym_rat: ['plateaued'],
      quick_study: ['plateaued'],
      plateaued: ['gym_rat', 'quick_study'],
    };
    const hasConflict = (conflicts[pick] || []).some(c => chosen.has(c));
    if (!hasConflict) chosen.add(pick);
  }

  return Array.from(chosen);
}

/**
 * Combine progression-relevant effects from a player's trait cards into a
 * single multiplier/delta object playerProgression can apply directly.
 */
function getProgressionModifiers(cardIds = []) {
  const mods = {
    learnRateMultiplier: 1,
    potentialPullMultiplier: 1,
    declineMultiplier: 1,
    regressionRisk: 0,
    regressionResist: 0,
    primeAgeShift: 0,
  };
  for (const id of cardIds) {
    const card = getCardDefinition(id);
    const p = card?.effects?.progression;
    if (!p) continue;
    if (p.learnRateMultiplier != null) mods.learnRateMultiplier *= p.learnRateMultiplier;
    if (p.potentialPullMultiplier != null) mods.potentialPullMultiplier *= p.potentialPullMultiplier;
    if (p.declineMultiplier != null) mods.declineMultiplier *= p.declineMultiplier;
    if (p.regressionRisk != null) mods.regressionRisk += p.regressionRisk;
    if (p.regressionResist != null) mods.regressionResist += p.regressionResist;
    if (p.primeAgeShift != null) mods.primeAgeShift += p.primeAgeShift;
  }
  return mods;
}

/**
 * Aggregate situational effects (used by the sim engine to bias shot-make
 * rates / usage in given contexts: 'clutch', 'home', 'away', 'transition',
 * 'bench', 'always').
 */
function getSituationalEffects(cardIds = [], context) {
  const totals = { shotMakeBonus: 0, usageBonus: 0, ftBonus: 0, threePointBonus: 0, reboundBonus: 0, stealBonus: 0 };
  for (const id of cardIds) {
    const card = getCardDefinition(id);
    const situ = card?.effects?.situational?.[context];
    if (!situ) continue;
    for (const key of Object.keys(totals)) {
      if (situ[key]) totals[key] += situ[key];
    }
  }
  return totals;
}

function parseTraitCards(player) {
  let cards = player?.trait_cards;
  if (typeof cards === 'string') {
    try { cards = JSON.parse(cards); } catch { cards = []; }
  }
  return Array.isArray(cards) ? cards : [];
}

module.exports = {
  TRAIT_CARD_CATALOG,
  getCardDefinition,
  getAllCards,
  generateTraitCardsForPlayer,
  getProgressionModifiers,
  getSituationalEffects,
  parseTraitCards,
};