const { supabaseAdmin } = require('../../config/supabase');
const playerData = require('../../data/playerData.json');

class PlayerGenerator {
  constructor(savedGameId, season) {
    this.savedGameId = savedGameId;
    this.season = season;

    // Load static data from JSON
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
  }

  // ---------- helper: Gaussian random ----------
  randomGaussian(mean = 0, stdDev = 1) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
  }

  // ---------- generate skill attributes ----------
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

  // ---------- generate traits (special abilities) ----------
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

  // ---------- generate a full player ----------
  generatePlayer(teamId, position, rating, isStar, rosterIndex) {
    const skillAttrs = this.generateSkillAttributes(position, rating);
    const specialTraits = this.generateTraits(position, rating, isStar);
    const traits = { ...skillAttrs, ...specialTraits };

    const potential = this.generatePotential(rating, isStar, rosterIndex);
    const age = this.generateAge(isStar, rosterIndex);
    const height = this.generateHeight(position);
    const weight = this.generateWeight();
    const first_name = this.generateFirstName();
    const last_name = this.generateLastName();
    const full_name = `${first_name} ${last_name}`;

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
      traits,
    };
  }

  // ---------- generate league (entry point) ----------
  generateLeague(teams) {
    console.log('👥 Generating league with realistic talent distribution...');

    // Realistic tier distribution: ~4 contenders, 8 playoff, 8 mid, 6 lottery
    const tiers = [
      'contender', 'contender', 'contender', 'contender',
      'playoff', 'playoff', 'playoff', 'playoff', 'playoff', 'playoff', 'playoff', 'playoff',
      'mid', 'mid', 'mid', 'mid', 'mid', 'mid', 'mid', 'mid',
      'lottery', 'lottery', 'lottery', 'lottery', 'lottery', 'lottery'
    ];

    const shuffledTeams = this.shuffleArray([...teams]);
    const allPlayers = [];

    for (let i = 0; i < shuffledTeams.length; i++) {
      const team = shuffledTeams[i];
      const tier = tiers[i] || 'mid';
      const roster = this.generateTeamRoster(team, tier);
      allPlayers.push(...roster);
    }

    // === DEBUG: print a few ratings to verify distribution ===
    const sample = allPlayers.slice(0, 20).map(p => ({
      name: p.full_name,
      ovr: p.overall_rating,
      tier: p.team_id,
    }));

    console.log(`✅ Generated ${allPlayers.length} players`);
    
    const teamTiers = {};
    for (let i = 0; i < shuffledTeams.length; i++) {
      const team = shuffledTeams[i];
      const tier = tiers[i] || 'mid';
      teamTiers[team.id] = tier;
      allPlayers.push(...this.generateTeamRoster(team, tier));
    }
    return { players: allPlayers, teamTiers };

  }

  // ---------- generate roster for a single team ----------
  generateTeamRoster(team, tier) {
    const roster = [];
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];

    for (let i = 0; i < 15; i++) {
      const position = positions[i % 5];
      const isStarter = i < 5;
      const rating = this.generatePlayerRating(tier, isStarter, i);
      const isStar = rating >= 85;   // star status based on rating, not index

      const player = this.generatePlayer(team.id, position, rating, isStar, i);
      roster.push(player);
    }
    return roster;
  }

  // ---------- NEW: Realistic rating generation ----------
  generatePlayerRating(teamTier, isStarter, rosterIndex) {
    const tierMeans = {
      contender: { starter: 82, bench: 72 },
      playoff:   { starter: 78, bench: 70 },
      mid:       { starter: 74, bench: 67 },
      lottery:   { starter: 70, bench: 64 }
    };

    const mean = isStarter ? tierMeans[teamTier].starter : tierMeans[teamTier].bench;
    const stdDev = 7;   // ~95% of players within ±14 of the mean
    let rating = this.randomGaussian(mean, stdDev);

    // 5% chance a starter is a genuine superstar, even on a bad team
    if (isStarter && Math.random() < 0.05) {
      rating += 15;
    }

    // Rookie penalty: last three roster spots get a slight downgrade
    if (rosterIndex > 12) {
      rating -= 5;
    }

    return Math.min(99, Math.max(60, Math.round(rating)));
  }

  // ---------- physical attributes ----------
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
      potential += 8 + Math.floor(Math.random() * 12); // rookies high upside
    } else if (isStar) {
      potential += 2 + Math.floor(Math.random() * 6);   // stars stay elite
    } else {
      potential += Math.floor(Math.random() * 6) - 2;   // role players mild growth
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

  // ---------- name generation ----------
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