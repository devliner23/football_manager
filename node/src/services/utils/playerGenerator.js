const { supabaseAdmin } = require('../../config/supabase');
const playerData = require('../../data/playerData.json');

class PlayerGenerator {
  constructor(savedGameId, season) {
    this.savedGameId = savedGameId;
    this.season = season;

    // Load static data from JSON (unchanged)
    this.firstNames = playerData.firstNames;
    this.lastNames = playerData.lastNames;
    this.traitDefinitions = playerData.traitDefinitions;
    this.positionHeights = playerData.positionHeights;
    this.ageRanges = playerData.ageRanges;
    this.weightRange = playerData.weightRange;
    this.numTraitsByRating = playerData.numTraitsByRating;
    this.positionTraitPools = playerData.positionTraitPools;
    this.extraTraitsForStars = playerData.extraTraitsForStars;
    this.skillAttributes = playerData.skillAttributes;

    // Static data for new background columns (you can move these to playerData.json later)
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

  randomGaussian(mean = 0, stdDev = 1) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
  }

  // ---------- generate skill attributes (unchanged) ----------
  generateSkillAttributes(position, overallRating) {
    const modifiers = this.skillAttributes.positionModifiers[position] || {};
    const attributes = {};
    const keys = this.skillAttributes.keys;
    const noise = this.skillAttributes.attributeNoise;
    const min = this.skillAttributes.minAttr;
    const max = this.skillAttributes.maxAttr;

    for (const key of keys) {
      const mod = modifiers[key] || 0;
      let raw = overallRating + mod + this.randomGaussian(0, noise);
      attributes[key] = Math.min(max, Math.max(min, Math.round(raw)));
    }
    return attributes;
  }

  // ---------- NEW: simple traits (array of strings) ----------
  generateTraitsArray() {
    const count = Math.floor(Math.random() * 4); // 0–3 traits
    const shuffled = this.shuffleArray([...this.traitNames]);
    return shuffled.slice(0, count);
  }

  // ---------- NEW: college stats (based on position & overall) ----------
  generateCollegeStats(position, overall) {
    const ppgBase = (overall / 2) - 10 + this.randomInt(-2, 4);
    const rpgBase = (position === 'C' || position === 'PF') ? 6 : 3;
    const apgBase = (position === 'PG') ? 5 : 2;
    return {
      college_ppg: parseFloat((ppgBase + this.randomInt(-1, 2)).toFixed(1)),
      college_rpg: parseFloat((rpgBase + this.randomInt(-1, 3)).toFixed(1)),
      college_apg: parseFloat((apgBase + this.randomInt(-1, 2)).toFixed(1)),
      college_spg: parseFloat((0.5 + Math.random() * 1.5).toFixed(1)),
      college_bpg: parseFloat((position === 'C' ? 1.5 : 0.3 + Math.random() * 1).toFixed(1)),
      college_fg_pct: parseFloat((40 + Math.random() * 20).toFixed(1)),
      college_three_pct: parseFloat((28 + Math.random() * 18).toFixed(1)),
      college_ft_pct: parseFloat((60 + Math.random() * 30).toFixed(1)),
      college_minutes: parseFloat((20 + Math.random() * 15).toFixed(1)),
    };
  }

  // ---------- NEW: physical measurements ----------
  generateMeasurements(height) {
    const wingspan = this.randomInt(Math.round(height * 0.95), Math.round(height * 1.1));
    const standingReach = parseFloat((height * 0.8 + wingspan * 0.2).toFixed(1));
    const handLength = parseFloat((7.5 + this.randomInt(0, 3) * 0.5).toFixed(1));
    const handWidth = parseFloat((8.5 + this.randomInt(0, 3) * 0.5).toFixed(1));
    const bodyFatPct = parseFloat((5 + Math.random() * 10).toFixed(1));
    return { wingspan, standing_reach: standingReach, hand_length: handLength, hand_width: handWidth, body_fat_pct: bodyFatPct };
  }

