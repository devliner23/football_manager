// services/coachGenerator.js
const { supabaseAdmin } = require('../../config/supabase');
const playerData = require('../../data/playerData.json'); // reuse name pools
const TeamArchetypeService = require('./teamArchetypeService');

const COACH_TIER_MEANS = {
  contender: 78,
  playoff:   72,
  mid:       66,
  lottery:   60,
};

const ATTR_KEYS = [
  'offense_rating', 'defense_rating', 'player_development',
  'motivation', 'discipline', 'adaptability', 'rotation_iq', 'clutch_factor',
];

function clamp(v, min = 40, max = 99) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

class CoachGenerator {
  constructor(savedGameId) {
    this.savedGameId = savedGameId;
    this.firstNames = playerData.firstNames;
    this.lastNames  = playerData.lastNames;
  }

  randomGaussian(mean = 0, stdDev = 1) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * stdDev + mean;
  }

  /**
   * @param {string} teamId
   * @param {'contender'|'playoff'|'mid'|'lottery'} tier
   */
  generateCoach(teamId, tier = 'mid') {
    const mean = COACH_TIER_MEANS[tier] || COACH_TIER_MEANS.mid;
    let overall = this.randomGaussian(mean, 10);

    // Variance: hidden gem on a bad team, or a bad hire on a good one
    const roll = Math.random();
    if (roll < 0.08) overall += 15;       // diamond in the rough
    else if (roll > 0.94) overall -= 12;  // bad hire, even for a contender

    overall = clamp(overall, 45, 99);

    // Specialization: offense-minded / defense-minded / balanced
    const focusRoll = Math.random();
    let offenseBias = 0, defenseBias = 0;
    if (focusRoll < 0.35)      { offenseBias =  6; defenseBias = -3; }
    else if (focusRoll < 0.70) { offenseBias = -3; defenseBias =  6; }

    const noise = 8;
    const attributes = {
      offense_rating:     clamp(overall + offenseBias + this.randomGaussian(0, noise)),
      defense_rating:     clamp(overall + defenseBias + this.randomGaussian(0, noise)),
      player_development: clamp(overall + this.randomGaussian(0, noise)),
      motivation:         clamp(overall + this.randomGaussian(0, noise)),
      discipline:         clamp(overall + this.randomGaussian(0, noise)),
      adaptability:       clamp(overall + this.randomGaussian(0, noise)),
      rotation_iq:        clamp(overall + this.randomGaussian(0, noise)),
      clutch_factor:      clamp(overall + this.randomGaussian(0, noise)),
    };

    // Recompute overall from actual attributes so it's consistent with what's stored
    const recalculated = clamp(
      ATTR_KEYS.reduce((s, k) => s + attributes[k], 0) / ATTR_KEYS.length
    );

    const preferredArchetype = TeamArchetypeService.getRandomArchetype();
    const age = 35 + Math.floor(Math.random() * 33); // 35–67

    const first_name = this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
    const last_name  = this.lastNames[Math.floor(Math.random() * this.lastNames.length)];

    return {
      saved_game_id: this.savedGameId,
      team_id: teamId,
      first_name,
      last_name,
      full_name: `${first_name} ${last_name}`,
      age,
      overall_rating: recalculated,
      preferred_archetype: preferredArchetype,
      attributes,
    };
  }

  /**
   * 🚀 NEW: Bulk save all coaches in one INSERT.
   */
  async saveCoaches(coaches) {
    const { data, error } = await supabaseAdmin
      .from('coaches')
      .insert(coaches)
      .select();
    if (error) {
      console.error('Error inserting coaches:', error);
      throw error;
    }
    return data;

  }
}

module.exports = CoachGenerator;