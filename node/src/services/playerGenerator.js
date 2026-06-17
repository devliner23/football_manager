const { supabaseAdmin } = require('../config/supabase');

class PlayerGenerator {
  constructor(savedGameId, season) {
    this.savedGameId = savedGameId;
    this.season = season;
    
    // Name pools (same as before)
    this.firstNames = [/* ... same names ... */];
    this.lastNames = [/* ... same names ... */];
    
    // Trait definitions with numerical values (0-100)
    this.traitDefinitions = {
      // Shooting
      clutch_shooter: { name: 'Clutch Shooter', category: 'Shooting', base: 40, variance: 30 },
      deep_range: { name: 'Deep Range', category: 'Shooting', base: 40, variance: 30 },
      mid_range: { name: 'Mid-Range Maestro', category: 'Shooting', base: 40, variance: 30 },
      catch_shoot: { name: 'Catch & Shoot', category: 'Shooting', base: 40, variance: 30 },
      stepback: { name: 'Stepback Specialist', category: 'Shooting', base: 40, variance: 30 },
      
      // Scoring
      finisher: { name: 'Finisher', category: 'Scoring', base: 40, variance: 30 },
      slasher: { name: 'Slasher', category: 'Scoring', base: 40, variance: 30 },
      post_scorer: { name: 'Post Scorer', category: 'Scoring', base: 40, variance: 30 },
      float_game: { name: 'Floater Game', category: 'Scoring', base: 40, variance: 30 },
      
      // Playmaking
      floor_general: { name: 'Floor General', category: 'Playmaking', base: 40, variance: 30 },
      dimer: { name: 'Dimer', category: 'Playmaking', base: 40, variance: 30 },
      handles: { name: 'Ball Handler', category: 'Playmaking', base: 40, variance: 30 },
      breakstarter: { name: 'Break Starter', category: 'Playmaking', base: 40, variance: 30 },
      
      // Defense
      lockdown: { name: 'Lockdown Defender', category: 'Defense', base: 40, variance: 30 },
      rim_protector: { name: 'Rim Protector', category: 'Defense', base: 40, variance: 30 },
      pickpocket: { name: 'Pickpocket', category: 'Defense', base: 40, variance: 30 },
      chase_down: { name: 'Chase Down', category: 'Defense', base: 40, variance: 30 },
      
      // Athleticism
      speedster: { name: 'Speedster', category: 'Athleticism', base: 40, variance: 30 },
      vertical: { name: 'High Flyer', category: 'Athleticism', base: 40, variance: 30 },
      stamina: { name: 'Iron Man', category: 'Athleticism', base: 40, variance: 30 },
      
      // Clutch
      clutch_performer: { name: 'Clutch Performer', category: 'Clutch', base: 40, variance: 30 },
      microwave: { name: 'Microwave', category: 'Clutch', base: 40, variance: 30 },
      ice_veins: { name: 'Ice Veins', category: 'Clutch', base: 40, variance: 30 },
      
      // Intangible
      leader: { name: 'Leader', category: 'Intangible', base: 40, variance: 30 },
      glue_guy: { name: 'Glue Guy', category: 'Intangible', base: 40, variance: 30 },
      hustle: { name: 'Hustle', category: 'Intangible', base: 40, variance: 30 }
    };
  }

  // ============================================================
  // GENERATE LEAGUE WITH TRAITS
  // ============================================================

  generateLeague(teams) {
    console.log('👥 Generating balanced league with traits...');
    const allPlayers = [];
    const teamStarLevels = this.assignTeamStarLevels(teams);

    for (const team of teams) {
      const roster = this.generateTeamRoster(team, teamStarLevels[team.id]);
      allPlayers.push(...roster);
    }

    console.log(`✅ Generated ${allPlayers.length} players with traits`);
    return allPlayers;
  }

  // ============================================================
  // PLAYER GENERATION WITH TRAITS
  // ============================================================

