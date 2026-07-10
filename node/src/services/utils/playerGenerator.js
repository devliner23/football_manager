const { supabaseAdmin } = require('../../config/supabase');
const TeamArchetypeService = require('./teamArchetypeService');
const playerData = require('../../data/playerData.json');
const { generateTraitCardsForPlayer } = require("./traitCards")

const CANONICAL_TRAIT_MAP = {
  three_point_scoring: 'three_point_scoring',
  mid_range_scoring:   'mid_range_scoring',
  inside_scoring:      'inside_scoring',
  passing:             'passing',
  ball_handling:       'ball_handling',
  perimeter_defense:   'perimeter_defense',
  post_defense:        'interior_defense',
  rebounding:          'rebounding',
  speed:               'speed',
  strength:            'strength',
};

// Sensible fallbacks if playerData.json is missing/mis-configured
const DEFAULT_ATTR_BOUNDS = { min: 25, max: 99, noise: 5 };
const DEFAULT_SKILL_KEYS  = Object.values(CANONICAL_TRAIT_MAP);

class PlayerGenerator {
  constructor(savedGameId, season) {
    this.savedGameId = savedGameId;
    this.season = season;

    this.firstNames         = playerData.firstNames         || ['James', 'Michael', 'David', 'Chris'];
    this.lastNames          = playerData.lastNames          || ['Smith', 'Johnson', 'Williams', 'Brown'];
    this.traitDefinitions   = playerData.traitDefinitions   || {};
    this.positionHeights    = playerData.positionHeights    || { PG: [71, 76], SG: [73, 78], SF: [75, 80], PF: [77, 82], C: [79, 84] };
    this.ageRanges          = playerData.ageRanges          || { rookie: [18, 22], star: [20, 24], rolePlayer: [19, 23] };
    this.weightRange        = playerData.weightRange        || [175, 270];
    this.numTraitsByRating  = playerData.numTraitsByRating  || { '90': [3, 4], '80': [2, 3], '70': [1, 2], 'default': [1, 2] };
    this.positionTraitPools = playerData.positionTraitPools || {};
    this.extraTraitsForStars= playerData.extraTraitsForStars|| [];
    this.skillAttributes    = playerData.skillAttributes    || {};

    this.colleges = [
      'Duke', 'Kentucky', 'Kansas', 'North Carolina', 'Villanova', 'Gonzaga',
      'UCLA', 'Michigan', 'Michigan State', 'Arizona', 'Texas', 'Baylor',
      'Auburn', 'Alabama', 'Tennessee', 'Arkansas', 'Illinois', 'Purdue',
      'Indiana', 'Ohio State', 'Florida', 'LSU', 'USC', 'Oregon', 'Virginia',
      'Florida State', 'Memphis', 'Houston', 'UConn', 'Syracuse'
    ];
    this.cities = [
      'Los Angeles', 'Chicago', 'New York', 'Houston', 'Philadelphia',
      'Dallas', 'Miami', 'Atlanta', 'Seattle', 'Oakland', 'Detroit',
      'Indianapolis', 'Charlotte', 'Portland', 'Cleveland'
    ];
    this.states = [
      'CA', 'IL', 'NY', 'TX', 'PA', 'FL', 'GA', 'WA', 'MI', 'IN', 'NC', 'OR', 'OH'
    ];
    this.highSchools = [
      'Oak Hill Academy', 'Sierra Canyon', 'Montverde Academy', 'IMG Academy',
      'Sunrise Christian', 'Wasatch Academy', 'La Lumiere', 'Prolific Prep',
      'Link Academy', 'Brewster Academy'
    ];
    this.playerArchetypesByPos = {
      PG: ['Playmaker', 'Floor General', 'Combo Guard', 'Sharpshooter', 'Two-Way Star'],
      SG: ['Sharpshooter', 'Scoring Machine', '3-and-D', 'Slasher', 'Combo Guard'],
      SF: ['All-Around', '3-and-D', 'Slasher', 'Point Forward', 'Lockdown Defender'],
      PF: ['Stretch Big', 'Interior Force', 'Rebounder', 'Two-Way Star', 'Rim Protector'],
      C:  ['Rim Protector', 'Interior Force', 'Rebounder', 'Stretch Big', 'Two-Way Star']
    };
    this.traitNames = [
      'Clutch', 'Leader', 'Hard Worker', 'High Motor', 'Unselfish',
      'Physical', 'Finesse', 'Vocal', 'Confident', 'Resilient',
      'Quick Learner', 'Team Player', 'Alpha Dog', 'Spark Plug'
    ];
    this.nbaPlayers = [
      'Jayson Tatum', 'Kevin Durant', 'LeBron James', 'Stephen Curry',
      'Giannis Antetokounmpo', 'Luka Doncic', 'Joel Embiid', 'Nikola Jokic',
      'Jimmy Butler', 'Devin Booker', 'Donovan Mitchell', 'Bam Adebayo',
      'Anthony Davis', 'Paul George', 'Kawhi Leonard', 'Damian Lillard',
      'Trae Young', 'Ja Morant', 'Zion Williamson', 'Shai Gilgeous-Alexander'
    ];
  }