  // ---------- NEW: intangibles ----------
  generateIntangibles(overall) {
    const tiers = ['Poor', 'Below Average', 'Average', 'Good', 'Excellent', 'Legendary'];
    const base = overall / 10;
    const workEthicIndex = this.clamp(Math.round(base + this.randomInt(-2, 2)), 0, 5);
    const iqIndex = this.clamp(Math.round(base + this.randomInt(-2, 2)), 0, 5);
    const leadershipIndex = this.clamp(Math.round(base + this.randomInt(-2, 2)), 0, 5);
    const injuryHistory = this.pickRandom(['None', 'None', 'None', 'Minor', 'Moderate']);
    return {
      work_ethic: tiers[workEthicIndex],
      basketball_iq: tiers[iqIndex],
      leadership: tiers[leadershipIndex],
      injury_history: injuryHistory,
    };
  }

  // ---------- NEW: combine results ----------
  generateCombine(position, overall) {
    const speedFactor = overall / 100;
    const agility = parseFloat((10.5 + (1 - speedFactor) * 2 + this.randomInt(-2, 2) * 0.1).toFixed(2));
    const sprint = parseFloat((2.9 + (1 - speedFactor) * 0.8 + this.randomInt(-2, 2) * 0.05).toFixed(2));
    const standVert = parseFloat((24 + speedFactor * 12 + this.randomInt(-4, 4)).toFixed(1));
    const maxVert = parseFloat((standVert + 8 + this.randomInt(-3, 3)).toFixed(1));
    const bench = (position === 'C' || position === 'PF') ? this.randomInt(8, 25) : this.randomInt(2, 15);
    return {
      lane_agility_time: agility,
      three_quarter_sprint: sprint,
      standing_vertical: standVert,
      max_vertical: maxVert,
      bench_press_reps: bench,
    };
  }

  // ---------- NEW: awards ----------
  generateAwards(overall) {
    const awards = [];
    if (overall >= 78 && Math.random() < 0.6) awards.push('All-American');
    if (overall >= 72 && Math.random() < 0.4) awards.push('Conference Player of the Year');
    if (overall >= 68 && Math.random() < 0.3) awards.push('All-Conference First Team');
    if (overall >= 65 && Math.random() < 0.3) awards.push('All-Conference Second Team');
    if (Math.random() < 0.2) awards.push('Academic All-American');
    return awards;
  }

  // ---------- NEW: development & breakout ----------
  generateDevelopmentTrend() {
    return this.pickRandom(['Rising', 'Stable', 'Stable', 'Falling']);
  }

  getBreakoutPotential(potential, overall) {
    const diff = potential - overall;
    if (diff >= 12) return 'Very High';
    if (diff >= 8) return 'High';
    if (diff >= 4) return 'Medium';
    return 'Low';
  }

  // ---------- generate traits (unchanged) ----------
  generateTraits(position, rating, isStar) {
    const traits = {};
    const availableTraits = this.getRelevantTraits(position, isStar);
    const numTraits = this.getNumberOfTraits(rating);
    const selectedTraits = this.selectTraits(availableTraits, numTraits, rating);

    for (const traitId of selectedTraits) {
      traits[traitId] = this.calculateTraitValue(rating, traitId);
    }
    return traits;
  }

  // ---------- NEW: background generation helpers ----------
  pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  generateCollege() {
    return this.pickRandom(this.colleges);
  }

  generateCollegeClass(age) {
    if (age <= 19) return 'Freshman';
    if (age === 20) return Math.random() < 0.5 ? 'Freshman' : 'Sophomore';
    if (age === 21) return Math.random() < 0.3 ? 'Sophomore' : 'Junior';
    return Math.random() < 0.4 ? 'Junior' : 'Senior';
  }

  generateHometown() {
    return {
      city: this.pickRandom(this.cities),
      state: this.pickRandom(this.states),
      country: 'USA'
    };
  }

  generateHighSchool() {
    return this.pickRandom(this.highSchools);
  }

  generateJerseyNumber() {
    return Math.floor(Math.random() * 100);
  }

  generatePlayerArchetype(position) {
    const list = this.playerArchetypesByPos[position] || ['All-Around'];
    return this.pickRandom(list);
  }