  generateTeamRoster(team, starLevel) {
    const roster = [];
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const teamRating = this.getTeamBaseRating(team, starLevel);
    
    for (let i = 0; i < 15; i++) {
      const position = positions[i % positions.length];
      const isStarter = i < 5;
      const isStar = i < 2;
      
      const rating = this.calculatePlayerRating(
        teamRating,
        isStarter,
        isStar,
        starLevel,
        i
      );
      
      // Generate traits based on position and rating
      const traits = this.generateTraits(position, rating, isStar);
      
      const player = {
        saved_game_id: this.savedGameId,
        player_id: `${team.id}_${this.season}_${i + 1}`,
        team_id: team.id,
        first_name: this.generateFirstName(),
        last_name: this.generateLastName(),
        position: position,
        age: this.generateAge(isStar),
        height: this.generateHeight(position),
        weight: this.generateWeight(),
        overall_rating: rating,
        potential_rating: this.generatePotential(rating, isStar),
        player_type: this.getPlayerType(isStarter, isStar, rating),
        traits: traits, // JSON object with trait IDs as keys and numerical values (0-99)
        
        // Stats (initially 0)
        games_played: 0,
        games_started: isStarter ? 1 : 0,
        minutes: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls: 0,
        field_goals_made: 0,
        field_goals_attempted: 0,
        three_points_made: 0,
        three_points_attempted: 0,
        free_throws_made: 0,
        free_throws_attempted: 0,
        
        // Career stats
        career_games_played: 0,
        career_points: 0,
        career_rebounds: 0,
        career_assists: 0,
        career_steals: 0,
        career_blocks: 0,
        
        // Contract
        contract_years: this.generateContractYears(isStar),
        contract_salary: this.generateSalary(isStar, rating),
        contract_team_id: team.id,
        contract_start_year: this.season,
        is_free_agent: false,
        
        // Draft
        is_rookie: i > 12,
        draft_year: this.season - Math.floor(Math.random() * 10),
        draft_round: i > 12 ? 1 : 2,
        draft_pick: this.generateDraftPick(i),
        
        season: this.season,
        is_retired: false
      };
      
      roster.push(player);
    }
    
    return roster;
  }

  // ============================================================
  // TRAIT GENERATION
  // ============================================================

  generateTraits(position, rating, isStar) {
    const traits = {};
    
    // Determine which traits are relevant for this player
    const availableTraits = this.getRelevantTraits(position, isStar);
    
    // Number of traits based on rating (higher rating = more traits)
    const numTraits = this.getNumberOfTraits(rating);
    
    // Select traits (higher rating gets better traits)
    const selectedTraits = this.selectTraits(availableTraits, numTraits, rating);
    
    // Assign numerical values to each trait
    for (const traitId of selectedTraits) {
      traits[traitId] = this.calculateTraitValue(rating, traitId);
    }
    
    return traits;
  }

  getRelevantTraits(position, isStar) {
    // Map position to relevant trait categories
    const positionTraits = {
      'PG': ['dimer', 'floor_general', 'handles', 'breakstarter', 'speedster', 'pickpocket', 'clutch_performer', 'leader'],
      'SG': ['catch_shoot', 'stepback', 'deep_range', 'mid_range', 'slasher', 'lockdown', 'microwave', 'ice_veins'],
      'SF': ['slasher', 'finisher', 'mid_range', 'deep_range', 'lockdown', 'chase_down', 'speedster', 'vertical'],
      'PF': ['post_scorer', 'finisher', 'mid_range', 'rim_protector', 'lockdown', 'vertical', 'hustle', 'glue_guy'],
      'C': ['post_scorer', 'rim_protector', 'finisher', 'lockdown', 'vertical', 'hustle', 'stamina', 'glue_guy']
    };
    
    let traits = positionTraits[position] || [];
    
    // Stars get additional traits
    if (isStar) {
      traits = traits.concat(['clutch_performer', 'ice_veins', 'floor_general']);
    }
    
    return traits;
  }

  getNumberOfTraits(rating) {
    // Higher rating = more traits
    if (rating >= 90) return 6 + Math.floor(Math.random() * 3); // 6-8
    if (rating >= 80) return 4 + Math.floor(Math.random() * 3); // 4-6
    if (rating >= 70) return 2 + Math.floor(Math.random() * 3); // 2-4
    return 1 + Math.floor(Math.random() * 2); // 1-2
  }

  selectTraits(availableTraits, numTraits, rating) {
    // Sort by relevance (higher rating gets priority traits)
    const shuffled = [...availableTraits].sort(() => Math.random() - 0.5);
    // Weighted selection: traits that match player's strengths
    const selected = shuffled.slice(0, Math.min(numTraits, shuffled.length));
    return selected;
  }

  calculateTraitValue(rating, traitId) {
    // Base value depends on rating and trait category
    const base = this.traitDefinitions[traitId]?.base || 40;
    const variance = this.traitDefinitions[traitId]?.variance || 30;
    
    // Higher rating = higher trait values, with some randomness
    let value = base + (rating - 50) * 0.4 + Math.floor(Math.random() * variance * 0.6);
    
    // Ensure within 0-99 range
    value = Math.max(0, Math.min(99, Math.floor(value)));
    
    // Stars get a boost
    if (rating >= 90) {
      value += 10;
    } else if (rating >= 80) {
      value += 5;
    }
    
    // Clamp again
    return Math.min(99, Math.max(0, value));
  }

  // ============================================================
  // OTHER METHODS (from previous version)
  // ============================================================

  // ... (include all other methods: generateFirstName, generateLastName, etc.)
  // ... but make sure they're fully implemented

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

module.exports = PlayerGenerator;