  // ---------- math helpers ----------
  randomGaussian(mean = 0, stdDev = 1) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
  }

  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // ---------- skill attributes (FIXED) ----------
  generateSkillAttributes(position, overallRating) {
    const sa = this.skillAttributes || {};
    const modifiers = (sa.positionModifiers && sa.positionModifiers[position]) || {};
    let keys = sa.keys && sa.keys.length ? sa.keys : DEFAULT_SKILL_KEYS;
    
    // SAFETY NET: Normalize legacy keys from playerData.json to match DB columns
    const KEY_ALIASES = {
      'inside': 'inside_scoring',
      'mid_range': 'mid_range_scoring',
      'three_point': 'three_point_scoring',
      'post_defense': 'interior_defense',
    };
    keys = keys.map(k => KEY_ALIASES[k] || k);

    const noise = (typeof sa.attributeNoise === 'number') ? sa.attributeNoise : DEFAULT_ATTR_BOUNDS.noise;
    const min   = (typeof sa.minAttr === 'number')        ? sa.minAttr        : DEFAULT_ATTR_BOUNDS.min;
    const max   = (typeof sa.maxAttr === 'number')        ? sa.maxAttr        : DEFAULT_ATTR_BOUNDS.max;

    let modSum = 0, modCount = 0;
    for (const key of keys) {
      const m = modifiers[key];
      if (typeof m === 'number') { modSum += m; modCount++; }
    }
    const meanModifier = modCount > 0 ? modSum / modCount : 0;

    const attributes = {};
    for (const key of keys) {
      const mod = (typeof modifiers[key] === 'number') ? modifiers[key] : 0;
      let raw = overallRating + (mod - meanModifier) + this.randomGaussian(0, noise);
      attributes[key] = this.clamp(Math.round(raw), min, max);
    }
    return attributes;
  }

  // ---------- background helpers ----------
  generateCollege()                       { return this.pickRandom(this.colleges); }
  generateHometown()                      { return { city: this.pickRandom(this.cities), state: this.pickRandom(this.states), country: 'USA' }; }
  generateHighSchool()                    { return this.pickRandom(this.highSchools); }
  generatePlayerArchetype(position)       { return this.pickRandom(this.playerArchetypesByPos[position] || ['All-Around']); }

  generateCollegeClass(age) {
    if (age <= 19) return 'Freshman';
    if (age === 20) return Math.random() < 0.5 ? 'Freshman' : 'Sophomore';
    if (age === 21) return Math.random() < 0.3 ? 'Sophomore' : 'Junior';
    return Math.random() < 0.4 ? 'Junior' : 'Senior';
  }

  generateJerseyNumber() {
    const pool = [0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25,
                  30, 31, 32, 33, 34, 35, 40, 41, 42, 43, 44, 45, 50, 51, 52, 53, 54, 55];
    return this.pickRandom(pool);
  }

  generateTraitTags() {
    const count = this.randomInt(0, 3);
    return this.shuffleArray([...this.traitNames]).slice(0, count);
  }

  generateCollegeStats(position, overall) {
    const ppgBase = (overall / 2) - 10 + this.randomInt(-2, 4);
    const rpgBase = (position === 'C' || position === 'PF') ? 6 : 3;
    const apgBase = (position === 'PG') ? 5 : 2;
    const bpgBase = (position === 'C') ? 1.5 : 0.3;

    return {
      college_ppg:      this.clamp(parseFloat((ppgBase + this.randomInt(-1, 2)).toFixed(1)), 0, 40),
      college_rpg:      this.clamp(parseFloat((rpgBase + this.randomInt(-1, 3)).toFixed(1)), 0, 20),
      college_apg:      this.clamp(parseFloat((apgBase + this.randomInt(-1, 2)).toFixed(1)), 0, 15),
      college_spg:      parseFloat((0.5 + Math.random() * 1.5).toFixed(1)),
      college_bpg:      parseFloat((bpgBase + Math.random() * 1.0).toFixed(1)),
      college_fg_pct:   parseFloat((40 + Math.random() * 20).toFixed(1)),
      college_three_pct:parseFloat((28 + Math.random() * 18).toFixed(1)),
      college_ft_pct:   parseFloat((60 + Math.random() * 30).toFixed(1)),
      college_minutes:  parseFloat((20 + Math.random() * 15).toFixed(1)),
    };
  }

  generateMeasurements(height) {
    const wingspan      = this.randomInt(Math.round(height * 0.95), Math.round(height * 1.1));
    const standingReach = parseFloat((height * 0.8 + wingspan * 0.2).toFixed(1));
    const handLength    = parseFloat((7.5 + this.randomInt(0, 3) * 0.5).toFixed(1));
    const handWidth     = parseFloat((8.5 + this.randomInt(0, 3) * 0.5).toFixed(1));
    const bodyFatPct    = parseFloat((5 + Math.random() * 10).toFixed(1));
    return { wingspan, standing_reach: standingReach, hand_length: handLength, hand_width: handWidth, body_fat_pct: bodyFatPct };
  }

  generateIntangibles(overall) {
    const tiers = ['Poor', 'Below Average', 'Average', 'Good', 'Excellent', 'Legendary'];
    const base = (overall - 50) / 10;
    const workEthicIndex   = this.clamp(Math.round(base + this.randomInt(-1, 1)), 0, 5);
    const iqIndex          = this.clamp(Math.round(base + this.randomInt(-1, 1)), 0, 5);
    const leadershipIndex  = this.clamp(Math.round(base + this.randomInt(-1, 1)), 0, 5);
    const injuryHistory    = this.pickRandom(['None', 'None', 'None', 'Minor', 'Moderate']);
    return {
      work_ethic:      tiers[workEthicIndex],
      basketball_iq:   tiers[iqIndex],
      leadership:      tiers[leadershipIndex],
      injury_history:  injuryHistory,
    };
  }

  generateCombine(position, overall) {
    const speedFactor = overall / 100;
    const agility   = parseFloat((10.5 + (1 - speedFactor) * 2 + this.randomInt(-2, 2) * 0.1).toFixed(2));
    const sprint    = parseFloat((2.9  + (1 - speedFactor) * 0.8 + this.randomInt(-2, 2) * 0.05).toFixed(2));
    const standVert = parseFloat((24   + speedFactor * 12 + this.randomInt(-4, 4)).toFixed(1));
    const maxVert   = parseFloat((standVert + 8 + this.randomInt(-3, 3)).toFixed(1));
    const bench     = (position === 'C' || position === 'PF') ? this.randomInt(8, 25) : this.randomInt(2, 15);
    return {
      lane_agility_time:   agility,
      three_quarter_sprint:sprint,
      standing_vertical:   standVert,
      max_vertical:        maxVert,
      bench_press_reps:    bench,
    };
  }

  generateAwards(overall) {
    const awards = [];
    if (overall >= 88 && Math.random() < 0.7) awards.push('National Player of the Year');
    if (overall >= 80 && Math.random() < 0.6) awards.push('All-American');
    if (overall >= 74 && Math.random() < 0.4) awards.push('Conference Player of the Year');
    if (overall >= 68 && Math.random() < 0.35) awards.push('All-Conference First Team');
    if (overall >= 62 && Math.random() < 0.3) awards.push('All-Conference Second Team');
    if (Math.random() < 0.2) awards.push('Academic All-American');
    return awards;
  }

  generateDevelopmentTrend() {
    return this.pickRandom(['Rising', 'Stable', 'Stable', 'Falling']);
  }

  getBreakoutPotential(potential, overall) {
    const diff = potential - overall;
    if (diff >= 12) return 'Very High';
    if (diff >= 8)  return 'High';
    if (diff >= 4)  return 'Medium';
    if (diff >= 1)  return 'Low';
    return 'Minimal';
  }

  buildTraitsObject(skillAttrs) {
    const traits = {};
    for (const [canonicalKey, flatColumn] of Object.entries(CANONICAL_TRAIT_MAP)) {
      const value = skillAttrs[flatColumn] ?? skillAttrs[canonicalKey] ?? 50;
      traits[canonicalKey] = value;
    }
    return traits;
  }

  generateAge(isStar, index) {
    if (index > 12) {
      const [min, max] = this.ageRanges.rookie;
      return this.randomInt(min, max);
    }
    if (isStar) {
      const [min, max] = this.ageRanges.star;
      return this.randomInt(min, max);
    }
    const [min, max] = this.ageRanges.rolePlayer;
    return this.randomInt(min, max);
  }

  generateHeight(position) {
    const [min, max] = this.positionHeights[position] || [72, 78];
    return this.randomInt(min, max);
  }

  generateWeight() {
    const [min, max] = this.weightRange;
    return this.randomInt(min, max);
  }

  generatePotential(rating, isStar, index) {
    let potential = rating;
    if (index > 12) {
      potential += 8 + this.randomInt(0, 12);
    } else if (isStar) {
      potential += this.randomInt(2, 6);
    } else {
      potential += this.randomInt(0, 4);
    }
    return this.clamp(Math.floor(potential), rating, 99);
  }

  generatePlayerRating(teamTier, isStarter, rosterIndex, archetypeId = null) {
    const tierMeans = {
      contender: { starter: 82, bench: 72 },
      playoff:   { starter: 78, bench: 70 },
      mid:       { starter: 74, bench: 67 },
      lottery:   { starter: 70, bench: 64 }
    };

    const tCfg = tierMeans[teamTier] || tierMeans.mid;
    let mean   = isStarter ? tCfg.starter : tCfg.bench;
    let stdDev = isStarter ? 4 : 6;

    const curve = TeamArchetypeService.getTalentCurve(archetypeId);
    if (curve) {
      mean   = (mean + curve.mean) / 2;
      stdDev = (stdDev + curve.stdDev) / 2;
    }

    let rating = this.randomGaussian(mean, stdDev);

    if (isStarter && Math.random() < 0.08) {
      rating += this.randomInt(6, 12);
    }
    if (rosterIndex > 12) {
      rating -= this.randomInt(2, 6);
    }

    return this.clamp(Math.round(rating), 55, 99);
  }

  generatePlayer(teamId, position, rating, isStar, rosterIndex) {
    const skillAttrs = this.generateSkillAttributes(position, rating);
    const traitTags  = this.generateTraitTags();
    const traits     = this.buildTraitsObject(skillAttrs);

    const potential       = this.generatePotential(rating, isStar, rosterIndex);
    const age             = this.generateAge(isStar, rosterIndex);
    const height          = this.generateHeight(position);
    const weight          = this.generateWeight();
    const traitCards       = generateTraitCardsForPlayer({ overall: rating, potential, age });
    const first_name      = this.pickRandom(this.firstNames);
    const last_name       = this.pickRandom(this.lastNames);
    const full_name       = `${first_name} ${last_name}`;

    const college         = this.generateCollege();
    const collegeClass    = this.generateCollegeClass(age);
    const hometown        = this.generateHometown();
    const high_school     = this.generateHighSchool();
    const jersey_number   = this.generateJerseyNumber();
    const player_archetype= this.generatePlayerArchetype(position);

    const collegeStats    = this.generateCollegeStats(position, rating);
    const measurements    = this.generateMeasurements(height);
    const intangibles     = this.generateIntangibles(rating);
    const combine         = this.generateCombine(position, rating);
    const awards          = this.generateAwards(rating);

    const socialMedia     = this.randomInt(1000, 5000000);
    const nilValuation    = Math.round((socialMedia * 0.001)) * 1000;

    const comp1 = this.pickRandom(this.nbaPlayers);
    const comp2 = this.pickRandom(this.nbaPlayers.filter(p => p !== comp1));

    const devTrend  = this.generateDevelopmentTrend();
    const breakout  = this.getBreakoutPotential(potential, rating);

    return {
      saved_game_id: this.savedGameId,
      team_id: teamId,
      first_name,
      last_name,
      full_name,
      position,
      age,
      height,
      weight,
      overall_rating: rating,
      potential_rating: potential,

      // Skills (individual columns mapped to DB)
      ...skillAttrs,

      // Traits: structured (JSON object) + tags (JSON array)
      traits: JSON.stringify(traits),
      trait_tags: JSON.stringify(traitTags),
      trait_cards: JSON.stringify(traitCards),


      college,
      college_class: collegeClass,
      hometown_city: hometown.city,
      hometown_state: hometown.state,
      hometown_country: hometown.country,
      nationality: 'American',
      high_school,
      jersey_number,

      draft_class_year: null,
      projected_draft_range: null,
      draft_status: 'drafted',
      draft_position: null,
      drafted_by_team_id: teamId,
      draft_year: null,
      draft_round: null,
      draft_pick: null,
      draft_team_id: null,

      player_archetype,

      ...collegeStats,
      ...measurements,
      ...intangibles,
      character_concerns: Math.random() < 0.1,
      scouting_notes: null,

      player_comparison_1: comp1,
      player_comparison_2: comp2,
      social_media_following: socialMedia,
      nil_valuation: nilValuation,

      ...combine,

      awards: JSON.stringify(awards),

      tournament_appearances: this.randomInt(0, 4),
      final_four_appearances: Math.random() < 0.15 ? 1 : 0,
      championships: Math.random() < 0.08 ? 1 : 0,

      development_trend: devTrend,
      breakout_potential: breakout,
    };
  }

  generateTeamRoster(team, tier, archetypeId = null) {
    const roster = [];
    const positions = TeamArchetypeService.generatePositionDistribution(archetypeId, 15);

    for (let i = 0; i < 15; i++) {
      const position   = positions[i];
      const isStarter  = i < 5;
      const rating     = this.generatePlayerRating(tier, isStarter, i, archetypeId);
      const isStar     = rating >= 85;

      roster.push(this.generatePlayer(team.id, position, rating, isStar, i));
    }
    return roster;
  }

  generateLeague(teams, teamArchetypes = {}) {
    console.log('👥 Generating league with realistic talent distribution...');

    const tierCycle = ['contender', 'playoff', 'mid', 'lottery'];
    const tierCounts = { contender: 4, playoff: 8, mid: 8, lottery: 6 };
    const tiers = [];
    for (const t of tierCycle) {
      for (let i = 0; i < tierCounts[t]; i++) tiers.push(t);
    }

    const shuffledTeams = this.shuffleArray([...teams]);
    const allPlayers = [];
    const teamTiers = {};

    for (let i = 0; i < shuffledTeams.length; i++) {
      const team = shuffledTeams[i];
      const tier = tiers[i] || 'mid';
      teamTiers[team.id] = tier;
      const archetypeId = teamArchetypes[team.id] || null;
      allPlayers.push(...this.generateTeamRoster(team, tier, archetypeId));
    }

    const dist = { '55-64': 0, '65-69': 0, '70-74': 0, '75-79': 0, '80-84': 0, '85-89': 0, '90+': 0 };
    for (const p of allPlayers) {
      const r = p.overall_rating;
      if (r < 65)        dist['55-64']++;
      else if (r < 70)   dist['65-69']++;
      else if (r < 75)   dist['70-74']++;
      else if (r < 80)   dist['75-79']++;
      else if (r < 85)   dist['80-84']++;
      else if (r < 90)   dist['85-89']++;
      else               dist['90+']++;
    }
    console.log('📊 Rating distribution:', dist);
    console.log(`✅ Generated ${allPlayers.length} players`);
    return { players: allPlayers, teamTiers };
  }

  generateFirstName() { return this.pickRandom(this.firstNames); }
  generateLastName()  { return this.pickRandom(this.lastNames); }

  async savePlayers(players) {
    const batchSize = 50;
    const results = [];
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      const { data, error } = await supabaseAdmin
        .from('players')
        .insert(batch)
        .select();
      if (error) {
        console.error(`Error inserting players batch ${Math.floor(i / batchSize)}:`, error);
        throw error;
      }
      results.push(...data);
      console.log(`Inserted ${data.length} players (batch ${Math.floor(i / batchSize) + 1})`);
    }
    return results;
  }
}

module.exports = PlayerGenerator;