  // ---------- generate a full player (UPDATED with new fields) ----------
  generatePlayer(teamId, position, rating, isStar, rosterIndex) {
    const skillAttrs = this.generateSkillAttributes(position, rating);
    const traitsArray = this.generateTraitsArray();

    const potential = this.generatePotential(rating, isStar, rosterIndex);
    const age = this.generateAge(isStar, rosterIndex);
    const height = this.generateHeight(position);
    const weight = this.generateWeight();
    const first_name = this.generateFirstName();
    const last_name = this.generateLastName();
    const full_name = `${first_name} ${last_name}`;

    const college = this.generateCollege();
    const collegeClass = this.generateCollegeClass(age);
    const hometown = this.generateHometown();
    const high_school = this.generateHighSchool();
    const jersey_number = this.generateJerseyNumber();
    const player_archetype = this.generatePlayerArchetype(position);

    const collegeStats = this.generateCollegeStats(position, rating);
    const measurements = this.generateMeasurements(height);
    const intangibles = this.generateIntangibles(rating);
    const combine = this.generateCombine(position, rating);
    const awards = this.generateAwards(rating);

    const socialMedia = this.randomInt(1000, 5000000);
    const nilValuation = Math.round(socialMedia * 0.001) * 1000;

    const comp1 = this.pickRandom(this.nbaPlayers);
    const comp2 = this.pickRandom(this.nbaPlayers.filter(p => p !== comp1));

    const devTrend = this.generateDevelopmentTrend();
    const breakout = this.getBreakoutPotential(potential, rating);

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

      // Skills (individual columns)
      ...skillAttrs,

      // Traits (JSON string array)
      traits: JSON.stringify(traitsArray),

      college,
      college_class: collegeClass,
      hometown_city: hometown.city,
      hometown_state: hometown.state,
      hometown_country: hometown.country,
      nationality: 'American',
      high_school,
      jersey_number,

      // Draft info (for league-generated players these are mostly null)
      draft_class_year: null,
      projected_draft_range: null,
      draft_status: 'drafted',       // they're already on a team
      draft_position: null,
      drafted_by_team_id: teamId,    // the team they currently belong to
      draft_year: null,
      draft_round: null,
      draft_pick: null,
      draft_team_id: null,

      player_archetype,

      // College stats
      ...collegeStats,

      // Physical measurements
      ...measurements,

      // Intangibles
      ...intangibles,
      character_concerns: Math.random() < 0.1,
      scouting_notes: null,

      // Comparisons & social
      player_comparison_1: comp1,
      player_comparison_2: comp2,
      social_media_following: socialMedia,
      nil_valuation: nilValuation,

      // Combine
      ...combine,

      awards: JSON.stringify(awards),

      tournament_appearances: this.randomInt(0, 4),
      final_four_appearances: Math.random() < 0.15 ? 1 : 0,
      championships: Math.random() < 0.08 ? 1 : 0,

      development_trend: devTrend,
      breakout_potential: breakout,
    };
  }

  // ---------- generate league (entry point) – MINOR FIX INCLUDED ----------
    generateLeague(teams) {
      console.log('👥 Generating league with realistic talent distribution...');

      const tiers = [
        'contender', 'contender', 'contender', 'contender',
        'playoff', 'playoff', 'playoff', 'playoff', 'playoff', 'playoff', 'playoff', 'playoff',
        'mid', 'mid', 'mid', 'mid', 'mid', 'mid', 'mid', 'mid',
        'lottery', 'lottery', 'lottery', 'lottery', 'lottery', 'lottery'
      ];

      const shuffledTeams = this.shuffleArray([...teams]);
      const allPlayers = [];
      const teamTiers = {};

      for (let i = 0; i < shuffledTeams.length; i++) {
        const team = shuffledTeams[i];
        const tier = tiers[i] || 'mid';
        teamTiers[team.id] = tier;
        const roster = this.generateTeamRoster(team, tier);
        allPlayers.push(...roster);
      }

      console.log(`✅ Generated ${allPlayers.length} players`);
      return { players: allPlayers, teamTiers };
    }

  // ---------- generate roster (unchanged) ----------
  generateTeamRoster(team, tier) {
    const roster = [];
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];

    for (let i = 0; i < 15; i++) {
      const position = positions[i % 5];
      const isStarter = i < 5;
      const rating = this.generatePlayerRating(tier, isStarter, i);
      const isStar = rating >= 85;

      const player = this.generatePlayer(team.id, position, rating, isStar, i);
      roster.push(player);
    }
    return roster;
  }

  // ---------- Realistic rating generation (unchanged) ----------
  generatePlayerRating(teamTier, isStarter, rosterIndex) {
    const tierMeans = {
      contender: { starter: 82, bench: 72 },
      playoff:   { starter: 78, bench: 70 },
      mid:       { starter: 74, bench: 67 },
      lottery:   { starter: 70, bench: 64 }
    };

    const mean = isStarter ? tierMeans[teamTier].starter : tierMeans[teamTier].bench;
    const stdDev = 7;
    let rating = this.randomGaussian(mean, stdDev);

    if (isStarter && Math.random() < 0.05) {
      rating += 15;
    }
    if (rosterIndex > 12) {
      rating -= 5;
    }

    return Math.min(99, Math.max(60, Math.round(rating)));
  }

  // ---------- physical attributes (unchanged) ----------
  generateAge(isStar, index) {
    if (index > 12) {
      const [min, max] = this.ageRanges.rookie;
      return min + Math.floor(Math.random() * (max - min + 1));
    }
    if (isStar) {
      const [min, max] = this.ageRanges.star;
      return min + Math.floor(Math.random() * (max - min + 1));
    }
    const [min, max] = this.ageRanges.rolePlayer;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  generateHeight(position) {
    const [min, max] = this.positionHeights[position] || [72, 78];
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  generateWeight() {
    const [min, max] = this.weightRange;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  generatePotential(rating, isStar, index) {
    let potential = rating;
    if (index > 12) {
      potential += 8 + Math.floor(Math.random() * 12);
    } else if (isStar) {
      potential += 2 + Math.floor(Math.random() * 6);
    } else {
      potential += Math.floor(Math.random() * 6) - 2;
    }
    return Math.min(99, Math.max(45, Math.floor(potential)));
  }

  // ---------- trait helpers (unchanged) ----------
  getRelevantTraits(position, isStar) {
    const pool = this.positionTraitPools[position] || [];
    let traits = [...pool];
    if (isStar) {
      for (const extra of this.extraTraitsForStars) {
        if (!traits.includes(extra)) traits.push(extra);
      }
    }
    return traits;
  }

  getNumberOfTraits(rating) {
    let key = 'default';
    if (rating >= 90) key = '90';
    else if (rating >= 80) key = '80';
    else if (rating >= 70) key = '70';
    const [min, max] = this.numTraitsByRating[key] || [1, 2];
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  selectTraits(availableTraits, numTraits, rating) {
    const shuffled = this.shuffleArray([...availableTraits]);
    return shuffled.slice(0, Math.min(numTraits, shuffled.length));
  }

  calculateTraitValue(rating, traitId) {
    const def = this.traitDefinitions[traitId];
    if (!def) return 50;
    const { base, variance } = def;
    let value = base + (rating - 50) * 0.4 + Math.floor(Math.random() * variance * 0.6);
    if (rating >= 90) value += 10;
    else if (rating >= 80) value += 5;
    return Math.min(99, Math.max(0, Math.floor(value)));
  }

  // ---------- name generation (unchanged) ----------
  generateFirstName() {
    return this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
  }

  generateLastName() {
    return this.lastNames[Math.floor(Math.random() * this.lastNames.length)];
  }

  // ---------- utility ----------
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // ---------- database save (unchanged) ----------
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
        console.error(`Error inserting players batch ${i / batchSize}:`, error);
        throw error;
      }
      results.push(...data);
      console.log(`Inserted ${data.length} players (batch ${i / batchSize + 1})`);
    }
    return results;
  }
}

module.exports = PlayerGenerator;